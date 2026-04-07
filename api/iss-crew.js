/**
 * api/iss-crew.js
 * Returns current ISS crew via Open Notify API (primary) with a hardcoded
 * Expedition 74 fallback so the page always renders something.
 */
const https = require('https');
const http  = require('http');

// Hardcoded fallback — accurate for Expedition 74 (early 2026)
const EXP74_FALLBACK = [
  { name: 'Oleg Kononenko',    agency: 'Roscosmos', role: 'Commander',      accessMission: 'Soyuz MS-25' },
  { name: 'Nikolai Chub',      agency: 'Roscosmos', role: 'Flight Engineer', accessMission: 'Soyuz MS-25' },
  { name: 'Tracy Dyson',       agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Soyuz MS-25' },
  { name: 'Matthew Dominick',  agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Crew-8' },
  { name: 'Michael Barratt',   agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Crew-8' },
  { name: 'Alexander Grebenkin',agency: 'Roscosmos', role: 'Flight Engineer', accessMission: 'Crew-8' },
  { name: 'Jeanette Epps',     agency: 'NASA',      role: 'Flight Engineer', accessMission: 'Crew-8' },
];

function guessAgency(name) {
  const n = name.toLowerCase();
  if (/kononenko|chub|grebenkin|fedyaev|borisov|ovchinin|skripochka|prokopyev/.test(n)) return 'Roscosmos';
  if (/pesquet|cristoforetti|maurer|adenot|mogensen|astrid|haag/.test(n)) return 'ESA';
  if (/furukawa|wakata|hoshide|onishi|kanai/.test(n)) return 'JAXA';
  if (/parmitano/.test(n)) return 'ESA';
  return 'NASA';
}

function fetchUrl(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'VECTOR-ISS-MissionControl/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
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

  // ── Primary: Open Notify ──────────────────────────────────────────────────
  try {
    const resp = await fetchUrl('http://api.open-notify.org/astros.json', 8000);
    if (resp.status === 200) {
      const data = JSON.parse(resp.body);
      if (data.message === 'success' && Array.isArray(data.people)) {
        const issMembers = data.people
          .filter((p) => p.craft === 'ISS')
          .map((p) => ({
            name: p.name,
            agency: guessAgency(p.name),
            role: 'Flight Engineer',
            accessMission: null,
          }));
        if (issMembers.length > 0) {
          return res.status(200).json({
            status: 'OK',
            source: 'Open Notify',
            fetchedAt: new Date().toISOString(),
            expedition: { name: 'Expedition 74' },
            crew: issMembers,
          });
        }
      }
    }
  } catch (_) { /* fall through */ }

  // ── Fallback: hardcoded Expedition 74 ────────────────────────────────────
  res.status(200).json({
    status: 'OK',
    source: 'Données statiques (Exp. 74)',
    fetchedAt: new Date().toISOString(),
    expedition: { name: 'Expedition 74' },
    crew: EXP74_FALLBACK,
  });
};
