import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliError, parseArgs, run } from '../../src/local/cli';
import { REPORT_SCHEMA_VERSION } from '../../src/local/report';
import { SAMPLE_ROOT } from '../helpers';

/** Captures the two streams so a JSON run can be checked for stray logging. */
function capture(): { out: string[]; err: string[]; restore: () => void } {
  const out: string[] = [];
  const err: string[] = [];
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      err.push(String(chunk));
      return true;
    });
  return { out, err, restore: () => { outSpy.mockRestore(); errSpy.mockRestore(); } };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('argument parsing', () => {
  it('reads every supported flag', () => {
    expect(
      parseArgs([
        '--workspace',
        'C:\\Projects\\my app',
        '--file',
        'src/index.ts',
        '--port',
        '4317',
        '--no-open',
        '--locale',
        'pt-BR',
        '--json'
      ])
    ).toEqual({
      workspace: 'C:\\Projects\\my app',
      file: 'src/index.ts',
      positional: [],
      port: 4317,
      open: false,
      locale: 'pt-BR',
      json: true,
      help: false,
      version: false
    });
  });

  it('keeps a quoted path with spaces intact', () => {
    expect(parseArgs(['--workspace', 'C:\\Program Files\\repo']).workspace).toBe(
      'C:\\Program Files\\repo'
    );
  });

  it('opens the browser unless told not to', () => {
    expect(parseArgs(['--workspace', '.']).open).toBe(true);
  });

  it.each([['--help'], ['-h']])('recognizes %s', (flag) => {
    expect(parseArgs([flag]).help).toBe(true);
  });

  it.each([
    [['--workspace'], 'Missing value for --workspace.'],
    [['--file'], 'Missing value for --file.'],
    [['--port', 'abc'], 'Invalid port: abc'],
    [['--port', '70000'], 'Invalid port: 70000'],
    [['--locale', 'de'], 'Unsupported locale. Use pt-BR or en.'],
    [['--bogus'], 'Unknown option: --bogus']
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it('treats a following flag as a missing value', () => {
    expect(() => parseArgs(['--workspace', '--json'])).toThrow('Missing value for --workspace.');
  });
});

describe('help', () => {
  it('prints usage and exits zero', async () => {
    const streams = capture();
    try {
      await expect(run(['--help'])).resolves.toBe(0);
      expect(streams.out.join('')).toContain('--workspace <path>');
      expect(streams.err.join('')).toBe('');
    } finally {
      streams.restore();
    }
  });
});

describe('validation', () => {
  it('reports a workspace that does not exist', async () => {
    await expect(run(['--workspace', 'does-not-exist-anywhere'])).rejects.toThrow(
      /^Workspace not found: /
    );
  });

  it('reports a workspace that is a file', async () => {
    await expect(run(['--workspace', 'package.json'])).rejects.toThrow(
      /^Workspace is not a directory: /
    );
  });

  it('reports a file outside the workspace', async () => {
    await expect(
      run(['--workspace', SAMPLE_ROOT, '--file', '../../package.json', '--json'])
    ).rejects.toThrow('The selected file is outside the workspace.');
  });

  it('requires a file with --json', async () => {
    await expect(run(['--workspace', SAMPLE_ROOT, '--json'])).rejects.toThrow(
      '--json needs a file. Example: arl src/app.ts --json'
    );
  });

  it('uses a non zero exit code', () => {
    expect(new CliError('nope').code).toBe(1);
  });
});

describe('json mode', () => {
  async function report(...argv: string[]): Promise<{ json: unknown; out: string; err: string }> {
    const streams = capture();
    try {
      await run(argv);
      const out = streams.out.join('');
      return { json: JSON.parse(out), out, err: streams.err.join('') };
    } finally {
      streams.restore();
    }
  }

  it('prints only valid JSON on stdout', async () => {
    const { json, err } = await report(
      '--workspace',
      SAMPLE_ROOT,
      '--file',
      'src/backend/order.service.ts',
      '--json'
    );
    expect(err).toBe('');
    expect(json).toMatchObject({
      schemaVersion: REPORT_SCHEMA_VERSION,
      workspace: 'sample-workspace',
      file: 'src/backend/order.service.ts'
    });
  });

  it('carries every documented section', async () => {
    const { json } = await report(
      '--workspace',
      SAMPLE_ROOT,
      '--file',
      'src/backend/order.service.ts',
      '--json'
    );
    const body = json as Record<string, unknown>;
    for (const key of [
      'schemaVersion',
      'workspace',
      'file',
      'summary',
      'groups',
      'warnings',
      'notApplicable',
      'detectedArtifacts',
      'candidates'
    ]) {
      expect(body, key).toHaveProperty(key);
    }
    expect((body['groups'] as unknown[]).length).toBe(4);
    expect((body['warnings'] as unknown[]).length).toBe(2);
    expect(body['detectedArtifacts']).toEqual([
      { label: 'GEMINI.md', relativePath: 'GEMINI.md', note: 'Gemini, Zed · Applicability not analyzed' }
    ]);
    expect(body['candidates']).toEqual([
      { label: 'AI_RULES.md', relativePath: 'AI_RULES.md', note: 'Custom candidate · loading not verified' }
    ]);
  });

  it('never prints an absolute path', async () => {
    const { out } = await report(
      '--workspace',
      SAMPLE_ROOT,
      '--file',
      'src/backend/order.service.ts',
      '--json'
    );
    expect(out).not.toContain(SAMPLE_ROOT);
    expect(out).not.toMatch(/[A-Za-z]:\\\\/);
    expect(out).not.toContain('fsPath');
  });

  it('honours --locale', async () => {
    const { json } = await report(
      '--workspace',
      SAMPLE_ROOT,
      '--file',
      'src/backend/order.service.ts',
      '--locale',
      'pt-BR',
      '--json'
    );
    const summary = (json as { summary: { locale: string; summaryLine: string } }).summary;
    expect(summary.locale).toBe('pt-BR');
    expect(summary.summaryLine).toBe('8 arquivos aplicáveis · 4 formatos');
  });

  it('matches the analysis the sidebar shows', async () => {
    const { json } = await report(
      '--workspace',
      SAMPLE_ROOT,
      '--file',
      'src/backend/order.service.ts',
      '--json'
    );
    const body = json as {
      summary: { summaryLine: string; tokensLine: string; matchingRules: number };
      groups: Array<{ id: string; countLabel: string }>;
    };
    expect(body.summary.summaryLine).toBe('8 matching files · 4 formats');
    expect(body.summary.tokensLine).toBe('~277 tokens · configuration analysis only');
    expect(body.summary.matchingRules).toBe(8);
    expect(body.groups.map((group) => `${group.id}:${group.countLabel}`)).toEqual([
      'agents:2 matches',
      'claude:3 matches',
      'cursor:1 match · 2 optional',
      'copilot:2 matches'
    ]);
  });
});
