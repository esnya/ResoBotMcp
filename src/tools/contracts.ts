import { z } from 'zod';
import { SetExpressionInput } from '../usecases/SetExpression.js';
import { SetAccentHueInput } from '../usecases/SetAccentHue.js';

// Single place to declare MCP tool contracts (inputs). Keep code as the source of truth.

export const SetTextInput = {
  text: z.string().min(1, 'text is required'),
} as const;

export const PingInput = {
  text: z.string(),
} as const;

export const DirectionSchema = z.union([
  z.literal('forward'),
  z.literal('back'),
  z.literal('left'),
  z.literal('right'),
  z.literal('up'),
  z.literal('down'),
]);

export const MoveRelativeInput = {
  direction: DirectionSchema,
  distance: z.number(),
} as const;

export const MoveRelativeSchema = z.object(MoveRelativeInput);

export const TurnRelativeInput = {
  degrees: z.number(),
} as const;

export const CaptureCameraInput = {
  fov: z.number(),
  size: z
    .number()
    .int()
    .min(1, 'size must be >= 1')
    .max(4096, 'size must be <= 4096')
    .refine((v) => (v & (v - 1)) === 0, 'size must be a power of two (1..4096)'),
} as const;

export const WaitResoniteInput = {
  timeoutMs: z.number().int().min(1).optional(),
} as const;

// Arm and Lamp controls (OSC)
export const SetArmPositionInput = {
  x: z.number(),
  y: z.number(),
  z: z.number(),
} as const;

export const LampStateSchema = z.union([z.literal('off'), z.literal('on')]);
export const SetLampInput = {
  // Either provide `state` or `on`. If both present, `state` wins.
  state: LampStateSchema.optional(),
  on: z.boolean().optional(),
  brightness: z.number().min(0).max(1).optional(),
  temperature: z.number().optional(),
} as const;

export const SetArmGrabInput = {
  state: LampStateSchema.optional(),
  on: z.boolean().optional(),
} as const;

export const ToolContracts = {
  set_text: { inputSchema: SetTextInput },
  set_expression: { inputSchema: SetExpressionInput },
  set_accent_hue: { inputSchema: SetAccentHueInput },
  ping: { inputSchema: PingInput },
  capture_camera: { inputSchema: CaptureCameraInput },
  wait_resonite: { inputSchema: WaitResoniteInput },
  move_relative: { inputSchema: MoveRelativeInput },
  turn_relative: { inputSchema: TurnRelativeInput },
  get_pose: { inputSchema: {} as const },
  set_arm_position: { inputSchema: SetArmPositionInput },
  set_lamp: { inputSchema: SetLampInput },
  set_arm_grab: { inputSchema: SetArmGrabInput },
  get_arm_contact: { inputSchema: {} as const },
} as const;

export type ToolName = keyof typeof ToolContracts;
