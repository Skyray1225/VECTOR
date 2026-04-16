/**
 * api/iss-crew.js
 * Returns current ISS crew.
 * Primary: corquaid.github.io people-in-space API (maintained, ISS flag per member)
 * Fallback: hardcoded Expedition 74 (accurate as of April 2026)
 */
const https = require('https');

// Fallback — Expedition 74, April 2026
const EXP74_FALLBACK = [
  { name: 'Sergey Kud-Sverchkov', agency: 'Roscosmos', role: 'Commander',      accessMission: 'Soyuz MS-28' },
  { name: 'Sergey Mikayev',       agency: 'Roscosmos', role: 'Flight Engineer', accessMission: 'Soyuz MS-28' },
  { name: 'Christopher Williams', agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Soyuz MS-28' },
  { name: 'Jessica Meir',         agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Crew-12 Dragon' },
  { name: 'Jack Hathaway',        agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Crew-12 Dragon' },
  { name: 'Sophie Adenot',        agency: 'ESA',       role: 'Flight Engineer', accessMission: 'Crew-12 Dragon' },
  { name: 'Andrey Fedyaev',       agency: 'Roscosmos', role: 'Flight Engineer', accessMission: 'Crew-12 Dragon' },
];

function fetchJson(url, timeoutMs = 10000) {
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=43200');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── Primary: corquaid people-in-space (iss: true filter) ─────────────────
  try {
    const resp = await fetchJson(
      'https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json',
      10000
    );
    if (resp.status === 200 && Array.isArray(resp.data.people)) {
      const issMembers = resp.data.people
        .filter((p) => p.iss === true)
        .map((p) => ({
          name:          p.name,
          agency:        p.agency || 'NASA',
          role:          p.position || 'Flight Engineer',
          accessMission: p.spacecraft || null,
        }));
      if (issMembers.length > 0) {
        return res.status(200).json({
          status:     'OK',
          source:     'people-in-space API',
          fetchedAt:  new Date().toISOString(),
          expedition: { name: `Expedition ${resp.data.iss_expedition || ''}` },
          crew:       issMembers,
        });
      }
    }
  } catch (_) { /* fall through */ }

  // ── Fallback: hardcoded Expedition 74 ────────────────────────────────────
  res.status(200).json({
    status:     'OK',
    source:     'Données statiques (Exp. 74)',
    fetchedAt:  new Date().toISOString(),
    expedition: { name: 'Expedition 74' },
    crew:       EXP74_FALLBACK,
  });
};
