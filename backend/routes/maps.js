/**
 * backend/routes/maps.js
 * ─────────────────────────────────────────────
 * Google Maps API Proxy
 *
 * The API key lives on the backend so it is never
 * exposed in frontend source code.
 *
 * GET /api/maps/route
 *   Params: origin_lat, origin_lng, dest_lat, dest_lng, mode
 *   Returns: encoded polyline + distance + duration
 *
 * GET /api/maps/nearby-stations
 *   Params: lat, lng, radius_meters
 *   Returns: nearby charging stations from Google Places
 * ─────────────────────────────────────────────
 */

const express      = require('express');
const router       = express.Router();
const googleMaps   = require('../services/googleMapsService');

// ── GET /api/maps/route ───────────────────────────────────
router.get('/route', async (req, res) => {
  const { origin_lat, origin_lng, dest_lat, dest_lng, mode = 'driving' } = req.query;

  if (!origin_lat || !origin_lng || !dest_lat || !dest_lng) {
    return res.status(400).json({ error: 'origin and destination coordinates required' });
  }

  try {
    const route = await googleMaps.getRoute({
      origin:      { lat: +origin_lat, lng: +origin_lng },
      destination: { lat: +dest_lat,   lng: +dest_lng   },
      mode,
    });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/maps/nearby-stations ────────────────────────
// Searches Google Places for EV charging stations near a coordinate.
// You can supplement or cross-reference this with your own DB data.
router.get('/nearby-stations', async (req, res) => {
  const { lat, lng, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const places = await googleMaps.findNearbyChargingStations({
      lat: +lat, lng: +lng, radius: +radius,
    });
    res.json({ stations: places });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
