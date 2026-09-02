import { describe, expect, it } from 'vitest';
import { MAX_RULE_LINES } from '../src/services/ruleDiagnostics';
import { classifyRuleFile, extractClaudeImports } from '../src/services/ruleParser';
import { estimateTokens } from '../src/utils/tokens';
import { lines, parseFixture } from './helpers';

describe('classifyRuleFile', () => {
  it('recognizes every supported rule file', () => {
    expect(classifyRuleFile('AGENTS.md')).toEqual({ kind: 'agents-md', source: 'agents' });
    expect(classifyRuleFile('src/backend/AGENTS.md')).toEqual({
      kind: 'agents-md',
      source: 'agents'
    });
    expect(classifyRuleFile('CLAUDE.md')).toEqual({ kind: 'claude-md', source: 'claude' });
    expect(classifyRuleFile('packages/api/CLAUDE.local.md')).toEqual({
      kind: 'claude-local-md',
      source: 'claude'
    });
    expect(classifyRuleFile('.claude/CLAUDE.md')).toEqual({
      kind: 'claude-project-md',
      source: 'claude'
    });
    expect(classifyRuleFile('.claude/rules/style.md')).toEqual({
      kind: 'claude-rule',
      source: 'claude'
    });
    expect(classifyRuleFile('.cursor/rules/frontend.mdc')).toEqual({
      kind: 'cursor-rule',
      source: 'cursor'
    });
    expect(classifyRuleFile('.github/copilot-instructions.md')).toEqual({
      kind: 'copilot-instructions',
      source: 'copilot'
    });
    expect(classifyRuleFile('.github/instructions/ts.instructions.md')).toEqual({
      kind: 'copilot-scoped-instructions',
      source: 'copilot'
    });
  });

  it('ignores unsupported files', () => {
    expect(classifyRuleFile('README.md')).toBeUndefined();
    expect(classifyRuleFile('agents.md')).toBeUndefined();
    expect(classifyRuleFile('.cursor/rules/notes.md')).toBeUndefined();
    expect(classifyRuleFile('.github/instructions/notes.md')).toBeUndefined();
  });
});

describe('Cursor .mdc parsing', () => {
  it('reads alwaysApply, globs and description', () => {
    const rule = parseFixture(
      '.cursor/rules/always.mdc',
      lines('---', 'alwaysApply: true', 'description: House style', '---', '', 'Always follow this.')
    );
    expect(rule.alwaysApply).toBe(true);
    expect(rule.description).toBe('House style');
    expect(rule.warnings).toEqual([]);
    expect(rule.body.trim()).toBe('Always follow this.');
  });

  it('accepts globs as a string or as a list', () => {
    const single = parseFixture(
      '.cursor/rules/one.mdc',
      lines('---', 'alwaysApply: false', 'globs: src/frontend/**/*.tsx', '---', 'body')
    );
    expect(single.patterns).toEqual(['src/frontend/**/*.tsx']);

    const many = parseFixture(
      '.cursor/rules/many.mdc',
      lines('---', 'alwaysApply: false', 'globs:', '  - src/**/*.ts', '  - docs/**', '---', 'body')
    );
    expect(many.patterns).toEqual(['src/**/*.ts', 'docs/**']);
  });

  it('warns instead of crashing on invalid frontmatter', () => {
    const rule = parseFixture(
      '.cursor/rules/broken.mdc',
      lines('---', 'globs: [unclosed', 'alwaysApply: "', '---', 'body')
    );
    expect(rule.warnings.map((warning) => warning.code)).toContain('invalid-frontmatter');
    expect(rule.frontmatterInvalid).toBe(true);
    expect(rule.hasFrontmatter).toBe(false);
  });

  it('warns when an .mdc file has no frontmatter at all', () => {
    const rule = parseFixture('.cursor/rules/plain.mdc', 'Just some prose.');
    expect(rule.hasFrontmatter).toBe(false);
    expect(rule.warnings.map((warning) => warning.code)).toEqual(['missing-frontmatter']);
  });
});

describe('Copilot instructions parsing', () => {
  it('splits a comma separated applyTo value', () => {
    const rule = parseFixture(
      '.github/instructions/ts.instructions.md',
      lines('---', 'applyTo: "**/*.ts,**/*.tsx"', '---', 'Use strict mode.')
    );
    expect(rule.patterns).toEqual(['**/*.ts', '**/*.tsx']);
    expect(rule.warnings).toEqual([]);
  });

  it('accepts a single glob and a list', () => {
    expect(
      parseFixture(
        '.github/instructions/one.instructions.md',
        lines('---', 'applyTo: "**/*.ts"', '---', 'body')
      ).patterns
    ).toEqual(['**/*.ts']);

    expect(
      parseFixture(
        '.github/instructions/list.instructions.md',
        lines('---', 'applyTo:', '  - "src/**/*.ts"', '  - "test/**/*.ts"', '---', 'body')
      ).patterns
    ).toEqual(['src/**/*.ts', 'test/**/*.ts']);
  });

  it('warns when applyTo is missing', () => {
    const rule = parseFixture(
      '.github/instructions/missing.instructions.md',
      lines('---', 'description: No applyTo here', '---', 'body')
    );
    expect(rule.warnings.map((warning) => warning.code)).toEqual(['missing-apply-to']);
    expect(rule.patterns).toBeUndefined();
  });

  it('warns when applyTo is neither a string nor a list of strings', () => {
    const rule = parseFixture(
      '.github/instructions/bad.instructions.md',
      lines('---', 'applyTo: 42', '---', 'body')
    );
    const warning = rule.warnings.find((entry) => entry.code === 'invalid-pattern-field');
    expect(warning).toBeDefined();
    expect(warning?.line).toBe(2);
    expect(rule.blockingFields).toEqual(['applyTo']);
  });
});

describe('Claude rule parsing', () => {
  it('reads paths as a string or as a list', () => {
    expect(
      parseFixture('.claude/rules/ts.md', lines('---', 'paths: "**/*.ts"', '---', 'body')).patterns
    ).toEqual(['**/*.ts']);
    expect(
      parseFixture(
        '.claude/rules/ts.md',
        lines('---', 'paths:', '  - "**/*.ts"', '  - "**/*.tsx"', '---', 'body')
      ).patterns
    ).toEqual(['**/*.ts', '**/*.tsx']);
  });

  it('warns for files longer than the soft limit', () => {
    const body = Array.from({ length: MAX_RULE_LINES + 5 }, (_, index) => `line ${index}`);
    const rule = parseFixture('CLAUDE.md', lines(...body));
    const warning = rule.warnings.find((entry) => entry.code === 'long-rule-file');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain(`${MAX_RULE_LINES + 5} lines`);
  });

  it('estimates tokens from the body without the frontmatter', () => {
    const rule = parseFixture(
      '.claude/rules/ts.md',
      lines('---', 'paths: "**/*.ts"', '---', 'Prefer named exports.')
    );
    expect(rule.estimatedTokens).toBe(estimateTokens(rule.body));
    expect(rule.estimatedTokens).toBeLessThan(estimateTokens(rule.content));
  });
});

describe('extractClaudeImports', () => {
  it('finds imports outside code and records line numbers', () => {
    const content = lines(
      '# Project memory',
      '',
      'See @docs/guide.md for details.',
      'Also read @AGENTS.md.',
      ''
    );
    expect(extractClaudeImports(content)).toEqual([
      { target: 'docs/guide.md', line: 3 },
      { target: 'AGENTS.md', line: 4 }
    ]);
  });

  it('ignores inline code, fenced blocks, frontmatter and plain mentions', () => {
    const content = lines(
      '---',
      'description: uses @frontmatter/value.md',
      '---',
      'Inline `@docs/inline.md` stays out.',
      '```md',
      '@docs/fenced.md',
      '```',
      'Ping @team about @docs/real.md',
      'Contact user@example.com for access.'
    );
    expect(extractClaudeImports(content)).toEqual([{ target: 'docs/real.md', line: 8 }]);
  });

  it('is not used for non Claude sources', () => {
    const rule = parseFixture(
      '.cursor/rules/x.mdc',
      lines('---', 'alwaysApply: true', '---', 'See @docs/guide.md')
    );
    expect(rule.imports).toEqual([]);
  });
});
