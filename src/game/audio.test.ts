import { afterEach, expect, mock, test } from 'bun:test';
import { GameAudio } from './audio';

const originalContext = globalThis.AudioContext;
const originalFetch = globalThis.fetch;
const audio = new GameAudio();
const gain = { gain: { value: 1 }, connect: mock(() => {}) };
const source = { buffer: null, connect: mock(() => {}), start: mock(() => {}) };
const decode = mock(async () => ({}) as AudioBuffer);

function installContext() {
  globalThis.AudioContext = class {
    state = 'running';
    destination = {};
    createGain = () => gain;
    createBufferSource = () => source;
    decodeAudioData = decode;
    resume = async () => {};
    close = async () => {};
  } as unknown as typeof AudioContext;
}

afterEach(() => {
  audio.dispose();
  audio.bytes.clear();
  audio.setEnabled(true);
  decode.mockClear();
  source.start.mockClear();
  globalThis.AudioContext = originalContext;
  globalThis.fetch = originalFetch;
});

test('sounds loaded after an early unlock are decoded and playable by default', async () => {
  installContext();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  globalThis.fetch = mock(async () => {
    await pending;
    return new Response(new Uint8Array([1, 2]));
  }) as unknown as typeof fetch;
  const loading = audio.preload();
  audio.unlock();
  expect(decode).not.toHaveBeenCalled();
  finish();
  await loading;
  expect(audio.buffers.size).toBeGreaterThan(0);
  audio.play(['snd_swing1']);
  expect(source.start).toHaveBeenCalledTimes(1);
});

test('unlock decodes preloaded audio, and muting silences current and future effects', async () => {
  installContext();
  audio.bytes.set('snd_swing1', new ArrayBuffer(2));
  audio.unlock();
  await Promise.resolve();
  audio.play(['snd_swing1']);
  expect(source.start).toHaveBeenCalledTimes(1);
  audio.setEnabled(false);
  expect(gain.gain.value).toBe(0);
  audio.play(['snd_swing1']);
  expect(source.start).toHaveBeenCalledTimes(1);
  audio.setEnabled(true);
  expect(gain.gain.value).toBe(1);
  audio.play(['snd_swing1']);
  expect(source.start).toHaveBeenCalledTimes(2);
});
