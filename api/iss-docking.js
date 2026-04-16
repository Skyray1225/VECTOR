/**
 * api/iss-docking.js
 * Returns current ISS docking configuration.
 * Hardcoded for Expedition 74 (valid ~Nov 2025 – Oct 2026).
 * Update DOCKED array when vehicles dock or undock.
 * Last updated: 2026-04-16
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── Expedition 74 docking configuration ──────────────────────────────────
  // vehicle: must match crew API's accessMission field for crewed vehicles
  // type: 'crew' | 'cargo'
  const DOCKED = [
    {
      vehicle:     'Soyuz MS-28',
      type:        'crew',
      port:        'Rassvet nadir',
      module:      'MRM-1',
      agency:      'Roscosmos',
      dockedSince: '2025-11-27',
    },
    {
      vehicle:     'Crew-12 Dragon',
      type:        'crew',
      port:        'Harmony zenith',
      module:      'IDA-3',
      agency:      'SpaceX / NASA',
      dockedSince: '2026-02-14',
    },
    {
      vehicle:     'Progress MS-32',
      type:        'cargo',
      port:        'Zvezda aft',
      module:      'SM',
      agency:      'Roscosmos',
      dockedSince: '2025-09-13',
    },
    {
      vehicle:     'Progress MS-33',
      type:        'cargo',
      port:        'Poisk zenith',
      module:      'MRM-2',
      agency:      'Roscosmos',
      dockedSince: '2026-03-24',
    },
    {
      vehicle:     'Cygnus CRS NG-24',
      type:        'cargo',
      port:        'Unity nadir',
      module:      'Node 1',
      agency:      'Northrop Grumman',
      dockedSince: '2026-04-13',
    },
  ];

  res.status(200).json({
    status:    'OK',
    source:    'Données statiques Exp. 74',
    updatedAt: '2026-04-16',
    fetchedAt: new Date().toISOString(),
    docked:    DOCKED,
  });
};
