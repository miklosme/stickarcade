import {
  assets,
  clamp,
  contains,
  facing,
  GROUND,
  HEIGHT,
  intersectsLine,
  overlaps,
  PLAYER_ACCELERATION,
  PLAYER_SPEED,
  STEP,
  VIEW_WIDTH,
  WORLD_WIDTH,
} from './assets';
import { Scoreboard } from './scores';
export type EnemyKind = 'bean' | 'sheep' | 'oct' | 'warrior';
export type Kind =
  | EnemyKind
  | 'player'
  | 'intro'
  | 'deadplayer'
  | 'dead'
  | 'box'
  | 'wheel'
  | 'sheepball'
  | 'hp'
  | 'shield'
  | 'bonus'
  | 'fade'
  | 'plank'
  | 'smoke'
  | 'mud'
  | 'swing'
  | 'float'
  | 'skull'
  | 'extra';
export type Attack = 'punch' | 'kick';
export type Action = 'stand' | 'run' | Attack;
export type Mode = 'menu' | 'playing' | 'dying' | 'scores';
export class Actor {
  id = 0;
  sprite = '';
  mask = '';
  x = 0;
  y = 0;
  sx = 1;
  sy = 1;
  angle = 0;
  frame = 0;
  imageSpeed = 0.5;
  vx = 0;
  vy = 0;
  speed = 0;
  friction = 0;
  alpha = 1;
  color = 0xffffff;
  depth = 0;
  alive = true;
  visible = true;
  age = 0;
  alphaLoss = 0;
  rotate = 0;
  timer = -1;
  timer2 = -1;
  sp = 0;
  range = 0;
  attackPoint = 0;
  needHit = false;
  unlocked = false;
  previousSide = 0;
  canJump = true;
  wait = false;
  active = false;
  startY = 0;
  pulse = 0;
  hitX = 0;
  kicked = false;
  lastFrame = 0;
  value = 0;
  representedLife = 0;
  falling = false;
  action: Action = 'stand';
  queued: Attack | null = null;
  headBox: Actor | null = null;
  constructor(public kind: Kind) {}
}
export const isEnemy = (e: Actor): e is Actor & { kind: EnemyKind } =>
  ['bean', 'sheep', 'oct', 'warrior'].includes(e.kind);
const animations = {
  bean: ['s_bean_stand', 's_bean_run', 's_bean_bite', 's_bean_die'],
  sheep: ['s_sheep_run', 's_sheep_run', 's_sheep_jump', 's_sheep_dead'],
  oct: ['s_oct_stand', 's_oct_run', 's_oct_attack', 's_oct_die'],
  warrior: ['s_skeleton_stand', 's_skeleton_run', 's_skeleton_attack', 's_skeleton_die'],
} as const;
export interface Tutorial {
  move: boolean;
  left: number;
  right: number;
  taught: Set<EnemyKind>;
  teaching: Actor | null;
  type: EnemyKind | null;
  alpha: number;
  pulse: number;
}
export class Game {
  actors: Actor[] = [];
  player!: Actor;
  nextId = 1;
  mode: Mode = 'menu';
  started = false;
  paused = false;
  score = 0;
  guiScore = 0;
  lives = 0;
  killed = 0;
  combo = 1;
  comboTimer = 0;
  boxesDropped = 0;
  boxCounter = 0;
  powerBag: number[] = [];
  shield = 0;
  bonus = 0;
  hudBonusPush = 0;
  hudFlash = 1;
  bonusSign = 0;
  guiVisible = false;
  guiShift = -140;
  canSpawn = false;
  popTimer = 0;
  popIndex = 0;
  popNext = 2;
  popGap = 100;
  camera = 0;
  viewX = 0;
  shake = 0;
  shakeDirection = 1;
  windmill = 0;
  tickCount = 0;
  deathTicks = 0;
  grayscale = 0;
  menuAlpha = 1;
  logoX = 1000;
  logoSpeed = 0;
  pauseAlpha = 0;
  pauseOpaque = 0;
  held = new Set<string>();
  touchDirection = 0;
  mobile = false;
  tutorial: Tutorial | null = null;
  sounds: string[] = [];
  needsName = false;
  nameSaved = false;
  scoreName = '';
  accumulator = 0;
  pendingHits: { type: Attack; x: number; y: number }[] = [];
  constructor(
    public width = VIEW_WIDTH,
    public board = new Scoreboard(),
    public random = Math.random,
  ) {
    this.reset();
  }
  rand(n: number) {
    return this.random() * n;
  }
  int(n: number) {
    return Math.floor(this.rand(n));
  }
  choose<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  sound(group: string, count: number) {
    this.sounds.push(`snd_${group}${1 + this.int(count)}`);
  }
  create(kind: Kind, x: number, y: number, sprite = '') {
    const e = new Actor(kind);
    e.id = this.nextId++;
    e.x = x;
    e.y = e.startY = y;
    e.sprite = sprite;
    this.actors.push(e);
    return e;
  }
  reset() {
    this.actors = [];
    this.nextId = 1;
    this.mode = 'menu';
    this.started = false;
    this.paused = false;
    this.score = this.guiScore = this.killed = this.boxesDropped = this.boxCounter = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.powerBag = [];
    this.shield = this.bonus = this.hudBonusPush = 0;
    this.hudFlash = 1;
    this.bonusSign = 0;
    this.guiVisible = this.canSpawn = false;
    this.guiShift = -140;
    this.popTimer = this.popIndex = 0;
    this.popNext = 2;
    this.popGap = 100;
    this.camera = this.viewX = WORLD_WIDTH / 2 - Math.floor(this.width / 2);
    this.shake = 0;
    this.windmill = this.tickCount = this.deathTicks = this.grayscale = 0;
    this.menuAlpha = 1;
    this.logoX = 1000;
    this.logoSpeed = this.pauseAlpha = this.pauseOpaque = 0;
    this.tutorial = null;
    this.needsName = this.nameSaved = false;
    this.scoreName = '';
    this.clearInput();
    this.sounds = [];
    this.accumulator = 0;
    this.pendingHits = [];
    this.player = this.create('player', WORLD_WIDTH / 2, GROUND, 's_stickman_stand');
    this.player.mask = 's_stickman_stand';
    this.player.depth = 100;
    this.player.visible = false;
    this.player.color = 0;
    this.player.sp = PLAYER_SPEED;
    this.lives = 0;
    this.addLives(10);
  }
  resize(width: number) {
    if (this.width === width) return;
    const center = this.camera + Math.floor(this.width / 2);
    this.width = width;
    this.camera = clamp(center - Math.floor(width / 2), 0, WORLD_WIDTH - width);
    this.viewX = this.camera;
  }
  start(forceTutorial = false) {
    if (this.started || this.mode !== 'menu') return;
    this.started = true;
    this.mode = 'playing';
    if (forceTutorial || this.board.entries[0]!.score < 3000)
      this.tutorial = {
        move: false,
        left: 0,
        right: 0,
        taught: new Set(),
        teaching: null,
        type: null,
        alpha: 0,
        pulse: 0,
      };
    else this.guiVisible = this.canSpawn = true;
    const intro = this.create('intro', 0, GROUND, 's_stickman_run');
    intro.vx = PLAYER_SPEED;
    intro.color = 0;
    intro.depth = 100;
  }
  showScores() {
    if (!this.started) {
      this.mode = 'scores';
      this.nameSaved = true;
    }
  }
  backFromScores() {
    if (this.started) this.reset();
    else this.mode = 'menu';
  }
  clearInput() {
    this.held.clear();
    this.touchDirection = 0;
  }
  pause() {
    if (!this.started || !this.player.alive || !this.guiVisible) return;
    this.paused = true;
    this.clearInput();
    this.move(0);
    this.player.queued = null;
  }
  resume() {
    this.paused = false;
    this.pauseOpaque = 0;
    this.accumulator = 0;
    this.clearInput();
  }
  keyDown(key: string) {
    if (this.held.has(key)) return;
    this.held.add(key);
    if (key === 'Escape' || key === 'Backspace') {
      if (this.paused) this.resume();
      else if (this.mode === 'scores') this.backFromScores();
      else this.pause();
      return;
    }
    if (key === 'Enter' && this.mode === 'menu') {
      this.start();
      return;
    }
    if (this.paused || !this.player.visible || !this.player.alive) return;
    if (key === 'ArrowLeft') this.move(-1);
    if (key === 'ArrowRight') this.move(1);
    if (key.toLowerCase() === 's') this.attack('punch');
    if (key.toLowerCase() === 'd') this.attack('kick');
  }
  keyUp(key: string) {
    this.held.delete(key);
    if (key === 'ArrowLeft' || key === 'ArrowRight') this.move(this.inputDirection());
  }
  inputDirection() {
    return this.held.has('ArrowLeft') ? -1 : this.held.has('ArrowRight') ? 1 : this.touchDirection;
  }
  touchMove(direction: number) {
    this.touchDirection = direction;
    this.move(this.inputDirection());
  }
  move(direction: number) {
    const p = this.player;
    if (!p.alive || !p.visible || (p.action !== 'stand' && p.action !== 'run')) return;
    if (!direction) {
      p.friction = PLAYER_ACCELERATION;
      p.action = 'stand';
      return;
    }
    if (p.sx !== direction) {
      p.sx = direction;
      p.speed = -Math.abs(p.speed);
    }
    p.friction = 0;
    p.action = 'run';
  }
  attack(type: Attack) {
    const p = this.player;
    if (this.paused || !p.alive || !p.visible || this.mode !== 'playing') return;
    if (p.action === 'punch' || p.action === 'kick') {
      p.queued = type;
      return;
    }
    p.headBox = null;
    if (type === 'punch')
      p.headBox =
        this.actors.find(
          (e) =>
            e.alive &&
            e.kind === 'box' &&
            contains(e, p.x + p.sx * 60, p.y - 50) &&
            !e.vx &&
            !e.vy &&
            !e.kicked,
        ) || null;
    p.action = type;
    p.sprite = type === 'kick' ? 's_stickman_kick' : p.headBox ? 's_stickman_headup' : 's_stickman_punch';
    p.speed = p.vx = 0;
    p.needHit = true;
    p.frame = 0;
    p.imageSpeed = type === 'kick' ? 0.6 : 0.5;
  }
  spawnEnemy(kind: EnemyKind, x?: number) {
    const xx =
      x ??
      (kind === 'oct'
        ? this.viewX + this.int(this.width)
        : this.killed === 0 || this.int(2) === 0
          ? this.viewX + this.width + 150
          : this.viewX - 150);
    const e = this.create(kind, xx, GROUND, kind === 'oct' ? 's_oct_create' : animations[kind][0]);
    e.mask = kind === 'oct' ? 's_oct_create' : animations[kind][0];
    e.depth = -50;
    e.previousSide = Math.sign(e.x - this.player.x);
    if (kind === 'bean') {
      e.sp = 6 + this.rand(3);
      e.range = 50;
      e.attackPoint = 6;
    }
    if (kind === 'sheep') {
      e.sp = 7 + this.int(4);
      e.range = 190;
    }
    if (kind === 'oct') {
      e.sp = 5 + this.rand(2);
      e.range = 95 + this.int(11);
      e.attackPoint = 13;
    }
    if (kind === 'warrior') {
      e.sp = 5 + Math.round(this.rand(4));
      e.range = 75 + this.int(11);
      e.attackPoint = 6;
    }
    return e;
  }
  spawnStep() {
    const enemies = this.actors.filter((e) => e.alive && isEnemy(e));
    if (!this.started || !this.player.alive || this.tutorial?.teaching?.alive || enemies.length >= 5) return;
    this.popTimer++;
    // string_char_at is one-based, including the original initial empty index 0.
    const symbol = this.popIndex > 0 ? assets.waves[this.popIndex - 1] : '';
    if (symbol === 'B') {
      this.popIndex = 317;
      return;
    }
    if (symbol === 'A') {
      this.popIndex++;
      this.popNext += 2;
      return;
    }
    const kind = ({ '0': 'bean', '1': 'sheep', '2': 'oct', '3': 'warrior' } as Record<string, EnemyKind>)[
      symbol || ''
    ];
    const taught = !this.tutorial || (!!kind && this.tutorial.taught.has(kind));
    if (this.killed + enemies.length < this.popNext && (taught || enemies.length === 0)) {
      if ((this.int(40) === 0 && this.popTimer > 15) || this.popTimer > this.popGap) {
        if (kind) {
          const e = this.spawnEnemy(kind);
          if (!taught && this.tutorial) {
            this.tutorial.teaching = e;
            this.tutorial.type = kind;
          }
        }
        this.popIndex++;
        this.popTimer = 0;
      }
    }
  }
  addLives(count: number) {
    for (let i = 0; i < count; i++) {
      const col = this.lives % 5,
        row = 1 - Math.floor(this.lives / 5);
      const s = this.create('skull', 25 + col * 50, GROUND + 25 + row * 50, 's_skull');
      s.representedLife = ++this.lives;
      s.sx = s.sy = i * -0.25;
      s.imageSpeed = 0;
    }
  }
  damage() {
    if (!this.player.alive || this.shield > 0) return;
    if (!this.tutorial?.teaching?.alive) {
      const s = this.actors.find((e) => e.alive && e.kind === 'skull' && e.representedLife === this.lives);
      if (s) {
        s.representedLife = -1;
        s.falling = true;
        s.angle = 120 - this.int(60);
        s.rotate = this.int(20) - 10;
        s.vy = -10;
        s.vx = 5 - this.int(10);
      }
      this.lives--;
    }
    this.shake = 8;
  }
  die() {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    p.visible = false;
    this.mode = 'dying';
    this.deathTicks = 0;
    this.clearInput();
    const d = this.create('deadplayer', p.x | 0, p.y, 's_stickman_die');
    d.sx = p.sx;
    d.color = p.color;
    d.imageSpeed = 0.3;
    d.depth = -50;
    d.timer = 2;
    // Save at death, even if the browser closes during the animation/name dialog.
    this.scoreName = this.board.name || `Player${1000 + this.int(9000)}`;
    this.board.add(this.scoreName, this.score);
    this.nameSaved = true;
  }
  saveName(name: string | null) {
    this.needsName = false;
    const replacement = name?.trim() || this.scoreName;
    const entry = this.board.entries.find((e) => e.name === this.scoreName && e.score === this.score);
    if (entry) entry.name = replacement;
    this.scoreName = this.board.name = replacement;
    this.board.persist();
    this.mode = 'scores';
  }
  kill(e: Actor, byKick = false) {
    if (!e.alive || !isEnemy(e)) return;
    e.alive = false;
    const add = (this.bonus > 0 ? 200 : 100) * this.combo;
    this.score += add;
    if (this.combo % 3 === 0) {
      this.dropBox();
      this.bonusSign = 3;
    }
    const f = this.create('float', e.x, GROUND - 170 - this.int(20));
    f.value = add;
    f.alphaLoss = 0.01 * (6 - this.combo);
    f.vy = -f.alphaLoss * 200;
    f.color =
      this.bonus > 0 ? 0xbd1717 : [0xffffff, 0xffffff, 0x2b80d5, 0x73568f, 0xaacd18, 0xb14d34][this.combo]!;
    if (e.kind === 'sheep') {
      const ball = this.create('sheepball', e.x | 0, e.y - 50, 's_sheep_dead');
      ball.vy = 1;
      ball.depth = 50;
      ball.imageSpeed = 0;
      ball.timer = 2;
      if (byKick) {
        ball.active = true;
        this.kickBall(ball);
      }
    } else {
      const d = this.create('dead', e.x, e.y, animations[e.kind][3]);
      d.sx = -this.player.sx;
      d.imageSpeed = e.imageSpeed;
    }
    if (e.kind === 'bean') {
      const m = this.create('mud', e.x | 0, e.y, 's_bean_mud');
      m.sx = e.sx;
      m.lastFrame = 2 + this.int(9);
    }
    this.combo = Math.min(5, this.combo + 1);
    this.comboTimer = 20;
    this.sound('hit', 3);
    this.killed++;
    this.popNext++;
    this.boxCounter++;
    if (this.boxCounter >= 15) {
      this.boxCounter -= 15;
      this.dropBox();
    }
    this.popGap = Math.max(20, this.popGap - 0.5);
  }
  dropBox() {
    const aa = Math.max(300, this.viewX),
      bb = Math.min(this.viewX + this.width, WORLD_WIDTH - 300);
    let x = aa;
    for (let i = 0; i < 10; i++) {
      x = aa + this.int(bb - aa);
      const blocked = this.actors.some(
        (e) => e.alive && e.kind === 'box' && intersectsLine(e, x - 40, GROUND - 10, x + 40, GROUND + 10),
      );
      if (!blocked) break;
    }
    const b = this.create('box', x, 0, this.choose(['s_box1', 's_box2', 's_box3']));
    b.mask = 's_box3';
    b.sx = this.choose([-1, 1]);
    b.vy = 10;
    b.imageSpeed = 0;
    b.hitX = x;
    b.depth = 200;
    this.boxesDropped++;
    return b;
  }
  smoke(x: number, y: number) {
    const e = this.create('smoke', x, y, this.choose(['s_smoke', 's_smoke_bordered']));
    e.angle = this.int(360);
    e.imageSpeed = 0.4 + this.choose([0, 0.1]);
    e.depth = 145;
    return e;
  }
  breakBox(e: Actor) {
    if (!e.alive) return;
    e.alive = false;
    this.sound('break', 4);
    for (let i = 0; i < 8; i++) this.smoke(e.x - 50 + this.int(100), e.y - 20 - this.int(80));
    for (let i = 0; i < 13; i++) {
      const p = this.create('plank', e.x - 30 + this.int(60), e.y - 20 - this.int(60), 's_plank');
      p.frame = this.int(4);
      p.imageSpeed = 0;
      p.angle = this.int(360);
      p.rotate = this.int(20) - 10;
      p.vy = -10 - this.int(7);
      p.vx = -3 + this.int(6) + this.int(5) * this.player.sx;
      p.depth = this.int(400) - 200;
      p.timer = 120 + this.int(300);
    }
    if (!this.powerBag.length) this.powerBag = [0, 1, 2, 3];
    const power = this.powerBag.splice(this.int(this.powerBag.length), 1)[0]!;
    if (power === 0) {
      const w = this.create('wheel', e.x, GROUND - 45, 's_powerup_wheel');
      w.vy = -13;
      w.angle = this.int(360);
      w.imageSpeed = 0;
      w.depth = 150;
      w.timer = 2;
    } else {
      const kind = (['hp', 'shield', 'bonus'] as const)[power - 1]!;
      const p = this.create(kind, e.x, GROUND - 80, `s_powerup_${kind}`);
      p.pulse = this.int(10);
      p.active = kind === 'hp';
      p.timer = 20;
      p.depth = 150;
      p.imageSpeed = 0;
    }
  }
  kickBall(e: Actor) {
    if (e.active && !e.vx) {
      e.vy = 0;
      e.vx = 30 * this.player.sx;
      e.sx = this.player.sx;
    }
  }
  hit(type: Attack, position?: { x: number; y: number }) {
    const p = this.player,
      hit = {
        x: position?.x ?? p.x + p.sx * (type === 'kick' ? 42 : 60),
        y: position?.y ?? p.y - (type === 'kick' ? 35 : 140),
        sprite: 'm_hit',
        sx: 1,
        sy: 1,
        angle: 0,
      };
    for (const e of [...this.actors]) {
      if (!e.alive || !e.sprite || !overlaps(hit, e)) continue;
      if (isEnemy(e) && (e.kind !== 'warrior' || type === 'punch')) this.kill(e, type === 'kick');
      if (e.kind === 'box' && !e.kicked) {
        e.sprite = this.choose(['s_box_roll1', 's_box_roll2']);
        e.frame = 0;
        e.imageSpeed = 0.5;
        e.sx = p.sx;
        e.kicked = true;
      }
      if (e.kind === 'wheel' && e.active && !e.vx) {
        e.vx = 30 * p.sx;
        e.timer2 = 5;
      }
      if (e.kind === 'sheepball' && type === 'kick') this.kickBall(e);
    }
  }
  animate(e: Actor) {
    if (!e.alive || !e.sprite || !e.imageSpeed) return;
    const count = assets.sprites[e.sprite]!.frames.length;
    e.frame += e.imageSpeed;
    if (e.frame + 1e-9 < count) return;
    e.frame %= count;
    if (e.kind === 'player' && (e.action === 'punch' || e.action === 'kick')) {
      e.sprite = 's_stickman_stand';
      e.imageSpeed = 0.5;
      e.action = 'stand';
      this.move(this.inputDirection());
      const q = e.queued;
      e.queued = null;
      if (e.action === 'stand' && q) this.attack(q);
    } else if (e.kind === 'dead' || e.kind === 'smoke') e.alive = false;
    else if (e.kind === 'deadplayer' || e.kind === 'box') {
      e.imageSpeed = 0;
      e.frame = count - 1;
    } else if (isEnemy(e) && e.kind !== 'sheep') e.sprite = animations[e.kind][0];
  }
  timer(e: Actor) {
    if (e.timer > 0 && --e.timer === 0) {
      if (e.kind === 'sheep') e.canJump = true;
      if (['wheel', 'sheepball', 'hp', 'shield', 'bonus'].includes(e.kind)) e.active = true;
      if (e.kind === 'swing') e.alive = false;
      if (e.kind === 'plank') e.alphaLoss = 0.01;
      if (e.kind === 'mud') e.alphaLoss = 0.005;
      if (e.kind === 'deadplayer') {
        const kind = this.choose(['bean', 'sheep', 'oct', 'warrior'] as const),
          dir = this.choose([-1, 1]);
        const extra = this.create('extra', dir === 1 ? -200 : WORLD_WIDTH + 200, GROUND, animations[kind][1]);
        extra.sx = dir;
        extra.vx =
          dir *
          (kind === 'bean'
            ? 5
            : kind === 'sheep'
              ? 7 + this.int(4)
              : kind === 'oct'
                ? 2 + this.int(2)
                : 4 + this.int(2));
        extra.depth = 90;
        e.timer = 30 + this.int(30);
      }
    }
    if (e.timer2 > 0 && --e.timer2 === 0) {
      this.smoke(e.x, e.y);
      e.timer2 = 5;
    }
  }
  enemyStep(e: Actor & { kind: EnemyKind }) {
    if (e.kind === 'sheep') {
      if (this.player.alive && e.canJump) {
        e.sx = facing(this.player.x, e.x);
        e.vx = e.sp * e.sx;
        if (Math.sign(this.player.x - e.x) === e.sx && Math.abs(e.x - this.player.x) < e.range) {
          e.vx *= 1.3;
          e.vy = -10;
          e.needHit = true;
          e.timer = 100;
          e.canJump = false;
        }
      }
      if (e.y < GROUND) e.vy += 0.6;
      else if (e.y > GROUND) {
        e.vy = 0;
        e.y = GROUND;
      }
      e.angle = e.vy * 3 * -Math.sign(e.sx);
      return;
    }
    if (e.sprite === 's_oct_create') {
      if (e.frame >= 47) e.mask = 's_oct_stand';
      return;
    }
    if (this.player.alive) {
      e.sx = facing(this.player.x, e.x);
      if (e.needHit && e.sprite === animations[e.kind][2] && e.frame >= e.attackPoint) {
        this.damage();
        e.needHit = false;
        e.unlocked = false;
        e.imageSpeed = 0.5;
        if (e.kind === 'warrior') {
          const s = this.create('swing', e.x, e.y, 's_swing');
          s.sx = e.sx;
          s.timer = 5;
          s.depth = -45;
        }
      }
    } else e.sx = -facing(this.player.x, e.x);
    e.vx = e.speed * e.sx;
  }
  enemyEnd(e: Actor & { kind: EnemyKind }) {
    if (e.kind === 'sheep') {
      if (e.y === GROUND) {
        e.sprite = 's_sheep_run';
        e.imageSpeed = 0.5;
      } else {
        e.sprite = 's_sheep_jump';
        e.imageSpeed = 0;
        e.frame = e.y < GROUND - 70 ? 1 : 0;
      }
      const p = this.player;
      if (
        e.needHit &&
        e.sprite === 's_sheep_jump' &&
        p.sprite !== 's_stickman_run' &&
        !(p.sprite === 's_stickman_punch' && p.sx !== e.sx) &&
        Math.abs(p.x - e.x) < 40
      ) {
        this.damage();
        e.needHit = false;
      }
      return;
    }
    if (e.sprite === 's_oct_create') return;
    const side = Math.sign(e.x - this.player.x);
    if ((e.kind === 'oct' || e.kind === 'warrior') && e.needHit && e.previousSide !== side) {
      e.unlocked = true;
      e.imageSpeed = 1;
    }
    e.speed = !this.player.alive || (Math.abs(this.player.x - e.x) > e.range && !e.unlocked) ? e.sp : 0;
    const sprite = animations[e.kind][e.speed === 0 ? 2 : 1];
    if (e.sprite !== sprite) {
      e.sprite = sprite;
      e.frame = 0;
      if (!e.speed) e.needHit = true;
    }
    if (e.kind === 'bean' && e.wait) {
      e.sprite = animations.bean[0];
      e.speed = 0;
    }
    e.previousSide = side;
  }
  stepActor(e: Actor) {
    e.age++;
    if (isEnemy(e)) {
      this.enemyStep(e);
      return;
    }
    if (e.kind === 'player') {
      if (e.needHit && e.frame >= (e.action === 'kick' ? 4 : 6)) {
        const type = e.action as Attack;
        this.pendingHits.push({
          type,
          x: e.x + e.sx * (type === 'kick' ? 42 : 60),
          y: e.y - (type === 'kick' ? 35 : 140),
        });
        e.needHit = false;
        if (e.headBox?.alive) this.breakBox(e.headBox);
        e.headBox = null;
      }
      if (this.lives <= 0) {
        this.die();
        return;
      }
      if (e.action === 'run') e.speed = Math.min(PLAYER_SPEED, e.speed + PLAYER_ACCELERATION);
      if (e.friction) e.speed = Math.sign(e.speed) * Math.max(0, Math.abs(e.speed) - e.friction);
      e.vx = e.speed * e.sx;
    } else if (e.kind === 'intro') {
      e.vx = facing(this.player.x, e.x) * PLAYER_SPEED;
      if (Math.abs(e.x - this.player.x) < PLAYER_SPEED) {
        this.player.visible = true;
        e.alive = false;
        this.move(this.inputDirection());
      }
      if (Math.round(e.frame) === 2) this.sound('grass', 4);
    } else if (e.kind === 'box') {
      if (e.vy) e.vy += 1;
      if (e.y > GROUND) {
        e.y = GROUND;
        e.vy = 0;
        e.imageSpeed = 0.5;
        this.sound('impact', 5);
      }
      if (e.kicked) {
        if (e.frame > 11) {
          e.x += e.sx * 210;
          this.breakBox(e);
          return;
        }
        e.hitX += e.sx * 10;
        const target = this.actors.find((t) => t.alive && isEnemy(t) && contains(t, e.hitX, GROUND - 15));
        if (target) {
          e.x = e.hitX;
          this.breakBox(e);
          if (target.kind !== 'warrior') this.kill(target);
        }
      }
      if (e.sprite === 's_box2' && e.frame === 9) this.sound('impact', 5);
    } else if (e.kind === 'wheel' || e.kind === 'sheepball') {
      const level = GROUND - (e.kind === 'wheel' ? 45 : 30),
        limit = e.kind === 'wheel' ? 10 : 3;
      if (e.y < level) e.vy += 1;
      else if (e.y > level) {
        e.y = level;
        if (e.vy < limit || (e.kind === 'wheel' && !!e.vx)) e.vy = 0;
        e.vy *= -0.65;
      }
      if (e.vx) e.angle -= Math.sign(e.vx) * (e.kind === 'wheel' ? 20 : 10);
      // Original cleanup belongs to Outside Room, not Outside View. Bodies
      // inside the level must survive camera movement and viewport resizing.
      if (e.x < -1000 || e.x > WORLD_WIDTH + 1000) e.alive = false;
    } else if (['hp', 'shield', 'bonus'].includes(e.kind)) {
      e.pulse = (e.pulse + 4) % 360;
      e.y = e.startY + Math.floor(-Math.sin((e.pulse * Math.PI) / 180) * 20);
    } else if (e.kind === 'fade') {
      e.alpha -= 0.1;
      e.sx += 0.1;
      e.sy += 0.1;
    } else if (e.kind === 'plank') {
      e.angle += e.rotate;
      if (e.y < GROUND) e.vy += 1;
      if (e.y > GROUND) {
        e.y = GROUND;
        e.vy = e.vx = e.rotate = 0;
      }
    } else if (e.kind === 'mud') {
      if (e.imageSpeed > 0 && e.frame >= e.lastFrame) {
        e.imageSpeed = 0;
        e.frame = e.lastFrame;
        e.timer = 200 + this.int(300);
      }
    } else if (e.kind === 'skull') {
      if (!this.guiVisible) return;
      if (e.sx < 1) e.sx = e.sy = e.sx + 0.25;
      if (e.falling) {
        e.angle += e.rotate;
        e.vy += 1;
      }
      if (e.y > HEIGHT + 50 || e.x < -50 || e.x > this.width + 50) e.alive = false;
    } else if (e.kind === 'deadplayer') this.grayscale = Math.min(1, this.grayscale + 0.01);
    else if (e.kind === 'extra' && (e.x < -200 || e.x > WORLD_WIDTH + 200)) e.alive = false;
    e.alpha -= e.alphaLoss;
    if (e.alpha <= 0 || (e.kind === 'float' && e.y < -300)) e.alive = false;
  }
  collisions() {
    const living = this.actors.filter((e) => e.alive);
    for (const e of living) {
      if (e.kind === 'bean')
        e.wait = living.some(
          (t) =>
            t !== e && t.kind === 'bean' && (e.sp < t.sp || (e.sp === t.sp && e.id > t.id)) && overlaps(e, t),
        );
      if ((e.kind === 'wheel' && e.vx) || (e.kind === 'sheepball' && e.vx && e.alpha === 1)) {
        for (const o of living) {
          if (!o.alive || !o.sprite || !overlaps(e, o)) continue;
          if (e.kind === 'wheel') {
            if (isEnemy(o)) this.kill(o);
            if (o.kind === 'box' && !o.kicked) this.breakBox(o);
          } else if (isEnemy(o) && (o.sx !== e.sx || o.kind === 'sheep' || o.sprite === 's_oct_create')) {
            e.vx = -15 * Math.sign(e.vx);
            e.vy = -15;
            e.alphaLoss = 0.1;
            e.alpha -= e.alphaLoss;
            if (o.kind !== 'warrior') this.kill(o);
            break;
          }
        }
      }
      if (
        this.player.alive &&
        e.active &&
        ['hp', 'shield', 'bonus'].includes(e.kind) &&
        overlaps(e, this.player) &&
        (e.kind !== 'hp' || this.lives <= 7)
      ) {
        e.alive = false;
        const f = this.create('fade', e.x, e.y, e.sprite);
        f.depth = -100;
        if (e.kind === 'hp') this.addLives(3);
        if (e.kind === 'shield') {
          if (!this.shield) this.hudFlash = 1;
          this.shield += 300;
        }
        if (e.kind === 'bonus') this.bonus += 300;
      }
    }
  }
  updateTutorial(previousX: number) {
    const t = this.tutorial;
    if (!t) return;
    if (!t.move) {
      const d = this.player.x - previousX;
      if (d > 0) t.right += d;
      else t.left += d;
      if (t.left < -400 && t.right > 400) {
        t.move = true;
        this.guiVisible = this.canSpawn = true;
      }
    }
    if (t.teaching && !t.teaching.alive) {
      t.taught.add(t.teaching.kind as EnemyKind);
      t.teaching = null;
    }
    t.pulse = (t.pulse + 7) % 360;
    t.alpha = clamp(t.alpha + (!t.move || t.teaching?.alive ? 0.05 : -0.05), 0, 1);
  }
  tick() {
    if (this.paused) {
      this.pauseOpaque = Math.min(0.7, this.pauseOpaque + 0.07);
      return;
    }
    this.tickCount++;
    const previousX = this.player.x;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 1;
    for (const e of [...this.actors]) if (e.alive) this.timer(e);
    if (this.canSpawn) this.spawnStep();
    if (this.guiVisible) this.guiShift = Math.min(0, this.guiShift + 4);
    this.windmill = (this.windmill + 0.1) % 360;
    const target = clamp(this.player.x - Math.floor(this.width / 2), 0, WORLD_WIDTH - this.width);
    const cameraMove = Math.sign(target - this.camera) * Math.round(Math.abs(target - this.camera) / 6);
    for (const e of [...this.actors]) if (e.alive) this.stepActor(e);
    for (const e of this.actors)
      if (e.alive) {
        e.x += e.vx;
        e.y += e.vy;
      }
    this.camera += cameraMove;
    // GML creates hit instances during Step; collision events run after motion.
    for (const hit of this.pendingHits) this.hit(hit.type, hit);
    this.pendingHits = [];
    this.collisions();
    const p = this.player;
    if (p.alive) {
      p.color = this.shield > 0 ? 0xffffff : 0;
      if (p.action === 'stand') p.sprite = 's_stickman_stand';
      if (p.action === 'run') p.sprite = 's_stickman_run';
      if (p.x < 100 || p.x > WORLD_WIDTH - 100) {
        const out = p.x < 100 ? p.sx === -1 : p.sx === 1;
        p.x = clamp(p.x, 100, WORLD_WIDTH - 100);
        p.speed = p.vx = 0;
        if (out) {
          p.action = 'stand';
          p.sprite = 's_stickman_stand';
        }
      }
      if (p.visible && p.sprite === 's_stickman_run' && Math.round(p.frame) === 2) this.sound('grass', 4);
      if (
        p.visible &&
        ['s_stickman_punch', 's_stickman_kick'].includes(p.sprite) &&
        Math.round(p.frame) === 3
      )
        this.sound('swing', 3);
    }
    for (const e of this.actors) if (e.alive && isEnemy(e)) this.enemyEnd(e);
    this.viewX = this.camera + (this.shake > 0 ? this.shakeDirection * this.shake : 0);
    this.shakeDirection *= -1;
    this.shake = Math.max(0, this.shake - 1);
    this.guiScore = Math.min(this.score, this.guiScore + 10);
    if (this.guiScore + 1000 < this.score) this.guiScore = this.score - 1000;
    if (this.shield > 0 && --this.shield === 0) this.hudFlash = 1;
    if (this.bonus > 0) this.bonus--;
    this.hudBonusPush = clamp(this.hudBonusPush + (this.bonus > 0 ? 4 : -4), 0, 50);
    this.hudFlash = Math.max(0, this.hudFlash - 0.12);
    this.bonusSign = Math.max(0, this.bonusSign - 0.05);
    this.pauseAlpha = clamp(this.pauseAlpha + (this.started && p.alive ? 0.05 : -0.05), 0, 1);
    if (this.started) {
      this.menuAlpha = Math.max(0, this.menuAlpha - 0.1);
      if (!this.logoSpeed) this.logoSpeed = 10;
      this.logoSpeed += 2;
      this.logoX += this.logoSpeed;
    }
    this.updateTutorial(previousX);
    for (const e of [...this.actors]) this.animate(e);
    this.actors = this.actors.filter((e) => e.alive);
    if (!p.alive && ++this.deathTicks === 120) {
      this.needsName = this.score > 0;
      if (!this.needsName) this.mode = 'scores';
    }
  }
  advance(seconds: number) {
    this.accumulator += Math.min(seconds, 0.25);
    while (this.accumulator + 1e-10 >= STEP) {
      this.tick();
      this.accumulator -= STEP;
    }
  }
}
