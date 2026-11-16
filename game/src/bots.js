// The bots: two Amber defenders beside the player, five Rust raiders against them.
// Each bot walks the waypoint graph, holds a position when defending, follows routes
// when attacking, and reacts to what it sees and hears: gunfire pulls nearby bots to
// investigate, a visible enemy starts a strafe-and-burst firefight, and the carrier
// plants the charge when its site is clear. Bot fire is resolved per shot with a hit
// chance that falls with distance and movement, so stopping to aim pays — for them too.
import * as THREE from 'three';
import { createMover, createBotMesh } from './actors.js';

const NAMES = {
  amber: ['Vera', 'Moss'],
  rust: ['Rook', 'Fang', 'Hale', 'Ivo', 'Sable'],
};
const HOLD_SPOTS = { amber: [12, 13, 19, 9, 11], rust: [12, 13] };
const THINK_EVERY = 0.15;
const ENGAGE_RANGE = 48;
const BOT_DAMAGE = 24;
const BOT_SKILL = 0.34;

function bfs(adjacency, from, to) {
  if (from === to) return [to];
  const prev = new Array(adjacency.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const node = queue.shift();
    for (const next of adjacency[node]) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === to) {
        const path = [to];
        let cur = to;
        while (cur !== from) { cur = prev[cur]; path.unshift(cur); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function createBots(scene, world, hooks) {
  const { random } = hooks;
  const bots = [];

  function nearestNode(x, z, y) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < world.nodes.length; i += 1) {
      const n = world.nodes[i];
      const d = (n.x - x) ** 2 + (n.z - z) ** 2 + Math.abs(n.y - y) * 4;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function makeBot(team, index, spawn) {
    const mover = createMover(world.colliders, spawn, true);
    const mesh = createBotMesh(scene, team);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      mover,
      mesh,
      health: 100,
      alive: true,
      state: 'patrol',
      role: team === 'rust' ? 'attack' : 'defend',
      hasBomb: false,
      path: [],
      pathIndex: 0,
      targetNode: -1,
      enemy: null, // { kind: 'player' | 'bot', ref, pos: Vector3 }
      lastSeen: new THREE.Vector3(),
      thinkTimer: random() * THINK_EVERY,
      burstLeft: 0,
      burstTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      channel: 0, // plant/defuse progress in seconds
      channelKind: null,
      holdTimer: 8 + random() * 10,
      investigateUntil: 0,
      investigateNode: -1,
      fallTimer: 0,
      deadTimer: 0,
      damagedTimer: 0,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (const bot of bots) {
      const spawns = world.spawns[bot.team];
      const index = bot.team === 'amber' ? bots.filter((b) => b.team === 'amber').indexOf(bot) : bots.filter((b) => b.team === 'rust').indexOf(bot);
      const spawn = spawns[index % spawns.length];
      bot.mover.body.position.copy(spawn);
      bot.mover.body.velocity.set(0, 0, 0);
      bot.mover.body.yaw = bot.team === 'amber' ? 0 : Math.PI; // Amber faces north, Rust south.
      bot.health = 100;
      bot.alive = true;
      bot.state = 'patrol';
      bot.hasBomb = false;
      bot.path = [];
      bot.pathIndex = 0;
      bot.targetNode = -1;
      bot.enemy = null;
      bot.channel = 0;
      bot.channelKind = null;
      bot.holdTimer = 8 + random() * 10;
      bot.investigateUntil = 0;
      bot.mesh.group.visible = true;
      bot.mesh.group.rotation.set(0, bot.mover.body.yaw, 0);
      bot.mesh.group.position.copy(spawn);
    }
    // One raider carries the charge each round.
    const rust = bots.filter((b) => b.team === 'rust');
    const carrier = rust[Math.floor(random() * rust.length)];
    carrier.hasBomb = true;
    carrier.role = 'carrier';
    for (const bot of rust) {
      if (bot !== carrier) bot.role = 'attack';
    }
  }

  for (let i = 0; i < 2; i += 1) makeBot('amber', i, world.spawns.amber[i]);
  for (let i = 0; i < 5; i += 1) makeBot('rust', i, world.spawns.rust[i]);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function setPath(bot, targetNode) {
    const from = nearestNode(bot.mover.body.position.x, bot.mover.body.position.z, bot.mover.body.position.y);
    bot.path = bfs(world.adjacency, from, targetNode);
    bot.pathIndex = 0;
    bot.targetNode = targetNode;
  }

  function visibleEnemy(bot, ctx) {
    const self = bot.mover.body.position;
    let best = null;
    let bestD = Infinity;
    const consider = (pos, kind, ref, extra) => {
      tmpA.copy(pos);
      tmpA.y += 1.3;
      const d = tmpA.distanceTo(tmpB.copy(self).setY(self.y + 1.4));
      if (d > ENGAGE_RANGE || d >= bestD) return;
      // A bot only notices what is roughly in front of it, unless it is close or hurt.
      tmpB.copy(tmpA).sub(self);
      const facing = new THREE.Vector3(-Math.sin(bot.mover.body.yaw), 0, -Math.cos(bot.mover.body.yaw));
      const dot = tmpB.normalize().dot(facing);
      if (d > 7 && dot < 0.25 && bot.damagedTimer <= 0 && !extra) return;
      if (!ctx.los(tmpB.copy(self).setY(self.y + 1.4), tmpA)) return;
      best = { kind, ref, pos: tmpA.clone(), dist: d };
      bestD = d;
    };
    if (ctx.player.alive) consider(ctx.player.position, 'player', null, false);
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      tmpB.copy(other.mover.body.position);
      consider(tmpB, 'bot', other, false);
    }
    return best;
  }

  function fireAt(bot, ctx, targetPos) {
    const self = bot.mover.body.position;
    tmpA.copy(targetPos);
    const muzzle = tmpB.copy(self).setY(self.y + 1.35);
    // Tracer from the bot's gun toward the target with a little spread.
    const spread = 0.35 + targetPos.distanceTo(self) * 0.008;
    tmpA.x += (random() * 2 - 1) * spread;
    tmpA.y += (random() * 2 - 1) * spread * 0.6;
    tmpA.z += (random() * 2 - 1) * spread;
    ctx.tracer(muzzle.clone(), tmpA.clone(), bot.team);
    ctx.shotSound(self, 2);
    let chance = BOT_SKILL;
    const dist = targetPos.distanceTo(self);
    chance -= Math.max(0, dist - 15) * 0.004;
    if (bot.mover.groundSpeed() > 1.5) chance -= 0.08;
    if (ctx.player.alive && ctx.player.speed > 3) chance -= 0.08;
    if (ctx.player.crouching) chance -= 0.07;
    if (random() > Math.max(0.06, chance)) return;
    const head = random() < 0.08;
    const falloff = dist > 30 ? 0.7 : 1;
    const damage = Math.round(BOT_DAMAGE * (head ? 2 : 1) * falloff);
    if (bot.enemy.kind === 'player') {
      ctx.damagePlayer(damage, bot);
    } else if (bot.enemy.ref) {
      ctx.damageBot(bot.enemy.ref, damage, bot);
    }
  }

  function damageBot(bot, amount, attacker) {
    if (!bot.alive) return;
    bot.health -= amount;
    bot.damagedTimer = 2;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.fallTimer = 0;
      bot.deadTimer = 0;
      bot.channel = 0;
      bot.channelKind = null;
      if (bot.hasBomb) {
        bot.hasBomb = false;
        hooks.onBombDropped(bot.mover.body.position.clone());
      }
      hooks.onKill(attacker, bot);
    }
  }

  function stepBot(bot, dt, ctx) {
    if (!bot.alive) {
      bot.deadTimer += dt;
      if (bot.fallTimer < 1) {
        bot.fallTimer = Math.min(1, bot.fallTimer + dt / 0.4);
        bot.mesh.group.rotation.x = -Math.PI / 2 * bot.fallTimer;
        bot.mesh.group.position.y = bot.mover.body.position.y + 0.15 * bot.fallTimer;
      }
      return;
    }
    bot.damagedTimer = Math.max(0, bot.damagedTimer - dt);
    bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = THINK_EVERY;
      const seen = visibleEnemy(bot, ctx);
      if (seen) {
        bot.enemy = seen;
        bot.lastSeen.copy(seen.pos);
      } else if (bot.enemy && bot.enemy.pos.distanceTo(bot.mover.body.position) > ENGAGE_RANGE * 1.2) {
        bot.enemy = null;
      }
    }

    const self = bot.mover.body.position;
    let wishX = 0;
    let wishZ = 0;
    let wantYaw = bot.mover.body.yaw;

    const distToBomb = ctx.bomb.position ? Math.hypot(self.x - ctx.bomb.position.x, self.z - ctx.bomb.position.z) : Infinity;

    if (bot.enemy) {
      // Fight: face the enemy, strafe, fire in bursts.
      bot.state = 'engage';
      bot.channel = 0;
      bot.channelKind = null;
      const target = bot.enemy.pos;
      wantYaw = Math.atan2(-(target.x - self.x), -(target.z - self.z));
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 0.7 + random() * 0.8;
        bot.strafeDir = random() < 0.5 ? -1 : 1;
      }
      const dist = Math.hypot(target.x - self.x, target.z - self.z);
      const strafeX = Math.cos(wantYaw) * bot.strafeDir;
      const strafeZ = -Math.sin(wantYaw) * bot.strafeDir;
      const approach = dist > 26 ? 1 : dist < 7 ? -0.6 : 0;
      wishX = strafeX * 0.7 + -Math.sin(wantYaw) * approach;
      wishZ = strafeZ * 0.7 + -Math.cos(wantYaw) * approach;
      bot.burstTimer -= dt;
      if (bot.burstTimer <= 0) {
        if (bot.burstLeft <= 0) {
          bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.burstTimer = 0.55 + random() * 0.5;
        } else {
          bot.burstLeft -= 1;
          bot.burstTimer = 0.13;
          const targetPos = bot.enemy.kind === 'player'
            ? tmpA.copy(ctx.player.position).setY(ctx.player.position.y + (ctx.player.crouching ? 0.9 : 1.3))
            : tmpA.copy(bot.enemy.ref.mover.body.position).setY(bot.enemy.ref.mover.body.position.y + 1.3);
          fireAt(bot, ctx, targetPos.clone());
        }
      }
    } else if (ctx.bomb.status === 'planted' && bot.team === 'amber') {
      // Get to the charge and cut the wire.
      bot.state = 'defuse';
      if (distToBomb < 2.2) {
        bot.channelKind = 'defuse';
        bot.channel += dt;
        wantYaw = Math.atan2(-(ctx.bomb.position.x - self.x), -(ctx.bomb.position.z - self.z));
        if (bot.channel >= 4) {
          bot.channel = 0;
          bot.channelKind = null;
          ctx.onDefused(bot);
        }
      } else {
        bot.channel = 0;
        bot.channelKind = null;
        const node = nearestNode(ctx.bomb.position.x, ctx.bomb.position.z, 0);
        if (bot.targetNode !== node) setPath(bot, node);
        const step = walkPath(bot, dt);
        wishX = step.x; wishZ = step.z;
        if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
      }
    } else if (bot.hasBomb && ctx.bomb.status === 'carried') {
      // Carry the charge to the nearest site and plant it.
      const site = nearestSite(self);
      const dSite = Math.hypot(self.x - site.center.x, self.z - site.center.z);
      if (dSite < site.radius) {
        bot.state = 'plant';
        bot.channelKind = 'plant';
        bot.channel += dt;
        if (Math.floor(bot.channel * 2) !== Math.floor((bot.channel - dt) * 2)) hooks.onPlantBeep();
        if (bot.channel >= 3) {
          bot.channel = 0;
          bot.channelKind = null;
          bot.hasBomb = false;
          ctx.onPlanted(site);
        }
      } else {
        bot.state = 'patrol';
        bot.channel = 0;
        bot.channelKind = null;
        const node = site.id === 'A' ? 12 : 13;
        if (bot.targetNode !== node) setPath(bot, node);
        const step = walkPath(bot, dt);
        wishX = step.x; wishZ = step.z;
        if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
      }
    } else if (ctx.bomb.status === 'dropped' && bot.team === 'rust') {
      // Pick the charge back up.
      bot.state = 'patrol';
      if (distToBomb < 1.6) {
        bot.hasBomb = true;
        ctx.onPickup(bot);
      } else {
        const node = nearestNode(ctx.bomb.position.x, ctx.bomb.position.z, 0);
        if (bot.targetNode !== node) setPath(bot, node);
        const step = walkPath(bot, dt);
        wishX = step.x; wishZ = step.z;
        if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
      }
    } else if (bot.investigateUntil > ctx.elapsed && bot.investigateNode >= 0) {
      // Something loud happened over there. Go look.
      bot.state = 'investigate';
      if (bot.targetNode !== bot.investigateNode) setPath(bot, bot.investigateNode);
      const step = walkPath(bot, dt);
      wishX = step.x; wishZ = step.z;
      if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
      if (!step.x && !step.z) bot.investigateUntil = 0;
    } else if (bot.role === 'defend' || bot.team === 'amber') {
      // Hold a spot, scan the lanes, rotate to a new one now and then.
      bot.state = 'hold';
      bot.holdTimer -= dt;
      if (bot.holdTimer <= 0 || bot.targetNode < 0) {
        bot.holdTimer = 12 + random() * 10;
        const spots = HOLD_SPOTS.amber;
        setPath(bot, spots[Math.floor(random() * spots.length)]);
      }
      const step = walkPath(bot, dt);
      wishX = step.x; wishZ = step.z;
      if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
      else wantYaw += Math.sin(ctx.elapsed * 0.4 + bot.id.charCodeAt(0)) * 0.002;
    } else {
      // Attackers push a site along the lanes.
      bot.state = 'patrol';
      if (bot.targetNode < 0) {
        const siteNode = (bot.id.charCodeAt(bot.id.length - 1) % 2 === 0) ? 12 : 13;
        setPath(bot, siteNode);
      }
      const step = walkPath(bot, dt);
      wishX = step.x; wishZ = step.z;
      if (step.x || step.z) wantYaw = Math.atan2(-step.x, -step.z);
    }

    // Turn toward the wanted yaw, then walk.
    let dyaw = wantYaw - bot.mover.body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.mover.body.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, dyaw));
    bot.mover.step(dt, wishX, wishZ, false, false);

    // Separation: bots do not stand inside each other.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = self.x - other.mover.body.position.x;
      const dz = self.z - other.mover.body.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.8) {
        self.x += (dx / d) * (0.8 - d) * 0.5;
        self.z += (dz / d) * (0.8 - d) * 0.5;
      }
    }

    // Sync the visible body.
    const bob = (wishX || wishZ) ? Math.abs(Math.sin(ctx.elapsed * 9 + bot.id.charCodeAt(0))) * 0.04 : 0;
    bot.mesh.group.position.set(self.x, self.y + bob, self.z);
    bot.mesh.group.rotation.y = bot.mover.body.yaw;
  }

  function walkPath(bot, dt) {
    const self = bot.mover.body.position;
    if (!bot.path.length || bot.pathIndex >= bot.path.length) return { x: 0, z: 0 };
    const node = world.nodes[bot.path[bot.pathIndex]];
    const dx = node.x - self.x;
    const dz = node.z - self.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      bot.pathIndex += 1;
      return walkPath(bot, dt);
    }
    return { x: dx / d, z: dz / d };
  }

  function nearestSite(pos) {
    let best = world.sites[0];
    let bestD = Infinity;
    for (const site of world.sites) {
      const d = Math.hypot(pos.x - site.center.x, pos.z - site.center.z);
      if (d < bestD) { bestD = d; best = site; }
    }
    return best;
  }

  return {
    list: bots,
    spawnAll,
    damageBot,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    hear(pos, radius) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.mover.body.position.x - pos.x, bot.mover.body.position.z - pos.z);
        if (d < radius && bot.state !== 'engage') {
          bot.investigateUntil = hooks.elapsedNow() + 6;
          bot.investigateNode = nearestNode(pos.x, pos.z, 0);
        }
      }
    },
    step(dt, ctx) {
      for (const bot of bots) stepBot(bot, dt, ctx);
    },
  };
}
