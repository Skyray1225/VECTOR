# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Running the App

Open `artemis2_mission_control.html` directly in any modern browser (Chrome recommended). No build step, no dependencies to install. Two CDN libraries are loaded at runtime:
- Three.js r128 (`cdnjs.cloudflare.com`)
- OrbitControls addon (`cdn.jsdelivr.net`)

## Architecture

Single-file app (`artemis2_mission_control.html`, ~850 lines) structured as:
- **CSS** (`:root` vars at top): design tokens — `--accent` cyan, `--ok` green, `--warn` amber, `--alert` red
- **HTML**: 4-tab shell (`tab-telemetrie`, `tab-vue3d`, `tab-trajectoire`, `tab-chronologie`)
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

Position priority: Horizons real data → `simulateOrion()` physics fallback → last known position.

### Physics Simulation — `simulateOrion(date)`
Propagates Orion through 7 phases using Keplerian mechanics + patched-conic approximation. Returns `{ pos:{x,y,z}, vel:{x,y,z}, phase }` in J2000 km. Phase boundaries (MET hours): ascent 0–0.15h, LEO/HEO 0.15–12h, TLI burn 12–12.5h, trans-lunar coast 12.5–96h, lunar flyby 96–104h, return 104–224h, reentry 224–226h.

### Moon Ephemeris — `getMoonJ2000(date)`
Simplified ELP2000 series → J2000 Cartesian km. Used by all views.

### Coordinate System
J2000 (Earth-centered inertial), positions in km. Three.js uses `(x, z, -y)` mapping (Y-up) divided by `SCALE=1000`.

### 3D View
- `initThree()` — builds scene: Earth, Moon, Orion cone, starfield, trajectory + prediction lines, labels
- `animateThree()` — render loop; calls `updateThree()` every frame
- `buildPrediction()` — 120 × 30-min steps from `simulateOrion()`, stored in `state.prediction`
- Camera modes: `free` (OrbitControls), `follow` (lerp to Orion), `system` (wide view)
- Layer toggles: `layers` object; buttons call `toggleLayer(name)`

### 2D View
- `draw2D()` — canvas renderer, called every 5 s and on pan/zoom
- Reference frame: `ref2 = 'earth'|'moon'`; transforms via `wt(wx,wy)` closure

### Timeline — `getMissionEvents()`
Returns array of phases with sub-events keyed by absolute `Date` objects. `buildTimeline()` classifies each event as `past`/`current`/`future` and renders countdown timers.

### State Object
```js
state = { pos, vel, posSource, history[], prediction[] }
```
`pushHistory()` appends current position every 5 s, capped at `MAX_HIST=600`.
