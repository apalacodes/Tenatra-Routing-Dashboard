/**
 * js/simulation.js
 * ─────────────────────────────────────────────
 * Simulation State & Update Loop
 *
 * Owns all mutable state (cars, stations) and contains
 * the per-frame update logic. Does NOT touch the DOM or
 * canvas directly — that is renderer.js and interactions.js.
 *
 * Exported via the global `Sim` object so other modules
 * can read state and call actions.
 * ─────────────────────────────────────────────
 */

const Sim = (() => {

  // ── Constants ────────────────────────────────────────────
  const BATTERY_DRAIN_RATE = 0.003;  // % lost per pixel travelled per drain-multiplier
  const CHARGE_RATE_BASE   = 15;     // % per second at 100kW reference
  const CRITICAL_THRESHOLD = 20;     // % — emergency routing kicks in
  const LOW_THRESHOLD      = 35;     // % — proactive routing kicks in

  const CAR_COLORS = [
    '#2AE07A', '#3EC9FF', '#F5A623', '#B388FF',
    '#FF80AB', '#80DEEA', '#FFCC02', '#FF6B6B',
  ];

  // ── State ─────────────────────────────────────────────────
  let cars            = [];
  let stations        = [];
  let nodes           = [];          // graph nodes (rebuilt on resize)
  let carIdCounter    = 0;
  let stationIdCounter = 0;

  let simRunning   = false;
  let simSpeed     = 1;
  let currentAlgo  = 'astar';
  let totalPaths   = 0;
  let canvasW      = 0;
  let canvasH      = 0;

  // ── Event log callback (set by main.js) ───────────────────
  let _logFn = () => {};

  function setLogFn(fn) { _logFn = fn; }

  function log(msg, type = 'info') {
    _logFn(msg, type);
  }

  // ── Graph ────────────────────────────────────────────────
  function setGraph(newNodes) {
    nodes = newNodes;
  }

  function setCanvasSize(w, h) {
    canvasW = w;
    canvasH = h;
  }

  // ── Factories ─────────────────────────────────────────────
  function createCar(x, y, overrides = {}) {
    const id    = ++carIdCounter;
    const color = CAR_COLORS[(id - 1) % CAR_COLORS.length];
    const car   = {
      id,
      name:    `CAR-${String(id).padStart(3, '0')}`,
      x, y,
      color,
      battery:          40 + Math.random() * 55,
      status:           'idle',        // idle | routing | charging | arrived
      speed:            60 + Math.random() * 60,
      path:             [],
      pathIdx:          0,
      targetStation:    null,
      chargingSlot:     null,
      trail:            [],
      destX:            x + (Math.random() - 0.5) * canvasW * 0.8,
      destY:            y + (Math.random() - 0.5) * canvasH * 0.8,
      drainMultiplier:  0.8 + Math.random() * 0.4,
      _routingStarted:  false,
      _lastCritBat:     null,
      _pulse:           0,
      ...overrides,
    };

    // Clamp destination within canvas
    car.destX = Math.max(canvasW * 0.05, Math.min(canvasW * 0.95, car.destX));
    car.destY = Math.max(canvasH * 0.05, Math.min(canvasH * 0.95, car.destY));

    car.path   = findPath(currentAlgo, nodes, car.x, car.y, car.destX, car.destY);
    cars.push(car);
    return car;
  }

  function createStation(x, y, overrides = {}) {
    const id      = ++stationIdCounter;
    const kwOptions = [50, 100, 150, 350];
    const station   = {
      id,
      name:   `ST-${String(id).padStart(3, '0')}`,
      x, y,
      kw:     kwOptions[Math.floor(Math.random() * kwOptions.length)],
      slots:  Array.from({ length: 3 }, () => ({ occupied: false, car: null })),
      _pulse: 0,
      // Real data fields (populated when synced from backend)
      dbId:       null,
      address:    null,
      lat:        null,
      lng:        null,
      network:    null,
      ...overrides,
    };
    stations.push(station);
    return station;
  }

  // ── Routing ──────────────────────────────────────────────
  function routeToNearestStation(car) {
    const station = selectBestStation(stations, car);
    if (!station) {
      log(`❌ ${car.name}: No available stations found!`, 'critical');
      return;
    }

    car.targetStation = station;
    car.status        = 'routing';
    car.path          = findPath(currentAlgo, nodes, car.x, car.y, station.x, station.y);
    car.pathIdx       = 0;
    totalPaths++;

    const dist = Math.round(Math.sqrt((station.x - car.x) ** 2 + (station.y - car.y) ** 2));
    log(`📍 ${car.name} → ${station.name} [${currentAlgo.toUpperCase()}] dist:${dist}px`, 'info');

    // Update HUD stats
    const el = document.getElementById('algo-stats');
    if (el) el.textContent = `Paths computed: ${totalPaths} | Last: ${currentAlgo}`;
  }

  function arriveAtStation(car) {
    const station = car.targetStation;
    if (!station) return;

    const slot = station.slots.find(s => !s.occupied);
    if (!slot) {
      log(`⚠️ ${car.name}: ${station.name} full on arrival — rerouting…`, 'warn');
      car.targetStation    = null;
      car._routingStarted  = false;
      routeToNearestStation(car);
      return;
    }

    slot.occupied    = true;
    slot.car         = car;
    car.chargingSlot = slot;
    car.status       = 'charging';
    car.x            = station.x + (Math.random() - 0.5) * 20;
    car.y            = station.y + (Math.random() - 0.5) * 20;
    car.trail        = [];
    car.path         = [];

    log(`✅ ${car.name} charging at ${station.name} [${station.kw}kW]`, 'success');

    // Push slot status update to backend
    pushSlotUpdate(station);
  }

  function finishCharging(car) {
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
      const station             = car.targetStation;
      car.chargingSlot          = null;
      if (station) pushSlotUpdate(station);
    }

    car.status           = 'idle';
    car.targetStation    = null;
    car._routingStarted  = false;
    car._lastCritBat     = null;

    // New random destination
    car.destX  = Math.random() * canvasW * 0.9 + canvasW * 0.05;
    car.destY  = Math.random() * canvasH * 0.9 + canvasH * 0.05;
    car.path   = findPath(currentAlgo, nodes, car.x, car.y, car.destX, car.destY);
    car.pathIdx = 0;

    log(`🟢 ${car.name} fully charged (${Math.round(car.battery)}%), resuming`, 'success');
  }

  // ── Per-frame update ─────────────────────────────────────
  function update(dt) {
    if (!simRunning) return;
    const scaledDt = dt * simSpeed;

    cars.forEach(car => {
      // ── Movement ──
      if ((car.status === 'routing' || car.status === 'idle') &&
           car.path.length > car.pathIdx) {
        const tgt  = car.path[car.pathIdx];
        const dx   = tgt.x - car.x;
        const dy   = tgt.y - car.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = car.speed * scaledDt;

        if (dist < step) {
          car.x = tgt.x; car.y = tgt.y; car.pathIdx++;
        } else {
          car.x += (dx / dist) * step;
          car.y += (dy / dist) * step;
        }

        // Trail
        car.trail.push({ x: car.x, y: car.y });
        if (car.trail.length > 40) car.trail.shift();

        // Battery drain
        car.battery -= BATTERY_DRAIN_RATE * step * car.drainMultiplier;
        car.battery  = Math.max(0, car.battery);

        // Arrived at station?
        if (car.targetStation && car.pathIdx >= car.path.length) {
          arriveAtStation(car);
        }
      }

      // ── Charging ──
      if (car.status === 'charging') {
        const kwFactor  = (car.targetStation?.kw || 100) / 100;
        car.battery     = Math.min(100, car.battery + CHARGE_RATE_BASE * scaledDt * kwFactor);
        if (car.battery >= 90) finishCharging(car);
      }

      // ── Battery thresholds ──
      if (car.battery < CRITICAL_THRESHOLD && car.status === 'idle') {
        if (car.battery !== car._lastCritBat) {
          log(`🔴 ${car.name} CRITICAL — ${Math.round(car.battery)}%`, 'critical');
          car._lastCritBat = Math.round(car.battery);
        }
        routeToNearestStation(car);
      } else if (car.battery < LOW_THRESHOLD && car.status === 'idle' && !car._routingStarted) {
        car._routingStarted = true;
        log(`⚠️ ${car.name} battery low (${Math.round(car.battery)}%)`, 'warn');
        routeToNearestStation(car);
      }
    });
  }

  // ── Public API mutations ──────────────────────────────────
  function addCar(x, y) {
    const car = createCar(
      x ?? (canvasW * 0.1 + Math.random() * canvasW * 0.8),
      y ?? (canvasH * 0.1 + Math.random() * canvasH * 0.8),
    );
    log(`🚗 ${car.name} added to fleet`, 'info');
    return car;
  }

  function addStation(x, y, overrides) {
    const s = createStation(
      x ?? (canvasW * 0.1 + Math.random() * canvasW * 0.8),
      y ?? (canvasH * 0.1 + Math.random() * canvasH * 0.8),
      overrides,
    );
    log(`⚡ ${s.name} (${s.kw}kW) installed`, 'success');
    return s;
  }

  function removeCar(carId) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
      if (car.targetStation) pushSlotUpdate(car.targetStation);
    }
    cars = cars.filter(c => c.id !== carId);
    log(`🗑️ ${car.name} removed`, 'info');
  }

  function removeStation(stationId) {
    const s = stations.find(st => st.id === stationId);
    if (!s) return;
    s.slots.forEach(sl => {
      if (sl.car) {
        sl.car.status          = 'idle';
        sl.car.chargingSlot    = null;
        sl.car.targetStation   = null;
        sl.car._routingStarted = false;
      }
    });
    cars.filter(c => c.targetStation?.id === stationId).forEach(c => {
      c.targetStation   = null;
      c.status          = 'idle';
      c._routingStarted = false;
    });
    stations = stations.filter(st => st.id !== stationId);
    log(`🗑️ ${s.name} removed`, 'warn');
  }

  function setBattery(carId, pct) {
    const car = cars.find(c => c.id === carId);
    if (car) {
      car.battery = Math.min(100, Math.max(0, +pct));
      log(`🔋 ${car.name} battery set to ${Math.round(car.battery)}%`, 'info');
    }
  }

  function clearStation(stationId) {
    const s = stations.find(st => st.id === stationId);
    if (!s) return;
    s.slots.forEach(sl => {
      if (sl.car) { sl.car.status = 'idle'; sl.car.chargingSlot = null; sl.car.targetStation = null; }
      sl.occupied = false; sl.car = null;
    });
    pushSlotUpdate(s);
    log(`🔓 ${s.name} slots cleared`, 'info');
  }

  function blockStation(stationId) {
    const s = stations.find(st => st.id === stationId);
    if (!s) return;
    s.slots.forEach(sl => { sl.occupied = true; });
    pushSlotUpdate(s);
    log(`🔒 ${s.name} blocked (maintenance)`, 'warn');
  }

  function forceRoute(carId) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;
    if (car.status === 'charging') finishCharging(car);
    car._routingStarted = false;
    car.status          = 'idle';
    routeToNearestStation(car);
  }

  function setAlgo(algo) {
    currentAlgo = algo;
    // Re-compute paths for all currently routing cars
    cars.filter(c => c.status === 'routing' && c.targetStation).forEach(car => {
      car.path    = findPath(algo, nodes, car.x, car.y, car.targetStation.x, car.targetStation.y);
      car.pathIdx = 0;
    });
  }

  function init(startCars, startStations) {
    // Default seed data
    const sp = startStations || [
      [0.25,0.30],[0.55,0.15],[0.70,0.50],[0.40,0.70],
      [0.85,0.30],[0.15,0.70],[0.55,0.85],[0.90,0.70],
    ];
    const cp = startCars || [
      [0.10,0.20],[0.50,0.40],[0.80,0.60],[0.30,0.80],
    ];

    sp.forEach(([xr, yr]) => createStation(xr * canvasW, yr * canvasH));
    cp.forEach(([xr, yr]) => {
      const car = createCar(xr * canvasW, yr * canvasH);
      car.battery = 25 + Math.random() * 65;
    });

    log('🚀 Tenatra EV Simulation initialized', 'success');
    log(`📡 KD-Tree built with ${stations.length} stations`, 'info');
    log(`🗺️ Road graph: ${nodes.length} nodes`, 'info');
  }

  function reset() {
    cars             = [];
    stations         = [];
    carIdCounter     = 0;
    stationIdCounter = 0;
    simRunning       = false;
    totalPaths       = 0;
  }

  // ── Backend sync helpers ─────────────────────────────────
  // Called internally; wired to the real API in main.js

  let _pushSlotFn = () => {};
  function setPushSlotFn(fn) { _pushSlotFn = fn; }
  function pushSlotUpdate(station) { _pushSlotFn(station); }

  /**
   * Ingest station data from the backend database.
   * Maps DB schema → simulation station objects.
   *
   * Expected DB schema row:
   * {
   *   id, name, latitude, longitude, kw_power,
   *   total_slots, occupied_slots, network_name, address
   * }
   *
   * @param {Object[]} dbRows
   */
  function loadStationsFromDB(dbRows) {
    stations = []; // replace sim stations with real data
    stationIdCounter = 0;

    dbRows.forEach(row => {
      const id = ++stationIdCounter;
      const totalSlots  = row.total_slots || 3;
      const occupiedCnt = row.occupied_slots || 0;

      // Map lat/lng to canvas coordinates via the GoogleMaps overlay
      // (or leave as estimated pixel positions if not in maps mode)
      const { x, y } = latLngToCanvas(row.latitude, row.longitude);

      stations.push({
        id,
        dbId:    row.id,          // keep original DB id for PATCH calls
        name:    row.name || `ST-${String(id).padStart(3,'0')}`,
        x, y,
        lat:     row.latitude,
        lng:     row.longitude,
        kw:      row.kw_power || 50,
        network: row.network_name || 'Unknown',
        address: row.address || '',
        slots:   Array.from({ length: totalSlots }, (_, i) => ({
          occupied: i < occupiedCnt,
          car:      null,
        })),
        _pulse: 0,
      });
    });

    log(`📡 ${stations.length} stations loaded from database`, 'success');
  }

  /**
   * Apply a real-time slot status update (from WebSocket or poll).
   * Only updates slots — does not replace the full station object.
   *
   * @param {{ stationDbId: string, slots: {occupied: boolean}[] }} update
   */
  function applySlotUpdate(update) {
    const station = stations.find(s => s.dbId === update.stationDbId);
    if (!station) return;

    update.slots.forEach((newSlot, i) => {
      if (station.slots[i]) {
        station.slots[i].occupied = newSlot.occupied;
      }
    });
  }

  // ── Stub: lat/lng → canvas pixel ─────────────────────────
  // Replaced by the real implementation in main.js once the
  // Google Maps overlay is initialised.
  let _latLngToCanvas = (lat, lng) => ({ x: canvasW * 0.5, y: canvasH * 0.5 });
  function setLatLngConverter(fn) { _latLngToCanvas = fn; }
  function latLngToCanvas(lat, lng) { return _latLngToCanvas(lat, lng); }

  // ── Getters ───────────────────────────────────────────────
  return {
    // State access
    getCars:       ()  => cars,
    getStations:   ()  => stations,
    getNodes:      ()  => nodes,
    isRunning:     ()  => simRunning,
    getSpeed:      ()  => simSpeed,
    getAlgo:       ()  => currentAlgo,

    // Setters
    setSimRunning: (v) => { simRunning = v; },
    setSpeed:      (v) => { simSpeed   = v; },
    setAlgo,
    setGraph,
    setCanvasSize,
    setLogFn,
    setPushSlotFn,
    setLatLngConverter,

    // Actions
    update,
    init,
    reset,
    addCar,
    addStation,
    removeCar,
    removeStation,
    setBattery,
    setCarSpeed:   (id, v) => { const c = cars.find(x => x.id===id); if(c) c.speed=+v; },
    setDrain:      (id, v) => { const c = cars.find(x => x.id===id); if(c) c.drainMultiplier=+v; },
    clearStation,
    blockStation,
    forceRoute,

    // DB integration
    loadStationsFromDB,
    applySlotUpdate,

    // Constants (read by renderer for color decisions)
    CRITICAL_THRESHOLD,
    LOW_THRESHOLD,
  };

})();
