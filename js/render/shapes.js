// Tiny canvas drawing helpers shared by every draw() in data/*.js
export function shadow(ctx, x, y, rx, ry) {
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
export function circle(ctx, x, y, r, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
export function ellipse(ctx, x, y, rx, ry, rot, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
}
