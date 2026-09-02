import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_DECLARED_FORMAT_ID } from '../src/domain/formatCatalog';
import type { DetectedArtifact, ParsedRule, RuleAnalysis } from '../src/domain/types';
import { classifyArtifact } from '../src/services/artifactClassifier';
import { IGNORED_DIRECTORIES } from '../src/services/ruleDiscoveryPatterns';
import { analyzeRules, resolveRule } from '../src/services/ruleResolver';
import { buildViewModel, type RulesViewModel } from '../src/ui/viewModel';
import { toPosixPath } from '../src/utils/paths';
import { ECOSYSTEM_ROOT, lines, loadWorkspace, parseFixture } from './helpers';

function walk(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.includes(entry.name)) {
        continue;
      }
      found.push(...walk(join(directory, entry.name), relativePath));
      continue;
    }
    found.push(toPosixPath(relativePath));
  }
  return found;
}

/**
 * Mirrors what discovery does: classify every file, read the resolved ones and
 * keep the rest as artifacts that carry no status and no tokens.
 */
function scan(userPatterns: string[] = []): {
  rules: ParsedRule[];
  artifacts: DetectedArtifact[];
} {
  const rules = loadWorkspace(ECOSYSTEM_ROOT);
  const artifacts: DetectedArtifact[] = [];
  for (const relativePath of walk(ECOSYSTEM_ROOT)) {
    const classification = classifyArtifact(relativePath, userPatterns);
    if (classification === undefined || classification.supportLevel === 'resolved') {
      continue;
    }
    artifacts.push({
      id: `${classification.supportLevel}:${relativePath}`,
      relativePath,
      fsPath: join(ECOSYSTEM_ROOT, relativePath),
      supportLevel: classification.supportLevel,
      artifactKind: classification.artifactKind,
      recognizedBy: classification.recognizedBy,
      userDeclared: classification.formatIds.includes(USER_DECLARED_FORMAT_ID),
      legacy: classification.legacy,
      iconId: classification.iconId
    });
  }
  return { rules, artifacts };
}

const { rules, artifacts } = scan();

function analyze(activeFile: string): RuleAnalysis {
  return analyzeRules(rules, { activeFile });
}

function model(activeFile: string, userPatterns: string[] = []): RulesViewModel {
  const scanned = userPatterns.length > 0 ? scan(userPatterns) : { rules, artifacts };
  return buildViewModel({
    hasWorkspace: true,
    multipleFolders: false,
    analysis: analyzeRules(scanned.rules, { activeFile }),
    artifacts: scanned.artifacts
  });
}

const BACKEND = 'src/backend/order.service.ts';
const FRONTEND = 'src/frontend/OrderCard.tsx';

describe('AGENTS.override.md', () => {
  it('wins over the AGENTS.md in its own directory', () => {
    const analysis = analyze(BACKEND);
    const paths = analysis.matching.map((rule) => rule.relativePath);
    expect(paths).toContain('src/backend/AGENTS.override.md');
    expect(paths).not.toContain('src/backend/AGENTS.md');

    const replaced = analysis.rules.find(
      (rule) => rule.relativePath === 'src/backend/AGENTS.md'
    );
    expect(replaced?.status).toBe('notApplicable');
    expect(replaced?.cause).toBe('replaced by AGENTS.override.md in this directory');
  });

  it('keeps the chain from the broadest directory down to the file', () => {
    const analysis = analyze(BACKEND);
    expect(analysis.matching.filter((r) => r.source === 'agents').map((r) => r.relativePath)).toEqual(
      ['AGENTS.md', 'src/backend/AGENTS.override.md']
    );
  });

  it('does not suppress AGENTS.md in a different directory', () => {
    const analysis = analyze(FRONTEND);
    const paths = analysis.matching.map((rule) => rule.relativePath);
    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('src/frontend/AGENTS.md');
    expect(paths).not.toContain('src/backend/AGENTS.override.md');
  });

  it('builds a chain when several directories override', () => {
    const chain = [
      parseFixture('AGENTS.md', 'root'),
      parseFixture('AGENTS.override.md', 'root override'),
      parseFixture('src/AGENTS.md', 'src'),
      parseFixture('src/backend/AGENTS.md', 'backend'),
      parseFixture('src/backend/AGENTS.override.md', 'backend override')
    ];
    const analysis = analyzeRules(chain, { activeFile: 'src/backend/a.ts' });
    expect(analysis.matching.map((rule) => rule.relativePath)).toEqual([
      'AGENTS.override.md',
      'src/AGENTS.md',
      'src/backend/AGENTS.override.md'
    ]);
  });

  it('shows the override as the most specific file for the path', () => {
    const vm = model(BACKEND);
    const agents = vm.sections.find((section) => section.id === 'agents');
    expect(agents?.rules.map((rule) => `${rule.label} — ${rule.reason}`)).toEqual([
      'AGENTS.md — Workspace default',
      'AGENTS.override.md — Directory override'
    ]);
  });

  it('resolves an override on its own without cross rule context', () => {
    const override = parseFixture('src/backend/AGENTS.override.md', 'x');
    expect(resolveRule(override, BACKEND).status).toBe('matching');
    expect(resolveRule(override, FRONTEND).status).toBe('notApplicable');
  });
});

describe('other agent configurations', () => {
  const vm = model(BACKEND);

  it('lists detected files in their own collapsed section', () => {
    const section = vm.otherConfigurations;
    expect(section?.label).toBe('Other agent configurations');
    expect(section?.rows.map((row) => row.relativePath).sort()).toEqual([
      '.amazonq/rules/backend.md',
      '.clinerules/01-typescript.md',
      '.kiro/steering/tech.md',
      '.windsurf/rules/backend.md',
      '.windsurfrules',
      'GEMINI.md'
    ]);
    expect(section?.count).toBe(6);
  });

  it('names the tool and refuses to evaluate applicability', () => {
    const byPath = new Map(vm.otherConfigurations?.rows.map((row) => [row.relativePath, row]));
    // Zed reads GEMINI.md too, so both tools are named on the one row.
    expect(byPath.get('GEMINI.md')?.note).toBe('Gemini, Zed · Applicability not analyzed');
    expect(byPath.get('.windsurf/rules/backend.md')?.note).toContain('Windsurf');
    expect(byPath.get('.clinerules/01-typescript.md')?.note).toContain('Cline');
    expect(byPath.get('.kiro/steering/tech.md')?.note).toContain('Kiro');
    expect(byPath.get('.amazonq/rules/backend.md')?.note).toContain('Amazon Q Developer');
  });

  it('shows every tool of a shared legacy file on one row', () => {
    const rows = vm.otherConfigurations?.rows.filter(
      (row) => row.relativePath === '.windsurfrules'
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.note).toContain('Cline');
    expect(rows?.[0]?.note).toContain('Windsurf');
    expect(rows?.[0]?.tooltip).toContain('Legacy file name');
  });

  it('puts the full path, the tool and the support level in the tooltip', () => {
    const row = vm.otherConfigurations?.rows.find((entry) => entry.relativePath === 'GEMINI.md');
    expect(row?.tooltip).toContain('GEMINI.md');
    expect(row?.tooltip).toContain('Recognized by: Gemini');
    expect(row?.tooltip).toContain('Support level: detected');
    expect(row?.tooltip).toContain('Not counted');
    expect(row?.fsPath.length).toBeGreaterThan(0);
  });

  it('never turns a detected file into a rule', () => {
    const rulePaths = rules.map((rule) => rule.relativePath);
    for (const row of vm.otherConfigurations?.rows ?? []) {
      expect(rulePaths).not.toContain(row.relativePath);
    }
  });
});

describe('possible custom instructions', () => {
  const vm = model(BACKEND);

  it('collects hand written candidates without attributing a tool', () => {
    const section = vm.possibleCustomInstructions;
    expect(section?.label).toBe('Possible custom instructions');
    expect(section?.rows.map((row) => row.relativePath).sort()).toEqual([
      '.ai/rules/00-general.md',
      'AI_RULES.md'
    ]);
    for (const row of section?.rows ?? []) {
      expect(row.note).toBe('Custom candidate · loading not verified');
      expect(row.tooltip).toContain('Recognized by: no specific tool');
    }
  });

  it('leaves a numbered file outside a rules folder alone', () => {
    const everyPath = [
      ...(vm.otherConfigurations?.rows ?? []),
      ...(vm.possibleCustomInstructions?.rows ?? [])
    ].map((row) => row.relativePath);
    expect(everyPath).not.toContain('docs/01-introduction.md');
    expect(everyPath).not.toContain('README.md');
    expect(everyPath).not.toContain('CONTRIBUTING.md');
  });

  it('does not warn merely because a candidate exists', () => {
    expect(vm.warnings).toEqual([]);
  });
});

describe('files that must never be rules', () => {
  it('keeps agents, prompts and skills out of every section', () => {
    const vm = model(BACKEND);
    const shown = [
      ...vm.sections.flatMap((section) => section.rules.map((rule) => rule.relativePath)),
      ...vm.notApplicable.flatMap((group) => group.rules.map((rule) => rule.relativePath)),
      ...(vm.otherConfigurations?.rows ?? []).map((row) => row.relativePath),
      ...(vm.possibleCustomInstructions?.rows ?? []).map((row) => row.relativePath)
    ];
    for (const path of [
      '.github/agents/reviewer.agent.md',
      '.github/prompts/refactor.prompt.md',
      '.agents/skills/pdf/SKILL.md'
    ]) {
      expect(classifyArtifact(path)?.supportLevel).toBe('nonRule');
      expect(shown).not.toContain(path);
    }
    expect(rules.map((rule) => rule.relativePath)).not.toContain(
      '.github/agents/reviewer.agent.md'
    );
  });
});

describe('detected and candidate files change no number', () => {
  it('leaves the header, the formats and the tokens untouched', () => {
    const withArtifacts = model(BACKEND);
    const withoutArtifacts = buildViewModel({
      hasWorkspace: true,
      multipleFolders: false,
      analysis: analyze(BACKEND),
      artifacts: []
    });

    expect(withArtifacts.header).toEqual(withoutArtifacts.header);
    expect(withArtifacts.sections).toEqual(withoutArtifacts.sections);
    expect(withArtifacts.header?.summaryLine).toBe('2 matching files · 1 format');

    const analysis = analyze(BACKEND);
    expect(analysis.matchingTokens).toBe(
      analysis.matching.reduce((total, rule) => total + rule.estimatedTokens, 0)
    );
    // Only the two AGENTS.md files are resolved here, so nothing detected or
    // candidate can have contributed a token.
    expect(analysis.rules).toHaveLength(4);
  });

  it('produces no duplicate rows anywhere in the view model', () => {
    const vm = model(BACKEND);
    const everyRow = [
      ...vm.sections.flatMap((section) => section.rules.map((rule) => rule.id)),
      ...vm.notApplicable.flatMap((group) => group.rules.map((rule) => rule.id)),
      ...(vm.otherConfigurations?.rows ?? []).map((row) => row.id),
      ...(vm.possibleCustomInstructions?.rows ?? []).map((row) => row.id)
    ];
    expect(new Set(everyRow).size).toBe(everyRow.length);

    const everyPath = [
      ...vm.sections.flatMap((section) => section.rules.map((rule) => rule.relativePath)),
      ...vm.notApplicable.flatMap((group) => group.rules.map((rule) => rule.relativePath))
    ];
    expect(new Set(everyPath).size).toBe(everyPath.length);
  });

  it('keeps a file recognized by several tools on a single row', () => {
    const vm = model(BACKEND);
    const agents = vm.sections
      .flatMap((section) => section.rules)
      .filter((rule) => rule.relativePath === 'AGENTS.md');
    expect(agents).toHaveLength(1);
    const alsoDetected = (vm.otherConfigurations?.rows ?? []).filter(
      (row) => row.relativePath === 'AGENTS.md'
    );
    expect(alsoDetected).toEqual([]);
  });
});

describe('user declared patterns end to end', () => {
  it('adds the file as a candidate with the user wording', () => {
    const vm = model(BACKEND, ['docs/house-style.md']);
    const row = vm.possibleCustomInstructions?.rows.find(
      (entry) => entry.relativePath === 'docs/house-style.md'
    );
    expect(row?.note).toBe('User-declared · loading not verified');
    expect(row?.tooltip).toContain('agentRulesLens.customInstructionPatterns');
    expect(row?.tooltip).toContain('Not counted');
  });

  it('changes no applicable count', () => {
    const plain = model(BACKEND);
    const configured = model(BACKEND, ['docs/house-style.md', '**/*.ts']);
    expect(configured.header).toEqual(plain.header);
    expect(configured.sections).toEqual(plain.sections);
  });

  it('survives an unusable configuration', () => {
    expect(() => model(BACKEND, ['', '   '])).not.toThrow();
    const vm = model(BACKEND, ['']);
    expect(vm.header?.summaryLine).toBe('2 matching files · 1 format');
  });
});

describe('multi root safety', () => {
  it('never attributes a file of one root to another', () => {
    // Discovery resolves each path against its own root, so a rule from root A
    // cannot appear in the analysis of root B.
    const rootA = [parseFixture('AGENTS.md', 'A')];
    const rootB = [parseFixture('AGENTS.md', 'B')];
    const analysisA = analyzeRules(rootA, { activeFile: 'src/a.ts' });
    const analysisB = analyzeRules(rootB, { activeFile: 'src/b.ts' });

    expect(analysisA.rules).toHaveLength(1);
    expect(analysisB.rules).toHaveLength(1);
    expect(analysisA.rules[0]?.body).toBe('A');
    expect(analysisB.rules[0]?.body).toBe('B');
  });

  it('marks a file outside the analyzed root as unresolvable, not as a match', () => {
    const analysis = analyzeRules(rules, { activeFileOutsideWorkspace: true });
    expect(analysis.matching.filter((rule) => rule.source === 'agents')).toEqual([]);
    const vm = buildViewModel({
      hasWorkspace: true,
      multipleFolders: true,
      analysis,
      artifacts
    });
    expect(vm.kind).toBe('outside-workspace');
    expect(vm.notice).toBe('Multi-folder workspace: only the first folder is analyzed.');
    // The recognized files are still listed, without any applicability claim.
    expect(vm.otherConfigurations?.count).toBe(6);
  });
});

describe('override parsing stays honest', () => {
  it('reads no scope from an override frontmatter or body', () => {
    const override = parseFixture(
      'src/frontend/AGENTS.override.md',
      lines('---', 'scope: backend', '---', 'Use only in the backend.')
    );
    expect(override.unsupportedFields).toEqual(['scope']);
    expect(resolveRule(override, FRONTEND).status).toBe('matching');
    expect(resolveRule(override, BACKEND).status).toBe('notApplicable');
  });
});
