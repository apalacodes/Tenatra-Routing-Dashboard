/**
 * js/googleMaps.js
 * ─────────────────────────────────────────────
 * Google Maps Overlay & Integration
 *
 * Manages:
 *  - Map initialisation & dark Tenatra styling
 *  - Station marker rendering via ClusterManager
 *  - Simulated car overlays & routing paths
 *  - Info windows on station click
 *  - Lat/lng ↔ canvas pixel projection
 * ─────────────────────────────────────────────
 */

const GoogleMapsModule = (() => {

  /** @type {google.maps.Map | null} */
  let _map = null;

  /** car id → google.maps.Marker */
  const _carMarkers = {};
  /** car id → google.maps.Polyline */
  const _pathLines  = {};
  /** Currently open InfoWindow */
  let _openInfoWindow = null;

  // ── Dark map styles (Tenatra palette) ─────────────────
  const MAP_STYLES = [
    { elementType: 'geometry',          stylers: [{ color: '#062030' }] },
    { elementType: 'labels.text.fill',  stylers: [{ color: '#7EAAB8' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#04111A' }] },
    { featureType: 'road',              elementType: 'geometry',        stylers: [{ color: '#0A2535' }] },
    { featureType: 'road',              elementType: 'geometry.stroke', stylers: [{ color: '#1A3A4A' }] },
    { featureType: 'road.highway',      elementType: 'geometry',        stylers: [{ color: '#0D3048' }] },
    { featureType: 'road.highway',      elementType: 'geometry.stroke', stylers: [{ color: '#1A4A64' }] },
    { featureType: 'water',             elementType: 'geometry',        stylers: [{ color: '#041520' }] },
    { featureType: 'poi',               elementType: 'geometry',        stylers: [{ color: '#062030' }] },
    { featureType: 'transit',           elementType: 'geometry',        stylers: [{ color: '#041828' }] },
    { featureType: 'administrative',    elementType: 'geometry',        stylers: [{ color: '#0A2535' }] },
  ];

  // ── Init ──────────────────────────────────────────────

  /**
   * Create and return a Google Maps instance.
   *
   * @param {HTMLElement} container
   * @param {{ lat: number, lng: number }} center
   * @param {number} zoom
   * @returns {google.maps.Map}
   */
  function init(container, center, zoom) {
    if (typeof google === 'undefined' || !google.maps) {
      console.error('[GoogleMapsModule] google.maps not loaded');
      return null;
    }

    _map = new google.maps.Map(container, {
      center,
      zoom,
      mapTypeId:        'roadmap',
      styles:           MAP_STYLES,
      disableDefaultUI: false,
      gestureHandling:  'greedy',
    });

    return _map;
  }

  function getMap() { return _map; }

  // ── Station info window ───────────────────────────────

  function showStationInfo(marker, station) {
    if (_openInfoWindow) _openInfoWindow.close();

    const occ  = station.slots.filter(s => s.occupied).length;
    const full = occ === station.slots.length;

    // Map plug type to marker type (matching map-marker.tsx)
    const plugColors = {
      'AC Type-1': Colors.carService,
      'AC Type-2': Colors.maintenance,
      'DC':        Colors.charging,
    };
    const markerColor = plugColors[station.plugType] || Colors.primary;

    const content = `
      <div style="
        background: #0D2C3D;
        border: 1px solid #1A3A4A;
        border-radius: 10px;
        padding: 12px 14px;
        font-family: 'DM Sans', sans-serif;
        color: #E8F4F0;
        min-width: 180px;
        max-width: 240px;
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="
            width:10px;height:10px;border-radius:50%;
            background:${markerColor};
            display:inline-block;flex-shrink:0;
          "></span>
          <strong style="font-size:13px;color:#E8F4F0;">${station.name}</strong>
        </div>
        ${station.network ? `<div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">🏢 ${station.network}</div>` : ''}
        ${station.plugType ? `<div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">🔌 ${station.plugType}</div>` : ''}
        <div style="font-size:11px;color:#7EAAB8;margin-bottom:4px;">⚡ ${station.kw} kW</div>
        ${station.address ? `<div style="font-size:10px;color:#3D6878;margin-bottom:4px;">📍 ${station.address}</div>` : ''}
        <div style="
          margin-top:8px;
          padding:6px 8px;
          background:${full ? 'rgba(255,92,92,0.1)' : 'rgba(42,224,122,0.08)'};
          border-radius:6px;
          font-size:11px;
          color:${full ? '#FF5C5C' : '#2AE07A'};
          font-weight:600;
        ">
          ${full ? '🔴 All slots occupied' : `🟢 ${station.slots.length - occ} of ${station.slots.length} slots free`}
        </div>
      </div>`;

    _openInfoWindow = new google.maps.InfoWindow({ content, disableAutoPan: false });
    _openInfoWindow.open(_map, marker);
  }

  // ── Cluster + station render ──────────────────────────

  /**
   * Re-render all station markers/clusters on the map.
   * Called by main.js whenever the filter or zoom changes.
   *
   * @param {Object[]} stations  Filtered Sim station objects
   */
  function renderStations(stations) {
    if (!_map) return;
    const zoom = _map.getZoom();
    ClusterManager.render(stations, zoom, (station, marker) => {
      showStationInfo(marker, station);
    });
  }

  // ── Car overlays ──────────────────────────────────────

  /**
   * Update (or create) a car marker.
   * @param {Object} car  Sim car object (requires lat + lng)
   */
  function updateCarMarker(car) {
    if (!_map || !car.lat || !car.lng) return;

    const pct = car.battery / 100;
    let color = Colors.primary;                          // idle  (green)
    if (car.status === 'routing')  color = Colors.carService;   // cyan
    if (car.status === 'charging') color = Colors.charging;     // amber
    if (pct < 0.2)                 color = Colors.warning;      // red (critical)

    const size = 18;
    const svg  = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
  <rect x="1" y="1" width="22" height="22" rx="5" fill="${color}" fill-opacity="0.9" stroke="white" stroke-width="2"/>
  <text x="12" y="16" text-anchor="middle" font-size="13" fill="white">🚗</text>
</svg>`.trim();

    const icon = {
      url:    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      size:   new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };

    const pos = { lat: car.lat, lng: car.lng };

    if (_carMarkers[car.id]) {
      _carMarkers[car.id].setPosition(pos);
      _carMarkers[car.id].setIcon(icon);
    } else {
      const m = new google.maps.Marker({ position: pos, map: _map, title: car.name, icon, zIndex: 500 });
      m.addListener('click', () => {
        if (typeof Interactions !== 'undefined') Interactions.selectCar(car.id);
      });
      _carMarkers[car.id] = m;
    }
  }

  /**
   * Update (or create) the routing path polyline for a car.
   * @param {Object} car  Sim car object
   */
  function updateCarPath(car) {
    if (!_map) return;

    // Remove stale polyline if car has no path
    if (!car.path || car.path.length === 0) {
      if (_pathLines[car.id]) { _pathLines[car.id].setMap(null); delete _pathLines[car.id]; }
      return;
    }

    const coords = [];
    for (let i = car.pathIdx; i < car.path.length; i++) {
      const n = car.path[i];
      if (n && n.lat !== undefined && n.lng !== undefined) {
        coords.push({ lat: n.lat, lng: n.lng });
      }
    }

    if (coords.length === 0) return;

    if (_pathLines[car.id]) {
      _pathLines[car.id].setPath(coords);
    } else {
      _pathLines[car.id] = new google.maps.Polyline({
        path:          coords,
        geodesic:      true,
        strokeColor:   car.color || Colors.carService,
        strokeOpacity: 0.65,
        strokeWeight:  2,
        map:           _map,
      });
    }
  }

  /** Remove all car markers and path polylines. */
  function clearCarOverlays() {
    Object.values(_carMarkers).forEach(m => m.setMap(null));
    Object.values(_pathLines).forEach(p => p.setMap(null));
    Object.keys(_carMarkers).forEach(k => delete _carMarkers[k]);
    Object.keys(_pathLines).forEach(k => delete _pathLines[k]);
  }

  // ── Map controls ──────────────────────────────────────

  function setCenter(lat, lng, zoom) {
    if (_map) {
      _map.setCenter({ lat, lng });
      if (zoom !== undefined) _map.setZoom(zoom);
    }
  }

  function fitBounds(north, south, east, west) {
    if (_map) {
      _map.fitBounds(new google.maps.LatLngBounds(
        { lat: south, lng: west },
        { lat: north, lng: east },
      ));
    }
  }

  return {
    init,
    getMap,
    renderStations,
    updateCarMarker,
    updateCarPath,
    clearCarOverlays,
    setCenter,
    fitBounds,
    MAP_STYLES,
  };

})();
