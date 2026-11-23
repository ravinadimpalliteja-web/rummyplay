/* Two short celebration sounds made in the browser (no audio files), shared by Ludo and Snakes & Ladders.
   - arrival(): a war-trumpet "arrival" call, ta-ta-taaa, for a token reaching home.
   - victory(): a joyful, gentle winner tune: a bright brass flourish over soft bells and a little sparkle,
     kept well below the volume of the other game sounds.
   Both start after the player's first tap (browsers allow sound only then) and do nothing when audio is unavailable. */

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = ctx ?? new C();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** One brass note: two slightly detuned saw waves through a filter that opens like a player's breath, with a small
    scoop up into the pitch and a touch of vibrato on long notes. */
function brass(c: AudioContext, out: AudioNode, freq: number, t: number, dur: number, vol: number) {
  const g = c.createGain(), f = c.createBiquadFilter();
  f.type = "lowpass"; f.Q.value = 1.6;
  f.frequency.setValueAtTime(freq * 1.2, t);
  f.frequency.exponentialRampToValueAtTime(Math.min(9000, freq * 7), t + 0.05);
  f.frequency.exponentialRampToValueAtTime(Math.min(6000, freq * 3.6), t + Math.min(dur, 0.25));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.035);
  g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.05, dur - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
  f.connect(g).connect(out);
  const lfo = c.createOscillator(), lg = c.createGain();
  lfo.frequency.value = 5.5; lg.gain.value = dur > 0.3 ? freq * 0.008 : 0;
  lfo.connect(lg);
  for (const det of [-6, 7]) {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(freq * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
    o.detune.value = det;
    lg.connect(o.frequency);
    o.connect(f); o.start(t); o.stop(t + dur + 0.15);
  }
  lfo.start(t); lfo.stop(t + dur + 0.15);
}

/** A soft bell: a sine with an inharmonic partial, ringing out. */
function bell(c: AudioContext, out: AudioNode, freq: number, t: number, vol: number, ring = 1.2) {
  for (const [mult, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring / mult ** 0.4);
    o.connect(g).connect(out); o.start(t); o.stop(t + ring + 0.05);
  }
}

/** A light room echo so the brass sounds like it is played outdoors, not inside the phone. */
function room(c: AudioContext, master: number): AudioNode {
  const out = c.createGain(); out.gain.value = master;
  const d = c.createDelay(0.5), fb = c.createGain(), wet = c.createGain(), lp = c.createBiquadFilter();
  d.delayTime.value = 0.13; fb.gain.value = 0.28; wet.gain.value = 0.22; lp.type = "lowpass"; lp.frequency.value = 2600;
  out.connect(c.destination);
  out.connect(d); d.connect(lp).connect(fb).connect(d); lp.connect(wet).connect(c.destination);
  return out;
}

/** Ta-ta-taaa: a short war-trumpet call announcing a token's arrival home. */
export function arrival(on = true) {
  if (!on) return;
  const c = ac(); if (!c) return;
  try {
    const t = c.currentTime + 0.02, out = room(c, 0.55);
    const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99;
    brass(c, out, G4, t, 0.1, 0.13);
    brass(c, out, G4, t + 0.13, 0.1, 0.13);
    brass(c, out, C5, t + 0.26, 0.16, 0.14);
    brass(c, out, E5, t + 0.44, 0.12, 0.13);
    brass(c, out, G5, t + 0.58, 0.62, 0.15);
    brass(c, out, C5, t + 0.58, 0.62, 0.07);           // a second trumpet a sixth below on the held note
  } catch { /* no audio */ }
}

/** The winner tune: about two seconds, happy and not loud. */
export function victory(on = true) {
  if (!on) return;
  const c = ac(); if (!c) return;
  try {
    const t = c.currentTime + 0.03, out = room(c, 0.42);
    const n = (semi: number) => 523.25 * 2 ** (semi / 12);   // around C5
    // brass flourish: C E G | C' (held) with a lower third
    [[0, 0, 0.12], [4, 0.14, 0.12], [7, 0.28, 0.12], [12, 0.44, 0.75]].forEach(([s, w, d]) => brass(c, out, n(s), t + w, d, 0.12));
    brass(c, out, n(7), t + 0.44, 0.75, 0.06);
    // bells answering: G A B C' D' E'
    [7, 9, 11, 12, 14, 16].forEach((s, i) => bell(c, out, n(s + 12) / 2, t + 1.05 + i * 0.09, 0.08, 1.1));
    // final chord, soft
    [0, 4, 7, 12].forEach(s => bell(c, out, n(s), t + 1.66, 0.07, 1.8));
    // sparkle on top
    for (let i = 0; i < 9; i++) bell(c, out, n(24 + [0, 4, 7, 12, 7, 4, 12, 16, 19][i]), t + 1.7 + i * 0.055, 0.025, 0.5);
  } catch { /* no audio */ }
}
