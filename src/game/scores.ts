export const SCORE_KEY = 'stickarcade.highscores.v1',
  NAME_KEY = 'stickarcade.player-name';
export interface Score {
  name: string;
  score: number;
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class Scoreboard {
  entries: Score[];
  name = '';
  constructor(private storage?: StorageLike) {
    let entries: Score[] = [];
    try {
      const raw: unknown = JSON.parse(storage?.getItem(SCORE_KEY) || '[]');
      if (Array.isArray(raw))
        entries = raw
          .filter(
            (s): s is Score =>
              s && typeof s.name === 'string' && Number.isSafeInteger(s.score) && s.score >= 0,
          )
          .slice(0, 10);
      this.name = storage?.getItem(NAME_KEY) || '';
    } catch {
      /* Corrupt or unavailable storage must not prevent play. */
    }
    this.entries = entries.sort((a, b) => b.score - a.score);
    while (this.entries.length < 10) this.entries.push({ name: '<nobody>', score: 0 });
  }
  add(name: string, score: number) {
    this.name = name.trim() || 'Player';
    // Match the original insertion rule: a new tie precedes existing ties.
    this.entries = [{ name: this.name, score }, ...this.entries]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    this.persist();
  }
  persist() {
    try {
      this.storage?.setItem(SCORE_KEY, JSON.stringify(this.entries));
      this.storage?.setItem(NAME_KEY, this.name);
    } catch {
      /* Retain the in-memory board when storage is disabled/full. */
    }
  }
}
