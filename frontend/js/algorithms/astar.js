/**
 * algorithms/astar.js
 * ─────────────────────────────────────────────
 * A* (A-Star) Pathfinding
 *
 * Finds the shortest path between two nodes using a heuristic
 * to guide the search. Faster than Dijkstra in practice because
 * it prefers nodes that are already close to the destination.
 *
 * Time complexity:  O(E log V)  — E edges, V vertices
 * Space complexity: O(V)
 *
 * Heuristic used: Euclidean distance (straight-line).
 * This is admissible (never overestimates) so A* always returns
 * the optimal path on a consistent graph.
 * ─────────────────────────────────────────────
 */

/**
 * Euclidean straight-line distance between two graph nodes.
 * Used as the A* heuristic h(n).
 *
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
function astarHeuristic(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Run A* on a pre-built graph to find the path from
 * (startX, startY) to (endX, endY).
 *
 * The graph nodes don't have to sit exactly at those coordinates —
 * the function snaps to the nearest node at each end.
 *
 * @param {Array<GraphNode>} nodes   - Full list of graph nodes
 * @param {number} startX
 * @param {number} startY
 * @param {number} endX
 * @param {number} endY
 * @returns {Array<{x:number, y:number}>}  Ordered waypoint list
 */
function runAstar(nodes, startX, startY, endX, endY) {
  if (!nodes || nodes.length === 0) {
    return [{ x: endX, y: endY }];
  }

  // Snap coordinates to nearest graph node
  const start = graphNearestNode(nodes, startX, startY);
  const end   = graphNearestNode(nodes, endX,   endY);

  if (!start || !end) return [{ x: endX, y: endY }];
  if (start === end)  return [{ x: endX, y: endY }];

  // ── Open set (nodes to evaluate) ──
  // Stored as a plain Set; for large graphs replace with a
  // binary min-heap for O(log n) extraction instead of O(n).
  const openSet = new Set([start]);

  // ── Came-from map for path reconstruction ──
  const cameFrom = new Map();

  // ── g(n): actual cost from start to n ──
  const gScore = new Map();
  nodes.forEach(n => gScore.set(n, Infinity));
  gScore.set(start, 0);

  // ── f(n) = g(n) + h(n) ──
  const fScore = new Map();
  nodes.forEach(n => fScore.set(n, Infinity));
  fScore.set(start, astarHeuristic(start, end));

  let iterations = 0;
  const MAX_ITER = 2000; // safety limit

  while (openSet.size > 0) {
    if (++iterations > MAX_ITER) break;

    // Pop node with lowest f score from open set
    let current = null;
    let lowestF  = Infinity;
    openSet.forEach(node => {
      const f = fScore.get(node);
      if (f < lowestF) { lowestF = f; current = node; }
    });

    // Reached destination → reconstruct path
    if (current === end) {
      return astarReconstructPath(cameFrom, current, endX, endY);
    }

    openSet.delete(current);

    // Evaluate each neighbour
    for (const neighbour of current.neighbors) {
      const edgeWeight = graphEdgeWeight(current, neighbour);
      const tentativeG = gScore.get(current) + edgeWeight;

      if (tentativeG < gScore.get(neighbour)) {
        // Better path found
        cameFrom.set(neighbour, current);
        gScore.set(neighbour, tentativeG);
        fScore.set(neighbour, tentativeG + astarHeuristic(neighbour, end));
        openSet.add(neighbour);
      }
    }
  }

  // No path found — fall back to straight line
  return [{ x: endX, y: endY }];
}

/**
 * Reconstruct the path by walking backwards through cameFrom.
 *
 * @param {Map}    cameFrom
 * @param {GraphNode} current
 * @param {number} exactEndX  - original (un-snapped) destination
 * @param {number} exactEndY
 * @returns {Array<{x,y}>}
 */
function astarReconstructPath(cameFrom, current, exactEndX, exactEndY) {
  const path = [];
  let node = current;

  while (node) {
    path.unshift({ x: node.x, y: node.y });
    node = cameFrom.get(node);
  }

  // Append the precise destination (may differ from the snapped node)
  path.push({ x: exactEndX, y: exactEndY });
  return path;
}
