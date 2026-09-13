import { assets, assetUrl } from './assets';
export class GameAudio {
  context: AudioContext | null = null;
  enabled = true;
  private output: GainNode | null = null;
  bytes = new Map<string, ArrayBuffer>();
  buffers = new Map<string, AudioBuffer>();
  async preload() {
    await Promise.all(
      Object.entries(assets.sounds).map(async ([name, path]) => {
        try {
          const response = await fetch(assetUrl(path));
          if (response.ok) {
            this.bytes.set(name, await response.arrayBuffer());
            // A keyboard gesture can unlock audio before loading finishes.
            await this.decode(name);
          }
        } catch {
          /* Sound failure does not block play. */
        }
      }),
    );
  }
  private async decode(name: string) {
    const context = this.context;
    const data = this.bytes.get(name);
    if (!context || !data) return;
    try {
      const buffer = await context.decodeAudioData(data.slice(0));
      if (this.context === context) this.buffers.set(name, buffer);
    } catch (error) {
      console.warn(`Unable to decode sound ${name}`, error);
    }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.output) this.output.gain.value = enabled ? 1 : 0;
  }
  unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.gain.value = this.enabled ? 1 : 0;
      this.output.connect(this.context.destination);
      for (const name of this.bytes.keys()) void this.decode(name);
    }
    void this.context.resume().catch((error) => console.warn('Unable to resume audio', error));
  }
  play(names: string[]) {
    if (!this.enabled || !this.context || !this.output || this.context.state !== 'running') return;
    for (const name of names) {
      const buffer = this.buffers.get(name);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.output);
      source.start();
    }
  }
  dispose() {
    void this.context?.close();
    this.context = null;
    this.output = null;
    this.buffers.clear();
  }
}
