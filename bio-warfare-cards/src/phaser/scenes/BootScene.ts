import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // Placeholder — no external assets for MVP
  }

  create(): void {
    const warned = localStorage.getItem('strain-content-warning-seen');
    this.scene.start('MenuScene', { showWarning: !warned });
  }
}
