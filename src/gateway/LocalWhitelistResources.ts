import path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadLocalAsset, loadResoniteDataPathFromEnv } from '../usecases/ReadLocalAsset.js';

function sanitizeCaptureUrl(url: string): { filename: string; uri: string } {
  const u = new URL(url);
  if (u.protocol !== 'local:') throw new Error('Invalid resource URI (scheme)');
  const filename = path.posix.basename(u.pathname || u.host || '');
  if (!filename) throw new Error('Invalid resource URI (empty filename)');
  const uri = `local:///${encodeURIComponent(filename)}`;
  return { filename, uri };
}

export class LocalWhitelistResources {
  private readonly allowed = new Set<string>();
  private readonly reader: ReadLocalAsset;
  private server: McpServer | undefined;

  constructor() {
    this.reader = new ReadLocalAsset(loadResoniteDataPathFromEnv());
  }

  grantFromCapture(urls: string[]): { uri: string; filename: string }[] {
    const granted: { uri: string; filename: string }[] = [];
    for (const url of urls) {
      const { filename, uri } = sanitizeCaptureUrl(url);
      this.allowed.add(uri);
      granted.push({ uri, filename });
    }
    // Notify client that resources list changed, if registered
    this.server?.sendResourceListChanged();
    return granted;
  }

  listResources(): { name: string; uri: string }[] {
    const out: { name: string; uri: string }[] = [];
    for (const uri of this.allowed) {
      const filename = decodeURIComponent(path.posix.basename(new URL(uri).pathname));
      out.push({ name: filename, uri });
    }
    return out;
  }

  register(server: McpServer): void {
    this.server = server;
    const template = new ResourceTemplate('local:///{filename}', {
      list: (): { resources: Array<{ name: string; uri: string }> } => {
        const resources = this.listResources().map((r) => ({ name: r.name, uri: r.uri }));
        return { resources };
      },
    });

    // Register template with a simple read callback
    server.resource(
      'local_capture',
      template,
      { title: 'Local captures (whitelisted)', description: 'Images returned by capture tools.' },
      async (uri) => {
        const uriStr = uri.toString();
        if (!this.allowed.has(uriStr)) throw new Error('Resource not found');
        const filename = decodeURIComponent(path.posix.basename(uri.pathname));
        const b64 = await this.reader.readBase64FromLocalUrl(
          `local:///${encodeURIComponent(filename)}`,
        );
        return { contents: [{ uri: uriStr, blob: b64 }] };
      },
    );
  }
}

export function sanitizeToPublicLocalUri(url: string): string {
  return sanitizeCaptureUrl(url).uri;
}

export function filenameFromLocalUrl(url: string): string {
  return sanitizeCaptureUrl(url).filename;
}
