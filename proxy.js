// CORS proxy — JPL Horizons + NASA OEM ephemeris — no external dependencies
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const zlib  = require('zlib');

const PORT = 3001;
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'null'];
const ORION_MODEL_PATH = path.join(__dirname, 'orion_artemistracker.glb');

// ── Minimal ZIP extractor — reads sizes from Central Directory ────────────
// (handles data-descriptor ZIPs where local header has compressedSize=0)
function extractFirstFileFromZip(buffer) {
  // 1. Find End of Central Directory (EOCD): signature 0x06054b50
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('No EOCD found in ZIP');

  const cdOffset = buffer.readUInt32LE(eocd + 16);

  // 2. Read first Central Directory entry (0x02014b50)
  if (buffer.readUInt32LE(cdOffset) !== 0x02014b50)
    throw new Error('No Central Directory entry found');

  const compression  = buffer.readUInt16LE(cdOffset + 10);
  const compSz       = buffer.readUInt32LE(cdOffset + 20);
  const lfhOffset    = buffer.readUInt32LE(cdOffset + 42);

  // 3. Locate data inside Local File Header
  const fnLen     = buffer.readUInt16LE(lfhOffset + 26);
  const exLen     = buffer.readUInt16LE(lfhOffset + 28);
  const dataStart = lfhOffset + 30 + fnLen + exLen;
  const data      = buffer.slice(dataStart, dataStart + compSz);

  if (compression === 0) return data.toString('utf8');          // stored
  if (compression === 8) return zlib.inflateRawSync(data).toString('utf8'); // deflate
  throw new Error('Unsupported ZIP compression: ' + compression);
}

// ── NASA OEM URL candidates (tries today → T-7, both /03/ and /04/ paths) ──
function oemCandidates() {
  const now = new Date();
  const urls = [];
  for (let d = 0; d <= 7; d++) {
    const t = new Date(now - d * 86400000);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    const stem = `artemis-ii-oem-${yy}-${mm}-${dd}-to-ei.zip`;
    // Try upload month = current month and previous month
    for (const uploadMm of [mm, mm === '04' ? '03' : mm]) {
      urls.push(`https://www.nasa.gov/wp-content/uploads/${yy}/${uploadMm}/${stem}`);
    }
  }
  // deduplicate while preserving order
  return [...new Map(urls.map(u => [u, u])).values()];
}

function fetchUrl(targetUrl, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: { 'User-Agent': 'ArtemisII-MissionControl/1.0' }
    }, (res) => {
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

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET')     { res.writeHead(405); res.end('Method Not Allowed'); return; }

  const parsed = url.parse(req.url, true);

  // ── Route: /horizons → JPL Horizons API ─────────────────────────────────
  if (parsed.pathname.startsWith('/horizons')) {
    const target = 'https://ssd.jpl.nasa.gov/api/horizons.api' + (parsed.search || '');
    console.log('[proxy/horizons] →', target.slice(0, 100) + '...');
    try {
      const { status, body } = await fetchUrl(target);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch(e) {
      console.error('[proxy/horizons] error:', e.message);
      res.writeHead(502); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Route: /oem → NASA OEM ephemeris file (ZIP → plain text) ─────────────
  if (parsed.pathname.startsWith('/oem')) {
    const candidates = oemCandidates();
    console.log(`[proxy/oem] Trying ${candidates.length} candidate URLs...`);
    let oemText = null;
    let usedUrl = null;
    for (const candidate of candidates) {
      try {
        const { status, body } = await fetchUrl(candidate, 12000);
        if (status !== 200) continue;
        oemText = extractFirstFileFromZip(body);
        usedUrl = candidate;
        break;
      } catch(e) {
        // try next
      }
    }
    if (!oemText) {
      console.error('[proxy/oem] All candidates failed');
      res.writeHead(404); res.end(JSON.stringify({ error: 'OEM file not found' }));
      return;
    }
    console.log(`[proxy/oem] OK — ${usedUrl.split('/').pop()} (${oemText.length} chars)`);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=1800' });
    res.end(oemText);
    return;
  }

  // ── Route: /orion-model → local Artemis Tracker GLB ──────────────────────
  if (parsed.pathname.startsWith('/orion-model')) {
    if (!fs.existsSync(ORION_MODEL_PATH)) {
      res.writeHead(404); res.end('Orion model not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': 'public, max-age=86400'
    });
    fs.createReadStream(ORION_MODEL_PATH).pipe(res);
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[proxy] Running on http://localhost:${PORT}`);
  console.log(`[proxy] Routes: /horizons?... | /oem | /orion-model`);
});
