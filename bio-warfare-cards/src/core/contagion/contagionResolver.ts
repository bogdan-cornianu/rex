import { createRng, zoneForSlot, type GameState, type PlayerId } from '../models/types';
import { getCard } from '../data/cardRegistry';

const DEFAULT_STRAIN = 'strain-alpha';
const CARRIER_SPREAD_CHANCE = 0.5;

function log(state: GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > 100) state.log.shift();
}

function getAdjacentSlots(slot: number): number[] {
  const slots: number[] = [];
  if (slot > 0) slots.push(slot - 1);
  if (slot < 4) slots.push(slot + 1);
  return slots;
}

function canReceiveSpread(
  unit: NonNullable<GameState['players']['player']['board'][number]>,
): boolean {
  return (
    unit.contagion !== 'immune' &&
    unit.quarantineTurns === 0 &&
    unit.contagion !== 'infected'
  );
}

function exposeUnit(state: GameState, unit: NonNullable<GameState['players']['player']['board'][number]>): void {
  unit.contagion = 'exposed';
  unit.infectionTimer = 2;
  log(state, `${getCard(unit.cardId).name} became exposed.`);
}

function infectUnit(
  state: GameState,
  unit: NonNullable<GameState['players']['player']['board'][number]>,
  strainId: string,
): void {
  unit.contagion = 'infected';
  unit.strainId = strainId;
  unit.infectionTimer = undefined;
  log(state, `${getCard(unit.cardId).name} became infected.`);
}

function resolveExposureTimers(state: GameState): void {
  for (const pid of ['player', 'opponent'] as const) {
    for (const unit of state.players[pid].board) {
      if (!unit || unit.contagion !== 'exposed' || unit.infectionTimer === undefined) continue;
      unit.infectionTimer -= 1;
      if (unit.infectionTimer <= 0) {
        infectUnit(state, unit, unit.strainId ?? DEFAULT_STRAIN);
      }
    }
  }
}

function resolveAdjacencySpread(state: GameState): void {
  const rng = createRng(state.seed + state.turnNumber * 997);
  const spreadEvents: {
    fromOwner: PlayerId;
    fromSlot: number;
    strainId: string;
    multiplier: number;
    isCarrier: boolean;
  }[] = [];

  for (const pid of ['player', 'opponent'] as const) {
    state.players[pid].board.forEach((unit, slot) => {
      if (!unit || unit.quarantineTurns > 0) return;
      if (unit.contagion === 'infected') {
        spreadEvents.push({
          fromOwner: pid,
          fromSlot: slot,
          strainId: unit.strainId ?? DEFAULT_STRAIN,
          multiplier: unit.spreadMultiplier,
          isCarrier: false,
        });
      } else if (unit.contagion === 'carrier') {
        spreadEvents.push({
          fromOwner: pid,
          fromSlot: slot,
          strainId: unit.strainId ?? DEFAULT_STRAIN,
          multiplier: 1,
          isCarrier: true,
        });
      }
    });
  }

  for (const event of spreadEvents) {
    const attempts = event.multiplier;
    for (let a = 0; a < attempts; a++) {
      if (event.isCarrier && rng() > CARRIER_SPREAD_CHANCE) continue;

      const adjacent = getAdjacentSlots(event.fromSlot);
      const targets: { owner: PlayerId; slot: number }[] = [];

      for (const adjSlot of adjacent) {
        for (const pid of ['player', 'opponent'] as const) {
          const unit = state.players[pid].board[adjSlot];
          if (unit && canReceiveSpread(unit)) {
            targets.push({ owner: pid, slot: adjSlot });
          }
        }
      }

      if (targets.length === 0) continue;
      const pick = targets[Math.floor(rng() * targets.length)];
      const target = state.players[pick.owner].board[pick.slot]!;
      exposeUnit(state, target);
      target.strainId = event.strainId;
    }
  }
}

function resolveZoneEffects(state: GameState): void {
  for (const pid of ['player', 'opponent'] as const) {
    const player = state.players[pid];
    player.board.forEach((unit, slot) => {
      if (!unit || unit.quarantineTurns > 0 || unit.contagion === 'immune') return;
      const zone = zoneForSlot(slot);
      const outbreak = player.zoneOutbreak[zone];
      if (outbreak >= 2 && unit.contagion === 'clean') {
        exposeUnit(state, unit);
        unit.infectionTimer = 1;
        log(state, `Zone outbreak exposed ${getCard(unit.cardId).name}.`);
      }
    });
  }
}

export function resolveContagionPhase(state: GameState): GameState {
  const next = structuredClone(state);
  next.log.push('— Contagion phase —');
  resolveExposureTimers(next);
  resolveAdjacencySpread(next);
  resolveZoneEffects(next);
  return next;
}

export function previewSpreadTargets(state: GameState): string[] {
  const previews: string[] = [];
  for (const pid of ['player', 'opponent'] as const) {
    state.players[pid].board.forEach((unit, slot) => {
      if (unit?.contagion === 'infected' || unit?.contagion === 'carrier') {
        previews.push(`${pid}:${slot}:${unit.contagion}`);
      }
    });
  }
  return previews;
}

export { canReceiveSpread, exposeUnit, infectUnit, getAdjacentSlots };
