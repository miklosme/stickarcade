// Rebuild lossless atlases and metadata directly from the archived GMX project.
import { XMLParser } from 'fast-xml-parser';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';
import type { Assets, Region } from '../src/game/types';

const root = new URL('../', import.meta.url).pathname;
const source = `${root}.cache/gamemaker`;
await mkdir(source, { recursive: true });
const unpack = Bun.spawn(['tar', '-xf', `${root}vendor/StickArcade.gmz`, '-C', source], {
  env: { ...process.env, LC_ALL: 'C' },
  stdout: 'inherit',
  stderr: 'inherit',
});
if (await unpack.exited) throw new Error('Cannot extract GMZ (requires libarchive tar or bsdtar).');
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: true });
const read = async (path: string) => xml.parse(await Bun.file(`${source}/${path}`).text());
const list = (pattern: string) => [...new Bun.Glob(pattern).scanSync(source)].sort();
const array = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
const size = 2048,
  padding = 2;
const images = new Map<string, PNG>();
for (const file of [
  ...list('sprites/images/*.png'),
  ...list('background/images/*.png'),
  ...list('fonts/*.png'),
]) {
  images.set(file, PNG.sync.read(Buffer.from(await Bun.file(`${source}/${file}`).arrayBuffer())));
}
const regions = new Map<string, Region>();
const pages: PNG[] = [];
let x = padding,
  y = padding,
  rowHeight = 0;
let page = new PNG({ width: size, height: size });
pages.push(page);
for (const [file, png] of [...images].sort((a, b) => b[1].height - a[1].height || a[0].localeCompare(b[0]))) {
  if (png.width + padding * 2 > size || png.height + padding * 2 > size)
    throw new Error(`Oversize asset: ${file}`);
  if (x + png.width + padding > size) {
    x = padding;
    y += rowHeight + padding * 2;
    rowHeight = 0;
  }
  if (y + png.height + padding > size) {
    page = new PNG({ width: size, height: size });
    pages.push(page);
    x = padding;
    y = padding;
    rowHeight = 0;
  }
  PNG.bitblt(png, page, 0, 0, png.width, png.height, x, y);
  // Extrude the edge texels into a gutter to prevent linear filtering bleeding.
  for (let dy = -padding; dy < png.height + padding; dy++) {
    for (let dx = -padding; dx < png.width + padding; dx++) {
      if (dx >= 0 && dx < png.width && dy >= 0 && dy < png.height) continue;
      const src =
        (Math.max(0, Math.min(png.height - 1, dy)) * png.width + Math.max(0, Math.min(png.width - 1, dx))) *
        4;
      const dst = ((y + dy) * size + x + dx) * 4;
      png.data.copy(page.data, dst, src, src + 4);
    }
  }
  regions.set(file, { page: pages.length - 1, x, y, w: png.width, h: png.height });
  x += png.width + padding * 2;
  rowHeight = Math.max(rowHeight, png.height);
}
const assets: Assets = {
  atlasSize: size,
  pages: [],
  sprites: {},
  backgrounds: {},
  fonts: {},
  digitMetrics: [],
  sounds: {},
  room: { width: 2000, height: 480, speed: 30 },
  waves: '',
};
for (let i = 0; i < pages.length; i++) {
  await Bun.write(`${root}public/assets/atlas-${i}.png`, PNG.sync.write(pages[i]!));
  assets.pages.push(`assets/atlas-${i}.png`);
}
for (const file of list('sprites/*.gmx')) {
  const s = (await read(file)).sprite;
  assets.sprites[file.split('/')[1]!.replace('.sprite.gmx', '')] = {
    width: s.width,
    height: s.height,
    originX: s.xorig,
    originY: s.yorigin,
    bbox: { left: s.bbox_left, right: s.bbox_right, top: s.bbox_top, bottom: s.bbox_bottom },
    collisionKind: s.colkind,
    frames: array<{ index: number; '#text': string }>(s.frames.frame)
      .sort((a, b) => a.index - b.index)
      .map((f) => regions.get(`sprites/${f['#text'].replaceAll('\\', '/')}`)!),
  };
}
for (const file of list('background/*.gmx')) {
  const b = (await read(file)).background;
  assets.backgrounds[file.split('/')[1]!.replace('.background.gmx', '')] = regions.get(
    `background/${b.data.replaceAll('\\', '/')}`,
  )!;
}
for (const file of list('fonts/*.gmx')) {
  const f = (await read(file)).font,
    region = regions.get(`fonts/${f.image}`)!;
  const glyphs: Assets['fonts'][string]['glyphs'] = {};
  for (const g of array<any>(f.glyphs.glyph)) {
    glyphs[String.fromCharCode(g.character)] = {
      ...region,
      x: region.x + g.x,
      y: region.y + g.y,
      w: g.w,
      h: g.h,
      shift: g.shift,
      offset: g.offset,
    };
  }
  assets.fonts[file.split('/')[1]!.replace('.font.gmx', '')] = {
    glyphs,
    height: Math.max(...Object.values(glyphs).map((g) => g.h)),
  };
}
for (let i = 0; i < 10; i++) {
  const png = images.get(`sprites/images/s_font_score_${i}.png`)!;
  let left = png.width,
    right = 0;
  for (let yy = 0; yy < png.height; yy++)
    for (let xx = 0; xx < png.width; xx++) {
      if (png.data[(yy * png.width + xx) * 4 + 3]! > 0) {
        left = Math.min(left, xx);
        right = Math.max(right, xx);
      }
    }
  assets.digitMetrics.push({ left, width: right - left + 1 });
}
for (const file of list('sound/audio/*.wav')) {
  const name = file.split('/').at(-1)!;
  await Bun.write(`${root}public/assets/audio/${name}`, Bun.file(`${source}/${file}`));
  assets.sounds[name.replace('.wav', '')] = `assets/audio/${name}`;
}
const room = (await read('rooms/room_game.room.gmx')).room;
assets.room = { width: room.width, height: room.height, speed: room.speed };
const op = await Bun.file(`${source}/objects/OP.object.gmx`).text();
const waveCode = op.match(/enemies =\s+("0000A[\s\S]*?);/)?.[1];
if (!waveCode) throw new Error('Original wave sequence missing');
assets.waves = [...waveCode.matchAll(/"([0123AB]+)"/g)].map((m) => m[1]).join('');
await Bun.write(`${root}src/game/original.json`, JSON.stringify(assets));
console.log(
  `Imported ${Object.keys(assets.sprites).length} sprites / ${images.size} images, ${pages.length} lossless atlases, ${Object.keys(assets.sounds).length} sounds.`,
);
