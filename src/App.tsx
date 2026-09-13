import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { assets, assetUrl, HEIGHT, layout, TOUCH_THRESHOLD } from './game/assets';
import { Game } from './game/engine';
import { Scoreboard } from './game/scores';
import { GameAudio } from './game/audio';
import { buttons, GameRenderer, type GameButton } from './game/render';

function Scene({
  game,
  textures,
  audio,
  update,
  requestName,
}: {
  game: Game;
  textures: THREE.Texture[];
  audio: GameAudio;
  update: () => void;
  requestName: () => Promise<string | null>;
}) {
  const renderer = useMemo(() => new GameRenderer(textures), [textures]);
  const fingerprint = useRef('');
  const asking = useRef(false);
  useEffect(() => () => renderer.dispose(), [renderer]);
  useFrame(({ gl }, delta) => {
    if (!document.hidden && !asking.current) game.advance(delta);
    audio.play(game.sounds.splice(0));
    renderer.render(gl, game);
    const next = [
      game.mode,
      game.started,
      game.paused,
      game.guiVisible,
      game.guiShift,
      game.player.visible,
      game.player.alive,
      game.width,
      game.mobile,
    ].join(':');
    if (next !== fingerprint.current) {
      fingerprint.current = next;
      update();
    }
    if (game.needsName && !asking.current) {
      asking.current = true;
      // The original game also asks for a name after the death animation.
      void requestName().then((name) => {
        game.saveName(name);
        game.accumulator = 0;
        asking.current = false;
        update();
      });
    }
  }, 1);
  return null;
}
export default function App() {
  const [size, setSize] = useState(() => layout(window.innerWidth, window.innerHeight));
  const game = useMemo(() => {
    let board: Scoreboard;
    try {
      board = new Scoreboard(window.localStorage);
    } catch {
      board = new Scoreboard();
    }
    return new Game(size.logicalWidth, board);
  }, []);
  const audio = useMemo(() => new GameAudio(), []);
  const [textures, setTextures] = useState<THREE.Texture[] | null>(null);
  const [, refresh] = useState(0);
  const update = () => refresh((n) => n + 1);
  const stage = useRef<HTMLDivElement>(null);
  const gestures = useRef(new Map<number, { anchor: number; movement: boolean }>());
  const [dialog, setDialog] = useState<'name' | 'leave' | null>(null);
  const answer = useRef<(value: string | null) => void>(() => {});
  const requestName = () =>
    new Promise<string | null>((resolve) => {
      answer.current = resolve;
      setDialog('name');
    });
  const closeDialog = (value: string | null) => {
    if (dialog === 'name') answer.current(value);
    if (dialog === 'leave' && value !== null) game.reset();
    setDialog(null);
    update();
  };
  useEffect(() => {
    // Read-only diagnostics for checking this port against the GMX source.
    // Vite removes this branch from production builds.
    if (!import.meta.env.DEV) return;
    const host = window as unknown as { stickarcadeSnapshot?: () => unknown };
    host.stickarcadeSnapshot = () => ({
      mode: game.mode,
      tick: game.tickCount,
      width: game.width,
      camera: game.camera,
      score: game.score,
      lives: game.lives,
      killed: game.killed,
      paused: game.paused,
      popIndex: game.popIndex,
      canSpawn: game.canSpawn,
      tutorial: game.tutorial
        ? {
            move: game.tutorial.move,
            left: game.tutorial.left,
            right: game.tutorial.right,
            taught: [...game.tutorial.taught],
            type: game.tutorial.type,
          }
        : null,
      player: {
        x: game.player.x,
        y: game.player.y,
        speed: game.player.speed,
        sx: game.player.sx,
        frame: game.player.frame,
        sprite: game.player.sprite,
        visible: game.player.visible,
      },
      actors: game.actors
        .filter((e) => !['skull', 'mud', 'float', 'plank', 'smoke'].includes(e.kind))
        .map((e) => ({ kind: e.kind, x: e.x, y: e.y, sprite: e.sprite, frame: e.frame })),
    });
    return () => {
      delete host.stickarcadeSnapshot;
    };
  }, [game]);
  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    Promise.all([Promise.all(assets.pages.map((path) => loader.loadAsync(assetUrl(path)))), audio.preload()])
      .then(([maps]) => {
        loaded = maps;
        for (const texture of maps) {
          texture.colorSpace = THREE.NoColorSpace;
          texture.generateMipmaps = false;
          texture.minFilter = texture.magFilter = THREE.LinearFilter;
        }
        if (cancelled) maps.forEach((t) => t.dispose());
        else setTextures(maps);
      })
      .catch((error) => console.error('Unable to load the original game assets', error));
    return () => {
      cancelled = true;
      loaded.forEach((t) => t.dispose());
      audio.dispose();
    };
  }, [audio]);
  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const resize = () => {
      const next = layout(window.innerWidth, window.innerHeight);
      game.resize(next.logicalWidth);
      game.mobile = media.matches || navigator.maxTouchPoints > 0;
      setSize(next);
      update();
    };
    resize();
    window.addEventListener('resize', resize);
    media.addEventListener('change', resize);
    const handled = (key: string) =>
      ['ArrowLeft', 'ArrowRight', 's', 'S', 'd', 'D', 'Escape', 'Backspace', 'Enter'].includes(key);
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('dialog')) return;
      if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
      if (!handled(event.key)) return;
      event.preventDefault();
      audio.unlock();
      game.keyDown(event.key);
      update();
    };
    const up = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('dialog')) return;
      if (!handled(event.key)) return;
      event.preventDefault();
      game.keyUp(event.key);
    };
    const blur = () => {
      game.clearInput();
      game.move(0);
      gestures.current.clear();
      game.pause();
      update();
    };
    const visibility = () => {
      if (document.hidden) blur();
      game.accumulator = 0;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('resize', resize);
      media.removeEventListener('change', resize);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [game, audio]);
  const action = (id: string) => {
    audio.unlock();
    if (id === 'sound') audio.setEnabled(!audio.enabled);
    if (id === 'play') game.start();
    if (id === 'tutorial') game.start(true);
    if (id === 'scores') game.showScores();
    if (id === 'pause') game.pause();
    if (id === 'continue') game.resume();
    if (id === 'menu') game.backFromScores();
    if (id === 'back') setDialog('leave');
    if (id === 'punch' || id === 'kick') game.attack(id);
    if (id === 'facebook')
      window.open(
        'https://www.facebook.com/sharer/sharer.php?u=https://www.facebook.com/pages/Stickarcade/548982765215083',
        '_blank',
        'noopener,noreferrer',
      );
    if (id === 'twitter')
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just achieved ${game.score || game.board.entries[0]!.score} score in #StickArcade! https://www.facebook.com/pages/Stickarcade/548982765215083`)}`,
        '_blank',
        'noopener,noreferrer',
      );
    update();
  };
  const point = (event: React.PointerEvent) => {
    const rect = stage.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * game.width) / rect.width,
      y: ((event.clientY - rect.top) * HEIGHT) / rect.height,
    };
  };
  const startGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || game.paused || game.mode !== 'playing') return;
    audio.unlock();
    if (event.pointerType === 'touch') {
      game.mobile = true;
      update();
    }
    const p = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    const movement = p.x < game.width / 2;
    gestures.current.set(event.pointerId, { anchor: p.x, movement });
    if (!movement) game.attack(p.y < GROUND_LINE ? 'punch' : 'kick');
  };
  const moveGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestures.current.get(event.pointerId);
    if (!gesture?.movement) return;
    const p = point(event),
      delta = p.x - gesture.anchor;
    if (Math.abs(delta) > TOUCH_THRESHOLD) {
      const direction = Math.sign(delta);
      gesture.anchor = p.x - direction * TOUCH_THRESHOLD;
      game.touchMove(direction);
    }
  };
  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasMoving = gestures.current.get(event.pointerId)?.movement;
    gestures.current.delete(event.pointerId);
    if (wasMoving && !Array.from(gestures.current.values()).some((g) => g.movement)) game.touchMove(0);
  };
  return (
    <main>
      <div
        ref={stage}
        className="game"
        role="application"
        aria-label="StickArcade. Left and right arrows to move, S to punch, D to kick. On touch screens, swipe the left side to move and use the punch and kick buttons."
        style={{ width: size.width, height: size.height }}
        onPointerDown={startGesture}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onContextMenu={(event) => event.preventDefault()}
      >
        {textures && (
          <Canvas
            orthographic
            camera={{ position: [0, 0, 10] }}
            dpr={[1, 2]}
            gl={{
              antialias: false,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.NoToneMapping,
            }}
          >
            <Scene game={game} textures={textures} audio={audio} update={update} requestName={requestName} />
          </Canvas>
        )}
        {textures &&
          buttons(game).map((button) => (
            <OriginalButton key={button.id} button={button} scale={size.scale} action={action} />
          ))}
        {textures && (game.mode === 'menu' || game.paused) && (
          <button
            type="button"
            className="sound-button"
            aria-label="Sound"
            aria-pressed={audio.enabled}
            title={audio.enabled ? 'Mute sound' : 'Enable sound'}
            style={{
              right: 16 * size.scale,
              bottom: 16 * size.scale,
              width: 48 * size.scale,
              height: 48 * size.scale,
              padding: 10 * size.scale,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              action('sound');
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M9 18V5l12-2v13M9 9l12-2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <ellipse cx="6" cy="18" rx="3" ry="2.5" fill="currentColor" />
              <ellipse cx="18" cy="16" rx="3" ry="2.5" fill="currentColor" />
              {!audio.enabled && (
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        )}
      </div>
      {dialog && <OriginalDialog kind={dialog} name={game.board.name} close={closeDialog} />}
    </main>
  );
}
function OriginalDialog({
  kind,
  name,
  close,
}: {
  kind: 'name' | 'leave';
  name: string;
  close: (value: string | null) => void;
}) {
  const element = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    element.current?.showModal();
  }, []);
  const label = kind === 'name' ? 'Your name is:' : 'Are you sure? Your progress will be lost.';
  return (
    <dialog
      ref={element}
      className="original-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        close(null);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          close(kind === 'name' ? input.current?.value || '' : 'yes');
        }}
      >
        <label htmlFor="player-name">{label}</label>
        {kind === 'name' && (
          <input
            id="player-name"
            ref={input}
            defaultValue={name}
            autoFocus
            maxLength={80}
            autoComplete="nickname"
          />
        )}
        <div className="dialog-buttons">
          <button type="submit">OK</button>
          <button type="button" onClick={() => close(null)}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
const GROUND_LINE = 380 - 70;
function OriginalButton({
  button,
  scale,
  action,
}: {
  button: GameButton;
  scale: number;
  action: (id: string) => void;
}) {
  const s = assets.sprites[button.sprite]!,
    factor = button.scale || 1;
  return (
    <button
      className="original-button"
      aria-label={button.label}
      style={{
        left: (button.x - s.originX * factor) * scale,
        top: (button.y - s.originY * factor) * scale,
        width: s.width * factor * scale,
        height: s.height * factor * scale,
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (button.press) {
          event.preventDefault();
          action(button.id);
        }
      }}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (!button.press || event.detail === 0) action(button.id);
      }}
    />
  );
}
