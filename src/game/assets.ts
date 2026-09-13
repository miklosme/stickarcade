import original from './original.json';
import type { Assets } from './types';
export const assets = original as Assets;
export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const WORLD_WIDTH = assets.room.width,
  HEIGHT = assets.room.height,
  GROUND = 380;
export const HZ = assets.room.speed,
  STEP = 1 / HZ;
export const PLAYER_SPEED = 15,
  PLAYER_ACCELERATION = 1.5,
  TOUCH_THRESHOLD = 8;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const facing = (target: number, origin: number) => (target < origin ? -1 : 1);
export interface MaskInstance {
  x: number;
  y: number;
  sprite: string;
  mask?: string;
  sx: number;
  sy: number;
  angle: number;
}
export function bounds(e: MaskInstance) {
  const sprite = assets.sprites[e.mask || e.sprite]!,
    b = sprite.bbox;
  const c = Math.cos((e.angle * Math.PI) / 180),
    s = Math.sin((e.angle * Math.PI) / 180);
  const points = [
    [b.left, b.top],
    [b.right, b.top],
    [b.right, b.bottom],
    [b.left, b.bottom],
  ].map(([px, py]) => {
    const x = (px! - sprite.originX) * e.sx,
      y = (py! - sprite.originY) * e.sy;
    return [e.x + x * c + y * s, e.y - x * s + y * c];
  });
  return {
    left: Math.min(...points.map((p) => p[0]!)),
    right: Math.max(...points.map((p) => p[0]!)),
    top: Math.min(...points.map((p) => p[1]!)),
    bottom: Math.max(...points.map((p) => p[1]!)),
  };
}
export function overlaps(a: MaskInstance, b: MaskInstance) {
  const aa = bounds(a),
    bb = bounds(b);
  return aa.left <= bb.right && aa.right >= bb.left && aa.top <= bb.bottom && aa.bottom >= bb.top;
}
export function contains(e: MaskInstance, x: number, y: number) {
  const b = bounds(e);
  return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
}
export function intersectsLine(e: MaskInstance, x1: number, y1: number, x2: number, y2: number) {
  const b = bounds(e),
    dx = x2 - x1,
    dy = y2 - y1;
  let first = 0,
    last = 1;
  for (const [p, q] of [
    [-dx, x1 - b.left],
    [dx, b.right - x1],
    [-dy, y1 - b.top],
    [dy, b.bottom - y1],
  ]) {
    if (p === 0) {
      if (q! < 0) return false;
      continue;
    }
    const ratio = q! / p!;
    if (p! < 0) first = Math.max(first, ratio);
    else last = Math.min(last, ratio);
    if (first > last) return false;
  }
  return true;
}
export function layout(width: number, height: number) {
  // GMX uses a fixed height and landscape aspect ratio. Portrait fits the whole
  // landscape game; no scaling or resizing can change a world coordinate.
  const aspect = width < height ? 16 / 9 : clamp(width / height, 4 / 3, WORLD_WIDTH / HEIGHT);
  const logicalWidth = Math.floor(HEIGHT * aspect),
    scale = Math.min(width / logicalWidth, height / HEIGHT);
  return { logicalWidth, width: logicalWidth * scale, height: HEIGHT * scale, scale };
}
