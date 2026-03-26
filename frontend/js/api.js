/**
 * js/api.js
 * ─────────────────────────────────────────────
 * AWS Charging Stations API Service
 *
 * Ported from Aashish079/tenatra_app/services/dynamodb.ts
 * Fetches real charging station data from the same AWS
 * Lambda endpoint used by the mobile app.
 * ─────────────────────────────────────────────
 */

const API = (() => {

  const API_URL = 'https://i20hq7uqh4.execute-api.us-east-1.amazonaws.com/stations';

  let allStationsCache     = null;
  let bboxSupportDetected  = false;
  let backendSupportsBbox  = null; // null = unknown, true/false once detected

  // ── Helpers ───────────────────────────────────────────

  /** Safely coerce a value to a number; returns undefined when not meaningful. */
  function toNum(v) {
    if (v == null || String(v).trim() === '') return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }

  /**
   * Normalise raw API rows to the ChargingStation schema.
   * Numeric fields from the API may arrive as strings.
   *
   * @param {Object[]} data  Raw API rows
   * @returns {ChargingStation[]}
   */
  function normalizeStations(data) {
    return data
      .filter(s => {
        // Reject records where Lat/Lng are missing, empty, or non-numeric.
        // Number("") === 0 would silently place markers at (0,0) off Africa.
        const lat = toNum(s.Latitude);
        const lon = toNum(s.Longitude);
        return lat !== undefined && lon !== undefined;
      })
      .map(s => ({
        Station_ID:       s.Station_ID,
        Station_Name:     s.Station_Name,
        Latitude:         toNum(s.Latitude),
        Longitude:        toNum(s.Longitude),
        Country:          s.Country,
        Province:         s.Province,
        District:         s.District,
        Plug_Type:        s.Plug_Type,
        Power_kW:         toNum(s.Power_kW),
        Operator:         s.Operator,
        Charging_Points:  toNum(s.Charging_Points),
      }));
  }

  function filterStationsByBbox(stations, bbox) {
    return stations.filter(s =>
      s.Latitude  >= bbox.south &&
      s.Latitude  <= bbox.north &&
      s.Longitude >= bbox.west  &&
      s.Longitude <= bbox.east,
    );
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Fetch all stations from the AWS API.
   * Mirrors scanStations() from dynamodb.ts.
   *
   * @param {AbortSignal} [signal]
   * @returns {Promise<ChargingStation[]>}
   */
  async function scanStations(signal) {
    const response = await fetch(API_URL, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch stations: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return normalizeStations(data);
  }

  /**
   * Fetch stations within a bounding box.
   * Falls back to client-side filtering if the backend
   * does not support bbox query params.
   * Mirrors scanStationsInViewport() from dynamodb.ts.
   *
   * @param {{ north, south, east, west }} bbox
   * @param {AbortSignal} [signal]
   * @returns {Promise<ChargingStation[]>}
   */
  async function scanStationsInViewport(bbox, signal) {
    if (backendSupportsBbox === false && allStationsCache) {
      return filterStationsByBbox(allStationsCache, bbox);
    }

    const params = new URLSearchParams({
      north: String(bbox.north),
      south: String(bbox.south),
      east:  String(bbox.east),
      west:  String(bbox.west),
    });

    const response = await fetch(`${API_URL}?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch stations in viewport: ${response.status} ${response.statusText}`);
    }

    const data       = await response.json();
    const normalized = normalizeStations(data);
    const filtered   = filterStationsByBbox(normalized, bbox);

    // Detect whether the backend respects bbox params.
    // If normalized.length === filtered.length the backend returned only
    // stations within the bbox → it supports bbox filtering.
    // If normalized.length > filtered.length the backend returned stations
    // outside the bbox → it ignores bbox params → cache everything for
    // client-side filtering on future calls.
    if (!bboxSupportDetected) {
      bboxSupportDetected = true;
      backendSupportsBbox = (normalized.length === filtered.length);
      if (!backendSupportsBbox) {
        // Backend ignores bbox — cache full result to avoid re-fetching
        allStationsCache = normalized;
      }
    }

    return filtered;
  }

  return { scanStations, scanStationsInViewport };

})();
