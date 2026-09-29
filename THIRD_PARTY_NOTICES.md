# Third-party components

DeckPrep application code is MIT licensed (see LICENSE). That license does not replace the licenses of bundled components.

- Electron 44.4.5: MIT, with Chromium/Node and other third-party notices shipped by Electron. https://github.com/electron/electron
- node-id3: MIT. https://github.com/Zazama/node-id3
- music-metadata: MIT. Reads tags from local files; exact package version is recorded in package-lock.json. https://github.com/Borewit/music-metadata
- ffmpeg-static 5.3.0: GPL-3.0-or-later package. Windows binary observed in this build: FFmpeg 6.1.1 essentials from gyan.dev, configured with `--enable-gpl --enable-version3`. Included license and build README are in docs/licenses. https://github.com/eugeneware/ffmpeg-static ; https://www.gyan.dev/ffmpeg/builds/ ; https://ffmpeg.org/legal.html
- yt-dlp: pinned Windows executable from https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19 . Its executable includes third-party components; consult the release's source and licensing notices, not only the Python project's headline license. https://github.com/yt-dlp/yt-dlp#license

Release gate: before distributing a new public binary, verify complete notices and corresponding-source availability for the exact FFmpeg and yt-dlp binaries and all bundled dependencies. This inventory is not a completed commercial redistribution review. Do not infer that the MIT application license settles those obligations. Do not include extracted third-party app research or sample music in releases.
