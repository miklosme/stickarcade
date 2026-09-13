import * as THREE from 'three';
import { assets, GROUND, HEIGHT, VIEW_WIDTH, clamp } from './assets';
import type { Region } from './types';
import { Game, type Actor } from './engine';

const vertexShader = `
attribute float page;
attribute vec4 tint;
varying vec2 texcoord;
varying float texpage;
varying vec4 color;
void main(){ texcoord=uv; texpage=page; color=tint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }
`;
const fragmentShader = `
uniform sampler2D atlas[${assets.pages.length}];
varying vec2 texcoord;
varying float texpage;
varying vec4 color;
void main(){
  vec4 pixel=vec4(1.);
  ${assets.pages.map((_, i) => `${i ? 'else ' : ''}if(texpage > ${i - 0.5} && texpage < ${i + 0.5}) pixel=texture2D(atlas[${i}],texcoord);`).join('\n')}
  gl_FragColor=pixel*color;
}
`;
// One ordered triangle stream preserves GM draw order while batching every atlas.
export class Batch {
  geometry = new THREE.BufferGeometry();
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  capacity = 8192 * 6;
  count = 0;
  position = new Float32Array(this.capacity * 3);
  uv = new Float32Array(this.capacity * 2);
  page = new Float32Array(this.capacity);
  tint = new Float32Array(this.capacity * 4);
  constructor(textures: THREE.Texture[]) {
    for (const [name, data, itemSize] of [
      ['position', this.position, 3],
      ['uv', this.uv, 2],
      ['page', this.page, 1],
      ['tint', this.tint, 4],
    ] as const) {
      this.geometry.setAttribute(
        name,
        new THREE.BufferAttribute(data, itemSize).setUsage(THREE.DynamicDrawUsage),
      );
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { atlas: { value: textures } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }
  begin() {
    this.count = 0;
  }
  end() {
    this.geometry.setDrawRange(0, this.count);
    for (const attr of Object.values(this.geometry.attributes)) {
      (attr as THREE.BufferAttribute).clearUpdateRanges();
      (attr as THREE.BufferAttribute).addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
  quad(
    region: Region | null,
    x: number,
    y: number,
    w: number,
    h: number,
    ox = 0,
    oy = 0,
    sx = 1,
    sy = 1,
    angle = 0,
    color = 0xffffff,
    alpha = 1,
  ) {
    if (alpha <= 0 || sx === 0 || sy === 0) return;
    if (this.count + 6 > this.capacity) throw new Error('Sprite batch capacity exceeded');
    const c = Math.cos((angle * Math.PI) / 180),
      s = Math.sin((angle * Math.PI) / 180),
      size = assets.atlasSize;
    const r = ((color >> 16) & 255) / 255,
      g = ((color >> 8) & 255) / 255,
      b = (color & 255) / 255;
    for (const [xx, yy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      const px = (xx! * w - ox) * sx,
        py = (yy! * h - oy) * sy,
        i = this.count++;
      this.position.set([x + px * c + py * s, y - px * s + py * c, 0], i * 3);
      this.uv.set(
        region ? [(region.x + xx! * region.w) / size, 1 - (region.y + yy! * region.h) / size] : [0, 0],
        i * 2,
      );
      this.page[i] = region?.page ?? -1;
      this.tint.set([r, g, b, clamp(alpha, 0, 1)], i * 4);
    }
  }
  sprite(
    name: string,
    frame: number,
    x: number,
    y: number,
    sx = 1,
    sy = 1,
    angle = 0,
    color = 0xffffff,
    alpha = 1,
  ) {
    const s = assets.sprites[name];
    if (!s) throw new Error(`Missing sprite ${name}`);
    const region = s.frames[Math.floor(Math.max(0, frame)) % s.frames.length]!;
    this.quad(region, x, y, s.width, s.height, s.originX, s.originY, sx, sy, angle, color, alpha);
  }
  background(name: string, x: number, y = 0) {
    const r = assets.backgrounds[name]!;
    this.quad(r, x, y, r.w, r.h);
  }
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    this.quad(null, x, y, w, h, 0, 0, 1, 1, 0, color, alpha);
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, color: number, alpha: number) {
    this.rect(x + r, y, w - 2 * r, h, color, alpha);
    this.rect(x, y + r, r, h - 2 * r, color, alpha);
    this.rect(x + w - r, y + r, r, h - 2 * r, color, alpha);
    const tint = [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, alpha];
    for (const [cx, cy, start] of [
      [x + r, y + r, Math.PI],
      [x + w - r, y + r, 1.5 * Math.PI],
      [x + w - r, y + h - r, 0],
      [x + r, y + h - r, 0.5 * Math.PI],
    ]) {
      for (let j = 0; j < 8; j++) {
        const a = start! + (j * Math.PI) / 16,
          b = a + Math.PI / 16;
        for (const [px, py] of [
          [cx, cy],
          [cx! + Math.cos(a) * r, cy! + Math.sin(a) * r],
          [cx! + Math.cos(b) * r, cy! + Math.sin(b) * r],
        ]) {
          const i = this.count++;
          this.position.set([px!, py!, 0], i * 3);
          this.uv.set([0, 0], i * 2);
          this.page[i] = -1;
          this.tint.set(tint, i * 4);
        }
      }
    }
  }
  text(
    value: string | number,
    x: number,
    y: number,
    font = 'digits',
    align: 'left' | 'right' | 'center' = 'left',
    color = 0xffffff,
    alpha = 1,
    maxWidth = Infinity,
  ) {
    let chars = [...String(value)];
    const measure = (cs: string[]) =>
      cs.reduce(
        (w, c) =>
          w +
          (font === 'digits'
            ? (assets.digitMetrics[+c]?.width ?? 0) + 5
            : (assets.fonts[font]!.glyphs[c]?.shift ?? 0)),
        0,
      );
    while (chars.length && measure(chars) > maxWidth) chars.pop();
    const width = measure(chars);
    let xx = x - (align === 'right' ? width : align === 'center' ? width / 2 : 0);
    for (const c of chars) {
      if (font === 'digits') {
        const metric = assets.digitMetrics[+c],
          f = assets.sprites.s_font_score!.frames[+c];
        if (!metric || !f) continue;
        const region = { ...f, x: f.x + metric.left, w: metric.width };
        this.quad(region, xx, y, region.w, region.h, 0, 0, 1, 1, 0, color, alpha);
        xx += metric.width + 5;
      } else {
        const glyph = assets.fonts[font]!.glyphs[c] ?? assets.fonts[font]!.glyphs['?'];
        if (!glyph) continue;
        this.quad(glyph, xx + glyph.offset, y, glyph.w, glyph.h, 0, 0, 1, 1, 0, color, alpha);
        xx += glyph.shift;
      }
    }
    return width;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
export interface GameButton {
  id: string;
  label: string;
  sprite: string;
  x: number;
  y: number;
  frame?: number;
  scale?: number;
  press?: boolean;
}
export function buttons(g: Game): GameButton[] {
  const middle = Math.floor(g.width / 2);
  if (g.paused)
    return [
      { id: 'continue', label: 'Continue', sprite: 's_button_continue', x: middle, y: 250 },
      { id: 'back', label: 'Back to menu', sprite: 's_button_back', x: middle, y: GROUND },
    ];
  if (g.mode === 'scores')
    return [
      { id: 'menu', label: 'Menu', sprite: 's_button_menu', x: 110, y: 430 },
      { id: 'facebook', label: 'Share on Facebook', sprite: 's_btn_facebook', x: g.width - 160, y: 430 },
      { id: 'twitter', label: 'Share on Twitter', sprite: 's_button_twitter', x: g.width - 70, y: 430 },
    ];
  if (!g.started)
    return [
      { id: 'tutorial', label: 'Play tutorial', sprite: 's_button_tutorial', x: 1000 - g.viewX, y: 70 },
      { id: 'play', label: 'Play', sprite: 's_button_play', x: 1000 - 155 - g.viewX, y: GROUND },
      {
        id: 'scores',
        label: 'High scores',
        sprite: 's_button_highscore',
        x: 1000 + 125 - g.viewX,
        y: GROUND,
      },
    ];
  const b: GameButton[] = [];
  if (g.player.alive && g.guiVisible)
    b.push({ id: 'pause', label: 'Pause', sprite: 's_button_pause', x: 0, y: g.guiShift });
  if (g.mobile && g.player.visible && g.player.alive) {
    // The archived control objects have no placement/wiring. Use the original
    // tutorial's tap anchors and original button artwork, scaled only as UI.
    b.push({
      id: 'punch',
      label: 'Punch',
      sprite: 's_controll_buttons',
      frame: 1,
      x: g.width - 200,
      y: 245,
      scale: 0.7,
      press: true,
    });
    b.push({
      id: 'kick',
      label: 'Kick',
      sprite: 's_controll_buttons',
      frame: 0,
      x: g.width - 200,
      y: 345,
      scale: 0.7,
      press: true,
    });
  }
  return b;
}
function drawActor(b: Batch, e: Actor, g: Game) {
  if (!e.visible || !e.alive) return;
  if (e.kind === 'float') {
    b.text(e.value, (e.x | 0) - g.viewX, e.y - 25, 'digits', 'center', e.color, e.alpha);
    return;
  }
  if (!e.sprite) return;
  if (['hp', 'shield', 'bonus'].includes(e.kind)) b.sprite('s_powerup_glow', 0, e.x - g.viewX, e.y);
  b.sprite(e.sprite, e.frame, (e.x | 0) - g.viewX, e.y, e.sx, e.sy, e.angle, e.color, e.alpha);
}
export function drawWorld(b: Batch, g: Game) {
  b.begin();
  for (let i = 0; i < g.width; i += 400) b.background('bg_sky', i);
  b.sprite('s_sun', 0, Math.floor(g.width / 2) + 169, 0);
  const layer = (rate: number) => ((g.viewX * rate - 8) | 0) - g.viewX;
  b.background('bg_thujas', layer(0.9));
  const windmill = 480 + layer(0.8);
  b.sprite('s_windmill', 0, windmill, GROUND);
  b.sprite('s_windmill_wheel', 0, windmill, GROUND - 170, -1, 1, g.windmill);
  b.background('bg_bigbushes', layer(0.7));
  b.sprite('s_barn', 0, 1000 + layer(0.6), GROUND);
  b.background('bg_trees', layer(0.5));
  for (let i = 0; i <= g.width; i += 25) b.sprite('s_hero_highlight', 0, i, 0);
  b.background('bg_smallbushes', layer(0.3));
  if (g.bonus > 0 && g.player.visible) {
    // Cosmetic noise must not consume the gameplay RNG stream.
    b.sprite(
      g.player.sprite,
      g.player.frame,
      g.player.x - g.viewX + Math.sin(g.tickCount * 13) * 5,
      g.player.y + Math.cos(g.tickCount * 7) * 5,
      g.player.sx,
      1,
      0,
      0xff0000,
      0.5,
    );
  }
  for (const e of [...g.actors].sort((a, b) => b.depth - a.depth || a.id - b.id))
    if (e.kind !== 'skull' && e.kind !== 'mud') drawActor(b, e, g);
  b.end();
}
export function drawGround(b: Batch, g: Game) {
  b.begin();
  b.background('bg_ground', -8 - g.viewX);
  b.end();
}
export function drawUI(b: Batch, g: Game) {
  b.begin();
  const half = Math.floor(g.width / 2);
  for (const e of g.actors) if (e.kind === 'mud') drawActor(b, e, g);
  if (!g.shield) {
    b.sprite('s_hud_score', 0, 0, g.guiShift);
    b.sprite('s_hud_monsters', 0, g.width, g.guiShift);
    b.text(g.guiScore, 32, g.guiShift + 32, 'digits', 'left', g.bonus ? 0xbd1717 : 0xffffff);
    b.text(g.killed, g.width - 12, g.guiShift + 12, 'digits', 'right');
  } else b.sprite('s_glow_immortal', 0, 0, 0, g.width / 800);
  if (g.shield) {
    b.sprite('s_powerup_shield', 0, g.width - 135, HEIGHT - 30 - g.hudBonusPush);
    b.text(Math.ceil(g.shield / 30), g.width - 10, HEIGHT - 50 - g.hudBonusPush, 'digits', 'right');
  }
  if (g.bonus) {
    b.sprite('s_powerup_bonus_icon', 0, g.width - 135, HEIGHT + 30 - g.hudBonusPush);
    b.text(Math.ceil(g.bonus / 30), g.width - 10, HEIGHT - g.hudBonusPush, 'digits', 'right', 0xbd1717);
  }
  if (g.guiVisible && !g.shield)
    for (const e of g.actors)
      if (e.kind === 'skull' && e.sx > 0) b.sprite(e.sprite, 0, e.x, e.y, e.sx, e.sy, e.angle);
  if (g.bonusSign) b.sprite('s_bonus', 0, half, GROUND - 250, 1, 1, 0, 0xffffff, clamp(g.bonusSign, 0, 1));
  if (g.hudFlash) b.rect(0, 0, g.width, HEIGHT, 0xffffff, g.hudFlash);
  if (g.logoX < 2000) b.sprite('s_stickarcade_logo', 0, g.logoX - g.viewX, 220);
  if (g.started && g.menuAlpha > 0) {
    b.sprite('s_button_play', 0, 1000 - 155 - g.viewX, GROUND, 1, 1, 0, 0xffffff, g.menuAlpha);
    b.sprite('s_button_highscore', 0, 1000 + 125 - g.viewX, GROUND, 1, 1, 0, 0xffffff, g.menuAlpha);
    b.sprite('s_button_tutorial', 0, 1000 - g.viewX, 70, 1, 1, 0, 0xffffff, g.menuAlpha);
  }
  const t = g.tutorial;
  if (t && t.alpha > 0 && g.player.alive) {
    b.sprite('s_tutorial_fade', 0, 0, 0, g.width / 853, 1, 0, 0xffffff, t.alpha);
    if (!t.type) {
      b.sprite('s_text_swipe', 0, half, 85, 1, 1, 0, 0xffffff, t.alpha);
      b.sprite(
        Math.sin((t.pulse * Math.PI) / 180) < 0 ? 's_hand_swipe_left' : 's_hand_swipe_right',
        0,
        150 - Math.cos((t.pulse * Math.PI) / 180) * 15,
        305,
        1,
        1,
        0,
        0xffffff,
        Math.min(0.9, t.alpha),
      );
    } else if (t.type) {
      const kick = t.type === 'bean' || t.type === 'oct';
      b.sprite(kick ? 's_text_kick' : 's_text_punch', 0, half, 85, 1, 1, 0, 0xffffff, t.alpha);
      b.sprite('s_tutorial_line', 0, half, 310, 1, 1, 0, 0xffffff, t.alpha);
      b.sprite('s_hand_tap', 0, g.width - 200, kick ? 345 : 245, 1, 1, 0, 0xffffff, Math.min(0.9, t.alpha));
    }
  }
  if (g.paused) {
    b.sprite('s_pause_fade', 0, 0, 0, g.width / 853, 1, 0, 0xffffff, g.pauseOpaque);
    b.sprite('s_text_paused', 0, half, 110);
  }
  if (g.mode === 'scores') {
    b.rect(16, 32, half - 24, GROUND - 64, 0, 0.9);
    b.rect(half + 8, 32, half - 24, GROUND - 64, 0, 0.9);
    let highlighted = false;
    g.board.entries.forEach((entry, i) => {
      const right = i >= 5,
        x = right ? half + 16 : 24,
        y = 56 + (i % 5) * 60;
      const highlight = !highlighted && entry.score === g.score && g.score > 0 && entry.name === g.scoreName;
      if (highlight) highlighted = true;
      const color = highlight ? 0xffd200 : 0xffffff;
      // Clip long names within their original column, leaving scores readable.
      const scoreWidth = b.text(
        entry.score,
        right ? g.width - 32 : half - 24,
        y,
        'font_highscore',
        'right',
        color,
      );
      b.text(
        `${i < 9 ? ' ' : ''}${i + 1}. ${entry.name}`,
        x,
        y,
        'font_highscore',
        'left',
        color,
        1,
        half - 64 - scoreWidth - 16,
      );
    });
    const value = g.score || g.board.entries[0]!.score;
    const width = String(value)
      .split('')
      .reduce((n, c) => n + (assets.fonts.font_bigscore!.glyphs[c]?.shift || 0), 0);
    b.roundRect(half - width / 2 - 8, 390, width + 16, assets.fonts.font_bigscore!.height, 10, 0, 0.4);
    b.text(value, half, 390, 'font_bigscore', 'center', 0xffd200);
    b.sprite('s_text_sharescore', 0, half, 450);
  }
  for (const button of buttons(g))
    b.sprite(
      button.sprite,
      button.frame || 0,
      button.x,
      button.y,
      button.scale || 1,
      button.scale || 1,
      0,
      0xffffff,
      button.id === 'pause' ? g.pauseAlpha : button.id === 'continue' ? g.pauseOpaque + 0.3 : 1,
    );
  b.end();
}

const screenVertex = `varying vec2 at; void main(){at=uv;gl_Position=vec4(position.xy,0.,1.);}`;
function screenMaterial(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    vertexShader: screenVertex,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}
export class GameRenderer {
  world = new THREE.Scene();
  surface = new THREE.Scene();
  screen = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, VIEW_WIDTH, 0, HEIGHT, 0.1, 100);
  worldTarget = new THREE.WebGLRenderTarget(VIEW_WIDTH, HEIGHT, { depthBuffer: false });
  surfaceTarget = new THREE.WebGLRenderTarget(VIEW_WIDTH, HEIGHT, { depthBuffer: false });
  worldBatch: Batch;
  groundBatch: Batch;
  uiBatch: Batch;
  screenGeometry = new THREE.PlaneGeometry(2, 2);
  waterMaterial: THREE.ShaderMaterial;
  displayMaterial: THREE.ShaderMaterial;
  constructor(textures: THREE.Texture[]) {
    this.camera.position.z = 10;
    this.worldBatch = new Batch(textures);
    this.groundBatch = new Batch(textures);
    this.uiBatch = new Batch(textures);
    this.world.add(this.worldBatch.mesh);
    this.waterMaterial = screenMaterial(
      `
      uniform sampler2D image;uniform float time;varying vec2 at;
      void main(){
        vec2 uv=vec2(at.x,1.-at.y);vec4 color=texture2D(image,at);
        if(uv.y>=380./480.) {
          float t=(uv.y-380./480.)/(100./480.);
          vec2 pos=vec2(uv.x,mix(.79,2.*.79-1.,t));
          vec2 wave=vec2(sin((time+t*40.)*.6)/4.,sin((time+uv.x*40.)*.85));
          wave*=min(t*5.,1.)/200.;pos+=wave;
          color=texture2D(image,vec2(pos.x,1.-pos.y))*.6+vec4(.31,.64,.84,1.)*.4;
        }
        gl_FragColor=color;
      }`,
      { image: { value: this.worldTarget.texture }, time: { value: 0 } },
    );
    const water = new THREE.Mesh(this.screenGeometry, this.waterMaterial);
    water.frustumCulled = false;
    water.renderOrder = -10;
    this.groundBatch.mesh.renderOrder = 0;
    this.surface.add(water, this.groundBatch.mesh);
    this.displayMaterial = screenMaterial(
      `
      uniform sampler2D image;uniform float rate;varying vec2 at;
      void main(){vec4 tex=texture2D(image,at);float gray=dot(tex.rgb,vec3(.21,.71,.07));gl_FragColor=vec4(mix(tex.rgb,vec3(gray),rate),tex.a);}
    `,
      { image: { value: this.surfaceTarget.texture }, rate: { value: 0 } },
    );
    const display = new THREE.Mesh(this.screenGeometry, this.displayMaterial);
    display.frustumCulled = false;
    display.renderOrder = -10;
    this.uiBatch.mesh.renderOrder = 0;
    this.screen.add(display, this.uiBatch.mesh);
  }
  render(gl: THREE.WebGLRenderer, g: Game) {
    this.camera.right = g.width;
    this.camera.updateProjectionMatrix();
    const drawSize = gl.getDrawingBufferSize(new THREE.Vector2());
    if (this.worldTarget.width !== drawSize.x || this.worldTarget.height !== drawSize.y) {
      this.worldTarget.setSize(drawSize.x, drawSize.y);
      this.surfaceTarget.setSize(drawSize.x, drawSize.y);
    }
    drawWorld(this.worldBatch, g);
    drawGround(this.groundBatch, g);
    drawUI(this.uiBatch, g);
    this.waterMaterial.uniforms.time!.value = (g.tickCount / 30) * 5;
    this.displayMaterial.uniforms.rate!.value = g.grayscale;
    gl.setClearColor(0x000000, 1);
    gl.setRenderTarget(this.worldTarget);
    gl.clear();
    gl.render(this.world, this.camera);
    gl.setRenderTarget(this.surfaceTarget);
    gl.clear();
    gl.render(this.surface, this.camera);
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(this.screen, this.camera);
  }
  dispose() {
    this.worldBatch.dispose();
    this.groundBatch.dispose();
    this.uiBatch.dispose();
    this.worldTarget.dispose();
    this.surfaceTarget.dispose();
    this.screenGeometry.dispose();
    this.waterMaterial.dispose();
    this.displayMaterial.dispose();
  }
}
