import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');

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
      if (fs.existsSync(ffmpegStatic.default)) return ffmpegStatic.default;
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
