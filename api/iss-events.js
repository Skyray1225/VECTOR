const https = require('https');

const NASA_FEED_URL = 'https://www.nasa.gov/blogs/spacestation/feed/';
const LL2_URL = 'https://ll.thespacedevs.com/2.3.0/events/upcoming/?search=space%20station&limit=8';

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
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error('Timeout')));
  });
}

function decodeHtml(text) {
  return (text || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&#8217;/g, "'")
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const matches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  matches.slice(0, 10).forEach((itemXml) => {
    const title = decodeHtml((itemXml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = decodeHtml((itemXml.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const description = decodeHtml((itemXml.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '');
    const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const categories = [...itemXml.matchAll(/<category><!\[CDATA\[(.*?)\]\]><\/category>/g)].map((m) => m[1]);
    items.push({
      title,
      link,
      description,
      date: pubDate ? new Date(pubDate).toISOString() : null,
      source: 'NASA Station Blog',
      categories,
      type: inferEventType(title, description)
    });
  });
  return items;
}

function inferEventType(title, description) {
  const haystack = `${title} ${description}`.toLowerCase();
  if (haystack.includes('spacewalk') || haystack.includes('eva')) return 'EVA';
  if (haystack.includes('cygnus') || haystack.includes('dragon') || haystack.includes('progress') || haystack.includes('soyuz')) return 'Vehicle';
  if (haystack.includes('dock') || haystack.includes('capture') || haystack.includes('launch')) return 'Operations';
  if (haystack.includes('reboost')) return 'Reboost';
  return 'Station Ops';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const [rssXml, ll2Raw] = await Promise.all([
      fetchUrl(NASA_FEED_URL),
      fetchUrl(LL2_URL).catch(() => '')
    ]);

    const nasaItems = parseRssItems(rssXml);
    const ll2 = ll2Raw ? JSON.parse(ll2Raw) : { results: [] };
    const ll2Items = (ll2.results || []).slice(0, 6).map((item) => ({
      title: item.name,
      link: item.url,
      description: decodeHtml(item.description || ''),
      date: item.date || null,
      source: 'Launch Library 2',
      categories: [item.type?.name || 'Event'],
      type: item.type?.name || 'Event'
    }));

    res.status(200).json({
      status: 'OK',
      fetchedAt: new Date().toISOString(),
      sources: [
        { name: 'NASA Station Blog', url: NASA_FEED_URL },
        { name: 'Launch Library 2', url: LL2_URL }
      ],
      events: [...nasaItems, ...ll2Items]
        .filter((event) => event.title)
        .sort((a, b) => {
          const ad = a.date ? new Date(a.date).getTime() : Number.MAX_SAFE_INTEGER;
          const bd = b.date ? new Date(b.date).getTime() : Number.MAX_SAFE_INTEGER;
          return ad - bd;
        })
    });
  } catch (err) {
    res.status(502).json({
      status: 'ERROR',
      error: err.message
    });
  }
};
