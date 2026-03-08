/**
 * backend/routes/cars.js
 * ─────────────────────────────────────────────
 * Car / Session REST Endpoints
 *
 * Used to record charging sessions that occur in
 * the real app (not just the simulation).
 *
 * GET  /api/cars              — list active car sessions
 * POST /api/cars              — register a new car/session
 * PATCH /api/cars/:id/battery — update battery level
 * ─────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ── GET /api/cars ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM car_sessions WHERE active = true ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ cars: result.rows });
  } catch (err) {
    // Table may not exist yet — return empty array gracefully
    res.json({ cars: [] });
  }
});

// ── POST /api/cars ────────────────────────────────────────
// Body: { vehicle_id, battery_pct, latitude, longitude, destination_lat, destination_lng }
router.post('/', async (req, res) => {
  try {
    const { vehicle_id, battery_pct, latitude, longitude } = req.body;
    const result = await db.query(
      `INSERT INTO car_sessions (vehicle_id, battery_pct, latitude, longitude, active)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [vehicle_id, battery_pct, latitude, longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/cars/:id/battery ───────────────────────────
router.patch('/:id/battery', async (req, res) => {
  try {
    const { battery_pct, latitude, longitude } = req.body;
    const result = await db.query(
      `UPDATE car_sessions
       SET battery_pct = $1, latitude = $2, longitude = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [battery_pct, latitude, longitude, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Session not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
