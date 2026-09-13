export interface Region {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Sprite {
  width: number;
  height: number;
  originX: number;
  originY: number;
  bbox: { left: number; right: number; top: number; bottom: number };
  collisionKind: number;
  frames: Region[];
}
export interface Glyph extends Region {
  shift: number;
  offset: number;
}
export interface Assets {
  atlasSize: number;
  pages: string[];
  sprites: Record<string, Sprite>;
  backgrounds: Record<string, Region>;
  fonts: Record<string, { glyphs: Record<string, Glyph>; height: number }>;
  digitMetrics: { left: number; width: number }[];
  sounds: Record<string, string>;
  room: { width: number; height: number; speed: number };
  waves: string;
}
