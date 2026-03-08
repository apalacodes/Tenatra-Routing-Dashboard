/**
 * algorithms/greedy.js
 * ─────────────────────────────────────────────
 * Greedy Best-First Search
 *
 * Always expands the node that LOOKS closest to the goal
 * using only the heuristic h(n), completely ignoring the
 * cost already paid to reach that node (g(n)).
 *
 * Result: very fast in open spaces but NOT guaranteed optimal.
 * May produce longer paths if the "obvious" direction is blocked.
 *
 * Useful for: demos, quick routing under time pressure.
 * In the Tenatra sim it shows how a naive "go toward station"
 * approach compares to the full A* cost.
 *
 * Time complexity:  O(b^m)  worst case — b branching factor, m depth
 * Space complexity: O(b^m)
 * ─────────────────────────────────────────────
 */

/**
 * Greedy heuristic — straight-line distance, weighted 2×
 * to make the bias toward the goal very pronounced.
 *
 * @param {{ x:number, y:number }} a
 * @param {{ x:number, y:number }} b
 * @returns {number}
 */
function greedyHeuristic(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) * 2; // 2× weight = more aggressive
}

/**
 * Run Greedy Best-First search.
 *
 * @param {Array<GraphNode>} nodes
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @returns {Array<{x:number, y:number}>}
 */
function runGreedy(nodes, startX, startY, endX, endY) {
  if (!nodes || nodes.length === 0) return [{ x: endX, y: endY }];

  const start = graphNearestNode(nodes, startX, startY);
  const end   = graphNearestNode(nodes, endX,   endY);

  if (!start || !end) return [{ x: endX, y: endY }];
  if (start === end)  return [{ x: endX, y: endY }];

  // Open set — nodes awaiting evaluation
  const openSet  = new Set([start]);
  const cameFrom = new Map();

  // Score each node purely by its heuristic distance to goal
  const hScore = new Map();
  nodes.forEach(n => hScore.set(n, Infinity));
  hScore.set(start, greedyHeuristic(start, end));

  const visited   = new Set();
  let iterations  = 0;
  const MAX_ITER  = 2000;

  while (openSet.size > 0) {
    if (++iterations > MAX_ITER) break;

    // Pop node with best (lowest) heuristic score
    let current  = null;
    let lowestH  = Infinity;
    openSet.forEach(node => {
      const h = hScore.get(node);
      if (h < lowestH) { lowestH = h; current = node; }
    });

    if (current === end) {
      return greedyReconstructPath(cameFrom, current, endX, endY);
    }

    openSet.delete(current);
    visited.add(current);

    for (const neighbour of current.neighbors) {
      if (visited.has(neighbour)) continue;

      if (!openSet.has(neighbour)) {
        cameFrom.set(neighbour, current);
        hScore.set(neighbour, greedyHeuristic(neighbour, end));
        openSet.add(neighbour);
      }
    }
  }

  return [{ x: endX, y: endY }];
}

function greedyReconstructPath(cameFrom, current, exactEndX, exactEndY) {
  const path = [];
  let node = current;
  while (node) {
    path.unshift({ x: node.x, y: node.y });
    node = cameFrom.get(node);
  }
  path.push({ x: exactEndX, y: exactEndY });
  return path;
}
