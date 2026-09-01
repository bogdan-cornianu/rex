import Phaser from 'phaser';
import type { Faction } from '../../core/models/types';
import { COLORS } from '../constants/colors';

export class MenuScene extends Phaser.Scene {
  private selectedFaction: Faction = 'vector';

  constructor() {
    super('MenuScene');
  }

  init(data: { showWarning?: boolean }): void {
    if (data.showWarning) {
      this.showContentWarning();
    }
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, COLORS.bg);

    this.add
      .text(width / 2, 80, 'STRAIN', {
        fontFamily: 'monospace',
        fontSize: '64px',
        color: '#8a968a',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 140, 'Biological Warfare Simulation', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#6b7a6b',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 200, 'Select Your Command', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#d4ddd4',
      })
      .setOrigin(0.5);

    this.createFactionButton(width / 2 - 180, 300, 'vector', 'Vector Command', 'Offense — contagion snowball');
    this.createFactionButton(width / 2 + 180, 300, 'containment', 'Containment Directorate', 'Defense — quarantine & cleanse');

    const startBtn = this.add
      .text(width / 2, 480, '[ DEPLOY ]', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#aacc44',
        backgroundColor: '#2a332a',
        padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    startBtn.on('pointerover', () => startBtn.setColor('#ccff66'));
    startBtn.on('pointerout', () => startBtn.setColor('#aacc44'));
    startBtn.on('pointerdown', () => {
      this.scene.start('BattleScene', {
        playerFaction: this.selectedFaction,
        seed: Date.now(),
      });
    });

    this.add
      .text(width / 2, height - 40, 'v0.1 MVP — Single player vs AI', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#4a5a4a',
      })
      .setOrigin(0.5);
  }

  private createFactionButton(
    x: number,
    y: number,
    faction: Faction,
    title: string,
    subtitle: string,
  ): void {
    const color = faction === 'vector' ? COLORS.vector : COLORS.containment;
    const box = this.add
      .rectangle(x, y, 280, 140, COLORS.panel)
      .setStrokeStyle(3, this.selectedFaction === faction ? COLORS.highlight : COLORS.border)
      .setInteractive({ useHandCursor: true });

    const titleText = this.add
      .text(x, y - 30, title, { fontFamily: 'monospace', fontSize: '16px', color: '#d4ddd4', wordWrap: { width: 250 } })
      .setOrigin(0.5);

    this.add
      .text(x, y + 10, subtitle, { fontFamily: 'monospace', fontSize: '12px', color: '#8a968a', wordWrap: { width: 250 } })
      .setOrigin(0.5);

    box.on('pointerdown', () => {
      this.selectedFaction = faction;
      this.scene.restart({ showWarning: false });
    });

    box.on('pointerover', () => box.setStrokeStyle(3, color));
    box.on('pointerout', () =>
      box.setStrokeStyle(3, this.selectedFaction === faction ? COLORS.highlight : COLORS.border),
    );

    if (this.selectedFaction === faction) {
      this.add.circle(x + 120, y - 50, 8, COLORS.highlight);
    }

    void titleText;
  }

  private showContentWarning(): void {
    const { width, height } = this.scale;
    const warningObjects: Phaser.GameObjects.GameObject[] = [];

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85).setDepth(100);
    warningObjects.push(overlay);

    const panel = this.add.rectangle(width / 2, height / 2, 600, 320, COLORS.panel).setDepth(101);
    panel.setStrokeStyle(2, COLORS.danger);
    warningObjects.push(panel);

    warningObjects.push(
      this.add
        .text(width / 2, height / 2 - 100, 'CONTENT WARNING', {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#cc3333',
        })
        .setOrigin(0.5)
        .setDepth(102),
    );

    warningObjects.push(
      this.add
        .text(
          width / 2,
          height / 2 - 20,
          'This simulation depicts biological warfare,\ndisease outbreaks, and strategic conflict.\n\nCasualties are abstracted as stability metrics.\nProceed only if you are comfortable with\nthis mature subject matter.',
          {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#d4ddd4',
            align: 'center',
          },
        )
        .setOrigin(0.5)
        .setDepth(102),
    );

    const ack = this.add
      .text(width / 2, height / 2 + 110, '[ I UNDERSTAND ]', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#aacc44',
      })
      .setOrigin(0.5)
      .setDepth(102)
      .setInteractive({ useHandCursor: true });
    warningObjects.push(ack);

    ack.on('pointerdown', () => {
      localStorage.setItem('strain-content-warning-seen', '1');
      warningObjects.forEach((obj) => obj.destroy());
    });
  }
}
