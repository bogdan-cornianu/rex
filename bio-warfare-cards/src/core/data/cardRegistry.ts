import cardsData from '../data/cards.json';
import type { CardDefinition } from '../models/types';

const cards = cardsData as CardDefinition[];

const byId = new Map<string, CardDefinition>();
for (const card of cards) {
  byId.set(card.id, card);
}

export function getCard(id: string): CardDefinition {
  const card = byId.get(id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}

export function getAllCards(): CardDefinition[] {
  return cards;
}

export function getDeckForFaction(faction: 'vector' | 'containment'): string[] {
  return cards.filter((c) => c.faction === faction).map((c) => c.id);
}

export function getCardByFaction(faction: 'vector' | 'containment'): CardDefinition[] {
  return cards.filter((c) => c.faction === faction);
}
