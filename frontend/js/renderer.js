/**
 * js/renderer.js
 * ─────────────────────────────────────────────
 * Canvas Rendering
 *
 * Two canvases:
 *   bg-canvas    — static background (roads, grid). Redrawn
 *                  only on mount and resize.
 *   main-canvas  — animated foreground. Cleared and redrawn
 *                  every frame by the main loop.
 *
 * This module does NOT mutate any simulation state.
 * It only reads from Sim.getCars() / Sim.getStations().
 * ─────────────────────────────────────────────
 */

const Renderer = (() => {

  let bgCanvas, bgCtx, mainCanvas, mainCtx;
  let W = 0, H = 0;
  let frameCount = 0;

  // ── Colours (mirror of CSS tokens, used in canvas) ──────
  const C = {
    green:  '#2AE07A',
    cyan:   '#3EC9FF',
    amber:  '#F5A623',
    red:    '#FF5C5C',
    muted:  '#3D6878',
    text:   '#7EAAB8',
    bg:     '#04111A',
    bgMid:  '#062030',
    border: '#1A3A4A',
  };

  function init(bgEl, mainEl) {
    bgCanvas   = bgEl;    bgCtx   = bgCanvas.getContext('2d');
    mainCanvas = mainEl;  mainCtx = mainCanvas.getContext('2d');
  }

  function resize(w, h, roads) {
    W = w; H = h;
    bgCanvas.width  = mainCanvas.width  = W;
    bgCanvas.height = mainCanvas.height = H;
    drawBackground(roads);
  }

  // ── Background (static) ──────────────────────────────────
  function drawBackground(roads) {
    bgCtx.clearRect(0, 0, W, H);

    // Base fill
    const grad = bgCtx.createRadialGradient(W/2, 0, 0, W/2, H, H);
    grad.addColorStop(0, C.bgMid);
    grad.addColorStop(1, C.bg);
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, W, H);

    // Subtle grid
    bgCtx.strokeStyle = 'rgba(26,58,74,0.35)';
    bgCtx.lineWidth   = 1;
    for (let x = 0; x < W; x += 44) { bgCtx.beginPath(); bgCtx.moveTo(x,0); bgCtx.lineTo(x,H); bgCtx.stroke(); }
    for (let y = 0; y < H; y += 44) { bgCtx.beginPath(); bgCtx.moveTo(0,y); bgCtx.lineTo(W,y); bgCtx.stroke(); }

    // Roads
    if (roads) {
      roads.forEach(road => {
        bgCtx.strokeStyle = road.express ? '#0C2236' : '#0A1E2C';
        bgCtx.lineWidth   = road.express ? 14 : 10;
        bgCtx.lineCap     = 'round';
        bgCtx.beginPath();
        bgCtx.moveTo(road.x1, road.y1);
        bgCtx.lineTo(road.x2, road.y2);
        bgCtx.stroke();

        // Dashed centre line
        bgCtx.strokeStyle = 'rgba(26,58,74,0.45)';
        bgCtx.lineWidth   = 1;
        bgCtx.setLineDash([10, 16]);
        bgCtx.beginPath();
        bgCtx.moveTo(road.x1, road.y1);
        bgCtx.lineTo(road.x2, road.y2);
        bgCtx.stroke();
        bgCtx.setLineDash([]);
      });
    }

    // Intersection dots
    const hRows = [0.15, 0.30, 0.50, 0.70, 0.85];
    const vCols = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 0.95];
    bgCtx.fillStyle = '#0D2030';
    hRows.forEach(r => vCols.forEach(c => {
      bgCtx.beginPath();
      bgCtx.arc(c * W, r * H, 5, 0, Math.PI * 2);
      bgCtx.fill();
    }));
  }

  // ── Foreground (animated) ────────────────────────────────
  function drawFrame(selectedCarId) {
    mainCtx.clearRect(0, 0, W, H);
    frameCount++;

    const cars     = Sim.getCars();
    const stations = Sim.getStations();
    const CRIT     = Sim.CRITICAL_THRESHOLD;

    // Draw order: paths → trails → destinations → stations → cars

    // 1. Route preview lines
    cars.forEach(car => {
      if (car.path.length > car.pathIdx) {
        mainCtx.strokeStyle = car.color + '28';
        mainCtx.lineWidth   = 2;
        mainCtx.setLineDash([6, 7]);
        mainCtx.beginPath();
        mainCtx.moveTo(car.x, car.y);
        for (let i = car.pathIdx; i < car.path.length; i++) {
          mainCtx.lineTo(car.path[i].x, car.path[i].y);
        }
        mainCtx.stroke();
        mainCtx.setLineDash([]);
      }
    });

    // 2. Movement trails
    cars.forEach(car => {
      if (car.trail.length > 1) {
        mainCtx.beginPath();
        mainCtx.moveTo(car.trail[0].x, car.trail[0].y);
        car.trail.forEach(p => mainCtx.lineTo(p.x, p.y));
        mainCtx.strokeStyle = car.color + '1E';
        mainCtx.lineWidth   = 2;
        mainCtx.stroke();
      }
    });

    // 3. Destination markers
    cars.forEach(car => {
      const dx = car.destX, dy = car.destY;
      mainCtx.strokeStyle = car.color + '30';
      mainCtx.lineWidth   = 1.5;
      mainCtx.beginPath();
      mainCtx.moveTo(dx-7, dy); mainCtx.lineTo(dx+7, dy);
      mainCtx.moveTo(dx, dy-7); mainCtx.lineTo(dx, dy+7);
      mainCtx.stroke();
      mainCtx.beginPath();
      mainCtx.arc(dx, dy, 11, 0, Math.PI * 2);
      mainCtx.strokeStyle = car.color + '18';
      mainCtx.stroke();
    });

    // 4. Stations
    stations.forEach(station => {
      station._pulse = ((station._pulse || 0) + 0.03) % (Math.PI * 2);
      drawStation(station);
    });

    // 5. Cars
    cars.forEach(car => {
      car._pulse = ((car._pulse || 0) + 0.05) % (Math.PI * 2);
      drawCar(car, car.id === selectedCarId, CRIT);
    });
  }

  function drawStation(s) {
    const occ  = s.slots.filter(sl => sl.occupied).length;
    const full = occ === s.slots.length;

    // Glow aura
    const aura = mainCtx.createRadialGradient(s.x, s.y, 12, s.x, s.y, 34);
    aura.addColorStop(0, full ? 'rgba(255,92,92,0.10)' : 'rgba(42,224,122,0.09)');
    aura.addColorStop(1, 'transparent');
    mainCtx.beginPath();
    mainCtx.arc(s.x, s.y, 34, 0, Math.PI * 2);
    mainCtx.fillStyle = aura;
    mainCtx.fill();

    // Breathing ring
    const pr = 20 + Math.sin(s._pulse) * 3;
    mainCtx.beginPath();
    mainCtx.arc(s.x, s.y, pr, 0, Math.PI * 2);
    mainCtx.strokeStyle = full ? 'rgba(255,92,92,0.22)' : 'rgba(42,224,122,0.18)';
    mainCtx.lineWidth   = 1.5;
    mainCtx.stroke();

    // Body circle
    mainCtx.beginPath();
    mainCtx.arc(s.x, s.y, 14, 0, Math.PI * 2);
    mainCtx.fillStyle   = full ? '#1A0A0A' : '#091A10';
    mainCtx.fill();
    mainCtx.strokeStyle = full ? C.red : C.green;
    mainCtx.lineWidth   = 2;
    mainCtx.stroke();

    // Icon
    mainCtx.font          = 'bold 13px Arial';
    mainCtx.textAlign     = 'center';
    mainCtx.textBaseline  = 'middle';
    mainCtx.fillStyle     = full ? '#FF8888' : C.green;
    mainCtx.fillText('⚡', s.x, s.y);

    // Name label
    mainCtx.fillStyle = C.muted;
    mainCtx.font      = '9px DM Mono, monospace';
    mainCtx.fillText(s.name, s.x, s.y + 22);

    // Slot dots
    s.slots.forEach((sl, i) => {
      const sx = s.x - (s.slots.length - 1) * 5 + i * 10;
      const sy = s.y + 30;
      mainCtx.beginPath();
      mainCtx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      mainCtx.fillStyle = sl.occupied ? C.red : C.green;
      mainCtx.fill();
    });

    // kW label
    mainCtx.fillStyle = C.cyan + 'AA';
    mainCtx.font      = '8px DM Mono, monospace';
    mainCtx.fillText(`${s.kw}kW`, s.x, s.y - 20);
  }

  function drawCar(car, selected, critThreshold) {
    const pct   = car.battery / 100;
    const batC  = pct > 0.5 ? C.green : pct > 0.2 ? C.amber : C.red;
    const isCrit = car.battery < critThreshold;

    // Selection ring
    if (selected) {
      mainCtx.beginPath();
      mainCtx.arc(car.x, car.y, 17 + Math.sin(car._pulse) * 2.5, 0, Math.PI * 2);
      mainCtx.strokeStyle = car.color + '55';
      mainCtx.lineWidth   = 2;
      mainCtx.stroke();
    }

    // Critical pulse ring
    if (isCrit) {
      const a = 0.25 + Math.sin(car._pulse * 3) * 0.25;
      mainCtx.beginPath();
      mainCtx.arc(car.x, car.y, 15 + Math.sin(car._pulse * 3) * 6, 0, Math.PI * 2);
      mainCtx.strokeStyle = `rgba(255,92,92,${a})`;
      mainCtx.lineWidth   = 2;
      mainCtx.stroke();
    }

    // Car body
    mainCtx.beginPath();
    mainCtx.roundRect(car.x - 10, car.y - 10, 20, 20, 5);
    mainCtx.fillStyle   = car.color + '18';
    mainCtx.fill();
    mainCtx.strokeStyle = car.color;
    mainCtx.lineWidth   = selected ? 2.5 : 1.8;
    mainCtx.stroke();

    // Car icons 
    mainCtx.font         = '11px Arial';
    mainCtx.textAlign    = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillStyle    = car.color;
    mainCtx.fillText('🚗', car.x, car.y);

    // Battery bar
    mainCtx.fillStyle = 'rgba(0,0,0,0.45)';
    mainCtx.fillRect(car.x - 12, car.y - 20, 24, 4);
    mainCtx.fillStyle = batC;
    mainCtx.fillRect(car.x - 12, car.y - 20, 24 * pct, 4);
    if (pct > 0.5) {
      mainCtx.shadowColor = C.green; mainCtx.shadowBlur = 4;
      mainCtx.fillRect(car.x - 12, car.y - 20, 24 * pct, 4);
      mainCtx.shadowBlur = 0;
    }
    mainCtx.strokeStyle = C.border;
    mainCtx.lineWidth   = 0.5;
    mainCtx.strokeRect(car.x - 12, car.y - 20, 24, 4);

    // Name + % (selected only)
    if (selected) {
      mainCtx.fillStyle = car.color;
      mainCtx.font      = 'bold 9px DM Mono, monospace';
      mainCtx.textAlign = 'center';
      mainCtx.fillText(car.name, car.x, car.y + 22);
      mainCtx.fillText(`${Math.round(car.battery)}%`, car.x, car.y + 31);
    }

    // Status dot
    const dotColors = {
      idle:     C.muted,
      routing:  C.cyan,
      charging: C.amber,
      critical: C.red,
      arrived:  C.green,
    };
    mainCtx.beginPath();
    mainCtx.arc(car.x + 9, car.y - 9, 4, 0, Math.PI * 2);
    mainCtx.fillStyle = dotColors[isCrit ? 'critical' : car.status] || C.muted;
    mainCtx.fill();

    // Charging expand ring
    if (car.status === 'charging') {
      const prog = (frameCount * 0.04) % 1;
      mainCtx.beginPath();
      mainCtx.arc(car.x, car.y, 13 + prog * 9, 0, Math.PI * 2);
      mainCtx.strokeStyle = `rgba(245,166,35,${(1 - prog) * 0.55})`;
      mainCtx.lineWidth   = 2;
      mainCtx.stroke();
    }
  }

  return { init, resize, drawBackground, drawFrame };

})();
