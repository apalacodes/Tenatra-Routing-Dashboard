/**
 * backend/services/googleMapsService.js
 * ─────────────────────────────────────────────
 * Google Maps Platform API Wrapper
 *
 * All calls to Google's APIs go through here.
 * The API key is read from process.env — never
 * sent to the frontend.
 *
 * APIs used:
 *   - Directions API   (route between two points)
 *   - Places API       (find nearby EV charging stations)
 * ─────────────────────────────────────────────
 */

const https = require('https');

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  GOOGLE_MAPS_API_KEY not set — maps routes will return mock data');
}

// ── HTTP helper ───────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from Maps API')); }
      });
    }).on('error', reject);
  });
}

// ── Directions API ────────────────────────────────────────
/**
 * Get a driving route between two lat/lng points.
 *
 * Returns:
 * {
 *   distance_meters: number,
 *   duration_seconds: number,
 *   polyline: string,          // encoded polyline for Google Maps JS
 *   steps: [ { instruction, distance, duration } ]
 * }
 *
 * @param {{ origin: {lat,lng}, destination: {lat,lng}, mode: string }} opts
 */
async function getRoute({ origin, destination, mode = 'driving' }) {
  if (!API_KEY) return getMockRoute(origin, destination);

  const url = [
    'https://maps.googleapis.com/maps/api/directions/json',
    `?origin=${origin.lat},${origin.lng}`,
    `&destination=${destination.lat},${destination.lng}`,
    `&mode=${mode}`,
    `&key=${API_KEY}`,
  ].join('');

  const data = await fetchJson(url);

  if (data.status !== 'OK') {
    throw new Error(`Directions API error: ${data.status}`);
  }

  const leg = data.routes[0].legs[0];
  return {
    distance_meters:  leg.distance.value,
    duration_seconds: leg.duration.value,
    polyline:         data.routes[0].overview_polyline.points,
    steps: leg.steps.map(s => ({
      instruction:      s.html_instructions.replace(/<[^>]+>/g, ''),
      distance_meters:  s.distance.value,
      duration_seconds: s.duration.value,
    })),
  };
}

// ── Places API — nearby EV charging stations ─────────────
/**
 * Find EV charging stations within `radius` meters of a point.
 *
 * Returns array of:
 * {
 *   place_id, name, address,
 *   latitude, longitude,
 *   rating, open_now
 * }
 *
 * @param {{ lat: number, lng: number, radius: number }} opts
 */
async function findNearbyChargingStations({ lat, lng, radius = 5000 }) {
  if (!API_KEY) return getMockNearbyStations(lat, lng);

  const url = [
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
    `?location=${lat},${lng}`,
    `&radius=${radius}`,
    `&type=electric_vehicle_charging_station`,
    `&key=${API_KEY}`,
  ].join('');

  const data = await fetchJson(url);

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Places API error: ${data.status}`);
  }

  return (data.results || []).map(place => ({
    place_id:  place.place_id,
    name:      place.name,
    address:   place.vicinity,
    latitude:  place.geometry.location.lat,
    longitude: place.geometry.location.lng,
    rating:    place.rating || null,
    open_now:  place.opening_hours?.open_now ?? null,
  }));
}

// ── Mock fallbacks (when API key not configured) ──────────
function getMockRoute(origin, destination) {
  const dist = Math.sqrt(
    (origin.lat - destination.lat) ** 2 +
    (origin.lng - destination.lng) ** 2
  ) * 111000; // rough metres per degree

  return {
    distance_meters:  Math.round(dist),
    duration_seconds: Math.round(dist / 10),
    polyline:         '',
    steps:            [{ instruction: 'Head toward destination', distance_meters: Math.round(dist), duration_seconds: Math.round(dist/10) }],
  };
}

function getMockNearbyStations(lat, lng) {
  return [
    { place_id:'mock-p1', name:'Tenatra Hub Alpha', address:'Kathmandu', latitude: lat+0.002, longitude: lng+0.003, rating:4.5, open_now:true },
    { place_id:'mock-p2', name:'Tenatra Hub Beta',  address:'Patan',     latitude: lat-0.004, longitude: lng-0.002, rating:4.2, open_now:true },
  ];
}

module.exports = { getRoute, findNearbyChargingStations };
