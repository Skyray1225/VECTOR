// Vercel serverless function — CARTO Dark Matter tile proxy (adds CARTO_API_KEY server-side)
const https = require('https');
const url   = require('url');

function fetchUrl(targetUrl, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: { 'User-Agent': 'VECTOR-MissionControl/1.0' }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(new Error('Timeout')); });
  });
}

module.exports = async (req, res) => {
  const key = process.env.CARTO_API_KEY;
  if (!key) { res.status(500).json({ error: 'CARTO_API_KEY not set' }); return; }

  const q = url.parse(req.url, true).query;
  const z = parseInt(q.z, 10), x = parseInt(q.x, 10), y = parseInt(q.y, 10);
  const n = Math.pow(2, z);
  if (!(z >= 0 && z <= 20) || !(x >= 0 && x < n) || !(y >= 0 && y < n)) {
    res.status(400).json({ error: 'Invalid tile coordinates' });
    return;
  }
  const retina = q.r === '@2x' ? '@2x' : '';
  const target = 'https://basemaps.cartocdn.com/rastertiles/dark_all/' + z + '/' + x + '/' + y + retina +
                 '.png?key=' + encodeURIComponent(key);

  try {
    const { status, type, body } = await fetchUrl(target);
    res.setHeader('Content-Type', type || 'image/png');
    if (status === 200) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.status(status).send(body);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
