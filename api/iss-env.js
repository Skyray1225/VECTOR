module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.status(200).json({
    status: 'LIMITED',
    source: 'NASA OSDR / public ISS telemetry',
    fetchedAt: new Date().toISOString(),
    note: 'No stable public official cabin telemetry endpoint is currently wired in this Phase 1 build.',
    metrics: {
      tempC: null,
      humidity: null,
      pressure: null,
      co2: null,
      o2: null
    },
    sourceUrls: [
      'https://visualization.osdr.nasa.gov/eda/',
      'https://www.nasa.gov/reference/osdr-developer-api/'
    ]
  });
};
