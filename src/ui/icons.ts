const stroke = 'fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  goggles: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 9.5c0-1.1.9-2 2-2h3.2c.8 0 1.5.5 1.8 1.2l.6 1.5h4.8l.6-1.5c.3-.7 1-1.2 1.8-1.2H19c1.1 0 2 .9 2 2v3.8c0 1.7-1.3 3-3 3h-1.6c-1.3 0-2.4-.8-2.8-2l-.6-1.8h-2l-.6 1.8c-.4 1.2-1.5 2-2.8 2H6c-1.7 0-3-1.3-3-3V9.5Z"/><path d="M7 9.5h.01M17 9.5h.01"/></svg>`,
  time: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="8.4"/><path d="M12 6.6V12l3.6 2.2"/><path d="M4.2 4.5 2.8 8M19.8 4.5l1.4 3.5"/></svg>`,
  wand: `<svg viewBox="0 0 24 24" ${stroke}><path d="m4.2 19.8 9.1-9.1"/><path d="m13.3 10.7 2.2-2.2"/><path d="M14.8 3.2v2M18.6 5.4l-1.4 1.4M20.8 9.2h-2M17.2 13l1.4 1.4M12.4 5.4l1.4 1.4"/><path d="m15.5 8.5 3.1-3.1c.6-.6 1.5-.6 2.1 0 .6.6.6 1.5 0 2.1l-3.1 3.1"/></svg>`,
  book: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 4.5h6.2c1 0 1.8.8 1.8 1.8V20c0-1-.8-1.8-1.8-1.8H4V4.5Z"/><path d="M20 4.5h-6.2c-1 0-1.8.8-1.8 1.8V20c0-1 .8-1.8 1.8-1.8H20V4.5Z"/><path d="M6.5 8h3M6.5 11h3M14.5 8h3M14.5 11h3"/></svg>`,
  graph: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3.2" y="4.2" width="17.6" height="13.6" rx="1.4"/><path d="m5.8 14.8 3.3-3.8 3 2.2 5-6.1"/><path d="M12 17.8v2.2M9 20h6"/></svg>`,
  map: `<svg viewBox="0 0 24 24" ${stroke}><path d="m3.4 6.2 5.4-2.3 6.4 2.3 5.4-2.3v13.9l-5.4 2.3-6.4-2.3-5.4 2.3V6.2Z"/><path d="M8.8 3.9v14.3M15.2 6.2V20"/></svg>`,
  help: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.4a2.6 2.6 0 1 1 4.2 2.2c-.9.6-1.8 1.1-1.8 2.3M12 17.1h.01"/></svg>`,
  badge: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="9" r="5.3"/><path d="m8.4 13.3-1.5 6.8 5.1-2.8 5.1 2.8-1.5-6.8"/><path d="m10.2 9 1.3 1.3 2.4-2.6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${stroke}><path d="m5.5 5.5 13 13M18.5 5.5l-13 13"/></svg>`,
  play: `<svg viewBox="0 0 24 24" ${stroke}><path d="M7.5 5.4v13.2L19 12 7.5 5.4Z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" ${stroke}><path d="M8 5v14M16 5v14"/></svg>`,
  slow: `<svg viewBox="0 0 24 24" ${stroke}><path d="M6.2 5.4v13.2L15 12 6.2 5.4Z"/><path d="M18 5v14"/></svg>`,
  step: `<svg viewBox="0 0 24 24" ${stroke}><path d="M6 5.5v13L15 12 6 5.5Z"/><path d="M18.5 5v14"/></svg>`,
  rewind: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4.2 4.4v4.2h4.2"/><path d="M12 8.2V12l2.4 1.7"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${stroke}><path d="m5 12.5 4.4 4.4L19 7.3"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8"/><circle cx="12" cy="12" r="2.2"/></svg>`,
  joystick: `<svg viewBox="0 0 24 24" ${stroke}><path d="M6.2 14.5h11.6c1 0 1.8.8 1.8 1.8v2.2c0 .9-.7 1.6-1.6 1.6H6c-.9 0-1.6-.7-1.6-1.6v-2.2c0-1 .8-1.8 1.8-1.8Z"/><path d="M12 14.5V9.2"/><circle cx="12" cy="6.4" r="2.8"/></svg>`,
} as const;

export type IconName = keyof typeof ICONS;
