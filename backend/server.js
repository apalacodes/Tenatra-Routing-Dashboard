/**
 * backend/server.js
 * ─────────────────────────────────────────────
 * Express Server — Tenatra EV Simulation Backend
 *
 * Provides:
 *   REST API  →  /api/stations, /api/cars, /api/maps/route
 *   WebSocket →  /ws  (real-time slot status push)
 * ─────────────────────────────────────────────
 */

require('dotenv').config({ path: '../.env' });

const express   = require('express');
const cors      = require('cors');
const http      = require('http');
const WebSocket = require('ws');

const db          = require('./config/db');
const stationsRouter = require('./routes/stations');
const carsRouter     = require('./routes/cars');
const mapsRouter     = require('./routes/maps');
const wsService      = require('./services/websocket');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────
app.use('/api/stations', stationsRouter);
app.use('/api/cars',     carsRouter);
app.use('/api/maps',     mapsRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── WebSocket server ──────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws' });
wsService.init(wss);

// ── Start ─────────────────────────────────────────────────
db.connect()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`✅ Tenatra backend running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket ready at ws://localhost:${PORT}/ws`);
    });
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.log('💡 Starting without DB — using mock data');
    server.listen(PORT, () => {
      console.log(`⚠️  Backend running (no DB) on http://localhost:${PORT}`);
    });
  });

module.exports = { app, wss };
