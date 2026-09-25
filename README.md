# DeckPrep

DeckPrep is a Windows desktop app for building DJ ready MP3 crates from links and pasted tracklists. Paste a Spotify, SoundCloud, or YouTube link, or a list of artist and title lines; review the loaded tracks; choose a destination; and start a batch download with metadata and artwork.

**Use DeckPrep only for audio you have permission to download and copy.** A streaming link or subscription alone does not grant that permission. The app asks for confirmation before starting a batch. Spotify links provide tracklist metadata; DeckPrep searches separately for matching audio and does not copy audio from Spotify's service. You are responsible for following source site terms and rights holder permissions.

## Features

- Link and pasted tracklist ingestion.
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
