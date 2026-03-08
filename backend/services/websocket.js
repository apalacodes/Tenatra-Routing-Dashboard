/**
 * backend/services/websocket.js
 * ─────────────────────────────────────────────
 * WebSocket Service — Real-Time Slot Status Push
 *
 * When a station's slot status changes (from the REST API
 * or from your real EV app), this service broadcasts the
 * update to ALL connected simulation clients instantly.
 *
 * Message format sent to clients:
 * {
 *   type: 'slot_update',
 *   stationDbId: '<uuid>',
 *   slots: [ { occupied: bool }, … ]
 * }
 * ─────────────────────────────────────────────
 */

let wss = null;

/**
 * Initialise with the WebSocket.Server instance from server.js.
 * @param {WebSocket.Server} wsServer
 */
function init(wsServer) {
  wss = wsServer;

  wss.on('connection', (ws, req) => {
    console.log(`🔌 WebSocket client connected from ${req.socket.remoteAddress}`);

    // Send a welcome / current-state message
    send(ws, { type: 'connected', message: 'Tenatra live slot feed active' });

    ws.on('close',   () => console.log('🔌 WebSocket client disconnected'));
    ws.on('error',   (err) => console.warn('WS error:', err.message));

    // Optional: clients can send { type: 'ping' } to keep alive
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ping') send(ws, { type: 'pong' });
      } catch (_) {}
    });
  });

  console.log('🔌 WebSocket service initialised');
}

/**
 * Broadcast a message to ALL connected clients.
 * @param {Object} payload — will be JSON.stringified
 */
function broadcast(payload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  });
}

/**
 * Send a message to a single client.
 */
function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

/**
 * Utility: trigger a slot update broadcast manually.
 * Useful for testing or pushing from a cron job.
 *
 * @param {string} stationDbId
 * @param {Array}  slots       - [{ occupied: bool }, …]
 */
function pushSlotUpdate(stationDbId, slots) {
  broadcast({ type: 'slot_update', stationDbId, slots });
}

module.exports = { init, broadcast, pushSlotUpdate };
