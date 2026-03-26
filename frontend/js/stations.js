/**
 * js/stations.js
 * ─────────────────────────────────────────────
 * StationManager — normalises ChargingStation
 * records from the AWS API into the Sim schema
 * and provides filter helpers.
 *
 * Data flow:
 *   API.scanStations() → StationManager.ingest()
 *   → categorises by plug type / operator / power
 *   → Sim.loadStationsFromAPI() consumes the result
 * ─────────────────────────────────────────────
 */

const StationManager = (() => {

  /** @type {Object[]} Normalised station list (Sim schema) */
  let _stations = [];

  // ── Ingestion ─────────────────────────────────────────

  /**
   * Convert raw ChargingStation records (AWS schema) into
   * the format expected by simulation.js.
   *
   * @param {ChargingStation[]} apiStations
   * @returns {Object[]}  Sim-compatible station objects
   */
  function ingest(apiStations) {
    _stations = apiStations.map((s, idx) => ({
      // Identity
      dbId:    s.Station_ID,
      name:    s.Station_Name || s.Station_ID || `ST-${String(idx + 1).padStart(3, '0')}`,

      // Geo (lat/lng are real; x/y filled once map projection is ready)
      lat:     s.Latitude,
      lng:     s.Longitude,
      x:       0,
      y:       0,

      // Technical attributes
      kw:      s.Power_kW   || 50,
      plugType: s.Plug_Type || 'DC',
      network: s.Operator   || 'Unknown',
      address: [s.District, s.Province, s.Country].filter(Boolean).join(', '),

      // Slot array (Sim engine reads/writes this)
      slots: Array.from(
        { length: s.Charging_Points || 1 },
        () => ({ occupied: false, car: null }),
      ),

      // Sim internals
      id:     null,   // assigned by Sim.loadStationsFromAPI()
      _pulse: 0,
    }));

    return _stations;
  }

  // ── Filtering ─────────────────────────────────────────

  /**
   * Return stations that match all active filter criteria.
   *
   * @param {Object[]} stations
   * @param {Object}   filters
   * @param {string[]} [filters.plugTypes]      e.g. ['AC Type-1', 'DC']
   * @param {string[]} [filters.operators]      e.g. ['Nepal Electricity Authority']
   * @param {number}   [filters.minPowerKw]     e.g. 50
   * @param {number}   [filters.maxPowerKw]     e.g. 350
   * @param {boolean}  [filters.availableOnly]  only stations with free slots
   * @returns {Object[]}
   */
  function applyFilters(stations, filters = {}) {
    return stations.filter(s => {
      if (filters.plugTypes && filters.plugTypes.length > 0) {
        if (!filters.plugTypes.includes(s.plugType)) return false;
      }
      if (filters.operators && filters.operators.length > 0) {
        if (!filters.operators.includes(s.network)) return false;
      }
      if (filters.minPowerKw !== undefined && s.kw < filters.minPowerKw) return false;
      if (filters.maxPowerKw !== undefined && s.kw > filters.maxPowerKw) return false;
      if (filters.availableOnly) {
        const hasFreeSlot = s.slots.some(sl => !sl.occupied);
        if (!hasFreeSlot) return false;
      }
      return true;
    });
  }

  /** @returns {string[]} Unique plug types found in the current station list */
  function getPlugTypes() {
    const types = new Set(_stations.map(s => s.plugType).filter(Boolean));
    return [...types].sort();
  }

  /** @returns {string[]} Unique operator names found in the current station list */
  function getOperators() {
    const ops = new Set(_stations.map(s => s.network).filter(Boolean));
    return [...ops].sort();
  }

  /** @returns {Object[]} All ingested stations */
  function getAll() { return _stations; }

  return { ingest, applyFilters, getPlugTypes, getOperators, getAll };

})();
