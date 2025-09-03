import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ReadLocalAssetConfig, ReadLocalAssetConfigSchema } from '../types/config.js';

export class ReadLocalAsset {
  constructor(private readonly config: ReadLocalAssetConfig) {}

  /**
   * Reads a file referenced by a local:// asset URL under `${RESONITE_DATA_PATH}/Assets` and returns base64.
   */
  async readBase64FromLocalUrl(url: string): Promise<string> {
    const u = new URL(url);
    if (u.protocol !== 'local:') {
      throw new Error('asset URL must start with local://');
    }
    const encodedBase = path.posix.basename(u.pathname);
    const filename = decodeURIComponent(encodedBase);
    if (!filename) throw new Error('invalid asset URL (empty name)');

    const assetsRoot = path.resolve(this.config.resoniteDataPath, 'Assets');
    const filePath = path.resolve(assetsRoot, filename);
    const normAssets = assetsRoot.endsWith(path.sep) ? assetsRoot : assetsRoot + path.sep;
    if (!filePath.startsWith(normAssets)) {
      throw new Error('invalid asset path');
    }

    const bin = await fs.readFile(filePath);
    return bin.toString('base64');
  }
}

export function loadResoniteDataPathFromEnv(): ReadLocalAssetConfig {
  const p = process.env['RESONITE_DATA_PATH'];
  const cfg = { resoniteDataPath: p ?? '' };
  return ReadLocalAssetConfigSchema.parse(cfg);
}
