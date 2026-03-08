/**
 * js/interactions.js
 * ─────────────────────────────────────────────
 * Mouse Events, Drag, Context Menu, Tooltips
 *
 * Wires all user interactions on the canvas and
 * delegates state changes to Sim.* and UI updates
 * to the functions in main.js (via the global UI object).
 * ─────────────────────────────────────────────
 */

const Interactions = (() => {

  let canvas;
  let selectedCarId  = null;
  let dragCar        = null;
  let dragOffset     = { x: 0, y: 0 };
  let isDragging     = false;

  const tooltip  = document.getElementById('tooltip');
  const ctxMenu  = document.getElementById('ctx-menu');

  // ── Init ─────────────────────────────────────────────────
  function init(mainCanvas) {
    canvas = mainCanvas;
    canvas.addEventListener('mousedown',     onMouseDown);
    canvas.addEventListener('mousemove',     onMouseMove);
    canvas.addEventListener('mouseup',       onMouseUp);
    canvas.addEventListener('contextmenu',   onContextMenu);
    document.addEventListener('click',       hideCtxMenu);
    document.addEventListener('keydown',     onKeyDown);
  }

  // ── Helpers ───────────────────────────────────────────────
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function carAtPos(x, y) {
    return Sim.getCars().find(c => Math.sqrt((c.x-x)**2 + (c.y-y)**2) < 14);
  }

  function stationAtPos(x, y) {
    return Sim.getStations().find(s => Math.sqrt((s.x-x)**2 + (s.y-y)**2) < 18);
  }

  // ── Mouse events ─────────────────────────────────────────
  function onMouseDown(e) {
    hideCtxMenu();
    if (e.button !== 0) return;
    const { x, y } = getPos(e);
    const car = carAtPos(x, y);

    if (car) {
      dragCar    = car;
      dragOffset = { x: car.x - x, y: car.y - y };
      isDragging = true;
      selectCar(car.id);
      return;
    }

    // Click on map = set new destination for selected car
    if (selectedCarId) {
      const selCar = Sim.getCars().find(c => c.id === selectedCarId);
      if (selCar && selCar.status !== 'charging') {
        const algo = Sim.getAlgo();
        selCar.destX          = x;
        selCar.destY          = y;
        selCar.path           = findPath(algo, Sim.getNodes(), selCar.x, selCar.y, x, y);
        selCar.pathIdx        = 0;
        selCar.status         = 'idle';
        selCar.targetStation  = null;
        selCar._routingStarted = false;
        UI.log(`📍 ${selCar.name} destination updated`, 'info');
      }
    }
  }

  function onMouseMove(e) {
    const { x, y } = getPos(e);

    if (isDragging && dragCar) {
      dragCar.x     = x + dragOffset.x;
      dragCar.y     = y + dragOffset.y;
      dragCar.trail = [];
      canvas.style.cursor = 'grabbing';
      return;
    }

    canvas.style.cursor = 'crosshair';
    updateTooltip(e, x, y);
  }

  function onMouseUp() {
    if (isDragging && dragCar) {
      const car = dragCar;
      UI.log(`🚗 ${car.name} repositioned to (${Math.round(car.x)}, ${Math.round(car.y)})`, 'info');
      if (car.status !== 'charging') {
        car.path           = [];
        car.pathIdx        = 0;
        car.targetStation  = null;
        car._routingStarted = false;
      }
    }
    dragCar    = null;
    isDragging = false;
    canvas.style.cursor = 'crosshair';
  }

  function onContextMenu(e) {
    e.preventDefault();
    const { x, y } = getPos(e);
    const car     = carAtPos(x, y);
    const station = car ? null : stationAtPos(x, y);

    let items = [];

    if (car) {
      items = [
        { label: '⚡ Route to nearest station', action: () => Sim.forceRoute(car.id) },
        { label: '🔋 Set battery 10%',          action: () => Sim.setBattery(car.id, 10) },
        { label: '🔋 Set battery 50%',          action: () => Sim.setBattery(car.id, 50) },
        { label: '🔋 Full charge (100%)',        action: () => Sim.setBattery(car.id, 100) },
        { sep: true },
        { label: '✕ Remove car', action: () => { Sim.removeCar(car.id); if (selectedCarId === car.id) selectCar(null); UI.refreshAll(); }, danger: true },
      ];
    } else if (station) {
      items = [
        { label: '🔓 Clear all slots',       action: () => { Sim.clearStation(station.id); UI.refreshAll(); } },
        { label: '🔒 Block (maintenance)',    action: () => { Sim.blockStation(station.id); UI.refreshAll(); } },
        { sep: true },
        { label: '✕ Remove station', action: () => { Sim.removeStation(station.id); UI.refreshAll(); }, danger: true },
      ];
    } else {
      items = [
        { label: '🚗 Add car here',     action: () => { Sim.addCar(x, y); UI.refreshAll(); } },
        { label: '⚡ Add station here', action: () => { Sim.addStation(x, y); UI.refreshAll(); } },
      ];
    }

    showCtxMenu(e.offsetX, e.offsetY, items);
  }

  function onKeyDown(e) {
    // ESC deselects car
    if (e.key === 'Escape') selectCar(null);
    // Delete removes selected car
    if (e.key === 'Delete' && selectedCarId) {
      Sim.removeCar(selectedCarId);
      selectCar(null);
      UI.refreshAll();
    }
  }

  // ── Tooltip ───────────────────────────────────────────────
  function updateTooltip(e, x, y) {
    const car     = carAtPos(x, y);
    const station = car ? null : stationAtPos(x, y);

    if (car) {
      tooltip.innerHTML = `
        <div class="tooltip-title" style="color:${car.color}">${car.name}</div>
        Battery: <strong>${Math.round(car.battery)}%</strong><br>
        Status: ${car.status}<br>
        Speed: ${Math.round(car.speed)} px/s<br>
        ${car.targetStation ? '→ ' + car.targetStation.name : 'No target'}
        ${car.drainMultiplier ? '<br>Drain: ' + car.drainMultiplier.toFixed(1) + '×' : ''}`;
      tooltip.style.left = (e.offsetX + 16) + 'px';
      tooltip.style.top  = (e.offsetY - 10) + 'px';
      tooltip.classList.add('visible');
    } else if (station) {
      const occ = station.slots.filter(s => s.occupied).length;
      tooltip.innerHTML = `
        <div class="tooltip-title">${station.name}</div>
        Power: <strong>${station.kw}kW</strong><br>
        Slots: ${occ}/${station.slots.length} occupied<br>
        ${station.address ? 'Address: ' + station.address + '<br>' : ''}
        Status: <span style="color:${occ===station.slots.length?'var(--red)':'var(--green)'}">
          ${occ === station.slots.length ? '● FULL' : `● ${station.slots.length-occ} free`}
        </span>`;
      tooltip.style.left = (e.offsetX + 16) + 'px';
      tooltip.style.top  = (e.offsetY - 10) + 'px';
      tooltip.classList.add('visible');
    } else {
      tooltip.classList.remove('visible');
    }
  }

  // ── Context menu ──────────────────────────────────────────
  function showCtxMenu(x, y, items) {
    ctxMenu.innerHTML = '';
    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        ctxMenu.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.danger ? ' danger' : '');
      el.textContent = item.label;
      el.onclick = () => { item.action(); hideCtxMenu(); UI.refreshAll(); };
      ctxMenu.appendChild(el);
    });
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top  = y + 'px';
    ctxMenu.classList.remove('hidden');
  }

  function hideCtxMenu() {
    ctxMenu.classList.add('hidden');
  }

  // ── Car selection ─────────────────────────────────────────
  function selectCar(id) {
    selectedCarId = id;
    UI.renderCarControls(id);
    UI.renderCarList(id);
  }

  return {
    init,
    getSelectedCarId: () => selectedCarId,
    selectCar,
  };

})();
