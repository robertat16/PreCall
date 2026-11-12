import { svg } from './dom';

const wrap = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const paths = {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/><circle cx="9.5" cy="12" r="2.2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  play: '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  redo: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  flip: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  ear: '<path d="M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 10a2 2 0 0 1 4 0"/>',
  left: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9l-3 3 3 3"/>',
  right: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M14 9l3 3-3 3"/>',
  wave: '<path d="M2 12h2l2-6 3 12 3-15 3 18 3-12 2 3h2"/>',
  bass: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  ab: '<rect x="3" y="5" width="7" height="14" rx="2"/><rect x="14" y="5" width="7" height="14" rx="2"/><path d="M6.5 9v6M17.5 9v6"/>',
  headset: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1-2 2-5 2"/>',
};

export type IconName = keyof typeof paths;

export function icon(name: IconName): SVGElement {
  return svg(wrap(paths[name]));
}

export function logo(): SVGElement {
  return svg(`<svg class="logo" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="lg" gradientUnits="userSpaceOnUse" x1="8" y1="8" x2="40" y2="40"><stop offset="0" stop-color="#7af7ea"/><stop offset="1" stop-color="#8b7cff"/></linearGradient></defs>
  <rect x="2" y="2" width="44" height="44" rx="14" fill="#0d1420" stroke="url(#lg)" stroke-width="1.5"/>
  <g stroke="url(#lg)" stroke-width="3" stroke-linecap="round">
    <path d="M14 21v6"/><path d="M19.5 16v16"/><path d="M25 12v24"/><path d="M30.5 17v14"/><path d="M36 21v6"/>
  </g></svg>`);
}

/** Decorative concentric-ring orb used on the home hero. */
export function orb(): SVGElement {
  return svg(`<svg class="orb" viewBox="0 0 200 200" aria-hidden="true">
  <defs><radialGradient id="og" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#5cf2e3" stop-opacity=".35"/><stop offset="1" stop-color="#5cf2e3" stop-opacity="0"/></radialGradient></defs>
  <circle cx="100" cy="100" r="96" fill="url(#og)"/>
  <g fill="none" stroke="#5cf2e3" stroke-opacity=".35">
    <circle cx="100" cy="100" r="34"/><circle cx="100" cy="100" r="54" stroke-dasharray="2 6"/><circle cx="100" cy="100" r="76" stroke-opacity=".18"/>
  </g>
  <g stroke="#8b7cff" stroke-width="3" stroke-linecap="round" stroke-opacity=".8">
    <path d="M84 94v12"/><path d="M92 86v28"/><path d="M100 80v40"/><path d="M108 88v24"/><path d="M116 95v10"/>
  </g></svg>`);
}
