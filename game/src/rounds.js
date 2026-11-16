// The match: first to five rounds. A round is a buy phase, then live play, then a short
// end card. Rust wins a round by wiping Amber or by detonating the charge; Amber wins
// by wiping Rust, by running the clock out before a plant, or by cutting the wire.
// Money: kills pay, wins pay more than losses.
import { ECONOMY } from './weapons.js';

export const WIN_ROUNDS = 5;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const FUSE_SECONDS = 40;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 4;

export function createMatch(hooks) {
  const match = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { amber: 0, rust: 0 },
    timer: BUY_SECONDS,
    bomb: { status: 'none', site: null, position: null, fuse: 0 },
    winner: null,
  };

  function startMatch() {
    match.phase = 'buy';
    match.round = 1;
    match.score.amber = 0;
    match.score.rust = 0;
    match.timer = BUY_SECONDS;
    match.bomb = { status: 'none', site: null, position: null, fuse: 0 };
    match.winner = null;
    hooks.onPhase('buy');
  }

  function startRound() {
    match.phase = 'live';
    match.timer = ROUND_SECONDS;
    hooks.onPhase('live');
  }

  function endRound(winner, reason) {
    if (match.phase !== 'live') return;
    match.phase = 'roundEnd';
    match.timer = 5;
    match.score[winner] += 1;
    hooks.onMoney(winner === 'amber' ? ECONOMY.winReward : ECONOMY.lossReward, winner === 'amber' ? 'Round win' : 'Round loss');
    hooks.onRoundEnd(winner, reason, { ...match.score });
    if (match.score[winner] >= WIN_ROUNDS) {
      match.winner = winner;
    }
  }

  function nextRound() {
    if (match.winner) {
      match.phase = 'matchEnd';
      hooks.onMatchEnd(match.winner, { ...match.score });
      return;
    }
    match.round += 1;
    match.phase = 'buy';
    match.timer = BUY_SECONDS;
    match.bomb = { status: 'none', site: null, position: null, fuse: 0 };
    hooks.onPhase('buy');
  }

  function plant(site, position) {
    match.bomb = { status: 'planted', site, position: position.clone(), fuse: FUSE_SECONDS };
    hooks.onPlanted(site);
  }

  function defuse() {
    match.bomb = { status: 'none', site: null, position: null, fuse: 0 };
    hooks.onDefused();
    endRound('amber', 'Charge defused');
  }

  function tick(dt, ctx) {
    if (match.phase === 'buy') {
      match.timer -= dt;
      if (match.timer <= 0) startRound();
      return;
    }
    if (match.phase === 'roundEnd') {
      match.timer -= dt;
      if (match.timer <= 0) nextRound();
      return;
    }
    if (match.phase !== 'live') return;
    if (match.bomb.status === 'planted') {
      match.bomb.fuse -= dt;
      if (ctx.amberAlive === 0) { endRound('rust', 'Amber team eliminated'); return; }
      if (match.bomb.fuse <= 0) {
        match.bomb.fuse = 0;
        hooks.onExploded(match.bomb.position);
        match.bomb = { status: 'none', site: null, position: null, fuse: 0 };
        endRound('rust', 'Charge detonated');
      }
      return;
    }
    match.timer -= dt;
    if (ctx.amberAlive === 0) { endRound('rust', 'Amber team eliminated'); return; }
    if (ctx.rustAlive === 0) { endRound('amber', 'Rust team eliminated'); return; }
    if (match.timer <= 0) {
      match.timer = 0;
      endRound('amber', 'Time expired — no plant');
    }
  }

  return {
    match,
    startMatch,
    startRound,
    endRound,
    nextRound,
    plant,
    defuse,
    tick,
    onKill() { hooks.onMoney(ECONOMY.killReward, 'Elimination'); },
  };
}
