import { getDeckForFaction } from '../data/cardRegistry';
import {
  BOARD_SIZE,
  MAX_FUNDING,
  STARTING_STABILITY,
  createRng,
  shuffle,
  type CardInstance,
  type Faction,
  type GameState,
  type PlayerId,
  type PlayerState,
} from '../models/types';

let instanceCounter = 0;

export function nextInstanceId(prefix: string): string {
  instanceCounter += 1;
  return `${prefix}-${instanceCounter}`;
}

export function resetInstanceCounter(): void {
  instanceCounter = 0;
}

function buildDeck(faction: Faction, rng: () => number): CardInstance[] {
  const cardIds = getDeckForFaction(faction);
  const deck: CardInstance[] = [];
  for (const cardId of cardIds) {
    deck.push({ instanceId: nextInstanceId(cardId), cardId });
    deck.push({ instanceId: nextInstanceId(cardId), cardId });
  }
  return shuffle(deck, rng);
}

function createPlayer(id: PlayerId, faction: Faction, rng: () => number): PlayerState {
  const deck = buildDeck(faction, rng);
  const hand = deck.splice(0, 3);
  return {
    id,
    faction,
    stability: STARTING_STABILITY,
    funding: 0,
    maxFunding: 0,
    hand,
    deck,
    board: Array.from({ length: BOARD_SIZE }, () => null),
    zoneOutbreak: [0, 0, 0],
  };
}

export interface CreateGameOptions {
  playerFaction: Faction;
  seed?: number;
}

export function createGame(options: CreateGameOptions): GameState {
  resetInstanceCounter();
  const seed = options.seed ?? Date.now();
  const rng = createRng(seed);
  const opponentFaction: Faction =
    options.playerFaction === 'vector' ? 'containment' : 'vector';

  return {
    players: {
      player: createPlayer('player', options.playerFaction, rng),
      opponent: createPlayer('opponent', opponentFaction, rng),
    },
    activePlayer: 'player',
    turnNumber: 1,
    phase: 'main',
    log: ['Match started. Vector Command vs Containment Directorate.'],
    winner: null,
    pendingTarget: null,
    seed,
  };
}

export function startTurn(state: GameState): GameState {
  const next = structuredClone(state);
  const player = next.players[next.activePlayer];
  player.maxFunding = Math.min(MAX_FUNDING, player.maxFunding + 1);
  player.funding = player.maxFunding;

  if (player.deck.length > 0 && player.hand.length < 10) {
    const drawn = player.deck.shift()!;
    player.hand.push(drawn);
    next.log.push(`${next.activePlayer} drew a card.`);
  }

  for (const unit of player.board) {
    if (unit) unit.canAttack = true;
  }

  next.phase = 'main';
  return next;
}

export function initializeFirstTurn(state: GameState): GameState {
  return startTurn(state);
}
