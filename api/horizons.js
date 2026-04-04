// Vercel serverless function — JPL Horizons CORS proxy
const https = require('https');
const url   = require('url');

function fetchUrl(targetUrl, timeout = 14000) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: { 'User-Agent': 'ArtemisII-MissionControl/1.0' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(new Error('Timeout')); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const parsed = url.parse(req.url, true);
  const qs = new URLSearchParams(parsed.query).toString();
  const target = 'https://ssd.jpl.nasa.gov/api/horizons.api' + (qs ? '?' + qs : '');

  try {
    const { status, body } = await fetchUrl(target);
    res.status(status).setHeader('Content-Type', 'application/json').send(body);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
