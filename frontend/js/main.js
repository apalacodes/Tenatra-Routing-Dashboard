/**
 * js/main.js
 * ─────────────────────────────────────────────
 * Application Boot & Orchestration
 *
 * Responsibilities:
 *   1. Resize + init canvas
 *   2. Wire Sim callbacks (log, pushSlot, latLng converter)
 *   3. Start the game loop
 *   4. Expose global control functions (called from HTML buttons)
 *   5. Fetch real station data from the backend API
 *   6. Open WebSocket for live slot updates
 *   7. Initialise Google Maps overlay (when toggled)
 *   8. Render the side panel UI (car list, station list, log)
 * ─────────────────────────────────────────────
 */

// ── DOM references ────────────────────────────────────────
const bgCanvasEl   = document.getElementById('bg-canvas');
const mainCanvasEl = document.getElementById('main-canvas');
const mapContainer = document.getElementById('map-container');
const gmapsDiv     = document.getElementById('gmaps-container');
const dummyMapBtn  = document.getElementById('btn-dummy-mode');

// ── State ─────────────────────────────────────────────────
let lastTimestamp = 0;
let mapMode       = 'canvas' // 'canvas' | 'gmaps' |'dummy'
// let dummyMode     = false;    // if true, sim runs with dummy data and no backend sync (for testing UI without backend)
let googleMap     = null;     // Google Maps instance
let wsConnection  = null;     // WebSocket connection

// ── Backend API base URL ──────────────────────────────────
// In production replace with your actual domain.
// During local dev the backend runs on :3001.
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';  // same-origin in production

// ─────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {

  // 1. Size canvases to container
  handleResize();
  window.addEventListener('resize', handleResize);

  // 2. Wire Sim callbacks
  Sim.setLogFn(addLogEntry);
  Sim.setPushSlotFn(pushSlotStatusToBackend);

  // 3. Init renderer
  Renderer.init(bgCanvasEl, mainCanvasEl);

  // 4. Init interactions
  Interactions.init(mainCanvasEl);

  // 5. Seed simulation with default data, then fetch real data
  Sim.init();
  refreshUI();

  // 6. Fetch real stations from AWS API (replaces seed data)
  fetchStationsFromBackend();

  // 7. Open WebSocket for live slot push updates
  connectWebSocket();

  // 8. Init search & filter modules
  initSearchAndFilter();

  addLogEntry('🚀 Tenatra EV Simulation ready', 'success');
  // 9. Start in Dummy Sim mode (no API needed)
  setMapMode('dummy');

  // 10. Start game loop
  requestAnimationFrame(gameLoop);
});

// ─────────────────────────────────────────────────────────
// GAME LOOP
// ─────────────────────────────────────────────────────────
function gameLoop(ts) {
  if (DummySim.isActive()) {
    lastTimestamp = ts; // keep timestamp fresh for when we resume
    requestAnimationFrame(gameLoop);
    return;
  }
  const dt = Math.min((ts - lastTimestamp) / 1000, 0.1);
  lastTimestamp = ts;

  Sim.update(dt);
  Renderer.drawFrame(Interactions.getSelectedCarId());

  requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────
function handleResize() {
  const W = mapContainer.clientWidth;
  const H = mapContainer.clientHeight;

  Sim.setCanvasSize(W, H);

  const { nodes } = buildGraph(W, H);
  Sim.setGraph(nodes);

  const roads = buildRoadSegments(W, H);
  Renderer.resize(W, H, roads);
}

// ─────────────────────────────────────────────────────────
// MAP MODE (Canvas sim ↔ Google Maps)
// ─────────────────────────────────────────────────────────
function setMapMode(mode) {
  const prev= mapMode;
  mapMode = mode;
  document.getElementById('btn-dummy-mode').classList.toggle('active', mode === 'dummy');
  document.getElementById('btn-canvas-mode').classList.toggle('active', mode === 'canvas');
  document.getElementById('btn-gmaps-mode').classList.toggle('active',  mode === 'gmaps');

  const searchBar = document.getElementById('map-search-bar');

  // Deactivate dummy sim if leaving it
  if (prev === 'dummy' && mode !== 'dummy') {
    DummySim.deactivate();
  }

  if (mode === 'dummy') {
    // Stop main game loop from drawing while dummy is active
    Sim.setSimRunning(false);
    gmapsDiv.classList.add('hidden');
    bgCanvasEl.style.opacity   = '1';
    mainCanvasEl.style.opacity = '1';
    if (searchBar) searchBar.classList.add('hidden');
    requestAnimationFrame(() => DummySim.activate());
  } else if (mode === 'gmaps') {
    bgCanvasEl.style.opacity   = '0';
    mainCanvasEl.style.opacity = '0.4'; // keep car overlay visible
    gmapsDiv.classList.remove('hidden');
    if (searchBar) searchBar.classList.remove('hidden');
    initGoogleMap();
  } else {
    bgCanvasEl.style.opacity   = '1';
    mainCanvasEl.style.opacity = '1';
    gmapsDiv.classList.add('hidden');
    if (searchBar) searchBar.classList.add('hidden');

    Renderer.resize(mapContainer.clientWidth, mapContainer.clientHeight,
      buildRoadSegments(mapContainer.clientWidth, mapContainer.clientHeight));
  }

}

/**
 * Initialise a Google Maps instance centred on Kathmandu.
 * Uses GoogleMapsModule and ClusterManager for marker rendering.
 */
function initGoogleMap() {
  if (GoogleMapsModule.getMap()) return; // already initialised

  if (typeof google === 'undefined' || !google.maps) {
    addLogEntry('⚠️ Google Maps API not loaded — check your API key in index.html', 'warn');
    return;
  }

  const DEFAULT_CENTER = { lat: 27.7172, lng: 85.3240 }; // Kathmandu
  const DEFAULT_ZOOM   = 13;

  const gmap = GoogleMapsModule.init(gmapsDiv, DEFAULT_CENTER, DEFAULT_ZOOM);
  googleMap  = gmap;   // keep legacy reference for backward compat

  // Attach ClusterManager to the new map
  ClusterManager.setMap(gmap);

  // Wire the lat/lng ↔ canvas pixel converter
  google.maps.event.addListenerOnce(gmap, 'tilesloaded', () => {
    Sim.setLatLngConverter((lat, lng) => {
      const projection = gmap.getProjection();
      const bounds     = gmap.getBounds();
      if (!projection || !bounds) return { x: 0, y: 0 };

      const topRight   = projection.fromLatLngToPoint(bounds.getNorthEast());
      const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest());
      const scale      = Math.pow(2, gmap.getZoom());
      const worldPoint = projection.fromLatLngToPoint(new google.maps.LatLng(lat, lng));

      return {
        x: (worldPoint.x - bottomLeft.x) * scale,
        y: (worldPoint.y - topRight.y)   * scale,
      };
    });

    // Re-place all real stations on map now that projection is ready
    Sim.getStations()
      .filter(s => s.lat && s.lng)
      .forEach(s => {
        const { x, y } = Sim.latLngToCanvas(s.lat, s.lng);
        s.x = x; s.y = y;
      });

    // Initial cluster render
    _renderFilteredStations();

    addLogEntry('🗺️ Google Maps overlay active', 'success');
  });

  // Re-render clusters on zoom change
  gmap.addListener('zoom_changed', _renderFilteredStations);
}

// ─────────────────────────────────────────────────────────
// BACKEND API
// ─────────────────────────────────────────────────────────

/**
 * Fetch all stations from the AWS API (same endpoint as the mobile app).
 * Normalises via StationManager → loads into Sim → re-renders.
 */
async function fetchStationsFromBackend() {
  try {
    setApiStatus('connecting');
    const rawStations = await API.scanStations();

    // Normalise into Sim schema via StationManager
    const simStations = StationManager.ingest(rawStations);

    // Load into simulation (replaces seed data)
    Sim.loadStationsFromAPI(simStations);
    refreshUI();

    // Rebuild filter panel with the real data
    const gmap = GoogleMapsModule.getMap();
    if (gmap) {
      _buildFilterPanel();
      _renderFilteredStations();
    }

    setApiStatus('connected');
    document.getElementById('last-sync-time').textContent = new Date().toLocaleTimeString();
    addLogEntry(`📡 Synced ${simStations.length} charging stations from AWS API`, 'success');
  } catch (err) {
    setApiStatus('error');
    addLogEntry(`⚠️ AWS API sync failed: ${err.message}`, 'warn');
    addLogEntry('💡 Using simulated station data', 'info');
  }
}

/**
 * Push a slot status change back to the backend after a car
 * occupies or vacates a slot in the simulation.
 *
 * @param {Object} station  - Sim station object
 */
async function pushSlotStatusToBackend(station) {
  if (!station.dbId) return; // sim-only station — no DB record

  try {
    await fetch(`${API_BASE}/stations/${station.dbId}/slots`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        slots: station.slots.map(sl => ({ occupied: sl.occupied })),
      }),
    });
  } catch (err) {
    // Non-fatal: simulation continues even if backend is unreachable
    console.warn('Slot sync failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────
// WEBSOCKET — live slot status push
// ─────────────────────────────────────────────────────────
function connectWebSocket() {
  const wsUrl = API_BASE.replace('http', 'ws').replace('/api', '') + '/ws';

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      addLogEntry('🔌 WebSocket connected — live updates active', 'success');
      setApiStatus('connected');
    };

    wsConnection.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'slot_update') {
          // { type: 'slot_update', stationDbId: '...', slots: [{occupied}] }
          Sim.applySlotUpdate(msg);
          refreshStationList();
          document.getElementById('last-sync-time').textContent = new Date().toLocaleTimeString();
        }
      } catch (e) { /* ignore malformed messages */ }
    };

    wsConnection.onclose = () => {
      setApiStatus('disconnected');
      // Auto-reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };

    wsConnection.onerror = () => {
      setApiStatus('error');
    };
  } catch (err) {
    addLogEntry('⚠️ WebSocket unavailable — polling mode only', 'warn');
  }
}

// ─────────────────────────────────────────────────────────
// API STATUS HUD
// ─────────────────────────────────────────────────────────
function setApiStatus(state) {
  const el = document.getElementById('api-status-text');
  if (!el) return;
  const map = {
    connecting:   ['● Connecting…',    'var(--amber)'],
    connected:    ['● Station sync: Live',  'var(--green)'],
    disconnected: ['● Disconnected',    'var(--red)'],
    error:        ['● Sync error',      'var(--red)'],
  };
  const [text, color] = map[state] || map.disconnected;
  el.textContent    = text;
  el.style.color    = color;
}

// ─────────────────────────────────────────────────────────
// HEADER BUTTON HANDLERS (called from HTML onclick=)
// ─────────────────────────────────────────────────────────
function toggleSim() {
  if (DummySim.isActive()) { DummySim.toggleSim(); return; }
  const running = !Sim.isRunning();
  Sim.setSimRunning(running);
  const btn = document.getElementById('sim-btn');
  btn.textContent = running ? '⏸ Pause' : '▶ Run Sim';
  btn.className   = running ? 'btn danger' : 'btn primary';
  addLogEntry(running ? '▶ Simulation started' : '⏸ Simulation paused', 'info');
}

function resetSim() {
  if (DummySim.isActive()) { DummySim.resetSim(); return; }
  Sim.reset();
  Sim.setSimRunning(false);
  Interactions.selectCar(null);
  document.getElementById('sim-btn').textContent = '▶ Run Sim';
  document.getElementById('sim-btn').className   = 'btn primary';
  document.getElementById('algo-stats').textContent = '';
  document.getElementById('log-panel').innerHTML = '';

  const { nodes } = buildGraph(mapContainer.clientWidth, mapContainer.clientHeight);
  Sim.setGraph(nodes);
  Sim.init();
  refreshUI();
  addLogEntry('↺ Simulation reset', 'info');
}


      function addCar()     { if (DummySim.isActive()) { DummySim.addCar();     return; } Sim.addCar();     refreshUI(); }
      function addStation() { if (DummySim.isActive()) { DummySim.addStation(); return; } Sim.addStation(); refreshUI(); }
      function setSpeed(v)  { if (DummySim.isActive()) { DummySim.setSpeed(v);  return; } Sim.setSpeed(v);  addLogEntry(`⏩ Speed: ${v}×`, 'info'); }

function setAlgo(v) {
  if (DummySim.isActive()) { DummySim.setAlgo(v); return; }
  Sim.setAlgo(v);
  const names   = { astar:'A* Pathfinding', dijkstra:'Dijkstra', greedy:'Greedy Best-First' };
  const details = { astar:'Heuristic: Euclidean distance', dijkstra:'Heuristic: None (optimal)', greedy:'Heuristic: 2× Euclidean (fast)' };
  document.getElementById('algo-name').textContent   = names[v]   || v;
  document.getElementById('algo-detail').textContent = details[v] || '';
  addLogEntry(`🧠 Algorithm: ${names[v]}`, 'info');
}

async function syncStations() {
  addLogEntry('⟳ Manual sync triggered…', 'info');
  await fetchStationsFromBackend();
}

// ─────────────────────────────────────────────────────────
// UI RENDER HELPERS  (exposed as global UI object)
// ─────────────────────────────────────────────────────────
const UI = {

  log: addLogEntry,

  refreshAll() { refreshUI(); },

  renderCarList(selectedId) {
    const list = document.getElementById('car-list');
    list.innerHTML = '';
    const CRIT = Sim.CRITICAL_THRESHOLD;

    Sim.getCars().forEach(car => {
      const pct      = car.battery;
      const st       = pct < CRIT ? 'critical' : car.status;
      const batClass = pct > 50 ? 'high' : pct > 20 ? 'medium' : 'low';
      const labels   = { idle:'IDLE', routing:'ROUTING', charging:'CHARGING', critical:'CRITICAL', arrived:'ARRIVED' };
      const sel      = car.id === selectedId;

      const card = document.createElement('div');
      card.className = `car-card ${st} ${sel ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="car-card-header">
          <div class="car-name" style="color:${car.color}">${car.name}</div>
          <div class="status-badge badge-${st}">${labels[st]||'IDLE'}</div>
        </div>
        <div class="battery-wrap"><div class="battery-fill ${batClass}" style="width:${pct}%"></div></div>
        <div class="battery-info">
          <span class="battery-pct ${batClass}">${Math.round(pct)}%</span>
          <span>${car.targetStation ? '→ '+car.targetStation.name : car.status==='charging' ? '⚡ Charging' : 'En route'}</span>
        </div>`;
      card.onclick = () => Interactions.selectCar(car.id);
      list.appendChild(card);
    });

    // Add-car button
    const addBtn = document.createElement('button');
    addBtn.className   = 'add-btn';
    addBtn.textContent = '+ Add Car to Fleet';
    addBtn.onclick     = addCar;
    list.appendChild(addBtn);
  },

  renderCarControls(selectedId) {
    const area = document.getElementById('car-controls-area');
    if (!selectedId) {
      area.innerHTML = '<p class="placeholder-text">Click a car on the map to control it</p>';
      return;
    }
    const car = Sim.getCars().find(c => c.id === selectedId);
    if (!car) { area.innerHTML = '<p class="placeholder-text">Car not found</p>'; return; }

    area.innerHTML = `
      <div class="car-ctrl-card">
        <div class="car-ctrl-name" style="color:${car.color}">${car.name}</div>

        <label class="ctrl-label">Battery %</label>
        <div class="ctrl-row">
          <input type="range" min="0" max="100" value="${Math.round(car.battery)}"
            oninput="Sim.setBattery(${car.id},this.value); this.nextElementSibling.textContent=Math.round(this.value)+'%'">
          <span class="slider-val">${Math.round(car.battery)}%</span>
        </div>

        <label class="ctrl-label">Speed (px/s)</label>
        <div class="ctrl-row">
          <input type="range" min="20" max="300" value="${Math.round(car.speed)}"
            oninput="Sim.setCarSpeed(${car.id},this.value); this.nextElementSibling.textContent=this.value">
          <span class="slider-val">${Math.round(car.speed)}</span>
        </div>

        <label class="ctrl-label">Drain Rate</label>
        <div class="ctrl-row">
          <input type="range" min="0.2" max="3" step="0.1" value="${(car.drainMultiplier||1).toFixed(1)}"
            oninput="Sim.setDrain(${car.id},this.value); this.nextElementSibling.textContent=parseFloat(this.value).toFixed(1)+'×'">
          <span class="slider-val">${(car.drainMultiplier||1).toFixed(1)}×</span>
        </div>

        <div class="ctrl-actions">
          <button class="btn primary" onclick="Sim.forceRoute(${car.id}); UI.refreshAll()">⚡ Route Now</button>
          <button class="btn danger"  onclick="Sim.removeCar(${car.id}); Interactions.selectCar(null); UI.refreshAll()">✕ Remove</button>
        </div>
      </div>`;
  },

};

// ── Internal render helpers ───────────────────────────────
function refreshUI() {
  refreshHeaderStats();
  UI.renderCarList(Interactions.getSelectedCarId());
  refreshStationList();
}

function refreshHeaderStats() {
  const cars     = Sim.getCars();
  const stations = Sim.getStations();
  const CRIT     = Sim.CRITICAL_THRESHOLD;

  document.getElementById('hdr-cars').textContent     = cars.length;
  document.getElementById('hdr-routing').textContent  = cars.filter(c => c.status==='routing').length;
  document.getElementById('hdr-charging').textContent = cars.filter(c => c.status==='charging').length;
  document.getElementById('hdr-stations').textContent = stations.length;
  const critEl = document.getElementById('hdr-critical');
  if (critEl) critEl.textContent = cars.filter(c => c.battery<CRIT).length;
}

function refreshStationList() {
  const list = document.getElementById('station-list');
  list.innerHTML = '';

  Sim.getStations().forEach(s => {
    const occ  = s.slots.filter(sl => sl.occupied).length;
    const full = occ === s.slots.length;

    const card = document.createElement('div');
    card.className = `station-card ${full ? 'full' : ''}`;
    card.innerHTML = `
      <div class="station-card-header">
        <div class="station-name">${s.name}</div>
        <div class="slot-dots">
          ${s.slots.map(sl => `<div class="slot-dot ${sl.occupied?'occupied':'free'}"></div>`).join('')}
        </div>
      </div>
      <div class="station-meta">
        <span class="station-kw">${s.kw}kW DC Fast</span>
        <span class="station-avail ${full?'full':'ok'}">${full?'FULL':`${s.slots.length-occ} free`}</span>
      </div>`;
    list.appendChild(card);
  });

  // Add-station button
  const addBtn = document.createElement('button');
  addBtn.className   = 'add-btn';
  addBtn.textContent = '+ Install Station';
  addBtn.onclick     = addStation;
  list.appendChild(addBtn);
}

// ── Periodic UI refresh (every 300ms) ────────────────────
setInterval(refreshUI, 300);

// ─────────────────────────────────────────────────────────
// EVENT LOG
// ─────────────────────────────────────────────────────────
function addLogEntry(msg, type = 'info') {
  const panel = document.getElementById('log-panel');
  const now   = new Date();
  const time  = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

  const el          = document.createElement('div');
  el.className      = `log-entry ${type}`;
  el.innerHTML      = `<span class="log-time">${time}</span>${msg}`;
  panel.insertBefore(el, panel.firstChild);

  if (panel.children.length > 60) panel.removeChild(panel.lastChild);
}

function toggleHUD() {
  const sidebar = document.getElementById('hud-sidebar');
  const icon    = document.getElementById('hud-toggle-icon');
  const collapsed = sidebar.classList.toggle('collapsed');
  icon.textContent = collapsed ? '▶' : '◀';
}

// ─────────────────────────────────────────────────────────
// SEARCH & FILTER INTEGRATION
// ─────────────────────────────────────────────────────────

/**
 * Wire up SearchModule and FilterModule to the DOM elements
 * added in index.html.  Called once on DOMContentLoaded.
 */
function initSearchAndFilter() {
  const input      = document.getElementById('search-input');
  const clearBtn   = document.getElementById('search-clear');
  const loader     = document.getElementById('search-loader');
  const searchIcon = document.getElementById('search-icon');
  const filterBtn  = document.getElementById('filter-btn');
  const filterPanel = document.getElementById('filter-panel');

  if (!input || !filterBtn || !filterPanel) return;

  SearchModule.init({
    input,
    clearBtn,
    loader,
    searchIcon,
    onChange: (_query) => { _renderFilteredStations(); },
    onSearch: (_query) => { _renderFilteredStations(); },
  });

  FilterModule.init({
    btn:      filterBtn,
    panel:    filterPanel,
    onChange: (_filters) => { _renderFilteredStations(); },
  });
}

/**
 * Build (or rebuild) the filter panel from the current station data.
 * Called after stations are loaded from the API.
 */
function _buildFilterPanel() {
  const stations   = StationManager.getAll();
  const plugTypes  = StationManager.getPlugTypes();
  const operators  = StationManager.getOperators();
  const maxPowerKw = Math.max(...stations.map(s => s.kw || 0), 350);
  FilterModule.buildPanel(plugTypes, operators, maxPowerKw);
}

/**
 * Apply current search query + filter state, then re-render
 * the cluster / marker layer on Google Maps.
 */
function _renderFilteredStations() {
  const gmap = GoogleMapsModule.getMap();
  if (!gmap) return;

  // Start from the full station list loaded into Sim
  let stations = Sim.getStations().filter(s => s.lat && s.lng);

  // Apply search
  const query = SearchModule.getQuery();
  if (query) {
    stations = SearchModule.filterByQuery(stations, query);
  }

  // Apply filter panel state
  const filters = FilterModule.getFilters();
  stations = StationManager.applyFilters(stations, filters);

  // Render with clustering
  GoogleMapsModule.renderStations(stations);
}

// ─────────────────────────────────────────────────────────
// GOOGLE MAPS DARK STYLE (matches Tenatra palette)
// ─────────────────────────────────────────────────────────
const GOOGLE_MAP_STYLES = [
  { elementType: 'geometry',         stylers: [{ color: '#062030' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7EAAB8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#04111A' }] },
  { featureType: 'road',              elementType: 'geometry',       stylers: [{ color: '#0A2535' }] },
  { featureType: 'road',              elementType: 'geometry.stroke', stylers: [{ color: '#1A3A4A' }] },
  { featureType: 'road.highway',      elementType: 'geometry',       stylers: [{ color: '#0D3048' }] },
  { featureType: 'road.highway',      elementType: 'geometry.stroke', stylers: [{ color: '#1A4A64' }] },
  { featureType: 'water',             elementType: 'geometry',       stylers: [{ color: '#041520' }] },
  { featureType: 'poi',               elementType: 'geometry',       stylers: [{ color: '#062030' }] },
  { featureType: 'transit',           elementType: 'geometry',       stylers: [{ color: '#041828' }] },
  { featureType: 'administrative',    elementType: 'geometry',       stylers: [{ color: '#0A2535' }] },
];
