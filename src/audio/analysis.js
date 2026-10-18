// KamiCreative — sound analysis core (pure; no Web Audio, unit tested).
//
// Input each frame: byte frequency data (AnalyserNode.getByteFrequencyData),
// byte time-domain data, the sample rate and the frame time.
// Output: bass / mid / treble / level on a friendly 0-100 scale, a beat flag,
// a running beat count, a BPM estimate, and a log-spaced spectrum + waveform
// for visualizers.
//
// Auto-level ("auto gain") tracks a slowly decaying peak per band so that quiet
// rooms and loud clubs both drive visuals across the full range. A noise gate
// keeps visuals still when it is silent.

export const BANDS = {
  bass: [20, 150],
  mid: [150, 2000],
  treble: [2000, 12000],
};

export const SPECTRUM_BINS = 256;
export const WAVE_SAMPLES = 256;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function defaultSoundSettings() {
  return { source: 'mic', deviceId: '', gain: 100, sensitivity: 50, smoothing: 40, autoLevel: true, autoAdvance: 0 };
}

export class SoundAnalysis {
  constructor() {
    this.reset();
  }

  reset() {
    this.values = { level: 0, bass: 0, mid: 0, treble: 0, beat: false, beatCount: 0, bpm: 0, beatPhase: 0, active: false };
    this.spectrum = new Float32Array(SPECTRUM_BINS);
    this.peaks = new Float32Array(SPECTRUM_BINS);
    this.waveform = new Float32Array(WAVE_SAMPLES).fill(0.5);
    this._peak = { level: 0.08, bass: 0.08, mid: 0.08, treble: 0.08, spec: 0.1 };
    this._smooth = { level: 0, bass: 0, mid: 0, treble: 0 };
    this._floor = { level: 0, bass: 0, mid: 0, treble: 0 };
    this._prevLow = null;
    this._flux = [];
    this._lastBeat = -1;
    this._beats = [];
    this._bpm = 0;
    this._binMap = null;
  }

  _bins(n, sampleRate) {
    const key = `${n}|${sampleRate}`;
    if (this._binMap && this._binMap.key === key) return this._binMap;
    const hzPerBin = sampleRate / 2 / n;
    const toBin = (hz) => Math.max(0, Math.min(n - 1, Math.round(hz / hzPerBin)));
    const bands = {};
    for (const [k, [lo, hi]] of Object.entries(BANDS)) bands[k] = [toBin(lo), Math.max(toBin(lo) + 1, toBin(hi))];
    // Log-spaced spectrum bins from 30 Hz to 16 kHz.
    const spec = [];
    const f0 = 30, f1 = Math.min(16000, sampleRate / 2);
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const a = f0 * Math.pow(f1 / f0, i / SPECTRUM_BINS);
      const b = f0 * Math.pow(f1 / f0, (i + 1) / SPECTRUM_BINS);
      const s = toBin(a);
      spec.push([s, Math.max(s + 1, toBin(b))]);
    }
    this._binMap = { key, bands, spec, low: [toBin(30), Math.max(toBin(30) + 2, toBin(160))] };
    return this._binMap;
  }

  /**
   * @param {Uint8Array} freq   byte frequency data (0..255)
   * @param {Uint8Array} time   byte time-domain data (128 = silence)
   * @param {number} sampleRate
   * @param {number} dt         seconds since last frame
   * @param {number} now        seconds (monotonic)
   * @param {object} settings   { gain, sensitivity, smoothing, autoLevel }
   */
  process(freq, time, sampleRate, dt, now, settings = defaultSoundSettings()) {
    const v = this.values;
    const map = this._bins(freq.length, sampleRate);
    const gain = (settings.gain ?? 100) / 100;
    const sens = (settings.sensitivity ?? 50) / 100;
    const auto = settings.autoLevel !== false;
    dt = Math.max(1e-3, Math.min(0.25, dt || 1 / 60));

    // --- raw band energies (0..1)
    // RMS over the band's bins: broad sound and single strong notes both register.
    const avg = (lo, hi) => { let s = 0; for (let i = lo; i < hi; i++) { const x = freq[i] / 255; s += x * x; } return Math.sqrt(s / Math.max(1, hi - lo)); };
    const raw = {};
    for (const k of Object.keys(BANDS)) raw[k] = avg(map.bands[k][0], map.bands[k][1]);
    let sq = 0;
    for (let i = 0; i < time.length; i++) { const x = (time[i] - 128) / 128; sq += x * x; }
    raw.level = Math.sqrt(sq / Math.max(1, time.length));

    // --- auto level + gate + smoothing
    const gate = 0.012 + (1 - sens) * 0.02;
    const decay = Math.pow(0.5, dt / 4); // peaks halve every 4 s
    const smooth = (settings.smoothing ?? 40) / 100;
    const attack = 1 - Math.pow(1 - (0.9 - smooth * 0.6), dt * 60);
    const release = 1 - Math.pow(1 - (0.35 - smooth * 0.3), dt * 60);
    const loud = raw.level >= gate; // silence gate on the overall signal
    for (const k of ['level', 'bass', 'mid', 'treble']) {
      const r = raw[k];
      this._peak[k] = Math.max(r, this._peak[k] * decay, k === 'level' ? 0.04 : 0.06);
      // A slowly rising floor follows the quiet parts, so hits stand out even over
      // a sustained bassline or pad (drops instantly, rises with a ~1.5 s half-life).
      const f = this._floor[k];
      this._floor[k] = r < f ? r : f + (r - f) * (1 - Math.pow(0.5, dt / 1.5));
      const pk = this._peak[k], fl = Math.min(this._floor[k], pk * 0.9);
      let n = auto ? 0.35 * (r / pk) + 0.65 * ((r - fl) / Math.max(1e-4, pk - fl)) : r * (k === 'level' ? 3 : 1.6);
      if (!loud || r < 0.004) n = 0;
      n = clamp01(n * gain);
      const s = this._smooth[k];
      this._smooth[k] = s + (n - s) * (n > s ? attack : release);
      v[k] = Math.round(this._smooth[k] * 1000) / 10;
    }
    v.active = loud;

    // --- beat detection: spectral flux on the low end with an adaptive threshold
    const [lo, hi] = map.low;
    let flux = 0;
    if (this._prevLow) for (let i = lo; i < hi; i++) { const d = freq[i] - this._prevLow[i - lo]; if (d > 0) flux += d; }
    this._prevLow = freq.slice(lo, hi);
    flux /= (hi - lo) * 255;
    // Time-based 1.2 s history, so uneven frame rates do not shrink the window.
    const hist = this._flux;
    hist.push([now, flux]);
    while (hist.length && now - hist[0][0] > 1.2) hist.shift();
    let mean = 0;
    for (const [, x] of hist) mean += x;
    mean /= hist.length;
    let varc = 0;
    for (const [, x] of hist) varc += (x - mean) * (x - mean);
    const sd = Math.sqrt(varc / hist.length);
    const k = 2.4 - sens * 1.6;
    v.beat = false;
    if (hist.length >= 6 && loud && flux > mean + k * sd && flux > 0.015 && raw.bass > 0.02 && now - this._lastBeat > 0.24) {
      v.beat = true;
      v.beatCount++;
      if (this._lastBeat >= 0) this._beats.push(now - this._lastBeat);
      if (this._beats.length > 16) this._beats.shift();
      this._lastBeat = now;
      this._bpm = estimateBpm(this._beats) || this._bpm;
    }
    v.bpm = Math.round(this._bpm * 10) / 10;
    v.beatPhase = this._bpm > 0 && this._lastBeat >= 0 ? clamp01((now - this._lastBeat) * this._bpm / 60) : 0;

    // --- spectrum (log-spaced, auto-levelled) and waveform
    let frameMax = 0;
    const spec = this.spectrum;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const [a, b] = map.spec[i];
      let m = 0;
      for (let j = a; j < b; j++) if (freq[j] > m) m = freq[j];
      const x = m / 255;
      if (x > frameMax) frameMax = x;
      spec[i] = x;
    }
    this._peak.spec = Math.max(frameMax, this._peak.spec * decay, 0.1);
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      let x = auto ? spec[i] / this._peak.spec : spec[i];
      // Gentle tilt so treble is visible next to bass.
      x = clamp01(x * gain * (0.85 + 0.35 * (i / SPECTRUM_BINS)));
      if (!loud) x = 0;
      const p = this.peaks[i];
      this.peaks[i] = x > p ? x : Math.max(0, p - dt * 0.6);
      spec[i] = x;
    }
    const step = time.length / WAVE_SAMPLES;
    for (let i = 0; i < WAVE_SAMPLES; i++) {
      const x = (time[Math.floor(i * step)] - 128) / 128;
      this.waveform[i] = clamp01(0.5 + 0.5 * x * Math.min(4, auto ? 0.5 / Math.max(0.05, this._peak.level) : 1) * gain);
    }
    return v;
  }

  /** Energy (0-100, auto-levelled with the same peak as the bass band) of an arbitrary range. */
  band(freq, sampleRate, loHz, hiHz) {
    const hzPerBin = sampleRate / 2 / freq.length;
    const a = Math.max(0, Math.floor(loHz / hzPerBin)), b = Math.max(a + 1, Math.min(freq.length, Math.ceil(hiHz / hzPerBin)));
    let s = 0;
    for (let i = a; i < b; i++) s += freq[i];
    return clamp01(s / (b - a) / 255 / Math.max(0.06, this._peak.mid)) * 100;
  }
}

/** Median inter-beat interval folded into 70-180 BPM. */
export function estimateBpm(intervals) {
  const ok = intervals.filter((x) => x > 0.25 && x < 2);
  if (ok.length < 3) return 0;
  const bpms = ok.map((x) => { let b = 60 / x; while (b < 70) b *= 2; while (b > 180) b /= 2; return b; }).sort((a, b) => a - b);
  return bpms[Math.floor(bpms.length / 2)];
}

/**
 * Value for a "react to sound" binding.
 * binding: { band: 'bass'|'mid'|'treble'|'level'|'beat', min, max, smooth(0-100), invert }
 * state is per-binding scratch space.
 */
export function reactValue(binding, sound, state, dt) {
  const lo = +binding.min || 0, hi = binding.max === undefined ? 100 : +binding.max;
  let t;
  if (binding.band === 'beat') {
    if (sound.beat) state.pulse = 1;
    const decay = 0.08 + ((binding.smooth ?? 40) / 100) * 0.9; // seconds to fall
    state.pulse = Math.max(0, (state.pulse || 0) - dt / decay);
    t = state.pulse;
  } else {
    const x = clamp01((sound[binding.band] ?? 0) / 100);
    const sm = (binding.smooth ?? 30) / 100;
    const s = state.s ?? x;
    const k = 1 - Math.pow(sm * 0.97, dt * 60);
    state.s = s + (x - s) * (sm <= 0 ? 1 : k);
    t = state.s;
  }
  if (binding.invert) t = 1 - t;
  return lo + (hi - lo) * t;
}

export const REACT_BANDS = [
  { id: 'bass', label: 'Bass', hint: 'kick drums and low notes' },
  { id: 'mid', label: 'Mids', hint: 'vocals, guitars and keys' },
  { id: 'treble', label: 'Treble', hint: 'hi-hats, cymbals and sparkle' },
  { id: 'level', label: 'Loudness', hint: 'overall volume' },
  { id: 'beat', label: 'Beat', hint: 'jumps on every beat, then falls back' },
];
