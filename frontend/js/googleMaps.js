/**
 * js/googleMaps.js
 * ─────────────────────────────────────────────
 * Google Maps Overlay & Integration
 *
 * Manages:
 *  - Map initialisation & dark Tenatra styling
 *  - Station marker rendering via ClusterManager
 *  - Simulated car overlays & routing paths
 *  - Info windows on station click
 *  - Lat/lng ↔ canvas pixel projection
 * ─────────────────────────────────────────────
 */

const GoogleMapsModule = (() => {

  /** @type {google.maps.Map | null} */
  let _map = null;

  /** car id → google.maps.Marker */
  const _carMarkers = {};
  /** car id → google.maps.Polyline */
  const _pathLines  = {};
  /** Currently open InfoWindow */
  let _openInfoWindow = null;

  // ── Dark map styles (Tenatra palette) ─────────────────
  const MAP_STYLES = [
    { elementType: 'geometry',          stylers: [{ color: '#062030' }] },
    { elementType: 'labels.text.fill',  stylers: [{ color: '#7EAAB8' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#04111A' }] },
    { featureType: 'road',              elementType: 'geometry',        stylers: [{ color: '#0A2535' }] },
    { featureType: 'road',              elementType: 'geometry.stroke', stylers: [{ color: '#1A3A4A' }] },
    { featureType: 'road.highway',      elementType: 'geometry',        stylers: [{ color: '#0D3048' }] },
    { featureType: 'road.highway',      elementType: 'geometry.stroke', stylers: [{ color: '#1A4A64' }] },
    { featureType: 'water',             elementType: 'geometry',        stylers: [{ color: '#041520' }] },
    { featureType: 'poi',               elementType: 'geometry',        stylers: [{ color: '#062030' }] },
    { featureType: 'transit',           elementType: 'geometry',        stylers: [{ color: '#041828' }] },
    { featureType: 'administrative',    elementType: 'geometry',        stylers: [{ color: '#0A2535' }] },
  ];

  // ── Init ──────────────────────────────────────────────

  /**
   * Create and return a Google Maps instance.
   *
   * @param {HTMLElement} container
   * @param {{ lat: number, lng: number }} center
   * @param {number} zoom
   * @returns {google.maps.Map}
   */
  function init(container, center, zoom) {
    if (typeof google === 'undefined' || !google.maps) {
      console.error('[GoogleMapsModule] google.maps not loaded');
      return null;
    }

    _map = new google.maps.Map(container, {
      center,
      zoom,
      mapTypeId:        'roadmap',
      styles:           MAP_STYLES,
      disableDefaultUI: false,
      gestureHandling:  'greedy',
    });

    return _map;
  }

  function getMap() { return _map; }

  // ── Station info window ───────────────────────────────

  function showStationInfo(marker, station) {
    if (_openInfoWindow) _openInfoWindow.close();

    const occ  = station.slots.filter(s => s.occupied).length;
    const full = occ === station.slots.length;

    // Map plug type to marker type (matching map-marker.tsx)
    const plugColors = {
      'AC Type-1': Colors.carService,
      'AC Type-2': Colors.maintenance,
      'DC':        Colors.charging,
    };
    const markerColor = plugColors[station.plugType] || Colors.primary;

    const content = `
      <div style="
        background: #0D2C3D;
        border: 1px solid #1A3A4A;
        border-radius: 10px;
        padding: 12px 14px;
        font-family: 'DM Sans', sans-serif;
        color: #E8F4F0;
        min-width: 180px;
        max-width: 240px;
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="
            width:10px;height:10px;border-radius:50%;
            background:${markerColor};
            display:inline-block;flex-shrink:0;
          "></span>
          <strong style="font-size:13px;color:#E8F4F0;">${station.name}</strong>
        </div>
        ${station.network ? `<div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">🏢 ${station.network}</div>` : ''}
        ${station.plugType ? `<div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">🔌 ${station.plugType}</div>` : ''}
        <div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">⚡ ${station.kw} kW</div>
        ${station.address ? `<div style="font-size:10px;color:#3D6878;margin-bottom:4px;">📍 ${station.address}</div>` : ''}
        <div style="
          margin-top:8px;
          padding:6px 8px;
          background:${full ? 'rgba(255,92,92,0.1)' : 'rgba(42,224,122,0.08)'};
          border-radius:6px;
          font-size:11px;
          color:${full ? '#FF5C5C' : '#2AE07A'};
          font-weight:600;
        ">
          ${full ? '🔴 All slots occupied' : `🟢 ${station.slots.length - occ} of ${station.slots.length} slots free`}
        </div>
      </div>`;

    _openInfoWindow = new google.maps.InfoWindow({ content, disableAutoPan: false });
    _openInfoWindow.open(_map, marker);
  }

  // ── Cluster + station render ──────────────────────────

  /**
   * Re-render all station markers/clusters on the map.
   * Called by main.js whenever the filter or zoom changes.
   *
   * @param {Object[]} stations  Filtered Sim station objects
   */
  function renderStations(stations) {
    if (!_map) return;
    const zoom = _map.getZoom();
    ClusterManager.render(stations, zoom, (station, marker) => {
      showStationInfo(marker, station);
    });
  }

  // ── Car overlays ──────────────────────────────────────

  /**
   * Update (or create) a car marker.
   * @param {Object} car          Sim car object (requires lat + lng)
   * @param {Function} [onCarClick]  Optional callback(id) when marker is clicked.
   *                                 Falls back to Interactions.selectCar if omitted.
   */
  function updateCarMarker(car, onCarClick) {
    if (!_map || !car.lat || !car.lng) return;

    const pct = car.battery / 100;
    let color = Colors.primary;                          // idle  (green)
    if (car.status === 'routing')  color = Colors.carService;   // cyan
    if (car.status === 'charging') color = Colors.charging;     // amber
    if (pct < 0.2)                 color = Colors.warning;      // red (critical)

    const size = 18;
    const svg  = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect x="1" y="1" width="22" height="22" rx="5" fill="${color}" fill-opacity="0.9" stroke="white" stroke-width="2"/>
  <text x="12" y="16" text-anchor="middle" font-size="13" fill="white">🚗</text>
</svg>`.trim();

    const icon = {
      url:    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      size:   new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };

    const pos = { lat: car.lat, lng: car.lng };

    if (_carMarkers[car.id]) {
      _carMarkers[car.id].setPosition(pos);
      _carMarkers[car.id].setIcon(icon);
    } else {
      const m = new google.maps.Marker({ position: pos, map: _map, title: car.name, icon, zIndex: 500 });
      m.addListener('click', () => {
        if (onCarClick) {
          onCarClick(car.id);
        } else if (typeof Interactions !== 'undefined') {
          Interactions.selectCar(car.id);
        }
      });
      _carMarkers[car.id] = m;
    }
  }

  /**
   * Update (or create) the routing path polyline for a car.
   * @param {Object} car  Sim car object
   */
  function updateCarPath(car) {
    if (!_map) return;

    // Remove stale polyline if car has no path
    if (!car.path || car.path.length === 0) {
      if (_pathLines[car.id]) { _pathLines[car.id].setMap(null); delete _pathLines[car.id]; }
      return;
    }

    const coords = [];
    // Prepend the car's current position so the line starts from the car
    if (car.lat !== undefined && car.lng !== undefined) {
      coords.push({ lat: car.lat, lng: car.lng });
    }
    for (let i = car.pathIdx; i < car.path.length; i++) {
      const n = car.path[i];
      if (n && n.lat !== undefined && n.lng !== undefined) {
        coords.push({ lat: n.lat, lng: n.lng });
      }
    }

    if (coords.length === 0) return;

    if (_pathLines[car.id]) {
      _pathLines[car.id].setPath(coords);
    } else {
      _pathLines[car.id] = new google.maps.Polyline({
        path:          coords,
        geodesic:      true,
        strokeColor:   car.color || Colors.carService,
        strokeOpacity: 0.65,
        strokeWeight:  2,
        map:           _map,
      });
    }
  }

  /** Remove a single car marker and its path polyline by id. */
  function removeCar(id) {
    if (_carMarkers[id]) { _carMarkers[id].setMap(null); delete _carMarkers[id]; }
    if (_pathLines[id])  { _pathLines[id].setMap(null);  delete _pathLines[id];  }
  }

  /** Remove all car markers and path polylines. */
  function clearCarOverlays() {
    Object.values(_carMarkers).forEach(m => m.setMap(null));
    Object.values(_pathLines).forEach(p => p.setMap(null));
    Object.keys(_carMarkers).forEach(k => delete _carMarkers[k]);
    Object.keys(_pathLines).forEach(k => delete _pathLines[k]);
  }

  // ── Map controls ──────────────────────────────────────

  function setCenter(lat, lng, zoom) {
    if (_map) {
      _map.setCenter({ lat, lng });
      if (zoom !== undefined) _map.setZoom(zoom);
    }
  }

  function fitBounds(north, south, east, west) {
    if (_map) {
      _map.fitBounds(new google.maps.LatLngBounds(
        { lat: south, lng: west },
        { lat: north, lng: east },
      ));
    }
  }

  return {
    init,
    getMap,
    renderStations,
    updateCarMarker,
    updateCarPath,
    removeCar,
    clearCarOverlays,
    setCenter,
    fitBounds,
    MAP_STYLES,
  };

})();

// ─────────────────────────────────────────────────────────────────────────────
// GMapSim
// Self-contained EV simulation running on top of Google Maps.
// Mirrors DummySim's car-fleet behaviour (add cars, run sim, auto-route to
// charging stations) but uses real lat/lng coordinates and the real stations
// loaded from the AWS API.
// ─────────────────────────────────────────────────────────────────────────────

const GMapSim = (() => {

  // ── Constants ────────────────────────────────────────────
  const DRAIN_RATE  = 2500;    // % battery lost per degree of Euclidean movement (× drainMultiplier)
  const CHARGE_RATE = 15;      // % per second at a 100 kW reference station
  const CRIT        = 20;      // % — emergency routing threshold
  const LOW         = 35;      // % — proactive routing threshold
  // Base speed in degrees/second. 1 degree lat ≈ 111 km so this is
  // roughly 0.00022 × 111 000 ≈ 24 m/s (~87 km/h) near Kathmandu (~28°N).
  const CAR_SPEED   = 0.00022;
  const COLORS      = ['#2AE07A','#3EC9FF','#F5A623','#B388FF','#FF80AB','#80DEEA','#FFCC02','#FF6B6B'];

  // ── State ─────────────────────────────────────────────────
  let _active        = false;
  let _running       = false;
  let _animFrameId   = null;
  let _lastTs        = 0;
  let _speed         = 1;
  let _algo          = 'astar';
  let _cars          = [];
  let _carIdCounter  = 0;
  let _selectedCarId = null;

  // ── Helpers ───────────────────────────────────────────────

  function _log(msg, type = 'info') {
    const panel = document.getElementById('log-panel');
    if (!panel) return;
    const now = new Date();
    const t   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const el  = document.createElement('div');
    el.className = `log-entry ${type}`;
    el.innerHTML = `<span class="log-time">${t}</span>${msg}`;
    panel.insertBefore(el, panel.firstChild);
    if (panel.children.length > 60) panel.removeChild(panel.lastChild);
  }

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /** Return the currently-visible map bounds for spawning cars. */
  function _getBounds() {
    const FALLBACK = { north: 27.762, south: 27.672, east: 85.399, west: 85.249 };
    const gmap = GoogleMapsModule.getMap();
    if (!gmap) return FALLBACK;
    const b = gmap.getBounds();
    if (!b) return FALLBACK;
    return {
      north: b.getNorthEast().lat(),
      south: b.getSouthWest().lat(),
      east:  b.getNorthEast().lng(),
      west:  b.getSouthWest().lng(),
    };
  }

  function _randInBounds() {
    const b = _getBounds();
    return {
      lat: b.south + Math.random() * (b.north - b.south),
      lng: b.west  + Math.random() * (b.east  - b.west),
    };
  }

  /** Euclidean distance in degrees (good enough for routing in a small city). */
  function _dist(aLat, aLng, bLat, bLng) {
    const dlat = aLat - bLat, dlng = aLng - bLng;
    return Math.sqrt(dlat * dlat + dlng * dlng);
  }

  /** Stations with real lat/lng from the shared Sim state. */
  function _getStations() {
    return Sim.getStations().filter(s => s.lat && s.lng);
  }

  // ── Car factory ───────────────────────────────────────────

  function _mkCar() {
    const pos  = _randInBounds();
    const dest = _randInBounds();
    const id   = ++_carIdCounter;
    const car  = {
      id,
      name:            `CAR-${String(id).padStart(3, '0')}`,
      lat:             pos.lat,
      lng:             pos.lng,
      destLat:         dest.lat,
      destLng:         dest.lng,
      color:           COLORS[(id - 1) % COLORS.length],
      battery:         35 + Math.random() * 55,
      status:          'idle',
      speed:           CAR_SPEED * (0.8 + Math.random() * 0.4),
      targetStation:   null,
      chargingSlot:    null,
      drainMultiplier: 0.8 + Math.random() * 0.4,
      _routeStarted:   false,
      _lastCritBat:    null,
      path:            [],   // array of {lat, lng} waypoints
      pathIdx:         0,
    };
    _cars.push(car);
    return car;
  }

  // ── Routing ───────────────────────────────────────────────

  function _findNearestStation(car) {
    const available = _getStations().filter(s => s.slots.some(sl => !sl.occupied));
    if (!available.length) return null;
    return available.reduce((best, s) => {
      const d = _dist(car.lat, car.lng, s.lat, s.lng);
      return (!best || d < best.d) ? { s, d } : best;
    }, null).s;
  }

  function _routeToNearest(car) {
    const st = _findNearestStation(car);
    if (!st) { _log(`❌ ${car.name}: no stations available`, 'critical'); return; }
    car.targetStation = st;
    car.status        = 'routing';
    car.path          = [{ lat: st.lat, lng: st.lng }];
    car.pathIdx       = 0;
    _log(`📍 ${car.name} → ${st.name}`, 'info');
  }

  function _arrive(car) {
    const st   = car.targetStation;
    if (!st) return;
    const slot = st.slots.find(s => !s.occupied);
    if (!slot) {
      _log(`⚠️ ${car.name}: ${st.name} full, rerouting…`, 'warn');
      car.targetStation = null;
      car._routeStarted = false;
      _routeToNearest(car);
      return;
    }
    slot.occupied    = true;
    slot.car         = car;
    car.chargingSlot = slot;
    car.status       = 'charging';
    car.path         = [];
    _log(`✅ ${car.name} charging at ${st.name} [${st.kw}kW]`, 'success');
  }

  function _doneCharging(car) {
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
      car.chargingSlot          = null;
    }
    car.status        = 'idle';
    car.targetStation = null;
    car._routeStarted = false;
    car._lastCritBat  = null;
    const dest = _randInBounds();
    car.destLat = dest.lat;
    car.destLng = dest.lng;
    car.path    = [{ lat: dest.lat, lng: dest.lng }];
    car.pathIdx = 0;
    _log(`🟢 ${car.name} charged (${Math.round(car.battery)}%), resuming`, 'success');
  }

  // ── Per-frame update ──────────────────────────────────────

  function _update(dt) {
    if (!_running) return;
    const sdt = dt * _speed;

    _cars.forEach(car => {
      // ── Movement ──
      if ((car.status === 'routing' || car.status === 'idle') && car.path.length > car.pathIdx) {
        const tgt  = car.path[car.pathIdx];
        const dlat = tgt.lat - car.lat, dlng = tgt.lng - car.lng;
        const dist = Math.sqrt(dlat * dlat + dlng * dlng);
        const step = car.speed * sdt;

        if (dist < step) {
          car.lat = tgt.lat;
          car.lng = tgt.lng;
          car.pathIdx++;
          if (car.targetStation && car.pathIdx >= car.path.length) _arrive(car);
        } else {
          car.lat += (dlat / dist) * step;
          car.lng += (dlng / dist) * step;
        }

        // Battery drain proportional to actual distance moved
        car.battery -= DRAIN_RATE * Math.min(dist, step) * car.drainMultiplier;
        car.battery  = Math.max(0, car.battery);

        // Idle car reached its random waypoint → pick a new one
        if (!car.targetStation && car.pathIdx >= car.path.length) {
          const dest = _randInBounds();
          car.destLat = dest.lat;
          car.destLng = dest.lng;
          car.path    = [{ lat: dest.lat, lng: dest.lng }];
          car.pathIdx = 0;
        }
      }

      // ── Charging ──
      if (car.status === 'charging') {
        const kwFactor  = (car.targetStation?.kw || 100) / 100;
        car.battery     = Math.min(100, car.battery + CHARGE_RATE * sdt * kwFactor);
        if (car.battery >= 90) _doneCharging(car);
      }

      // ── Battery thresholds ──
      if (car.battery < CRIT && car.status === 'idle') {
        const roundedBat = Math.round(car.battery);
        if (roundedBat !== car._lastCritBat) {
          _log(`🔴 ${car.name} CRITICAL — ${roundedBat}%`, 'critical');
          car._lastCritBat = roundedBat;
        }
        _routeToNearest(car);
      } else if (car.battery < LOW && car.status === 'idle' && !car._routeStarted) {
        car._routeStarted = true;
        _log(`⚠️ ${car.name} low battery (${Math.round(car.battery)}%), routing…`, 'warn');
        _routeToNearest(car);
      }
    });
  }

  // ── Render ────────────────────────────────────────────────

  function _render() {
    _cars.forEach(car => {
      GoogleMapsModule.updateCarMarker(car, (id) => {
        _selectedCarId = id;
        _renderCarControls();
        _renderCarList();
      });
      GoogleMapsModule.updateCarPath(car);
    });
  }

  // ── UI ────────────────────────────────────────────────────

  function _updateUI() {
    _set('hdr-cars',     _cars.length);
    _set('hdr-routing',  _cars.filter(c => c.status === 'routing').length);
    _set('hdr-charging', _cars.filter(c => c.status === 'charging').length);
    _set('hdr-stations', _getStations().length);
    _renderCarList();
    _renderCarControls();
  }

  function _renderCarList() {
    const list = document.getElementById('car-list');
    if (!list) return;
    list.innerHTML = '';
    const labels = { idle: 'IDLE', routing: 'ROUTING', charging: 'CHARGING', critical: 'CRITICAL' };

    _cars.forEach(car => {
      const pct   = car.battery;
      const bc    = pct > 50 ? '#2AE07A' : pct > 20 ? '#F5A623' : '#FF5C5C';
      const st    = pct < CRIT ? 'critical' : car.status;
      const isSel = _selectedCarId === car.id;
      const card  = document.createElement('div');
      card.className = `car-card ${st} ${isSel ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="car-card-header">
          <div class="car-name" style="color:${car.color}">${car.name}</div>
          <div class="status-badge badge-${st}">${labels[st] || 'IDLE'}</div>
        </div>
        <div class="battery-wrap"><div class="battery-fill" style="width:${pct}%;background:${bc}"></div></div>
        <div class="battery-info">
          <span class="battery-pct" style="color:${bc}">${Math.round(pct)}%</span>
          <span>${car.targetStation ? '→ ' + car.targetStation.name : car.status === 'charging' ? '⚡ Charging' : 'En route'}</span>
        </div>`;
      card.onclick = () => { _selectedCarId = car.id; _renderCarControls(); _renderCarList(); };
      list.appendChild(card);
    });

    // Add-car button (matches main canvas sim style)
    const addBtn = document.createElement('button');
    addBtn.className   = 'add-btn';
    addBtn.textContent = '+ Add Car to Fleet';
    addBtn.onclick     = addCar;
    list.appendChild(addBtn);
  }

  function _renderCarControls() {
    const area = document.getElementById('car-controls-area');
    if (!area) return;
    if (!_selectedCarId) {
      area.innerHTML = '<p class="placeholder-text">Click a car on the map to control it</p>';
      return;
    }
    const car = _cars.find(c => c.id === _selectedCarId);
    if (!car) return;

    area.innerHTML = `
      <div class="car-ctrl-card">
        <div class="car-ctrl-name" style="color:${car.color}">${car.name}</div>

        <label class="ctrl-label">Battery %</label>
        <div class="ctrl-row">
          <input type="range" min="0" max="100" value="${Math.round(car.battery)}"
            oninput="GMapSim._setBattery(${car.id},this.value);this.nextElementSibling.textContent=Math.round(this.value)+'%'">
          <span class="slider-val">${Math.round(car.battery)}%</span>
        </div>

        <label class="ctrl-label">Drain Rate</label>
        <div class="ctrl-row">
          <input type="range" min="0.2" max="3" step="0.1" value="${car.drainMultiplier.toFixed(1)}"
            oninput="GMapSim._setDrain(${car.id},this.value);this.nextElementSibling.textContent=parseFloat(this.value).toFixed(1)+'×'">
          <span class="slider-val">${car.drainMultiplier.toFixed(1)}×</span>
        </div>

        <div class="ctrl-actions">
          <button class="btn primary" onclick="GMapSim._forceRoute(${car.id})">⚡ Route Now</button>
          <button class="btn danger"  onclick="GMapSim._removeCar(${car.id})">✕ Remove</button>
        </div>
      </div>`;
  }

  // ── Animation loop ────────────────────────────────────────

  function _loop(ts) {
    if (!_active) return;
    const dt = Math.min((ts - _lastTs) / 1000, 0.1);
    _lastTs  = ts;
    _update(dt);
    _render();
    _updateUI();
    _animFrameId = requestAnimationFrame(_loop);
  }

  // ── Public helpers (called from inline onclick=) ──────────

  function _setBattery(id, v) {
    const c = _cars.find(x => x.id === id);
    if (c) { c.battery = +v; _log(`🔋 ${c.name} battery → ${Math.round(v)}%`, 'info'); }
  }

  function _setDrain(id, v) {
    const c = _cars.find(x => x.id === id);
    if (c) c.drainMultiplier = +v;
  }

  function _forceRoute(id) {
    const car = _cars.find(c => c.id === id);
    if (!car) return;
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
      car.chargingSlot          = null;
    }
    car._routeStarted = false;
    car.status        = 'idle';
    _routeToNearest(car);
  }

  function _removeCar(id) {
    const car = _cars.find(c => c.id === id);
    if (!car) return;
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
    }
    GoogleMapsModule.removeCar(id);
    _log(`🗑️ ${car.name} removed`, 'info');
    _cars = _cars.filter(c => c.id !== id);
    if (_selectedCarId === id) _selectedCarId = null;
    _renderCarControls();
    _renderCarList();
  }

  // ── Seed ──────────────────────────────────────────────────

  function _seed() {
    for (let i = 0; i < 4; i++) {
      const car = _mkCar();
      car.path = [{ lat: car.destLat, lng: car.destLng }];
    }
    _log(`🚗 ${_cars.length} cars spawned on Google Maps`, 'info');
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Called by setMapMode('gmaps') in main.js after the map is ready.
   * Starts the animation loop and seeds initial cars if none yet exist.
   */
  function activate() {
    if (_active) return;
    _active  = true;
    _running = false;

    const btn = document.getElementById('sim-btn');
    if (btn) { btn.textContent = '▶ Run Sim'; btn.className = 'btn primary'; }

    if (_cars.length === 0) _seed();

    _log('🗺️ Google Maps Sim ready — press ▶ Run Sim to start', 'success');
    _lastTs      = performance.now();
    _animFrameId = requestAnimationFrame(_loop);
  }

  /**
   * Called by setMapMode when leaving gmaps mode.
   * Stops the loop and clears all car overlays from the map.
   */
  function deactivate() {
    if (!_active) return;
    _active  = false;
    _running = false;
    if (_animFrameId) { cancelAnimationFrame(_animFrameId); _animFrameId = null; }
    GoogleMapsModule.clearCarOverlays();
  }

  // ── Header-button delegates ───────────────────────────────

  function toggleSim() {
    _running = !_running;
    const btn = document.getElementById('sim-btn');
    if (btn) {
      btn.textContent = _running ? '⏸ Pause' : '▶ Run Sim';
      btn.className   = _running ? 'btn danger' : 'btn primary';
    }
    _log(_running ? '▶ GMap Sim started' : '⏸ GMap Sim paused', 'info');
  }

  function addCar() {
    const car = _mkCar();
    car.path = [{ lat: car.destLat, lng: car.destLng }];
    _log(`🚗 ${car.name} added`, 'info');
  }

  function resetSim() {
    _cars.forEach(car => {
      if (car.chargingSlot) {
        car.chargingSlot.occupied = false;
        car.chargingSlot.car      = null;
      }
    });
    _cars          = [];
    _carIdCounter  = 0;
    _selectedCarId = null;
    _running       = false;
    GoogleMapsModule.clearCarOverlays();
    const btn = document.getElementById('sim-btn');
    if (btn) { btn.textContent = '▶ Run Sim'; btn.className = 'btn primary'; }
    _seed();
    _log('↺ GMap Sim reset', 'info');
  }

  function setSpeed(v) { _speed = v; }

  /**
   * Store the selected algorithm and update the HUD display.
   * GMapSim routes cars directly (no graph pathfinding), so the algorithm
   * choice is reflected in the HUD for informational purposes only.
   */
  function setAlgo(v) {
    _algo = v;
    const names   = { astar: 'A* Pathfinding', dijkstra: 'Dijkstra', greedy: 'Greedy Best-First' };
    const details = { astar: 'Heuristic: Euclidean distance', dijkstra: 'Heuristic: None (optimal)', greedy: 'Heuristic: 2× Euclidean (fast)' };
    _set('algo-name',   names[v]   || v);
    _set('algo-detail', details[v] || '');
  }

  function isActive()  { return _active; }

  return {
    // Lifecycle
    activate,
    deactivate,
    isActive,

    // Header-button delegates (called from main.js guards)
    toggleSim,
    addCar,
    resetSim,
    setSpeed,
    setAlgo,

    // Exposed for inline onclick= in car controls
    _setBattery,
    _setDrain,
    _forceRoute,
    _removeCar,
  };

})();
