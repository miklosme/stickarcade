import { assets, assetUrl } from './assets';
export class GameAudio {
  context: AudioContext | null = null;
  bytes = new Map<string, ArrayBuffer>();
  buffers = new Map<string, AudioBuffer>();
  async preload() {
    await Promise.all(
      Object.entries(assets.sounds).map(async ([name, path]) => {
        try {
          const response = await fetch(assetUrl(path));
          if (response.ok) this.bytes.set(name, await response.arrayBuffer());
        } catch {
          /* Sound failure does not block play. */
        }
      }),
    );
  }
  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      for (const [name, data] of this.bytes)
        this.context
          .decodeAudioData(data.slice(0))
          .then((buffer) => this.buffers.set(name, buffer))
          .catch(() => {});
    }
    void this.context.resume();
  }
  play(names: string[]) {
    if (!this.context || this.context.state !== 'running') return;
    for (const name of names) {
      const buffer = this.buffers.get(name);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start();
    }
  }
  dispose() {
    void this.context?.close();
  }
}
