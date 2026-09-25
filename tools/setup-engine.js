import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'bin', 'yt-dlp.exe');
const version = '2026.08.19';
const expectedHash = '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a';
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
if (!fs.existsSync(destination) || hash(fs.readFileSync(destination)) !== expectedHash) {
  const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`);
  if (!response.ok) throw new Error(`yt-dlp download failed: HTTP ${response.status}`);
  const binary = Buffer.from(await response.arrayBuffer());
  if (hash(binary) !== expectedHash) throw new Error('yt-dlp checksum did not match the official release');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, binary);
}
console.log(`yt-dlp ready: ${destination}`);
