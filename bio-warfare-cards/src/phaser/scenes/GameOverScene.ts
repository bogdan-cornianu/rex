import Phaser from 'phaser';
import type { Faction, PlayerId } from '../../core/models/types';
import { COLORS } from '../constants/colors';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  create(data: { winner: PlayerId; playerFaction: Faction; turns: number }): void {
    const { width, height } = this.scale;
    const won = data.winner === 'player';

    this.add.rectangle(width / 2, height / 2, width, height, COLORS.bg);

    this.add
      .text(width / 2, 180, won ? 'OUTBREAK CONTAINED' : 'CONTAINMENT FAILED', {
        fontFamily: 'monospace',
        fontSize: '36px',
        color: won ? '#aacc44' : '#cc3333',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 260, won ? 'Theater stabilized. Simulation complete.' : 'Enemy stability collapsed. You have fallen.', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#8a968a',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 320, `Turns elapsed: ${data.turns}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6b7a6b',
      })
      .setOrigin(0.5);

    const rematch = this.add
      .text(width / 2, 420, '[ REMATCH ]', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#aacc44',
        backgroundColor: '#2a332a',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    rematch.on('pointerdown', () => {
      this.scene.start('BattleScene', { playerFaction: data.playerFaction, seed: Date.now() });
    });

    const menu = this.add
      .text(width / 2, 490, '[ MAIN MENU ]', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8a968a',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    menu.on('pointerdown', () => this.scene.start('MenuScene', { showWarning: false }));
  }
}
