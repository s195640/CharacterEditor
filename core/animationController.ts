import type { AnimationGroup } from "@babylonjs/core";

export class AnimationController {
  constructor(private readonly groups: AnimationGroup[]) {}

  play(name?: string, loop = true): void {
    const group = name ? this.groups.find((g) => g.name === name) : this.groups[0];
    if (!group) {
      throw new Error(name ? `Animation group "${name}" not found` : "No animation groups available");
    }
    this.groups.forEach((g) => g.stop());
    group.play(loop);
  }

  stop(): void {
    this.groups.forEach((g) => g.stop());
  }

  list(): string[] {
    return this.groups.map((g) => g.name);
  }
}
