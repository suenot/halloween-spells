// Wand tracking by colour: the host samples the wand colour once, then the tip is the colour blob point farthest from the wrist.
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue /= 6; if (hue < 0) hue += 1;
  }
  return { h: hue, s: max ? d / max : 0, v: max };
}

export const hueDistance = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// calib: { h, s, v, tol } all 0..1
export function matchesColor(hsv, calib) {
  const tol = calib.tol ?? 0.06;
  // near-grey wands match on value only; coloured ones need hue and some saturation
  if (calib.s < 0.18) return hsv.s < 0.25 && Math.abs(hsv.v - calib.v) < 0.18;
  return hsv.s > calib.s * 0.55 && hsv.v > Math.max(0.15, calib.v * 0.5) && hueDistance(hsv.h, calib.h) < tol;
}

// points: [{x,y}] mask pixels (normalised); anchor: wrist {x,y} or null. Returns tip or null when blob too small.
export function tipFromMask(points, anchor, minPoints = 10) {
  if (points.length < minPoints) return null;
  const ref = anchor ?? { x: 0.5, y: 1 };
  let best = points[0], bd = -1;
  for (const p of points) {
    const d = Math.hypot(p.x - ref.x, p.y - ref.y);
    if (d > bd) { bd = d; best = p; }
  }
  return { x: best.x, y: best.y };
}

const W = 160, H = 90;
let canvas, ctx;
function frameData(video) {
  canvas ??= Object.assign(document.createElement("canvas"), { width: W, height: H });
  ctx ??= canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

export function sampleColor(video, nx, ny, tol = 0.06) {
  const data = frameData(video);
  const cx = Math.round(nx * (W - 1)), cy = Math.round(ny * (H - 1));
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, cy - 2); y <= Math.min(H - 1, cy + 2); y++) {
    for (let x = Math.max(0, cx - 2); x <= Math.min(W - 1, cx + 2); x++) {
      const i = (y * W + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  const hsv = rgbToHsv(r / n, g / n, b / n);
  return { ...hsv, tol };
}

// Returns {x,y} normalised in NON-mirrored video space, plus mask points for previews, or null.
export function findWandTip(video, calib, anchorMirrored = null) {
  if (!calib || video.readyState < 2) return null;
  const data = frameData(video);
  const pts = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (matchesColor(rgbToHsv(data[i], data[i + 1], data[i + 2]), calib)) pts.push({ x: x / (W - 1), y: y / (H - 1) });
    }
  }
  const anchor = anchorMirrored ? { x: 1 - anchorMirrored.x, y: anchorMirrored.y } : null;
  const tip = tipFromMask(pts, anchor);
  return tip ? { tip, count: pts.length } : null;
}
