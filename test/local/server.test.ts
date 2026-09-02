import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type RunningServer } from '../../src/local/server';
import { LocalSession } from '../../src/local/session';
import { SAMPLE_ROOT } from '../helpers';

const MEDIA_ROOT = join(__dirname, '..', '..', 'media');

let server: RunningServer;
let session: LocalSession;

beforeAll(async () => {
  session = new LocalSession(SAMPLE_ROOT);
  await session.load();
  // Port 0: the OS picks a free one, so the suite never fights a real run.
  server = await startServer({ session, mediaRoot: MEDIA_ROOT, locale: 'en' }, 0);
});

afterAll(async () => {
  await server.close();
});

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('X-ARL-Token')) {
    headers.set('X-ARL-Token', server.token);
  }
  return fetch(`${server.url}${path}`, { ...init, headers });
}

function analyze(body: unknown, init: RequestInit = {}): Promise<Response> {
  return call('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init
  });
}

describe('local server', () => {
  it('binds to loopback only', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('answers health without a token', async () => {
    const response = await fetch(`${server.url}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('serves the shell with the session token and a restrictive CSP', async () => {
    const response = await fetch(`${server.url}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(server.token);
    const csp = response.headers.get('content-security-policy') ?? '';
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('unsafe-inline');
  });

  it('never sends permissive CORS headers', async () => {
    const response = await fetch(`${server.url}/api/health`);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('serves the shared renderer, the stylesheets and a mark', async () => {
    for (const asset of [
      '/assets/rulesRenderer.js',
      '/assets/local.js',
      '/assets/rules.css',
      '/assets/local.css',
      '/assets/icons/claude.svg',
      '/assets/logo.svg'
    ]) {
      const response = await fetch(`${server.url}${asset}`);
      expect(response.status, asset).toBe(200);
      expect((await response.text()).length, asset).toBeGreaterThan(0);
    }
  });

  it('refuses an asset outside the inventory', async () => {
    for (const asset of [
      '/assets/icons/../../../package.json',
      '/assets/icons/nope.svg',
      '/assets/../package.json'
    ]) {
      expect((await fetch(`${server.url}${asset}`)).status, asset).toBe(404);
    }
  });

  // fetch refuses to set Host, so this one goes out as a raw request.
  function rawGet(path: string, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port: server.port, path, method: 'GET', headers: { Host: host } },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        }
      );
      request.on('error', reject);
      request.end();
    });
  }

  it.each([
    ['evil.example.com'],
    ['127.0.0.1.attacker.test'],
    ['example.com:80']
  ])('rejects a request whose Host is %s', async (host) => {
    await expect(rawGet('/api/health', host)).resolves.toBe(403);
  });

  it.each([
    ['127.0.0.1'],
    ['localhost']
  ])('accepts the loopback Host %s', async (name) => {
    await expect(rawGet('/api/health', `${name}:${server.port}`)).resolves.toBe(200);
  });

  it.each([
    ['/api/session'],
    ['/api/files?q=agents']
  ])('rejects %s without a token', async (path) => {
    const response = await fetch(`${server.url}${path}`);
    expect(response.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const response = await call('/api/session', { headers: { 'X-ARL-Token': 'wrong' } });
    expect(response.status).toBe(401);
  });

  it('describes the session without leaking an absolute path', async () => {
    const body = (await (await call('/api/session')).json()) as Record<string, unknown>;
    expect(body['workspace']).toBe('sample-workspace');
    expect(JSON.stringify(body)).not.toContain(SAMPLE_ROOT);
    expect(Object.keys(body['icons'] as object).length).toBeGreaterThan(0);
    const strings = body['strings'] as Record<string, { privacy: string; detectedFiles: unknown }>;
    expect(strings['en']?.privacy).toBe('Runs locally. Your files stay on this computer.');
    expect(strings['pt-BR']?.privacy).toBe(
      'Executado localmente. Seus arquivos permanecem neste computador.'
    );
    // Plural forms survive JSON, so the page needs no dictionary of its own.
    expect(strings['en']?.detectedFiles).toEqual({
      zero: 'No instruction files detected in this workspace',
      one: '1 instruction file detected in this workspace',
      many: '{count} instruction files detected in this workspace'
    });
  });

  it('searches files and caps the result set', async () => {
    const body = (await (await call('/api/files?q=order')).json()) as { files: string[] };
    expect(body.files).toContain('src/backend/order.service.ts');
    expect(body.files.length).toBeLessThanOrEqual(100);
  });

  it('analyzes a file', async () => {
    const body = (await (await analyze({ file: 'src/backend/order.service.ts' })).json()) as {
      file: string;
      model: { header: { summaryLine: string }; sections: unknown[] };
    };
    expect(body.file).toBe('src/backend/order.service.ts');
    expect(body.model.header.summaryLine).toBe('8 matching files · 4 formats');
    expect(body.model.sections).toHaveLength(4);
  });

  it('switches language without changing the analysis', async () => {
    const english = (await (
      await analyze({ file: 'src/backend/order.service.ts', locale: 'en' })
    ).json()) as { model: { header: { summaryLine: string } } };
    const portuguese = (await (
      await analyze({ file: 'src/backend/order.service.ts', locale: 'pt-BR' })
    ).json()) as { model: { header: { summaryLine: string } } };
    expect(english.model.header.summaryLine).toBe('8 matching files · 4 formats');
    expect(portuguese.model.header.summaryLine).toBe('8 arquivos aplicáveis · 4 formatos');
  });

  it('does not rediscover when only the language changes', async () => {
    const load = vi.spyOn(session, 'load');
    try {
      await analyze({ file: 'src/backend/order.service.ts', locale: 'pt-BR' });
      await analyze({ file: 'src/backend/order.service.ts', locale: 'en' });
      expect(load).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it('refreshes by reading the workspace again', async () => {
    const response = await analyze({ file: 'src/backend/order.service.ts', refresh: true });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { model: { sections: unknown[] } };
    expect(body.model.sections).toHaveLength(4);
  });

  it.each([
    [{ file: '../../../package.json' }, 'file-not-found'],
    [{ file: 'does/not/exist.ts' }, 'file-not-found'],
    [{ locale: 'de' }, 'bad-locale'],
    [{ file: 42 }, 'bad-file']
  ])('refuses bad input %#', async (payload, error) => {
    const response = await analyze(payload);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('refuses a body larger than the limit', async () => {
    const response = await call('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'x'.repeat(80 * 1024) })
    });
    expect(response.status).toBe(413);
  });

  it('refuses malformed JSON', async () => {
    const response = await call('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{'
    });
    expect(response.status).toBe(400);
  });

  it('previews a rule through its handle', async () => {
    const analysis = (await (
      await analyze({ file: 'src/backend/order.service.ts' })
    ).json()) as { model: { sections: Array<{ rules: Array<{ fsPath: string }> }> } };
    const handle = analysis.model.sections[0]?.rules[0]?.fsPath as string;
    const response = await call(`/api/artifacts/${handle}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { relativePath: string; content: string };
    expect(body.relativePath).toBe('AGENTS.md');
    expect(body.content.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain(SAMPLE_ROOT);
  });

  it.each([
    ['0123456789abcdef01234567'],
    ['..%2F..%2Fpackage.json'],
    ['../../package.json']
  ])('refuses artifact id %s', async (handle) => {
    const response = await call(`/api/artifacts/${handle}`);
    expect(response.status).toBe(404);
  });

  it('returns JSON for an unknown route', async () => {
    const response = await call('/api/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('closes cleanly', async () => {
    const other = await startServer(
      { session, mediaRoot: MEDIA_ROOT, locale: 'en' },
      0
    );
    await other.close();
    await expect(fetch(`${other.url}/api/health`)).rejects.toThrow();
  });
});

describe('refresh reads the workspace again', () => {
  it('picks up a rule file added after startup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'arl-refresh-'));
    writeFileSync(join(root, 'AGENTS.md'), '# root rules');
    const live = new LocalSession(root);
    await live.load();
    const running = await startServer({ session: live, mediaRoot: MEDIA_ROOT, locale: 'en' }, 0);
    const headers = { 'X-ARL-Token': running.token, 'Content-Type': 'application/json' };
    const analyzeFile = async (refresh: boolean): Promise<number> => {
      const response = await fetch(`${running.url}/api/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ file: 'AGENTS.md', refresh })
      });
      const body = (await response.json()) as { model: { sections: unknown[] } };
      return body.model.sections.length;
    };

    try {
      expect(await analyzeFile(false)).toBe(1);
      writeFileSync(join(root, 'CLAUDE.md'), '# claude rules');
      // Without a refresh the cached discovery still describes the old tree.
      expect(await analyzeFile(false)).toBe(1);
      expect(await analyzeFile(true)).toBe(2);
    } finally {
      await running.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
