/**
 * js/colors.js
 * ─────────────────────────────────────────────
 * Tenatra colour palette — ported from
 * Aashish079/tenatra_app/constants/theme.ts
 *
 * Web equivalents are mapped to match the mobile
 * app design system while fitting the dark dashboard.
 * ─────────────────────────────────────────────
 */

const Colors = Object.freeze({
  // ── Primary brand ──────────────────────────────────────
  primary:    '#2AE07A',   // Tenatra green  (logo, available state)

  // ── Marker types (map-marker.tsx) ──────────────────────
  charging:   '#F5A623',   // Amber/Yellow  — bolt icon
  carService: '#3EC9FF',   // Cyan          — car icon
  maintenance:'#FFA500',   // Orange        — build/wrench icon
  warning:    '#FF5C5C',   // Red           — warning triangle

  // ── UI chrome ──────────────────────────────────────────
  searchBg:   'rgba(13, 44, 61, 0.95)',  // panel card background
  filterBg:   '#0A2535',                 // filter button background

  // ── Map background (dark Tenatra theme) ───────────────
  mapBg:      '#04111A',
  mapMid:     '#062030',
  mapBorder:  '#1A3A4A',

  // ── Text ───────────────────────────────────────────────
  textPrimary:   '#E8F4F0',
  textSecondary: '#7EAAB8',
  textMuted:     '#3D6878',
});
