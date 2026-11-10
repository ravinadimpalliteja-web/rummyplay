/* Gentle game sounds, made with the Web Audio API (no sound files). Browsers allow sound only after the player
   has tapped something, so `unlock()` runs on the first tap. On/off is remembered on this device. */
const KEY = "rc-snakes-sound";
let ctx: AudioContext | null = null, master: GainNode | null = null;
let on = (() => { try { return window.localStorage.getItem(KEY) !== "off"; } catch { return true; } })();

export const soundOn = () => on;
export function setSound(v: boolean) { on = v; try { window.localStorage.setItem(KEY, v ? "on" : "off"); } catch { /* storage off */ } if (v) unlock(); }
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch { ctx = null; }
}
const ready = () => (on && ctx && master && ctx.state === "running" ? ctx : null);

function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = .18, attack = .006, endFreq?: number) {
  const c = ready(); if (!c || !master) return;
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(at: number, dur: number, freq: number, q: number, gain: number, endFreq?: number) {
  const c = ready(); if (!c || !master) return;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; f.type = "bandpass"; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(.02, dur / 3)); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * .5); src.stop(t + dur + .02);
}
/** A wooden knock: a short filtered click plus a low body. */
const knock = (at: number, loud: number) => { noise(at, .045, 2400, 3, .5 * loud); tone(190 + Math.random() * 40, at, .07, "triangle", .16 * loud); };

export const sfx = {
  /** Dice thrown across the board: a rattle, then knocks that get softer with each bounce. */
  dice(ms: number) {
    const s = ms / 1000;
    for (let i = 0; i < 7; i++) noise(i * .045, .03, 3200 + Math.random() * 1500, 4, .18);
    [.2, .6, .86, .97].forEach((k, i) => knock(k * s, 1 - i * .22));
  },
  /** One soft tap per square. */
  hop() { tone(520, 0, .06, "sine", .05); noise(0, .025, 1800, 2, .06); },
  /** Climbing: a rising note on every rung, then a bright arrival chime. */
  ladder(rungs: number, rungMs: number, startMs: number) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568, 1760, 2093];
    for (let i = 0; i < rungs; i++) tone(scale[Math.min(scale.length - 1, i)], (startMs + i * rungMs) / 1000, .16, "triangle", .1);
    const end = (startMs + rungs * rungMs) / 1000;
    tone(1568, end, .5, "sine", .08); tone(2093, end + .06, .6, "sine", .06);
  },
  /** Snake: a soft gulp, a playful sliding whoosh, and a gentle chime when the pawn comes out. Nothing scary. */
  snake(mouthMs: number, slideMs: number) {
    const m = mouthMs / 1000, s = slideMs / 1000;
    tone(260, m * .7, .16, "sine", .14, .01, 150);                       // gulp
    noise(m, s, 1400, 1.4, .12, 380);                                     // whoosh down the body
    tone(660, m, s, "sine", .05, .05, 330);                               // a soft slide whistle
    tone(988, m + s, .45, "sine", .09); tone(1319, m + s + .08, .55, "sine", .07);
  },
  /** Three sixes: a short, friendly "uh-oh". */
  oops() { tone(440, 0, .18, "triangle", .1); tone(330, .16, .3, "triangle", .1); },
  /** Someone finished. First place gets a longer fanfare with sparkles; other places a short chime. */
  finish(rank: number) {
    if (rank === 1) {
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => { tone(f, i * .13, .32, "triangle", .13); tone(f * 2, i * .13, .2, "sine", .03); });
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone(f, .95, 1.4, "sine", .07));
      for (let i = 0; i < 14; i++) tone(1800 + Math.random() * 1800, .9 + Math.random() * 1.4, .18, "sine", .035);
    } else {
      [659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .12, .35, "triangle", .1));
      for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 1200, .35 + Math.random() * .6, .15, "sine", .03);
    }
  },
  /** A chat message arrived. */
  pop() { tone(880, 0, .09, "sine", .06, .004, 1320); },
};
