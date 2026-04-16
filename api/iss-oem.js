const https = require('https');

const NASA_OEM_URL = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
const CELESTRAK_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';

function fetchUrl(targetUrl, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: { 'User-Agent': 'VECTOR-ISS-MissionControl/1.0' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('Timeout')));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const nasa = await fetchUrl(NASA_OEM_URL, 15000);
    if (nasa.status === 200 && /CCSDS_OEM_VERS/i.test(nasa.body)) {
      res.status(200).json({
        status: 'OK',
        source: 'NASA OEM',
        format: 'oem',
        url: NASA_OEM_URL,
        fetchedAt: new Date().toISOString(),
        content: nasa.body
      });
      return;
    }
  } catch (_) {
    // Fall through to TLE fallback.
  }

  try {
    const tle = await fetchUrl(CELESTRAK_TLE_URL, 10000);
    if (tle.status === 200 && tle.body.trim()) {
      res.status(200).json({
        status: 'OK',
        source: 'CELESTRAK TLE',
        format: 'tle',
        url: CELESTRAK_TLE_URL,
        fetchedAt: new Date().toISOString(),
        content: tle.body
      });
      return;
    }
  } catch (err) {
    res.status(502).json({
      status: 'ERROR',
      error: err.message
    });
    return;
  }

  res.status(502).json({
    status: 'ERROR',
    error: 'No ISS orbital source available'
  });
};
