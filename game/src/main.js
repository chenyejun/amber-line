// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, mulberry32 } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createViewWeapon } from './weapon.js';
import { createBots } from './bots.js';
import { createMatch, BUY_SECONDS } from './rounds.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { WEAPONS, GRENADE, weaponById } from './weapons.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders, world.spawns.amber[0]);
const weapon = createViewWeapon(camera);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 130;
const shootables = world.shootables;
const hitMeshes = [];
const direction = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let defuseProgress = 0;
let buyOpen = false;
const grenades = [];

// Bomb state the bots and the player share. 'carried' lives on a bot, 'dropped' on the
// floor, 'planted' ticks down in the match, 'none' between rounds.
const bombState = { status: 'none', position: null, carrier: null };

function los(from, to) {
  direction.copy(to).sub(from);
  const dist = direction.length();
  if (dist < 0.01) return true;
  direction.normalize();
  raycaster.set(from, direction);
  raycaster.far = dist;
  return raycaster.intersectObjects(shootables, false).length === 0;
}

const bots = createBots(scene, world, {
  random,
  elapsedNow: () => elapsed,
  onKill(attacker, victim) {
    const attackerName = attacker === 'You' ? 'You' : attacker.name;
    const attackerTeam = attacker === 'You' ? 'amber' : attacker.team;
    hud.feed(attackerName, victim.name, attackerTeam);
    if (attacker === 'You') {
      player.kills += 1;
      match.onKill();
    }
  },
  onBombDropped(position) {
    bombState.status = 'dropped';
    bombState.position = position;
    bombState.carrier = null;
    if (!shot) hud.banner('Charge dropped', 'A Rust raider is going back for it', 2600);
  },
  onPlantBeep() { audio.plantBeep(false); },
});

function botCtx() {
  return {
    player: {
      position: player.position,
      alive: player.alive,
      crouching: player.mover.body.crouching,
      speed: player.mover.groundSpeed(),
    },
    bomb: bombState,
    elapsed,
    los,
    damagePlayer(amount, attacker) {
      if (!player.alive) return;
      const died = player.damage(amount);
      audio.hurt();
      hud.vignette(true);
      setTimeout(() => hud.vignette(false), 180);
      if (died) {
        hud.feed(attacker.name, 'You', 'rust');
        if (document.pointerLockElement) document.exitPointerLock();
      }
    },
    damageBot(target, amount, attacker) {
      bots.damageBot(target, amount, attacker);
    },
    tracer(from, to, team) { effects.tracer(from, to, team); },
    shotSound(pos, weaponIndex) {
      audio.shot(weaponIndex, pos.distanceTo(player.position));
    },
    onPlanted(site) {
      match.plant(site, site.center);
      world.bombGroup.position.copy(site.center).setY(0.15);
      world.bombGroup.visible = true;
      bombState.status = 'planted';
      bombState.position = site.center.clone();
      bombState.carrier = null;
      audio.plantBeep(true);
      hud.banner(`Charge planted at Site ${site.id}`, 'Defuse it before the fuse runs out', 3400);
    },
    onPickup(bot) {
      bombState.status = 'carried';
      bombState.carrier = bot;
      bombState.position = null;
    },
    onDefused(bot) {
      world.bombGroup.visible = false;
      bombState.status = 'none';
      bombState.position = null;
      hud.banner('Charge defused', `${bot.name} cut the wire`, 3000);
      match.defuse();
    },
  };
}

const match = createMatch({
  onPhase(phase) {
    if (phase === 'buy') {
      player.reset(world.spawns.amber[0]);
      player.heal();
      bots.spawnAll();
      bombState.status = 'carried';
      bombState.carrier = bots.list.find((b) => b.hasBomb) ?? null;
      bombState.position = null;
      world.bombGroup.visible = false;
      weapon.refillAmmo();
      defuseProgress = 0;
      hud.hideOverlay();
      if (!shot) {
        openBuy();
        hud.banner(`Round ${match.match.round}`, 'Buy phase — spend your money', 2400);
      }
    }
  },
  onMoney(amount, reason) {
    player.money += amount;
    hud.setMoney(player.money);
  },
  onRoundEnd(winner, reason, score) {
    closeBuy();
    const title = winner === 'amber' ? 'Amber takes the round' : 'Rust takes the round';
    hud.showOverlay('roundEnd', title, `${reason} — Amber ${score.amber} : ${score.rust} Rust`);
    if (winner === 'amber') audio.roundWin();
    else audio.roundLose();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner, score) {
    const title = winner === 'amber' ? 'Amber takes the yard' : 'Rust takes the yard';
    hud.showOverlay('matchEnd', title, `Final score — Amber ${score.amber} : ${score.rust} Rust`);
    if (winner === 'amber') audio.roundWin();
    else audio.roundLose();
  },
  onPlanted() {},
  onDefused() {},
  onExploded(position) {
    effects.explosion(position, 6);
    audio.explosion();
    world.bombGroup.visible = false;
    bombState.status = 'none';
    bombState.position = null;
  },
});

// Collect bot hitboxes once: torso and head meshes carry their bot in userData.
for (const bot of bots.list) {
  hitMeshes.push(bot.mesh.torso, bot.mesh.head);
}

function openBuy() {
  if (match.match.phase !== 'buy') return;
  buyOpen = true;
  hud.showBuy(player.money, player.owned, buyItem);
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  buyOpen = false;
  hud.hideBuy();
}
function buyItem(id) {
  if (match.match.phase !== 'buy') return;
  if (id === 'grenade') {
    if (player.grenades >= GRENADE.maxCarry) { audio.deny(); return; }
    if (player.money < GRENADE.price) { audio.deny(); return; }
    player.money -= GRENADE.price;
    player.grenades += 1;
    audio.buy();
  } else {
    const def = weaponById(id);
    if (player.owned.includes(id)) { weapon.buy(id); audio.buy(); }
    else {
      if (player.money < def.price) { audio.deny(); return; }
      player.money -= def.price;
      player.owned.push(id);
      weapon.buy(id);
      audio.buy();
    }
  }
  hud.setMoney(player.money);
  hud.setGrenades(player.grenades);
  if (match.match.phase === 'buy') hud.showBuy(player.money, player.owned, buyItem);
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.match.phase === 'menu') {
    match.startMatch();
    hud.hideOverlay();
    return;
  }
  if (match.match.phase === 'roundEnd') {
    hud.hideOverlay();
    match.nextRound();
    return;
  }
  if (match.match.phase === 'matchEnd') {
    hud.hideOverlay();
    player.resetMatch();
    weapon.resetToPistol();
    match.startMatch();
    return;
  }
  input.requestLock();
});
hud.onBuyClose(() => {
  closeBuy();
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    if (buyOpen) closeBuy();
  } else if (match.match.phase === 'live' && player.alive) {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  const body = player.mover.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const body = player.mover.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryClick();
    hud.setReloadHint('Press R to reload');
    return false;
  }
  hud.setReloadHint('');
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = weapon.def.range;
  const allTargets = shootables.concat(hitMeshes);
  const hit = raycaster.intersectObjects(allTargets, false)[0];
  const muzzle = tmpV.copy(camera.position).addScaledVector(direction, 0.6);
  if (hit) {
    const end = tmpW.copy(hit.point);
    effects.tracer(muzzle.clone(), end.clone(), 'amber');
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const part = hit.object.userData.part;
      const damage = Math.round(weapon.def.damage * (part === 'head' ? weapon.def.headMult : 1));
      const wasAlive = bot.alive;
      bots.damageBot(bot, damage, 'You');
      hud.hitMarker(!bot.alive, shot ? 4000 : 90);
      audio.hit(!bot.alive);
      if (wasAlive && !bot.alive) hud.setKills(player.kills);
    } else {
      const normal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
      effects.impact(hit.point, normal);
    }
  } else {
    const end = tmpW.copy(camera.position).addScaledVector(direction, weapon.def.range);
    effects.tracer(muzzle.clone(), end.clone(), 'amber');
  }
  weapon.pullTrigger();
  audio.shot(weapon.index, 0);
  player.mover.recoil(weapon.def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hear(player.position, 30);
  hud.setAmmo(weapon.mag, weapon.reserve, weapon.def.name);
  return true;
}

function throwGrenade() {
  if (player.grenades <= 0 || match.match.phase !== 'live') return;
  player.grenades -= 1;
  hud.setGrenades(player.grenades);
  audio.grenadePin();
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.4 }),
  );
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 4.2, 0)),
    fuse: GRENADE.fuse,
  });
}

function explodeGrenade(g) {
  scene.remove(g.mesh);
  const pos = g.mesh.position.clone();
  effects.explosion(pos, GRENADE.radius);
  audio.explosion();
  const damageAt = (targetPos) => {
    const d = targetPos.distanceTo(pos);
    if (d > GRENADE.radius) return 0;
    return Math.round(GRENADE.damage * (1 - d / GRENADE.radius * 0.75));
  };
  if (player.alive) {
    const dmg = damageAt(tmpV.copy(player.position).setY(player.position.y + 1));
    if (dmg > 0) {
      const died = player.damage(dmg);
      audio.hurt();
      if (died) hud.feed('Frag grenade', 'You', 'amber');
    }
  }
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const dmg = damageAt(tmpV.copy(bot.mover.body.position).setY(bot.mover.body.position.y + 1));
    if (dmg > 0) bots.damageBot(bot, dmg, 'You');
  }
  bots.hear(pos, 40);
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y *= -0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function step(dt) {
  elapsed += dt;
  const phase = match.match.phase;
  const keys = input.state.keys;

  // Buy-phase shortcuts work without pointer lock.
  if (phase === 'buy') {
    if (input.pressed('KeyB')) { if (buyOpen) { closeBuy(); input.requestLock(); } else openBuy(); }
    if (buyOpen) {
      if (input.pressed('Digit1')) buyItem('pistol');
      if (input.pressed('Digit2')) buyItem('smg');
      if (input.pressed('Digit3')) buyItem('rifle');
      if (input.pressed('Digit4')) buyItem('dmr');
      if (input.pressed('Digit5')) buyItem('grenade');
    }
  }
  if (phase === 'live' && player.alive) {
    const look = input.takeLook();
    player.mover.look(look.x, look.y);
    const firing = input.state.firing && (weapon.def.auto || !prevFiring);
    prevFiring = input.state.firing;
    if (firing && weapon.ready()) shoot(shot ? 0 : weapon.spread(player.mover.groundSpeed()));
    if (input.pressed('KeyR') && weapon.reload()) audio.reload();
    if (input.pressed('KeyG')) throwGrenade();
    for (let i = 0; i < 4; i += 1) {
      if (input.pressed(`Digit${i + 1}`) && player.owned.includes(WEAPONS[i].id)) {
        weapon.switchTo(i);
        hud.setAmmo(weapon.mag, weapon.reserve, weapon.def.name);
      }
    }
    // Defuse: hold E beside the planted charge.
    if (bombState.status === 'planted' && bombState.position) {
      const d = Math.hypot(player.position.x - bombState.position.x, player.position.z - bombState.position.z);
      if (d < 2.5 && keys.has('KeyE')) {
        defuseProgress += dt;
        hud.setHint(`<b>Defusing… ${Math.ceil(DEFUSE_SECONDS - defuseProgress)}s</b> — hold E`);
        if (Math.floor(defuseProgress * 2) !== Math.floor((defuseProgress - dt) * 2)) audio.plantBeep(false);
        if (defuseProgress >= 4) {
          defuseProgress = 0;
          world.bombGroup.visible = false;
          bombState.status = 'none';
          bombState.position = null;
          hud.setHint('');
          match.defuse();
        }
      } else {
        if (d < 2.5) hud.setHint('Hold <b>E</b> to defuse the charge');
        else hud.setHint('');
        defuseProgress = 0;
      }
    } else {
      hud.setHint('');
    }
  } else {
    prevFiring = input.state.firing;
  }

  // Movement runs in buy and live; the round clock runs in the match.
  if ((phase === 'buy' || phase === 'live') && player.alive) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.mover.body.yaw);
    const cos = Math.cos(player.mover.body.yaw);
    const wishX = -sin * forward + cos * strafe;
    const wishZ = -cos * forward - sin * strafe;
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    player.mover.step(dt, wishX, wishZ, keys.has('Space'), crouch);
    // Footsteps, timed by distance.
    const speed = player.mover.groundSpeed();
    if (speed > 1 && player.mover.body.onGround) {
      player.stepTimer -= dt * speed;
      if (player.stepTimer <= 0) {
        player.stepTimer = 2.4;
        audio.step(speed > 4);
      }
    }
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
  }

  weapon.step(dt);
  effects.step(dt);
  stepGrenades(dt);
  if (phase === 'live') bots.step(dt, botCtx());

  const m = match.match;
  match.tick(dt, {
    amberAlive: (player.alive ? 1 : 0) + bots.aliveCount('amber'),
    rustAlive: bots.aliveCount('rust'),
  });

  // HUD, every frame from the one state.
  hud.setHealth(player.health);
  hud.setAmmo(weapon.mag, weapon.reserve, weapon.def.name);
  hud.setMoney(player.money);
  hud.setKills(player.kills);
  hud.setGrenades(player.grenades);
  hud.setScore(m.score.amber, m.score.rust, m.round);
  hud.setPips((player.alive ? 1 : 0) + bots.aliveCount('amber'), bots.aliveCount('rust'));
  if (m.phase === 'buy') hud.setTimer(m.timer, 'buy');
  else if (m.phase === 'live') hud.setTimer(m.bomb.status === 'planted' ? m.bomb.fuse : m.timer, 'live');
  hud.setBombStatus(
    m.bomb.status === 'planted' ? `⚠ CHARGE PLANTED — SITE ${m.bomb.site.id} — ${Math.ceil(m.bomb.fuse)}s` : '',
  );
  hud.setCrosshairSpread(weapon.spread(player.mover.groundSpeed()));
  if (weapon.mag === 0 && !weapon.reloading) hud.setReloadHint('Press R to reload');
  else if (weapon.reloading) hud.setReloadHint('Reloading…');
  else hud.setReloadHint('');
  syncCamera();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function stageCombatShot() {
  // A mid-round firefight: two raiders ahead on the platform approach, one teammate
  // beside the player, a tracer in the air and a hit already landed.
  const rust = bots.list.filter((b) => b.team === 'rust');
  const amber = bots.list.filter((b) => b.team === 'amber');
  player.mover.body.position.set(0, 0, 8);
  player.mover.body.yaw = 0;
  player.mover.body.pitch = 0.01;
  rust[0].mover.body.position.set(-3.5, 0.9, -4);
  rust[0].mover.body.yaw = Math.PI;
  rust[1].mover.body.position.set(4.5, 0, -9);
  rust[1].mover.body.yaw = Math.PI;
  amber[0].mover.body.position.set(-3, 0, 11);
  amber[0].mover.body.yaw = 0;
  for (const bot of bots.list) {
    bot.mesh.group.position.copy(bot.mover.body.position);
    bot.mesh.group.rotation.y = bot.mover.body.yaw;
  }
  settle(10);
  // Player fires twice at the raider on the platform; both headshots land.
  // Re-aim before each shot: the raider keeps moving while the round is live.
  const aimHead = (bot) => {
    const target = new THREE.Vector3().copy(bot.mover.body.position);
    target.y += 1.58;
    aimAt(target);
  };
  aimHead(rust[0]);
  shoot(0);
  settle(6);
  aimHead(rust[0]);
  shoot(0);
  settle(4);
  hud.setAmmo(weapon.mag, weapon.reserve, weapon.def.name);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  buyOpen = false;
  // Test hook for the capture driver: lets a probe read the staged state.
  window.__amber = { player, bots, match };
  match.startMatch();
  player.resetMatch();
  player.money = 3250;
  weapon.resetToPistol();
  if (name === 'start') {
    player.mover.body.position.set(0, 0, 24);
    player.mover.body.yaw = 0.12;
    player.mover.body.pitch = 0.02;
    settle(20);
    hud.showOverlay('start');
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS, 'buy');
  } else if (name === 'play') {
    match.match.phase = 'live';
    match.match.timer = 72;
    match.match.score.amber = 1;
    match.match.score.rust = 0;
    match.match.round = 2;
    weapon.buy('rifle');
    player.owned = ['pistol', 'smg', 'rifle'];
    player.money = 2450;
    stageCombatShot();
    hud.setScore(1, 0, 2);
    hud.setTimer(72, 'live');
  } else if (name === 'buy') {
    player.mover.body.position.set(0, 0, 24);
    player.mover.body.yaw = 0.1;
    settle(20);
    hud.showBuy(player.money, player.owned, () => {});
    hud.setScore(0, 0, 1);
    hud.setTimer(BUY_SECONDS, 'buy');
  } else {
    // end: round over, one raider down on the platform, the round card up.
    match.match.phase = 'roundEnd';
    match.match.score.amber = 2;
    match.match.score.rust = 1;
    match.match.round = 3;
    const rust = bots.list.filter((b) => b.team === 'rust');
    rust[0].alive = false;
    rust[0].fallTimer = 1;
    rust[0].mesh.group.rotation.x = -Math.PI / 2;
    rust[0].mesh.group.position.set(1.5, 0.15, -3);
    player.mover.body.position.set(0, 0, 6);
    player.mover.body.yaw = 0;
    player.mover.body.pitch = -0.02;
    settle(10);
    hud.showOverlay('roundEnd', 'Amber takes the round', 'Rust team eliminated — Amber 2 : 1 Rust');
    hud.setScore(2, 1, 3);
  }
  hud.setHealth(player.health);
  hud.setMoney(player.money);
  hud.setKills(player.kills);
  hud.setGrenades(player.grenades);
  hud.setPips((player.alive ? 1 : 0) + bots.aliveCount('amber'), bots.aliveCount('rust'));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setHealth(100);
hud.setAmmo(weapon.mag, weapon.reserve, weapon.def.name);
hud.setMoney(player.money);
hud.setPips(3, 5);
// Debug hook for local play-testing (?debug=1): exposes the live state.
if (params.get('debug')) window.__amber = { player, bots, match };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
