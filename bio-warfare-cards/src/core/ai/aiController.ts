import { getCard } from '../data/cardRegistry';
import {
  canPlayCard,
  attackUnit,
  endTurn,
  enterCombatPhase,
  playCard,
  resolveTarget,
  getValidAttacks,
} from '../rules/ruleEngine';
import { createRng, type GameState, type PlayerId } from '../models/types';

export interface AIMove {
  type: 'play' | 'attack' | 'endCombat' | 'endTurn' | 'target';
  cardInstanceId?: string;
  slot?: number;
  attackerSlot?: number;
  target?: 'hero' | number;
  score: number;
}

export interface AIConfig {
  difficulty: 'easy' | 'normal' | 'hard';
}

const DIFFICULTY_NOISE: Record<AIConfig['difficulty'], number> = {
  easy: 0.3,
  normal: 0.1,
  hard: 0,
};

function evaluateBoard(state: GameState, aiPlayer: PlayerId): number {
  const me = state.players[aiPlayer];
  const them = state.players[aiPlayer === 'player' ? 'opponent' : 'player'];

  let score = (them.stability - me.stability) * 2;
  score += me.funding * 0.5;

  for (const unit of me.board) {
    if (!unit) continue;
    score += unit.attack * 2 + unit.resilience;
    if (unit.contagion === 'infected') score += 3;
    if (unit.contagion === 'carrier') score += 1;
  }

  for (const unit of them.board) {
    if (!unit) continue;
    score -= unit.attack * 2 + unit.resilience * 0.5;
    if (unit.contagion === 'exposed') score += 2;
    if (unit.contagion === 'infected') score += 4;
  }

  return score;
}

function simulate(state: GameState, move: Omit<AIMove, 'score'>): GameState {
  switch (move.type) {
    case 'play':
      return playCard(state, state.activePlayer, move.cardInstanceId!, move.slot);
    case 'target':
      return resolveTarget(state, state.activePlayer, move.slot!);
    case 'attack':
      return attackUnit(state, state.activePlayer, move.attackerSlot!, move.target!);
    case 'endCombat':
      return enterCombatPhase(state);
    case 'endTurn':
      return endTurn(state);
    default:
      return state;
  }
}

export function generateAIMoves(state: GameState, aiPlayer: PlayerId): AIMove[] {
  if (state.activePlayer !== aiPlayer || state.winner) return [];

  const moves: AIMove[] = [];
  const player = state.players[aiPlayer];

  if (state.phase === 'main') {
    for (const card of player.hand) {
      if (!canPlayCard(state, aiPlayer, card.instanceId)) continue;
      const def = getCard(card.cardId);
      if (def.type === 'unit') {
        for (let slot = 0; slot < 5; slot++) {
          if (player.board[slot] === null) {
            moves.push({ type: 'play', cardInstanceId: card.instanceId, slot, score: 0 });
          }
        }
      } else {
        moves.push({ type: 'play', cardInstanceId: card.instanceId, score: 0 });
      }
    }
    moves.push({ type: 'endCombat', score: 0 });
  }

  if (state.phase === 'targeting' && state.pendingTarget) {
    for (const slot of state.pendingTarget.validSlots) {
      moves.push({ type: 'target', slot, score: 0 });
    }
  }

  if (state.phase === 'combat') {
    const attacks = getValidAttacks(state, aiPlayer);
    for (const atk of attacks) {
      if (atk.canAttackHero) {
        moves.push({ type: 'attack', attackerSlot: atk.slot, target: 'hero', score: 0 });
      }
      for (let slot = 0; slot < 5; slot++) {
        if (state.players[aiPlayer === 'player' ? 'opponent' : 'player'].board[slot]) {
          moves.push({ type: 'attack', attackerSlot: atk.slot, target: slot, score: 0 });
        }
      }
    }
    moves.push({ type: 'endTurn', score: 0 });
  }

  for (const move of moves) {
    const after = simulate(state, move);
    move.score = evaluateBoard(after, aiPlayer);
    if (move.type === 'attack' && move.target === 'hero') {
      const them = state.players[aiPlayer === 'player' ? 'opponent' : 'player'];
      if (them.stability <= (state.players[aiPlayer].board[move.attackerSlot!]?.attack ?? 0)) {
        move.score += 1000;
      }
    }
  }

  return moves;
}

export function pickAIMove(
  state: GameState,
  aiPlayer: PlayerId,
  config: AIConfig = { difficulty: 'normal' },
): Omit<AIMove, 'score'> | null {
  const moves = generateAIMoves(state, aiPlayer);
  if (moves.length === 0) return null;

  moves.sort((a, b) => b.score - a.score);
  const noise = DIFFICULTY_NOISE[config.difficulty];
  const rng = createRng(state.seed + state.turnNumber + moves.length);

  if (noise > 0 && rng() < noise && moves.length > 1) {
    const idx = 1 + Math.floor(rng() * Math.min(3, moves.length - 1));
    const pick = moves[Math.min(idx, moves.length - 1)];
    return { type: pick.type, cardInstanceId: pick.cardInstanceId, slot: pick.slot, attackerSlot: pick.attackerSlot, target: pick.target };
  }

  const best = moves[0];
  return { type: best.type, cardInstanceId: best.cardInstanceId, slot: best.slot, attackerSlot: best.attackerSlot, target: best.target };
}

export function executeAIMove(
  state: GameState,
  aiPlayer: PlayerId,
  config?: AIConfig,
): GameState {
  const move = pickAIMove(state, aiPlayer, config);
  if (!move) return state;
  return simulate(state, move);
}

export function runAITurn(
  state: GameState,
  aiPlayer: PlayerId,
  config?: AIConfig,
  maxSteps = 20,
): GameState {
  let current = state;
  let steps = 0;

  while (
    current.activePlayer === aiPlayer &&
    !current.winner &&
    steps < maxSteps
  ) {
    if (current.phase === 'main') {
      const move = pickAIMove(current, aiPlayer, config);
      if (!move || move.type === 'endCombat') {
        current = enterCombatPhase(current);
      } else {
        current = simulate(current, move);
      }
    } else if (current.phase === 'targeting') {
      const move = pickAIMove(current, aiPlayer, config);
      if (!move) break;
      current = simulate(current, move);
    } else if (current.phase === 'combat') {
      const move = pickAIMove(current, aiPlayer, config);
      if (!move || move.type === 'endTurn') {
        current = endTurn(current);
      } else {
        current = simulate(current, move);
      }
    } else {
      break;
    }
    steps += 1;
  }

  return current;
}
