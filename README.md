# Movie Store Showcase

A single-page web application that simulates a movie store with procedurally generated movie data, trailers, and reviews.

## Features

- **Procedural Generation** — Movies, trailers, and reviews generated from a seed
- **Multi-language Support** — English (US), German (Germany), Ukrainian (Ukraine)
- **Real-time Trailers** — 5-10 second trailers with typographic animations, scenes, and audio
- **Gallery & Table Views** — Browse movies in grid or table format
- **Like System** — Tap to like movies (0-500, stored in browser)
- **ZIP Export** — Download all trailers from current page

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:5173

## Requirements

- Node.js 18+
- ffmpeg installed and in PATH

## Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** Express 5
- **Video:** ffmpeg (spawned child process)
- **Data:** @faker-js/faker for localized fake data
- **RNG:** Custom seeded PRNG using pure-rand

## Rendering & Caching

Trailer/poster rendering is expensive (up to a few seconds for a cold render), so
the server layers caches to keep repeated requests on the hot path cheap:

1. **In-flight deduplication** — identical concurrent requests share a single
   render Promise instead of re-rendering.
2. **Concurrency limit** — at most `MAX_CONCURRENT_RENDERS` ffmpeg-heavy renders
   run at once (default 2).
3. **Finished-trailer cache** — finished MP4s are stored on disk as
   `{seed}-{locale}-{index}.mp4` and streamed straight back on subsequent hits
   (~ms). Bounded by `MAX_TRAILER_CACHE_MB` with LRU eviction.
4. **Source-clip cache** — content-hash-keyed `.cache/clips/{hash}.{ext}` for
   downloaded remote clips, with sidecar metadata and LRU eviction
   (`MAX_CLIP_CACHE_MB`). Failures are remembered in-memory with a short TTL and
   never persisted.

Cold renders are **offloaded to a pool of worker threads** (`MAX_CONCURRENT_RENDERS`
workers), so heavy compositing/baking no longer blocks the HTTP event loop and
concurrent renders truly run in parallel across cores. Worker output is
byte-identical to the same render on the main thread, and if worker spawning
fails the server transparently falls back to rendering in-process.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRAILER_CACHE_DIR` | `.cache/trailers` | Finished-trailer/poster cache directory |
| `CLIP_CACHE_DIR` | `.cache/clips` | Downloaded source-clip cache directory |
| `MAX_TRAILER_CACHE_MB` | `4096` | Byte cap for the trailer cache (0 = default) |
| `MAX_CLIP_CACHE_MB` | `2048` | Byte cap for the clip cache (0 = default) |
| `MAX_CONCURRENT_RENDERS` | `2` | Max simultaneous trailer/poster renders |

Inspect cache usage via `GET /api/cache`, and prewarm popular trailers in the
background with `POST /api/cache/prewarm?seed=...&count=N` (respects the
concurrency limit).

## How It Works

1. Enter a seed (or click shuffle for random)
2. Select language from dropdown
3. Adjust reviews parameter
4. Click table/gallery icon to switch views
5. Click a movie row/card to expand
6. Click play to watch the trailer
7. Use +/- buttons to like movies

## Project Structure

```
client/          React frontend
server/          Express API
  lib/
    generate/    Movie data generation
    trailer/     Video rendering pipeline
    paint/       Frame buffer operations
    type/        Font rasterizer
    scene/       Procedural scenes
locales/         Language JSON files
shared/          Shared utilities (seed, times)
```

## License

MIT
