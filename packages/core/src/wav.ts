// WAV (RIFF PCM) encode, decode, slice and waveform peaks. Pure, so the worker, the web app
// and tests share one implementation. Cleared-lane audio only; never YouTube audio.

export type PcmAudio = {
  sampleRate: number;
  /** One Float32Array per channel, samples in [-1, 1]. */
  channels: Float32Array[];
};

export class WavError extends Error {}

const ascii = (view: DataView, at: number, len: number) => {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
  return s;
};

/** Decodes PCM 8/16/24/32-bit integer and 32-bit float WAV, including WAVE_FORMAT_EXTENSIBLE. */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE")
    throw new WavError("Not a WAV file.");
  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataAt = -1;
  let dataLen = 0;
  let at = 12;
  while (at + 8 <= bytes.byteLength) {
    const id = ascii(view, at, 4);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the subformat GUID.
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === "data") {
      dataAt = body;
      dataLen = Math.min(size, bytes.byteLength - body);
      break;
    }
    at = body + size + (size % 2);
  }
  if (dataAt < 0 || channelCount < 1 || sampleRate < 1)
    throw new WavError("WAV has no fmt or data chunk.");
  const isFloat = format === 3;
  if (!(format === 1 || isFloat)) throw new WavError(`Unsupported WAV format ${format}.`);
  if (isFloat ? bits !== 32 : ![8, 16, 24, 32].includes(bits))
    throw new WavError(`Unsupported bit depth ${bits}.`);
  const bytesPer = bits / 8;
  const frames = Math.floor(dataLen / (bytesPer * channelCount));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));
  let p = dataAt;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channelCount; c++) {
      let v: number;
      if (isFloat) v = view.getFloat32(p, true);
      else if (bits === 8) v = (view.getUint8(p) - 128) / 128;
      else if (bits === 16) v = view.getInt16(p, true) / 32768;
      else if (bits === 24) {
        const raw = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
        v = raw / 8388608;
      } else v = view.getInt32(p, true) / 2147483648;
      (channels[c] as Float32Array)[f] = v;
      p += bytesPer;
    }
  }
  return { sampleRate, channels };
}

/** Encodes PCM as a 16- or 24-bit integer WAV. */
export function encodeWav(audio: PcmAudio, bitDepth: 16 | 24 = 16): Uint8Array {
  const channelCount = audio.channels.length;
  if (channelCount < 1) throw new WavError("No channels.");
  const frames = audio.channels[0]?.length ?? 0;
  const bytesPer = bitDepth / 8;
  const dataLen = frames * channelCount * bytesPer;
  if (dataLen + 36 > 0xffffffff) throw new WavError("Too long for a WAV file.");
  const out = new Uint8Array(44 + dataLen);
  const view = new DataView(out.buffer);
  const write = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channelCount * bytesPer, true);
  view.setUint16(32, channelCount * bytesPer, true);
  view.setUint16(34, bitDepth, true);
  write(36, "data");
  view.setUint32(40, dataLen, true);
  let p = 44;
  const max = bitDepth === 16 ? 32767 : 8388607;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channelCount; c++) {
      const s = Math.max(-1, Math.min(1, (audio.channels[c] as Float32Array)[f] ?? 0));
      const v = Math.round(s * max);
      if (bitDepth === 16) view.setInt16(p, v, true);
      else {
        view.setUint8(p, v & 0xff);
        view.setUint8(p + 1, (v >> 8) & 0xff);
        view.setInt8(p + 2, v >> 16);
      }
      p += bytesPer;
    }
  }
  return out;
}

export function durationSeconds(audio: PcmAudio): number {
  return (audio.channels[0]?.length ?? 0) / audio.sampleRate;
}

/** The audio between two times in seconds, clamped to the file. */
export function sliceAudio(audio: PcmAudio, startS: number, endS: number): PcmAudio {
  const frames = audio.channels[0]?.length ?? 0;
  const a = Math.max(0, Math.min(frames, Math.round(startS * audio.sampleRate)));
  const b = Math.max(a, Math.min(frames, Math.round(endS * audio.sampleRate)));
  return { sampleRate: audio.sampleRate, channels: audio.channels.map((ch) => ch.slice(a, b)) };
}

export type Peaks = {
  version: 1;
  sampleRate: number;
  frames: number;
  /** min/max pairs per bucket across all channels, rounded to 3 places. */
  peaks: number[];
};

/** Waveform peaks: `buckets` min/max pairs across all channels. */
export function computePeaks(audio: PcmAudio, buckets = 1000): Peaks {
  const frames = audio.channels[0]?.length ?? 0;
  const n = Math.max(1, Math.min(buckets, frames || 1));
  const peaks: number[] = [];
  for (let b = 0; b < n; b++) {
    const from = Math.floor((b * frames) / n);
    const to = Math.max(from + 1, Math.floor(((b + 1) * frames) / n));
    let lo = 0;
    let hi = 0;
    for (const ch of audio.channels) {
      for (let i = from; i < to && i < frames; i++) {
        const v = ch[i] ?? 0;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    peaks.push(Math.round(lo * 1000) / 1000, Math.round(hi * 1000) / 1000);
  }
  return { version: 1, sampleRate: audio.sampleRate, frames, peaks };
}
