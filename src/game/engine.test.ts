import { describe, expect, test } from 'bun:test';
import { assets, bounds, contains, intersectsLine, layout, overlaps } from './assets';
import { Game, isEnemy } from './engine';
import { NAME_KEY, SCORE_KEY, Scoreboard, type StorageLike } from './scores';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
function ready(random = () => 0.5) {
  const game = new Game(853, new Scoreboard(), random);
  game.start();
  game.tutorial = null;
  game.guiVisible = true;
  game.canSpawn = false;
  game.actors = game.actors.filter((e) => e.kind !== 'intro');
  game.player.visible = true;
  return game;
}
function ticks(g: Game, n: number) {
  for (let i = 0; i < n; i++) g.tick();
}

describe('Original coordinate and timing contracts', () => {
  test('imports every original sprite, animation, and room dimension', () => {
    expect(assets.room).toEqual({ width: 2000, height: 480, speed: 30 });
    expect(Object.keys(assets.sprites)).toHaveLength(74);
    expect(Object.values(assets.sprites).reduce((n, s) => n + s.frames.length, 0)).toBe(488);
    for (const s of Object.values(assets.sprites))
      for (const frame of s.frames) {
        expect(frame.w).toBe(s.width);
        expect(frame.h).toBe(s.height);
      }
    expect(assets.waves.startsWith('0000A00000A0001')).toBe(true);
    expect(assets.waves.endsWith('BBB')).toBe(true);
  });
  test('player spawns at (1000,380) with the manually designed narrow mask', () => {
    const g = ready();
    expect([g.player.x, g.player.y]).toEqual([1000, 380]);
    expect(bounds(g.player)).toEqual({ left: 990, right: 1010, top: 211, bottom: 379 });
    g.player.sprite = 's_stickman_punch';
    expect(bounds(g.player)).toEqual({ left: 990, right: 1010, top: 211, bottom: 379 });
    expect(contains(g.player, 1011, 250)).toBe(false);
  });
  test('asymmetric masks mirror around their original origins', () => {
    const g = ready(),
      bean = g.spawnEnemy('bean', 1000);
    expect(bounds(bean)).toEqual({ left: 985, right: 1013, top: 334, bottom: 379 });
    bean.sx = -1;
    expect(bounds(bean)).toEqual({ left: 987, right: 1015, top: 334, bottom: 379 });
  });
  test('movement accelerates by 1.5 each step to 15; release decelerates', () => {
    const g = ready();
    g.keyDown('ArrowRight');
    ticks(g, 10);
    expect(g.player.speed).toBe(15);
    expect(g.player.x).toBe(1082.5);
    ticks(g, 20);
    expect(g.player.x).toBe(1382.5);
    g.keyUp('ArrowRight');
    ticks(g, 10);
    expect(g.player.x).toBe(1450);
    expect(g.player.speed).toBe(0);
  });
  test('turning preserves momentum before accelerating back', () => {
    const g = ready();
    g.keyDown('ArrowRight');
    ticks(g, 10);
    g.keyDown('ArrowLeft');
    g.tick();
    expect(g.player.sx).toBe(-1);
    expect(g.player.speed).toBe(-13.5);
    expect(g.player.x).toBe(1096);
  });
  test('world boundaries remain 100 and 1900 at every viewport size', () => {
    for (const w of [640, 853, 1040, 1800]) {
      const g = ready();
      g.resize(w);
      g.keyDown('ArrowRight');
      ticks(g, 160);
      expect(g.player.x).toBe(1900);
      g.keyUp('ArrowRight');
      g.keyDown('ArrowLeft');
      ticks(g, 220);
      expect(g.player.x).toBe(100);
    }
  });
  test('30, 60, and 144 Hz render loops yield identical simulation positions', () => {
    const positions = [];
    for (const rate of [30, 60, 144]) {
      const g = ready();
      g.keyDown('ArrowRight');
      for (let i = 0; i < rate; i++) g.advance(1 / rate);
      positions.push([g.tickCount, g.player.x]);
    }
    expect(positions).toEqual([
      [30, 1382.5],
      [30, 1382.5],
      [30, 1382.5],
    ]);
  });
  test('camera uses the original one-sixth rounded follow step', () => {
    const g = ready();
    g.player.x = 1300;
    g.tick();
    expect(g.camera).toBe(624);
    const playerBefore = { x: g.player.x, y: g.player.y, speed: g.player.speed };
    g.resize(1040);
    expect({ x: g.player.x, y: g.player.y, speed: g.player.speed }).toEqual(playerBefore);
  });
  test('every screen fits the same 853 × 480 viewport without stretching or cropping', () => {
    for (const [w, h] of [
      [390, 844],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [600, 600],
      [1280, 720],
      [2560, 600],
      [3016, 670],
      [3840, 1080],
    ]) {
      const l = layout(w!, h!);
      expect(l.width).toBeLessThanOrEqual(w! + 0.001);
      expect(l.height).toBeLessThanOrEqual(h! + 0.001);
      expect(l.width / l.logicalWidth).toBeCloseTo(l.height / 480);
      expect(l.logicalWidth).toBe(853);
      // Fill the limiting dimension, leaving the remaining dimension black.
      expect(Math.min(w! - l.width, h! - l.height)).toBeCloseTo(0);
    }
  });
  test('screen resizing preserves camera follow, actor geometry, and spawn positions mid-run', () => {
    const g = ready();
    g.keyDown('ArrowRight');
    ticks(g, 20);
    const camera = g.camera,
      viewX = g.viewX,
      player = { ...g.player },
      mask = bounds(g.player);
    for (const [w, h] of [
      [3016, 670],
      [390, 844],
      [844, 390],
      [1024, 768],
    ]) {
      g.resize(layout(w!, h!).logicalWidth);
      expect(g.camera).toBe(camera);
      expect(g.viewX).toBe(viewX);
      expect(g.player).toEqual(player);
      expect(bounds(g.player)).toEqual(mask);
      g.killed = 0;
      expect(g.spawnEnemy('bean').x).toBe(viewX + 853 + 150);
      g.killed = 1;
      expect(g.spawnEnemy('sheep').x).toBe(viewX - 150);
      expect(g.spawnEnemy('oct').x).toBe(viewX + 426);
    }
  });
});

describe('Combat, waves, and power-ups', () => {
  test('new hit instances collide after enemies move, preserving the GML event phases', () => {
    const g = ready(),
      bean = g.spawnEnemy('bean', 1120);
    bean.sp = 0;
    bean.speed = 30;
    g.attack('kick');
    g.player.frame = 4;
    g.tick();
    expect(bean.x).toBe(1090);
    expect(bean.alive).toBe(false);
    expect(g.score).toBe(100);
  });
  test('crate placement probes a line, including diagonal and zero-length intersections', () => {
    const mask = { x: 0, y: 0, sprite: 'm_hit', sx: 1, sy: 1, angle: 0 };
    expect(intersectsLine(mask, -40, -20, 40, 20)).toBe(true);
    expect(intersectsLine(mask, -40, 20, 40, 20)).toBe(false);
    expect(intersectsLine(mask, 0, 0, 0, 0)).toBe(true);
    expect(intersectsLine(mask, 36, 0, 36, 0)).toBe(false);
  });
  test('kick fires on animation frame 4, not button press; punch is too high for beans', () => {
    const g = ready(),
      bean = g.spawnEnemy('bean', 1042);
    bean.sp = 0;
    g.attack('kick');
    ticks(g, 7);
    expect(bean.alive).toBe(true);
    expect(g.player.frame).toBeCloseTo(4.2);
    g.tick();
    expect(bean.alive).toBe(false);
    expect(g.score).toBe(100);
    const other = ready(),
      low = other.spawnEnemy('bean', 1060);
    low.sp = 0;
    other.attack('punch');
    ticks(other, 13);
    expect(low.alive).toBe(true);
  });
  test('warriors require a punch and punch fires at frame 6', () => {
    const g = ready(),
      warrior = g.spawnEnemy('warrior', 1060);
    warrior.sp = 0;
    g.attack('kick');
    ticks(g, 14);
    expect(warrior.alive).toBe(true);
    g.attack('punch');
    ticks(g, 12);
    expect(warrior.alive).toBe(true);
    g.tick();
    expect(warrior.alive).toBe(false);
  });
  test('hitboxes use +60/-140 and +42/-35 offsets on either side', () => {
    const g = ready();
    const hit = { x: 1060, y: 240, sprite: 'm_hit', sx: 1, sy: 1, angle: 0 };
    expect(bounds(hit)).toEqual({ left: 1024, right: 1095, top: 224, bottom: 255 });
    const enemy = g.spawnEnemy('warrior', 1060);
    expect(overlaps(hit, enemy)).toBe(true);
    g.player.sx = -1;
    const left = g.spawnEnemy('warrior', 940);
    g.hit('punch');
    expect(left.alive).toBe(false);
    expect(enemy.alive).toBe(true);
  });
  test('each enemy retains its authored speed, range, and attack timing', () => {
    const g = ready();
    const bean = g.spawnEnemy('bean'),
      sheep = g.spawnEnemy('sheep'),
      oct = g.spawnEnemy('oct'),
      warrior = g.spawnEnemy('warrior');
    expect([bean.sp, bean.range, bean.attackPoint]).toEqual([7.5, 50, 6]);
    expect([sheep.sp, sheep.range]).toEqual([9, 190]);
    expect([oct.sp, oct.range, oct.attackPoint]).toEqual([6, 100, 13]);
    expect([warrior.sp, warrior.range, warrior.attackPoint]).toEqual([7, 80, 6]);
  });
  test('spawns use viewport edges +/-150 and octopus spawns inside the view', () => {
    const g = ready(() => 0.75);
    g.viewX = 300;
    expect(g.spawnEnemy('bean').x).toBe(1303);
    g.killed = 1;
    expect(g.spawnEnemy('sheep').x).toBe(150);
    expect(g.spawnEnemy('oct').x).toBe(939);
    expect(g.actors.filter(isEnemy).every((e) => e.y === 380)).toBe(true);
  });
  test('octopus switches collision mask at frame 47, before emergence ends', () => {
    const g = ready(),
      oct = g.spawnEnemy('oct', 1700);
    ticks(g, 94);
    expect(oct.mask).toBe('s_oct_create');
    g.tick();
    expect(oct.mask).toBe('s_oct_stand');
  });
  test('sheep jumps at range 190 with -10 vertical velocity and 0.6 gravity', () => {
    const g = ready(),
      sheep = g.spawnEnemy('sheep', 1189);
    g.tick();
    expect(sheep.vx).toBeCloseTo(-11.7);
    expect(sheep.vy).toBe(-10);
    expect(sheep.y).toBe(370);
    g.tick();
    expect(sheep.vy).toBeCloseTo(-9.4);
    expect(sheep.canJump).toBe(false);
  });
  test('combo scores are 100,200,300, with a box on the third kill and 20-step reset', () => {
    const g = ready();
    for (let i = 0; i < 3; i++) g.kill(g.spawnEnemy('bean', 1000));
    expect(g.score).toBe(600);
    expect(g.killed).toBe(3);
    expect(g.boxesDropped).toBe(1);
    expect(g.popGap).toBe(98.5);
    ticks(g, 20);
    expect(g.combo).toBe(1);
  });
  test('crates keep their fixed mask, fall from y=0 and emit one power-up', () => {
    const g = ready(),
      box = g.dropBox();
    expect(box.y).toBe(0);
    expect(box.vy).toBe(10);
    expect(box.mask).toBe('s_box3');
    expect(box.x).toBeGreaterThanOrEqual(300);
    expect(box.x).toBeLessThanOrEqual(1700);
    ticks(g, 30);
    expect(box.y).toBe(380);
    expect(box.vy).toBe(0);
    g.breakBox(box);
    expect(g.actors.filter((e) => ['wheel', 'hp', 'shield', 'bonus'].includes(e.kind))).toHaveLength(1);
    expect(g.actors.filter((e) => e.kind === 'plank')).toHaveLength(13);
  });
  test('head punch opens a settled crate directly at its original probe point', () => {
    const g = ready(),
      box = g.dropBox();
    box.x = 1060;
    box.y = 380;
    box.vy = 0;
    g.attack('punch');
    expect(g.player.sprite).toBe('s_stickman_headup');
    ticks(g, 13);
    expect(box.alive).toBe(false);
  });
  test('shield lasts 300 steps and health pickup only applies at 7 lives or less', () => {
    const g = ready();
    g.shield = 300;
    g.damage();
    expect(g.lives).toBe(10);
    ticks(g, 300);
    g.damage();
    expect(g.lives).toBe(9);
    const hp = g.create('hp', 1000, 300, 's_powerup_hp');
    hp.active = true;
    g.collisions();
    expect(hp.alive).toBe(true);
    g.lives = 7;
    g.collisions();
    expect(hp.alive).toBe(false);
    expect(g.lives).toBe(10);
  });
  test('tutorial requires more than 400 units in both directions', () => {
    const g = ready();
    g.tutorial = {
      move: false,
      left: 0,
      right: 0,
      taught: new Set(),
      teaching: null,
      type: null,
      alpha: 0,
      pulse: 0,
    };
    g.canSpawn = false;
    g.player.x = 1401;
    g.updateTutorial(1000);
    expect(g.tutorial.move).toBe(false);
    g.player.x = 1000;
    g.updateTutorial(1401);
    expect(g.tutorial.move).toBe(true);
    expect(g.canSpawn).toBe(true);
  });
  test('pause freezes game time, positions, and power-up timers', () => {
    const g = ready();
    g.shield = 100;
    g.keyDown('ArrowRight');
    ticks(g, 10);
    g.pause();
    const x = g.player.x,
      tick = g.tickCount;
    ticks(g, 120);
    expect(g.tickCount).toBe(tick);
    expect(g.player.x).toBe(x);
    expect(g.shield).toBe(90);
  });
});

describe('Sheep bodies persist independently of the camera', () => {
  test.each([
    { bodyX: 400, away: 'ArrowRight', back: 'ArrowLeft', edge: 1900 },
    { bodyX: 1600, away: 'ArrowLeft', back: 'ArrowRight', edge: 100 },
  ])('walking to $edge and back preserves the body at $bodyX', ({ bodyX, away, back, edge }) => {
    const g = ready();
    g.player.x = bodyX;
    g.kill(g.spawnEnemy('sheep', bodyX));
    const body = g.actors.find((e) => e.kind === 'sheepball')!;
    g.keyDown(away);
    ticks(g, 200);
    g.keyUp(away);
    expect(g.player.x).toBe(edge);
    expect(body.x < g.viewX || body.x > g.viewX + g.width).toBe(true);
    expect(body.alive).toBe(true);
    expect(g.actors).toContain(body);
    g.keyDown(back);
    for (let i = 0; i < 200 && Math.abs(g.player.x - bodyX) > 15; i++) g.tick();
    g.keyUp(back);
    expect(Math.abs(g.player.x - bodyX)).toBeLessThanOrEqual(15);
    expect(body.alive).toBe(true);
    expect(body.x).toBe(bodyX);
    // It is the same body and can still be used as a projectile on returning.
    g.hit('kick');
    expect(Math.abs(body.vx)).toBe(30);
  });
  test('narrowing the viewport cannot destroy a resting body inside the room', () => {
    const g = ready();
    g.player.x = 1700;
    g.resize(1600);
    g.kill(g.spawnEnemy('sheep', 300));
    const body = g.actors.find((e) => e.kind === 'sheepball')!;
    ticks(g, 60);
    g.resize(640);
    ticks(g, 60);
    expect(body.x).toBeLessThan(g.viewX - 150);
    expect(body.alive).toBe(true);
    expect(body.vx).toBe(0);
  });
});

describe('End-of-game local storage', () => {
  test('death saves once immediately; the original name dialog renames that entry', () => {
    const storage = new MemoryStorage(),
      g = ready();
    g.board = new Scoreboard(storage);
    g.score = 1200;
    g.lives = 0;
    g.tick();
    expect(JSON.parse(storage.getItem(SCORE_KEY)!)[0].score).toBe(1200);
    ticks(g, 130);
    g.saveName('Test player');
    expect(g.board.entries.filter((e) => e.score === 1200)).toHaveLength(1);
    const reloaded = new Scoreboard(storage);
    expect(reloaded.entries[0]).toEqual({ name: 'Test player', score: 1200 });
    expect(storage.getItem(NAME_KEY)).toBe('Test player');
  });
  test('sorts and caps ten scores, inserting a new tie before older ties', () => {
    const s = new Scoreboard(new MemoryStorage());
    for (let i = 0; i < 15; i++) s.add(`P${i}`, i * 100);
    s.add('Tie', 1400);
    expect(s.entries).toHaveLength(10);
    expect(s.entries[0]!.name).toBe('Tie');
    expect(s.entries.at(-1)!.score).toBe(600);
  });
  test('zero-point games are persisted too', () => {
    const st = new MemoryStorage(),
      g = ready();
    g.board = new Scoreboard(st);
    g.lives = 0;
    g.tick();
    expect(st.getItem(SCORE_KEY)).not.toBeNull();
  });
  test('malformed or blocked storage cannot break gameplay', () => {
    const st = new MemoryStorage();
    st.setItem(SCORE_KEY, 'bad json');
    expect(new Scoreboard(st).entries).toHaveLength(10);
    const blocked = {
      getItem() {
        throw Error('denied');
      },
      setItem() {
        throw Error('denied');
      },
    };
    const board = new Scoreboard(blocked);
    expect(() => board.add('Player', 100)).not.toThrow();
    expect(board.entries[0]!.score).toBe(100);
  });
});
