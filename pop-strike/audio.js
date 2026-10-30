/**
 * Compact, entirely procedural combat audio. Call unlock() from the start button
 * or another user gesture. Every other method is safe before audio is ready.
 */
export class CombatAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.master = null;
    this.bus = null;
    this.noise = null;
    this._lastStep = -Infinity;
    this._stepSide = 0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      try {
        const ctx = new AudioContextClass({ latencyHint: 'interactive' });
        this.context = ctx;

        const highpass = ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 28;

        // Glue the layered transients together and leave generous output headroom.
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -13;
        compressor.knee.value = 8;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.095;

        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.48;
        highpass.connect(compressor);
        compressor.connect(this.master);
        this.master.connect(ctx.destination);
        this.bus = highpass;

        this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      } catch {
        this.context = null;
        return false;
      }
    }
    try {
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.48, this.context.currentTime, 0.015);
    }
  }

  _ready() {
    return !this.muted && this.context?.state === 'running' && this.bus;
  }

  _tone({ at = 0, duration = 0.1, frequency = 120, end = frequency,
    volume = 0.15, type = 'sine', attack = 0.001, cutoff = 0, detune = 0 } = {}) {
    if (!this._ready()) return;
    const ctx = this.context;
    const start = ctx.currentTime + at;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    const nodes = [oscillator, gain];
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      oscillator.connect(filter);
      filter.connect(gain);
      nodes.push(filter);
    } else oscillator.connect(gain);
    gain.connect(this.bus);
    oscillator.onended = () => nodes.forEach(node => node.disconnect());
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  _noise({ at = 0, duration = 0.1, volume = 0.15, frequency = 1500,
    end = frequency, type = 'bandpass', q = 0.7, attack = 0.001 } = {}) {
    if (!this._ready()) return;
    const ctx = this.context;
    const start = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(25, end), start + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    source.onended = () => [source, filter, gain].forEach(node => node.disconnect());
    source.start(start, Math.random() * Math.max(0.1, 1.5 - duration));
    source.stop(start + duration + 0.01);
  }

  shoot(weapon = 'rifle') {
    if (!this._ready()) return;
    const profiles={
      rifle:[158,.16,.69,2600,.115],shotgun:[120,.30,.90,1900,.24],
      smg:[200,.11,.53,3100,.085],sniper:[92,.42,.95,3500,.30],
      handcannon:[135,.24,.82,2900,.17],revolver:[110,.28,.85,2350,.20],
    };
    const [bass,tail,volume,crack,noise]=profiles[weapon]||profiles.rifle;
    const pitch=.96+Math.random()*.08;
    this._tone({frequency:bass*pitch,end:31,duration:tail,volume});
    this._tone({frequency:83*pitch,end:35,duration:tail*.8,type:'triangle',volume:volume*.3,cutoff:700});
    this._noise({duration:noise,volume:volume*.9,frequency:crack,end:430,q:.55});
    this._noise({duration:.026,volume:.43,frequency:4100,end:1800,type:'highpass'});
    this._tone({frequency:2700*pitch,end:810,duration:.034,volume:.075,type:'square',cutoff:4400});
    this._noise({at:.022,duration:tail,volume:volume*.3,frequency:820,end:160,type:'lowpass'});
    if(weapon==='shotgun'||weapon==='sniper'){
      const at=weapon==='shotgun'?.22:.40;
      this._noise({at,duration:.12,volume:.17,frequency:1800,end:3400,q:1.6});
      this._noise({at:at+.18,duration:.05,volume:.22,frequency:2700,end:800});
    }
  }

  reload(weapon='rifle',duration=1.35) {
    if (!this._ready()) return;
    this._noise({duration:.055,volume:.25,frequency:2800,end:900});
    this._tone({frequency:640,end:290,duration:.055,type:'triangle',volume:.11});
    if(weapon==='shotgun'||weapon==='revolver'){
      for(const fraction of [.20,.38,.56,.74]){
        this._noise({at:duration*fraction,duration:.055,volume:.19,frequency:2200,end:650});
        this._tone({at:duration*fraction,frequency:weapon==='revolver'?940:420,end:250,duration:.04,volume:.07});
      }
    }else{
      this._noise({at:duration*.15,duration:.16,volume:.15,frequency:1100,end:2600,q:1.5});
      this._noise({at:duration*.62,duration:.07,volume:.32,frequency:1600,end:550});
      this._tone({at:duration*.62,frequency:190,end:80,duration:.075,volume:.23});
    }
    this._noise({at:duration*.86,duration:.085,volume:.24,frequency:3400,end:1000,q:1.7});
    this._tone({at:duration*.90,frequency:830,end:360,duration:.05,type:'square',volume:.06,cutoff:1800});
  }

  hit(headshot = false) {
    if (!this._ready()) return;
    this._noise({ duration: 0.042, volume: 0.24, frequency: headshot ? 3900 : 1800, q: 0.9 });
    this._tone({ frequency: headshot ? 1700 : 960, end: headshot ? 1150 : 570,
      duration: 0.065, type: 'triangle', volume: headshot ? 0.26 : 0.18 });
    if (headshot) {
      this._tone({ at: 0.018, frequency: 2540, end: 2200, duration: 0.105, volume: 0.12 });
      this._tone({ frequency: 145, end: 75, duration: 0.08, volume: 0.18 });
    }
  }

  kill() {
    if (!this._ready()) return;
    this._noise({ duration: 0.095, volume: 0.22, frequency: 950, end: 240, q: 1 });
    this._tone({ frequency: 220, end: 65, duration: 0.16, type: 'triangle', volume: 0.31 });
    this._tone({ at: 0.025, frequency: 1318.5, duration: 0.12, volume: 0.13 });
    this._tone({ at: 0.075, frequency: 1760, duration: 0.14, volume: 0.12 });
  }

  hurt() {
    if (!this._ready()) return;
    this._noise({ duration: 0.17, volume: 0.42, frequency: 640, end: 150, type: 'lowpass' });
    this._tone({ frequency: 105, end: 46, duration: 0.2, volume: 0.42 });
    this._tone({ frequency: 140, end: 75, duration: 0.12, type: 'sawtooth', volume: 0.13, cutoff: 550 });
  }

  dash() {
    if (!this._ready()) return;
    this._noise({ duration: 0.23, volume: 0.35, frequency: 450, end: 3400, q: 0.8, attack: 0.018 });
    this._noise({ at: 0.025, duration: 0.24, volume: 0.15, frequency: 2700, end: 250, type: 'lowpass', attack: 0.025 });
    this._tone({ frequency: 180, end: 65, duration: 0.16, volume: 0.13 });
  }

  wave() {
    if (!this._ready()) return;
    [220, 293.66, 329.63].forEach((frequency, i) => {
      this._tone({ at: i * 0.11, frequency, duration: 0.28, volume: 0.14, type: 'triangle' });
      this._tone({ at: i * 0.11, frequency: frequency * 2, duration: 0.22, volume: 0.055 });
    });
    this._noise({ at: 0.24, duration: 0.21, volume: 0.1, frequency: 2200, end: 500 });
  }

  victory() {
    if (!this._ready()) return;
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((frequency, i) => {
      const at = i * 0.12;
      this._tone({ at, frequency, duration: i === 5 ? 0.6 : 0.23,
        volume: 0.17, type: 'triangle', attack: 0.004 });
      this._tone({ at, frequency: frequency / 2, duration: 0.27, volume: 0.08 });
    });
    this._noise({ duration: 0.28, volume: 0.14, frequency: 3000, end: 700 });
  }

  footstep() {
    if (!this._ready()) return;
    const now = this.context.currentTime;
    if (now - this._lastStep < 0.13) return;
    this._lastStep = now;
    this._stepSide = 1 - this._stepSide;
    const pitch = this._stepSide ? 1 : 0.88;
    this._tone({ frequency: 105 * pitch, end: 44, duration: 0.075, volume: 0.14 });
    this._noise({ duration: 0.072, volume: 0.14, frequency: 680 * pitch, end: 240, q: 0.5 });
    this._noise({ at: 0.012, duration: 0.06, volume: 0.035, frequency: 2900, type: 'highpass' });
  }
}

export default CombatAudio;
