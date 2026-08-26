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
