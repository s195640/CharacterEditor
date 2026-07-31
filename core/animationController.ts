import type { AnimationGroup } from "@babylonjs/core";

export class AnimationController {
  private currentIndex = 0;

  constructor(private readonly groups: AnimationGroup[]) {}

  play(name?: string, loop = true): void {
    const index = name ? this.groups.findIndex((g) => g.name === name) : 0;
    if (index === -1) {
      throw new Error(`Animation group "${name}" not found`);
    }
    const group = this.groups[index];
    if (!group) {
      throw new Error("No animation groups available");
    }
    this.currentIndex = index;
    this.groups.forEach((g) => g.stop());
    group.play(loop);
  }

  next(): void {
    if (this.groups.length === 0) {
      throw new Error("No animation groups available");
    }
    this.currentIndex = (this.currentIndex + 1) % this.groups.length;
    this.groups.forEach((g) => g.stop());
    this.groups[this.currentIndex].play(true);
  }

  stop(): void {
    this.groups.forEach((g) => g.stop());
  }

  list(): string[] {
    return this.groups.map((g) => g.name);
  }
}
