import { describe, expect, it } from 'vitest';
import { NodeWorkspaceAccess } from '../../src/adapters/nodeWorkspaceAccess';
import type { RuleAnalysis } from '../../src/domain/types';
import { analyzeRules } from '../../src/services/ruleResolver';
import { loadWorkspaceRules } from '../../src/services/workspaceAnalysis';
import type { SupportedLocale } from '../../src/ui/i18n';
import { buildViewModel, type RulesViewModel } from '../../src/ui/viewModel';
import { LocalSession } from '../../src/local/session';
import {
  ECOSYSTEM_ROOT,
  MONOREPO_ROOT,
  SAMPLE_ROOT,
  importWarningsFor,
  loadWorkspace
} from '../helpers';

/** The analysis the extension produces, rebuilt from the test helpers. */
function expectedAnalysis(root: string, activeFile: string): RuleAnalysis {
  const rules = loadWorkspace(root);
  return analyzeRules(rules, {
    activeFile,
    extraWarnings: importWarningsFor(root, rules)
  });
}

async function nodeAnalysis(root: string, activeFile: string): Promise<RuleAnalysis> {
  const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(root));
  return analyzeRules(loaded.rules, { activeFile, extraWarnings: loaded.warnings });
}

/** Comparable shape: paths and statuses, with absolute paths left out. */
function shape(analysis: RuleAnalysis): unknown {
  const rules = (list: RuleAnalysis['matching']): unknown =>
    list.map((rule) => ({
      relativePath: rule.relativePath,
      kind: rule.kind,
      source: rule.source,
      status: rule.status,
      cause: rule.cause,
      scopeDescription: rule.scopeDescription,
      tokens: rule.estimatedTokens
    }));
  return {
    matching: rules(analysis.matching),
    optional: rules(analysis.optional),
    unknown: rules(analysis.unknown),
    invalid: rules(analysis.invalid),
    notApplicable: rules(analysis.notApplicable),
    matchingTokens: analysis.matchingTokens,
    warnings: [...analysis.warnings]
      .map((warning) => ({
        code: warning.code,
        relativePath: warning.relativePath,
        line: warning.line,
        message: warning.message
      }))
      .sort((a, b) => `${a.relativePath}${a.code}`.localeCompare(`${b.relativePath}${b.code}`))
  };
}

/** View model without the absolute paths, which differ by transport. */
function viewShape(model: RulesViewModel): unknown {
  return JSON.parse(
    JSON.stringify(model, (key, value: unknown) => (key === 'fsPath' ? undefined : value))
  );
}

describe('node adapter equivalence', () => {
  it('discovers exactly the rule files the extension discovers', async () => {
    const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(SAMPLE_ROOT));
    expect(loaded.rules.map((rule) => rule.relativePath).sort()).toEqual(
      loadWorkspace(SAMPLE_ROOT)
        .map((rule) => rule.relativePath)
        .sort()
    );
  });

  it('parses the same content, kind and source for every rule', async () => {
    const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(SAMPLE_ROOT));
    const expected = new Map(
      loadWorkspace(SAMPLE_ROOT).map((rule) => [rule.relativePath, rule])
    );
    for (const rule of loaded.rules) {
      const other = expected.get(rule.relativePath);
      expect(other, rule.relativePath).toBeDefined();
      expect({ kind: rule.kind, source: rule.source, body: rule.body }).toEqual({
        kind: other?.kind,
        source: other?.source,
        body: other?.body
      });
    }
  });

  it.each([
    ['src/backend/order.service.ts'],
    ['src/frontend/OrderCard.tsx']
  ])('matches the extension analysis for %s', async (file) => {
    expect(shape(await nodeAnalysis(SAMPLE_ROOT, file))).toEqual(
      shape(expectedAnalysis(SAMPLE_ROOT, file))
    );
  });

  it('resolves the AGENTS override the same way', async () => {
    const analysis = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    expect(analysis.matching.map((rule) => rule.relativePath)).toContain(
      'src/backend/AGENTS.override.md'
    );
    expect(analysis.notApplicable.map((rule) => rule.relativePath)).toContain(
      'src/backend/AGENTS.md'
    );
  });

  it('keeps Claude paths, Cursor globs and Copilot applyTo intact', async () => {
    const backend = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    const frontend = await nodeAnalysis(SAMPLE_ROOT, 'src/frontend/OrderCard.tsx');
    const paths = (analysis: RuleAnalysis): string[] =>
      analysis.matching.map((rule) => rule.relativePath);

    expect(paths(backend)).toContain('.claude/rules/typescript.md');
    expect(paths(frontend)).not.toContain('.claude/rules/typescript.md');
    expect(paths(frontend)).toContain('.cursor/rules/frontend.mdc');
    expect(paths(backend)).not.toContain('.cursor/rules/frontend.mdc');
    expect(paths(backend)).toContain('.github/instructions/typescript.instructions.md');
  });

  it('keeps the optional rules optional', async () => {
    const analysis = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    expect(analysis.optional.map((rule) => `${rule.relativePath}:${rule.status}`)).toEqual([
      '.cursor/rules/payments.mdc:agentDecided',
      '.cursor/rules/release-checklist.mdc:manual'
    ]);
  });

  it('reports the same warnings', async () => {
    const analysis = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    const missing = analysis.warnings.filter((warning) => warning.code === 'missing-import');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.relativePath).toBe('CLAUDE.md');
    expect(analysis.warnings.some((w) => w.code === 'unsupported-metadata')).toBe(true);
  });

  it('lists detected artifacts and candidates without reading them', async () => {
    const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(SAMPLE_ROOT));
    const artifacts = loaded.artifacts.map((artifact) => ({
      relativePath: artifact.relativePath,
      supportLevel: artifact.supportLevel,
      recognizedBy: artifact.recognizedBy
    }));
    expect(artifacts).toContainEqual({
      relativePath: 'GEMINI.md',
      supportLevel: 'detected',
      recognizedBy: ['Gemini', 'Zed']
    });
    expect(artifacts).toContainEqual({
      relativePath: 'AI_RULES.md',
      supportLevel: 'candidate',
      recognizedBy: []
    });
    // A non rule definition is recognized so it is never listed as a rule.
    expect(loaded.rules.map((rule) => rule.relativePath)).not.toContain(
      '.github/agents/reviewer.agent.md'
    );
  });

  it('counts tokens only for matching rules', async () => {
    const analysis = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    const sum = analysis.matching.reduce((total, rule) => total + rule.estimatedTokens, 0);
    expect(analysis.matchingTokens).toBe(sum);
    expect(analysis.matchingTokens).toBe(
      expectedAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts').matchingTokens
    );
  });

  it.each<SupportedLocale>(['en', 'pt-BR'])(
    'builds the same view model in %s',
    async (locale) => {
      const file = 'src/backend/order.service.ts';
      const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(SAMPLE_ROOT));
      const local = buildViewModel({
        hasWorkspace: true,
        multipleFolders: false,
        artifacts: loaded.artifacts,
        locale,
        analysis: analyzeRules(loaded.rules, { activeFile: file, extraWarnings: loaded.warnings })
      });
      const extension = buildViewModel({
        hasWorkspace: true,
        multipleFolders: false,
        artifacts: loaded.artifacts,
        locale,
        analysis: expectedAnalysis(SAMPLE_ROOT, file)
      });
      expect(viewShape(local)).toEqual(viewShape(extension));
    }
  );

  it.each([[MONOREPO_ROOT], [ECOSYSTEM_ROOT]])(
    'agrees with the extension on the harder fixtures',
    async (root) => {
      const file = 'src/index.ts';
      expect(shape(await nodeAnalysis(root, file))).toEqual(shape(expectedAnalysis(root, file)));
    }
  );

  it('produces the same result through the local session', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const model = session.analyze({ file: 'src/backend/order.service.ts', locale: 'en' });
    expect(model.header?.summaryLine).toBe('8 matching files · 4 formats');
    expect(model.sections.map((section) => `${section.id}:${section.countLabel}`)).toEqual([
      'agents:2 matches',
      'claude:3 matches',
      'cursor:1 match · 2 optional',
      'copilot:2 matches'
    ]);
  });

  it('is deterministic across runs', async () => {
    const first = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    const second = await nodeAnalysis(SAMPLE_ROOT, 'src/backend/order.service.ts');
    expect(shape(first)).toEqual(shape(second));
  });
});
