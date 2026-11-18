// Material light patch (visual finesse pass). Applied ONCE to the shared
// MeshStandardMaterial / MeshBasicMaterial prototypes, so every prop, tree and
// fauna material picks it up without touching a single creator:
//   · WRAP diffuse for the sun — a soft terminator instead of a hard cut-off;
//   · a warm LIGHT LEAK in the sun's shadow (shadows are never pure grey: the
//     colour is a per-theme fraction of the sun's own light, look.js writes it);
//   · PCSS-lite soft shadows for the sun only: blocker search, then a Vogel-disc
//     PCF whose radius grows with blocker distance (crisp at contact, soft away);
//   · a glow boost for materials flagged `userData.glow` (windows, fruit, caps),
//     so the bloom threshold can sit high and only emissives bloom.
// One shared uniform bag (KLAR) — look.js / quality.js write it, never the shaders.
// Technique after papertrails (MIT, github.com/xikhar/papertrails); code is ours.
import * as THREE from 'three';

export const KLAR = {
  wrap:{ value:0.25 },                                    // 0 = hard Lambert, 0.25 = soft terminator
  leak:{ value:new THREE.Vector3(0.12, 0.09, 0.05) },     // sun-colour fraction that bleeds into shadow (linear)
  // x world size of the shadow map, y depth range (far-near), z penumbra per unit of blocker distance, w depth bias (world)
  sun:{ value:new THREE.Vector4(16, 90, 0.2, 0.03) },
  // x blocker-search taps, y PCF taps (each ≤ 24), z search radius (world), w minimum penumbra (shadow texels)
  shq:{ value:new THREE.Vector4(12, 16, 0.45, 2.2) },
  glow:{ value:1 },                                       // HDR boost for userData.glow materials (>1 only while bloom is on)
};

/* ---------------- GLSL ---------------- */
const PARS = /* glsl */ `
uniform float uKWrap; uniform vec3 uKLeak; uniform vec4 uKSun; uniform vec4 uKShq;
float gKShadow = 1.0;               // the sun's lit fraction for the RE_Direct that follows (reset there)
`;

// Replaces getShadow for the sun: stores the lit fraction and returns 1.0, so the stock
// multiply into directLight.color is a no-op and RE_Direct can leak colour into shadow.
const SHADOW = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
float kIGN( vec2 p ){ return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
vec2 kVogel( float i, float n, float phi ){ float r = sqrt( ( i + 0.5 ) / n ); float t = i * 2.399963229728653 + phi; return vec2( cos( t ), sin( t ) ) * r; }
float kDepth( sampler2D m, vec2 uv ){ return unpackRGBAToDepth( textureLod( m, uv, 0.0 ) ); }
float kSunShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ){
	vec3 sc = shadowCoord.xyz / shadowCoord.w;
	vec3 dx = dFdx( sc ); vec3 dy = dFdy( sc );
	float lit = 1.0;
	if( sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0 ){
		float wpu = uKSun.x, range = uKSun.y;
		// receiver-plane depth gradient (per uv): slopes do not shadow themselves
		float det = dx.x * dy.y - dx.y * dy.x;
		vec2 grad = vec2( 0.0 );
		if( abs( det ) > 1e-14 ) grad = vec2( dx.z * dy.y - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det;
		float slope = length( grad ) * range / wpu;
		grad *= min( 1.0, 3.0 / max( slope, 1e-4 ) );
		float bias = uKSun.w / range;
		float phi = kIGN( gl_FragCoord.xy ) * 6.2831853;
		float rs = uKShq.z / wpu;
		float sumD = 0.0, nB = 0.0;
		for( int i = 0; i < 24; i ++ ){
			if( float( i ) >= uKShq.x ) break;
			vec2 o = kVogel( float( i ), uKShq.x, phi ) * rs;
			float d = sc.z + dot( grad, o ) - kDepth( shadowMap, sc.xy + o );
			if( d > bias ){ sumD += d; nB += 1.0; }
		}
		float penMin = uKShq.w * wpu / shadowMapSize.x;
		if( nB < 0.5 ){
			// the sparse search can miss a thin contact sliver: four tight taps catch it
			float rq = 0.5 * penMin / wpu, l4 = 0.0;
			for( int i = 0; i < 4; i ++ ){
				vec2 o = kVogel( float( i ), 4.0, phi + 0.9 ) * rq;
				l4 += step( sc.z + dot( grad, o ) - kDepth( shadowMap, sc.xy + o ), bias );
			}
			lit = l4 * 0.25;
		} else {
			float pen = clamp( uKSun.z * ( sumD / nB * range ), penMin, uKShq.z * 2.0 );
			float rp = 0.5 * pen / wpu, acc = 0.0;
			for( int i = 0; i < 24; i ++ ){
				if( float( i ) >= uKShq.y ) break;
				vec2 o = kVogel( float( i ), uKShq.y, phi + 1.7 ) * rp;
				acc += step( sc.z + dot( grad, o ) - kDepth( shadowMap, sc.xy + o ), bias );
			}
			lit = acc / uKShq.y;
		}
	}
	gKShadow = mix( 1.0, lit, shadowIntensity );
	return 1.0;
}
#endif
`;

// Physical (Standard) direct light: wrapped diffuse + shadow leak; specular keeps the hard cosine.
const DIRECT = /* glsl */ `
void RE_Direct_Klar( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float nl = dot( geometryNormal, directLight.direction );
	float wrapNL = saturate( ( nl + uKWrap ) / ( 1.0 + uKWrap ) );
	vec3 leak = mix( uKLeak, vec3( 1.0 ), gKShadow );
	reflectedLight.directSpecular += saturate( nl ) * directLight.color * gKShadow * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += wrapNL * directLight.color * leak * BRDF_Lambert( material.diffuseColor );
	gKShadow = 1.0;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Klar
`;

const bind = shader => { shader.uniforms.uKWrap = KLAR.wrap; shader.uniforms.uKLeak = KLAR.leak; shader.uniforms.uKSun = KLAR.sun; shader.uniforms.uKShq = KLAR.shq; shader.uniforms.uKGlow = KLAR.glow; };

let ok = true;     // false if three's chunk layout ever changes: we leave the stock shaders alone
function patchStandard(shader){
  bind(shader);
  const F = THREE.ShaderChunk.lights_fragment_begin, call = 'getShadow( directionalShadowMap[';
  if(!F.includes(call) || !THREE.ShaderChunk.lights_physical_pars_fragment.includes('RE_Direct_Physical')){
    if(ok) console.warn('[lightpatch] three.js shader chunks changed — stock lighting kept'); ok = false; return;
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PARS)
    .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n' + SHADOW)
    .replace('#include <lights_physical_pars_fragment>', '#include <lights_physical_pars_fragment>\n' + DIRECT)
    .replace('#include <lights_fragment_begin>', () => F.replace(call, 'kSunShadow( directionalShadowMap['));
}

function patchBasic(shader){
  bind(shader);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uKGlow;')
    .replace('#include <opaque_fragment>', 'outgoingLight *= uKGlow;\n#include <opaque_fragment>');
}

let applied = false;
// Idempotent; call before the first compile (world.js does, at import time).
export function installLightPatch(){
  if(applied) return; applied = true;
  const S = THREE.MeshStandardMaterial.prototype, B = THREE.MeshBasicMaterial.prototype;
  S.onBeforeCompile = function(shader){ patchStandard(shader); };
  S.customProgramCacheKey = () => 'klar-std1';
  B.onBeforeCompile = function(shader){ if(this.userData.glow) patchBasic(shader); };
  B.customProgramCacheKey = function(){ return this.userData.glow ? 'klar-glow1' : ''; };
}

/* ---------------- sun shadow frustum ---------------- */
const SUN_DIST = 42;
const _lr = new THREE.Vector3(), _lu = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
// Fit the sun's ortho shadow camera to a sphere (centre, extent) around the visible isle and
// snap its centre to shadow texels (in light space), so the shadow never shimmers while the
// camera glides. Cheap: the projection is only rebuilt when the quantised extent changes.
export function fitSun(sun, dir, centre, extent){
  const sh = sun.shadow, cam = sh.camera, size = sh.mapSize.x;
  extent = Math.max(2.5, Math.ceil(extent * 2) / 2);
  if(cam.right !== extent || cam.far !== SUN_DIST + extent + 40){
    cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
    cam.near = 1; cam.far = SUN_DIST + extent + 40; cam.updateProjectionMatrix();
  }
  const texel = 2 * extent / size;
  _lr.crossVectors(_UP, dir).normalize(); _lu.crossVectors(dir, _lr).normalize();
  const a = Math.round(centre.dot(_lr) / texel) * texel, b = Math.round(centre.dot(_lu) / texel) * texel;
  sun.target.position.set(0, 0, 0).addScaledVector(_lr, a).addScaledVector(_lu, b).addScaledVector(dir, centre.dot(dir));
  sun.position.copy(sun.target.position).addScaledVector(dir, SUN_DIST);
  sun.target.updateMatrixWorld();
  KLAR.sun.value.x = 2 * extent; KLAR.sun.value.y = cam.far - cam.near; KLAR.sun.value.w = 0.012 + 2.5 * texel;
}
