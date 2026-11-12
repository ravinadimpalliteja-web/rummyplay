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
    loadSamples();
  } catch { ctx = null; }
}

/* Real recordings for the animals that need them (elephant, tiger, lion, monkey): short clips from Pixabay
   (Pixabay Content License: free to use, no attribution), trimmed and compressed to ~10-14 KB each in
   public/sounds/animals/. They are fetched only after the first tap, so they never slow the page down;
   until they arrive (or if they fail) the generated sound plays instead. */
const SAMPLED = ["elephant", "tiger", "lion", "monkey"];
const samples = new Map<string, AudioBuffer>();
let samplesAsked = false;
function loadSamples() {
  const c = ctx; if (!c || samplesAsked) return;
  samplesAsked = true;
  for (const v of SAMPLED) for (const mood of ["joy", "fear"]) {
    const key = `${v}-${mood}`;
    fetch(`/sounds/animals/${key}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).then((buf) => { samples.set(key, buf); }).catch(() => { /* keep the generated sound */ });
  }
}
function sample(key: string, at: number, gain = .85): boolean {
  const c = ready(), buf = samples.get(key); if (!c || !master || !buf) return false;
  const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf; g.gain.value = gain;
  src.connect(g); g.connect(master); src.start(c.currentTime + at); return true;
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

/** A voice-like sound: a buzzy tone shaped by two vowel resonances, gliding between pitches (an "ahh", "yay", "ooh"). */
function vox(at: number, dur: number, f0: number, f1: number, vowel: [number, number], gain = .12, vib = 0, type: OscillatorType = "sawtooth") {
  const c = ready(); if (!c || !master) return;
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), a = c.createBiquadFilter(), b = c.createBiquadFilter(), mix = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (vib) { const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6 + Math.random() * 2; lg.gain.value = f0 * vib; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + .02); }
  a.type = "bandpass"; a.frequency.value = vowel[0]; a.Q.value = 6; b.type = "bandpass"; b.frequency.value = vowel[1]; b.Q.value = 8;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(.04, dur / 4)); g.gain.setValueAtTime(gain, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(a); o.connect(b); a.connect(mix); b.connect(mix); mix.gain.value = 1.6; mix.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
/** A growl or roar: low buzz with a rough, throbbing noise on top. */
function roar(at: number, dur: number, f0: number, f1: number, gain = .16) {
  const c = ready(); if (!c || !master) return;
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter(), trem = c.createOscillator(), tg = c.createGain();
  o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(420, t + dur); lp.Q.value = 4;
  trem.frequency.value = 23; tg.gain.value = gain * .5; trem.connect(tg); tg.connect(g.gain);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .08); g.gain.setValueAtTime(gain, t + dur * .6); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
  o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02); trem.start(t); trem.stop(t + dur + .02);
  noise(at, dur * .9, 520, 1.2, gain * .9, 300);
}
const AH: [number, number] = [800, 1200], EH: [number, number] = [550, 1800], EE: [number, number] = [300, 2300], OO: [number, number] = [350, 800];

/** The token's own cry: `fear` when a snake gets it, `joy` at the top of a ladder. */
function cry(voice: string, mood: "fear" | "joy", at: number) {
  const f = mood === "fear";
  if (SAMPLED.includes(voice) && sample(`${voice}-${mood}`, at, (voice === "lion" || voice === "tiger") && !f ? .6 : .85)) return;   // the roars are kept short and softer
  if (voice === "lion" || voice === "tiger") voice = "big-cat";
  switch (voice) {
    case "man": case "woman": case "boy": {
      const p = voice === "man" ? 1 : voice === "woman" ? 1.85 : 2.2;
      if (f) vox(at, .75, 260 * p, 150 * p, AH, .16, .03);                                                   // "Aaaaah!"
      else { vox(at, .16, 180 * p, 230 * p, EH, .14); vox(at + .17, .38, 260 * p, 330 * p, EE, .15, .015); }   // "Yay-ee!"
      break;
    }
    case "big-cat":
      if (f) { roar(at, .45, 150, 70, .2); vox(at + .05, .35, 420, 220, OO, .06); }                          // a startled snarl
      else roar(at, .9, 95, 130, .22);                                                                        // a proud roar
      break;
    case "elephant":
      if (f) vox(at, .6, 620, 300, EE, .14, .05, "sawtooth");                                                 // alarmed trumpet, falling
      else { vox(at, .7, 420, 760, EE, .15, .06, "sawtooth"); vox(at + .05, .7, 840, 1500, EE, .05, .06, "square"); }   // triumphant trumpet
      break;
    case "monkey":
      if (f) [0, .1, .2].forEach((d, i) => vox(at + d, .12, 1300 - i * 120, 900, EE, .12, 0, "square"));     // shrieks
      else [0, .12, .24, .38].forEach((d, i) => vox(at + d, .11, i % 2 ? 700 : 520, i % 2 ? 980 : 760, i % 2 ? AH : OO, .11, 0, "square"));   // "oo-oo-aa-aa"
      break;
    case "small":
      if (f) vox(at, .32, 2200, 1100, EE, .1, .04, "triangle");                                               // a squeal
      else [0, .1, .2].forEach((d) => tone(1800 + Math.random() * 400, at + d, .08, "sine", .08, .004, 2600));   // happy chirps
      break;
    case "panda":
      if (f) vox(at, .45, 900, 450, EE, .12, .05);
      else { vox(at, .2, 600, 800, AH, .1); vox(at + .22, .3, 700, 950, EE, .1); }
      break;
    case "fox":
      if (f) vox(at, .3, 1500, 700, EE, .12, .02);
      else [0, .14].forEach((d) => vox(at + d, .12, 900, 1400, AH, .11));                                     // "yip-yip!"
      break;
    case "peacock":
      if (f) vox(at, .5, 1200, 600, EE, .12, .04);
      else { vox(at, .22, 700, 900, EH, .12); vox(at + .24, .45, 1100, 1300, AH, .13, .02); }                // "may-AWE"
      break;
    default:
      if (f) { tone(520, at, .25, "triangle", .1, .005, 260); }
      else { tone(1318.5, at, .3, "sine", .07); tone(1568, at + .08, .4, "sine", .06); }
  }
}

export const sfx = {
  /** A snake's warning hiss. */
  hiss(at = 0, dur = .5, gain = .14) { noise(at, dur, 5200, .8, gain, 3800); noise(at + .02, dur * .9, 2600, 1.5, gain * .35, 2000); },
  /** Jaws snapping shut on nothing. */
  snap(at = 0) { noise(at, .04, 1800, 2, .35); tone(320, at, .07, "square", .08, .002, 140); },
  /** The token's cry (fear when eaten, joy on a ladder). */
  cry(voice: string, mood: "fear" | "joy", at = 0) { cry(voice, mood, at); },
  /** A startled yelp from a token a snake just missed. */
  startle(voice: string, at = 0) {
    if (voice === "man" || voice === "woman" || voice === "boy") { const p = voice === "man" ? 1 : voice === "woman" ? 1.85 : 2.2; vox(at, .18, 300 * p, 420 * p, OO, .12); }
    else tone(900, at, .14, "triangle", .07, .004, 1400);
  },
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
  /** Snake: a hiss, the token's cry, a gulp, a sliding whoosh, and a gentle chime when the token comes out. */
  snake(mouthMs: number, slideMs: number, voice = "chime") {
    const m = mouthMs / 1000, s = slideMs / 1000;
    sfx.hiss(0, m * .75, .16);                                            // the hiss as it strikes
    cry(voice, "fear", m * .55);                                          // the token's cry as the jaws close
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
