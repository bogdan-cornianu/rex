export const COLORS = {
  bg: 0x1a1f1a,
  panel: 0x2a332a,
  border: 0x3d4f3d,
  text: 0xd4ddd4,
  textDim: 0x8a968a,
  vector: 0x6b8f3c,
  containment: 0x4a7c8c,
  funding: 0xc4a035,
  stability: 0x8b4513,
  clean: 0x7a8a7a,
  exposed: 0xc4a035,
  infected: 0x8b0000,
  carrier: 0x556b2f,
  immune: 0x4682b4,
  cardBg: 0x2d3a2d,
  cardBorder: 0x4a5a4a,
  highlight: 0xaacc44,
  danger: 0xcc3333,
};

export const CONTAGION_COLORS: Record<string, number> = {
  clean: COLORS.clean,
  exposed: COLORS.exposed,
  infected: COLORS.infected,
  carrier: COLORS.carrier,
  immune: COLORS.immune,
};
