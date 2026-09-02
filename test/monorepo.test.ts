import { describe, expect, it } from 'vitest';
import type { AgentRule, RuleAnalysis, RuleStatus } from '../src/domain/types';
import { analyzeRules, resolveRule } from '../src/services/ruleResolver';
import { buildViewModel } from '../src/ui/viewModel';
import { lines, loadMonorepo, parseFixture } from './helpers';

const rules = loadMonorepo();

function analyze(activeFile: string): RuleAnalysis {
  return analyzeRules(rules, { activeFile });
}

function statusOf(analysis: RuleAnalysis, relativePath: string): RuleStatus {
  const rule = analysis.rules.find((entry) => entry.relativePath === relativePath);
  if (rule === undefined) {
    throw new Error(`Rule not found in the fixture: ${relativePath}`);
  }
  return rule.status;
}

function ruleOf(analysis: RuleAnalysis, relativePath: string): AgentRule {
  const rule = analysis.rules.find((entry) => entry.relativePath === relativePath);
  if (rule === undefined) {
    throw new Error(`Rule not found in the fixture: ${relativePath}`);
  }
  return rule;
}

const BACKEND = 'src/backend/order.service.ts';
const FRONTEND = 'src/frontend/OrderCard.tsx';
const SCRIPT = 'scripts/deploy.py';
const ROOT_FILE = 'root-config.ts';

describe('AGENTS.md chain', () => {
  it('gives a backend file both the root and the backend file, general first', () => {
    const analysis = analyze(BACKEND);
    const agents = analysis.matching.filter((rule) => rule.source === 'agents');
    expect(agents.map((rule) => rule.relativePath)).toEqual([
      'AGENTS.md',
      'src/backend/AGENTS.md'
    ]);
  });

  it('does not give a frontend file the backend AGENTS.md', () => {
    const analysis = analyze(FRONTEND);
    expect(statusOf(analysis, 'AGENTS.md')).toBe('matching');
    expect(statusOf(analysis, 'src/backend/AGENTS.md')).toBe('notApplicable');
  });

  it('calls the nearest file the most specific one for this path', () => {
    const vm = buildViewModel({
      hasWorkspace: true,
      multipleFolders: false,
      analysis: analyze(BACKEND)
    });
    const agents = vm.sections.find((section) => section.id === 'agents');
    expect(agents?.rules.map((rule) => rule.reason)).toEqual([
      'Workspace default',
      'Most specific'
    ]);
    expect(JSON.stringify(vm)).not.toContain('highest priority');
  });

  it('never reads frontmatter or body text to decide the folder scope', () => {
    const withFrontmatter = parseFixture(
      'src/backend/AGENTS.md',
      lines('---', 'scope: frontend', '---', 'Use only in the frontend.')
    );
    // The declared "scope" and the sentence are both ignored: the folder wins.
    expect(resolveRule(withFrontmatter, BACKEND).status).toBe('matching');
    expect(resolveRule(withFrontmatter, FRONTEND).status).toBe('notApplicable');
    expect(withFrontmatter.unsupportedFields).toEqual(['scope']);
  });
});

describe('Claude .claude/rules', () => {
  it('applies a rule without paths to every file, whatever it is called', () => {
    for (const activeFile of [BACKEND, FRONTEND, SCRIPT, ROOT_FILE]) {
      expect(statusOf(analyze(activeFile), '.claude/rules/typescript.md')).toBe('matching');
    }
  });

  it('restricts a rule by its paths field, whatever the file is called', () => {
    expect(statusOf(analyze(BACKEND), '.claude/rules/zzz-arbitrary-name.md')).toBe('matching');
    expect(statusOf(analyze(ROOT_FILE), '.claude/rules/zzz-arbitrary-name.md')).toBe('matching');
    expect(statusOf(analyze(FRONTEND), '.claude/rules/zzz-arbitrary-name.md')).toBe(
      'notApplicable'
    );
    expect(statusOf(analyze(SCRIPT), '.claude/rules/zzz-arbitrary-name.md')).toBe('notApplicable');
  });

  it('reports an unusable paths value as unknown, never as a global rule', () => {
    const analysis = analyze(BACKEND);
    const rule = ruleOf(analysis, '.claude/rules/broken-paths.md');
    expect(rule.status).toBe('unknown');
    expect(rule.cause).toBe('invalid paths metadata');
    expect(rule.blockingFields).toEqual(['paths']);
    expect(analysis.matching).not.toContain(rule);
  });

  it('keeps the documented no-filter behaviour for an unknown field, and reports it', () => {
    const analysis = analyze(FRONTEND);
    const rule = ruleOf(analysis, '.claude/rules/unsupported-metadata.md');
    expect(rule.status).toBe('matching');
    expect(rule.unsupportedFields).toEqual(['scope']);

    const warning = rule.warnings.find((entry) => entry.code === 'unsupported-metadata');
    expect(warning?.title).toBe('Unsupported Claude metadata: scope');
    expect(warning?.message).toBe('This field was ignored when determining applicability.');
  });

  it('resolves by paths and still reports an extra field alongside it', () => {
    const rule = parseFixture(
      '.claude/rules/mixed.md',
      lines('---', 'paths: "**/*.ts"', 'scope: backend', '---', 'Body.')
    );
    expect(rule.patterns).toEqual(['**/*.ts']);
    expect(rule.unsupportedFields).toEqual(['scope']);
    expect(resolveRule(rule, BACKEND).status).toBe('matching');
    expect(resolveRule(rule, FRONTEND).status).toBe('notApplicable');
    expect(rule.warnings.map((entry) => entry.code)).toEqual(['unsupported-metadata']);
  });
});

describe('Cursor combinations', () => {
  const analysis = analyze(BACKEND);

  it('covers the four documented combinations', () => {
    expect(statusOf(analysis, '.cursor/rules/always.mdc')).toBe('matching');
    expect(statusOf(analysis, '.cursor/rules/frontend.mdc')).toBe('matching');
    expect(statusOf(analysis, '.cursor/rules/described.mdc')).toBe('agentDecided');
    expect(statusOf(analysis, '.cursor/rules/silent.mdc')).toBe('manual');
  });

  it('never treats the rule file name as evidence', () => {
    // frontend.mdc declares src/backend globs, so it matches the backend file
    // and not the frontend one.
    expect(statusOf(analyze(FRONTEND), '.cursor/rules/frontend.mdc')).toBe('notApplicable');
    expect(statusOf(analyze(BACKEND), '.cursor/rules/frontend.mdc')).toBe('matching');
  });

  it('reports an unusable globs value as unknown', () => {
    const rule = ruleOf(analysis, '.cursor/rules/broken-globs.mdc');
    expect(rule.status).toBe('unknown');
    expect(rule.cause).toBe('invalid globs metadata');
    expect(rule.warnings.map((entry) => entry.code)).toContain('invalid-pattern-field');
  });

  it('ignores and reports unknown fields without changing the result', () => {
    const rule = ruleOf(analysis, '.cursor/rules/extra-metadata.mdc');
    expect(rule.status).toBe('matching');
    expect(rule.unsupportedFields).toEqual(['owner', 'priority']);
    expect(
      rule.warnings
        .filter((entry) => entry.code === 'unsupported-metadata')
        .map((entry) => entry.title)
    ).toEqual([
      'Unsupported Cursor metadata: owner',
      'Unsupported Cursor metadata: priority'
    ]);
  });

  it('marks malformed YAML as invalid rather than guessing', () => {
    const rule = ruleOf(analysis, '.cursor/rules/malformed.mdc');
    expect(rule.status).toBe('invalid');
    expect(rule.cause).toBe('malformed YAML frontmatter');
    expect(rule.frontmatterInvalid).toBe(true);
    expect(analysis.matching).not.toContain(rule);
  });

  it('treats a non boolean alwaysApply as unknown', () => {
    const rule = parseFixture(
      '.cursor/rules/odd.mdc',
      lines('---', 'alwaysApply: maybe', 'globs: "**/*.ts"', '---', 'Body.')
    );
    expect(resolveRule(rule, BACKEND).status).toBe('unknown');
    expect(resolveRule(rule, BACKEND).cause).toBe('invalid alwaysApply metadata');
  });

  it('treats a non string description as unknown instead of falling back to manual', () => {
    const rule = parseFixture(
      '.cursor/rules/odd-description.mdc',
      lines('---', 'alwaysApply: false', 'description:', '  - a', '  - b', '---', 'Body.')
    );
    expect(resolveRule(rule, BACKEND).status).toBe('unknown');
  });
});

describe('GitHub Copilot', () => {
  const analysis = analyze(BACKEND);

  it('treats copilot-instructions.md as a repository wide rule', () => {
    expect(statusOf(analysis, '.github/copilot-instructions.md')).toBe('matching');
    for (const activeFile of [FRONTEND, SCRIPT, ROOT_FILE]) {
      expect(statusOf(analyze(activeFile), '.github/copilot-instructions.md')).toBe('matching');
    }
  });

  it('resolves a modular file by applyTo', () => {
    const path = '.github/instructions/typescript.instructions.md';
    expect(statusOf(analyze(BACKEND), path)).toBe('matching');
    expect(statusOf(analyze(FRONTEND), path)).toBe('matching');
    expect(statusOf(analyze(SCRIPT), path)).toBe('notApplicable');
  });

  it('never turns a modular file without applyTo into a global rule', () => {
    const rule = ruleOf(analysis, '.github/instructions/orphan.instructions.md');
    expect(rule.status).toBe('unknown');
    expect(rule.cause).toBe('missing applyTo');
    expect(rule.warnings.map((entry) => entry.code)).toContain('missing-apply-to');
    expect(analysis.matching).not.toContain(rule);
  });

  it('reports an unusable applyTo as unknown', () => {
    const rule = parseFixture(
      '.github/instructions/bad.instructions.md',
      lines('---', 'applyTo: 7', '---', 'Body.')
    );
    const resolved = resolveRule(rule, BACKEND);
    expect(resolved.status).toBe('unknown');
    expect(resolved.cause).toBe('invalid applyTo metadata');
  });

  it('accepts excludeAgent without calling it unsupported', () => {
    const rule = parseFixture(
      '.github/instructions/excluded.instructions.md',
      lines('---', 'applyTo: "**/*.ts"', 'excludeAgent: copilot-cli', '---', 'Body.')
    );
    expect(rule.unsupportedFields).toEqual([]);
    expect(resolveRule(rule, BACKEND).status).toBe('matching');
  });
});

describe('no semantic interpretation', () => {
  it('ignores a sentence in the body that names a folder', () => {
    const analysis = analyze(FRONTEND);
    const rule = ruleOf(analysis, '.claude/rules/unsupported-metadata.md');
    expect(rule.body).toContain('Use only in the backend');
    expect(rule.status).toBe('matching');
  });

  it('ignores body text for Cursor rules too', () => {
    const rule = parseFixture(
      '.cursor/rules/prose.mdc',
      lines('---', 'alwaysApply: true', '---', 'Only for Python files under scripts/.')
    );
    expect(resolveRule(rule, FRONTEND).status).toBe('matching');
  });
});

describe('the rule file name never changes applicability', () => {
  const cases: Array<[string, string[]]> = [
    [
      lines('---', 'paths: "**/*.ts"', '---', 'Body.'),
      ['.claude/rules/typescript.md', '.claude/rules/anything-else.md', '.claude/rules/python.md']
    ],
    [
      'No frontmatter at all.',
      ['.claude/rules/typescript.md', '.claude/rules/frontend.md', '.claude/rules/backend.md']
    ],
    [
      lines('---', 'alwaysApply: false', 'globs: "**/*.tsx"', '---', 'Body.'),
      ['.cursor/rules/frontend.mdc', '.cursor/rules/backend.mdc', '.cursor/rules/typescript.mdc']
    ]
  ];

  it.each(cases)('resolves the same content identically under any name', (content, paths) => {
    for (const activeFile of [BACKEND, FRONTEND, SCRIPT, ROOT_FILE]) {
      const statuses = paths.map(
        (path) => resolveRule(parseFixture(path, content), activeFile).status
      );
      expect(new Set(statuses).size).toBe(1);
    }
  });
});

describe('switching between file types', () => {
  const matchingPaths = (activeFile: string): string[] =>
    analyze(activeFile)
      .matching.map((rule) => rule.relativePath)
      .sort();

  it('produces a different, explainable set for each file', () => {
    expect(matchingPaths(BACKEND)).toEqual([
      '.claude/rules/typescript.md',
      '.claude/rules/unsupported-metadata.md',
      '.claude/rules/zzz-arbitrary-name.md',
      '.cursor/rules/always.mdc',
      '.cursor/rules/extra-metadata.mdc',
      '.cursor/rules/frontend.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/typescript.instructions.md',
      'AGENTS.md',
      'src/backend/AGENTS.md'
    ]);

    expect(matchingPaths(FRONTEND)).toEqual([
      '.claude/rules/typescript.md',
      '.claude/rules/unsupported-metadata.md',
      '.cursor/rules/always.mdc',
      '.cursor/rules/extra-metadata.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/typescript.instructions.md',
      'AGENTS.md'
    ]);

    expect(matchingPaths(SCRIPT)).toEqual([
      '.claude/rules/typescript.md',
      '.claude/rules/unsupported-metadata.md',
      '.cursor/rules/always.mdc',
      '.cursor/rules/extra-metadata.mdc',
      '.github/copilot-instructions.md',
      'AGENTS.md'
    ]);

    expect(matchingPaths(ROOT_FILE)).toEqual([
      '.claude/rules/typescript.md',
      '.claude/rules/unsupported-metadata.md',
      '.claude/rules/zzz-arbitrary-name.md',
      '.cursor/rules/always.mdc',
      '.cursor/rules/extra-metadata.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/typescript.instructions.md',
      'AGENTS.md'
    ]);
  });
});

describe('unreadable rules stay out of the totals', () => {
  const analysis = analyze(BACKEND);

  it('excludes unknown and invalid rules from the count and the tokens', () => {
    expect(analysis.unknown.map((rule) => rule.relativePath).sort()).toEqual([
      '.claude/rules/broken-paths.md',
      '.cursor/rules/broken-globs.mdc',
      '.github/instructions/orphan.instructions.md'
    ]);
    expect(analysis.invalid.map((rule) => rule.relativePath)).toEqual([
      '.cursor/rules/malformed.mdc'
    ]);

    const countedTokens = analysis.matching.reduce(
      (total, rule) => total + rule.estimatedTokens,
      0
    );
    expect(analysis.matchingTokens).toBe(countedTokens);

    const excluded = [...analysis.unknown, ...analysis.invalid];
    expect(excluded.every((rule) => rule.estimatedTokens > 0)).toBe(true);
    for (const rule of excluded) {
      expect(analysis.matching).not.toContain(rule);
    }
  });

  it('surfaces every unreadable rule in the sidebar sections, not behind a fold', () => {
    const vm = buildViewModel({ hasWorkspace: true, multipleFolders: false, analysis });
    const shown = vm.sections.flatMap((section) => section.rules.map((rule) => rule.relativePath));
    for (const rule of [...analysis.unknown, ...analysis.invalid]) {
      expect(shown).toContain(rule.relativePath);
    }

    const claude = vm.sections.find((section) => section.id === 'claude');
    expect(claude?.countLabel).toBe('3 matches · 1 unknown');
    const cursor = vm.sections.find((section) => section.id === 'cursor');
    expect(cursor?.countLabel).toBe('3 matches · 2 optional · 1 unknown · 1 invalid');
  });

  it('explains what to fix on every unknown row', () => {
    const vm = buildViewModel({ hasWorkspace: true, multipleFolders: false, analysis });
    const rows = vm.sections
      .flatMap((section) => section.rules)
      .filter((rule) => rule.tone === 'unknown');
    expect(rows.map((rule) => `${rule.statusLabel} · ${rule.reason}`).sort()).toEqual([
      'Cannot determine · Invalid globs metadata',
      'Cannot determine · Invalid paths metadata',
      'Cannot determine · Missing applyTo'
    ]);
  });

  it('says in the header that this is an analysis, not the live context', () => {
    const vm = buildViewModel({ hasWorkspace: true, multipleFolders: false, analysis });
    expect(vm.header?.summaryLine).toBe('10 matching files · 4 formats');
    expect(vm.header?.tokensLine).toContain('configuration analysis only');
  });
});
