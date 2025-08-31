# Configuration Pattern

This repository uses a consistent configuration pattern to ensure clarity, safety, and portability.

- Each constructor accepts a single `Config` object.
- `Config` must be JSON-serializable.
- Validate with `zod` and expose helpers:
  - `fromEnv()` to build config from environment variables.
  - `toJSON()` or return a plain object when needed.

Example (TypeScript):

```ts
import { z } from 'zod';

export const OscConfigSchema = z.object({
  host: z.string().ip({ version: 'v4' }),
  port: z.number().int().min(1).max(65535),
  address: z.string().startsWith('/'),
});

export type OscConfig = z.infer<typeof OscConfigSchema>;

export function oscConfigFromEnv(): OscConfig {
  const host = process.env['RESONITE_OSC_HOST'] ?? '127.0.0.1';
  const port = Number(process.env['RESONITE_OSC_PORT'] ?? '9000');
  const address = process.env['RESONITE_OSC_ADDRESS'] ?? '/resonite/text';
  return OscConfigSchema.parse({ host, port, address });
}

export class OscTextSender {
  constructor(private readonly config: OscConfig) {}
}
```

```ts
// Usage
const cfg = oscConfigFromEnv();
const sender = new OscTextSender(cfg);
```

Avoid comments in config and code; let names and types carry intent. Use doc comments in rare cases where unavoidable.
