/**
 * algorithms/graph.js
 * ─────────────────────────────────────────────
 * Road Graph Builder + Shared Graph Utilities
 *
 * Builds a grid-based graph that represents the simulated
 * road network. All three pathfinding algorithms (A*, Dijkstra,
 * Greedy) import helpers from this file.
 *
 * When Google Maps mode is active, this graph is replaced by
 * the real road network from the Directions API — see
 * googleMapsService.js on the backend.
 * ─────────────────────────────────────────────
 */

/**
 * @typedef {Object} GraphNode
 * @property {string}          id         - Unique "row_col" identifier
 * @property {number}          x          - Canvas x coordinate
 * @property {number}          y          - Canvas y coordinate
 * @property {GraphNode[]}     neighbors  - Adjacent nodes
 * @property {number}          [lat]      - Real latitude (Google Maps mode)
 * @property {number}          [lng]      - Real longitude (Google Maps mode)
 */

// ── Road grid definition ──────────────────────────────────────
// These ratios define where roads fall as a fraction of canvas W/H.
// Adjust to change the road network density.
const GRID_H_ROWS = [0.15, 0.30, 0.50, 0.70, 0.85]; // horizontal road y positions
const GRID_V_COLS = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 0.95]; // vertical road x positions

/**
 * Build the road graph from scratch given canvas dimensions.
 * Call this on mount and on every resize.
 *
 * @param {number} W  Canvas width in pixels
 * @param {number} H  Canvas height in pixels
 * @returns {{ nodes: GraphNode[], nodeMap: Object<string, GraphNode> }}
 */
function buildGraph(W, H) {
  const nodes   = [];
  const nodeMap = {};

  // ── Create one node per intersection ──
  GRID_H_ROWS.forEach((rowRatio, ri) => {
    GRID_V_COLS.forEach((colRatio, ci) => {
      const id   = `${ri}_${ci}`;
      const node = {
        id,
        x: colRatio * W,
        y: rowRatio * H,
        neighbors: [],
      };
      nodes.push(node);
      nodeMap[id] = node;
    });
  });

  // ── Connect each node to its horizontal & vertical neighbours ──
  GRID_H_ROWS.forEach((_, ri) => {
    GRID_V_COLS.forEach((_, ci) => {
      const current = nodeMap[`${ri}_${ci}`];

      // Right neighbour
      if (ci < GRID_V_COLS.length - 1) {
        const right = nodeMap[`${ri}_${ci + 1}`];
        current.neighbors.push(right);
        right.neighbors.push(current); // undirected
      }

      // Lower neighbour
      if (ri < GRID_H_ROWS.length - 1) {
        const below = nodeMap[`${ri + 1}_${ci}`];
        current.neighbors.push(below);
        below.neighbors.push(current); // undirected
      }
    });
  });

  return { nodes, nodeMap };
}

/**
 * Build road metadata (for renderer — lines to draw on bg canvas).
 * Returns an array of road segment descriptors.
 *
 * @param {number} W
 * @param {number} H
 * @returns {Array<{x1,y1,x2,y2,express:boolean}>}
 */
function buildRoadSegments(W, H) {
  const roads = [];

  GRID_H_ROWS.forEach(r => {
    roads.push({ x1: 0, y1: r * H, x2: W, y2: r * H, express: false });
  });

  GRID_V_COLS.forEach(c => {
    roads.push({ x1: c * W, y1: 0, x2: c * W, y2: H, express: false });
  });

  // Two diagonal expressways (visual only — not in graph)
  roads.push({ x1: 0,        y1: H * 0.60, x2: W * 0.40, y2: H * 0.15, express: true });
  roads.push({ x1: W * 0.60, y1: H * 0.85, x2: W,        y2: H * 0.30, express: true });

  return roads;
}

// ── Shared helper functions used by ALL algorithm files ──────

/**
 * Find the graph node closest to a (x, y) canvas coordinate.
 * O(n) linear scan — fast enough for <200 nodes.
 *
 * @param {GraphNode[]} nodes
 * @param {number} x
 * @param {number} y
 * @returns {GraphNode}
 */
function graphNearestNode(nodes, x, y) {
  let best  = null;
  let bestD = Infinity;
  for (const node of nodes) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (d < bestD) { bestD = d; best = node; }
  }
  return best;
}

/**
 * Euclidean distance between two graph nodes.
 * Used as the edge weight for all algorithms (uniform-cost graph).
 *
 * For a real road network this would incorporate:
 *   - Road speed limit
 *   - Traffic congestion factor
 *   - Number of charging stations along segment
 *
 * @param {GraphNode} a
 * @param {GraphNode} b
 * @returns {number}
 */
function graphEdgeWeight(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Unified entry point called by simulation.js.
 * Dispatches to the correct algorithm based on the string key.
 *
 * @param {string}       algo   - 'astar' | 'dijkstra' | 'greedy'
 * @param {GraphNode[]}  nodes
 * @param {number} sx   start x
 * @param {number} sy   start y
 * @param {number} ex   end x
 * @param {number} ey   end y
 * @returns {Array<{x,y}>}
 */
function findPath(algo, nodes, sx, sy, ex, ey) {
  switch (algo) {
    case 'dijkstra': return runDijkstra(nodes, sx, sy, ex, ey);
    case 'greedy':   return runGreedy(nodes, sx, sy, ex, ey);
    case 'astar':
    default:         return runAstar(nodes, sx, sy, ex, ey);
  }
}
