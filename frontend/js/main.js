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
const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:3001/api'
  : '/api';  // same-origin in production

// ── DynamoDB stations API (proxied through backend to avoid CORS) ─────────
const DYNAMO_STATIONS_URL = `${API_BASE}/maps/dynamo-stations`;

let gmapMarkers = []; // track markers so we can clear them on reset

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

  // 6. Fetch real stations from backend (replaces seed data)
  fetchStationsFromBackend();

  // 7. Open WebSocket for live slot push updates
  connectWebSocket();

  addLogEntry('🚀 Tenatra EV Simulation ready', 'success');
  // 8.Start in Dummy Sim mode (no API needed)
  setMapMode('dummy');

    // 9.Start game loop
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
          requestAnimationFrame(() => DummySim.activate());
        } else if (mode === 'gmaps') {
          bgCanvasEl.style.opacity   = '0';
          mainCanvasEl.style.opacity = '0.4'; // keep car overlay visible
          gmapsDiv.classList.remove('hidden');
          initGoogleMap();
        } else {
          bgCanvasEl.style.opacity   = '1';
          mainCanvasEl.style.opacity = '1';
          gmapsDiv.classList.add('hidden');

          Renderer.resize(mapContainer.clientWidth, mapContainer.clientHeight,
            buildRoadSegments(mapContainer.clientWidth, mapContainer.clientHeight));
        }

}

/**
 * Initialise a Google Maps instance centred on Kathmandu
 * (update the centre lat/lng and zoom to match your deployment region).
 */
function initGoogleMap() {
  if (googleMap) return; // already initialised

  if (typeof google === 'undefined' || !google.maps) {
    addLogEntry('⚠️ Google Maps API not loaded — check your API key in index.html', 'warn');
    return;
  }

  const DEFAULT_CENTER = { lat: 27.7172, lng: 85.3240 }; // Kathmandu
  const DEFAULT_ZOOM   = 13;

  googleMap = new google.maps.Map(gmapsDiv, {
    center:    DEFAULT_CENTER,
    zoom:      DEFAULT_ZOOM,
    mapTypeId: 'roadmap',
    styles:    GOOGLE_MAP_STYLES, // dark Tenatra theme defined below
    disableDefaultUI: false,
    gestureHandling:  'greedy',
  });

  // Wire the lat/lng ↔ canvas pixel converter
  // Google Maps uses a Projection to map geo coords to pixel space.
  google.maps.event.addListenerOnce(googleMap, 'tilesloaded', () => {
    Sim.setLatLngConverter((lat, lng) => {
      const projection = googleMap.getProjection();
      const bounds     = googleMap.getBounds();
      if (!projection || !bounds) return { x: 0, y: 0 };

      const topRight   = projection.fromLatLngToPoint(bounds.getNorthEast());
      const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest());
      const scale      = Math.pow(2, googleMap.getZoom());
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
        const { x, y } = Sim.latLngToCanvas ? Sim.latLngToCanvas(s.lat, s.lng) : { x: s.x, y: s.y };
        s.x = x; s.y = y;
      });

    addLogEntry('🗺️ Google Maps overlay active', 'success');

    // Fetch and plot real station data points from DynamoDB
    plotDynamoStations();
  });
}

/**
 * Fetch all stations from the DynamoDB API and drop markers on the Google Map.
 * Each station record has: Station_ID, Station_Name, Latitude, Longitude,
 * Operator, Power_kW, Plug_Type, District, Province, Country, Charging_Points
 */
async function plotDynamoStations() {
  if (!googleMap) return;

  try {
    addLogEntry('📡 Fetching station data points…', 'info');
    const res  = await fetch(DYNAMO_STATIONS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // API returns an array directly or wrapped in a key
    const stations = Array.isArray(data) ? data : (data.stations || data.data || []);

    // Clear any previous markers
    gmapMarkers.forEach(m => m.setMap(null));
    gmapMarkers = [];

    const infoWindow = new google.maps.InfoWindow();

    stations.forEach(s => {
      const lat = parseFloat(s.Latitude);
      const lng = parseFloat(s.Longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map:      googleMap,
        title:    s.Station_Name || s.Station_ID,
        icon: {
          path:        google.maps.SymbolPath.CIRCLE,
          scale:       7,
          fillColor:   '#2AE07A',
          fillOpacity: 0.9,
          strokeColor: '#04111A',
          strokeWeight: 1.5,
        },
      });

      marker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="font-family:DM Sans,sans-serif;font-size:13px;line-height:1.6;color:#111">
            <strong>${s.Station_Name || s.Station_ID}</strong><br>
            🔌 ${s.Plug_Type || '—'}<br>
            ⚡ ${s.Power_kW ? parseFloat(s.Power_kW) + ' kW' : '—'}<br>
            🏢 ${s.Operator || '—'}<br>
            📍 ${[s.District, s.Province, s.Country].filter(Boolean).join(', ')}
          </div>
        `);
        infoWindow.open(googleMap, marker);
      });

      gmapMarkers.push(marker);
    });

    addLogEntry(`📍 Plotted ${gmapMarkers.length} stations on map`, 'success');
  } catch (err) {
    addLogEntry(`⚠️ Failed to load station data: ${err.message}`, 'warn');
  }
}

// ─────────────────────────────────────────────────────────
// BACKEND API
// ─────────────────────────────────────────────────────────

/**
 * Fetch all stations from backend.
 * Your database rows must match the schema expected by
 * Sim.loadStationsFromDB() — see simulation.js for the mapping.
 */
async function fetchStationsFromBackend() {
  try {
    setApiStatus('connecting');
    const res  = await fetch(`${API_BASE}/stations`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    Sim.loadStationsFromDB(data.stations || data);
    refreshUI();

    setApiStatus('connected');
    document.getElementById('last-sync-time').textContent = new Date().toLocaleTimeString();
    addLogEntry(`📡 Synced ${(data.stations||data).length} stations from database`, 'success');
  } catch (err) {
    setApiStatus('error');
    addLogEntry(`⚠️ Backend sync failed: ${err.message}`, 'warn');
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
  document.getElementById('hdr-critical').textContent = cars.filter(c => c.battery<CRIT).length;
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
