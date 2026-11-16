// The armoury. Four guns and one grenade, each with its own damage, rate, spread and
// price, so the buy menu is a real choice: the pistol is free, the rifle is the workhorse,
// the marksman rifle punishes a miss. Grenades are bought one at a time, up to two.
export const WEAPONS = [
  {
    id: 'pistol', name: 'P9 SIDEARM', price: 0,
    damage: 34, headMult: 2.4, fireGap: 0.16, auto: false,
    mag: 12, reserve: 36, reload: 1.5,
    spreadStill: 0.0035, spreadMove: 0.03, kick: 0.011, range: 60,
    desc: 'Free sidearm. Light, quick, honest at close range.',
  },
  {
    id: 'smg', name: 'JACKAL SMG', price: 1500,
    damage: 26, headMult: 2.0, fireGap: 0.075, auto: true,
    mag: 28, reserve: 84, reload: 1.8,
    spreadStill: 0.006, spreadMove: 0.038, kick: 0.007, range: 45,
    desc: 'Fast hose. Melts up close, sprays wide past mid range.',
  },
  {
    id: 'rifle', name: 'LONGSHOT RIFLE', price: 2700,
    damage: 33, headMult: 2.6, fireGap: 0.1, auto: true,
    mag: 30, reserve: 90, reload: 2.1,
    spreadStill: 0.0022, spreadMove: 0.028, kick: 0.012, range: 80,
    desc: 'The all-rounder. Three torso hits, one clean headshot.',
  },
  {
    id: 'dmr', name: 'HARPOON DMR', price: 4200,
    damage: 80, headMult: 2.0, fireGap: 0.85, auto: false,
    mag: 8, reserve: 24, reload: 2.6,
    spreadStill: 0.0009, spreadMove: 0.045, kick: 0.03, range: 110,
    desc: 'One shot, one down — if you stop, breathe and land it.',
  },
];

export const GRENADE = {
  id: 'grenade', name: 'FRAG GRENADE', price: 300, maxCarry: 2,
  damage: 110, radius: 6.5, fuse: 1.6,
  desc: 'Cook it short, bounce it round a corner. 110 damage at the centre.',
};

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  winReward: 3250,
  lossReward: 1900,
  plantReward: 300,
};

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];
}
