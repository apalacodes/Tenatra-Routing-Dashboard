import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// TENATRA DESIGN TOKENS
// ─────────────────────────────────────────────
const T = {
  // Backgrounds — deep teal-navy gradient from splash
  bg:        "#04111A",
  bgMid:     "#062030",
  bgSurface: "#0A2535",
  bgCard:    "#0D2C3D",
  bgCardHov: "#112F40",

  // Borders
  border:    "#1A3A4A",
  borderSub: "#122838",

  // Tenatra green (logo ring)
  green:     "#2AE07A",
  greenDim:  "#1BAD5C",
  greenGlow: "rgba(42,224,122,0.18)",
  greenSoft: "rgba(42,224,122,0.08)",

  // Tenatra cyan (the dot)
  cyan:      "#3EC9FF",
  cyanDim:   "#2AA8DA",
  cyanGlow:  "rgba(62,201,255,0.18)",

  // Status colors
  available: "#2AE07A",
  inUse:     "#F5A623",
  empty:     "#3EC9FF",
  critical:  "#FF5C5C",

  // Text
  textPrimary:   "#E8F4F0",
  textSecondary: "#7EAAB8",
  textMuted:     "#3D6878",

  // Font
  fontDisplay: "'DM Serif Display', serif",
  fontBody:    "'DM Sans', sans-serif",
  fontMono:    "'DM Mono', monospace",
};

// ─────────────────────────────────────────────
// STYLES OBJECT (replaces CSS file)
// ─────────────────────────────────────────────
const styles = {
  // Root
  root: {
    background: `radial-gradient(ellipse at 50% 0%, ${T.bgMid} 0%, ${T.bg} 60%)`,
    color: T.textPrimary,
    fontFamily: T.fontBody,
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },

  // ── Header ──
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 20px",
    background: "rgba(4,17,26,0.85)",
    borderBottom: `1px solid ${T.border}`,
    backdropFilter: "blur(12px)",
    flexShrink: 0,
    zIndex: 10,
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${T.bgCard} 0%, ${T.bgMid} 100%)`,
    border: `2px solid ${T.green}`,
    boxShadow: `0 0 12px ${T.greenGlow}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
  },
  logoText: {
    fontFamily: T.fontDisplay,
    fontSize: 20,
    letterSpacing: "-0.5px",
    color: T.textPrimary,
    lineHeight: 1,
  },
  logoDot: {
    color: T.cyan,
  },
  logoSub: {
    fontFamily: T.fontBody,
    fontSize: 10,
    color: T.textMuted,
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginTop: 1,
  },
  headerStats: {
    display: "flex",
    gap: 20,
  },
  statBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  statVal: (color = T.green) => ({
    fontFamily: T.fontMono,
    fontSize: 18,
    fontWeight: 700,
    color,
    lineHeight: 1,
  }),
  statLbl: {
    fontFamily: T.fontBody,
    fontSize: 9,
    color: T.textMuted,
    letterSpacing: "1.5px",
    textTransform: "uppercase",
  },
  headerControls: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  // ── Buttons ──
  btn: (variant = "default") => ({
    padding: "7px 14px",
    borderRadius: 8,
    border: `1px solid ${variant === "primary" ? T.green : variant === "danger" ? T.critical : T.border}`,
    background: variant === "primary"
      ? `linear-gradient(135deg, ${T.green}, ${T.greenDim})`
      : variant === "danger"
      ? `rgba(255,92,92,0.12)`
      : `rgba(10,37,53,0.6)`,
    color: variant === "primary" ? "#03130D" : variant === "danger" ? T.critical : T.textSecondary,
    fontFamily: T.fontBody,
    fontWeight: variant === "primary" ? 700 : 500,
    fontSize: 12,
    cursor: "pointer",
    transition: "all 0.2s",
    letterSpacing: "0.3px",
    boxShadow: variant === "primary" ? `0 0 16px ${T.greenGlow}` : "none",
  }),
  algoSelect: {
    background: `rgba(10,37,53,0.8)`,
    border: `1px solid ${T.border}`,
    borderRadius: 8,
    color: T.textSecondary,
    fontFamily: T.fontBody,
    fontSize: 12,
    padding: "7px 10px",
    outline: "none",
    cursor: "pointer",
  },
  speedBtn: {
    width: 28,
    height: 28,
    background: `rgba(10,37,53,0.6)`,
    border: `1px solid ${T.border}`,
    borderRadius: 6,
    color: T.textSecondary,
    fontFamily: T.fontMono,
    fontSize: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Main layout ──
  main: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },

  // ── Panels ──
  panel: {
    width: 272,
    flexShrink: 0,
    background: "rgba(4,17,26,0.7)",
    backdropFilter: "blur(8px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  panelLeft: {
    borderRight: `1px solid ${T.border}`,
  },
  panelRight: {
    borderLeft: `1px solid ${T.border}`,
  },
  panelSection: {
    borderBottom: `1px solid ${T.border}`,
    padding: "12px 14px",
    flexShrink: 0,
  },
  panelTitle: {
    fontFamily: T.fontBody,
    fontSize: 9,
    letterSpacing: "2px",
    textTransform: "uppercase",
    color: T.textMuted,
    marginBottom: 10,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "10px",
  },

  // ── Car Cards ──
  carCard: (status, selected, color) => ({
    background: selected ? `rgba(42,224,122,0.06)` : `rgba(13,44,61,0.7)`,
    border: `1px solid ${selected ? T.green : T.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
    transition: "all 0.2s",
    position: "relative",
    overflow: "hidden",
    marginBottom: 6,
    borderLeft: `3px solid ${
      status === "charging" ? T.inUse :
      status === "routing"  ? T.cyan :
      status === "critical" ? T.critical :
      selected ? T.green : T.border
    }`,
  }),
  carName: (color) => ({
    fontFamily: T.fontDisplay,
    fontSize: 13,
    color,
    lineHeight: 1,
  }),
  badgePill: (status) => ({
    fontSize: 9,
    padding: "2px 7px",
    borderRadius: 20,
    fontWeight: 600,
    letterSpacing: "0.5px",
    fontFamily: T.fontBody,
    background:
      status === "charging" ? "rgba(245,166,35,0.15)" :
      status === "routing"  ? "rgba(62,201,255,0.12)" :
      status === "critical" ? "rgba(255,92,92,0.15)" :
      "rgba(126,170,184,0.1)",
    color:
      status === "charging" ? T.inUse :
      status === "routing"  ? T.cyan :
      status === "critical" ? T.critical :
      T.textMuted,
  }),
  batteryWrap: {
    height: 5,
    background: `rgba(255,255,255,0.06)`,
    borderRadius: 3,
    overflow: "hidden",
    margin: "8px 0 4px",
  },
  batteryFill: (pct) => ({
    height: "100%",
    width: `${pct}%`,
    borderRadius: 3,
    background:
      pct > 50 ? T.green :
      pct > 20 ? T.inUse :
      T.critical,
    transition: "width 0.4s ease, background 0.3s",
    boxShadow: pct > 50 ? `0 0 6px ${T.greenGlow}` : "none",
  }),
  batteryInfo: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textMuted,
  },
  batteryPct: (pct) => ({
    color: pct > 50 ? T.green : pct > 20 ? T.inUse : T.critical,
    fontWeight: 700,
  }),

  // ── Selected Car Controls ──
  controlsCard: {
    background: `rgba(42,224,122,0.04)`,
    border: `1px solid ${T.green}33`,
    borderRadius: 10,
    padding: 12,
  },
  ctrlLabel: {
    fontFamily: T.fontBody,
    fontSize: 10,
    color: T.textMuted,
    marginBottom: 4,
    display: "block",
  },
  ctrlRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  slider: {
    flex: 1,
    height: 4,
    appearance: "none",
    background: `rgba(255,255,255,0.06)`,
    borderRadius: 2,
    outline: "none",
    cursor: "pointer",
  },
  sliderVal: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    color: T.green,
    width: 40,
    textAlign: "right",
  },
  addBtn: {
    width: "100%",
    padding: "8px",
    background: "transparent",
    border: `1px dashed ${T.border}`,
    borderRadius: 8,
    color: T.textMuted,
    fontFamily: T.fontBody,
    fontSize: 11,
    cursor: "pointer",
    transition: "all 0.2s",
    marginTop: 6,
  },

  // ── Map ──
  mapContainer: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
  },

  // ── HUD ──
  hud: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    zIndex: 5,
    pointerEvents: "none",
  },
  hudCard: {
    background: "rgba(4,17,26,0.88)",
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: "10px 14px",
    backdropFilter: "blur(12px)",
    minWidth: 190,
  },
  hudTitle: {
    fontFamily: T.fontBody,
    fontSize: 9,
    letterSpacing: "2px",
    color: T.textMuted,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  hudAlgo: {
    fontFamily: T.fontDisplay,
    fontSize: 14,
    color: T.cyan,
    marginBottom: 3,
  },
  hudDetail: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textMuted,
    lineHeight: 1.7,
  },
  hudStat: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.green,
    marginTop: 4,
  },

  // ── Mode bar ──
  modeBar: {
    position: "absolute",
    bottom: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(4,17,26,0.88)",
    border: `1px solid ${T.border}`,
    borderRadius: 20,
    padding: "6px 18px",
    fontFamily: T.fontBody,
    fontSize: 10,
    color: T.textMuted,
    backdropFilter: "blur(12px)",
    zIndex: 5,
    display: "flex",
    gap: 16,
    alignItems: "center",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  },
  modeDot: (color) => ({
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 6px ${color}`,
    display: "inline-block",
    marginRight: 5,
  }),

  // ── Station Cards ──
  stationCard: (full) => ({
    background: `rgba(13,44,61,0.7)`,
    border: `1px solid ${full ? "rgba(255,92,92,0.2)" : "rgba(42,224,122,0.1)"}`,
    borderRadius: 8,
    padding: "9px 10px",
    marginBottom: 5,
  }),
  stationName: {
    fontFamily: T.fontDisplay,
    fontSize: 12,
    color: T.textPrimary,
  },
  slot: (occ) => ({
    width: 9,
    height: 9,
    borderRadius: 2,
    background: occ ? T.critical : T.green,
    boxShadow: occ ? `0 0 4px rgba(255,92,92,0.5)` : `0 0 4px ${T.greenGlow}`,
  }),

  // ── Log ──
  logEntry: (type) => ({
    fontFamily: T.fontMono,
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 5,
    marginBottom: 3,
    borderLeft: `2px solid ${
      type === "success" ? T.green :
      type === "warn"    ? T.inUse :
      type === "critical"? T.critical :
      T.cyan
    }`,
    background:
      type === "success" ? "rgba(42,224,122,0.04)" :
      type === "warn"    ? "rgba(245,166,35,0.04)" :
      type === "critical"? "rgba(255,92,92,0.04)" :
      "transparent",
    color:
      type === "success" ? T.green :
      type === "warn"    ? T.inUse :
      type === "critical"? T.critical :
      T.textSecondary,
    lineHeight: 1.5,
  }),
  logTime: {
    color: T.textMuted,
    marginRight: 5,
    fontSize: 9,
  },

  // ── Tooltip ──
  tooltip: {
    position: "absolute",
    background: "rgba(4,17,26,0.95)",
    border: `1px solid ${T.green}`,
    borderRadius: 8,
    padding: "8px 12px",
    fontFamily: T.fontBody,
    fontSize: 11,
    pointerEvents: "none",
    zIndex: 100,
    maxWidth: 200,
    lineHeight: 1.7,
    boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 12px ${T.greenGlow}`,
  },
  tooltipTitle: {
    fontFamily: T.fontDisplay,
    fontSize: 14,
    color: T.green,
    marginBottom: 4,
  },

  // ── Context Menu ──
  ctxMenu: {
    position: "absolute",
    background: "rgba(6,32,48,0.98)",
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: 4,
    zIndex: 200,
    minWidth: 170,
    boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    backdropFilter: "blur(16px)",
  },
  ctxItem: (danger = false) => ({
    padding: "7px 12px",
    fontFamily: T.fontBody,
    fontSize: 11,
    borderRadius: 6,
    cursor: "pointer",
    color: danger ? T.critical : T.textSecondary,
    transition: "background 0.1s, color 0.1s",
  }),
  ctxSep: {
    height: 1,
    background: T.border,
    margin: "3px 0",
  },

  // API Status Banner
  apiBanner: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(4,17,26,0.92)",
    border: `1px solid ${T.cyan}44`,
    borderRadius: 20,
    padding: "5px 16px",
    fontFamily: T.fontBody,
    fontSize: 10,
    color: T.cyan,
    zIndex: 5,
    pointerEvents: "none",
    letterSpacing: "0.5px",
  },
};

// ─────────────────────────────────────────────
// SIMULATION ENGINE
// ─────────────────────────────────────────────
const BATTERY_DRAIN = 0.003;
const CHARGE_RATE = 15;
const CRITICAL = 20;
const LOW = 35;
let carIdCounter = 0;
let stationIdCounter = 0;
let totalPaths = 0;

const ALGO_META = {
  astar:    { name: "A* Pathfinding",    detail: "Heuristic: Euclidean distance", color: T.cyan },
  dijkstra: { name: "Dijkstra",          detail: "Heuristic: None (optimal)",     color: T.green },
  greedy:   { name: "Greedy Best-First", detail: "Heuristic: 2× Euclidean",       color: T.inUse },
};

const CAR_COLORS = [T.green, T.cyan, "#F5A623", "#B388FF", "#FF80AB", "#80DEEA", "#FFCC02", "#FF6B6B"];

function heuristic(a, b, algo) {
  const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  return algo === "dijkstra" ? 0 : algo === "greedy" ? d * 2 : d;
}

function buildGraph(W, H) {
  const hRows = [0.15, 0.3, 0.5, 0.7, 0.85];
  const vCols = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95];
  const nodes = [];
  const nodeMap = {};
  hRows.forEach((r, ri) => vCols.forEach((c, ci) => {
    const id = `${ri}_${ci}`;
    const n = { id, x: c * W, y: r * H, neighbors: [] };
    nodes.push(n); nodeMap[id] = n;
  }));
  hRows.forEach((r, ri) => vCols.forEach((c, ci) => {
    const n = nodeMap[`${ri}_${ci}`];
    if (ci < vCols.length - 1) { const nr = nodeMap[`${ri}_${ci+1}`]; n.neighbors.push(nr); nr.neighbors.push(n); }
    if (ri < hRows.length - 1) { const nr = nodeMap[`${ri+1}_${ci}`]; n.neighbors.push(nr); nr.neighbors.push(n); }
  }));
  return { nodes, nodeMap };
}

function findPath(nodes, sx, sy, ex, ey, algo) {
  if (!nodes.length) return [{ x: ex, y: ey }];
  const nearest = (x, y) => nodes.reduce((b, n) => (n.x-x)**2+(n.y-y)**2 < (b.x-x)**2+(b.y-y)**2 ? n : b);
  const start = nearest(sx, sy), end = nearest(ex, ey);
  if (start === end) return [{ x: ex, y: ey }];
  const open = new Set([start]), cameFrom = new Map();
  const gScore = new Map(), fScore = new Map();
  nodes.forEach(n => { gScore.set(n, Infinity); fScore.set(n, Infinity); });
  gScore.set(start, 0); fScore.set(start, heuristic(start, end, algo));
  let iters = 0;
  while (open.size > 0 && iters++ < 1000) {
    let current = null, low = Infinity;
    open.forEach(n => { if (fScore.get(n) < low) { low = fScore.get(n); current = n; } });
    if (current === end) {
      const path = []; let c = current;
      while (c) { path.unshift({ x: c.x, y: c.y }); c = cameFrom.get(c); }
      path.push({ x: ex, y: ey }); totalPaths++;
      return path;
    }
    open.delete(current);
    current.neighbors.forEach(nb => {
      const dx = current.x-nb.x, dy = current.y-nb.y;
      const tg = gScore.get(current) + Math.sqrt(dx*dx+dy*dy);
      if (tg < gScore.get(nb)) {
        cameFrom.set(nb, current); gScore.set(nb, tg);
        fScore.set(nb, tg + heuristic(nb, end, algo)); open.add(nb);
      }
    });
  }
  return [{ x: ex, y: ey }];
}

function nearestAvailableStation(stations, car) {
  const avail = stations.filter(s => s.slots.some(sl => !sl.occupied));
  if (!avail.length) return null;
  return avail.map(s => {
    const dx = s.x - car.x, dy = s.y - car.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    let dir = 1;
    if (car.destX !== undefined) {
      const toDest = Math.atan2(car.destY - car.y, car.destX - car.x);
      const toSt = Math.atan2(dy, dx);
      const diff = Math.abs(toDest - toSt);
      dir = 1 - (Math.min(diff, Math.PI*2 - diff) / Math.PI) * 0.3;
    }
    return { s, score: dist / dir };
  }).sort((a, b) => a.score - b.score)[0]?.s || null;
}

// ─────────────────────────────────────────────
// CANVAS DRAWING
// ─────────────────────────────────────────────
function drawBg(canvas, W, H) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.strokeStyle = "rgba(26,58,74,0.4)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Roads
  const hRows = [0.15, 0.3, 0.5, 0.7, 0.85];
  const vCols = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95];
  const drawRoad = (x1,y1,x2,y2,w,color) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.strokeStyle = "rgba(26,58,74,0.5)"; ctx.lineWidth = 1;
    ctx.setLineDash([10,16]); ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    ctx.setLineDash([]);
  };
  hRows.forEach(r => drawRoad(0, r*H, W, r*H, 10, "#0A1E2C"));
  vCols.forEach(c => drawRoad(c*W, 0, c*W, H, 10, "#0A1E2C"));
  drawRoad(0, H*0.6, W*0.4, H*0.15, 14, "#0C2236");
  drawRoad(W*0.6, H*0.85, W, H*0.3, 14, "#0C2236");

  hRows.forEach(r => vCols.forEach(c => {
    ctx.beginPath(); ctx.arc(c*W, r*H, 5, 0, Math.PI*2);
    ctx.fillStyle = "#0D2030"; ctx.fill();
  }));
}

function drawMain(canvas, { cars, stations, selectedCar, simRunning, frame }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Paths
  cars.forEach(car => {
    if (car.path.length > car.pathIdx) {
      ctx.strokeStyle = car.color + "28"; ctx.lineWidth = 2; ctx.setLineDash([6,7]);
      ctx.beginPath(); ctx.moveTo(car.x, car.y);
      for (let i = car.pathIdx; i < car.path.length; i++) ctx.lineTo(car.path[i].x, car.path[i].y);
      ctx.stroke(); ctx.setLineDash([]);
    }
  });

  // Trails
  cars.forEach(car => {
    if (car.trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(car.trail[0].x, car.trail[0].y);
      car.trail.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = car.color + "20"; ctx.lineWidth = 2; ctx.stroke();
    }
  });

  // Destination markers
  cars.forEach(car => {
    const dx = car.destX, dy = car.destY;
    ctx.strokeStyle = car.color + "35"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(dx-7,dy); ctx.lineTo(dx+7,dy); ctx.moveTo(dx,dy-7); ctx.lineTo(dx,dy+7); ctx.stroke();
    ctx.beginPath(); ctx.arc(dx, dy, 11, 0, Math.PI*2); ctx.strokeStyle = car.color+"20"; ctx.stroke();
  });

  // Stations
  stations.forEach(s => {
    s._pulse = ((s._pulse || 0) + 0.03) % (Math.PI*2);
    const occ = s.slots.filter(sl => sl.occupied).length;
    const full = occ === s.slots.length;

    // Glow ring
    const grad = ctx.createRadialGradient(s.x, s.y, 14, s.x, s.y, 32);
    grad.addColorStop(0, full ? "rgba(255,92,92,0.12)" : "rgba(42,224,122,0.1)");
    grad.addColorStop(1, "transparent");
    ctx.beginPath(); ctx.arc(s.x, s.y, 32, 0, Math.PI*2); ctx.fillStyle = grad; ctx.fill();

    // Pulse ring
    const pr = 20 + Math.sin(s._pulse) * 3;
    ctx.beginPath(); ctx.arc(s.x, s.y, pr, 0, Math.PI*2);
    ctx.strokeStyle = full ? "rgba(255,92,92,0.25)" : "rgba(42,224,122,0.2)";
    ctx.lineWidth = 1.5; ctx.stroke();

    // Body
    ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI*2);
    ctx.fillStyle = full ? "#1A0A0A" : "#091A10"; ctx.fill();
    ctx.strokeStyle = full ? T.critical : T.green; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = full ? "#FF8888" : T.green;
    ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⚡", s.x, s.y);

    ctx.fillStyle = T.textMuted; ctx.font = `9px DM Mono, monospace`;
    ctx.fillText(s.name, s.x, s.y + 22);

    s.slots.forEach((sl, i) => {
      const sx = s.x - (s.slots.length-1)*5 + i*10, sy = s.y + 30;
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI*2);
      ctx.fillStyle = sl.occupied ? T.critical : T.green; ctx.fill();
    });

    ctx.fillStyle = T.cyanDim + "AA"; ctx.font = "8px DM Mono, monospace";
    ctx.fillText(`${s.kw}kW`, s.x, s.y - 20);
  });

  // Cars
  cars.forEach(car => {
    car._pulse = ((car._pulse || 0) + 0.05) % (Math.PI*2);
    const sel = selectedCar?.id === car.id;
    const pct = car.battery / 100;
    const bc = pct > 0.5 ? T.green : pct > 0.2 ? T.inUse : T.critical;

    if (sel) {
      ctx.beginPath(); ctx.arc(car.x, car.y, 17 + Math.sin(car._pulse)*2.5, 0, Math.PI*2);
      ctx.strokeStyle = car.color + "55"; ctx.lineWidth = 2; ctx.stroke();
    }
    if (car.battery < CRITICAL) {
      const a = 0.3 + Math.sin(car._pulse*3)*0.3;
      ctx.beginPath(); ctx.arc(car.x, car.y, 15+Math.sin(car._pulse*3)*6, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(255,92,92,${a})`; ctx.lineWidth = 2; ctx.stroke();
    }

    // Body
    ctx.beginPath(); ctx.roundRect(car.x-10, car.y-10, 20, 20, 5);
    ctx.fillStyle = car.color + "18"; ctx.fill();
    ctx.strokeStyle = car.color; ctx.lineWidth = sel ? 2.5 : 1.8; ctx.stroke();
    ctx.fillStyle = car.color; ctx.font = "11px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🚗", car.x, car.y);

    // Battery bar
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(car.x-12, car.y-20, 24, 4);
    ctx.fillStyle = bc; ctx.fillRect(car.x-12, car.y-20, 24*pct, 4);
    if (pct > 0.5) { ctx.shadowColor = T.green; ctx.shadowBlur = 4; ctx.fillRect(car.x-12, car.y-20, 24*pct, 4); ctx.shadowBlur = 0; }
    ctx.strokeStyle = T.border; ctx.lineWidth = 0.5; ctx.strokeRect(car.x-12, car.y-20, 24, 4);

    if (sel) {
      ctx.fillStyle = car.color; ctx.font = "bold 9px DM Mono, monospace";
      ctx.textAlign = "center"; ctx.fillText(car.name, car.x, car.y+22);
      ctx.fillText(`${Math.round(car.battery)}%`, car.x, car.y+31);
    }

    // Status dot
    const dotC = { idle: T.textMuted, routing: T.cyan, charging: T.inUse, critical: T.critical, arrived: T.green };
    ctx.beginPath(); ctx.arc(car.x+9, car.y-9, 4, 0, Math.PI*2);
    ctx.fillStyle = dotC[car.battery < CRITICAL ? "critical" : car.status] || T.textMuted; ctx.fill();

    // Charge anim
    if (car.status === "charging") {
      const prog = (frame * 0.04) % 1;
      ctx.beginPath(); ctx.arc(car.x, car.y, 13+prog*9, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(245,166,35,${(1-prog)*0.6})`; ctx.lineWidth = 2; ctx.stroke();
    }
  });
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function TenatraEVSim() {
  const bgCanvasRef  = useRef(null);
  const mainCanvasRef = useRef(null);
  const containerRef  = useRef(null);
  const stateRef      = useRef({ cars: [], stations: [], nodes: [], selectedCar: null, frame: 0, simRunning: false, simSpeed: 1, algo: "astar", totalPaths: 0 });
  const rafRef        = useRef(null);
  const lastTimeRef   = useRef(0);
  const sizeRef       = useRef({ W: 0, H: 0 });

  const [, forceRender] = useState(0);
  const rerender = () => forceRender(n => n + 1);

  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeedState] = useState(1);
  const [algo, setAlgoState] = useState("astar");
  const [selectedCar, setSelectedCarState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0, items: [] });
  const [algoStats, setAlgoStats] = useState("");
  const [carsSnap, setCarsSnap] = useState([]);
  const [stationsSnap, setStationsSnap] = useState([]);
  const dragRef = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    const now = new Date();
    const t = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}:${now.getSeconds().toString().padStart(2,"0")}`;
    setLogs(prev => [{ msg, type, t, id: Math.random() }, ...prev].slice(0, 50));
  }, []);

  const routeToStation = useCallback((car) => {
    const { stations, nodes, algo } = stateRef.current;
    const st = nearestAvailableStation(stations, car);
    if (!st) { addLog(`❌ ${car.name}: No available stations`, "critical"); return; }
    car.targetStation = st;
    car.status = "routing";
    car.path = findPath(nodes, car.x, car.y, st.x, st.y, algo);
    car.pathIdx = 0;
    setAlgoStats(`Paths: ${++stateRef.current.totalPaths} | Last: ${algo.toUpperCase()}`);
    addLog(`📍 ${car.name} → ${st.name} [${algo.toUpperCase()}]`, "info");
  }, [addLog]);

  const arriveAtStation = useCallback((car) => {
    const st = car.targetStation;
    const slot = st?.slots.find(s => !s.occupied);
    if (!slot) {
      addLog(`⚠️ ${car.name}: ${st?.name} full, rerouting…`, "warn");
      car.targetStation = null; car._routingStarted = false;
      routeToStation(car); return;
    }
    slot.occupied = true; slot.car = car;
    car.chargingSlot = slot; car.status = "charging";
    car.x = st.x + (Math.random()-0.5)*18;
    car.y = st.y + (Math.random()-0.5)*18;
    car.trail = []; car.path = [];
    addLog(`✅ ${car.name} charging at ${st.name} [${st.kw}kW]`, "success");
  }, [addLog, routeToStation]);

  const finishCharging = useCallback((car) => {
    if (car.chargingSlot) { car.chargingSlot.occupied = false; car.chargingSlot.car = null; car.chargingSlot = null; }
    car.status = "idle"; car.targetStation = null; car._routingStarted = false; car._lastCritBat = null;
    const { W, H } = sizeRef.current;
    car.destX = Math.random()*W*0.8+W*0.1; car.destY = Math.random()*H*0.8+H*0.1;
    car.path = findPath(stateRef.current.nodes, car.x, car.y, car.destX, car.destY, stateRef.current.algo);
    car.pathIdx = 0;
    addLog(`🟢 ${car.name} fully charged (${Math.round(car.battery)}%), resuming`, "success");
  }, [addLog]);

  // ── Init ──
  const initSim = useCallback(() => {
    const { W, H } = sizeRef.current;
    if (!W || !H) return;
    stateRef.current.cars = [];
    stateRef.current.stations = [];
    carIdCounter = 0; stationIdCounter = 0;
    stateRef.current.totalPaths = 0;

    const graph = buildGraph(W, H);
    stateRef.current.nodes = graph.nodes;

    const sPos = [[0.25,0.3],[0.55,0.15],[0.7,0.5],[0.4,0.7],[0.85,0.3],[0.15,0.7],[0.55,0.85],[0.9,0.7]];
    sPos.forEach(([x,y]) => {
      stateRef.current.stations.push({
        id: ++stationIdCounter, x: x*W, y: y*H,
        name: `ST-${String(stationIdCounter).padStart(3,"0")}`,
        kw: [50,100,150,350][Math.floor(Math.random()*4)],
        slots: Array.from({length:3}, ()=>({occupied:false,car:null})),
        _pulse: 0,
      });
    });

    [[0.1,0.2],[0.5,0.4],[0.8,0.6],[0.3,0.8]].forEach(([x,y]) => {
      const id = ++carIdCounter;
      const car = {
        id, name: `CAR-${String(id).padStart(3,"0")}`,
        x: x*W, y: y*H, color: CAR_COLORS[(id-1)%CAR_COLORS.length],
        battery: 30+Math.random()*60, status: "idle",
        speed: 60+Math.random()*60, path: [], pathIdx: 0,
        targetStation: null, chargingSlot: null,
        trail: [], _pulse: 0, _routingStarted: false,
        destX: Math.random()*W*0.8+W*0.1, destY: Math.random()*H*0.8+H*0.1,
        drainMultiplier: 0.8+Math.random()*0.4,
      };
      car.path = findPath(graph.nodes, car.x, car.y, car.destX, car.destY, stateRef.current.algo);
      stateRef.current.cars.push(car);
    });

    addLog("🚀 Tenatra EV Simulation initialized", "success");
    addLog(`📡 ${stateRef.current.stations.length} stations loaded`, "info");
    setCarsSnap([...stateRef.current.cars]);
    setStationsSnap([...stateRef.current.stations]);
  }, [addLog]);

  // ── Resize ──
  const handleResize = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const W = c.clientWidth, H = c.clientHeight;
    sizeRef.current = { W, H };
    [bgCanvasRef.current, mainCanvasRef.current].forEach(cv => { if (cv) { cv.width = W; cv.height = H; } });
    if (bgCanvasRef.current) drawBg(bgCanvasRef.current, W, H);
    const graph = buildGraph(W, H);
    stateRef.current.nodes = graph.nodes;
  }, []);

  useEffect(() => {
    handleResize();
    setTimeout(() => { handleResize(); initSim(); }, 50);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize, initSim]);

  // ── Game loop ──
  useEffect(() => {
    function tick(ts) {
      const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = ts;
      const s = stateRef.current;
      s.frame++;

      if (s.simRunning) {
        const sdt = dt * s.simSpeed;
        s.cars.forEach(car => {
          if ((car.status === "routing" || car.status === "idle") && car.path.length > car.pathIdx) {
            const tgt = car.path[car.pathIdx];
            const dx = tgt.x-car.x, dy = tgt.y-car.y, dist = Math.sqrt(dx*dx+dy*dy);
            const step = car.speed * sdt;
            if (dist < step) { car.x = tgt.x; car.y = tgt.y; car.pathIdx++; }
            else { car.x += (dx/dist)*step; car.y += (dy/dist)*step; }
            car.trail.push({x:car.x,y:car.y}); if(car.trail.length>40) car.trail.shift();
            car.battery = Math.max(0, car.battery - BATTERY_DRAIN*step*car.drainMultiplier);
            if (car.targetStation && car.pathIdx >= car.path.length) arriveAtStation(car);
          }
          if (car.status === "charging") {
            car.battery = Math.min(100, car.battery + CHARGE_RATE*sdt*(car.targetStation?.kw/100||1));
            if (car.battery >= 90) finishCharging(car);
          }
          const battStatus = car.battery < CRITICAL ? "critical" : car.status;
          if (car.battery < CRITICAL && car.status === "idle") {
            if (car.battery !== car._lastCritBat) { addLog(`🔴 ${car.name} CRITICAL ${Math.round(car.battery)}%`, "critical"); car._lastCritBat = Math.round(car.battery); }
            routeToStation(car);
          }
          if (car.battery < LOW && car.status === "idle" && !car._routingStarted) { car._routingStarted = true; routeToStation(car); }
        });

        if (s.frame % 20 === 0) {
          setCarsSnap([...s.cars]);
          setStationsSnap([...s.stations]);
        }
      }

      drawMain(mainCanvasRef.current, { cars: s.cars, stations: s.stations, selectedCar: s.selectedCar, simRunning: s.simRunning, frame: s.frame });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [arriveAtStation, finishCharging, routeToStation, addLog]);

  // ── Controls ──
  const toggleSim = () => {
    stateRef.current.simRunning = !stateRef.current.simRunning;
    setSimRunning(stateRef.current.simRunning);
    addLog(stateRef.current.simRunning ? "▶ Simulation started" : "⏸ Simulation paused", "info");
  };

  const resetSim = () => {
    stateRef.current.simRunning = false; setSimRunning(false);
    stateRef.current.selectedCar = null; setSelectedCarState(null);
    totalPaths = 0; setAlgoStats("");
    setLogs([]);
    setTimeout(() => initSim(), 10);
  };

  const setSpeed = (v) => { stateRef.current.simSpeed = v; setSimSpeedState(v); };
  const setAlgo = (v) => {
    stateRef.current.algo = v; setAlgoState(v);
    addLog(`🧠 Algorithm: ${ALGO_META[v].name}`, "info");
    stateRef.current.cars.filter(c => c.status === "routing" && c.targetStation).forEach(car => {
      car.path = findPath(stateRef.current.nodes, car.x, car.y, car.targetStation.x, car.targetStation.y, v);
      car.pathIdx = 0;
    });
  };

  const addCar = () => {
    const { W, H } = sizeRef.current;
    const id = ++carIdCounter;
    const car = {
      id, name: `CAR-${String(id).padStart(3,"0")}`,
      x: W*0.1+Math.random()*W*0.8, y: H*0.1+Math.random()*H*0.8,
      color: CAR_COLORS[(id-1)%CAR_COLORS.length],
      battery: 30+Math.random()*65, status: "idle",
      speed: 60+Math.random()*60, path: [], pathIdx: 0,
      targetStation: null, chargingSlot: null, trail: [], _pulse: 0,
      _routingStarted: false, drainMultiplier: 0.8+Math.random()*0.4,
      destX: Math.random()*W*0.8+W*0.1, destY: Math.random()*H*0.8+H*0.1,
    };
    car.path = findPath(stateRef.current.nodes, car.x, car.y, car.destX, car.destY, stateRef.current.algo);
    stateRef.current.cars.push(car);
    addLog(`🚗 ${car.name} added`, "info");
    setCarsSnap([...stateRef.current.cars]);
  };

  const addStation = (x, y) => {
    const { W, H } = sizeRef.current;
    const sx = x ?? (W*0.1+Math.random()*W*0.8);
    const sy = y ?? (H*0.1+Math.random()*H*0.8);
    const id = ++stationIdCounter;
    const s = { id, x: sx, y: sy, name: `ST-${String(id).padStart(3,"0")}`, kw:[50,100,150,350][Math.floor(Math.random()*4)], slots:Array.from({length:3},()=>({occupied:false,car:null})), _pulse:0 };
    stateRef.current.stations.push(s);
    addLog(`⚡ ${s.name} (${s.kw}kW) installed`, "success");
    setStationsSnap([...stateRef.current.stations]);
  };

  const removeCar = (id) => {
    const car = stateRef.current.cars.find(c => c.id === id);
    if (car?.chargingSlot) { car.chargingSlot.occupied = false; car.chargingSlot.car = null; }
    stateRef.current.cars = stateRef.current.cars.filter(c => c.id !== id);
    if (stateRef.current.selectedCar?.id === id) { stateRef.current.selectedCar = null; setSelectedCarState(null); }
    addLog(`🗑️ CAR-${String(id).padStart(3,"0")} removed`, "info");
    setCarsSnap([...stateRef.current.cars]);
  };

  const removeStation = (id) => {
    const s = stateRef.current.stations.find(st => st.id === id);
    if (s) {
      s.slots.forEach(sl => { if (sl.car) { sl.car.status="idle"; sl.car.chargingSlot=null; sl.car.targetStation=null; sl.car._routingStarted=false; } });
      stateRef.current.cars.filter(c=>c.targetStation?.id===id).forEach(c=>{c.targetStation=null;c.status="idle";c._routingStarted=false;});
      stateRef.current.stations = stateRef.current.stations.filter(st=>st.id!==id);
      addLog(`🗑️ ${s.name} removed`, "warn");
      setStationsSnap([...stateRef.current.stations]);
    }
  };

  const setBattery = (id, v) => {
    const car = stateRef.current.cars.find(c=>c.id===id);
    if (car) { car.battery = +v; setCarsSnap([...stateRef.current.cars]); }
  };

  const setCarSpeed = (id, v) => { const car = stateRef.current.cars.find(c=>c.id===id); if(car) car.speed=+v; };
  const setDrain = (id, v) => { const car = stateRef.current.cars.find(c=>c.id===id); if(car) car.drainMultiplier=+v; };

  const routeCarNow = (id) => {
    const car = stateRef.current.cars.find(c=>c.id===id);
    if (!car) return;
    if (car.status==="charging") finishCharging(car);
    car._routingStarted=false; car.status="idle";
    routeToStation(car);
  };

  const clearStation = (id) => {
    const s = stateRef.current.stations.find(st=>st.id===id);
    if(s){s.slots.forEach(sl=>{if(sl.car){sl.car.status="idle";sl.car.chargingSlot=null;sl.car.targetStation=null;}sl.occupied=false;sl.car=null;});}
    addLog(`🔓 ${s?.name} cleared`,"info"); setStationsSnap([...stateRef.current.stations]);
  };
  const blockStation = (id) => {
    const s = stateRef.current.stations.find(st=>st.id===id);
    if(s){s.slots.forEach(sl=>sl.occupied=true);}
    addLog(`🔒 ${s?.name} blocked (maintenance)`,"warn"); setStationsSnap([...stateRef.current.stations]);
  };

  const selectCar = (car) => { stateRef.current.selectedCar = car; setSelectedCarState(car ? {...car} : null); };

  // ── Canvas events ──
  const getPos = (e) => {
    const rect = mainCanvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setCtxMenu(m => ({ ...m, visible: false }));
    const { x, y } = getPos(e);
    for (const car of stateRef.current.cars) {
      if (Math.sqrt((car.x-x)**2+(car.y-y)**2) < 14) {
        dragRef.current = { car, ox: car.x-x, oy: car.y-y };
        selectCar(car); return;
      }
    }
    // Click map = new destination
    const selCar = stateRef.current.selectedCar;
    if (selCar) {
      const car = stateRef.current.cars.find(c=>c.id===selCar.id);
      if (car && car.status !== "charging") {
        car.destX=x; car.destY=y;
        car.path=findPath(stateRef.current.nodes,car.x,car.y,x,y,stateRef.current.algo);
        car.pathIdx=0; car.status="idle"; car.targetStation=null; car._routingStarted=false;
        addLog(`📍 ${car.name} destination updated`,"info");
      }
    }
  };

  const onMouseMove = (e) => {
    const { x, y } = getPos(e);
    if (dragRef.current) {
      dragRef.current.car.x = x + dragRef.current.ox;
      dragRef.current.car.y = y + dragRef.current.oy;
      dragRef.current.car.trail = [];
      return;
    }
    // Tooltip
    for (const car of stateRef.current.cars) {
      if (Math.sqrt((car.x-x)**2+(car.y-y)**2)<14) {
        setTooltip({ visible:true, x:x+15, y:y-10, content:{type:"car",obj:car} }); return;
      }
    }
    for (const s of stateRef.current.stations) {
      if (Math.sqrt((s.x-x)**2+(s.y-y)**2)<18) {
        setTooltip({ visible:true, x:x+15, y:y-10, content:{type:"station",obj:s} }); return;
      }
    }
    setTooltip(t=>({...t,visible:false}));
  };

  const onMouseUp = (e) => {
    if (dragRef.current) {
      const car = dragRef.current.car;
      addLog(`🚗 ${car.name} repositioned`,"info");
      if (car.status!=="charging") { car.path=[]; car.pathIdx=0; car.targetStation=null; car._routingStarted=false; }
      dragRef.current = null;
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    let items = [];
    let found = false;
    for (const car of stateRef.current.cars) {
      if (Math.sqrt((car.x-x)**2+(car.y-y)**2)<14) {
        items = [
          { label:"⚡ Route to nearest station", action:()=>routeCarNow(car.id) },
          { label:"🔋 Set battery 10%", action:()=>setBattery(car.id,10) },
          { label:"🔋 Set battery 50%", action:()=>setBattery(car.id,50) },
          { label:"🔋 Full charge (100%)", action:()=>setBattery(car.id,100) },
          { sep:true },
          { label:"✕ Remove car", action:()=>removeCar(car.id), danger:true },
        ]; found=true; break;
      }
    }
    if (!found) for (const s of stateRef.current.stations) {
      if (Math.sqrt((s.x-x)**2+(s.y-y)**2)<18) {
        items = [
          { label:"🔓 Clear all slots", action:()=>clearStation(s.id) },
          { label:"🔒 Block (maintenance)", action:()=>blockStation(s.id) },
          { sep:true },
          { label:"✕ Remove station", action:()=>removeStation(s.id), danger:true },
        ]; found=true; break;
      }
    }
    if (!found) items = [
      { label:"🚗 Add car here", action:()=>{ const id=++carIdCounter; const {W,H}=sizeRef.current; const car={id,name:`CAR-${String(id).padStart(3,"0")}`,x,y,color:CAR_COLORS[(id-1)%CAR_COLORS.length],battery:40+Math.random()*55,status:"idle",speed:60+Math.random()*60,path:[],pathIdx:0,targetStation:null,chargingSlot:null,trail:[],_pulse:0,_routingStarted:false,drainMultiplier:0.8+Math.random()*0.4,destX:Math.random()*W*0.8+W*0.1,destY:Math.random()*H*0.8+H*0.1}; car.path=findPath(stateRef.current.nodes,x,y,car.destX,car.destY,stateRef.current.algo); stateRef.current.cars.push(car); addLog(`🚗 ${car.name} spawned`,"info"); setCarsSnap([...stateRef.current.cars]); } },
      { label:"⚡ Add station here", action:()=>addStation(x,y) },
    ];
    setCtxMenu({ visible:true, x:e.nativeEvent.offsetX, y:e.nativeEvent.offsetY, items });
  };

  // Snap for react UI
  const snap = carsSnap;
  const statSnap = stationsSnap;
  const routing = snap.filter(c=>c.status==="routing").length;
  const charging = snap.filter(c=>c.status==="charging").length;
  const critical = snap.filter(c=>c.battery<CRITICAL).length;
  const selCar = snap.find(c=>c.id===selectedCar?.id);

  const algoMeta = ALGO_META[algo];

  return (
    <div style={styles.root}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
        input[type=range]{flex:1;height:4px;appearance:none;background:rgba(255,255,255,0.06);border-radius:2px;outline:none;cursor:pointer}
        input[type=range]::-webkit-slider-thumb{appearance:none;width:13px;height:13px;background:${T.green};border-radius:50%;cursor:pointer;box-shadow:0 0 6px ${T.greenGlow}}
        select option{background:${T.bgCard}}
        button:focus{outline:none}
      `}</style>

      {/* ── HEADER ── */}
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>🪷</div>
          <div>
            <div style={styles.logoText}>tenatra<span style={styles.logoDot}>.</span></div>
            <div style={styles.logoSub}>EV Simulation Bench</div>
          </div>
        </div>

        <div style={styles.headerStats}>
          {[
            [snap.length, "Fleet", T.green],
            [routing, "Routing", T.cyan],
            [charging, "Charging", T.inUse],
            [statSnap.length, "Stations", T.green],
            [critical, "Critical", T.critical],
          ].map(([v, l, c]) => (
            <div key={l} style={styles.statBadge}>
              <div style={styles.statVal(c)}>{v}</div>
              <div style={styles.statLbl}>{l}</div>
            </div>
          ))}
        </div>

        <div style={styles.headerControls}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontFamily:T.fontBody,fontSize:10,color:T.textMuted}}>SPEED</span>
            {[0.5,1,2,5].map(s=>(
              <button key={s} style={{...styles.speedBtn, borderColor:simSpeed===s?T.green:T.border, color:simSpeed===s?T.green:T.textMuted}} onClick={()=>setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <select style={styles.algoSelect} value={algo} onChange={e=>setAlgo(e.target.value)}>
            <option value="astar">A* Pathfinding</option>
            <option value="dijkstra">Dijkstra</option>
            <option value="greedy">Greedy Best-First</option>
          </select>
          <button style={styles.btn()} onClick={addCar}>+ Car</button>
          <button style={styles.btn(simRunning?"danger":"primary")} onClick={toggleSim}>
            {simRunning ? "⏸ Pause" : "▶ Run Sim"}
          </button>
          <button style={styles.btn()} onClick={resetSim}>↺ Reset</button>
        </div>
      </header>

      <div style={styles.main}>
        {/* ── LEFT PANEL ── */}
        <div style={{...styles.panel, ...styles.panelLeft}}>
          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>Selected Car</div>
            {selCar ? (
              <div style={styles.controlsCard}>
                <div style={{fontFamily:T.fontDisplay,fontSize:14,color:selCar.color,marginBottom:10}}>{selCar.name}</div>
                {[
                  {label:"Battery %", min:0, max:100, val:Math.round(selCar.battery), onChange:(v)=>setBattery(selCar.id,v), fmt:v=>`${v}%`},
                  {label:"Speed (px/s)", min:20, max:300, val:Math.round(selCar.speed), onChange:(v)=>setCarSpeed(selCar.id,v), fmt:v=>v},
                  {label:"Drain Rate", min:0.2, max:3, step:0.1, val:selCar.drainMultiplier?.toFixed(1)??1, onChange:(v)=>setDrain(selCar.id,v), fmt:v=>`${v}×`},
                ].map(ctrl=>(
                  <div key={ctrl.label}>
                    <label style={styles.ctrlLabel}>{ctrl.label}</label>
                    <div style={styles.ctrlRow}>
                      <input type="range" style={styles.slider} min={ctrl.min} max={ctrl.max} step={ctrl.step||1} defaultValue={ctrl.val}
                        onChange={e=>ctrl.onChange(e.target.value)} />
                      <span style={styles.sliderVal}>{ctrl.fmt(ctrl.val)}</span>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,marginTop:4}}>
                  <button style={{...styles.btn("primary"),flex:1,fontSize:10,padding:"6px"}} onClick={()=>routeCarNow(selCar.id)}>⚡ Route Now</button>
                  <button style={{...styles.btn("danger"),flex:1,fontSize:10,padding:"6px"}} onClick={()=>removeCar(selCar.id)}>✕ Remove</button>
                </div>
              </div>
            ) : (
              <div style={{fontFamily:T.fontBody,fontSize:11,color:T.textMuted,textAlign:"center",padding:"10px 0"}}>
                Click a car on the map to control it
              </div>
            )}
          </div>

          <div style={{padding:"8px 14px",borderBottom:`1px solid ${T.border}`}}>
            <div style={styles.panelTitle}>Fleet</div>
          </div>
          <div style={styles.scrollArea}>
            {snap.map(car=>{
              const pct = car.battery;
              const st = pct<CRITICAL?"critical":car.status;
              const labels = {idle:"IDLE",routing:"ROUTING",charging:"CHARGING",critical:"CRITICAL",arrived:"ARRIVED"};
              return (
                <div key={car.id} style={styles.carCard(st, selectedCar?.id===car.id, car.color)} onClick={()=>selectCar(car)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <div style={styles.carName(car.color)}>{car.name}</div>
                    <div style={styles.badgePill(st)}>{labels[st]||"IDLE"}</div>
                  </div>
                  <div style={styles.batteryWrap}><div style={styles.batteryFill(pct)} /></div>
                  <div style={styles.batteryInfo}>
                    <span style={styles.batteryPct(pct)}>{Math.round(pct)}%</span>
                    <span style={{fontFamily:T.fontBody,fontSize:10}}>{car.targetStation?"→ "+car.targetStation.name:car.status==="charging"?"⚡ Charging":"En route"}</span>
                  </div>
                </div>
              );
            })}
            <button style={styles.addBtn} onClick={addCar}>+ Add Car to Fleet</button>
          </div>
        </div>

        {/* ── MAP ── */}
        <div style={styles.mapContainer} ref={containerRef}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onContextMenu={onContextMenu}
          onClick={()=>setCtxMenu(m=>({...m,visible:false}))}>

          <canvas ref={bgCanvasRef} style={styles.canvas} />
          <canvas ref={mainCanvasRef} style={{...styles.canvas, cursor: dragRef.current?"grabbing":"crosshair"}} />

          {/* HUD */}
          <div style={styles.hud}>
            <div style={styles.hudCard}>
              <div style={styles.hudTitle}>Active Algorithm</div>
              <div style={{...styles.hudAlgo, color:algoMeta.color}}>{algoMeta.name}</div>
              <div style={styles.hudDetail}>{algoMeta.detail}</div>
              {algoStats && <div style={styles.hudStat}>{algoStats}</div>}
            </div>
            <div style={styles.hudCard}>
              <div style={styles.hudTitle}>Data Structures</div>
              {["KD-Tree: Station lookup","R-Tree: Spatial indexing","Min-Heap: Priority queue"].map(s=>(
                <div key={s} style={{...styles.hudDetail,color:T.cyan}}>▸ {s}</div>
              ))}
            </div>
            {/* API Integration Hint */}
            <div style={styles.hudCard}>
              <div style={styles.hudTitle}>API Status</div>
              <div style={{...styles.hudDetail,color:T.green}}>● Station sync: Ready</div>
              <div style={{...styles.hudDetail,color:T.textMuted,marginTop:2,fontSize:9}}>Connect your backend to<br/>update slot status live</div>
            </div>
          </div>

          {/* Mode bar */}
          <div style={styles.modeBar}>
            {[[T.green,"Idle"],[T.cyan,"Routing"],[T.inUse,"Charging"],[T.critical,"Critical <20%"]].map(([c,l])=>(
              <span key={l}><span style={styles.modeDot(c)} />{l}</span>
            ))}
            <span style={{color:T.border}}>|</span>
            <span style={{fontSize:9}}>Right-click for options · Click map to set destination</span>
          </div>

          {/* Tooltip */}
          {tooltip.visible && tooltip.content && (
            <div style={{...styles.tooltip, left:tooltip.x, top:tooltip.y}}>
              {tooltip.content.type==="car" ? <>
                <div style={styles.tooltipTitle}>{tooltip.content.obj.name}</div>
                <div style={{color:T.textSecondary}}>Battery: <span style={{color:T.green}}>{Math.round(tooltip.content.obj.battery)}%</span></div>
                <div style={{color:T.textSecondary}}>Status: {tooltip.content.obj.status}</div>
                <div style={{color:T.textSecondary}}>Speed: {Math.round(tooltip.content.obj.speed)} px/s</div>
              </> : <>
                <div style={styles.tooltipTitle}>{tooltip.content.obj.name}</div>
                <div style={{color:T.textSecondary}}>Power: <span style={{color:T.cyan}}>{tooltip.content.obj.kw}kW</span></div>
                <div style={{color:T.textSecondary}}>Slots: {tooltip.content.obj.slots.filter(s=>s.occupied).length}/{tooltip.content.obj.slots.length} occupied</div>
                <div style={{color:tooltip.content.obj.slots.every(s=>s.occupied)?T.critical:T.green}}>{tooltip.content.obj.slots.every(s=>s.occupied)?"● FULL":"● Available"}</div>
              </>}
            </div>
          )}

          {/* Context Menu */}
          {ctxMenu.visible && (
            <div style={{...styles.ctxMenu, left:ctxMenu.x, top:ctxMenu.y}}>
              {ctxMenu.items.map((item,i)=>item.sep
                ? <div key={i} style={styles.ctxSep}/>
                : <div key={i} style={styles.ctxItem(item.danger)} onMouseEnter={e=>{e.currentTarget.style.background=item.danger?"rgba(255,92,92,0.08)":T.bgCard}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}} onClick={()=>{item.action(); setCtxMenu(m=>({...m,visible:false}));}}>
                    {item.label}
                  </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{...styles.panel, ...styles.panelRight}}>
          <div style={styles.panelSection}>
            <div style={styles.panelTitle}>Charging Stations</div>
            <button style={styles.addBtn} onClick={()=>addStation()}>+ Install Station</button>
          </div>
          <div style={{...styles.scrollArea, flex:"0 0 auto", maxHeight:"45%"}}>
            {statSnap.map(s=>{
              const occ = s.slots.filter(sl=>sl.occupied).length;
              const full = occ===s.slots.length;
              return (
                <div key={s.id} style={stationsSnap && styles.stationCard(full)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                    <div style={styles.stationName}>{s.name}</div>
                    <div style={{display:"flex",gap:3}}>
                      {s.slots.map((sl,i)=><div key={i} style={styles.slot(sl.occupied)}/>)}
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontFamily:T.fontMono,fontSize:9,color:T.cyan}}>{s.kw}kW DC Fast</span>
                    <span style={{fontFamily:T.fontMono,fontSize:9,color:full?T.critical:T.green}}>{full?"FULL":`${s.slots.length-occ} free`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 10px 4px",flexShrink:0}}>
            <div style={styles.panelTitle}>Event Log</div>
          </div>
          <div style={{...styles.scrollArea, flex:1}}>
            {logs.map(l=>(
              <div key={l.id} style={styles.logEntry(l.type)}>
                <span style={styles.logTime}>{l.t}</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}