// The look plan, in one place. Six values and one accent hue; the lighting makes every
// shade the game needs, so no other colour appears in the code. The same six names are
// the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#171310', // dusk sky / ground haze
  surface: '#2a211a', // container steel, warm brown-grey
  hairline: '#4a3b2c', // crates, girders, railings
  ink: '#f2e8d8', // lamps, markings, pale concrete
  muted: '#a89a86', // distant silhouettes, dust
  accent: '#f0a830', // amber: team colour, sun, tracer glow
  danger: '#d05545', // rust: enemy team, warning
};

// A small seeded RNG so the ?shot= captures are the same frame every run.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
