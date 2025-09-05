export type Pose = { x: number; y: number; z: number; heading: number; pitch: number };

export type PoseEvent = {
  type: 'pose';
  t: number;
} & Pose;

export type TextEvent = {
  type: 'text';
  t: number;
  text: string;
  pose?: Pose;
};

export type ToolEvent = {
  type: 'tool';
  t: number;
  name: string;
  args?: unknown;
  ok?: boolean;
  text?: string;
  image?: { dataUrl: string; mimeType: string };
  structured?: unknown;
  error?: string;
  pose?: Pose;
};

export type AnyEvent = PoseEvent | TextEvent | ToolEvent;
