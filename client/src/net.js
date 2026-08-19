// Tiny API client. All app endpoints require auth (Phase 2 gating);
// 401s surface as { error } throws the caller can toast.
export async function api(path, opts = {}){
  const res = await fetch('/api' + path, {
    headers: opts.body ? { 'content-type':'application/json' } : undefined,
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok){
    const err = new Error(data.error || ('http ' + res.status));
    err.status = res.status;
    err.validation = data.errors;      // publish-gate rejections carry core codes
    throw err;
  }
  return data;
}
