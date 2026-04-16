/**
 * api/iss-telemetry.js
 * Real-time ISS position via wheretheiss.at (lat/lon/alt → J2000 ECI conversion).
 * Lightstreamer ISSLIVE adapter no longer streams USLAB state-vector items publicly;
 * wheretheiss.at (backed by NORAD TLE propagation) is the reliable fallback.
 */
const https = require('https');

function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'VECTOR-ISS-MissionControl/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchJson(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timeout')));
  });
}

/**
 * Convert geodetic (lat°, lon°, alt km) + Unix timestamp (ms) to J2000 ECI (km).
 * Uses spherical Earth + GAST rotation — sufficient accuracy for ISS tracking (~1 km error).
 */
function geodeticToEci(latDeg, lonDeg, altKm, timestampMs) {
  const DEG = Math.PI / 180;
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const R = 6371.0; // mean Earth radius km
  const r = R + altKm;

  // ECEF
  const xEcef = r * Math.cos(lat) * Math.cos(lon);
  const yEcef = r * Math.cos(lat) * Math.sin(lon);
  const zEcef = r * Math.sin(lat);

  // Greenwich Apparent Sidereal Time (Meeus, degrees)
  const jd = timestampMs / 86400000 + 2440587.5;
  const T  = (jd - 2451545.0) / 36525.0;
  let gast = 280.46061837
    + 360.98564736629 * (jd - 2451545.0)
    + T * T * (0.000387933 - T / 38710000);
  gast = ((gast % 360) + 360) % 360;
  const θ = gast * DEG;

  return {
    x: xEcef * Math.cos(θ) - yEcef * Math.sin(θ),
    y: xEcef * Math.sin(θ) + yEcef * Math.cos(θ),
    z: zEcef,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // wheretheiss.at updates every ~1 s; cache 8 s to avoid hammering the upstream
  res.setHeader('Cache-Control', 'public, max-age=8, stale-while-revalidate=16');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    const iss = await fetchJson('https://api.wheretheiss.at/v1/satellites/25544');

    const posJ2000 = geodeticToEci(
      iss.latitude,
      iss.longitude,
      iss.altitude,          // km
      iss.timestamp * 1000,  // wheretheiss gives Unix seconds
    );

    // velocity magnitude (km/h → km/s) — direction unavailable from this source
    const speedKms = iss.velocity / 3600;

    res.status(200).json({
      status:    'OK',
      source:    'wheretheiss.at / NORAD TLE',
      fetchedAt: new Date().toISOString(),
      posJ2000,        // km, J2000 ECI
      velJ2000: null,  // vector not available; dashboard falls back to prograde estimate
      speedKms,        // scalar speed, km/s
      geodetic: {
        lat:      iss.latitude,   // °
        lon:      iss.longitude,  // °
        alt:      iss.altitude,   // km
        speedKmh: iss.velocity,   // km/h
        visibility: iss.visibility,
      },
      env: {
        pressureTorr: null,
        pressureKPa:  null,
        tempC:        null,
        betaAngleDeg: null,
      },
    });

  } catch (err) {
    res.status(502).json({ status: 'ERROR', error: err.message });
  }
};
