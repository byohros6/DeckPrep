import { spawn } from 'node:child_process';
import { resolveBinary } from './binaryManager.js';

export const ANALYSIS_VERSION = 1;
const RATE = 8000;
const WINDOW = 800; // 100 ms; retain energy in either channel (never average opposite phases).
const db = value => value > 0 ? 20 * Math.log10(value) : -120;

export function summarizeAudio(peaks, durationSec) {
  if (!peaks.length) throw new Error('No audio frames decoded');
  const intervals = threshold => {
    const result = []; let start = null;
    for (let i = 0; i <= peaks.length; i++) {
      if (i < peaks.length && db(peaks[i]) <= threshold) { start ??= i / 10; }
      else if (start !== null) { result.push({startSec: start, endSec: Math.min(i / 10, durationSec)}); start = null; }
    }
    return result;
  };
  let peak = 0; for (const value of peaks) peak = Math.max(peak, value);
  if (db(peak) <= -70) throw new Error('Audio is empty or effectively silent; review the original recording');
  const silence = intervals(-50);
  const quiet = intervals(-40);
  const tail = (ranges, minimum, fraction = 0) => ranges.find(item => item.endSec >= durationSec - 0.11 && item.endSec - item.startSec >= minimum && (item.endSec - item.startSec) / durationSec >= fraction);
  const ending = tail(silence, 10) || tail(quiet, 30, 0.1);
  const stride = Math.max(1, Math.ceil(peaks.length / 600));
  const waveform = [];
  for (let i = 0; i < peaks.length; i += stride) waveform.push(Math.max(...peaks.slice(i, i + stride)));
  return {
    version: ANALYSIS_VERSION, durationSec, peakDb: db(peak), waveform,
    silenceIntervals: silence.filter(item => item.endSec - item.startSec >= 10).slice(0, 100),
    ending: ending ? { ...ending, suggestedEndSec: Math.min(durationSec, ending.startSec + 2) } : null,
    warnings: ending ? ['Possible silent ending; preview before choosing whether to trim.'] : []
  };
}

export async function inspectAudio(file, {signal, expectedDurationSec = 0, requireMp3 = false} = {}) {
  const binary = await resolveBinary('ffmpeg');
  if (!binary) throw new Error('FFmpeg is missing');
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['-hide_banner', '-nostdin', '-xerror', '-err_detect', 'explode', '-i', file,
      '-map', '0:a:0', '-vn', '-ac', '2', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'], {signal, windowsHide: true});
    let stderr = ''; let carry = Buffer.alloc(0); let frames = 0; let count = 0; let peak = 0; let sumSquares = 0; let failure;
    const peaks = [];
    const timeout = setTimeout(() => { failure = new Error('Audio inspection timed out'); child.kill(); }, 120000);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-64000); });
    child.stdout.on('data', chunk => {
      const data = Buffer.concat([carry, chunk]);
      const end = data.length - data.length % 8;
      for (let i = 0; i < end; i += 8) {
        const left = data.readFloatLE(i), right = data.readFloatLE(i + 4);
        if (!Number.isFinite(left) || !Number.isFinite(right)) { failure = new Error('Invalid audio samples'); child.kill(); break; }
        peak = Math.max(peak, Math.abs(left), Math.abs(right));
        sumSquares += (left * left + right * right) / 2;
        frames++; count++;
        if (count === WINDOW) { peaks.push(peak); peak = 0; count = 0; }
        if (frames > RATE * 7200) { failure = new Error('Audio longer than two hours is not supported in this beta'); child.kill(); break; }
      }
      carry = data.subarray(end);
    });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => {
      clearTimeout(timeout);
      try {
        signal?.throwIfAborted();
        if (failure) throw failure;
        if (code !== 0) throw new Error('Audio could not be decoded completely; it may be damaged or unsupported');
        const codec = stderr.match(/Audio:\s*([^,\s]+)/)?.[1] || 'unknown';
        if (requireMp3 && !codec.startsWith('mp3')) throw new Error('Output is not MP3 audio');
        const durationSec = frames / RATE;
        if (durationSec < 0.1) throw new Error('No complete audio decoded');
        if (expectedDurationSec > 0 && Math.abs(durationSec - expectedDurationSec) > Math.max(2, expectedDurationSec * 0.01)) throw new Error('Decoded duration differs from the selected recording; review for truncation');
        if (count) peaks.push(peak);
        resolve({...summarizeAudio(peaks, durationSec), codec, rmsDb: db(Math.sqrt(sumSquares / frames)),
          sourceBitrateKbps: Number(stderr.match(/bitrate:\s*(\d+) kb\/s/)?.[1]) || null});
      } catch (error) { reject(error); }
    });
  });
}
