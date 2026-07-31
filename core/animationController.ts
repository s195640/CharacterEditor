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

  // Set on every group, not just the currently playing one: AnimationGroup's
  // own play() reads its own stored speedRatio when (re)starting, so setting
  // it on all groups up front means switching animations later (play/next)
  // keeps the chosen speed without needing to reapply it per switch.
  setSpeed(ratio: number): void {
    this.groups.forEach((g) => (g.speedRatio = ratio));
  }

  pause(): void {
    this.groups[this.currentIndex]?.pause();
  }

  resume(): void {
    this.groups[this.currentIndex]?.play(true);
  }

  togglePause(): void {
    if (this.isPaused()) {
      this.resume();
    } else {
      this.pause();
    }
  }

  // No public isPaused getter on AnimationGroup, but isPlaying is defined as
  // isStarted && !isPaused -- so isStarted && !isPlaying is exactly "paused",
  // without needing to track the state ourselves.
  isPaused(): boolean {
    const group = this.groups[this.currentIndex];
    return group !== undefined && group.isStarted && !group.isPlaying;
  }

  // Steps to the previous/next actual authored keyframe, not just a fixed
  // frame offset: the source clips bake keys roughly 2 frame-units apart,
  // not 1 (confirmed by inspecting getKeys() on Walking/Idle/Running -- all
  // three space keys ~2 apart, not 1), so a fixed delta of 1 would land
  // between two keyframes rather than on one. Finds the keyframe nearest the
  // current position (in case playback was paused mid-interpolation) and
  // moves exactly one keyframe index from there, clamped to the clip's ends.
  stepFrame(delta: number): void {
    const group = this.groups[this.currentIndex];
    if (!group) {
      return;
    }
    if (!this.isPaused()) {
      group.pause();
    }
    const frames = group.targetedAnimations[0]?.animation.getKeys().map((k) => k.frame) ?? [];
    if (frames.length === 0) {
      return;
    }
    const current = group.getCurrentFrame();
    let closestIndex = 0;
    let closestDistance = Infinity;
    frames.forEach((frame, index) => {
      const distance = Math.abs(frame - current);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    const targetIndex = Math.min(frames.length - 1, Math.max(0, closestIndex + delta));
    group.goToFrame(frames[targetIndex]);
  }

  // Rounded: the source clips' authored keyframe times carry floating-point
  // noise (e.g. 2.0000001, 63.9999980926513672), so a raw readout would show
  // a confusing near-integer instead of the actual keyframe number.
  getCurrentFrame(): number {
    const group = this.groups[this.currentIndex];
    return group ? Math.round(group.getCurrentFrame()) : 0;
  }

  list(): string[] {
    return this.groups.map((g) => g.name);
  }
}
