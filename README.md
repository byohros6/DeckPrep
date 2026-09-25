# DeckPrep

DeckPrep is a Windows desktop app for preparing DJ crates from links and pasted tracklists. Paste a track, album, or playlist link, several links on separate lines, or a list of artist and title lines. Review the queue, choose a destination, and download MP3 files with metadata and artwork.

Spotify links supply track metadata. DeckPrep finds matching audio from available sources; it does not extract audio from Spotify. Use sources and audio according to their terms and permissions.

## Features

- Single links, multiple links, and pasted tracklists.
- Mix and edit names retained in search and filenames.
- Duration comparison to help reject the wrong version when source timing is available.
- MP3 output at 320 kbps and 44.1 kHz stereo. Re-encoding cannot improve source quality.
- ID3 tags and embedded artwork when metadata is available.
- Flat crates, artist or genre folders, and sampler output.
- Concurrent processing, per-track status, cancellation, and skip-existing behavior.

## Develop

```sh
npm install
npm run setup:engine
npm start
```

`setup:engine` fetches the official Windows `yt-dlp` executable. FFmpeg comes from the `ffmpeg-static` dependency, or from a local `bin/ffmpeg.exe`.

## Test and package

```sh
npm test
npm run dist:portable
```

The portable executable is created under `dist/`. The build bundles `yt-dlp` and FFmpeg; run `npm run setup:engine` before packaging on a fresh checkout.

DeckPrep is independent of Spotify, SoundCloud, YouTube, and DJ hardware or software vendors. It is not affiliated with or endorsed by them.
