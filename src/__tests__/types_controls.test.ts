import { describe, it, expect } from 'vitest';
import { MoveRelativeSchema, TurnRelativeSchema } from '../types/controls.js';

describe('controls schemas', () => {
  it('MoveRelativeSchema accepts forward/right numbers', () => {
    expect(() => MoveRelativeSchema.parse({ forward: 1.5, right: -0.25 })).not.toThrow();
  });

  it('TurnRelativeSchema requires degrees', () => {
    expect(() => TurnRelativeSchema.parse({ degrees: 90 })).not.toThrow();
  });
});
