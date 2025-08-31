export type Pose = {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
};

export class PoseTracker {
  private pose: Pose | undefined;

  updatePosition(x: number, y: number, z: number): void {
    const p = this.pose ?? { x: 0, y: 0, z: 0, heading: 0, pitch: 0 };
    this.pose = { ...p, x, y, z };
  }

  updateRotation(heading: number, pitch: number): void {
    const p = this.pose ?? { x: 0, y: 0, z: 0, heading: 0, pitch: 0 };
    this.pose = { ...p, heading, pitch };
  }

  get(): Pose | undefined {
    return this.pose;
  }
}
