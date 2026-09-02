import { describe, expect, it } from 'vitest';
import { analyzeRules } from '../src/services/ruleResolver';
import { loadSampleWorkspace, sampleImportWarnings } from './helpers';

const rules = loadSampleWorkspace();
const importWarnings = () => sampleImportWarnings(rules);

describe('sample workspace', () => {
  it('detects every supported rule file', () => {
    expect(rules.map((rule) => rule.relativePath).sort()).toEqual([
      '.claude/rules/global-style.md',
      '.claude/rules/typescript.md',
      '.cursor/rules/always.mdc',
      '.cursor/rules/frontend.mdc',
      '.cursor/rules/payments.mdc',
      '.cursor/rules/release-checklist.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/typescript.instructions.md',
      'AGENTS.md',
      'CLAUDE.md',
      'src/backend/AGENTS.md',
      'src/backend/AGENTS.override.md'
    ]);
  });

  it('shows the general and the backend rules for the backend file', () => {
    const analysis = analyzeRules(rules, {
      activeFile: 'src/backend/order.service.ts',
      extraWarnings: importWarnings()
    });
    expect(analysis.matching.map((rule) => rule.relativePath)).toEqual([
      'AGENTS.md',
      '.claude/rules/global-style.md',
      '.claude/rules/typescript.md',
      'CLAUDE.md',
      '.cursor/rules/always.mdc',
      '.github/copilot-instructions.md',
      '.github/instructions/typescript.instructions.md',
      // The override replaces src/backend/AGENTS.md in its own directory.
      'src/backend/AGENTS.override.md'
    ]);
    expect(analysis.matchingTokens).toBeGreaterThan(0);
  });

  it('swaps the backend rules for the Cursor frontend rule on the .tsx file', () => {
    const analysis = analyzeRules(rules, {
      activeFile: 'src/frontend/OrderCard.tsx',
      extraWarnings: importWarnings()
    });
    const paths = analysis.matching.map((rule) => rule.relativePath);
    expect(paths).toContain('.cursor/rules/frontend.mdc');
    expect(paths).not.toContain('src/backend/AGENTS.md');
    expect(paths).not.toContain('.claude/rules/typescript.md');
    expect(paths).toContain('.github/instructions/typescript.instructions.md');
  });

  it('lists the agent decided rules separately', () => {
    const analysis = analyzeRules(rules, { activeFile: 'src/backend/order.service.ts' });
    expect(
      analysis.optional.map((rule) => `${rule.relativePath}:${rule.status}`)
    ).toEqual([
      '.cursor/rules/payments.mdc:agentDecided',
      '.cursor/rules/release-checklist.mdc:manual'
    ]);
  });

  it('reports the missing Claude import without breaking the analysis', () => {
    const analysis = analyzeRules(rules, {
      activeFile: 'src/backend/order.service.ts',
      extraWarnings: importWarnings()
    });
    const missing = analysis.warnings.filter((warning) => warning.code === 'missing-import');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.relativePath).toBe('CLAUDE.md');
    expect(missing[0]?.message).toContain('docs/architecture.md');
    expect(analysis.matching.length).toBeGreaterThan(0);
  });
});
