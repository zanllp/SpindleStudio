// Local image URLs (/images/... /uploads/...) can be served as small webp
// thumbnails via the server's /api/thumb endpoint. The chat list only displays
// 72-360px thumbs — handing the browser the full 1024x1536 generation for
// that costs ~6 MB of decoded bitmap per image and OOM-crashes long
// conversations. Non-local URLs pass through untouched.
export function thumbUrl(url: string, width = 480): string {
  const m = /^\/(images|uploads)\/(.+)$/.exec(url)
  if (!m) return url
  return `/api/thumb?root=${m[1]}&path=${encodeURIComponent(m[2])}&w=${width}`
}
