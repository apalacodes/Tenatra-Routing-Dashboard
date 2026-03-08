/**
 * backend/config/db.js
 * ─────────────────────────────────────────────
 * PostgreSQL connection via pg (node-postgres).
 *
 * Uses a connection pool so multiple requests can
 * be handled concurrently without opening a new
 * connection for each one.
 *
 * Expected environment variable:
 *   DATABASE_URL=postgresql://user:password@host:5432/tenatra_ev
 *
 * Expected table schema (run once to set up):
 * ─────────────────────────────────────────────
 * CREATE TABLE stations (
 *   id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   name           VARCHAR(100) NOT NULL,
 *   latitude       DOUBLE PRECISION NOT NULL,
 *   longitude      DOUBLE PRECISION NOT NULL,
 *   kw_power       INTEGER DEFAULT 50,
 *   total_slots    INTEGER DEFAULT 3,
 *   occupied_slots INTEGER DEFAULT 0,
 *   network_name   VARCHAR(100),
 *   address        TEXT,
 *   is_active      BOOLEAN DEFAULT true,
 *   created_at     TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at     TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE TABLE slot_events (
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   station_id  UUID REFERENCES stations(id),
 *   slot_index  INTEGER,
 *   occupied    BOOLEAN,
 *   car_id      VARCHAR(50),
 *   recorded_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ─────────────────────────────────────────────
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max:            10,   // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

module.exports = {
  /**
   * Test the connection. Called on server boot.
   */
  connect: async () => {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected');
    client.release();
  },

  /**
   * Execute a query.
   * @param {string}  text    - SQL with $1, $2 … placeholders
   * @param {Array}   params
   */
  query: (text, params) => pool.query(text, params),

  /**
   * Get a pooled client for multi-statement transactions.
   */
  getClient: () => pool.connect(),
};
