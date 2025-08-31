import { z } from 'zod';

// Move (relative) – shape + schema + inferred type
export const MoveRelativeInput = {
  forward: z.number().optional(),
  right: z.number().optional(),
} as const;
export const MoveRelativeSchema = z.object(MoveRelativeInput);
export type MoveRelativeArgs = z.infer<typeof MoveRelativeSchema>;

// Turn (relative yaw) – shape + schema + inferred type
export const TurnRelativeInput = {
  degrees: z.number(),
} as const;
export const TurnRelativeSchema = z.object(TurnRelativeInput);
export type TurnRelativeArgs = z.infer<typeof TurnRelativeSchema>;
