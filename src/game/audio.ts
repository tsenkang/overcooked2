// Sons curtos gerados na hora com WebAudio — nada para baixar.
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slide = 0, delay = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.06, hp = 1200) {
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export const sfx = {
  pick: () => tone(520, 0.07, 'triangle', 0.09, 120),
  drop: () => tone(300, 0.08, 'triangle', 0.09, -80),
  chop: () => noise(0.05, 0.08, 2500),
  wash: () => noise(0.12, 0.03, 600),
  dash: () => noise(0.12, 0.05, 400),
  throw: () => tone(400, 0.12, 'sine', 0.07, 300),
  deliver: () => {
    tone(880, 0.12, 'triangle', 0.1);
    tone(1320, 0.2, 'triangle', 0.1, 0, 0.1);
  },
  tip: () => tone(1760, 0.15, 'sine', 0.06, 0, 0.2),
  fail: () => tone(180, 0.35, 'sawtooth', 0.07, -60),
  reject: () => tone(220, 0.15, 'square', 0.06),
  warn: () => tone(1000, 0.06, 'square', 0.05),
  done: () => tone(1200, 0.08, 'sine', 0.07),
  fire: () => noise(0.3, 0.06, 200),
  spray: () => noise(0.08, 0.03, 3000),
  count: () => tone(660, 0.15, 'square', 0.07),
  go: () => tone(990, 0.35, 'square', 0.08),
  end: () => {
    tone(660, 0.2, 'square', 0.08);
    tone(440, 0.4, 'square', 0.08, 0, 0.2);
  },
  fall: () => tone(600, 0.6, 'sine', 0.08, -500),
  star: () => tone(1320, 0.25, 'triangle', 0.1, 400),
};
