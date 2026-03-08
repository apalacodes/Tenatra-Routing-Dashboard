/**
 * algorithms/stationSelector.js
 * ─────────────────────────────────────────────
 * Constraint-Aware Station Selection
 *
 * The KD-Tree gives us the geometrically nearest station,
 * but that's not always the best choice for a car heading
 * toward a destination. This module scores all available
 * stations using multiple constraints:
 *
 *   1. Distance      — raw Euclidean distance to station
 *   2. Direction     — angular alignment with car's destination
 *   3. Available kW  — prefer faster chargers when battery is low
 *   4. Slot pressure — avoid nearly-full stations to reduce
 *                      the chance of arriving to a full station
 *
 * Final score (lower = better):
 *   score = (distance / directionBonus) * kwPenalty * pressurePenalty
 *
 * The KD-Tree is still used for a fast pre-filter to get the
 * top-N nearest stations before the full scoring pass.
 * ─────────────────────────────────────────────
 */

// ── Tuning parameters ────────────────────────────────────────
const DIRECTION_WEIGHT  = 0.30;  // max bonus for perfect alignment  (30%)
const KW_THRESHOLD_LOW  = 50;    // kW below which we apply a penalty
const KW_PENALTY        = 1.15;  // score multiplier for slow chargers
const PRESSURE_FULL_PENALTY = 1.25; // score multiplier if only 1 slot left
const TOP_N_CANDIDATES  = 6;     // how many stations to pass to full scorer

/**
 * Find the best charging station for a given car considering:
 *   - Battery level
 *   - Current position
 *   - Intended destination
 *   - Station availability and charge speed
 *
 * @param {Object[]} allStations  - Full station list
 * @param {Object}   car          - Car state object
 * @returns {Object|null}         - Best station, or null if none available
 */
function selectBestStation(allStations, car) {
  // ── Step 1: Filter to available stations only ──
  const available = allStations.filter(s =>
    s.slots.some(sl => !sl.occupied)
  );
  if (available.length === 0) return null;

  // ── Step 2: KD-Tree pre-filter — get closest N candidates ──
  // Building a tree each call is fine at this scale (<100 stations).
  // For a production app, maintain a persistent tree and only rebuild
  // when the station list changes (via WebSocket update).
  const tree = kdBuild(available);

  // Collect top-N nearest by pure distance using the tree
  const candidates = kdTopN(tree, car.x, car.y, TOP_N_CANDIDATES);

  if (candidates.length === 0) return null;

  // ── Step 3: Full constraint scoring on candidates ──
  const scored = candidates.map(station => {
    const score = scoreStation(station, car);
    return { station, score };
  });

  // Sort ascending — lowest score wins
  scored.sort((a, b) => a.score - b.score);

  return scored[0].station;
}

/**
 * Compute the constraint-aware score for a single station.
 * Lower = better.
 *
 * @param {Object} station
 * @param {Object} car
 * @returns {number}
 */
function scoreStation(station, car) {
  // ── Distance component ──
  const dx   = station.x - car.x;
  const dy   = station.y - car.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // ── Direction alignment bonus ──
  // How closely does the direction to this station match
  // the direction to the car's destination?
  let directionBonus = 1.0;
  if (car.destX !== undefined && car.destY !== undefined) {
    const angleToDest    = Math.atan2(car.destY - car.y, car.destX - car.x);
    const angleToStation = Math.atan2(dy, dx);
    let   angleDiff      = Math.abs(angleToDest - angleToStation);

    // Normalise to [0, π]
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

    // 0 diff → full bonus, π diff → no bonus
    const alignment  = 1 - (angleDiff / Math.PI);
    directionBonus   = 1 + alignment * DIRECTION_WEIGHT;
  }

  // ── Base score (distance adjusted by direction) ──
  let score = dist / directionBonus;

  // ── kW penalty: penalise slow chargers when battery is critical ──
  if (car.battery < 20 && station.kw < KW_THRESHOLD_LOW) {
    score *= KW_PENALTY;
  }

  // ── Slot pressure penalty: avoid stations about to be full ──
  const freeSlots = station.slots.filter(s => !s.occupied).length;
  if (freeSlots === 1) {
    score *= PRESSURE_FULL_PENALTY;
  }

  return score;
}

/**
 * Collect the top-N nearest stations from a KD-Tree.
 * Runs N independent nearest-neighbour queries, temporarily
 * marking each found station to exclude it from the next run.
 *
 * Not the most efficient approach for very large N, but
 * N ≤ 10 makes it perfectly adequate here.
 *
 * @param {KDNode}   tree
 * @param {number}   qx
 * @param {number}   qy
 * @param {number}   n
 * @returns {Object[]}  Array of station objects
 */
function kdTopN(tree, qx, qy, n) {
  const results = [];
  const excluded = new Set();

  for (let i = 0; i < n; i++) {
    const result = kdNearestExcluding(tree, qx, qy, excluded);
    if (!result.station) break;
    results.push(result.station);
    excluded.add(result.station.id);
  }

  return results;
}

/**
 * KD-Tree nearest search that skips stations in the excluded set.
 *
 * @param {KDNode|null} node
 * @param {number}      qx
 * @param {number}      qy
 * @param {Set<string>} excluded   - Set of station IDs to skip
 * @param {{ dist, station }}  best
 * @returns {{ dist: number, station: Object|null }}
 */
function kdNearestExcluding(node, qx, qy, excluded, best = { dist: Infinity, station: null }) {
  if (!node) return best;

  const s    = node.station;
  const dx   = s.x - qx;
  const dy   = s.y - qy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const hasSlot = s.slots.some(sl => !sl.occupied);
  if (hasSlot && !excluded.has(s.id) && dist < best.dist) {
    best = { dist, station: s };
  }

  const axisDiff    = node.axis === 0 ? qx - s.x : qy - s.y;
  const [first, second] = axisDiff < 0
    ? [node.left,  node.right]
    : [node.right, node.left];

  best = kdNearestExcluding(first,  qx, qy, excluded, best);
  if (Math.abs(axisDiff) < best.dist) {
    best = kdNearestExcluding(second, qx, qy, excluded, best);
  }

  return best;
}
