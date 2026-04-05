// Vercel serverless function — NASA OEM ephemeris ZIP proxy
const https = require('https');
const zlib  = require('zlib');
const url   = require('url');

// ── Minimal ZIP extractor (handles data-descriptor ZIPs) ─────────────────────
function extractFirstFileFromZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('No EOCD found in ZIP');

  const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(cdOffset) !== 0x02014b50)
    throw new Error('No Central Directory entry found');

  const compression = buffer.readUInt16LE(cdOffset + 10);
  const compSz      = buffer.readUInt32LE(cdOffset + 20);
  const lfhOffset   = buffer.readUInt32LE(cdOffset + 42);
  const fnLen       = buffer.readUInt16LE(lfhOffset + 26);
  const exLen       = buffer.readUInt16LE(lfhOffset + 28);
  const dataStart   = lfhOffset + 30 + fnLen + exLen;
  const data        = buffer.slice(dataStart, dataStart + compSz);

  if (compression === 0) return data.toString('utf8');
  if (compression === 8) return zlib.inflateRawSync(data).toString('utf8');
  throw new Error('Unsupported ZIP compression: ' + compression);
}

// ── NASA OEM candidate URLs (today → T-7, two upload-month variants) ─────────
function oemCandidates() {
  const now  = new Date();
  const urls = [];
  for (let d = 0; d <= 7; d++) {
    const t  = new Date(now - d * 86400000);
    const yy = t.getUTCFullYear();
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(t.getUTCDate()).padStart(2, '0');
    const stem = `artemis-ii-oem-${yy}-${mm}-${dd}-to-ei.zip`;
    const prevMm = mm === '01' ? '12' : String(t.getUTCMonth()).padStart(2, '0');
    for (const uploadMm of [...new Set([mm, prevMm])]) {
      urls.push(`https://www.nasa.gov/wp-content/uploads/${yy}/${uploadMm}/${stem}`);
    }
  }
  return [...new Map(urls.map(u => [u, u])).values()];
}

function fetchUrl(targetUrl, timeout = 7000) {
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
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const candidates = oemCandidates();
  let oemText = null;

  // Try all candidates in parallel — return first success regardless of order.
  // This avoids sequential timeouts accumulating beyond Vercel's 30s limit.
  try {
    oemText = await Promise.any(
      candidates.map(async (candidate) => {
        const { status, body } = await fetchUrl(candidate, 22000);
        if (status !== 200) throw new Error(`HTTP ${status}`);
        return extractFirstFileFromZip(body);
      })
    );
  } catch (_) {
    oemText = null;
  }

  if (!oemText) {
    res.status(404).json({ error: 'OEM file not found for any candidate date' });
    return;
  }

  res.status(200)
    .setHeader('Content-Type', 'text/plain; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=1800')
    .send(oemText);
};
