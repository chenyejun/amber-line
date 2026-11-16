// The view-model weapon: one gun in the player's hands, its magazine, reload and the
// spread that punishes moving. It owns the numbers; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, weaponById } from './weapons.js';

const MUZZLE_TIME = 0.06;

const VIEW_MODELS = [
  { barrel: [0.04, 0.04, 0.22], receiver: [0.08, 0.09, 0.2], grip: [0.07, 0.12, 0.07], mag: null },
  { barrel: [0.04, 0.04, 0.34], receiver: [0.09, 0.1, 0.3], grip: [0.07, 0.13, 0.07], mag: [0.06, 0.16, 0.08] },
  { barrel: [0.045, 0.045, 0.42], receiver: [0.09, 0.1, 0.42], grip: [0.07, 0.13, 0.07], mag: [0.06, 0.18, 0.09] },
  { barrel: [0.05, 0.05, 0.62], receiver: [0.09, 0.11, 0.5], grip: [0.07, 0.13, 0.07], mag: [0.06, 0.14, 0.09], scope: true },
];

export function createViewWeapon(camera) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  let current = 0;
  let mag = WEAPONS[0].mag;
  let reserve = WEAPONS[0].reserve;
  const state = { cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, switching: 0 };

  function rebuildModel() {
    while (model.children.length) model.remove(model.children[0]);
    const spec = VIEW_MODELS[current];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...spec.receiver), bodyMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...spec.barrel), gripMat);
    barrel.position.set(0, 0.025, -0.32);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), gripMat);
    stock.position.set(0, -0.02, 0.26);
    model.add(receiver, barrel, stock);
    if (spec.mag) {
      const magMesh = new THREE.Mesh(new THREE.BoxGeometry(...spec.mag), gripMat);
      magMesh.position.set(0, -0.12, -0.02);
      model.add(magMesh);
    }
    if (spec.scope) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), bodyMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
  }
  rebuildModel();

  function def() { return WEAPONS[current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switching = Math.max(0, state.switching - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.position.y = -0.2 - state.switching * 0.35;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = d.mag - mag;
        const take = Math.min(need, reserve);
        mag += take;
        reserve -= take;
      }
    }
  }

  return {
    get index() { return current; },
    get def() { return def(); },
    get mag() { return mag; },
    get reserve() { return reserve; },
    get reloading() { return state.reloadLeft > 0; },
    step,
    ready() {
      return mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switching === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.03 + def().kick;
    },
    takeRound() {
      if (mag <= 0) return false;
      mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || mag === d.mag || reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMove;
    },
    switchTo(index) {
      if (index === current || index < 0 || index >= WEAPONS.length) return false;
      current = index;
      mag = WEAPONS[current].mag;
      reserve = WEAPONS[current].reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.switching = 0.25;
      rebuildModel();
      return true;
    },
    buy(id) {
      const index = WEAPONS.findIndex((w) => w.id === id);
      if (index === -1) return false;
      return this.switchTo(index);
    },
    refillAmmo() {
      mag = def().mag;
      reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
    },
    resetToPistol() {
      current = 0;
      this.refillAmmo();
      rebuildModel();
    },
  };
}

export { weaponById };
