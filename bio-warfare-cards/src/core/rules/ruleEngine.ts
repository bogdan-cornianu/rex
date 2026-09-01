import { getCard } from '../data/cardRegistry';
import { resolveContagionPhase } from '../contagion/contagionResolver';
import {
  BOARD_SIZE,
  DEFAULT_STRAIN,
  MAX_HAND_SIZE,
  STARTING_STABILITY,
  createRng,
  opponentOf,
  zoneForSlot,
  type BoardUnit,
  type GameState,
  type OperationEffect,
  type PlayerId,
  type TargetRequest,
} from '../models/types';
import { startTurn } from './createGame';

function log(state: GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > 100) state.log.shift();
}

function findEmptySlot(board: (BoardUnit | null)[]): number | null {
  const idx = board.findIndex((u) => u === null);
  return idx >= 0 ? idx : null;
}

function getAdjacentSlots(slot: number): number[] {
  const slots: number[] = [];
  if (slot > 0) slots.push(slot - 1);
  if (slot < BOARD_SIZE - 1) slots.push(slot + 1);
  return slots;
}

function createBoardUnit(
  cardId: string,
  owner: PlayerId,
  slot: number,
  instanceId: string,
): BoardUnit {
  const card = getCard(cardId);
  const unit: BoardUnit = {
    instanceId,
    cardId,
    owner,
    slot,
    attack: card.attack ?? 0,
    resilience: card.resilience ?? 0,
    maxResilience: card.resilience ?? 0,
    contagion: 'clean',
    quarantineTurns: 0,
    canAttack: false,
    spreadMultiplier: 1,
  };

  for (const kw of card.keywords ?? []) {
    if (kw === 'carrier') unit.contagion = 'carrier';
    if (kw === 'infectedOnDeploy') {
      unit.contagion = 'infected';
      unit.strainId = DEFAULT_STRAIN;
    }
    if (kw === 'doubleSpread') unit.spreadMultiplier = 2;
    if (kw === 'immuneOnDeploy') {
      unit.contagion = 'immune';
      unit.immuneStrainId = DEFAULT_STRAIN;
    }
  }

  return unit;
}

function applyZoneOnDeploy(state: GameState, owner: PlayerId, slot: number, unit: BoardUnit): void {
  const player = state.players[owner];
  const zone = zoneForSlot(slot);
  const outbreak = player.zoneOutbreak[zone];
  if (outbreak <= 0) return;
  if (unit.contagion === 'immune' || unit.quarantineTurns > 0) return;
  unit.contagion = 'exposed';
  unit.infectionTimer = Math.max(1, 3 - outbreak);
  log(state, `${getCard(unit.cardId).name} deployed into outbreak zone — exposed.`);
}

function applyOnDeployKeywords(state: GameState, owner: PlayerId, slot: number, unit: BoardUnit): void {
  const card = getCard(unit.cardId);
  const enemy = opponentOf(owner);
  const enemyBoard = state.players[enemy].board;
  const friendlyBoard = state.players[owner].board;

  if (card.keywords?.includes('onDeployExposeAdjacent')) {
    for (const adj of getAdjacentSlots(slot)) {
      const target = enemyBoard[adj];
      if (target && target.contagion !== 'immune' && target.quarantineTurns === 0) {
        target.contagion = 'exposed';
        target.infectionTimer = 2;
        log(state, `${card.name} exposed ${getCard(target.cardId).name}.`);
      }
    }
  }

  if (card.keywords?.includes('onDeployDecontaminateAdjacent')) {
    for (const adj of getAdjacentSlots(slot)) {
      const target = friendlyBoard[adj];
      if (target && (target.contagion === 'exposed' || target.contagion === 'infected')) {
        target.contagion = 'clean';
        target.infectionTimer = undefined;
        target.strainId = undefined;
        log(state, `${card.name} decontaminated ${getCard(target.cardId).name}.`);
      }
    }
  }
}

function removeFromHand(state: GameState, playerId: PlayerId, cardInstanceId: string): void {
  const hand = state.players[playerId].hand;
  const idx = hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (idx >= 0) hand.splice(idx, 1);
}

function needsTarget(effect: OperationEffect): boolean {
  return (
    effect.type === 'damageUnit' ||
    effect.type === 'quarantine' && effect.target === 'unit' ||
    effect.type === 'decontaminate' && effect.target === 'unit' ||
    effect.type === 'exposeTarget' ||
    effect.type === 'buffUnit'
  );
}

function buildTargetRequest(
  state: GameState,
  playerId: PlayerId,
  effect: OperationEffect,
  cardInstanceId: string,
): TargetRequest | null {
  const enemy = opponentOf(playerId);

  switch (effect.type) {
    case 'damageUnit':
    case 'exposeTarget':
      return {
        effect,
        cardInstanceId,
        targetOwner: enemy,
        validSlots: state.players[enemy].board
          .map((u, i) => (u ? i : -1))
          .filter((i) => i >= 0),
      };
    case 'quarantine':
      if (effect.target === 'unit') {
        return {
          effect,
          cardInstanceId,
          targetOwner: playerId,
          validSlots: state.players[playerId].board
            .map((u, i) => (u ? i : -1))
            .filter((i) => i >= 0),
        };
      }
      return null;
    case 'decontaminate':
      if (effect.target === 'unit') {
        return {
          effect,
          cardInstanceId,
          targetOwner: playerId,
          validSlots: state.players[playerId].board
            .map((u, i) => (u && (u.contagion === 'exposed' || u.contagion === 'infected') ? i : -1))
            .filter((i) => i >= 0),
        };
      }
      return null;
    case 'buffUnit':
      return {
        effect,
        cardInstanceId,
        targetOwner: playerId,
        validSlots: state.players[playerId].board
          .map((u, i) => (u ? i : -1))
          .filter((i) => i >= 0),
      };
    default:
      return null;
  }
}

function applyOperationEffect(
  state: GameState,
  playerId: PlayerId,
  effect: OperationEffect,
  targetSlot?: number,
): void {
  const player = state.players[playerId];
  const enemy = state.players[opponentOf(playerId)];

  switch (effect.type) {
    case 'damageStability':
      enemy.stability -= effect.amount;
      log(state, `${playerId} dealt ${effect.amount} stability damage.`);
      break;
    case 'healStability':
      player.stability = Math.min(STARTING_STABILITY + 10, player.stability + effect.amount);
      log(state, `${playerId} restored ${effect.amount} stability.`);
      break;
    case 'drawCards':
      for (let i = 0; i < effect.amount; i++) {
        if (player.deck.length > 0 && player.hand.length < MAX_HAND_SIZE) {
          player.hand.push(player.deck.shift()!);
        }
      }
      log(state, `${playerId} drew ${effect.amount} card(s).`);
      break;
    case 'damageAllEnemies':
      for (const unit of enemy.board) {
        if (unit) unit.resilience -= effect.amount;
      }
      log(state, `${playerId} damaged all enemy units for ${effect.amount}.`);
      break;
    case 'damageUnit': {
      const unit = enemy.board[targetSlot!];
      if (unit) {
        unit.resilience -= effect.amount;
        log(state, `${playerId} dealt ${effect.amount} damage to ${getCard(unit.cardId).name}.`);
      }
      break;
    }
    case 'quarantine':
      if (effect.target === 'allFriendly') {
        for (const unit of player.board) {
          if (unit) unit.quarantineTurns = Math.max(unit.quarantineTurns, effect.turns);
        }
        log(state, `${playerId} quarantined all friendly units for ${effect.turns} turn(s).`);
      } else {
        const unit = player.board[targetSlot!];
        if (unit) {
          unit.quarantineTurns = effect.turns;
          log(state, `${getCard(unit.cardId).name} quarantined for ${effect.turns} turn(s).`);
        }
      }
      break;
    case 'vaccinateAllFriendly':
      for (const unit of player.board) {
        if (unit) {
          unit.contagion = 'immune';
          unit.immuneStrainId = DEFAULT_STRAIN;
        }
      }
      log(state, `${playerId} vaccinated all friendly units.`);
      break;
    case 'decontaminate':
      if (effect.target === 'allExposedFriendly') {
        for (const unit of player.board) {
          if (unit && unit.contagion === 'exposed') {
            unit.contagion = 'clean';
            unit.infectionTimer = undefined;
          }
        }
        log(state, `${playerId} cleansed all exposed friendly units.`);
      } else {
        const unit = player.board[targetSlot!];
        if (unit) {
          if (unit.contagion === 'infected') unit.contagion = 'carrier';
          else unit.contagion = 'clean';
          unit.infectionTimer = undefined;
          log(state, `${getCard(unit.cardId).name} decontaminated.`);
        }
      }
      break;
    case 'exposeTarget': {
      const unit = enemy.board[targetSlot!];
      if (unit && unit.contagion !== 'immune' && unit.quarantineTurns === 0) {
        unit.contagion = 'exposed';
        unit.infectionTimer = 2;
        log(state, `${getCard(unit.cardId).name} exposed.`);
      }
      break;
    }
    case 'zoneOutbreak': {
      const zones = effect.zones ?? [0, 1, 2];
      for (const z of zones) {
        player.zoneOutbreak[z] += effect.amount;
      }
      log(state, `${playerId} increased zone outbreak levels.`);
      break;
    }
    case 'buffUnit': {
      const unit = player.board[targetSlot!];
      if (unit) {
        unit.attack += effect.attack;
        unit.resilience += effect.resilience;
        unit.maxResilience += effect.resilience;
        log(state, `${getCard(unit.cardId).name} buffed +${effect.attack}/+${effect.resilience}.`);
      }
      break;
    }
    case 'infectAllExposedEnemies':
      for (const unit of enemy.board) {
        if (unit && unit.contagion === 'exposed') {
          unit.contagion = 'infected';
          unit.strainId = DEFAULT_STRAIN;
        }
      }
      log(state, `${playerId} infected all exposed enemies.`);
      break;
  }
}

export function playCard(
  state: GameState,
  playerId: PlayerId,
  cardInstanceId: string,
  slot?: number,
): GameState {
  if (state.phase !== 'main' || state.activePlayer !== playerId || state.winner) {
    return state;
  }

  const next = structuredClone(state);
  const player = next.players[playerId];
  const cardInst = player.hand.find((c) => c.instanceId === cardInstanceId);
  if (!cardInst) return state;

  const card = getCard(cardInst.cardId);
  if (player.funding < card.cost) return state;

  player.funding -= card.cost;
  removeFromHand(next, playerId, cardInstanceId);

  if (card.type === 'unit') {
    const targetSlot = slot ?? findEmptySlot(player.board);
    if (targetSlot === null) {
      player.funding += card.cost;
      player.hand.push(cardInst);
      return state;
    }

    const unit = createBoardUnit(card.id, playerId, targetSlot, cardInst.instanceId);
    player.board[targetSlot] = unit;
    applyZoneOnDeploy(next, playerId, targetSlot, unit);
    applyOnDeployKeywords(next, playerId, targetSlot, unit);
    log(next, `${playerId} deployed ${card.name}.`);
  } else if (card.operation) {
    if (needsTarget(card.operation)) {
      const request = buildTargetRequest(next, playerId, card.operation, cardInstanceId);
      if (!request || request.validSlots.length === 0) {
        log(next, `${card.name} fizzled — no valid targets.`);
      } else if (slot !== undefined && request.validSlots.includes(slot)) {
        applyOperationEffect(next, playerId, card.operation, slot);
      } else {
        next.pendingTarget = request;
        next.phase = 'targeting';
        log(next, `${card.name} awaiting target.`);
        return next;
      }
    } else {
      applyOperationEffect(next, playerId, card.operation);
    }
    log(next, `${playerId} executed ${card.name}.`);
  }

  checkWin(next);
  cleanupDeadUnits(next);
  return next;
}

export function resolveTarget(state: GameState, playerId: PlayerId, slot: number): GameState {
  if (state.phase !== 'targeting' || !state.pendingTarget || state.activePlayer !== playerId) {
    return state;
  }

  const next = structuredClone(state);
  const request = next.pendingTarget!;
  if (!request.validSlots.includes(slot)) return state;

  applyOperationEffect(next, playerId, request.effect, slot);
  next.pendingTarget = null;
  next.phase = 'main';
  log(next, `${playerId} selected target slot ${slot}.`);

  checkWin(next);
  cleanupDeadUnits(next);
  return next;
}

export function canPlayCard(state: GameState, playerId: PlayerId, cardInstanceId: string): boolean {
  if (state.phase !== 'main' || state.activePlayer !== playerId || state.winner) return false;
  const player = state.players[playerId];
  const cardInst = player.hand.find((c) => c.instanceId === cardInstanceId);
  if (!cardInst) return false;
  const card = getCard(cardInst.cardId);
  if (player.funding < card.cost) return false;
  if (card.type === 'unit' && findEmptySlot(player.board) === null) return false;
  return true;
}

export function enterCombatPhase(state: GameState): GameState {
  if (state.phase !== 'main' || state.winner) return state;
  const next = structuredClone(state);
  next.phase = 'combat';
  next.log.push(`${next.activePlayer} enters combat phase.`);
  return next;
}

export function attackUnit(
  state: GameState,
  playerId: PlayerId,
  attackerSlot: number,
  target: 'hero' | number,
): GameState {
  if (state.phase !== 'combat' || state.activePlayer !== playerId || state.winner) {
    return state;
  }

  const next = structuredClone(state);
  const player = next.players[playerId];
  const enemy = next.players[opponentOf(playerId)];
  const attacker = player.board[attackerSlot];
  if (!attacker || !attacker.canAttack || attacker.attack <= 0) return state;

  if (target === 'hero') {
    enemy.stability -= attacker.attack;
    log(next, `${getCard(attacker.cardId).name} hit enemy stability for ${attacker.attack}.`);
  } else {
    const defender = enemy.board[target];
    if (!defender) return state;
    defender.resilience -= attacker.attack;
    if (defender.attack > 0) {
      attacker.resilience -= defender.attack;
    }
    log(
      next,
      `${getCard(attacker.cardId).name} fought ${getCard(defender.cardId).name} (${attacker.attack}/${defender.attack}).`,
    );
  }

  attacker.canAttack = false;
  checkWin(next);
  cleanupDeadUnits(next);
  return next;
}

export function cleanupDeadUnits(state: GameState): void {
  for (const pid of ['player', 'opponent'] as const) {
    const board = state.players[pid].board;
    for (let i = 0; i < board.length; i++) {
      const unit = board[i];
      if (unit && unit.resilience <= 0) {
        handleUnitDeath(state, pid, i, unit);
        board[i] = null;
      }
    }
  }
}

function handleUnitDeath(state: GameState, _owner: PlayerId, slot: number, unit: BoardUnit): void {
  log(state, `${getCard(unit.cardId).name} was eliminated.`);
  if (unit.contagion !== 'infected') return;

  const candidates: { owner: PlayerId; slot: number }[] = [];
  for (const pid of ['player', 'opponent'] as const) {
    for (const adj of getAdjacentSlots(slot)) {
      const target = state.players[pid].board[adj];
      if (
        target &&
        target.contagion !== 'immune' &&
        target.quarantineTurns === 0 &&
        target.contagion !== 'infected'
      ) {
        candidates.push({ owner: pid, slot: adj });
      }
    }
  }

  if (candidates.length === 0) return;
  const rng = createRng(state.seed + state.turnNumber + slot);
  const pick = candidates[Math.floor(rng() * candidates.length)];
  const target = state.players[pick.owner].board[pick.slot]!;
  target.contagion = 'exposed';
  target.infectionTimer = 2;
  log(state, `Death burst exposed ${getCard(target.cardId).name}.`);
}

function checkWin(state: GameState): void {
  if (state.players.player.stability <= 0) {
    state.winner = 'opponent';
    state.phase = 'game_over';
    state.log.push('Containment failed — opponent wins.');
  } else if (state.players.opponent.stability <= 0) {
    state.winner = 'player';
    state.phase = 'game_over';
    state.log.push('Outbreak contained — you win.');
  }
}

export function endTurn(state: GameState): GameState {
  if (state.winner || state.phase === 'game_over') return state;
  if (state.phase !== 'main' && state.phase !== 'combat') return state;

  let next = structuredClone(state);
  next.log.push(`${next.activePlayer} ends turn.`);

  next = resolveContagionPhase(next);

  tickQuarantine(next);
  next.activePlayer = opponentOf(next.activePlayer);
  next.turnNumber += 1;

  next = startTurn(next);
  checkWin(next);
  return next;
}

function tickQuarantine(state: GameState): void {
  for (const pid of ['player', 'opponent'] as const) {
    for (const unit of state.players[pid].board) {
      if (unit && unit.quarantineTurns > 0) unit.quarantineTurns -= 1;
    }
    for (let z = 0; z < 3; z++) {
      if (state.players[pid].zoneOutbreak[z as 0 | 1 | 2] > 0) {
        state.players[pid].zoneOutbreak[z as 0 | 1 | 2] -= 1;
      }
    }
  }
}

export function getValidAttacks(state: GameState, playerId: PlayerId): { slot: number; canAttackHero: boolean }[] {
  if (state.phase !== 'combat' || state.activePlayer !== playerId) return [];
  const enemy = state.players[opponentOf(playerId)];
  const hasTaunt = false;
  const enemyHasUnits = enemy.board.some((u) => u !== null);

  const results: { slot: number; canAttackHero: boolean }[] = [];

  for (let slot = 0; slot < state.players[playerId].board.length; slot++) {
    const unit = state.players[playerId].board[slot];
    if (!unit || !unit.canAttack || unit.attack <= 0) continue;
    results.push({ slot, canAttackHero: !enemyHasUnits || !hasTaunt });
  }

  return results;
}
