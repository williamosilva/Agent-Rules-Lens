import { describe, expect, it } from 'vitest';
import type { ParsedRule } from '../src/domain/types';
import { validateClaudeImports } from '../src/services/ruleDiagnostics';
import { analyzeRules, resolveRule } from '../src/services/ruleResolver';
import { lines, parseFixture } from './helpers';

function statusOf(rule: ParsedRule, activeFile: string | undefined): string {
  return resolveRule(rule, activeFile).status;
}

describe('AGENTS.md resolution', () => {
  const root = parseFixture('AGENTS.md', 'Root instructions.');
  const backend = parseFixture('src/backend/AGENTS.md', 'Backend instructions.');
  const frontend = parseFixture('src/frontend/AGENTS.md', 'Frontend instructions.');

  it('applies a file to its own folder and every subfolder', () => {
    const backendFile = 'src/backend/order.service.ts';
    expect(statusOf(root, backendFile)).toBe('matching');
    expect(statusOf(backend, backendFile)).toBe('matching');
    expect(statusOf(frontend, backendFile)).toBe('notApplicable');
  });

  it('lists the chain from the broadest to the most specific scope', () => {
    const analysis = analyzeRules([backend, frontend, root], {
      activeFile: 'src/backend/order.service.ts'
    });
    expect(analysis.matching.map((rule) => rule.relativePath)).toEqual([
      'AGENTS.md',
      'src/backend/AGENTS.md'
    ]);
  });

  it('marks every directory scoped rule inactive when no file is open', () => {
    expect(statusOf(root, undefined)).toBe('notApplicable');
    expect(statusOf(backend, undefined)).toBe('notApplicable');
  });

  it('describes the scope of the rule', () => {
    expect(resolveRule(root, 'a.ts').scopeDescription).toBe('Workspace root and all subfolders');
    expect(resolveRule(backend, 'a.ts').scopeDescription).toBe('src/backend/ and all subfolders');
  });
});

describe('Claude resolution', () => {
  it('keeps CLAUDE.md before CLAUDE.local.md inside the same folder', () => {
    const rootMd = parseFixture('CLAUDE.md', 'Root memory.');
    const rootLocal = parseFixture('CLAUDE.local.md', 'Local memory.');
    const nestedMd = parseFixture('src/CLAUDE.md', 'Nested memory.');
    const nestedLocal = parseFixture('src/CLAUDE.local.md', 'Nested local memory.');

    const analysis = analyzeRules([nestedLocal, rootLocal, nestedMd, rootMd], {
      activeFile: 'src/app.ts'
    });
    expect(analysis.matching.map((rule) => rule.relativePath)).toEqual([
      'CLAUDE.md',
      'CLAUDE.local.md',
      'src/CLAUDE.md',
      'src/CLAUDE.local.md'
    ]);
  });

  it('treats .claude/CLAUDE.md as a workspace wide project rule', () => {
    const rule = parseFixture('.claude/CLAUDE.md', 'Project memory.');
    expect(statusOf(rule, 'anywhere/file.ts')).toBe('matching');
    expect(resolveRule(rule, 'anywhere/file.ts').scopeDescription).toContain('Entire workspace');
  });

  it('keeps a .claude/rules file without paths always active', () => {
    const rule = parseFixture('.claude/rules/style.md', 'Use tabs.');
    expect(rule.patterns).toBeUndefined();
    expect(statusOf(rule, 'src/a.py')).toBe('matching');
    expect(statusOf(rule, undefined)).toBe('matching');
  });

  it('activates a .claude/rules file only when paths match', () => {
    const rule = parseFixture(
      '.claude/rules/typescript.md',
      lines('---', 'paths: "**/*.ts"', '---', 'Prefer named exports.')
    );
    expect(statusOf(rule, 'src/backend/order.service.ts')).toBe('matching');
    expect(statusOf(rule, 'src/frontend/OrderCard.tsx')).toBe('notApplicable');
    expect(statusOf(rule, 'README.md')).toBe('notApplicable');
  });

  it('marks a .claude/rules file invalid when the frontmatter cannot be parsed', () => {
    const rule = parseFixture(
      '.claude/rules/broken.md',
      lines('---', 'paths: "', 'other: [', '---', 'body')
    );
    expect(statusOf(rule, 'src/a.ts')).toBe('invalid');
  });
});

describe('Cursor resolution', () => {
  it('is active for any file when alwaysApply is true', () => {
    const rule = parseFixture(
      '.cursor/rules/always.mdc',
      lines('---', 'alwaysApply: true', 'globs: src/frontend/**', 'description: Ignored', '---', 'x')
    );
    expect(statusOf(rule, 'src/backend/order.service.ts')).toBe('matching');
    expect(statusOf(rule, undefined)).toBe('matching');
  });

  it('uses globs when alwaysApply is false', () => {
    const rule = parseFixture(
      '.cursor/rules/frontend.mdc',
      lines('---', 'alwaysApply: false', 'globs: src/frontend/**/*.tsx', '---', 'x')
    );
    expect(statusOf(rule, 'src/frontend/OrderCard.tsx')).toBe('matching');
    expect(statusOf(rule, 'src/backend/order.service.ts')).toBe('notApplicable');
  });

  it('is conditional with only a description', () => {
    const rule = parseFixture(
      '.cursor/rules/agent.mdc',
      lines('---', 'alwaysApply: false', 'description: Apply when touching payments', '---', 'x')
    );
    expect(statusOf(rule, 'src/a.ts')).toBe('agentDecided');
  });

  it('is manual without alwaysApply, globs or description', () => {
    const rule = parseFixture('.cursor/rules/manual.mdc', lines('---', 'title: Notes', '---', 'x'));
    expect(statusOf(rule, 'src/a.ts')).toBe('manual');
  });

  it('is invalid without a usable frontmatter', () => {
    expect(statusOf(parseFixture('.cursor/rules/plain.mdc', 'Prose only.'), 'src/a.ts')).toBe(
      'invalid'
    );
    expect(
      statusOf(
        parseFixture('.cursor/rules/broken.mdc', lines('---', 'globs: [x', '---', 'x')),
        'src/a.ts'
      )
    ).toBe('invalid');
  });
});

describe('Copilot resolution', () => {
  it('applies copilot-instructions.md to the whole workspace', () => {
    const rule = parseFixture('.github/copilot-instructions.md', 'Repo wide instructions.');
    expect(statusOf(rule, 'src/a.py')).toBe('matching');
  });

  it('resolves a single applyTo glob', () => {
    const rule = parseFixture(
      '.github/instructions/ts.instructions.md',
      lines('---', 'applyTo: "**/*.ts"', '---', 'x')
    );
    expect(statusOf(rule, 'src/backend/order.service.ts')).toBe('matching');
    expect(statusOf(rule, 'src/frontend/OrderCard.tsx')).toBe('notApplicable');
  });

  it('resolves several comma separated applyTo globs', () => {
    const rule = parseFixture(
      '.github/instructions/ts.instructions.md',
      lines('---', 'applyTo: "**/*.ts,**/*.tsx"', '---', 'x')
    );
    expect(statusOf(rule, 'src/backend/order.service.ts')).toBe('matching');
    expect(statusOf(rule, 'src/frontend/OrderCard.tsx')).toBe('matching');
    expect(statusOf(rule, 'docs/readme.md')).toBe('notApplicable');
  });

  it('cannot determine applicability without applyTo, and never goes global', () => {
    const rule = parseFixture(
      '.github/instructions/missing.instructions.md',
      lines('---', 'description: nothing', '---', 'x')
    );
    const resolved = resolveRule(rule, 'src/a.ts');
    expect(resolved.status).toBe('unknown');
    expect(resolved.cause).toBe('missing applyTo');
  });
});

describe('Claude import diagnostics', () => {
  const rule = parseFixture(
    'CLAUDE.md',
    lines('# Memory', '', 'See @docs/missing-guide.md and @AGENTS.md.')
  );

  it('warns only for targets that do not exist', () => {
    const warnings = validateClaudeImports(rule, rule.imports, (target) => target === 'AGENTS.md');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe('missing-import');
    expect(warnings[0]?.line).toBe(3);
    expect(warnings[0]?.message).toContain('docs/missing-guide.md');
  });

  it('produces no warning when every target exists', () => {
    expect(validateClaudeImports(rule, rule.imports, () => true)).toEqual([]);
  });

  it('skips home relative and remote targets', () => {
    const remote = parseFixture(
      'CLAUDE.md',
      lines('See @~/global/notes.md and @https://example.com/x.md')
    );
    expect(validateClaudeImports(remote, remote.imports, () => false)).toEqual([]);
  });
});

describe('analyzeRules', () => {
  const rootAgents = parseFixture('AGENTS.md', 'a'.repeat(400));
  const backendAgents = parseFixture('src/backend/AGENTS.md', 'b'.repeat(80));
  const conditional = parseFixture(
    '.cursor/rules/agent.mdc',
    lines('---', 'description: Payments', '---', 'c'.repeat(400))
  );
  const manual = parseFixture('.cursor/rules/manual.mdc', lines('---', 'title: N', '---', 'x'));

  it('counts only active rules in the token total', () => {
    const analysis = analyzeRules([rootAgents, backendAgents, conditional, manual], {
      activeFile: 'src/backend/order.service.ts'
    });
    const expected = analysis.matching.reduce((total, rule) => total + rule.estimatedTokens, 0);
    expect(analysis.matching).toHaveLength(2);
    expect(analysis.matchingTokens).toBe(expected);
    expect(analysis.matchingTokens).toBe(
      rootAgents.estimatedTokens + backendAgents.estimatedTokens
    );
  });

  it('separates conditional and manual rules from the active ones', () => {
    const analysis = analyzeRules([rootAgents, conditional, manual], {
      activeFile: 'src/a.ts'
    });
    expect(analysis.optional.map((rule) => rule.status)).toEqual(['agentDecided', 'manual']);
  });

  it('collects warnings from every rule plus the extra ones', () => {
    const broken = parseFixture('.cursor/rules/plain.mdc', 'Prose only.');
    const analysis = analyzeRules([broken], {
      extraWarnings: [
        {
          code: 'unreadable-file',
          message: 'boom',
          relativePath: 'AGENTS.md',
          fsPath: '/repo/AGENTS.md'
        }
      ]
    });
    expect(analysis.warnings.map((warning) => warning.code)).toEqual([
      'unreadable-file',
      'missing-frontmatter'
    ]);
  });

  it('reports no active file when none is given', () => {
    const analysis = analyzeRules([rootAgents], {});
    expect(analysis.activeFile).toBeUndefined();
    expect(analysis.matching).toEqual([]);
  });
});
