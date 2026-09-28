import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

// Electron's filesystem can read an asar path, but Windows cannot launch an exe inside it.
export function executablePath(binaryPath) {
  return binaryPath?.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2');
}

export async function resolveBinary(name) {
  if (!['ffmpeg', 'yt-dlp'].includes(name)) return null;
  const fileName = process.platform === 'win32' ? `${name}.exe` : name;
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'bin', fileName),
    path.join(projectRoot, 'bin', fileName)
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  if (name === 'ffmpeg') {
    try {
      const ffmpegStatic = await import('ffmpeg-static');
      const binary = executablePath(ffmpegStatic.default);
      if (binary && fs.existsSync(binary)) return binary;
    } catch {}
  }
  try {
    const { stdout } = await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [fileName]);
    return stdout.trim().split(/\r?\n/)[0] || null;
  } catch { return null; }
}

export async function checkBinaries() {
  const ffmpeg = await resolveBinary('ffmpeg');
  const ytDlp = await resolveBinary('yt-dlp');
  return { ffmpeg: { found: !!ffmpeg, path: ffmpeg }, ytDlp: { found: !!ytDlp, path: ytDlp } };
}

export async function engineVersions() {
  const versions = {};
  for (const name of ['ffmpeg', 'yt-dlp']) {
    const binary = await resolveBinary(name);
    try {
      if (!binary) throw new Error('Missing');
      const {stdout} = await execFileAsync(binary, [name === 'ffmpeg' ? '-version' : '--version'], {timeout: 10000, windowsHide: true});
      versions[name] = name === 'ffmpeg' ? stdout.match(/^ffmpeg version\s+(\S+)/)?.[1] || 'unknown' : stdout.trim().slice(0, 80);
    } catch { versions[name] = 'unavailable'; }
  }
  return versions;
}
