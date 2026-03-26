/**
 * js/clusterManager.js
 * ─────────────────────────────────────────────
 * Marker clustering for the Google Maps overlay.
 *
 * Ported from Aashish079/tenatra_app/components/ClusterMarker.tsx
 *
 * Approach: grid-based clustering in lat/lng space.
 * Stations within the same grid cell at the current
 * zoom level are grouped into a cluster bubble.
 *
 * Cluster visual tiers (matching mobile app):
 *   count < 10  → small  (40 px)
 *   count < 100 → medium (60 px)
 *   count ≥ 100 → large  (80 px)
 * ─────────────────────────────────────────────
 */

const ClusterManager = (() => {

  /** @type {google.maps.Marker[]}  Individual station markers */
  let _markers = [];
  /** @type {google.maps.Marker[]}  Cluster bubble markers */
  let _clusterMarkers = [];
  /** @type {google.maps.Map | null} */
  let _map = null;

  const MAX_CLUSTER_ZOOM = 14; // zoom ≥ this shows individual markers

  // ── Grid cell size per zoom level ─────────────────────
  // Larger number = bigger cells = more aggressive clustering.
  function _cellSizeForZoom(zoom) {
    if (zoom >= MAX_CLUSTER_ZOOM) return 0; // no clustering — show individual markers
    if (zoom >= 12) return 0.05;
    if (zoom >= 10) return 0.2;
    if (zoom >= 8)  return 0.8;
    return 2.5;
  }

  // ── Cluster computation ───────────────────────────────

  /**
   * Group stations into clusters at the given zoom level.
   *
   * @param {Object[]} stations  Sim station objects with lat/lng
   * @param {number}   zoom
   * @returns {{ lat: number, lng: number, count: number, stations: Object[] }[]}
   */
  function computeClusters(stations, zoom) {
    const cellSize = _cellSizeForZoom(zoom);

    if (cellSize === 0) {
      // No clustering — each station is its own "cluster" of one
      return stations.map(s => ({
        lat:      s.lat,
        lng:      s.lng,
        count:    1,
        stations: [s],
      }));
    }

    const cells = new Map();
    for (const s of stations) {
      const row = Math.floor(s.lat / cellSize);
      const col = Math.floor(s.lng / cellSize);
      const key = `${row}:${col}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(s);
    }

    const clusters = [];
    for (const group of cells.values()) {
      const avgLat = group.reduce((sum, s) => sum + s.lat, 0) / group.length;
      const avgLng = group.reduce((sum, s) => sum + s.lng, 0) / group.length;
      clusters.push({ lat: avgLat, lng: avgLng, count: group.length, stations: group });
    }
    return clusters;
  }

  // ── Marker rendering ──────────────────────────────────

  function _clusterIcon(count) {
    const size        = count < 10 ? 40 : count < 100 ? 60 : 80;
    const borderWidth = count < 10 ? 3  : 10;
    const fontSize    = count < 10 ? 12 : count < 100 ? 13 : 14;
    const color       = Colors.primary;

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size/2}" cy="${size/2}" r="${(size/2) - borderWidth/2}"
    fill="${color}" stroke="white" stroke-width="${borderWidth}"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
    font-family="DM Sans, sans-serif" font-size="${fontSize}" font-weight="700"
    fill="white">${count}</text>
</svg>`.trim();

    return {
      url:    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      size:   new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }

  function _stationIcon(station) {
    const plugColors = {
      'AC Type-1': Colors.carService,
      'AC Type-2': Colors.maintenance,
      'DC':        Colors.charging,
    };
    const color = plugColors[station.plugType] || Colors.primary;
    const size  = 28;

    // Bolt symbol (matching 'charging' marker type from map-marker.tsx)
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="${color}" stroke="white" stroke-width="2"/>
  <path d="M13 2L4.09 12.79H11L10 22L19.5 11.22H12.5L13 2Z" fill="white"/>
</svg>`.trim();

    return {
      url:    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      size:   new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size),
    };
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Attach the manager to a Google Maps instance.
   * @param {google.maps.Map} map
   */
  function setMap(map) {
    _map = map;
  }

  /**
   * Re-render clusters and individual markers.
   * Call this whenever the station list changes or the map
   * zoom / viewport changes.
   *
   * @param {Object[]} stations  Filtered station list (Sim schema)
   * @param {number}   zoom      Current map zoom level
   * @param {Function} [onStationClick]  Called with (station) on marker click
   */
  function render(stations, zoom, onStationClick) {
    if (!_map || typeof google === 'undefined') return;

    // Remove old overlays
    _markers.forEach(m => m.setMap(null));
    _clusterMarkers.forEach(m => m.setMap(null));
    _markers        = [];
    _clusterMarkers = [];

    const clusters = computeClusters(stations, zoom);

    for (const cluster of clusters) {
      if (cluster.count === 1) {
        // Individual station marker
        const station = cluster.stations[0];
        const marker  = new google.maps.Marker({
          position: { lat: station.lat, lng: station.lng },
          map:      _map,
          title:    station.name,
          icon:     _stationIcon(station),
        });

        if (onStationClick) {
          marker.addListener('click', () => onStationClick(station, marker));
        }
        _markers.push(marker);
      } else {
        // Cluster bubble
        const marker = new google.maps.Marker({
          position: { lat: cluster.lat, lng: cluster.lng },
          map:      _map,
          title:    `${cluster.count} stations`,
          icon:     _clusterIcon(cluster.count),
          zIndex:   1000,
        });

        // Click to zoom in and expand cluster
        marker.addListener('click', () => {
          const currentZoom = _map.getZoom();
          _map.setCenter({ lat: cluster.lat, lng: cluster.lng });
          _map.setZoom(Math.min(currentZoom + 3, MAX_CLUSTER_ZOOM + 4));
        });

        _clusterMarkers.push(marker);
      }
    }
  }

  /** Remove all managed markers from the map. */
  function clear() {
    _markers.forEach(m => m.setMap(null));
    _clusterMarkers.forEach(m => m.setMap(null));
    _markers        = [];
    _clusterMarkers = [];
  }

  return { setMap, render, clear, computeClusters };

})();
