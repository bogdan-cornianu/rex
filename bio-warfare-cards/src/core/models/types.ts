export type ContagionState = 'clean' | 'exposed' | 'infected' | 'carrier' | 'immune';
export type Faction = 'vector' | 'containment';
export type PlayerId = 'player' | 'opponent';
export type CardType = 'unit' | 'operation';
export type GamePhase = 'main' | 'combat' | 'targeting' | 'game_over';
export type ZoneIndex = 0 | 1 | 2;

export type CardKeyword =
  | 'carrier'
  | 'infectedOnDeploy'
  | 'doubleSpread'
  | 'onDeployExposeAdjacent'
  | 'onDeployDecontaminateAdjacent'
  | 'immuneOnDeploy';

export type OperationEffect =
  | { type: 'damageStability'; amount: number; target: 'enemy' }
  | { type: 'damageUnit'; amount: number }
  | { type: 'damageAllEnemies'; amount: number }
  | { type: 'healStability'; amount: number }
  | { type: 'drawCards'; amount: number }
  | { type: 'quarantine'; turns: number; target: 'unit' | 'allFriendly' }
  | { type: 'vaccinateAllFriendly'; turns: number }
  | { type: 'decontaminate'; target: 'unit' | 'allExposedFriendly' }
  | { type: 'exposeTarget' }
  | { type: 'zoneOutbreak'; amount: number; zones?: ZoneIndex[] }
  | { type: 'buffUnit'; attack: number; resilience: number }
  | { type: 'infectAllExposedEnemies' };

export interface CardDefinition {
  id: string;
  name: string;
  faction: Faction;
  cost: number;
  type: CardType;
  attack?: number;
  resilience?: number;
  keywords?: CardKeyword[];
  description: string;
  operation?: OperationEffect;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
}

export interface BoardUnit {
  instanceId: string;
  cardId: string;
  owner: PlayerId;
  slot: number;
  attack: number;
  resilience: number;
  maxResilience: number;
  contagion: ContagionState;
  strainId?: string;
  infectionTimer?: number;
  quarantineTurns: number;
  immuneStrainId?: string;
  canAttack: boolean;
  spreadMultiplier: number;
}

export interface PlayerState {
  id: PlayerId;
  faction: Faction;
  stability: number;
  funding: number;
  maxFunding: number;
  hand: CardInstance[];
  deck: CardInstance[];
  board: (BoardUnit | null)[];
  zoneOutbreak: [number, number, number];
}

export interface TargetRequest {
  effect: OperationEffect;
  cardInstanceId: string;
  validSlots: number[];
  targetOwner: PlayerId;
}

export interface GameState {
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  turnNumber: number;
  phase: GamePhase;
  log: string[];
  winner: PlayerId | null;
  pendingTarget: TargetRequest | null;
  seed: number;
}

export const BOARD_SIZE = 5;
export const STARTING_STABILITY = 30;
export const MAX_FUNDING = 10;
export const MAX_HAND_SIZE = 10;
export const DEFAULT_STRAIN = 'strain-alpha';

export function zoneForSlot(slot: number): ZoneIndex {
  if (slot <= 1) return 0;
  if (slot === 2) return 1;
  return 2;
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 'player' ? 'opponent' : 'player';
}

export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}
