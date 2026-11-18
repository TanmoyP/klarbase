// Post chain (visual finesse pass). One HDR (half-float, MSAA) scene target with a depth
// texture, then small passes — all procedural, no textures:
//
//   scene   → rtScene (full res, HalfFloat, MSAA, depth texture)           tone mapping is OFF here
//   ao      contact AO from depth only (Vogel taps, min-difference normals)  half res      (fancy)
//   pre     downsample × AO, circle of confusion (px) in alpha               DoF res
//   gather  golden-angle disc bokeh, depth/CoC aware                         DoF res
//   bloom   high threshold → two separable gaussian levels (1/4, 1/8)        so only emissives glow
//   final   sharp/blur mix (TILT-SHIFT) + bloom, vignette, ACES, grade, sRGB, grain/dither → screen
//
// Tilt-shift: a sharp band around the focus point's screen row (a fraction of the frame
// height), blur growing over a ramp toward top and bottom, mixed with how far a pixel is
// from the focus in depth (depthWeight); max blur ≈ 8 px at 1080p, scaled by resolution.
// The grade (exposure, contrast, saturation, white balance, shadow tint/lift, vignette,
// bloom, grain) is read from look.js's OUT every frame — this file owns no look values.
// Nothing here allocates per frame; targets are (re)created only on resize / quality change.
// Technique after papertrails src/render/post.js (MIT); the code is ours.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OUT } from './look.js';

export const POST_TIERS = {
  fancy:{ msaa:4, ao:true,  aoTaps:10, dofTaps:24, bloomLevels:2 },
  cozy: { msaa:2, ao:false, aoTaps:0,  dofTaps:12, bloomLevels:1 },
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

// every pass samples at LOD 0 explicitly: no implicit derivatives inside the divergent loops / early returns below
const LOD0 = /* glsl */ `
#undef texture2D
#define texture2D( s, uv ) textureLod( s, uv, 0.0 )
`;
// shared by the depth-reading passes
const COMMON = LOD0 + /* glsl */ `
varying vec2 vUv;
uniform vec4 uProjA;   // near, far, P[0][0], P[1][1]
uniform vec2 uProjB;   // P[0][2], P[1][2]  (view offset: the phone builder shifts the frustum)
uniform vec4 uDofA;    // focus view depth, focus uv.y, depth scale, depth weight
uniform vec4 uDofB;    // sharp half-band, ramp, max blur (px, drawing buffer), enabled
float viewZ( float d ){ return ( uProjA.x * uProjA.y ) / ( uProjA.y - d * ( uProjA.y - uProjA.x ) ); }
// blur radius in px: screen-row distance from the focus line mixed with depth distance from the focus
float cocAt( vec2 uv, float z, float rawD ){
	float aY = clamp( ( abs( uv.y - uDofA.y ) - uDofB.x ) / uDofB.y, 0.0, 1.0 );
	aY = aY * aY * ( 3.0 - 2.0 * aY );
	float sD = rawD >= 0.99999 ? 0.0 : abs( z - uDofA.x ) / uDofA.x * uDofA.z;
	float aD = clamp( ( sD - 0.08 ) / 0.45, 0.0, 1.0 );
	return mix( aY, aD, uDofA.w ) * uDofB.z * uDofB.w;
}
float ign( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
float luma( vec3 c ){ return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
`;

const AO_FRAG = COMMON + /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uTexel;     // full-res texel
uniform vec4 uAo;        // radius (world), strength, bias (world), -
vec3 vpos( vec2 uv ){ float z = viewZ( texture2D( tDepth, uv ).r ); return vec3( ( uv * 2.0 - 1.0 + uProjB ) * z / uProjA.zw, - z ); }
void main(){
	float d0 = texture2D( tDepth, vUv ).r;
	if( d0 >= 0.99999 ){ gl_FragColor = vec4( 1.0 ); return; }
	vec3 P = vpos( vUv );
	vec2 t = uTexel * 2.0;
	vec3 pr = vpos( vUv + vec2( t.x, 0.0 ) ), pl = vpos( vUv - vec2( t.x, 0.0 ) ), pu = vpos( vUv + vec2( 0.0, t.y ) ), pd = vpos( vUv - vec2( 0.0, t.y ) );
	vec3 dxv = abs( pr.z - P.z ) < abs( P.z - pl.z ) ? pr - P : P - pl;      // the neighbour on the same surface
	vec3 dyv = abs( pu.z - P.z ) < abs( P.z - pd.z ) ? pu - P : P - pd;
	vec3 N = normalize( cross( dxv, dyv ) );
	float z = - P.z;
	vec2 rUv = vec2( uAo.x / ( z ) * uProjA.zw );     // world radius -> uv (x,y)
	rUv *= 0.5;
	float phi = ign( gl_FragCoord.xy ) * 6.2831853, occ = 0.0;
	for( int i = 0; i < AO_TAPS; i ++ ){
		float fi = float( i ), r = sqrt( ( fi + 0.5 ) / float( AO_TAPS ) ), a = fi * 2.399963229728653 + phi;
		vec3 v = vpos( vUv + vec2( cos( a ), sin( a ) ) * r * rUv ) - P;
		float dv = dot( v, v ), fall = clamp( 1.0 - dv / ( uAo.x * uAo.x ), 0.0, 1.0 );
		occ += min( max( dot( v, N ) - uAo.z, 0.0 ) / ( dv + 1e-4 ) * uAo.x, 1.6 ) * fall;
	}
	float ao = clamp( 1.0 - uAo.y * occ / float( AO_TAPS ), 0.0, 1.0 );
	gl_FragColor = vec4( ao, ao, ao, 1.0 );
}
`;

const PRE_FRAG = COMMON + /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tAo;
uniform vec2 uTexel;     // full-res texel
uniform vec3 uAoTint;
uniform float uAoOn;
void main(){
	vec3 acc = vec3( 0.0 ); float wsum = 0.0, coc = 0.0;
	for( int i = 0; i < 4; i ++ ){
		vec2 uv = vUv + ( vec2( float( i - ( i / 2 ) * 2 ), float( i / 2 ) ) - 0.5 ) * uTexel;
		float dr = texture2D( tDepth, uv ).r, c = cocAt( uv, viewZ( dr ), dr );
		float w = 0.02 + c;                       // blurrier samples lead, so a sharp edge never leaks into the blur
		acc += min( texture2D( tScene, uv ).rgb, vec3( 16.0 ) ) * w; wsum += w; coc = max( coc, c );
	}
	vec3 col = acc / wsum;
	if( uAoOn > 0.5 ) col *= mix( uAoTint, vec3( 1.0 ), texture2D( tAo, vUv ).r );
	gl_FragColor = vec4( col, coc );
}
`;

const GATHER_FRAG = LOD0 + /* glsl */ `
varying vec2 vUv;
uniform sampler2D tPre;
uniform vec2 uTexel;                  // full-res texel
uniform vec2 uTaps[ DOF_TAPS ];       // unit-disc Vogel (golden angle) taps
float ign( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
void main(){
	vec4 c0 = texture2D( tPre, vUv );
	float R = c0.a;
	if( R < 0.6 ){ gl_FragColor = vec4( c0.rgb, 0.0 ); return; }
	float phi = ign( gl_FragCoord.xy ) * 6.2831853, cs = cos( phi ), sn = sin( phi );
	mat2 rot = mat2( cs, sn, - sn, cs );
	vec3 acc = c0.rgb * 0.15; float wsum = 0.15;
	for( int i = 0; i < DOF_TAPS; i ++ ){
		vec2 o = rot * uTaps[ i ];
		float d = length( uTaps[ i ] ) * R;
		vec4 s = texture2D( tPre, vUv + o * R * uTexel );
		float w = smoothstep( d - 1.0, d + 1.0, s.a );      // a tap blurs us only if its own blur reaches this far
		acc += s.rgb * w; wsum += w;
	}
	gl_FragColor = vec4( acc / wsum, 1.0 );
}
`;

const BLOOM_DOWN_FRAG = LOD0 + /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform sampler2D tDepth;
uniform vec2 uTexel;          // texel of the SOURCE
uniform vec2 uThr;            // threshold, knee
vec3 bright( vec2 uv ){
	if( texture2D( tDepth, uv ).r >= 0.99999 ) return vec3( 0.0 );      // the sky dome is pre-compensated HDR: it never blooms
	vec3 c = min( texture2D( tSrc, uv ).rgb, vec3( 12.0 ) );
	float l = max( c.r, max( c.g, c.b ) );
	return c * smoothstep( uThr.x - uThr.y, uThr.x + uThr.y, l );
}
void main(){
	gl_FragColor = vec4( ( bright( vUv + uTexel * vec2( 1.0, 1.0 ) ) + bright( vUv + uTexel * vec2( -1.0, 1.0 ) )
		+ bright( vUv + uTexel * vec2( 1.0, -1.0 ) ) + bright( vUv + uTexel * vec2( -1.0, -1.0 ) ) ) * 0.25, 1.0 );
}
`;
const BLOOM_COPY_FRAG = LOD0 + /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
void main(){
	gl_FragColor = vec4( ( texture2D( tSrc, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb
		+ texture2D( tSrc, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb + texture2D( tSrc, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb ) * 0.25, 1.0 );
}
`;
const BLOOM_BLUR_FRAG = LOD0 + /* glsl */ `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;            // texel × direction
void main(){
	vec3 c = texture2D( tSrc, vUv ).rgb * 0.227027;
	c += ( texture2D( tSrc, vUv + uDir * 1.384615 ).rgb + texture2D( tSrc, vUv - uDir * 1.384615 ).rgb ) * 0.316216;
	c += ( texture2D( tSrc, vUv + uDir * 3.230769 ).rgb + texture2D( tSrc, vUv - uDir * 3.230769 ).rgb ) * 0.070270;
	gl_FragColor = vec4( c, 1.0 );
}
`;

const FINAL_FRAG = COMMON + /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tBlur;
uniform sampler2D tAo;
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform vec2 uTexel;
uniform vec4 uTone;        // exposure, contrast, saturation, shadow lift
uniform vec3 uShadowTint;  // linear; lifted in display space
uniform vec3 uWB;          // white balance (multiplies the linear scene)
uniform vec4 uLens;        // vignette, grain, aspect, -
uniform vec4 uFx;          // bloom A, bloom B, ao on, grain seed
uniform vec3 uAoTint;
// three's ACESFilmicToneMapping (same curve the renderer used before the chain), exposure applied by the caller
vec3 RRTAndODTFit( vec3 v ){ vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
vec3 aces( vec3 color ){
	const mat3 IN = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
	const mat3 OUTM = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
	color = IN * ( color / 0.6 ); color = RRTAndODTFit( color ); color = OUTM * color;
	return clamp( color, 0.0, 1.0 );
}
vec3 toSRGB( vec3 c ){ return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0 ) ), vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), c ) ); }
float hash12( vec2 p ){ vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void main(){
	float rawD = texture2D( tDepth, vUv ).r;
	float coc = cocAt( vUv, viewZ( rawD ), rawD );
	vec3 sharp = min( texture2D( tScene, vUv ).rgb, vec3( 64.0 ) );
	vec3 col = sharp;
	if( uFx.z > 0.5 ){ vec3 m = mix( uAoTint, vec3( 1.0 ), texture2D( tAo, vUv ).r ); col *= m; }
	vec3 blur = texture2D( tBlur, vUv ).rgb;
	col = mix( col, blur, smoothstep( 0.4, 2.6, coc ) * uDofB.w );
	col += texture2D( tBloomA, vUv ).rgb * uFx.x + texture2D( tBloomB, vUv ).rgb * uFx.y;
	// lens + film
	vec2 vc = ( vUv - 0.5 ) * vec2( uLens.z / 1.7778, 1.0 ) * vec2( 1.0, 1.12 );
	col *= 1.0 - uLens.x * smoothstep( 0.12, 1.25, dot( vc, vc ) * 2.4 ) * 1.25;
	col = aces( col * uTone.x * uWB );
	col = mix( vec3( luma( col ) ), col, uTone.z );
	col = toSRGB( max( col, 0.0 ) );
	col = ( col - 0.42 ) * uTone.y + 0.42;
	col += toSRGB( uShadowTint ) * uTone.w * 8.0 * ( 1.0 - smoothstep( 0.0, 0.45, luma( col ) ) );
	// fine animated grain doubles as the dither that kills sky banding (triangular noise)
	float n = hash12( gl_FragCoord.xy + uFx.w ) + hash12( gl_FragCoord.yx * 1.37 + uFx.w * 1.7 ) - 1.0;
	col += n * uLens.y;
	gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
`;

const fsMat = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader:VERT, fragmentShader:frag, uniforms, defines, depthTest:false, depthWrite:false, toneMapped:false });
const U = v => ({ value:v });

export function createPost(renderer, scene, camera, { quality = 'fancy', grade = OUT } = {}){
  let Q = POST_TIERS[quality] || POST_TIERS.fancy, tier = quality;
  const quad = new FullScreenQuad();
  const size = new THREE.Vector2(), tmp = new THREE.Vector3(), focus = new THREE.Vector3();
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches:false };
  let T = null;                                   // targets
  let M = null;                                   // materials
  let fy = 0.5, fz = 20, haveFocus = false, focusInit = false, clock = 0;

  const rt = (w, h, opt = {}) => new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), { type:THREE.HalfFloatType, format:THREE.RGBAFormat, depthBuffer:false, stencilBuffer:false, minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, generateMipmaps:false, ...opt });

  function buildMaterials(){
    const taps = []; for(let i = 0; i < Q.dofTaps; i++){ const r = Math.sqrt((i + 0.5) / Q.dofTaps), a = i * 2.399963229728653; taps.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    const shared = { uProjA:U(new THREE.Vector4()), uProjB:U(new THREE.Vector2()), uDofA:U(new THREE.Vector4(20, 0.5, 1, 0.6)), uDofB:U(new THREE.Vector4(0.22, 0.36, 8, 1)) };
    const t = () => ({ value:null });
    M = {
      shared,
      ao:fsMat(AO_FRAG, { ...shared, tDepth:t(), uTexel:U(new THREE.Vector2()), uAo:U(new THREE.Vector4(0.45, 0.9, 0.02, 0)) }, { AO_TAPS:Q.aoTaps || 1 }),
      pre:fsMat(PRE_FRAG, { ...shared, tScene:t(), tDepth:t(), tAo:t(), uTexel:U(new THREE.Vector2()), uAoTint:U(new THREE.Color()), uAoOn:U(0) }),
      gather:fsMat(GATHER_FRAG, { tPre:t(), uTexel:U(new THREE.Vector2()), uTaps:U(taps) }, { DOF_TAPS:Q.dofTaps }),
      down:fsMat(BLOOM_DOWN_FRAG, { tSrc:t(), tDepth:t(), uTexel:U(new THREE.Vector2()), uThr:U(new THREE.Vector2(1.05, 0.3)) }),
      copy:fsMat(BLOOM_COPY_FRAG, { tSrc:t(), uTexel:U(new THREE.Vector2()) }),
      blur:fsMat(BLOOM_BLUR_FRAG, { tSrc:t(), uDir:U(new THREE.Vector2()) }),
      final:fsMat(FINAL_FRAG, { ...shared, tScene:t(), tDepth:t(), tBlur:t(), tAo:t(), tBloomA:t(), tBloomB:t(), uTexel:U(new THREE.Vector2()),
        uTone:U(new THREE.Vector4()), uShadowTint:U(new THREE.Color()), uWB:U(new THREE.Vector3(1, 1, 1)), uLens:U(new THREE.Vector4()), uFx:U(new THREE.Vector4()), uAoTint:U(new THREE.Color()) }),
    };
  }

  function buildTargets(){
    renderer.getDrawingBufferSize(size);
    const W = Math.max(2, size.x | 0), H = Math.max(2, size.y | 0), h2 = (W / 2) | 0, h2h = (H / 2) | 0;
    const dofS = tier === 'cozy' ? 0.4 : 0.5;
    const scene_ = rt(W, H, { depthBuffer:true, samples:Q.msaa });
    scene_.depthTexture = new THREE.DepthTexture(W, H);
    T = {
      W, H, scene:scene_,
      ao:Q.ao ? rt(h2, h2h, { type:THREE.UnsignedByteType }) : null,
      pre:rt(W * dofS, H * dofS), blur:rt(W * dofS, H * dofS),
      b0:rt(W / 4, H / 4), b1:rt(W / 4, H / 4),
      c0:Q.bloomLevels > 1 ? rt(W / 8, H / 8) : null, c1:Q.bloomLevels > 1 ? rt(W / 8, H / 8) : null,
    };
    // a 1×1 black stand-in for passes that are off (a sampler must never be left unbound)
    if(!T.c0){ T.c0 = rt(1, 1); T.c1 = null; T.noC = true; }
    if(!T.ao){ T.ao = rt(1, 1); T.noAo = true; }
  }

  function disposeTargets(){ if(!T) return; for(const k of Object.keys(T)){ const v = T[k]; if(v && v.dispose) v.dispose(); } if(T.scene && T.scene.depthTexture) T.scene.depthTexture.dispose(); T = null; }
  function disposeMaterials(){ if(!M) return; for(const k of Object.keys(M)) if(M[k] && M[k].dispose) M[k].dispose(); M = null; }

  buildMaterials(); buildTargets();

  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); quad.render(renderer); };

  // separable gaussian, a → b → a
  function blur2(a, b, w, h){
    const u = M.blur.uniforms;
    u.tSrc.value = a.texture; u.uDir.value.set(1 / w, 0); pass(M.blur, b);
    u.tSrc.value = b.texture; u.uDir.value.set(0, 1 / h); pass(M.blur, a);
  }

  function updateFocus(dt){
    let y = 0.5, z = fz;
    if(haveFocus){
      tmp.copy(focus).applyMatrix4(camera.matrixWorldInverse); z = Math.max(0.5, -tmp.z);
      tmp.copy(focus).project(camera); y = tmp.y * 0.5 + 0.5;
    }
    const k = 1 - Math.exp(-6 * dt);                        // glide the focus so a hop never makes the band jump
    if(!focusInit){ fy = y; fz = z; focusInit = haveFocus; } else { fy += (y - fy) * k; fz += (z - fz) * k; }
  }

  return {
    get quality(){ return tier; },
    get targets(){ return T; },
    // world point that must stay sharp (Pip / the camera target)
    setFocus(p){ if(p){ focus.copy(p); haveFocus = true; } },
    setSize(){                                   // the drawing buffer changed (resize / DPR cap): reallocate, once
      renderer.getDrawingBufferSize(size);
      if(T && (size.x | 0) === T.W && (size.y | 0) === T.H) return;
      disposeTargets(); buildTargets();
    },
    setQuality(q){
      if(!POST_TIERS[q] || q === tier) return;
      tier = q; Q = POST_TIERS[q]; disposeTargets(); disposeMaterials(); buildMaterials(); buildTargets();
    },
    render(dt){
      const P = grade.post, S = M.shared, W = T.W, H = T.H, still = reduced.matches;
      clock += dt; camera.updateMatrixWorld();
      updateFocus(dt);
      const pm = camera.projectionMatrix.elements;
      S.uProjA.value.set(camera.near, camera.far, pm[0], pm[5]); S.uProjB.value.set(pm[8], pm[9]);
      const breathe = still ? 0 : Math.sin(clock * 0.5) * 0.012;
      S.uDofA.value.set(fz, fy, 1.0, P.dofDepth); S.uDofB.value.set(P.dofBand + breathe, Math.max(0.05, P.dofRamp), P.dofMax * H / 1080, 1);
      const aoOn = Q.ao && P.ao > 0.01;

      const prevAuto = renderer.autoClear;
      // 1 · the scene, HDR, no tone mapping (three only tone-maps when drawing to the screen)
      renderer.setRenderTarget(T.scene); renderer.autoClear = true; renderer.render(scene, camera);
      renderer.autoClear = false;
      const depth = T.scene.depthTexture, col = T.scene.texture;
      // 2 · contact AO
      if(aoOn){
        M.ao.uniforms.tDepth.value = depth; M.ao.uniforms.uTexel.value.set(1 / W, 1 / H);
        M.ao.uniforms.uAo.value.set(0.45, P.ao, 0.02, 0); pass(M.ao, T.ao);
      }
      // 3 · downsample × AO + CoC, 4 · gather
      const pu = M.pre.uniforms; pu.tScene.value = col; pu.tDepth.value = depth; pu.tAo.value = T.ao.texture; pu.uTexel.value.set(1 / W, 1 / H);
      pu.uAoTint.value.copy(grade.post.aoTint); pu.uAoOn.value = aoOn ? 1 : 0; pass(M.pre, T.pre);
      M.gather.uniforms.tPre.value = T.pre.texture; M.gather.uniforms.uTexel.value.set(1 / W, 1 / H); pass(M.gather, T.blur);
      // 5 · bloom (threshold on the scene, then wide blurs)
      M.down.uniforms.tSrc.value = col; M.down.uniforms.tDepth.value = depth; M.down.uniforms.uTexel.value.set(1 / W, 1 / H); pass(M.down, T.b0);
      blur2(T.b0, T.b1, W / 4, H / 4);
      if(!T.noC){
        M.copy.uniforms.tSrc.value = T.b0.texture; M.copy.uniforms.uTexel.value.set(4 / W, 4 / H); pass(M.copy, T.c0);
        blur2(T.c0, T.c1, W / 8, H / 8);
      }
      // 6 · composite to the screen
      const fu = M.final.uniforms;
      fu.tScene.value = col; fu.tDepth.value = depth; fu.tBlur.value = T.blur.texture; fu.tAo.value = T.ao.texture;
      fu.tBloomA.value = T.b0.texture; fu.tBloomB.value = (T.noC ? T.b0 : T.c0).texture; fu.uTexel.value.set(1 / W, 1 / H);
      fu.uTone.value.set(P.exposure, P.contrast, P.saturation, P.shadowLift);
      fu.uShadowTint.value.copy(P.shadowTint); fu.uWB.value.set(P.tint[0], P.tint[1], P.tint[2]); fu.uAoTint.value.copy(P.aoTint);
      fu.uLens.value.set(P.vignette, P.grain, camera.aspect, 0);
      fu.uFx.value.set(P.bloom * (T.noC ? 1.6 : 1.0), T.noC ? 0 : P.bloom * 1.2, aoOn ? 1 : 0, Math.floor(clock * 24) * 7.31 % 997);
      pass(M.final, null);
      renderer.autoClear = prevAuto;
    },
    dispose(){ disposeTargets(); disposeMaterials(); quad.dispose(); },
  };
}
