# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Open `artemis2_mission_control.html` directly in any modern browser (Chrome recommended). No build step, no dependencies to install. Three CDN libraries are loaded at runtime:
- Three.js r128 (`cdnjs.cloudflare.com`)
- OrbitControls addon (`cdn.jsdelivr.net`)
- Google Fonts (Barlow, Share Tech Mono)

### Running the Proxy

For live data (JPL Horizons, NASA OEM), a CORS bridge is needed in browser environments that block cross-origin requests:

```bash
node proxy.js
```

Starts on port 3001. Endpoints: `/horizons` → JPL Horizons API, `/oem` → NASA OEM ZIP (tries 8 date candidates, extracts first file), `/orion-model` → serves local `orion_artemistracker.glb`.

## Other Files

- `artemistracker.html` + `artemistracker_custom.js` — secondary, independent tracker view (separate codebase, ~161 KB + ~103 KB)
- `proxy.js` — Node.js CORS proxy (port 3001)
- `orion_artemistracker.glb` — Orion 3D model asset

## Architecture

Single-file app (`artemis2_mission_control.html`, ~2967 lines) structured as:
- **CSS** (`:root` vars at top): design tokens — `--accent` cyan, `--ok` green, `--warn` amber, `--alert` red
- **HTML**: 4-tab shell (`tab-telemetrie`, `tab-vue3d`, `tab-trajectoire`, `tab-chronologie`). All UI labels are in **French**.
- **JavaScript** (inline, no modules): all logic in one `<script>` block

### Key Constant
```js
LAUNCH_UTC = new Date('2026-04-01T22:35:00Z')
```

### Data Sources (automatic, no user intervention)

| Source | Endpoint | Refresh | Fallback |
|---|---|---|---|
| JPL Horizons | `ssd.jpl.nasa.gov/api/horizons.api` | 5 min | Physics sim |
| NOAA SWPC | `services.swpc.noaa.gov/products/…` | 60 s | Last known |
| NASA DSN Now | `eyes.nasa.gov/dsn/data/dsn.xml` | 10 s | `simulateDSN()` |
| NASA OEM ZIP | `nasa.gov` daily ZIP (8 date candidates) | 30 min | Skip |

Position priority: Horizons real data → `simulateOrion()` physics fallback → last known position.

### Scheduler

The `scheduler` object drives all periodic fetches. Intervals are set up in `init()`:

| Interval | Action |
|---|---|
| 1 s | `tickClock()` — MET display |
| 5 s | `updateNav()`, `draw2D()`, `pushHistory()` |
| 10 s | `scheduler.runDSN()` |
| 30 s | `buildTimeline()` |
| 60 s | `scheduler.runSWPC()` |
| 5 min | `scheduler.runHorizons()` |
| 30 min | `scheduler.runOEM()` |

### Physics Simulation — `simulateOrion(date)`
Propagates Orion through 7 phases using Keplerian mechanics + patched-conic approximation. Returns `{ pos:{x,y,z}, vel:{x,y,z}, phase }` in J2000 km. Phase boundaries (MET hours): ascent 0–0.15h, LEO/HEO 0.15–12h, TLI burn 12–12.5h, trans-lunar coast 12.5–96h, lunar flyby 96–104h, return 104–224h, reentry 224–226h.

### Moon Ephemeris — `getMoonJ2000(date)`
Simplified ELP2000 series → J2000 Cartesian km. Used by all views. `getSunJ2000(date)` uses a Meeus algorithm for Sun position.

### Coordinate System
J2000 (Earth-centered inertial), positions in km. Three.js uses `(x, z, -y)` mapping (Y-up) divided by `SCALE=1000`.

### 3D View
- `initThree()` — builds scene: Earth, Moon, Orion, starfield, trajectory + prediction lines, labels. **Lazy-initialized on first tab click** (`threeInited` flag — not built at startup).
- `buildOrionModel()` / `buildFallbackOrionModel()` — procedurally builds Orion geometry (crew module, ESM, solar arrays, engines); fallback used if GLB unavailable.
- `animateThree()` — render loop; calls `updateThree()` every frame
- `buildPrediction()` — 120 × 30-min steps from OEM (if loaded) or `simulateOrion()`, stored in `state.prediction`
- Camera modes: `free` (OrbitControls), `follow` (lerp to Orion), `system` (wide view)
- Layer toggles: `layers` object; buttons call `toggleLayer(name)`

### 2D View
- `draw2D()` — canvas renderer, called every 5 s and on pan/zoom
- Reference frame: `ref2 = 'earth'|'moon'`; transforms via `wt(wx,wy)` closure

### Timeline — `getMissionEvents()`
Returns array of phases with sub-events keyed by absolute `Date` objects. `buildTimeline()` classifies each event as `past`/`current`/`future` and renders countdown timers.

### State Objects
```js
state = { pos, vel, posSource, history[], prediction[], predictionDates[] }
swpcData  // Solar weather: Kp index, Bz, X-ray class, solar wind
dsnData   // DSN stations and dish contact status
```

Data source objects (each has a `.fetch()` method):
```js
horizonsSrc, swpcSrc, dsnSrc, oemSrc
```

`pushHistory()` appends current position every 5 s, capped at `MAX_HIST=600`.
