export class AudioPlayer {
  constructor({ createAudio = (url) => new Audio(url), onState = () => {} } = {}) {
    this.createAudio = createAudio;
    this.onState = onState;
    this.audio = null;
    this.generation = 0;
    this.request = 0;
    this.paused = false;
    this.ended = true;
  }

  stop() {
    this.generation += 1;
    this.request += 1;
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    this.ended = true;
    this.paused = false;
    this.onState(false);
  }

  play(url, { rate = 1, repeat = 1, onEnd = () => {}, onError = () => {} } = {}) {
    this.stop();
    const generation = this.generation;
    this.audio = this.createAudio(url);
    this.audio.playbackRate = rate;
    this.ended = false;
    this.onError = onError;
    let played = 0;
    this.audio.onended = () => {
      if (generation !== this.generation || this.paused) return;
      played += 1;
      if (played < repeat) { this.audio.currentTime = 0; this.attempt(); }
      else { this.ended = true; this.onState(false); onEnd(); }
    };
    this.audio.onerror = () => {
      if (generation !== this.generation) return;
      this.ended = true;
      this.onState(false);
      onError(new Error('本地音频无法播放，请重播或跳过；跳过不会计为答错。'));
    };
    this.attempt();
  }

  attempt() {
    const generation = this.generation;
    const request = ++this.request;
    Promise.resolve().then(() => {
      if (generation !== this.generation || request !== this.request || this.paused) return;
      return this.audio.play();
    }).then(() => {
      if (generation === this.generation && request === this.request && !this.paused && !this.ended) this.onState(true);
    }).catch((error) => {
      if (generation !== this.generation || request !== this.request || this.paused) return;
      this.ended = true;
      this.onState(false);
      this.onError(new Error(error?.name === 'NotAllowedError' ? '浏览器阻止了播放，请点击重播。' : '本地音频无法播放，请重播或跳过；跳过不会计为答错。'));
    });
  }

  pause() { this.paused = true; this.request += 1; this.audio?.pause(); this.onState(false); }
  resume() { this.paused = false; if (this.audio && !this.ended) this.attempt(); }
}
