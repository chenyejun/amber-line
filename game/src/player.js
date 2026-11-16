// The player: a mover with a body, health, money and grenades. Bots shoot the player by
// probability, not by ray, so the player needs no visible mesh — but the mover is the
// same one the bots walk with, so walls, steps and gravity treat everyone alike.
import { createMover } from './actors.js';
import { ECONOMY } from './weapons.js';

export function createPlayer(colliders, spawn) {
  const mover = createMover(colliders, spawn, false);
  const player = {
    mover,
    health: 100,
    alive: true,
    money: ECONOMY.startMoney,
    kills: 0,
    grenades: 0,
    owned: ['pistol'],
    hurtTimer: 0,
    stepTimer: 0,
    get body() { return mover.body; },
    get position() { return mover.body.position; },
    reset(spawnPoint) {
      mover.body.position.copy(spawnPoint);
      mover.body.velocity.set(0, 0, 0);
      mover.body.yaw = 0; // Amber spawns south, facing north up the yard.
      mover.body.pitch = 0;
      player.health = 100;
      player.alive = true;
      player.hurtTimer = 0;
    },
    resetMatch() {
      player.money = ECONOMY.startMoney;
      player.kills = 0;
      player.grenades = 0;
      player.owned = ['pistol'];
    },
    damage(amount) {
      if (!player.alive) return false;
      player.health -= amount;
      player.hurtTimer = 0.35;
      if (player.health <= 0) {
        player.health = 0;
        player.alive = false;
        return true;
      }
      return false;
    },
    heal() { player.health = 100; },
  };
  return player;
}
