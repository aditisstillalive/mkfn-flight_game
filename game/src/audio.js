// Every sound in the game is synthesised with WebAudio, no files: a four-cylinder engine drone whose
// firing rate follows the RPM, wind that rises with airspeed, a pulsing stall horn, a chime for each
// gate, tyre chirps on touchdown, the thump of a crate release and the crunch of a crash.

/** Creates the sound system; nothing plays until `start()` runs inside a user gesture. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let wind = null;
  let horn = null;
  let muted = false;

  function noiseBuffer(seconds = 2) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // brown-ish noise for wind
      data[i] = last * 3.5 * 0.5 + white * 0.5 * 0.3;
    }
    return buffer;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // engine: two detuned saws and a sub sine through a low-pass, amplitude-modulated by firing pulses
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const saw1 = ctx.createOscillator();
    saw1.type = 'sawtooth';
    const saw2 = ctx.createOscillator();
    saw2.type = 'sawtooth';
    saw2.detune.value = 12;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.25;
    const pulseBias = ctx.createGain();
    pulseBias.gain.value = 0.75;
    pulse.connect(pulseDepth).connect(pulseBias.gain);
    saw1.connect(filter);
    saw2.connect(filter);
    sub.connect(filter);
    filter.connect(pulseBias).connect(engineGain).connect(master);
    for (const o of [saw1, saw2, sub, pulse]) o.start();
    engine = { gain: engineGain, filter, saw1, saw2, sub, pulse };

    // wind: looping noise through a band-pass whose pitch climbs with speed
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 400;
    band.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(band).connect(windGain).connect(master);
    src.start();
    wind = { gain: windGain, band };

    // stall horn: a reedy square tone gated on and off
    const hornOsc = ctx.createOscillator();
    hornOsc.type = 'square';
    hornOsc.frequency.value = 440;
    const hornGain = ctx.createGain();
    hornGain.gain.value = 0;
    hornOsc.connect(hornGain).connect(master);
    hornOsc.start();
    horn = { gain: hornGain };
  }

  function tone(freq, start, duration, type = 'sine', volume = 0.2) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function burst(duration, freq, q, volume) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration + 0.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(master);
    src.start();
  }

  return {
    start() {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    /** Follows the flight state every frame. */
    update(state, paused) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const running = !paused && !state.crashed;
      const rpm = running ? state.engineRpm : 0;
      const firing = Math.max(8, rpm / 60 * 2);   // four cylinders, two firings per revolution
      engine.saw1.frequency.setTargetAtTime(firing, now, 0.05);
      engine.saw2.frequency.setTargetAtTime(firing * 2, now, 0.05);
      engine.sub.frequency.setTargetAtTime(firing / 2, now, 0.05);
      engine.pulse.frequency.setTargetAtTime(firing, now, 0.05);
      engine.filter.frequency.setTargetAtTime(220 + state.throttle * 900 + rpm * 0.15, now, 0.1);
      const engineLevel = running && state.engineOn ? 0.1 + 0.16 * state.throttle : 0;
      engine.gain.gain.setTargetAtTime(engineLevel, now, 0.15);
      const v = running ? state.airspeed : 0;
      wind.gain.gain.setTargetAtTime(Math.min(0.5, (v / 60) ** 2 * 0.22), now, 0.2);
      wind.band.frequency.setTargetAtTime(250 + v * 14, now, 0.2);
      const hornOn = running && state.stallWarning && Math.floor(now * 6) % 2 === 0;
      horn.gain.gain.setTargetAtTime(hornOn ? 0.05 : 0, now, 0.01);
    },
    gate() { [784, 988, 1319].forEach((f, i) => tone(f, i * 0.07, 0.5, 'triangle', 0.18)); },
    touchdown(grade) {
      burst(0.18, 2600, 3, grade === 'Hard' ? 0.5 : 0.25);
      if (grade === 'Hard') burst(0.4, 180, 1, 0.6);
    },
    release() { burst(0.25, 300, 1.5, 0.4); tone(220, 0, 0.2, 'sine', 0.15); },
    crash() { burst(1.6, 120, 0.7, 1.0); burst(0.8, 900, 1, 0.5); },
    success() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.7, 'triangle', 0.16)); },
    warn() { tone(880, 0, 0.12, 'square', 0.08); tone(660, 0.15, 0.12, 'square', 0.08); },
  };
}
