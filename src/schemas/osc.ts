import { z } from 'zod';

// OSC ingress payload schemas (zod-typed) for hardening at the boundary.

// Pose position: [x, y, z]
export const PosePositionArgsSchema = z.tuple([
  z.coerce.number(),
  z.coerce.number(),
  z.coerce.number(),
]);

// Pose rotation: [heading, pitch]
export const PoseRotationArgsSchema = z.tuple([z.coerce.number(), z.coerce.number()]);

// Arm contact meta: [meta]
export const ArmContactMetaArgsSchema = z.tuple([z.string()]);

// Arm contact grabbed: [flag], where flag may be number or boolean
export const ArmContactGrabbedArgsSchema = z.tuple([z.union([z.coerce.number(), z.boolean()])]);
