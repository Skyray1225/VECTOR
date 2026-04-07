/**
 * api/iss-telemetry.js
 * Real-time ISS position + cabin data via NASA/Lightstreamer TLCP polling.
 * Items: J2000 state vector (pos km, vel m/s) + pressure (torr) + temp (°C) + beta angle (°).
 */
const https = require('https');

const LS_HOST = 'push.lightstreamer.com';
const LS_ADAPTER = 'ISSLIVE';
const LS_CID = 'vectorissmc001';
const LS_PROTOCOL = 'TLCP-2.0.0';

// Ordered list — index+1 = Lightstreamer item index in subscription
const ITEMS = [
  { key: 'USLAB000032', label: 'posX',     unit: 'km' },
  { key: 'USLAB000033', label: 'posY',     unit: 'km' },
  { key: 'USLAB000034', label: 'posZ',     unit: 'km' },
  { key: 'USLAB000035', label: 'velX',     unit: 'm/s' },
  { key: 'USLAB000036', label: 'velY',     unit: 'm/s' },
  { key: 'USLAB000037', label: 'velZ',     unit: 'm/s' },
  { key: 'USLAB000058', label: 'pressure', unit: 'torr' },
  { key: 'USLAB000059', label: 'tempC',    unit: '°C' },
  { key: 'USLAB000040', label: 'beta',     unit: 'deg' },
];

function postForm(path, body, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const encoded = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const options = {
      hostname: LS_HOST,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(encoded),
        'User-Agent': 'VECTOR-ISS-MissionControl/1.0',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`TLCP request timeout (${path})`)));
    req.write(encoded);
    req.end();
  });
}

function parseSessionId(responseBody) {
  // CONOK,<session_id>,<timeout_ms>,<keepalive_ms>,*
  const m = responseBody.match(/CONOK,([^\r\n,]+)/);
  return m ? m[1].trim() : null;
}

function parseUpdates(responseBody) {
  // Each update line: U,<subId>,<itemIdx>|<field1>|<field2>...
  // Schema: TimeStamp Value  (field indices 0, 1)
  const values = {};
  for (const line of responseBody.split(/\r?\n/)) {
    if (!line.startsWith('U,')) continue;
    // strip "U,subId,"
    const afterSub = line.slice(line.indexOf(',', 2) + 1);
    const pipePos = afterSub.indexOf('|');
    if (pipePos < 0) continue;
    const itemIdx = parseInt(afterSub.slice(0, pipePos), 10) - 1; // 0-based
    if (itemIdx < 0 || itemIdx >= ITEMS.length) continue;
    const fields = afterSub.slice(pipePos + 1).split('|');
    // fields[0] = TimeStamp (ms epoch), fields[1] = Value
    const rawValue = fields[1];
    if (rawValue != null && rawValue !== '') {
      const parsed = parseFloat(rawValue);
      if (!Number.isNaN(parsed)) {
        values[ITEMS[itemIdx].label] = parsed;
      }
    }
  }
  return values;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Short cache — data updates every ~4 s from NASA
  res.setHeader('Cache-Control', 'public, max-age=8, stale-while-revalidate=16');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  try {
    // ── Step 1: Create polling session ─────────────────────────────────────
    const sessionResp = await postForm(
      `/lightstreamer/create_session.txt?LS_protocol=${LS_PROTOCOL}`,
      `LS_adapter_set=${LS_ADAPTER}&LS_cid=${LS_CID}&LS_polling=true&LS_polling_millis=0`,
      8000,
    );

    const sessionId = parseSessionId(sessionResp.body);
    if (!sessionId) {
      throw new Error(`Could not parse Lightstreamer session ID.\nResponse: ${sessionResp.body.slice(0, 200)}`);
    }

    // ── Step 2: Subscribe to items ─────────────────────────────────────────
    const group = ITEMS.map((i) => i.key).join('%20');
    await postForm(
      `/lightstreamer/control.txt?LS_protocol=${LS_PROTOCOL}`,
      `LS_session=${sessionId}&LS_reqId=1&LS_op=add&LS_subId=1` +
        `&LS_group=${group}&LS_schema=TimeStamp%20Value&LS_mode=MERGE`,
      6000,
    );

    // ── Step 3: Bind session — poll for up to 5 s ─────────────────────────
    const bindResp = await postForm(
      `/lightstreamer/bind_session.txt?LS_protocol=${LS_PROTOCOL}`,
      `LS_session=${sessionId}&LS_polling=true&LS_polling_millis=5000`,
      12000,
    );

    const v = parseUpdates(bindResp.body);

    const hasPos = v.posX != null && v.posY != null && v.posZ != null;
    const hasVel = v.velX != null && v.velY != null && v.velZ != null;

    if (!hasPos) {
      throw new Error('No position data in Lightstreamer response. Received fields: ' + Object.keys(v).join(', '));
    }

    // Velocities arrive in m/s — convert to km/s for satellite.js compatibility
    const velJ2000 = hasVel
      ? { x: v.velX / 1000, y: v.velY / 1000, z: v.velZ / 1000 }
      : null;

    // Pressure: Lightstreamer gives torr → convert to kPa (1 torr = 0.133322 kPa)
    const pressureKPa = v.pressure != null ? v.pressure * 0.133322 : null;

    res.status(200).json({
      status: 'OK',
      source: 'NASA / Lightstreamer ISSLIVE',
      fetchedAt: new Date().toISOString(),
      posJ2000: { x: v.posX, y: v.posY, z: v.posZ }, // km, J2000 ECI
      velJ2000,                                         // km/s, J2000 ECI (null if missing)
      env: {
        pressureTorr: v.pressure ?? null,
        pressureKPa,
        tempC: v.tempC ?? null,
        betaAngleDeg: v.beta ?? null,
      },
    });

  } catch (err) {
    res.status(502).json({ status: 'ERROR', error: err.message });
  }
};
