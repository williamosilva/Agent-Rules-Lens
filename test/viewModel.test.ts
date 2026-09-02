import { describe, expect, it } from 'vitest';
import type { RuleAnalysis } from '../src/domain/types';
import { analyzeRules } from '../src/services/ruleResolver';
import { buildViewModel, type RulesViewModel } from '../src/ui/viewModel';
import { loadSampleWorkspace, sampleImportWarnings } from './helpers';

const rules = loadSampleWorkspace();

function analyze(activeFile?: string, outside = false): RuleAnalysis {
  return analyzeRules(rules, {
    ...(activeFile === undefined ? {} : { activeFile }),
    activeFileOutsideWorkspace: outside,
    extraWarnings: sampleImportWarnings(rules)
  });
}

function model(activeFile?: string, outside = false): RulesViewModel {
  return buildViewModel({ hasWorkspace: true, multipleFolders: false, analysis: analyze(activeFile, outside) });
}

function emptyAnalysis(): RuleAnalysis {
  return {
    activeFileOutsideWorkspace: false,
    rules: [],
    matching: [],
    optional: [],
    unknown: [],
    invalid: [],
    notApplicable: [],
    warnings: [],
    matchingTokens: 0
  };
}

describe('view model for the backend file', () => {
  const vm = model('src/backend/order.service.ts');

  it('answers the question in the header', () => {
    expect(vm.kind).toBe('analysis');
    expect(vm.header).toMatchObject({
      relativePath: 'src/backend/order.service.ts',
      summaryLine: '8 matching files · 4 formats'
    });
    expect(vm.header?.tokensLine).toMatch(
      /^~\d+(\.\d+k)? tokens · configuration analysis only$/
    );
  });

  it('builds one section per detected format, in order', () => {
    expect(vm.sections.map((section) => section.label)).toEqual([
      'Shared / AGENTS.md',
      'Claude',
      'Cursor',
      'GitHub Copilot'
    ]);
    expect(vm.sections.map((section) => section.countLabel)).toEqual([
      '2 matches',
      '3 matches',
      '1 match · 2 optional',
      '2 matches'
    ]);
    expect(vm.sections.every((section) => section.expanded)).toBe(true);
  });

  it('gives every row a name, a status, a reason and its own token estimate', () => {
    const agents = vm.sections[0];
    expect(agents?.rules.map((rule) => rule.label)).toEqual([
      'AGENTS.md',
      'AGENTS.override.md'
    ]);
    expect(agents?.rules.map((rule) => rule.reason)).toEqual([
      'Workspace default',
      'Directory override'
    ]);
    expect(agents?.rules.every((rule) => rule.statusLabel === 'Automatic')).toBe(true);
    expect(agents?.rules.every((rule) => rule.tone === 'matching')).toBe(true);
    expect(agents?.rules.every((rule) => /^~\d/.test(rule.tokens))).toBe(true);
    expect(agents?.rules[1]?.relativePath).toBe('src/backend/AGENTS.override.md');
    expect(agents?.rules[1]?.tooltip).toContain('src/backend/AGENTS.override.md');
    expect(agents?.rules[1]?.fsPath.length).toBeGreaterThan(0);
  });

  it('keeps optional rules inside the format they came from', () => {
    const cursor = vm.sections.find((section) => section.id === 'cursor');
    expect(cursor?.matchingCount).toBe(1);
    expect(cursor?.optionalCount).toBe(2);
    expect(cursor?.rules.map((rule) => `${rule.label}:${rule.tone}`)).toEqual([
      'always.mdc:matching',
      'payments.mdc:agent',
      'release-checklist.mdc:manual'
    ]);
    expect(cursor?.rules.map((rule) => rule.statusLabel)).toEqual([
      'Automatic',
      'Agent decides',
      'Manual only'
    ]);
  });

  it('shows the relative path only when a file name is duplicated', () => {
    const everyRow = [
      ...vm.sections.flatMap((section) => section.rules),
      ...vm.notApplicable.flatMap((group) => group.rules)
    ];
    const byPath = new Map(everyRow.map((rule) => [rule.relativePath, rule.label]));

    // Two files are called AGENTS.md, so both rows carry their path.
    expect(byPath.get('AGENTS.md')).toBe('AGENTS.md');
    expect(byPath.get('src/backend/AGENTS.md')).toBe('src/backend/AGENTS.md');

    // Every other name is unique, so the bare file name is enough.
    expect(byPath.get('.claude/rules/typescript.md')).toBe('typescript.md');
    expect(byPath.get('.cursor/rules/always.mdc')).toBe('always.mdc');
    expect(byPath.get('.github/copilot-instructions.md')).toBe('copilot-instructions.md');
    expect(byPath.get('CLAUDE.md')).toBe('CLAUDE.md');
  });

  it('never relies on colour alone', () => {
    const everyRow = vm.sections.flatMap((section) => section.rules);
    expect(everyRow.length).toBeGreaterThan(0);
    expect(everyRow.every((rule) => rule.statusLabel.length > 0)).toBe(true);
    expect(everyRow.every((rule) => rule.reason.length > 0)).toBe(true);
  });

  it('describes warnings with a title, a location and the impact', () => {
    expect(vm.warnings).toHaveLength(2);
    expect(vm.warnings[0]).toMatchObject({
      title: 'Missing Claude import',
      location: 'CLAUDE.md:4',
      relativePath: 'CLAUDE.md',
      line: 4,
      message:
        "docs/architecture.md was referenced but not found. It will not be added to Claude's context."
    });
    expect(vm.warnings[0]?.fsPath.length).toBeGreaterThan(0);

    // The demo workspace uses a "title" key Cursor does not document, so the
    // rule keeps its manual status and the ignored field is reported.
    expect(vm.warnings[1]).toMatchObject({
      title: 'Unsupported Cursor metadata: title',
      relativePath: '.cursor/rules/release-checklist.mdc',
      message: 'This field was ignored when determining applicability.'
    });
  });

  it('keeps the rules that do not apply in their own group', () => {
    expect(vm.notApplicable.map((group) => `${group.label}:${group.count}`)).toEqual([
      'Shared / AGENTS.md:1',
      'Cursor:1'
    ]);
    // The AGENTS.md the override replaced explains itself.
    expect(vm.notApplicable[0]?.rules[0]).toMatchObject({
      label: 'src/backend/AGENTS.md',
      reason: 'Replaced by directory override'
    });
    // The heading already says these do not apply, so the row does not repeat it.
    expect(vm.notApplicable[1]?.rules[0]).toMatchObject({
      label: 'frontend.mdc',
      statusLabel: '',
      tone: 'notApplicable',
      reason: 'Pattern does not match this file'
    });
    expect(vm.detected).toEqual([]);
  });
});

describe('view model for the frontend file', () => {
  const vm = model('src/frontend/OrderCard.tsx');

  it('reports a different header', () => {
    expect(vm.header?.summaryLine).toBe('7 matching files · 4 formats');
    expect(vm.header?.relativePath).toBe('src/frontend/OrderCard.tsx');
  });

  it('activates the Cursor frontend rule and drops the backend ones', () => {
    const cursor = vm.sections.find((section) => section.id === 'cursor');
    expect(cursor?.countLabel).toBe('2 matches · 2 optional');
    expect(cursor?.rules.map((rule) => rule.label)).toEqual([
      'always.mdc',
      'frontend.mdc',
      'payments.mdc',
      'release-checklist.mdc'
    ]);
    expect(
      cursor?.rules.find((rule) => rule.label === 'frontend.mdc')?.reason
    ).toBe('Matches src/frontend/**/*.tsx');

    expect(
      vm.notApplicable.map((group) => group.rules.map((rule) => rule.label)).flat()
    ).toEqual(['src/backend/AGENTS.md', 'AGENTS.override.md', 'typescript.md']);
  });
});

describe('view model empty states', () => {
  it('asks the user to open a file when no editor is active', () => {
    const vm = model(undefined);
    expect(vm.kind).toBe('no-file');
    expect(vm.empty).toEqual({
      title: 'Open a code file to analyze its instructions',
      body: 'Agent Rules Lens will show which instructions apply and why.'
    });
    expect(vm.header).toBeUndefined();
    expect(vm.sections).toEqual([]);
    expect(vm.detectedCount).toBe(12);
    expect(vm.detected.map((group) => group.label)).toEqual([
      'Shared / AGENTS.md',
      'Claude',
      'Cursor',
      'GitHub Copilot'
    ]);
  });

  it('explains a file that lives outside the workspace', () => {
    const vm = model('anything', true);
    expect(vm.kind).toBe('outside-workspace');
    expect(vm.empty?.title).toBe('Outside the workspace');
    expect(vm.detected.length).toBeGreaterThan(0);
    expect(vm.header).toBeUndefined();
  });

  it('handles a workspace with no rule files', () => {
    const vm = buildViewModel({
      hasWorkspace: true,
      multipleFolders: false,
      analysis: emptyAnalysis()
    });
    expect(vm.kind).toBe('no-rules');
    expect(vm.empty?.title).toBe('No instruction files found');
    expect(vm.sections).toEqual([]);
    expect(vm.detected).toEqual([]);
  });

  it('handles a window with no folder open', () => {
    const vm = buildViewModel({
      hasWorkspace: false,
      multipleFolders: false,
      analysis: emptyAnalysis()
    });
    expect(vm.kind).toBe('no-workspace');
    expect(vm.empty?.title).toBe('Open a folder to analyze agent instructions');
    expect(vm.detectedCount).toBe(0);
  });

  it('notes a multi folder workspace', () => {
    const vm = buildViewModel({
      hasWorkspace: true,
      multipleFolders: true,
      analysis: analyze('src/backend/order.service.ts')
    });
    expect(vm.notice).toBe('Multi-folder workspace: only the first folder is analyzed.');
  });

  it('reports zero applicable files without pretending otherwise', () => {
    const analysis = analyzeRules(
      rules.filter((rule) => rule.source === 'cursor' && rule.relativePath.includes('frontend')),
      { activeFile: 'docs/readme.md' }
    );
    const vm = buildViewModel({ hasWorkspace: true, multipleFolders: false, analysis });
    expect(vm.header?.summaryLine).toBe('No matching files');
    expect(vm.sections[0]).toMatchObject({
      countLabel: '0 matches',
      expanded: false,
      emptyMessage: 'Nothing from this format applies to this file.'
    });
  });
});
