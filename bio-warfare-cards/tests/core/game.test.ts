import { describe, it, expect } from 'vitest';
import { createGame, initializeFirstTurn, playCard, endTurn, attackUnit, enterCombatPhase, getCard } from '../../src/core/index';
import { resolveContagionPhase, exposeUnit, infectUnit } from '../../src/core/contagion/contagionResolver';
import type { BoardUnit, GameState } from '../../src/core/models/types';

describe('createGame', () => {
  it('creates a valid initial state', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 42 }));
    expect(state.players.player.hand.length).toBeGreaterThan(0);
    expect(state.players.opponent.hand.length).toBe(3);
    expect(state.players.player.funding).toBe(1);
    expect(state.winner).toBeNull();
  });
});

describe('playCard', () => {
  it('deploys a unit when slot is available', () => {
    let state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 100 }));
    const card = state.players.player.hand.find((c) => {
      const def = getCard(c.cardId);
      return def.type === 'unit' && def.cost <= state.players.player.funding;
    });
    expect(card).toBeDefined();
    state = playCard(state, 'player', card!.instanceId, 0);
    expect(state.players.player.board[0]).not.toBeNull();
  });
});

describe('contagionResolver', () => {
  function makeUnit(overrides: Partial<BoardUnit> = {}): BoardUnit {
    return {
      instanceId: 'u1',
      cardId: 'field_operative',
      owner: 'player',
      slot: 1,
      attack: 2,
      resilience: 2,
      maxResilience: 2,
      contagion: 'clean',
      quarantineTurns: 0,
      canAttack: false,
      spreadMultiplier: 1,
      ...overrides,
    };
  }

  it('exposes adjacent units from infected source', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 7 }));
    state.players.player.board[1] = makeUnit({ slot: 1, contagion: 'infected', strainId: 'strain-alpha' });
    state.players.player.board[2] = makeUnit({ slot: 2, owner: 'player', cardId: 'cdc_analyst' });

    const after = resolveContagionPhase(state);
    const exposed = after.players.player.board[2];
    expect(exposed?.contagion).toBe('exposed');
  });

  it('does not spread to immune units', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 8 }));
    state.players.player.board[1] = makeUnit({ slot: 1, contagion: 'infected', strainId: 'strain-alpha' });
    state.players.player.board[2] = makeUnit({ slot: 2, contagion: 'immune', immuneStrainId: 'strain-alpha' });

    const after = resolveContagionPhase(state);
    expect(after.players.player.board[2]?.contagion).toBe('immune');
  });

  it('advances exposed timer to infected', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 9 }));
    const unit = makeUnit({ contagion: 'exposed', infectionTimer: 1 });
    state.players.player.board[0] = unit;

    const after = resolveContagionPhase(state);
    expect(after.players.player.board[0]?.contagion).toBe('infected');
  });

  it('respects quarantine blocking spread', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 10 }));
    state.players.player.board[1] = makeUnit({ slot: 1, contagion: 'infected', strainId: 'strain-alpha' });
    state.players.player.board[2] = makeUnit({ slot: 2, quarantineTurns: 2 });

    const after = resolveContagionPhase(state);
    expect(after.players.player.board[2]?.contagion).toBe('clean');
  });
});

describe('combat', () => {
  it('reduces stability on hero attack', () => {
    let state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 11 }));
    state.players.player.board[0] = {
      instanceId: 'atk',
      cardId: 'field_operative',
      owner: 'player',
      slot: 0,
      attack: 3,
      resilience: 1,
      maxResilience: 1,
      contagion: 'clean',
      quarantineTurns: 0,
      canAttack: true,
      spreadMultiplier: 1,
    };
    state = enterCombatPhase(state);
    const before = state.players.opponent.stability;
    state = attackUnit(state, 'player', 0, 'hero');
    expect(state.players.opponent.stability).toBe(before - 3);
  });
});

describe('endTurn', () => {
  it('switches active player', () => {
    let state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 12 }));
    expect(state.activePlayer).toBe('player');
    state = endTurn(state);
    expect(state.activePlayer).toBe('opponent');
    expect(state.turnNumber).toBe(2);
  });
});

describe('contagion helpers', () => {
  it('expose and infect mutate unit state', () => {
    const state = initializeFirstTurn(createGame({ playerFaction: 'vector', seed: 13 })) as GameState;
    const unit = {
      instanceId: 'x',
      cardId: 'field_operative',
      owner: 'player' as const,
      slot: 0,
      attack: 1,
      resilience: 1,
      maxResilience: 1,
      contagion: 'clean' as const,
      quarantineTurns: 0,
      canAttack: false,
      spreadMultiplier: 1,
    };
    state.players.player.board[0] = unit;
    exposeUnit(state, unit);
    expect(unit.contagion).toBe('exposed');
    infectUnit(state, unit, 'strain-alpha');
    expect(unit.contagion).toBe('infected');
  });
});
