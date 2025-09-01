import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { MoveRelativeSchema, TurnRelativeInput } from '../tools/contracts.js';

describe('tool contracts', () => {
  it('MoveRelativeSchema accepts direction+distance', () => {
    expect(() => MoveRelativeSchema.parse({ direction: 'forward', distance: 1.25 })).not.toThrow();
  });

  it('TurnRelativeInput requires degrees', () => {
    expect(() => z.object(TurnRelativeInput).parse({ degrees: 90 })).not.toThrow();
  });
});
