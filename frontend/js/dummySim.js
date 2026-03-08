/**
 * js/dummySim.js
 * ─────────────────────────────────────────────────────────
 * Self-contained Dummy Simulation
 *
 * Zero API dependencies. Runs entirely in-browser on a
 * synthetic road grid. Activated / deactivated by the
 * "Dummy Map" toggle in the main header (setMapMode).
 */

const DummySim = (() => {
  const _carImg = new Image();
  _carImg.src = 'assets/car.png'; 
  // ── Internal state ────────────────────────────────────────
  let _active       = false;
  let _animFrameId  = null;
  let _resizeHandler = null;
  let _lastTs       = 0;
  let _frame        = 0;
  let _totalPaths   = 0;

  // Canvas refs — assigned on activate()
  let _canvas   = null;
  let _bgCanvas = null;
  let _ctx      = null;
  let _bgCtx    = null;
  let _container = null;

  let _W = 0, _H = 0;

  // Sim state — fully private
  let _cars        = [];
  let _stations    = [];
  let _roads       = [];
  let _nodes       = [];
  let _nodeMap     = {};

  let _running       = false;
  let _speed         = 1;
  let _algo          = 'astar';
  let _selectedCarId = null;
  let _dragCar       = null;
  let _dragOffset    = { x: 0, y: 0 };
  let _isDragging    = false;

  let _carIdCounter     = 0;
  let _stationIdCounter = 0;

  // Constants
  const DRAIN_RATE  = 0.003;
  const CHARGE_RATE = 15;
  const CRIT        = 20;
  const LOW         = 35;
  const COLORS      = ['#2AE07A','#3EC9FF','#F5A623','#B388FF','#FF80AB','#80DEEA','#FFCC02','#FF6B6B'];

  // ── Road network ─────────────────────────────────────────
  function _initRoads() {
    _roads = [];
    const hRows = [0.15, 0.3, 0.5, 0.7, 0.85];
    const vCols = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95];
    hRows.forEach(r => _roads.push({ x1: 0,      y1: r * _H, x2: _W,       y2: r * _H, express: false }));
    vCols.forEach(c => _roads.push({ x1: c * _W, y1: 0,      x2: c * _W,   y2: _H,     express: false }));
    _roads.push({ x1: 0,         y1: _H * 0.6,  x2: _W * 0.4, y2: _H * 0.15, express: true });
    _roads.push({ x1: _W * 0.6,  y1: _H * 0.85, x2: _W,       y2: _H * 0.3,  express: true });
  }

  // ── Graph ────────────────────────────────────────────────
  function _buildGraph() {
    _nodes = []; _nodeMap = {};
    const hRows = [0.15, 0.3, 0.5, 0.7, 0.85];
    const vCols = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95];

    hRows.forEach((r, ri) => vCols.forEach((c, ci) => {
      const id = `${ri}_${ci}`;
      const n  = { id, x: c * _W, y: r * _H, neighbors: [] };
      _nodes.push(n); _nodeMap[id] = n;
    }));

    hRows.forEach((_, ri) => {
      const vl = vCols.length;
      for (let ci = 0; ci < vl; ci++) {
        const n = _nodeMap[`${ri}_${ci}`];
        if (ci < vl - 1) {
          const nr = _nodeMap[`${ri}_${ci + 1}`];
          n.neighbors.push(nr); nr.neighbors.push(n);
        }
        if (ri < hRows.length - 1) {
          const nr = _nodeMap[`${ri + 1}_${ci}`];
          n.neighbors.push(nr); nr.neighbors.push(n);
        }
      }
    });
  }

  // ── Pathfinding ──────────────────────────────────────────
  function _h(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
    if (_algo === 'dijkstra') return 0;
    if (_algo === 'greedy')   return d * 2;
    return d;
  }

  function _findPath(sx, sy, ex, ey) {
    if (!_nodes.length) return [{ x: ex, y: ey }];

    function nearest(x, y) {
      let best = null, bd = Infinity;
      _nodes.forEach(n => {
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < bd) { bd = d; best = n; }
      });
      return best;
    }

    const start = nearest(sx, sy), end = nearest(ex, ey);
    if (!start || !end || start === end) return [{ x: ex, y: ey }];

    const open     = new Set([start]);
    const cameFrom = new Map();
    const gScore   = new Map();
    const fScore   = new Map();
    _nodes.forEach(n => { gScore.set(n, Infinity); fScore.set(n, Infinity); });
    gScore.set(start, 0);
    fScore.set(start, _h(start, end));

    let iters = 0;
    while (open.size > 0) {
      if (++iters > 1500) break;
      let cur = null, lf = Infinity;
      open.forEach(n => { if (fScore.get(n) < lf) { lf = fScore.get(n); cur = n; } });

      if (cur === end) {
        const path = []; let c = cur;
        while (c) { path.unshift({ x: c.x, y: c.y }); c = cameFrom.get(c); }
        path.push({ x: ex, y: ey });
        _totalPaths++;
        const el = document.getElementById('algo-stats');
        if (el) el.textContent = `Paths: ${_totalPaths} | Nodes explored: ${iters}`;
        return path;
      }

      open.delete(cur);
      cur.neighbors.forEach(nb => {
        const dx = cur.x - nb.x, dy = cur.y - nb.y;
        const tg = gScore.get(cur) + Math.sqrt(dx * dx + dy * dy);
        if (tg < gScore.get(nb)) {
          cameFrom.set(nb, cur);
          gScore.set(nb, tg);
          fScore.set(nb, tg + _h(nb, end));
          open.add(nb);
        }
      });
    }
    return [{ x: ex, y: ey }];
  }

  // ── Station selector (KD-Tree + direction bonus) ─────────
  function _findBestStation(car) {
    const avail = _stations.filter(s => s.slots.some(sl => !sl.occupied));
    if (!avail.length) return null;
    return avail.map(s => {
      const dx = s.x - car.x, dy = s.y - car.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let dirBonus = 1;
      if (car.destX !== undefined) {
        const toDest  = Math.atan2(car.destY - car.y, car.destX - car.x);
        const toSt    = Math.atan2(dy, dx);
        const ang     = Math.abs(toDest - toSt);
        dirBonus = 1 - (Math.min(ang, Math.PI * 2 - ang) / Math.PI) * 0.3;
      }
      return { station: s, score: dist / dirBonus };
    }).sort((a, b) => a.score - b.score)[0]?.station || null;
  }

  // ── Factories ─────────────────────────────────────────────
  function _mkStation(x, y) {
    const id = ++_stationIdCounter;
    const s  = {
      id, x, y,
      name:  `ST-${String(id).padStart(3, '0')}`,
      kw:    [50, 100, 150, 350][Math.floor(Math.random() * 4)],
      slots: Array.from({ length: 3 }, () => ({ occupied: false, car: null })),
      pulse: 0,
    };
    _stations.push(s);
    return s;
  }

  function _mkCar(x, y) {
    const id  = ++_carIdCounter;
    const car = {
      id,
      name:            `CAR-${String(id).padStart(3, '0')}`,
      x, y,
      color:           COLORS[(id - 1) % COLORS.length],
      battery:         40 + Math.random() * 55,
      status:          'idle',
      speed:           60 + Math.random() * 60,
      path:            [],
      pathIdx:         0,
      targetStation:   null,
      chargingSlot:    null,
      trail:           [],
      pulseAnim:       0,
      destX:           x + (Math.random() - 0.5) * _W * 0.8,
      destY:           y + (Math.random() - 0.5) * _H * 0.8,
      drainMultiplier: 0.8 + Math.random() * 0.4,
      _routeStarted:   false,
      _lastCritBat:    null,
    };
    _cars.push(car);
    return car;
  }

  // ── Routing helpers ───────────────────────────────────────
  function _routeToNearest(car) {
    const st = _findBestStation(car);
    if (!st) { _log(`❌ ${car.name}: no stations available`, 'critical'); return; }
    car.targetStation = st;
    car.status        = 'routing';
    car.path          = _findPath(car.x, car.y, st.x, st.y);
    car.pathIdx       = 0;
    _log(`📍 ${car.name} → ${st.name} [${_algo.toUpperCase()}]`, 'info');
  }

  function _arrive(car) {
    const st   = car.targetStation; if (!st) return;
    const slot = st.slots.find(s => !s.occupied);
    if (!slot) {
      _log(`⚠️ ${car.name}: ${st.name} full, rerouting…`, 'warn');
      car.targetStation = null; car._routeStarted = false; _routeToNearest(car); return;
    }
    slot.occupied = true; slot.car = car;
    car.chargingSlot = slot; car.status = 'charging';
    car.x = st.x + (Math.random() - 0.5) * 20;
    car.y = st.y + (Math.random() - 0.5) * 20;
    car.trail = []; car.path = [];
    _log(`✅ ${car.name} charging at ${st.name} [${st.kw}kW]`, 'success');
  }

  function _doneCharging(car) {
    if (car.chargingSlot) {
      car.chargingSlot.occupied = false;
      car.chargingSlot.car      = null;
      car.chargingSlot          = null;
    }
    car.status          = 'idle';
    car.targetStation   = null;
    car._routeStarted   = false;
    car._lastCritBat    = null;
    car.destX = Math.random() * _W * 0.9 + _W * 0.05;
    car.destY = Math.random() * _H * 0.9 + _H * 0.05;
    car.path    = _findPath(car.x, car.y, car.destX, car.destY);
    car.pathIdx = 0;
    _log(`🟢 ${car.name} charged (${Math.round(car.battery)}%), resuming`, 'success');
  }

  // ── Update ────────────────────────────────────────────────
  function _update(dt) {
    if (!_running) return;
    const sdt = dt * _speed;

    _cars.forEach(car => {
      if ((car.status === 'routing' || car.status === 'idle') && car.path.length > car.pathIdx) {
        const t    = car.path[car.pathIdx];
        const dx   = t.x - car.x, dy = t.y - car.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = car.speed * sdt;
        if (dist < step) { car.x = t.x; car.y = t.y; car.pathIdx++; }
        else             { car.x += dx / dist * step; car.y += dy / dist * step; }
        car.trail.push({ x: car.x, y: car.y });
        if (car.trail.length > 40) car.trail.shift();
        car.battery -= DRAIN_RATE * step * car.drainMultiplier;
        car.battery  = Math.max(0, car.battery);
        if (car.targetStation && car.pathIdx >= car.path.length) _arrive(car);
      }

      if (car.status === 'charging') {
        car.battery = Math.min(100, car.battery + CHARGE_RATE * sdt * ((car.targetStation?.kw || 100) / 100));
        if (car.battery >= 90) _doneCharging(car);
      }

      if (car.battery < CRIT && car.status === 'idle') {
        if (car.battery !== car._lastCritBat) {
          _log(`🔴 ${car.name} CRITICAL — ${Math.round(car.battery)}%`, 'critical');
          car._lastCritBat = Math.round(car.battery);
        }
        _routeToNearest(car);
      } else if (car.battery < LOW && car.status === 'idle' && !car._routeStarted) {
        car._routeStarted = true;
        _log(`⚠️ ${car.name} low battery (${Math.round(car.battery)}%), routing…`, 'warn');
        _routeToNearest(car);
      }
    });
  }

  // ── Draw ──────────────────────────────────────────────────
  function _drawBg() {
    _bgCtx.fillStyle = '#04111A';
    _bgCtx.fillRect(0, 0, _W, _H);

    _bgCtx.strokeStyle = 'rgba(26,58,74,0.3)'; _bgCtx.lineWidth = 1;
    for (let x = 0; x < _W; x += 44) { _bgCtx.beginPath(); _bgCtx.moveTo(x, 0); _bgCtx.lineTo(x, _H); _bgCtx.stroke(); }
    for (let y = 0; y < _H; y += 44) { _bgCtx.beginPath(); _bgCtx.moveTo(0, y); _bgCtx.lineTo(_W, y); _bgCtx.stroke(); }

    _roads.forEach(r => {
      _bgCtx.strokeStyle = r.express ? '#0C2236' : '#0A1E2C';
      _bgCtx.lineWidth   = r.express ? 13 : 9;
      _bgCtx.lineCap     = 'round';
      _bgCtx.beginPath(); _bgCtx.moveTo(r.x1, r.y1); _bgCtx.lineTo(r.x2, r.y2); _bgCtx.stroke();
      _bgCtx.strokeStyle = 'rgba(26,58,74,0.4)'; _bgCtx.lineWidth = 1; _bgCtx.setLineDash([10, 16]);
      _bgCtx.beginPath(); _bgCtx.moveTo(r.x1, r.y1); _bgCtx.lineTo(r.x2, r.y2); _bgCtx.stroke();
      _bgCtx.setLineDash([]);
    });

    [0.15, 0.3, 0.5, 0.7, 0.85].forEach(r =>
      [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95].forEach(c => {
        _bgCtx.fillStyle = '#0D2030';
        _bgCtx.beginPath(); _bgCtx.arc(c * _W, r * _H, 5, 0, Math.PI * 2); _bgCtx.fill();
      })
    );
  }

  function _draw(dt) {
    _ctx.clearRect(0, 0, _W, _H);
    _frame++;

    // Route lines
    _cars.forEach(car => {
      if (car.path.length > car.pathIdx) {
        _ctx.strokeStyle = car.color + '2A'; _ctx.lineWidth = 2; _ctx.setLineDash([6, 7]);
        _ctx.beginPath(); _ctx.moveTo(car.x, car.y);
        for (let i = car.pathIdx; i < car.path.length; i++) _ctx.lineTo(car.path[i].x, car.path[i].y);
        _ctx.stroke(); _ctx.setLineDash([]);
      }
    });

    // Trails
    _cars.forEach(car => {
      if (car.trail.length > 1) {
        _ctx.beginPath(); _ctx.moveTo(car.trail[0].x, car.trail[0].y);
        car.trail.forEach(p => _ctx.lineTo(p.x, p.y));
        _ctx.strokeStyle = car.color + '22'; _ctx.lineWidth = 2; _ctx.stroke();
      }
    });

    // Destination crosses
    _cars.forEach(car => {
      const dx = car.destX, dy = car.destY;
      _ctx.strokeStyle = car.color + '35'; _ctx.lineWidth = 1.5;
      _ctx.beginPath();
      _ctx.moveTo(dx - 7, dy); _ctx.lineTo(dx + 7, dy);
      _ctx.moveTo(dx, dy - 7); _ctx.lineTo(dx, dy + 7);
      _ctx.stroke();
      _ctx.beginPath(); _ctx.arc(dx, dy, 11, 0, Math.PI * 2);
      _ctx.strokeStyle = car.color + '18'; _ctx.stroke();
    });

    // Stations
    _stations.forEach(s => {
      s.pulse = (s.pulse + dt * 2) % (Math.PI * 2);
      const occ  = s.slots.filter(sl => sl.occupied).length;
      const full = occ === s.slots.length;

      const aura = _ctx.createRadialGradient(s.x, s.y, 10, s.x, s.y, 32);
      aura.addColorStop(0, full ? 'rgba(255,92,92,0.08)' : 'rgba(42,224,122,0.07)');
      aura.addColorStop(1, 'transparent');
      _ctx.beginPath(); _ctx.arc(s.x, s.y, 32, 0, Math.PI * 2); _ctx.fillStyle = aura; _ctx.fill();

      const pr = 20 + Math.sin(s.pulse) * 3.5;
      _ctx.beginPath(); _ctx.arc(s.x, s.y, pr, 0, Math.PI * 2);
      _ctx.strokeStyle = full ? 'rgba(255,92,92,0.2)' : 'rgba(42,224,122,0.15)';
      _ctx.lineWidth = 1.5; _ctx.stroke();

      _ctx.beginPath(); _ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
      _ctx.fillStyle   = full ? '#1A0808' : '#091A10'; _ctx.fill();
      _ctx.strokeStyle = full ? '#FF5C5C' : '#2AE07A'; _ctx.lineWidth = 2; _ctx.stroke();

      _ctx.fillStyle = full ? '#FF8888' : '#2AE07A';
      _ctx.font = 'bold 13px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
      _ctx.fillText('⚡', s.x, s.y);

      _ctx.fillStyle = '#3D6878'; _ctx.font = '9px DM Mono,monospace'; _ctx.textAlign = 'center';
      _ctx.fillText(s.name, s.x, s.y + 22);

      s.slots.forEach((sl, i) => {
        const sx = s.x - (s.slots.length - 1) * 5 + i * 10, sy = s.y + 30;
        _ctx.beginPath(); _ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        _ctx.fillStyle = sl.occupied ? '#FF5C5C' : '#2AE07A'; _ctx.fill();
      });

      _ctx.fillStyle = '#3EC9FF88'; _ctx.font = '8px DM Mono,monospace'; _ctx.textAlign = 'center';
      _ctx.fillText(`${s.kw}kW`, s.x, s.y - 20);
    });

    // Cars
    _cars.forEach(car => {
      car.pulseAnim = (car.pulseAnim + dt * 3) % (Math.PI * 2);
      const isSel = _selectedCarId === car.id;
      const bp    = car.battery / 100;
      const bc    = bp > 0.5 ? '#2AE07A' : bp > 0.2 ? '#F5A623' : '#FF5C5C';

      if (isSel) {
        _ctx.beginPath(); _ctx.arc(car.x, car.y, 17 + Math.sin(car.pulseAnim) * 2.5, 0, Math.PI * 2);
        _ctx.strokeStyle = car.color + '50'; _ctx.lineWidth = 2; _ctx.stroke();
      }
      if (car.battery < CRIT) {
        const a = 0.25 + Math.sin(car.pulseAnim * 3) * 0.25;
        _ctx.beginPath(); _ctx.arc(car.x, car.y, 14 + Math.sin(car.pulseAnim * 3) * 6, 0, Math.PI * 2);
        _ctx.strokeStyle = `rgba(255,92,92,${a})`; _ctx.lineWidth = 2; _ctx.stroke();
      }

      _ctx.beginPath();
      if (_ctx.roundRect) _ctx.roundRect(car.x - 10, car.y - 10, 20, 20, 4);
      else                _ctx.rect(car.x - 10, car.y - 10, 20, 20);
      _ctx.fillStyle   = car.color + '18'; _ctx.fill();
      _ctx.strokeStyle = car.color; _ctx.lineWidth = isSel ? 2.5 : 1.8; _ctx.stroke();

      // _ctx.font = '11px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      // _ctx.textAlign = 'center'; _ctx.textBaseline = 'middle';
      // _ctx.fillText('🚗', car.x, car.y);
      if (_carImg.complete && _carImg.naturalWidth > 0) {
        _ctx.drawImage(_carImg, car.x - 10, car.y - 10, 20, 20);
      } 
      else {
        _ctx.beginPath();
        _ctx.arc(car.x, car.y, 8, 0, Math.PI * 2);
        _ctx.fillStyle = car.color;
        _ctx.fill();
      }

      _ctx.fillStyle = 'rgba(0,0,0,0.5)'; _ctx.fillRect(car.x - 12, car.y - 20, 24, 4);
      _ctx.fillStyle = bc;                _ctx.fillRect(car.x - 12, car.y - 20, 24 * bp, 4);
      _ctx.strokeStyle = '#1A3A4A'; _ctx.lineWidth = 0.5; _ctx.strokeRect(car.x - 12, car.y - 20, 24, 4);

      if (isSel) {
        _ctx.fillStyle = car.color; _ctx.font = 'bold 9px DM Mono,monospace'; _ctx.textAlign = 'center';
        _ctx.fillText(car.name, car.x, car.y + 22);
        _ctx.fillText(`${Math.round(car.battery)}%`, car.x, car.y + 31);
      }

      const dc = { idle: '#3D6878', routing: '#3EC9FF', charging: '#F5A623', critical: '#FF5C5C', arrived: '#2AE07A' };
      _ctx.beginPath(); _ctx.arc(car.x + 9, car.y - 9, 4, 0, Math.PI * 2);
      _ctx.fillStyle = dc[car.battery < CRIT ? 'critical' : car.status] || '#3D6878'; _ctx.fill();

      if (car.status === 'charging') {
        const prog = (_frame * 0.05) % 1;
        _ctx.beginPath(); _ctx.arc(car.x, car.y, 13 + prog * 8, 0, Math.PI * 2);
        _ctx.strokeStyle = `rgba(245,166,35,${(1 - prog) * 0.55})`; _ctx.lineWidth = 2; _ctx.stroke();
      }
    });
  }

  // ── Resize ────────────────────────────────────────────────
  function _resize() {
    _W = _container.clientWidth;
    _H = _container.clientHeight;
    _canvas.width   = _bgCanvas.width  = _W;
    _canvas.height  = _bgCanvas.height = _H;
    _initRoads(); _buildGraph(); _drawBg();
  }

  // ── Game loop ─────────────────────────────────────────────
  function _loop(ts) {
    if (!_active) return;
    const dt = Math.min((ts - _lastTs) / 1000, 0.1);
    _lastTs  = ts;
    _update(dt);
    _draw(dt);
    _updateUI();
    _animFrameId = requestAnimationFrame(_loop);
  }

  // ── UI ────────────────────────────────────────────────────
  function _log(msg, type = 'info') {
    const panel = document.getElementById('log-panel');
    if (!panel) return;
    const now = new Date();
    const t   = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    const el  = document.createElement('div');
    el.className = `log-entry ${type}`;
    el.innerHTML = `<span class="log-time">${t}</span>${msg}`;
    panel.insertBefore(el, panel.firstChild);
    if (panel.children.length > 60) panel.removeChild(panel.lastChild);
  }

  function _updateUI() {
    const routing  = _cars.filter(c => c.status === 'routing').length;
    const charging = _cars.filter(c => c.status === 'charging').length;
    const critical = _cars.filter(c => c.battery < CRIT).length;

    _set('hdr-cars',      _cars.length);
    _set('hdr-routing',   routing);
    _set('hdr-charging',  charging);
    _set('hdr-stations',  _stations.length);
    _set('hdr-critical',  critical);

    _renderCarList();
    _renderStationList();
    _renderCarControls();
  }

  function _set(id, val) {
    const el = document.getElementById(id); if (el) el.textContent = val;
  }

  function _renderCarList() {
    const list = document.getElementById('car-list'); if (!list) return;
    list.innerHTML = '';
    const labels = { idle:'IDLE', routing:'ROUTING', charging:'CHARGING', critical:'CRITICAL', arrived:'ARRIVED' };
    _cars.forEach(car => {
      const pct  = car.battery;
      const bc   = pct > 50 ? '#2AE07A' : pct > 20 ? '#F5A623' : '#FF5C5C';
      const st   = pct < CRIT ? 'critical' : car.status;
      const isSel = _selectedCarId === car.id;
      const card = document.createElement('div');
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
  }

  function _renderStationList() {
    const list = document.getElementById('station-list'); if (!list) return;
    list.innerHTML = '';
    _stations.forEach(s => {
      const occ  = s.slots.filter(sl => sl.occupied).length;
      const full = occ === s.slots.length;
      const card = document.createElement('div');
      card.className = `station-card ${full ? 'full' : ''}`;
      card.innerHTML = `
        <div class="station-card-header">
          <div class="station-name">${s.name}</div>
          <div class="slot-dots">${s.slots.map(sl => `<div class="slot-dot ${sl.occupied ? 'occupied' : 'free'}"></div>`).join('')}</div>
        </div>
        <div class="station-meta">
          <span class="station-kw">${s.kw}kW DC Fast</span>
          <span class="station-avail ${full ? 'full' : 'ok'}">${full ? 'FULL' : `${s.slots.length - occ} free`}</span>
        </div>`;
      list.appendChild(card);
    });
  }

  function _renderCarControls() {
    const area = document.getElementById('car-controls-area'); if (!area) return;
    if (!_selectedCarId) { area.innerHTML = '<p class="placeholder-text">Click a car on the map to control it</p>'; return; }
    const car = _cars.find(c => c.id === _selectedCarId); if (!car) return;
    area.innerHTML = `
      <div class="car-ctrl-card">
        <div class="car-ctrl-name" style="color:${car.color}">${car.name}</div>
        <label class="ctrl-label">Battery %</label>
        <div class="ctrl-row">
          <input type="range" min="0" max="100" value="${Math.round(car.battery)}"
            oninput="DummySim._setBattery(${car.id},this.value);this.nextElementSibling.textContent=Math.round(this.value)+'%'">
          <span class="slider-val">${Math.round(car.battery)}%</span>
        </div>
        <label class="ctrl-label">Speed (px/s)</label>
        <div class="ctrl-row">
          <input type="range" min="20" max="300" value="${Math.round(car.speed)}"
            oninput="DummySim._setSpeed(${car.id},this.value);this.nextElementSibling.textContent=this.value">
          <span class="slider-val">${Math.round(car.speed)}</span>
        </div>
        <label class="ctrl-label">Drain Rate</label>
        <div class="ctrl-row">
          <input type="range" min="0.2" max="3" step="0.1" value="${car.drainMultiplier.toFixed(1)}"
            oninput="DummySim._setDrain(${car.id},this.value);this.nextElementSibling.textContent=parseFloat(this.value).toFixed(1)+'×'">
          <span class="slider-val">${car.drainMultiplier.toFixed(1)}×</span>
        </div>
        <div class="ctrl-actions">
          <button class="btn primary" onclick="DummySim._forceRoute(${car.id})">⚡ Route Now</button>
          <button class="btn danger"  onclick="DummySim._removeCar(${car.id})">✕ Remove</button>
        </div>
      </div>`;
  }

  // ── Mouse interactions ────────────────────────────────────
  function _getPos(e) {
    const r = _canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function _carAt(x, y) { return _cars.find(c => Math.sqrt((c.x - x) ** 2 + (c.y - y) ** 2) < 14); }
  function _stAt(x, y)  { return _stations.find(s => Math.sqrt((s.x - x) ** 2 + (s.y - y) ** 2) < 18); }

  function _onMouseDown(e) {
    if (e.button !== 0) return;
    const { x, y } = _getPos(e);
    const car = _carAt(x, y);
    if (car) {
      _dragCar   = car;
      _dragOffset = { x: car.x - x, y: car.y - y };
      _selectedCarId = car.id;
      _isDragging = true;
      return;
    }
    if (_selectedCarId) {
      const c = _cars.find(c => c.id === _selectedCarId);
      if (c && c.status !== 'charging') {
        c.destX = x; c.destY = y;
        c.path  = _findPath(c.x, c.y, x, y);
        c.pathIdx = 0; c.status = 'idle';
        c.targetStation = null; c._routeStarted = false;
        _log(`📍 ${c.name} destination updated`, 'info');
      }
    }
  }

  function _onMouseMove(e) {
    const { x, y } = _getPos(e);
    if (_isDragging && _dragCar) {
      _dragCar.x = x + _dragOffset.x;
      _dragCar.y = y + _dragOffset.y;
      _dragCar.trail = [];
      return;
    }
    const tt  = document.getElementById('tooltip'); if (!tt) return;
    const car = _carAt(x, y);
    const st  = car ? null : _stAt(x, y);
    if (car) {
      tt.innerHTML = `<div class="tooltip-title" style="color:${car.color}">${car.name}</div>
        Battery: <b>${Math.round(car.battery)}%</b><br>Status: ${car.status}<br>
        Speed: ${Math.round(car.speed)} px/s<br>${car.targetStation ? '→ ' + car.targetStation.name : 'No target'}`;
      tt.style.left = (e.offsetX + 15) + 'px'; tt.style.top = (e.offsetY - 10) + 'px';
      tt.className = 'map-tooltip visible';
    } else if (st) {
      const occ = st.slots.filter(s => s.occupied).length;
      tt.innerHTML = `<div class="tooltip-title">${st.name}</div>
        Power: <b>${st.kw}kW</b><br>Slots: ${occ}/${st.slots.length} occupied<br>
        <span style="color:${occ === st.slots.length ? '#FF5C5C' : '#2AE07A'}">${occ === st.slots.length ? '● FULL' : '● Available'}</span>`;
      tt.style.left = (e.offsetX + 15) + 'px'; tt.style.top = (e.offsetY - 10) + 'px';
      tt.className = 'map-tooltip visible';
    } else {
      tt.className = 'map-tooltip';
    }
  }

  function _onMouseUp() {
    if (_isDragging && _dragCar) {
      _log(`🚗 ${_dragCar.name} repositioned`, 'info');
      if (_dragCar.status !== 'charging') {
        _dragCar.path = []; _dragCar.pathIdx = 0;
        _dragCar.targetStation = null; _dragCar._routeStarted = false;
      }
    }
    _dragCar = null; _isDragging = false;
  }

  function _onContextMenu(e) {
    e.preventDefault();
    const { x, y } = _getPos(e);
    const menu = document.getElementById('ctx-menu'); if (!menu) return;
    const car  = _carAt(x, y);
    const st   = car ? null : _stAt(x, y);
    let html   = '';

    if (car) {
      html = `
        <div class="ctx-item" onclick="DummySim._forceRoute(${car.id});DummySim._hideMenu()">⚡ Route to station</div>
        <div class="ctx-item" onclick="DummySim._setBattery(${car.id},10);DummySim._hideMenu()">🔋 Battery → 10%</div>
        <div class="ctx-item" onclick="DummySim._setBattery(${car.id},50);DummySim._hideMenu()">🔋 Battery → 50%</div>
        <div class="ctx-item" onclick="DummySim._setBattery(${car.id},100);DummySim._hideMenu()">🔋 Full charge</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" onclick="DummySim._removeCar(${car.id});DummySim._hideMenu()">✕ Remove car</div>`;
    } else if (st) {
      html = `
        <div class="ctx-item" onclick="DummySim._clearSt(${st.id});DummySim._hideMenu()">🔓 Clear slots</div>
        <div class="ctx-item" onclick="DummySim._blockSt(${st.id});DummySim._hideMenu()">🔒 Block (maintenance)</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item danger" onclick="DummySim._removeSt(${st.id});DummySim._hideMenu()">✕ Remove station</div>`;
    } else {
      const rx = Math.round(x), ry = Math.round(y);
      html = `
        <div class="ctx-item" onclick="DummySim._addCarAt(${rx},${ry});DummySim._hideMenu()">🚗 Add car here</div>
        <div class="ctx-item" onclick="DummySim._addStAt(${rx},${ry});DummySim._hideMenu()">⚡ Add station here</div>`;
    }

    menu.innerHTML = html;
    menu.style.left = e.offsetX + 'px';
    menu.style.top  = e.offsetY + 'px';
    menu.classList.remove('hidden');
    menu.classList.add('visible');
  }

  function _bindEvents() {
    _canvas.addEventListener('mousedown',   _onMouseDown);
    _canvas.addEventListener('mousemove',   _onMouseMove);
    _canvas.addEventListener('mouseup',     _onMouseUp);
    _canvas.addEventListener('contextmenu', _onContextMenu);
    document.addEventListener('click',      _hideMenuGlobal);
  }

  function _unbindEvents() {
    _canvas.removeEventListener('mousedown',   _onMouseDown);
    _canvas.removeEventListener('mousemove',   _onMouseMove);
    _canvas.removeEventListener('mouseup',     _onMouseUp);
    _canvas.removeEventListener('contextmenu', _onContextMenu);
    document.removeEventListener('click',      _hideMenuGlobal);
  }

  function _hideMenuGlobal() { _hideMenu(); }

  // ── Public helpers called from inline onclick in controls ─
  // (must be on the DummySim object — see _renderCarControls)
  function _setBattery(id, v) {
    const c = _cars.find(x => x.id === id);
    if (c) { c.battery = +v; _log(`🔋 ${c.name} battery → ${Math.round(v)}%`, 'info'); }
  }
  function _setSpeed(id, v)  { const c = _cars.find(x => x.id === id); if (c) c.speed = +v; }
  function _setDrain(id, v)  { const c = _cars.find(x => x.id === id); if (c) c.drainMultiplier = +v; }

  function _forceRoute(id) {
    const car = _cars.find(c => c.id === id); if (!car) return;
    if (car.status === 'charging') _doneCharging(car);
    car._routeStarted = false; car.status = 'idle'; _routeToNearest(car);
  }

  function _removeCar(id) {
    const car = _cars.find(c => c.id === id); if (!car) return;
    if (car.chargingSlot) { car.chargingSlot.occupied = false; car.chargingSlot.car = null; }
    _log(`🗑️ ${car.name} removed`, 'info');
    _cars = _cars.filter(c => c.id !== id);
    if (_selectedCarId === id) _selectedCarId = null;
  }

  function _clearSt(id) {
    const s = _stations.find(st => st.id === id); if (!s) return;
    s.slots.forEach(sl => {
      if (sl.car) { sl.car.status = 'idle'; sl.car.chargingSlot = null; sl.car.targetStation = null; }
      sl.occupied = false; sl.car = null;
    });
    _log(`🔓 ${s.name} cleared`, 'info');
  }

  function _blockSt(id) {
    const s = _stations.find(st => st.id === id); if (!s) return;
    s.slots.forEach(sl => sl.occupied = true);
    _log(`🔒 ${s.name} blocked`, 'warn');
  }

  function _removeSt(id) {
    const s = _stations.find(st => st.id === id); if (!s) return;
    s.slots.forEach(sl => {
      if (sl.car) { sl.car.status = 'idle'; sl.car.chargingSlot = null; sl.car.targetStation = null; sl.car._routeStarted = false; }
    });
    _stations = _stations.filter(st => st.id !== id);
    _cars.filter(c => c.targetStation?.id === id).forEach(c => { c.targetStation = null; c.status = 'idle'; c._routeStarted = false; });
    _log(`🗑️ ${s.name} removed`, 'warn');
  }

  function _addCarAt(x, y) {
    const car = _mkCar(x, y);
    car.destX = Math.random() * _W * 0.8 + _W * 0.1;
    car.destY = Math.random() * _H * 0.8 + _H * 0.1;
    car.path  = _findPath(car.x, car.y, car.destX, car.destY);
    _log(`🚗 ${car.name} spawned`, 'info');
  }

  function _addStAt(x, y) {
    const s = _mkStation(x, y);
    _log(`⚡ ${s.name} installed`, 'success');
  }

  function _hideMenu() {
    const m = document.getElementById('ctx-menu'); if (!m) return;
    m.classList.remove('visible'); m.classList.add('hidden');
  }

  // ── Init / reset ──────────────────────────────────────────
  function _initData() {
    _cars = []; _stations = []; _carIdCounter = 0; _stationIdCounter = 0;
    _totalPaths = 0; _frame = 0; _selectedCarId = null;

    [[0.25,0.3],[0.55,0.15],[0.7,0.5],[0.4,0.7],[0.85,0.3],[0.15,0.7],[0.55,0.85],[0.9,0.7]]
      .forEach(([x, y]) => _mkStation(x * _W, y * _H));

    [[0.1,0.2],[0.5,0.4],[0.8,0.6],[0.3,0.8]]
      .forEach(([x, y]) => {
        const car     = _mkCar(x * _W, y * _H);
        car.battery   = 25 + Math.random() * 65;
        car.destX     = Math.random() * _W * 0.8 + _W * 0.1;
        car.destY     = Math.random() * _H * 0.8 + _H * 0.1;
        car.path      = _findPath(car.x, car.y, car.destX, car.destY);
      });

    _log('🚀 Dummy Sim ready — no API required', 'success');
    _log(`📡 KD-Tree: ${_stations.length} stations`, 'info');
    _log(`🗺️ Graph: ${_nodes.length} nodes · ${_algo} ready`, 'info');
  }

  // ── Public interface ──────────────────────────────────────

  /**
   * Called by setMapMode('dummy') in main.js.
   * Grabs the shared canvas refs, resizes, seeds data, starts loop.
   */
  function activate() {
    if (_active) return;
    _active = true;

    _canvas    = document.getElementById('main-canvas');
    _bgCanvas  = document.getElementById('bg-canvas');
    _ctx       = _canvas.getContext('2d');
    _bgCtx     = _bgCanvas.getContext('2d');
    _container = document.getElementById('map-container');

    _resize();
    _resizeHandler = () => { _resize(); };
    window.addEventListener('resize', _resizeHandler);
    if (_W === 0 || _H === 0) {
  _active = false;
  window.removeEventListener('resize', _resizeHandler);
  requestAnimationFrame(() => activate());
  return;
}

_initData();
_bindEvents();

    // Sync sim-btn state
    const btn = document.getElementById('sim-btn');
    if (btn) { btn.textContent = '▶ Run Sim'; btn.className = 'btn primary'; }

    // Sync algo HUD
    _syncAlgoHUD();

    _lastTs = performance.now();
    _animFrameId = requestAnimationFrame(_loop);

    // Drag hint
    setTimeout(() => {
      const hint = document.createElement('div');
      hint.className   = 'drag-hint';
      hint.textContent = 'Drag cars · Right-click for options · Click map to set destination';
      _container.appendChild(hint);
      setTimeout(() => hint.remove(), 3500);
    }, 600);
  }

  /**
   * Called by setMapMode('canvas' | 'gmaps') in main.js.
   * Stops the dummy loop, unbinds events, clears canvas.
   */
  function deactivate() {
    if (!_active) return;
    _active = false;

    _running = false;
    if (_animFrameId) { cancelAnimationFrame(_animFrameId); _animFrameId = null; }
    if (_resizeHandler) { window.removeEventListener('resize', _resizeHandler); _resizeHandler = null; }
    if (_canvas) _unbindEvents();

    // Clear canvases so main sim can take over
    if (_ctx)   _ctx.clearRect(0, 0, _W, _H);
    if (_bgCtx) _bgCtx.clearRect(0, 0, _W, _H);

    _hideMenu();
  }

  function _syncAlgoHUD() {
    const names   = { astar: 'A* Pathfinding', dijkstra: 'Dijkstra', greedy: 'Greedy Best-First' };
    const details = { astar: 'Heuristic: Euclidean distance', dijkstra: 'Heuristic: None (optimal)', greedy: 'Heuristic: 2× Euclidean (fast)' };
    _set('algo-name',   names[_algo]   || _algo);
    _set('algo-detail', details[_algo] || '');
  }

  // ── Public methods for header button handlers ─────────────
  // main.js calls the same global functions (toggleSim, addCar, etc.)
  // When dummy mode is active those functions should delegate here.
  // The pattern: in main.js wrap each handler with an active-mode guard.

  function toggleSim() {
    _running = !_running;
    const btn = document.getElementById('sim-btn');
    if (btn) { btn.textContent = _running ? '⏸ Pause' : '▶ Run Sim'; btn.className = _running ? 'btn danger' : 'btn primary'; }
    _log(_running ? '▶ Dummy Sim started' : '⏸ Dummy Sim paused', 'info');
  }

  function addCar() {
    const car = _mkCar(_W * 0.1 + Math.random() * _W * 0.8, _H * 0.1 + Math.random() * _H * 0.8);
    car.destX = Math.random() * _W * 0.8 + _W * 0.1;
    car.destY = Math.random() * _H * 0.8 + _H * 0.1;
    car.path  = _findPath(car.x, car.y, car.destX, car.destY);
    _log(`🚗 ${car.name} added`, 'info');
  }

  function addStation() {
    const s = _mkStation(_W * 0.1 + Math.random() * _W * 0.8, _H * 0.1 + Math.random() * _H * 0.8);
    _log(`⚡ ${s.name} (${s.kw}kW) installed`, 'success');
  }

  function resetSim() {
    _running = false;
    _initData();
    _resize();
    const btn = document.getElementById('sim-btn');
    if (btn) { btn.textContent = '▶ Run Sim'; btn.className = 'btn primary'; }
    const stats = document.getElementById('algo-stats');
    if (stats) stats.textContent = '';
    const logp  = document.getElementById('log-panel');
    if (logp)  logp.innerHTML = '';
    _log('↺ Dummy Sim reset', 'info');
  }

  function setSpeed(v) {
    _speed = v;
    // Sync active speed button highlight (reuse main header buttons)
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    const speedMap = { 0.5: 0, 1: 1, 2: 2, 5: 3 };
    const idx = speedMap[v];
    if (idx !== undefined) {
      const btns = document.querySelectorAll('.speed-btn');
      if (btns[idx]) btns[idx].classList.add('active');
    }
  }

  function setAlgo(algo) {
    _algo = algo;
    _syncAlgoHUD();
    _log(`🧠 Switched to ${algo.toUpperCase()}`, 'info');
    // Re-route routing cars with new algo
    _cars.filter(c => c.status === 'routing' && c.targetStation).forEach(car => {
      car.path = _findPath(car.x, car.y, car.targetStation.x, car.targetStation.y);
      car.pathIdx = 0;
    });
  }

  return {
    // Lifecycle
    activate,
    deactivate,
    isActive: () => _active,

    // Header button delegates (called from main.js guards)
    toggleSim,
    addCar,
    addStation,
    resetSim,
    setSpeed,
    setAlgo,

    // Exposed for inline onclick= in _renderCarControls / _onContextMenu
    _setBattery,
    _setSpeed,
    _setDrain,
    _forceRoute,
    _removeCar,
    _clearSt,
    _blockSt,
    _removeSt,
    _addCarAt,
    _addStAt,
    _hideMenu,
  };

})();
