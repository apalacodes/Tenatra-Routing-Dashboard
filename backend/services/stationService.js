/**
 * backend/services/stationService.js
 * ─────────────────────────────────────────────
 * All database operations for charging stations.
 * Routes call these functions; they never query the
 * DB directly.
 * ─────────────────────────────────────────────
 */

const db = require('../config/db');

// ── Mock data fallback (used if DB is unavailable) ────────
// Replace with real data or remove once your DB is live.
const MOCK_STATIONS = [
  { id:'mock-1', name:'Tenatra Hub Alpha',  latitude:27.7172, longitude:85.3240, kw_power:150, total_slots:4, occupied_slots:1, network_name:'Tenatra', address:'Kathmandu, Nepal' },
  { id:'mock-2', name:'Tenatra Hub Beta',   latitude:27.7050, longitude:85.3145, kw_power:100, total_slots:3, occupied_slots:0, network_name:'Tenatra', address:'Patan, Nepal' },
  { id:'mock-3', name:'Tenatra Hub Gamma',  latitude:27.7300, longitude:85.3350, kw_power:350, total_slots:6, occupied_slots:2, network_name:'Tenatra', address:'Boudha, Nepal' },
  { id:'mock-4', name:'Tenatra Hub Delta',  latitude:27.6950, longitude:85.3450, kw_power:50,  total_slots:2, occupied_slots:0, network_name:'Tenatra', address:'Lalitpur, Nepal' },
];

let useMock = false;

/**
 * Fetch all active stations.
 * Returns DB rows or mock data if DB is not connected.
 */
async function getAllStations() {
  if (useMock) return MOCK_STATIONS;

  try {
    const result = await db.query(
      `SELECT id, name, latitude, longitude, kw_power,
              total_slots, occupied_slots, network_name, address
       FROM   stations
       WHERE  is_active = true
       ORDER  BY name`
    );
    return result.rows;
  } catch (err) {
    console.warn('DB unavailable — using mock stations:', err.message);
    useMock = true;
    return MOCK_STATIONS;
  }
}

/**
 * Get a single station by its UUID.
 */
async function getStationById(id) {
  if (useMock) return MOCK_STATIONS.find(s => s.id === id) || null;

  const result = await db.query(
    `SELECT * FROM stations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Insert a new station record.
 */
async function createStation({ name, latitude, longitude, kw_power, total_slots, network_name, address }) {
  const result = await db.query(
    `INSERT INTO stations (name, latitude, longitude, kw_power, total_slots, network_name, address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, latitude, longitude, kw_power, total_slots, network_name, address]
  );
  return result.rows[0];
}

/**
 * Update the slot occupancy for a station.
 *
 * @param {string}  id     - Station UUID
 * @param {Array}   slots  - Array of { occupied: boolean }
 * @returns {Object|null}  - Updated station or null
 */
async function updateSlots(id, slots) {
  if (useMock) {
    const s = MOCK_STATIONS.find(s => s.id === id);
    if (!s) return null;
    s.occupied_slots = slots.filter(sl => sl.occupied).length;
    // Build a slot-shaped response
    return {
      ...s,
      slots: slots,
    };
  }

  const occupiedCount = slots.filter(sl => sl.occupied).length;

  const result = await db.query(
    `UPDATE stations
     SET    occupied_slots = $1,
            updated_at     = NOW()
     WHERE  id = $2
     RETURNING *`,
    [occupiedCount, id]
  );

  if (!result.rows.length) return null;

  // Log individual slot events for analytics
  await logSlotEvents(id, slots);

  return {
    ...result.rows[0],
    slots,
  };
}

/**
 * Soft-delete (deactivate) a station.
 */
async function deactivateStation(id) {
  await db.query(
    `UPDATE stations SET is_active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Write individual slot change events to slot_events table.
 * Used for occupancy analytics over time.
 */
async function logSlotEvents(stationId, slots) {
  try {
    const values = slots.map((sl, i) => `('${stationId}', ${i}, ${sl.occupied})`).join(',');
    await db.query(
      `INSERT INTO slot_events (station_id, slot_index, occupied)
       VALUES ${values}`
    );
  } catch (err) {
    // Non-fatal — analytics logging failure shouldn't break slot update
    console.warn('Slot event log failed:', err.message);
  }
}

module.exports = {
  getAllStations,
  getStationById,
  createStation,
  updateSlots,
  deactivateStation,
};
