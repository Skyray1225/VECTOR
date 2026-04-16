/**
 * api/iss-docking.js
 * Returns current ISS docking configuration.
 * Primary: Launch Library 2 via SpaceLaunchNow mirror (live, auto-updating).
 * Fallback: hardcoded Expedition 74 (valid ~Nov 2025 – Oct 2026).
 * Last updated: 2026-04-16
 */
const https = require('https');

// ── Fallback — Expedition 74 ─────────────────────────────────────────────────
const FALLBACK = [
  { vehicle: 'Soyuz MS-28',      type: 'crew',  port: 'Rassvet nadir',  module: 'MRM-1',  agency: 'Roscosmos',        dockedSince: '2025-11-27' },
  { vehicle: 'Crew-12 Dragon',   type: 'crew',  port: 'Harmony zenith', module: 'IDA-3',  agency: 'SpaceX / NASA',    dockedSince: '2026-02-14' },
  { vehicle: 'Progress MS-32',   type: 'cargo', port: 'Zvezda aft',     module: 'SM',     agency: 'Roscosmos',        dockedSince: '2025-09-13' },
  { vehicle: 'Progress MS-33',   type: 'cargo', port: 'Poisk zenith',   module: 'MRM-2',  agency: 'Roscosmos',        dockedSince: '2026-03-24' },
  { vehicle: 'Cygnus CRS NG-24', type: 'cargo', port: 'Unity nadir',    module: 'Node 1', agency: 'Northrop Grumman', dockedSince: '2026-04-13' },
];

function fetchJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'VECTOR-ISS-MissionControl/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout')));
  });
}

// 'Capsule' type → crew; everything else → cargo
function vehicleType(event) {
  const typeName = event.flight_vehicle?.spacecraft?.spacecraft_config?.type?.name || '';
  return /capsule|crew/i.test(typeName) ? 'crew' : 'cargo';
}

// Normalize LL2 verbose agency names
function normalizeAgency(event) {
  const name = event.flight_vehicle?.spacecraft?.spacecraft_config?.agency?.name || '';
  if (/spacex/i.test(name))            return 'SpaceX / NASA';
  if (/roscosmos|russian federal/i.test(name)) return 'Roscosmos';
  if (/northrop/i.test(name))          return 'Northrop Grumman';
  if (/nasa/i.test(name))              return 'NASA';
  if (/esa|european/i.test(name))      return 'ESA';
  if (/jaxa/i.test(name))              return 'JAXA';
  return name;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── Primary: Launch Library 2 via SpaceLaunchNow ────────────────────────
  try {
    const resp = await fetchJson(
      'https://spacelaunchnow.me/api/ll/2.2.0/docking_event/?space_station=4&limit=20&ordering=-docking',
      12000
    );
    if (resp.status === 200 && Array.isArray(resp.data?.results)) {
      const docked = resp.data.results
        .filter(e => e.departure === null) // still docked
        .filter(e => /international space station/i.test(e.docking_location?.spacestation?.name || '')) // ISS only
        .map(e => ({
          vehicle:     e.flight_vehicle?.spacecraft?.name || 'Unknown',
          type:        vehicleType(e),
          port:        e.docking_location?.name || '—',
          module:      null, // not provided by LL2
          agency:      normalizeAgency(e),
          dockedSince: e.docking ? e.docking.slice(0, 10) : null,
        }));

      if (docked.length > 0) {
        return res.status(200).json({
          status:    'OK',
          source:    'Launch Library 2 / SpaceLaunchNow',
          fetchedAt: new Date().toISOString(),
          docked,
        });
      }
    }
  } catch (_) { /* fall through to fallback */ }

  // ── Fallback: hardcoded Expedition 74 ───────────────────────────────────
  res.status(200).json({
    status:    'OK',
    source:    'Données statiques Exp. 74 (fallback)',
    updatedAt: '2026-04-16',
    fetchedAt: new Date().toISOString(),
    docked:    FALLBACK,
  });
};
