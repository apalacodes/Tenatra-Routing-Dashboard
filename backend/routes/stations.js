/**
 * backend/routes/stations.js
 * ─────────────────────────────────────────────
 * Station REST Endpoints
 *
 * GET    /api/stations          — all active stations
 * GET    /api/stations/:id      — single station by DB id
 * POST   /api/stations          — create a new station
 * PATCH  /api/stations/:id/slots — update slot occupancy
 * DELETE /api/stations/:id      — deactivate a station
 * ─────────────────────────────────────────────
 */

const express       = require('express');
const router        = express.Router();
const stationService = require('../services/stationService');
const wsService     = require('../services/websocket');

// ── GET /api/stations ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const stations = await stationService.getAllStations();
    res.json({ stations });
  } catch (err) {
    console.error('GET /stations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// ── GET /api/stations/:id ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const station = await stationService.getStationById(req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found' });
    res.json(station);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stations ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, latitude, longitude, kw_power, total_slots, network_name, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const station = await stationService.createStation({
      name:         name || 'New Station',
      latitude,
      longitude,
      kw_power:     kw_power    || 50,
      total_slots:  total_slots || 3,
      network_name: network_name || null,
      address:      address      || null,
    });

    res.status(201).json(station);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/stations/:id/slots ─────────────────────────
// Payload: { slots: [ { occupied: bool }, … ] }
// Also broadcasts the update to all connected WebSocket clients.
router.patch('/:id/slots', async (req, res) => {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots must be an array' });
    }

    const updated = await stationService.updateSlots(req.params.id, slots);
    if (!updated) return res.status(404).json({ error: 'Station not found' });

    // Broadcast real-time update to all connected simulation clients
    wsService.broadcast({
      type:         'slot_update',
      stationDbId:  req.params.id,
      slots:        updated.slots,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/stations/:id ──────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await stationService.deactivateStation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
