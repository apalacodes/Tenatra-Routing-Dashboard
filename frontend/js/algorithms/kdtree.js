/**
 * algorithms/kdtree.js
 * ─────────────────────────────────────────────
 * KD-Tree (K-Dimensional Tree)
 *
 * A binary search tree that partitions 2D space alternating
 * on the X axis and Y axis at each level. Allows O(log n)
 * nearest-neighbour lookups instead of O(n) linear scans.
 *
 * Used here to answer: "Which charging station is closest
 * to car at position (x, y)?"
 *
 * Build: O(n log n)  — done once when stations load / change
 * Query: O(log n)    — called every time a car needs routing
 *
 * The tree is rebuilt whenever stations are added, removed,
 * or synced from the backend database.
 * ─────────────────────────────────────────────
 */

class KDNode {
  /**
   * @param {Object}  station  - Station data object {id, x, y, slots, …}
   * @param {number}  axis     - Split axis: 0 = X, 1 = Y
   * @param {KDNode|null} left
   * @param {KDNode|null} right
   */
  constructor(station, axis, left, right) {
    this.station = station;
    this.axis    = axis;   // 0 = split on X, 1 = split on Y
    this.left    = left;
    this.right   = right;
  }
}

/**
 * Build a balanced KD-Tree from an array of station objects.
 * Recursively partitions the array by median on alternating axes.
 *
 * @param {Object[]} stations  - Array of station objects with .x and .y
 * @param {number}   depth     - Current recursion depth (default 0)
 * @returns {KDNode|null}
 */
function kdBuild(stations, depth = 0) {
  if (!stations || stations.length === 0) return null;

  const axis = depth % 2; // 0 → split X, 1 → split Y

  // Sort by current axis and pick the median as the root
  const sorted = [...stations].sort((a, b) =>
    axis === 0 ? a.x - b.x : a.y - b.y
  );

  const mid = Math.floor(sorted.length / 2);

  return new KDNode(
    sorted[mid],
    axis,
    kdBuild(sorted.slice(0, mid),       depth + 1),
    kdBuild(sorted.slice(mid + 1),      depth + 1),
  );
}

/**
 * Find the nearest AVAILABLE station to point (qx, qy).
 * A station is "available" if at least one slot is not occupied.
 *
 * Uses the standard KD-Tree backtracking search:
 *   1. Descend into the subtree that contains the query point.
 *   2. Unwind, checking if the other subtree could possibly
 *      contain a closer point (by comparing the split-plane
 *      distance to the current best distance).
 *
 * @param {KDNode|null} node   - Root of the (sub)tree
 * @param {number}      qx     - Query x
 * @param {number}      qy     - Query y
 * @param {{ dist: number, station: Object|null }} best - Running best
 * @returns {{ dist: number, station: Object|null }}
 */
function kdNearest(node, qx, qy, best = { dist: Infinity, station: null }) {
  if (!node) return best;

  const dx   = node.station.x - qx;
  const dy   = node.station.y - qy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Only consider available stations
  const hasSlot = node.station.slots.some(s => !s.occupied);
  if (hasSlot && dist < best.dist) {
    best = { dist, station: node.station };
  }

  // Determine which subtree to search first (the one containing the point)
  const axisDiff  = node.axis === 0 ? qx - node.station.x : qy - node.station.y;
  const [first, second] = axisDiff < 0
    ? [node.left,  node.right]
    : [node.right, node.left];

  // Always search the near subtree
  best = kdNearest(first, qx, qy, best);

  // Only search the far subtree if the split plane is closer than best found
  if (Math.abs(axisDiff) < best.dist) {
    best = kdNearest(second, qx, qy, best);
  }

  return best;
}

/**
 * Convenience wrapper: build tree and immediately query it.
 * Use this when the station list may have changed since last build.
 *
 * @param {Object[]} stations
 * @param {number}   qx
 * @param {number}   qy
 * @returns {Object|null}  nearest available station, or null
 */
function kdFindNearest(stations, qx, qy) {
  if (!stations || stations.length === 0) return null;
  const tree   = kdBuild(stations);
  const result = kdNearest(tree, qx, qy);
  return result.station;
}
