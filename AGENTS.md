# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

This repository is a static mission-control site for Artemis II / VECTOR. The codebase is mostly plain HTML, CSS, and inline JavaScript, with a small Node/Vercel proxy layer for external NASA/JPL data.

Primary entry points:

- `index.html` - landing page / mission hub
- `about.html` - project presentation
- `artemis2_mission_control.html` - main Artemis II mission-control app
- `artemistracker.html` - secondary tracker experience
- `arow_page.html` - additional standalone page

Supporting files:

- `api/horizons.js` - Vercel serverless proxy for JPL Horizons
- `api/oem.js` - Vercel serverless proxy for NASA OEM ZIP ephemeris
- `proxy.js` - local Node proxy for browser-based development
- `artemistracker_custom.js`, `arow_loader.js` - standalone JavaScript files used by secondary pages
- `orion_artemistracker.glb`, `img/`, `vector_logo.*`, `vector_favicon.png` - static assets

## Build And Run

There is no build pipeline, bundler, or package manager setup in this repo.

### Static local preview

Use this when editing mostly static UI that does not require the Vercel API routes:

```powershell
start index.html
```

Or open any HTML file directly in a modern browser.

### Local proxy mode

Use this when a page needs live Horizons/OEM data through a local CORS bridge:

```powershell
node proxy.js
```

This starts a local server on `http://localhost:3001` with:

- `/horizons`
- `/oem`
- `/orion-model`

### Vercel local dev mode

Use this when validating the production-style `/api/*` routes used by `artemis2_mission_control.html`:

```powershell
vercel dev
```

The app expects:

- `HORIZONS_PROXY = '/api/horizons'`
- `OEM_PROXY = '/api/oem'`

`vercel.json` rewrites `/` to `/index.html` and configures `api/oem.js` with `maxDuration: 30`.

## Test And Verification

There is no automated test suite configured in this repository. No `package.json`, test runner, linter, or formatter is currently present.

### Expected verification workflow

After changes, verify manually in a browser:

1. Open `index.html` and ensure navigation and layout still render correctly.
2. Open `artemis2_mission_control.html` and confirm the main tabs load.
3. Check browser console for JavaScript errors.
4. Confirm the 2D and 3D views still initialize.
5. If data-fetching code changed, verify `/api/horizons` and `/api/oem` through `vercel dev` or `node proxy.js`.
6. If proxy code changed, hit the endpoint directly in a browser:

```powershell
start http://localhost:3001/horizons
start http://localhost:3001/oem
```

### Practical test commands

These are validation commands, not an automated suite:

```powershell
node --check proxy.js
node --check api\horizons.js
node --check api\oem.js
```

## Architecture Notes

### Frontend style

The repo is intentionally low-tooling:

- plain HTML files
- CSS embedded in each page
- JavaScript embedded inline or in standalone script files
- CDN-loaded libraries instead of installed dependencies

The main mission-control page loads external browser libraries from CDNs, including:

- Three.js r128
- OrbitControls
- GLTFLoader
- STLLoader

### Main mission-control app

`artemis2_mission_control.html` is the primary application. It is a large single-file app with:

- design tokens in `:root`
- multi-tab UI
- inline mission simulation and rendering logic
- direct `fetch()` calls to NOAA, DSN, and local/Vercel proxy endpoints

Important constants and integrations:

- `LAUNCH_UTC = new Date('2026-04-01T22:35:00Z')`
- Horizons proxy: `/api/horizons`
- OEM proxy: `/api/oem`

### Backend/proxy style

The server-side code is minimal CommonJS Node code:

- no external npm dependencies
- only built-in modules such as `https`, `http`, `url`, `fs`, `path`, `zlib`
- defensive timeout handling for upstream NASA/JPL requests

## Coding Rules

### General rules

- Preserve the no-build, low-dependency approach unless the user explicitly asks to change it.
- Prefer simple HTML/CSS/JavaScript changes over introducing frameworks, transpilers, or bundlers.
- Keep static pages directly runnable in a browser when possible.
- Do not add npm dependencies lightly; the current repo intentionally avoids them.

### JavaScript rules

- Match the existing style of the file you are editing.
- For `api/*.js` and `proxy.js`, stay with CommonJS and Node built-ins.
- For large inline scripts, make targeted edits and avoid broad refactors unless required.
- Keep network timeouts, fallback behavior, and graceful degradation intact when touching live-data code.

### HTML/CSS rules

- Preserve the existing French UI copy unless the task explicitly asks for language changes.
- Reuse existing design tokens and visual conventions before adding new ones.
- Avoid splitting the main single-file apps into multi-file architectures unless explicitly requested.

### Data and integration rules

- Treat external APIs as unstable and latency-prone; maintain fallbacks where they already exist.
- Do not hardcode behavior that assumes Horizons, NOAA, DSN, or OEM endpoints always respond.
- When editing route paths, keep local proxy mode and Vercel `/api/*` mode consistent.

### File handling rules

- Large binary assets are part of the project; do not rename or relocate them casually.
- Be careful with absolute/relative asset paths because pages are designed to work as static files.
- Prefer minimal diffs in large HTML files to reduce regression risk.

## Agent Expectations

- Read the target page or script before editing; several pages are standalone and do not share code.
- If the task concerns deployment behavior, inspect both `vercel.json` and the relevant `api/*.js` file.
- If the task concerns live mission data, verify whether the code path uses browser `fetch()`, local proxy routes, or Vercel serverless routes.
- If no automated test exists for a change, report the manual verification that was performed and any remaining gaps.
