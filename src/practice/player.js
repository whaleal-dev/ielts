export function chooseEnglishVoice(voices, voice = '', preferGoogle = false) {
  const english = voices.filter((entry) => /^en/i.test(entry.lang));
  const selected = voice ? english.find((entry) => entry.voiceURI === voice || entry.name === voice) : undefined;
  const google = preferGoogle ? english.filter((entry) => /google/i.test(entry.name)) : [];
  return selected || google.find((entry) => /^en[-_]GB/i.test(entry.lang)) || google[0] || english.find((entry) => /^en[-_]GB/i.test(entry.lang)) || english[0];
}

export class SpeechPlayer {
  constructor({ synthesis = globalThis.speechSynthesis, createUtterance = (text) => new SpeechSynthesisUtterance(text), onState = () => {} } = {}) {
    Object.assign(this, { synthesis, createUtterance, onState });
    this.generation = 0;
    this.utterance = null;
    this.cancel = null;
  }

  stop() {
    this.generation += 1;
    if (this.utterance) { this.utterance.onend = null; this.utterance.onerror = null; this.utterance = null; this.synthesis?.cancel(); }
    this.cancel?.(); this.cancel = null;
    this.onState(false);
  }

  play(text, { voice = '', rate = 1, preferGoogle = false } = {}) {
    this.stop();
    const generation = this.generation;
    return new Promise((resolve, reject) => {
      const settle = (error) => {
        if (generation !== this.generation) return;
        this.cancel = null; this.onState(false);
        if (error) reject(error); else resolve(true);
      };
      this.cancel = () => resolve(false);
      try {
        if (!this.synthesis) throw new Error('当前浏览器不支持 Web 语音，请使用支持语音合成的浏览器。');
        const selected = chooseEnglishVoice(this.synthesis.getVoices(), voice, preferGoogle);
        const utterance = this.utterance = this.createUtterance(text);
        if (selected) utterance.voice = selected;
        utterance.lang = selected?.lang || 'en-GB'; utterance.rate = rate;
        utterance.onend = () => settle();
        utterance.onerror = () => settle(new Error('Web 语音未能播放，请检查浏览器英语语音是否可用后重播。'));
        this.onState(true); this.synthesis.speak(utterance);
      } catch (error) { settle(error); }
    });
  }
}

export class QueuePlayer {
  constructor({ speech = new SpeechPlayer(), onPosition = () => {}, onState = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { speech, onPosition, onState, onError });
    this.generation = 0; this.timer = null; this.cancelWait = null;
  }

  stop() {
    this.generation += 1; clearTimeout(this.timer); this.cancelWait?.(); this.cancelWait = null;
    this.speech.stop(); this.onState({ playing: false, speaking: false });
  }

  wait(milliseconds) {
    return new Promise((resolve) => {
      this.cancelWait = () => resolve(false);
      this.timer = setTimeout(() => { this.cancelWait = null; resolve(true); }, milliseconds);
    });
  }

  start(items, index, options = {}) {
    this.stop();
    if (!items.at(index)) return Promise.resolve();
    const generation = this.generation;
    return this.run(items, index, options, generation);
  }

  async run(items, index, options, generation) {
    this.onState({ playing: options.automatic ?? (options.autoAdvance !== false), speaking: false, finished: false });
    try {
      while (generation === this.generation && items.at(index)) {
        this.onPosition(index);
        for (let repeat = 0; repeat < (options.repeat || 1); repeat += 1) {
          this.onState({ speaking: true, repetition: repeat + 1 });
          const complete = await this.speech.play(items.at(index).text, options);
          if (!complete || generation !== this.generation) return;
          this.onState({ speaking: false });
          if (repeat + 1 < options.repeat && !await this.wait(120)) return;
          if (generation !== this.generation) return;
        }
        if (options.autoAdvance === false || index === items.length - 1) {
          this.onState({ playing: false, speaking: false, finished: options.autoAdvance !== false }); return;
        }
        if (!await this.wait((options.interval || 0) * 1000) || generation !== this.generation) return;
        index += 1;
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.onState({ playing: false, speaking: false }); this.onError(error);
    }
  }
}
