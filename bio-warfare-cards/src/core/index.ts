export { createGame, startTurn, initializeFirstTurn } from './rules/createGame';
export {
  playCard,
  resolveTarget,
  canPlayCard,
  enterCombatPhase,
  attackUnit,
  endTurn,
  getValidAttacks,
  cleanupDeadUnits,
} from './rules/ruleEngine';
export { resolveContagionPhase, previewSpreadTargets } from './contagion/contagionResolver';
export { pickAIMove, runAITurn, executeAIMove } from './ai/aiController';
export { getCard, getAllCards, getDeckForFaction } from './data/cardRegistry';
export * from './models/types';
