/**
 * js/searchModule.js
 * ─────────────────────────────────────────────
 * Search functionality for station/location lookup.
 *
 * Ported from Aashish079/tenatra_app/components/map/search-bar.tsx
 *
 * Features:
 *  - Search by station name or location string
 *  - Clear button when text is present
 *  - Submit / Enter to trigger search
 *  - Loading state indicator
 *  - Fires callbacks so other modules can react
 * ─────────────────────────────────────────────
 */

const SearchModule = (() => {

  /** @type {HTMLInputElement | null} */
  let _input    = null;
  /** @type {HTMLElement | null} */
  let _clearBtn = null;
  /** @type {HTMLElement | null} */
  let _loader   = null;
  /** @type {HTMLElement | null} */
  let _searchIcon = null;

  /** @type {Function | null}  Called with (query: string) on submit */
  let _onSearch = null;
  /** @type {Function | null}  Called with (query: string) on every keystroke */
  let _onChange = null;

  // ── Init ──────────────────────────────────────────────

  /**
   * Wire up the search bar DOM elements.
   *
   * @param {Object} opts
   * @param {HTMLInputElement} opts.input      The text input element
   * @param {HTMLElement}      opts.clearBtn   The × clear button
   * @param {HTMLElement}      opts.loader     The spinner element
   * @param {HTMLElement}      opts.searchIcon The magnifier icon
   * @param {Function}         [opts.onSearch] Fired on submit (query)
   * @param {Function}         [opts.onChange] Fired on every keystroke (query)
   */
  function init({ input, clearBtn, loader, searchIcon, onSearch, onChange }) {
    _input      = input;
    _clearBtn   = clearBtn;
    _loader     = loader;
    _searchIcon = searchIcon;
    _onSearch   = onSearch  || null;
    _onChange   = onChange  || null;

    _input.addEventListener('input', _handleInput);
    _input.addEventListener('keydown', _handleKeydown);

    if (_clearBtn) {
      _clearBtn.addEventListener('click', _handleClear);
    }

    _syncClearVisibility();
  }

  // ── Event handlers ────────────────────────────────────

  function _handleInput() {
    _syncClearVisibility();
    if (_onChange) _onChange(_input.value);
  }

  function _handleKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      _submit();
    }
  }

  function _handleClear() {
    _input.value = '';
    _syncClearVisibility();
    _input.focus();
    if (_onChange) _onChange('');
    if (_onSearch) _onSearch('');
  }

  function _submit() {
    if (_onSearch) _onSearch(_input.value.trim());
  }

  function _syncClearVisibility() {
    if (!_clearBtn) return;
    const hasText = _input.value.length > 0;
    _clearBtn.style.display   = hasText ? 'flex' : 'none';
    if (_searchIcon) _searchIcon.style.display = hasText ? 'none' : 'flex';
  }

  // ── Loading state ─────────────────────────────────────

  /** Show the loading spinner, hide the search icon. */
  function setLoading(loading) {
    if (_loader)     _loader.style.display     = loading ? 'flex' : 'none';
    const hasText = _input && _input.value.length > 0;
    if (_searchIcon) _searchIcon.style.display = (loading || hasText) ? 'none' : 'flex';
    if (_clearBtn)   _clearBtn.style.display   = (loading || !hasText) ? 'none' : 'flex';
  }

  // ── Filter helper ─────────────────────────────────────

  /**
   * Filter a station list by the current search query.
   *
   * Matches against station name, network/operator, address,
   * and plug type — case-insensitive.
   *
   * @param {Object[]} stations  Sim station objects
   * @param {string}   query
   * @returns {Object[]}
   */
  function filterByQuery(stations, query) {
    if (!query || query.trim() === '') return stations;
    const q = query.trim().toLowerCase();
    return stations.filter(s =>
      (s.name    && s.name.toLowerCase().includes(q))    ||
      (s.network && s.network.toLowerCase().includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q)) ||
      (s.plugType && s.plugType.toLowerCase().includes(q)),
    );
  }

  /** @returns {string} Current input value */
  function getQuery() { return _input ? _input.value : ''; }

  /** Programmatically clear the search bar. */
  function clear() { if (_input) { _input.value = ''; _syncClearVisibility(); } }

  return { init, filterByQuery, setLoading, getQuery, clear };

})();
