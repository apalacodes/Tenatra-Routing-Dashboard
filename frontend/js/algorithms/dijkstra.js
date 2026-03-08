/**
 * algorithms/dijkstra.js
 * ─────────────────────────────────────────────
 * Dijkstra's Shortest Path Algorithm
 *
 * Explores nodes in order of cumulative cost from the start,
 * with NO heuristic. Guaranteed optimal but explores more nodes
 * than A* because it has no "direction sense" toward the goal.
 *
 * Equivalent to A* with h(n) = 0.
 *
 * Time complexity:  O(E log V)
 * Space complexity: O(V)
 * ─────────────────────────────────────────────
 */

/**
 * Run Dijkstra on a graph to find the shortest path.
 *
 * @param {Array<GraphNode>} nodes
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @returns {Array<{x:number, y:number}>}
 */
function runDijkstra(nodes, startX, startY, endX, endY) {
  if (!nodes || nodes.length === 0) return [{ x: endX, y: endY }];

  const start = graphNearestNode(nodes, startX, startY);
  const end   = graphNearestNode(nodes, endX,   endY);

  if (!start || !end) return [{ x: endX, y: endY }];
  if (start === end)  return [{ x: endX, y: endY }];

  // ── Distance table ──
  const dist = new Map();
  nodes.forEach(n => dist.set(n, Infinity));
  dist.set(start, 0);

  // ── Visited set ──
  const visited  = new Set();
  const cameFrom = new Map();

  // Unvisited priority queue (linear scan — fine for <500 nodes;
  // replace with a binary heap for larger graphs)
  const unvisited = new Set(nodes);

  let iterations = 0;
  const MAX_ITER  = 2000;

  while (unvisited.size > 0) {
    if (++iterations > MAX_ITER) break;

    // Pick unvisited node with smallest known distance
    let current   = null;
    let smallestD = Infinity;
    unvisited.forEach(node => {
      const d = dist.get(node);
      if (d < smallestD) { smallestD = d; current = node; }
    });

    // Remaining nodes unreachable
    if (current === null || smallestD === Infinity) break;

    // Reached destination
    if (current === end) {
      return dijkstraReconstructPath(cameFrom, current, endX, endY);
    }

    unvisited.delete(current);
    visited.add(current);

    for (const neighbour of current.neighbors) {
      if (visited.has(neighbour)) continue;

      const alt = dist.get(current) + graphEdgeWeight(current, neighbour);
      if (alt < dist.get(neighbour)) {
        dist.set(neighbour, alt);
        cameFrom.set(neighbour, current);
      }
    }
  }

  return [{ x: endX, y: endY }];
}

/**
 * Reconstruct path from Dijkstra's cameFrom map.
 */
function dijkstraReconstructPath(cameFrom, current, exactEndX, exactEndY) {
  const path = [];
  let node = current;
  while (node) {
    path.unshift({ x: node.x, y: node.y });
    node = cameFrom.get(node);
  }
  path.push({ x: exactEndX, y: exactEndY });
  return path;
}
