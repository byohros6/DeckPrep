import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { versionedTitle, cleanArtist } from './metadata.js';

export function recordingIdentity(track) {
  return JSON.stringify([cleanArtist(track.artist).toLowerCase(), versionedTitle(track).toLowerCase(),
    (track.localPath ? track.localPath + ':' + (track.sourceSha256 || '') : '') || track.matchUrl || track.directUrl || '', track.trimDecision?.endSec || null]);
}
export async function hashFile(file, signal) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, {signal})) hash.update(chunk);
  return hash.digest('hex');
}
export function readManifest(file) {
  try { return JSON.parse(fs.readFileSync(`${file}.deckprep.json`, 'utf8')); } catch { return null; }
}
export async function writeManifest(file, track, verification) {
  const data = {version: 1, identity: recordingIdentity(track), sha256: await hashFile(file),
    title: versionedTitle(track), artist: track.artist, requested: track.requested,
    selectedRecording: track.selectedRecording, inspection: track.inspection,
    trimDecision: track.trimDecision || null, verification, createdAt: new Date().toISOString()};
  await fs.promises.writeFile(`${file}.deckprep.json`, JSON.stringify(data, null, 2), {flag: 'wx'});
  return data;
}
