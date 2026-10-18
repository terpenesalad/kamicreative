// KamiCreative — shared sound engine.
// One listener for the whole app. Sources:
//   mic     a microphone / line input (optionally a chosen device)
//   system  everything the computer is playing (Windows loopback capture)
//   off     no capture (Sound Players still feed the analysis)
// Sound Player modules also connect into the analysis input, so a song played
// inside KamiCreative drives the visuals without any routing.

import { Emitter } from '../core/emitter.js';
import { SoundAnalysis, defaultSoundSettings, SPECTRUM_BINS, WAVE_SAMPLES } from './analysis.js';

export class SoundEngine extends Emitter {
  constructor(host) {
    super();
    this.host = host;
    this.analysis = new SoundAnalysis();
    this.values = this.analysis.values;
    this.settings = defaultSoundSettings();
    this.state = 'idle'; // idle | starting | listening | error | off
    this.error = null;
    this.wanted = false;
    this._stream = null;
    this._src = null;
    this._input = null;
    this._an = null;
    this._lastT = 0;
    this._tex = null;
    this._texFrame = -1;
    this._lastBeatAt = -10;
  }

  get context() { return this.host.audio.context(); }

  /** Input node that Sound Players connect into. */
  input() {
    this._ensureGraph();
    return this._input;
  }

  _ensureGraph() {
    if (this._an) return;
    const ac = this.context;
    if (!ac) return;
    this._input = ac.createGain();
    this._an = ac.createAnalyser();
    this._an.fftSize = 2048;
    this._an.smoothingTimeConstant = 0.55;
    this._an.minDecibels = -100;
    this._an.maxDecibels = -10; // headroom: loud music must not pin the low end at 255
    this._input.connect(this._an);
    this._freq = new Uint8Array(this._an.frequencyBinCount);
    this._time = new Uint8Array(this._an.fftSize);
  }

  configure(settings) {
    const before = JSON.stringify([this.settings.source, this.settings.deviceId]);
    this.settings = { ...defaultSoundSettings(), ...(settings || {}) };
    if (before !== JSON.stringify([this.settings.source, this.settings.deviceId]) && this.wanted) this.restart();
    this.emit('change');
  }

  /** Called whenever something in the project wants sound; starts capture once. */
  need() {
    if (this.wanted) return;
    this.wanted = true;
    this.restart();
  }

  async restart() {
    this._stopCapture();
    this._ensureGraph();
    const src = this.settings.source;
    if (src === 'off') { this._setState('off'); return; }
    this._setState('starting');
    try {
      let stream;
      if (src === 'system') {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Capturing computer audio is not supported here. Use a microphone instead.');
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        for (const t of stream.getVideoTracks()) { t.stop(); stream.removeTrack(t); }
        if (!stream.getAudioTracks().length) throw new Error('This computer did not share its audio. Computer audio works on Windows; on other systems use a microphone or a virtual audio cable.');
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: this.settings.deviceId ? { exact: this.settings.deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      }
      this._stream = stream;
      this._src = this.context.createMediaStreamSource(stream);
      this._src.connect(this._input);
      this.host.audio.resume();
      for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => { if (this._stream === stream) this._setState('error', 'The sound input stopped (device unplugged or sharing ended).'); });
      this._setState('listening');
    } catch (e) {
      const msg = e?.name === 'NotAllowedError' ? 'Permission to listen was refused.' : e?.name === 'NotFoundError' ? 'No microphone was found. Plug one in or choose Computer audio.' : (e?.message || String(e));
      this._setState('error', msg);
    }
  }

  _stopCapture() {
    try { this._src?.disconnect(); } catch { /* ignore */ }
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;
    this._src = null;
  }

  _setState(state, error = null) {
    this.state = state;
    this.error = error;
    this.emit('state', state, error);
  }

  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  }

  /** Analyse one frame. `now` in ms. */
  update(now) {
    if (!this._an) return this.values;
    const t = now / 1000;
    const dt = this._lastT ? t - this._lastT : 1 / 60;
    this._lastT = t;
    this._an.getByteFrequencyData(this._freq);
    this._an.getByteTimeDomainData(this._time);
    this.analysis.process(this._freq, this._time, this.context.sampleRate, dt, t, this.settings);
    if (this.values.beat) this._lastBeatAt = t;
    return this.values;
  }

  /** Energy (0-100) between two frequencies, for custom bands. */
  band(loHz, hiHz) {
    if (!this._an) return 0;
    return this.analysis.band(this._freq, this.context.sampleRate, loHz, hiHz);
  }

  /**
   * GPU texture with the sound data for shaders: 256 x 2 pixels.
   * Row 0: spectrum (R = level, G = peak hold). Row 1: waveform (R).
   */
  texture(renderer, frame) {
    if (!renderer) return null;
    if (!this._tex) {
      this._tex = renderer.createTexture(SPECTRUM_BINS, 2, { withFbo: false });
      this._buf = new Uint8Array(SPECTRUM_BINS * 2 * 4);
    }
    if (this._texFrame !== frame) {
      this._texFrame = frame;
      const a = this.analysis, b = this._buf;
      for (let i = 0; i < SPECTRUM_BINS; i++) {
        const o = i * 4;
        b[o] = a.spectrum[i] * 255; b[o + 1] = a.peaks[i] * 255; b[o + 2] = 0; b[o + 3] = 255;
      }
      for (let i = 0; i < WAVE_SAMPLES; i++) {
        const o = (SPECTRUM_BINS + i) * 4;
        b[o] = a.waveform[i] * 255; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = 255;
      }
      this._tex.uploadData(b, SPECTRUM_BINS, 2);
    }
    return this._tex;
  }
}
