import Phaser from 'phaser';
import {
  createGame,
  initializeFirstTurn,
  playCard,
  resolveTarget,
  enterCombatPhase,
  attackUnit,
  endTurn,
  canPlayCard,
  runAITurn,
  getCard,
  type GameState,
  type Faction,
  type PlayerId,
} from '../../core/index';
import { COLORS, CONTAGION_COLORS } from '../constants/colors';

const SLOT_W = 100;
const SLOT_H = 130;
const CARD_W = 90;
const CARD_H = 120;

interface BattleData {
  playerFaction: Faction;
  seed: number;
}

export class BattleScene extends Phaser.Scene {
  private gameState!: GameState;
  private playerFaction!: Faction;
  private selectedCardId: string | null = null;
  private selectedAttacker: number | null = null;
  private logText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private boardGraphics: Phaser.GameObjects.Graphics[] = [];
  private handContainers: Phaser.GameObjects.Container[] = [];
  private dynamicTexts: Phaser.GameObjects.Text[] = [];
  private spreadLines!: Phaser.GameObjects.Graphics;
  private aiRunning = false;

  constructor() {
    super('BattleScene');
  }

  init(data: BattleData): void {
    this.playerFaction = data.playerFaction;
    this.gameState = initializeFirstTurn(createGame({ playerFaction: data.playerFaction, seed: data.seed }));
    this.selectedCardId = null;
    this.selectedAttacker = null;
    this.aiRunning = false;
  }

  create(): void {
    this.spreadLines = this.add.graphics().setDepth(50);
    this.buildStaticUI();
    this.refreshUI();

    if (this.gameState.activePlayer === 'opponent') {
      this.scheduleAITurn();
    }
  }

  private buildStaticUI(): void {
    const { width } = this.scale;
    this.add.rectangle(width / 2, 360, width, 720, COLORS.bg);

    // Opponent stability
    this.add.text(40, 20, 'ENEMY STABILITY', { fontFamily: 'monospace', fontSize: '12px', color: '#8a968a' });
    // Player stability
    this.add.text(40, 620, 'YOUR STABILITY', { fontFamily: 'monospace', fontSize: '12px', color: '#8a968a' });

    this.statusText = this.add.text(width / 2, 12, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#d4ddd4',
    }).setOrigin(0.5, 0);

    this.logText = this.add.text(920, 80, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#8a968a',
      wordWrap: { width: 340 },
      maxLines: 28,
    });

    this.createButton(width - 140, 660, 'END TURN', () => this.onEndTurn());
    this.createButton(width - 140, 600, 'COMBAT', () => this.onEnterCombat());
    this.createButton(width - 140, 540, 'END COMBAT', () => this.onEndTurn());
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#aacc44',
        backgroundColor: '#2a332a',
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#ccff66'));
    btn.on('pointerout', () => btn.setColor('#aacc44'));
    btn.on('pointerdown', onClick);
    return btn;
  }

  private refreshUI(): void {
    this.boardGraphics.forEach((g) => g.destroy());
    this.boardGraphics = [];
    this.handContainers.forEach((c) => c.destroy());
    this.handContainers = [];
    this.dynamicTexts.forEach((t) => t.destroy());
    this.dynamicTexts = [];
    this.spreadLines.clear();

    this.renderBoard('opponent', 140);
    this.renderBoard('player', 400);
    this.renderHand();
    this.renderHeroBars();
    this.renderSpreadPreview();
    this.updateStatusAndLog();

    if (this.gameState.winner) {
      this.time.delayedCall(800, () => {
        this.scene.start('GameOverScene', {
          winner: this.gameState.winner,
          playerFaction: this.playerFaction,
          turns: this.gameState.turnNumber,
        });
      });
    }
  }

  private renderHeroBars(): void {
    const player = this.gameState.players.player;
    const opponent = this.gameState.players.opponent;

    this.drawBar(40, 40, 200, 16, opponent.stability, 30, COLORS.danger);
    this.drawBar(40, 640, 200, 16, player.stability, 30, COLORS.containment);

    this.addDynamicText({ x: 250, y: 38, text: `${opponent.stability}`, fontFamily: 'monospace', fontSize: '14px', color: '#d4ddd4' });
    this.addDynamicText({ x: 250, y: 638, text: `${player.stability}`, fontFamily: 'monospace', fontSize: '14px', color: '#d4ddd4' });
    this.addDynamicText({ x: 260, y: 38, text: `Funding: ${opponent.funding}/${opponent.maxFunding}`, fontFamily: 'monospace', fontSize: '11px', color: '#8a968a' });
    this.addDynamicText({ x: 260, y: 638, text: `Funding: ${player.funding}/${player.maxFunding}`, fontFamily: 'monospace', fontSize: '11px', color: '#8a968a' });
  }

  private drawBar(x: number, y: number, w: number, h: number, value: number, max: number, color: number): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel);
    g.fillRect(x, y, w, h);
    g.fillStyle(color);
    g.fillRect(x, y, w * Math.max(0, value / max), h);
    this.boardGraphics.push(g);
  }

  private addDynamicText(config: {
    x: number;
    y: number;
    text: string;
    fontFamily: string;
    fontSize: string;
    color: string;
    origin?: number;
  }): Phaser.GameObjects.Text {
    const t = this.add.text(config.x, config.y, config.text, {
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      color: config.color,
    });
    if (config.origin !== undefined) t.setOrigin(config.origin);
    this.dynamicTexts.push(t);
    return t;
  }

  private boardStartX(): number {
    return (1280 - BOARD_SLOTS * (SLOT_W + 12)) / 2;
  }

  private renderBoard(owner: PlayerId, y: number): void {
    const board = this.gameState.players[owner].board;
    const startX = this.boardStartX();

    for (let i = 0; i < board.length; i++) {
      const x = startX + i * (SLOT_W + 12);
      const g = this.add.graphics();
      g.lineStyle(2, COLORS.border);
      g.fillStyle(COLORS.panel, 0.6);
      g.fillRect(x, y, SLOT_W, SLOT_H);
      g.strokeRect(x, y, SLOT_W, SLOT_H);
      this.boardGraphics.push(g);

      const unit = board[i];
      if (unit) {
        const contagionColor = CONTAGION_COLORS[unit.contagion] ?? COLORS.clean;
        g.fillStyle(contagionColor, 0.35);
        g.fillRect(x + 4, y + 4, SLOT_W - 8, SLOT_H - 8);

        const card = getCard(unit.cardId);
        this.add
          .text(x + SLOT_W / 2, y + 20, card.name.slice(0, 14), {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#d4ddd4',
            align: 'center',
            wordWrap: { width: SLOT_W - 8 },
          })
          .setOrigin(0.5, 0);

        this.add
          .text(x + SLOT_W / 2, y + SLOT_H - 30, `${unit.attack}/${unit.resilience}`, {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#ffffff',
          })
          .setOrigin(0.5);

        this.add
          .text(x + SLOT_W / 2, y + SLOT_H - 12, unit.contagion.toUpperCase(), {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: '#cccccc',
          })
          .setOrigin(0.5);

        if (unit.quarantineTurns > 0) {
          g.lineStyle(2, COLORS.immune);
          g.strokeRect(x + 2, y + 2, SLOT_W - 4, SLOT_H - 4);
        }

        if (owner === 'player' && this.gameState.phase === 'combat' && unit.canAttack && this.gameState.activePlayer === 'player') {
          const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0x000000, 0);
          hit.setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => {
            this.selectedAttacker = i;
            this.refreshUI();
          });
          if (this.selectedAttacker === i) {
            g.lineStyle(3, COLORS.highlight);
            g.strokeRect(x, y, SLOT_W, SLOT_H);
          }
        }

        if (
          (this.gameState.phase === 'main' || this.gameState.phase === 'targeting') &&
          this.gameState.activePlayer === 'player' &&
          this.selectedCardId &&
          board[i] === null &&
          owner === 'player'
        ) {
          const cardInst = this.gameState.players.player.hand.find((c) => c.instanceId === this.selectedCardId);
          if (cardInst) {
            const def = getCard(cardInst.cardId);
            if (def.type === 'unit') {
              const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0xaacc44, 0.15);
              hit.setInteractive({ useHandCursor: true });
              hit.on('pointerdown', () => this.onPlayCard(this.selectedCardId!, i));
            }
          }
        }

        if (this.canTargetSlot(owner, i)) {
          const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0xcc3333, 0.2);
          hit.setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => this.onTargetSlot(i, owner));
        }

        if (
          this.gameState.phase === 'combat' &&
          this.gameState.activePlayer === 'player' &&
          owner === 'opponent' &&
          this.selectedAttacker !== null
        ) {
          const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0xcc3333, 0.25);
          hit.setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => this.onAttack(this.selectedAttacker!, i));
        }
      } else if (
        owner === 'player' &&
        (this.gameState.phase === 'main' || this.gameState.phase === 'targeting') &&
        this.gameState.activePlayer === 'player' &&
        this.selectedCardId
      ) {
        const cardInst = this.gameState.players.player.hand.find((c) => c.instanceId === this.selectedCardId);
        if (cardInst && getCard(cardInst.cardId).type === 'unit') {
          const hit = this.add.rectangle(x + SLOT_W / 2, y + SLOT_H / 2, SLOT_W, SLOT_H, 0xaacc44, 0.1);
          hit.setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => this.onPlayCard(this.selectedCardId!, i));
        }
      }
    }

    // Hero attack target
    if (
      this.gameState.phase === 'combat' &&
      this.gameState.activePlayer === 'player' &&
      this.selectedAttacker !== null &&
      owner === 'opponent'
    ) {
      const hx = startX - 60;
      const hit = this.add.rectangle(hx, y + SLOT_H / 2, 50, SLOT_H, 0xcc3333, 0.3);
      hit.setInteractive({ useHandCursor: true });
      this.add.text(hx, y + SLOT_H / 2, 'HQ', { fontFamily: 'monospace', fontSize: '12px', color: '#fff' }).setOrigin(0.5);
      hit.on('pointerdown', () => this.onAttack(this.selectedAttacker!, 'hero'));
    }
  }

  private canTargetSlot(owner: PlayerId, slot: number): boolean {
    if (this.gameState.phase !== 'targeting' || this.gameState.activePlayer !== 'player') return false;
    const req = this.gameState.pendingTarget;
    if (!req) return false;
    return req.targetOwner === owner && req.validSlots.includes(slot);
  }

  private renderHand(): void {
    if (this.gameState.activePlayer !== 'player') return;
    const hand = this.gameState.players.player.hand;
    const startX = (1280 - hand.length * (CARD_W + 8)) / 2;
    const y = 555;

    hand.forEach((cardInst, idx) => {
      const def = getCard(cardInst.cardId);
      const x = startX + idx * (CARD_W + 8);
      const container = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, COLORS.cardBg).setStrokeStyle(2, COLORS.cardBorder);
      const selected = this.selectedCardId === cardInst.instanceId;
      if (selected) bg.setStrokeStyle(3, COLORS.highlight);

      const name = this.add.text(0, -CARD_H / 2 + 10, def.name, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#d4ddd4',
        wordWrap: { width: CARD_W - 8 },
        align: 'center',
      }).setOrigin(0.5, 0);

      const cost = this.add.text(-CARD_W / 2 + 8, -CARD_H / 2 + 8, `${def.cost}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#c4a035',
      });

      const stats = def.type === 'unit'
        ? this.add.text(0, CARD_H / 2 - 20, `${def.attack}/${def.resilience}`, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#fff',
          }).setOrigin(0.5)
        : this.add.text(0, 10, 'OP', { fontFamily: 'monospace', fontSize: '12px', color: '#8a968a' }).setOrigin(0.5);

      container.add([bg, name, cost, stats]);
      container.setSize(CARD_W, CARD_H);
      bg.setInteractive({ useHandCursor: true });

      const playable = canPlayCard(this.gameState, 'player', cardInst.instanceId);
      if (!playable) bg.setAlpha(0.5);

      bg.on('pointerdown', () => {
        if (!playable && this.gameState.phase === 'main') return;
        if (this.selectedCardId === cardInst.instanceId) {
          if (def.type === 'operation' && !needsTargetManual(def)) {
            this.onPlayCard(cardInst.instanceId);
          } else {
            this.selectedCardId = null;
          }
        } else {
          this.selectedCardId = cardInst.instanceId;
          if (def.type === 'operation' && !needsTargetManual(def)) {
            this.onPlayCard(cardInst.instanceId);
          }
        }
        this.refreshUI();
      });

      this.handContainers.push(container);
    });
  }

  private renderSpreadPreview(): void {
    const startX = this.boardStartX();
    const infected: { owner: PlayerId; slot: number; y: number }[] = [];

    for (const owner of ['opponent', 'player'] as const) {
      const y = owner === 'opponent' ? 140 : 400;
      this.gameState.players[owner].board.forEach((unit, slot) => {
        if (unit && (unit.contagion === 'infected' || unit.contagion === 'carrier')) {
          infected.push({ owner, slot, y });
        }
      });
    }

    this.spreadLines.lineStyle(2, COLORS.infected, 0.4);
    for (const src of infected) {
      const sx = startX + src.slot * (SLOT_W + 12) + SLOT_W / 2;
      const sy = src.y + SLOT_H / 2;
      for (const adj of [src.slot - 1, src.slot + 1]) {
        if (adj < 0 || adj > 4) continue;
        const tx = startX + adj * (SLOT_W + 12) + SLOT_W / 2;
        this.spreadLines.lineBetween(sx, sy, tx, sy + (src.owner === 'opponent' ? 260 : -260));
      }
    }
  }

  private updateStatusAndLog(): void {
    const phase = this.gameState.phase.toUpperCase();
    const active = this.gameState.activePlayer === 'player' ? 'YOUR TURN' : 'AI TURN';
    this.statusText.setText(`Turn ${this.gameState.turnNumber} | ${active} | Phase: ${phase}`);

    const recent = this.gameState.log.slice(-14).join('\n');
    this.logText.setText(recent);
  }

  private onPlayCard(cardInstanceId: string, slot?: number): void {
    if (this.gameState.activePlayer !== 'player' || this.aiRunning) return;
    const before = this.gameState.pendingTarget;
    this.gameState = playCard(this.gameState, 'player', cardInstanceId, slot);
    if (!this.gameState.pendingTarget) this.selectedCardId = null;
    else if (!before) this.selectedCardId = cardInstanceId;
    this.animateContagionPulse();
    this.refreshUI();
  }

  private onTargetSlot(slot: number, owner: PlayerId): void {
    if (owner !== 'player') {
      // targeting enemy from pending request uses enemy owner
    }
    this.gameState = resolveTarget(this.gameState, 'player', slot);
    this.selectedCardId = null;
    this.refreshUI();
  }

  private onEnterCombat(): void {
    if (this.gameState.activePlayer !== 'player' || this.gameState.phase !== 'main') return;
    this.gameState = enterCombatPhase(this.gameState);
    this.selectedCardId = null;
    this.refreshUI();
  }

  private onAttack(attackerSlot: number, target: 'hero' | number): void {
    this.gameState = attackUnit(this.gameState, 'player', attackerSlot, target);
    this.selectedAttacker = null;
    this.refreshUI();
  }

  private onEndTurn(): void {
    if (this.gameState.activePlayer !== 'player' || this.aiRunning) return;
    if (this.gameState.phase !== 'main' && this.gameState.phase !== 'combat') return;
    this.gameState = endTurn(this.gameState);
    this.selectedCardId = null;
    this.selectedAttacker = null;
    this.animateContagionPulse();
    this.refreshUI();

    if (this.gameState.activePlayer === 'opponent' && !this.gameState.winner) {
      this.scheduleAITurn();
    }
  }

  private scheduleAITurn(): void {
    this.aiRunning = true;
    this.time.delayedCall(600, () => {
      this.gameState = runAITurn(this.gameState, 'opponent', { difficulty: 'normal' });
      this.aiRunning = false;
      this.animateContagionPulse();
      this.refreshUI();
    });
  }

  private animateContagionPulse(): void {
    this.tweens.add({
      targets: this.spreadLines,
      alpha: { from: 1, to: 0.3 },
      duration: 400,
      yoyo: true,
    });
  }
}

const BOARD_SLOTS = 5;

function needsTargetManual(def: ReturnType<typeof getCard>): boolean {
  if (!def.operation) return false;
  const op = def.operation;
  return (
    op.type === 'damageUnit' ||
    op.type === 'exposeTarget' ||
    op.type === 'buffUnit' ||
    (op.type === 'quarantine' && op.target === 'unit') ||
    (op.type === 'decontaminate' && op.target === 'unit')
  );
}
