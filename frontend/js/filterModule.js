/**
 * js/filterModule.js
 * ─────────────────────────────────────────────
 * Station filter panel.
 *
 * Ported from Aashish079/tenatra_app/components/map/filter-button.tsx
 *
 * Features:
 *  - Filter by plug type (AC Type-1, AC Type-2, DC)
 *  - Filter by operator/network
 *  - Filter by power range (kW)
 *  - Filter by availability (slots free)
 *  - Persistent filter state
 *  - Open/close toggle (tune icon button)
 * ─────────────────────────────────────────────
 */

const FilterModule = (() => {

  /** @type {HTMLElement | null} The filter-panel container */
  let _panel = null;
  /** @type {HTMLElement | null} The filter-button element */
  let _btn   = null;

  /** @type {Function | null}  Called whenever filters change */
  let _onFilterChange = null;

  // ── Persistent filter state ───────────────────────────
  const _state = {
    plugTypes:     [],      // e.g. ['DC', 'AC Type-2']
    operators:     [],      // e.g. ['NEA']
    minPowerKw:    0,
    maxPowerKw:    500,
    availableOnly: false,
  };

  // ── Init ──────────────────────────────────────────────

  /**
   * @param {Object}   opts
   * @param {HTMLElement} opts.btn        The tune/filter toggle button
   * @param {HTMLElement} opts.panel      The filter panel container
   * @param {Function}    [opts.onChange] Called with (filters) on change
   */
  function init({ btn, panel, onChange }) {
    _btn   = btn;
    _panel = panel;
    _onFilterChange = onChange || null;

    _btn.addEventListener('click', togglePanel);
  }

  // ── Panel visibility ──────────────────────────────────

  function togglePanel() {
    if (!_panel) return;
    const isOpen = !_panel.classList.contains('hidden');
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel()  { _panel && _panel.classList.remove('hidden'); _btn && _btn.classList.add('active'); }
  function closePanel() { _panel && _panel.classList.add('hidden');    _btn && _btn.classList.remove('active'); }

  // ── HTML escaping helper ──────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Panel rendering ───────────────────────────────────

  /**
   * Populate the filter panel with controls derived from the
   * current station list.
   *
   * @param {string[]} plugTypes   Available plug types
   * @param {string[]} operators   Available operators
   * @param {number}   maxPowerKw  Maximum kW in the data set
   */
  function buildPanel(plugTypes, operators, maxPowerKw) {
    if (!_panel) return;
    const max = maxPowerKw || 500;
    _state.maxPowerKw = max;

    _panel.innerHTML = `
      <div class="filter-panel-header">
        <span class="filter-panel-title">Filters</span>
        <button class="filter-close-btn" id="filter-close-btn" title="Close">✕</button>
      </div>

      <div class="filter-section">
        <div class="filter-label">Plug Type</div>
        <div class="filter-chips" id="filter-plug-types">
          ${plugTypes.map(pt => `
            <button class="filter-chip ${_state.plugTypes.includes(pt) ? 'active' : ''}"
              data-plug="${_esc(pt)}">${_esc(pt)}</button>
          `).join('')}
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-label">Availability</div>
        <label class="filter-toggle-row">
          <input type="checkbox" id="filter-avail" ${_state.availableOnly ? 'checked' : ''}>
          <span>Show only stations with free slots</span>
        </label>
      </div>

      <div class="filter-section">
        <div class="filter-label">Min Power: <span id="filter-kw-val">${_state.minPowerKw}</span> kW</div>
        <input type="range" id="filter-kw" min="0" max="${max}" step="10"
          value="${_state.minPowerKw}" class="filter-range">
      </div>

      ${operators.length > 0 ? `
      <div class="filter-section">
        <div class="filter-label">Operator</div>
        <select id="filter-operator" class="filter-select">
          <option value="">All operators</option>
          ${operators.map(op => `<option value="${_esc(op)}" ${_state.operators.includes(op) ? 'selected' : ''}>${_esc(op)}</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="filter-actions">
        <button class="btn" id="filter-reset-btn">↺ Reset</button>
      </div>
    `;

    // Wire events
    document.getElementById('filter-close-btn').addEventListener('click', closePanel);

    _panel.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pt = chip.dataset.plug;
        const idx = _state.plugTypes.indexOf(pt);
        if (idx === -1) {
          _state.plugTypes.push(pt);
          chip.classList.add('active');
        } else {
          _state.plugTypes.splice(idx, 1);
          chip.classList.remove('active');
        }
        _emit();
      });
    });

    document.getElementById('filter-avail').addEventListener('change', e => {
      _state.availableOnly = e.target.checked;
      _emit();
    });

    const kwRange = document.getElementById('filter-kw');
    kwRange.addEventListener('input', () => {
      _state.minPowerKw = Number(kwRange.value);
      document.getElementById('filter-kw-val').textContent = _state.minPowerKw;
      _emit();
    });

    const opSelect = document.getElementById('filter-operator');
    if (opSelect) {
      opSelect.addEventListener('change', () => {
        _state.operators = opSelect.value ? [opSelect.value] : [];
        _emit();
      });
    }

    document.getElementById('filter-reset-btn').addEventListener('click', () => {
      _state.plugTypes     = [];
      _state.operators     = [];
      _state.minPowerKw    = 0;
      _state.maxPowerKw    = max;
      _state.availableOnly = false;
      buildPanel(plugTypes, operators, max); // re-render with reset state
      _emit();
    });
  }

  // ── State ─────────────────────────────────────────────

  function _emit() {
    if (_onFilterChange) _onFilterChange({ ..._state });
  }

  /** @returns {{ plugTypes, operators, minPowerKw, maxPowerKw, availableOnly }} */
  function getFilters() { return { ..._state }; }

  /** @returns {boolean} true when any non-default filter is active */
  function hasActiveFilters() {
    return (
      _state.plugTypes.length     > 0 ||
      _state.operators.length     > 0 ||
      _state.minPowerKw           > 0 ||
      _state.availableOnly
    );
  }

  return { init, togglePanel, openPanel, closePanel, buildPanel, getFilters, hasActiveFilters };

})();
