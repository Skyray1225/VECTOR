const https = require('https');

const EXPEDITION_URL = 'https://www.nasa.gov/mission/expedition-74/';
const CREW12_URL = 'https://www.nasa.gov/missions/station/what-you-need-to-know-about-nasas-spacex-crew-12-mission/';

function fetchUrl(targetUrl, timeout = 15000) {
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

function match(text, regex, fallback = '') {
  const hit = text.match(regex);
  return hit ? hit[1] : fallback;
}

function extractCrew(expeditionHtml) {
  const alt = match(
    expeditionHtml,
    /og:image:alt" content="([^"]+)"/i,
    ''
  );

  const crew = [];
  const top = alt.match(/Top row from left,\s*(.+?)\.\s*Bottom row/i);
  const bottom = alt.match(/Bottom row,\s*(.+?)\./i);

  if (top) {
    const topText = top[1];
    const topMatch = topText.match(
      /Flight Engineers\s+([^,]+)\s+and\s+([^,]+),\s+both\s+NASA astronauts,\s+and Flight Engineers\s+([^,]+)\s+of ESA.*?\s+and\s+([^,]+)\s+of Roscosmos/i
    );
    if (topMatch) {
      crew.push(
        { name: topMatch[1].trim(), agency: 'NASA', role: 'Flight Engineer' },
        { name: topMatch[2].trim(), agency: 'NASA', role: 'Flight Engineer' },
        { name: topMatch[3].trim(), agency: 'ESA', role: 'Flight Engineer' },
        { name: topMatch[4].trim(), agency: 'Roscosmos', role: 'Flight Engineer' }
      );
    }
  }

  if (bottom) {
    const bottomText = bottom[1];
    const bottomMatch = bottomText.match(
      /station Commander\s+([^,]+)\s+of Roscosmos\s+and Flight Engineers\s+([^,]+)\s+of NASA\s+and\s+([^,]+)\s+of Roscosmos/i
    );
    if (bottomMatch) {
      crew.push(
        { name: bottomMatch[1].trim(), agency: 'Roscosmos', role: 'Commander' },
        { name: bottomMatch[2].trim(), agency: 'NASA', role: 'Flight Engineer' },
        { name: bottomMatch[3].trim(), agency: 'Roscosmos', role: 'Flight Engineer' }
      );
    }
  }

  return crew;
}

function enrichCrewWithProfiles(expeditionHtml, crew) {
  return crew.map((member) => {
    const slug = member.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const profileMatch = expeditionHtml.match(new RegExp(`href="([^"]*${slug}[^"]*)"`, 'i'));
    return {
      ...member,
      profile: profileMatch ? profileMatch[1].replace(/&amp;/g, '&') : null
    };
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=21600, stale-while-revalidate=43200');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const [expeditionHtml, crew12Html] = await Promise.all([
      fetchUrl(EXPEDITION_URL),
      fetchUrl(CREW12_URL).catch(() => '')
    ]);

    const expedition = match(expeditionHtml, /<title>(Expedition\s+\d+)\s+-\s+NASA/i, 'Expedition 74');
    const summary = match(expeditionHtml, /meta name="description" content="([^"]+)"/i, '');
    const start = match(summary, /(Expedition\s+\d+\s+began on\s+[^,]+,\s+\d{4})/i, '');
    const crew = enrichCrewWithProfiles(expeditionHtml, extractCrew(expeditionHtml)).map((member) => {
      const accessMission = /Jessica Meir|Jack Hathaway|Sophie Adenot|Andrey Fedyaev/i.test(member.name)
        ? 'Crew-12'
        : 'Expedition 74 Increments';
      return {
        ...member,
        accessMission
      };
    });

    res.status(200).json({
      status: 'OK',
      source: 'NASA Expedition 74',
      fetchedAt: new Date().toISOString(),
      expedition: {
        name: expedition,
        summary,
        startLabel: start,
        sourceUrl: EXPEDITION_URL
      },
      crew12SourceUrl: crew12Html ? CREW12_URL : null,
      crew
    });
  } catch (err) {
    res.status(502).json({
      status: 'ERROR',
      error: err.message
    });
  }
};
