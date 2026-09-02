import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { ICON_DIRECTORY, ICON_FILES } from '../ui/iconInventory';
import { isSupportedLocale, type SupportedLocale } from '../ui/i18n';
import { localMessagesFor } from './localMessages';
import type { LocalSession } from './session';

/** Requests larger than this are refused before anything is parsed. */
const MAX_BODY_BYTES = 64 * 1024;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

export interface ServerOptions {
  session: LocalSession;
  /** Root of the repository's `media` folder, the only served directory. */
  mediaRoot: string;
  locale: SupportedLocale;
  initialFile?: string;
}

export interface RunningServer {
  port: number;
  token: string;
  url: string;
  close(): Promise<void>;
}

/** Static files the panel may request, mapped to their location under media. */
function assetPath(mediaRoot: string, urlPath: string): string | undefined {
  const map: Record<string, string> = {
    '/assets/rules.css': 'rules.css',
    '/assets/logo.svg': 'agent-rules-lens.svg',
    '/assets/local.css': path.join('local', 'local.css'),
    '/assets/local.js': path.join('local', 'local.js'),
    '/assets/rulesRenderer.js': path.join('shared', 'rulesRenderer.js')
  };
  const known = map[urlPath];
  if (known !== undefined) {
    return path.join(mediaRoot, known);
  }

  const iconPrefix = '/assets/icons/';
  if (urlPath.startsWith(iconPrefix)) {
    const file = urlPath.slice(iconPrefix.length);
    // Only inventory files are served: the name never reaches the filesystem
    // unless it is one this build ships.
    const known = Object.values(ICON_FILES).some(
      (entry) => entry.light === file || entry.dark === file
    );
    if (known) {
      return path.join(mediaRoot, ...ICON_DIRECTORY.slice(1), file);
    }
  }
  return undefined;
}

function iconUrls(): Record<string, { light: string; dark: string }> {
  const map: Record<string, { light: string; dark: string }> = {};
  for (const [iconId, files] of Object.entries(ICON_FILES)) {
    map[iconId] = {
      light: `/assets/icons/${files.light}`,
      dark: `/assets/icons/${files.dark}`
    };
  }
  return map;
}

function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  response.end(payload);
}

/** Only a loopback name may address this server, whatever the port. */
function hostIsLocal(host: string | undefined): boolean {
  if (host === undefined) {
    return false;
  }
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return name === '127.0.0.1' || name === 'localhost' || name === '::1';
}

async function readBody(request: http.IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      return undefined;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startServer(options: ServerOptions, port = 0): Promise<RunningServer> {
  const token = randomBytes(24).toString('hex');
  const { session, mediaRoot } = options;
  let locale = options.locale;

  const shell = await buildShell(mediaRoot, token);

  const server = http.createServer((request, response) => {
    void handle(request, response).catch(() => {
      sendJson(response, 500, { error: 'internal-error' });
    });
  });

  async function handle(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    if (!hostIsLocal(request.headers.host)) {
      sendJson(response, 403, { error: 'bad-host' });
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = url.pathname;

    if (route === '/' || route === '/index.html') {
      response.writeHead(200, {
        ...securityHeaders(),
        'Content-Type': CONTENT_TYPES['.html'] as string,
        'Content-Length': Buffer.byteLength(shell)
      });
      response.end(shell);
      return;
    }

    if (route.startsWith('/assets/')) {
      await serveAsset(route, response);
      return;
    }

    if (!route.startsWith('/api/')) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }

    if (route === '/api/health') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    // Every other endpoint reads workspace content, so it needs the token this
    // run handed to the page.
    if (request.headers['x-arl-token'] !== token) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }

    if (route === '/api/session' && request.method === 'GET') {
      sendJson(response, 200, {
        workspace: session.workspaceName,
        locale,
        ...(options.initialFile === undefined ? {} : { file: options.initialFile }),
        icons: iconUrls(),
        strings: { 'en': localMessagesFor('en'), 'pt-BR': localMessagesFor('pt-BR') }
      });
      return;
    }

    if (route === '/api/files' && request.method === 'GET') {
      const query = url.searchParams.get('q') ?? '';
      sendJson(response, 200, { files: await session.searchFiles(query) });
      return;
    }

    if (route === '/api/analyze' && request.method === 'POST') {
      const body = await readBody(request);
      if (body === undefined) {
        sendJson(response, 413, { error: 'body-too-large' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = body.length === 0 ? {} : JSON.parse(body);
      } catch {
        sendJson(response, 400, { error: 'bad-json' });
        return;
      }
      const payload = (parsed ?? {}) as Record<string, unknown>;

      const requested = payload['locale'];
      if (requested !== undefined) {
        if (!isSupportedLocale(requested)) {
          sendJson(response, 400, { error: 'bad-locale' });
          return;
        }
        locale = requested;
      }

      if (payload['refresh'] === true) {
        await session.load();
      }

      const file = payload['file'];
      if (file !== undefined && typeof file !== 'string') {
        sendJson(response, 400, { error: 'bad-file' });
        return;
      }

      let relative: string | undefined;
      if (typeof file === 'string' && file.length > 0) {
        relative = await session.resolveFile(file);
        if (relative === undefined) {
          sendJson(response, 400, { error: 'file-not-found' });
          return;
        }
      }

      sendJson(response, 200, {
        locale,
        ...(relative === undefined ? {} : { file: relative }),
        model: session.analyze({ ...(relative === undefined ? {} : { file: relative }), locale })
      });
      return;
    }

    const artifactPrefix = '/api/artifacts/';
    if (route.startsWith(artifactPrefix) && request.method === 'GET') {
      const handle = decodeURIComponent(route.slice(artifactPrefix.length));
      const result = await session.preview(handle);
      if (result === 'unknown-handle') {
        sendJson(response, 404, { error: 'unknown-artifact' });
        return;
      }
      if (result === 'too-large') {
        sendJson(response, 413, { error: 'too-large' });
        return;
      }
      if (result === 'unreadable') {
        sendJson(response, 422, { error: 'unreadable' });
        return;
      }
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: 'not-found' });
  }

  async function serveAsset(route: string, response: http.ServerResponse): Promise<void> {
    const file = assetPath(mediaRoot, route);
    if (file === undefined) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }
    try {
      const content = await fs.readFile(file);
      response.writeHead(200, {
        ...securityHeaders(),
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': content.length
      });
      response.end(content);
    } catch {
      sendJson(response, 404, { error: 'not-found' });
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Loopback only: the panel is never reachable from another machine.
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;

  return {
    port: boundPort,
    token,
    url: `http://127.0.0.1:${boundPort}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections?.();
      })
  };
}

/**
 * The shell carries the session token in a meta tag rather than an inline
 * script, so the page needs no `unsafe-inline` and the token never reaches
 * storage or a log.
 */
async function buildShell(mediaRoot: string, token: string): Promise<string> {
  const html = await fs.readFile(path.join(mediaRoot, 'local', 'index.html'), 'utf8');
  return html.replace('{{token}}', token);
}
