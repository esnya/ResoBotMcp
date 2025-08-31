import { z } from 'zod';

export const MoveRelativeInput = {
  forward: z.number().optional(),
  right: z.number().optional(),
} as const;

export const TurnRelativeInput = {
  degrees: z.number(),
} as const;
