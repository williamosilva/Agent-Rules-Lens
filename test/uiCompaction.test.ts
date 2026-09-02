import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { USER_DECLARED_FORMAT_ID } from '../src/domain/formatCatalog';
import type { DetectedArtifact, ParsedRule, RuleAnalysis } from '../src/domain/types';
import { classifyArtifact } from '../src/services/artifactClassifier';
import { validateClaudeImports } from '../src/services/ruleDiagnostics';
import { analyzeRules } from '../src/services/ruleResolver';
import { messagesFor, type SupportedLocale } from '../src/ui/i18n';
import { buildViewModel, type RulesViewModel } from '../src/ui/viewModel';
import { loadWorkspace, SAMPLE_ROOT } from './helpers';

const rules: ParsedRule[] = loadWorkspace(SAMPLE_ROOT);
// The loader returns only resolved formats, so the artifacts are added here.
const artifacts: DetectedArtifact[] = [];
for (const relativePath of [
  'GEMINI.md',
  'AI_RULES.md',
  '.github/agents/reviewer.agent.md'
]) {
  const classification = classifyArtifact(relativePath);
  if (classification === undefined || classification.supportLevel === 'resolved') {
    continue;
  }
  artifacts.push({
    id: `${classification.supportLevel}:${relativePath}`,
    relativePath,
    fsPath: join(SAMPLE_ROOT, relativePath),
    supportLevel: classification.supportLevel,
    artifactKind: classification.artifactKind,
    recognizedBy: classification.recognizedBy,
    userDeclared: classification.formatIds.includes(USER_DECLARED_FORMAT_ID),
    legacy: classification.legacy,
    iconId: classification.iconId
  });
}

const BACKEND = 'src/backend/order.service.ts';

function analysisFor(activeFile = BACKEND): RuleAnalysis {
  return analyzeRules(rules, {
    activeFile,
    extraWarnings: rules.flatMap((rule) =>
      validateClaudeImports(rule, rule.imports, (target) => existsSync(join(SAMPLE_ROOT, target)))
    )
  });
}

function model(locale: SupportedLocale, activeFile = BACKEND): RulesViewModel {
  return buildViewModel({
    hasWorkspace: true,
    multipleFolders: false,
    analysis: analysisFor(activeFile),
    artifacts,
    locale
  });
}

const everyRow = (vm: RulesViewModel) => [
  ...vm.sections.flatMap((section) => section.rules),
  ...vm.notApplicable.flatMap((group) => group.rules),
  ...vm.detected.flatMap((group) => group.rules)
];

describe('marks sit on the section heading, not on every row', () => {
  const vm = model('en');

  it('gives each format section its own mark', () => {
    expect(vm.sections.map((section) => `${section.id}:${section.iconId}`)).toEqual([
      'agents:shared-rules',
      'claude:claude',
      'cursor:cursor',
      'copilot:github-copilot'
    ]);
  });

  it('keeps AGENTS.md on the neutral shared mark', () => {
    const agents = vm.sections.find((section) => section.id === 'agents');
    expect(agents?.iconId).toBe('shared-rules');
    expect(agents?.rules.map((rule) => rule.label)).toEqual(['AGENTS.md', 'AGENTS.override.md']);
  });

  it('gives every not applicable subgroup a heading mark too', () => {
    for (const group of vm.notApplicable) {
      expect(group.iconId.length, group.label).toBeGreaterThan(0);
    }
  });

  it('never repeats a vendor mark on the rows of its own section', () => {
    // The renderer only draws a mark for section headings and artifact rows;
    // the rule row keeps its iconId for tooltips and tests but must match its
    // section, so a repeated logo would be a duplicate of the heading.
    for (const section of vm.sections) {
      for (const rule of section.rules) {
        expect(rule.iconId, rule.label).toBe(section.iconId);
      }
    }
    const rendered = readFileSync(
      join(__dirname, '..', 'media', 'rules.js'),
      'utf8'
    );
    // ruleButton must not call icon(); artifactButton and summary must.
    const ruleButton = /function ruleButton\(rule\)\s*\{[\s\S]*?\n  \}/.exec(rendered);
    expect(ruleButton).not.toBeNull();
    expect(ruleButton?.[0]).not.toContain('icon(');
    const artifactButton = /function artifactButton\(artifact\)\s*\{[\s\S]*?\n  \}/.exec(rendered);
    expect(artifactButton?.[0]).toContain('icon(artifact.iconId)');
    expect(rendered).toContain('node.appendChild(icon(iconId))');
  });

  it('keeps a mark on every detected row, because tools can differ', () => {
    const detected = vm.otherConfigurations?.rows ?? [];
    expect(detected.length).toBeGreaterThan(0);
    for (const row of detected) {
      expect(row.iconId.length, row.label).toBeGreaterThan(0);
    }
    expect(detected.find((row) => row.relativePath === 'GEMINI.md')?.iconId).toBe('gemini');
  });

  it('gives candidates the neutral custom mark', () => {
    for (const row of vm.possibleCustomInstructions?.rows ?? []) {
      expect(row.iconId).toBe('custom-rules');
    }
  });
});

describe('compact header', () => {
  it('is the path plus exactly two lines, in both languages', () => {
    const en = model('en').header;
    expect(en?.relativePath).toBe(BACKEND);
    expect(en?.summaryLine).toBe('8 matching files · 4 formats');
    expect(en?.tokensLine).toMatch(/^~\d+ tokens · configuration analysis only$/);
    expect(Object.keys(en ?? {}).sort()).toEqual([
      'relativePath',
      'summaryLine',
      'tokensLine',
      'tooltip'
    ]);

    const pt = model('pt-BR').header;
    expect(pt?.summaryLine).toBe('8 arquivos aplicáveis · 4 formatos');
    expect(pt?.tokensLine).toMatch(/^~\d+ tokens · somente análise de configuração$/);
  });

  it('keeps the full path in the tooltip', () => {
    expect(model('en').header?.tooltip).toContain(BACKEND);
    expect(model('pt-BR').header?.tooltip).toContain(BACKEND);
  });

  it('offers the language switch with the current locale marked', () => {
    const en = model('en');
    expect(en.language.current).toBe('en');
    expect(en.language.options.map((option) => option.label)).toEqual(['PT', 'EN']);
    expect(en.language.options.find((option) => option.active)?.locale).toBe('en');
    expect(en.language.ariaLabel).toBe('Change language');

    const pt = model('pt-BR');
    expect(pt.language.options.find((option) => option.active)?.locale).toBe('pt-BR');
    expect(pt.language.ariaLabel).toBe('Alterar idioma');
    for (const option of pt.language.options) {
      expect(option.ariaLabel.length).toBeGreaterThan(0);
    }
  });
});

describe('compact rows', () => {
  it('says the state in one short line', () => {
    const en = model('en');
    const claude = en.sections.find((section) => section.id === 'claude');
    expect(claude?.rules.map((rule) => `${rule.statusLabel} · ${rule.reason}`)).toEqual([
      'Automatic · Always applies',
      'Automatic · Matches **/*.ts',
      'Automatic · Workspace default'
    ]);

    const pt = model('pt-BR');
    const claudePt = pt.sections.find((section) => section.id === 'claude');
    expect(claudePt?.rules.map((rule) => `${rule.statusLabel} · ${rule.reason}`)).toEqual([
      'Aplicação automática · Sempre se aplica',
      'Aplicação automática · Corresponde a **/*.ts',
      'Aplicação automática · Padrão do projeto'
    ]);
  });

  it('drops the redundant status inside "not applicable"', () => {
    for (const locale of ['en', 'pt-BR'] as SupportedLocale[]) {
      const vm = model(locale);
      const rows = vm.notApplicable.flatMap((group) => group.rules);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.statusLabel, row.label).toBe('');
        expect(row.reason.length, row.label).toBeGreaterThan(0);
      }
    }
    const pt = model('pt-BR');
    const reasons = pt.notApplicable.flatMap((group) => group.rules.map((rule) => rule.reason));
    expect(reasons).toContain('Substituído pela regra do diretório');
    expect(reasons).toContain('O padrão não corresponde a este arquivo');
  });

  it('keeps the whole explanation in the tooltip', () => {
    const vm = model('pt-BR');
    const frontend = vm.notApplicable
      .flatMap((group) => group.rules)
      .find((rule) => rule.label === 'frontend.mdc');
    // The glob is gone from the visible line, but not from the tooltip.
    expect(frontend?.reason).not.toContain('src/frontend');
    expect(frontend?.tooltip).toContain('src/frontend/**/*.tsx');
    expect(frontend?.tooltip).toContain('Escopo');
    expect(frontend?.tooltip).toContain('Caminho completo');
  });

  it('never wraps the token estimate into the name', () => {
    for (const row of everyRow(model('pt-BR'))) {
      expect(row.tokens).toMatch(/^~[\d.k]+$/);
      expect(row.label).not.toContain('\n');
      expect(row.reason).not.toContain('\n');
    }
  });
});

describe('compact warnings', () => {
  it('is a title plus one location line, in both languages', () => {
    const en = model('en');
    expect(en.warnings.map((warning) => warning.title)).toEqual([
      'Missing Claude import',
      'Unsupported Cursor metadata: title'
    ]);
    expect(en.warnings.map((warning) => warning.summary)).toEqual([
      'CLAUDE.md:4 · docs/architecture.md not found',
      '.cursor/rules/release-checklist.mdc:2 · Ignored for matching'
    ]);

    const pt = model('pt-BR');
    expect(pt.warnings.map((warning) => warning.title)).toEqual([
      'Importação do Claude ausente',
      'Metadado do Cursor não suportado: title'
    ]);
    expect(pt.warnings.map((warning) => warning.summary)).toEqual([
      'CLAUDE.md:4 · docs/architecture.md não encontrado',
      '.cursor/rules/release-checklist.mdc:2 · Ignorado na correspondência'
    ]);
  });

  it('keeps the full message and the line number for the click', () => {
    for (const locale of ['en', 'pt-BR'] as SupportedLocale[]) {
      const warning = model(locale).warnings[0];
      expect(warning?.line).toBe(4);
      expect(warning?.fsPath.length).toBeGreaterThan(0);
      expect(warning?.tooltip).toContain(warning?.message ?? '');
      expect(warning?.summary.split('\n')).toHaveLength(1);
    }
  });
});

describe('detected and candidate wording', () => {
  it('uses the short form', () => {
    const en = model('en');
    expect(en.otherConfigurations?.rows[0]?.note).toBe(
      'Gemini, Zed · Applicability not analyzed'
    );
    expect(en.possibleCustomInstructions?.rows[0]?.note).toBe(
      'Custom candidate · loading not verified'
    );

    const pt = model('pt-BR');
    expect(pt.otherConfigurations?.rows[0]?.note).toBe(
      'Gemini, Zed · Aplicabilidade não analisada'
    );
    expect(pt.possibleCustomInstructions?.rows[0]?.note).toBe(
      'Possível instrução · carregamento não verificado'
    );
  });

  it('translates the section headings', () => {
    const pt = model('pt-BR');
    expect(pt.otherConfigurations?.label).toBe('Outras configurações de agentes');
    expect(pt.possibleCustomInstructions?.label).toBe('Possíveis instruções personalizadas');
    expect(pt.warningsLabel).toBe('Avisos');
    expect(pt.notApplicableLabel).toBe('Não se aplica a este arquivo');
    expect(pt.allDetectedLabel).toBe('Todos os arquivos de regras detectados');
    expect(pt.sections.map((section) => section.label)).toEqual([
      'Compartilhado / AGENTS.md',
      'Claude',
      'Cursor',
      'GitHub Copilot'
    ]);
  });
});

describe('changing language changes nothing but words', () => {
  const en = model('en');
  const pt = model('pt-BR');

  it('keeps every count, token estimate and file identical', () => {
    expect(pt.sections.map((s) => s.matchingCount)).toEqual(en.sections.map((s) => s.matchingCount));
    expect(pt.sections.map((s) => s.optionalCount)).toEqual(en.sections.map((s) => s.optionalCount));
    expect(pt.sections.map((s) => s.unknownCount)).toEqual(en.sections.map((s) => s.unknownCount));
    expect(pt.sections.map((s) => s.tokens)).toEqual(en.sections.map((s) => s.tokens));
    expect(everyRow(pt).map((r) => r.tokens)).toEqual(everyRow(en).map((r) => r.tokens));
    expect(everyRow(pt).map((r) => r.fsPath)).toEqual(everyRow(en).map((r) => r.fsPath));
    expect(pt.detectedCount).toBe(en.detectedCount);
    expect(pt.warnings.map((w) => w.fsPath)).toEqual(en.warnings.map((w) => w.fsPath));
    expect(pt.header?.relativePath).toBe(en.header?.relativePath);
  });

  it('keeps the same section identities and default open state', () => {
    expect(pt.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
    expect(pt.sections.map((s) => s.expanded)).toEqual(en.sections.map((s) => s.expanded));
    expect(pt.otherConfigurations?.id).toBe(en.otherConfigurations?.id);
    expect(pt.possibleCustomInstructions?.id).toBe(en.possibleCustomInstructions?.id);
    // The webview keys its collapsed set by these ids, so a language change
    // cannot reset which sections are open.
    expect(everyRow(pt).map((r) => r.id)).toEqual(everyRow(en).map((r) => r.id));
  });

  it('expands the formats and leaves the secondary sections closed', () => {
    for (const section of en.sections) {
      expect(section.expanded, section.label).toBe(true);
    }
    const rendered = readFileSync(join(__dirname, '..', 'media', 'rules.js'), 'utf8');
    expect(rendered).toContain("'section:warnings',\n          model.warningsLabel,");
    // The three secondary lists pass `false` as their default expanded flag.
    expect(rendered).toMatch(/'section:not-applicable',[\s\S]{0,120}false,/);
    expect(rendered).toMatch(/'section:detected',[\s\S]{0,120}false,/);
    expect(rendered).toContain('collapsibleList(section.id, section.label, String(section.count), false, rows)');
  });
});

describe('no old wording survives anywhere in the view model', () => {
  const RETIRED = [
    'matching instruction files',
    'Across 4 formats',
    'rough estimate',
    'Configuration analysis · not live agent context',
    'Applies automatically',
    'Not applicable to this file ·',
    'Detected, applicability not evaluated',
    'Candidate only · agent loading is not confirmed',
    'Agent decides when relevant',
    'Only when explicitly mentioned',
    'Most specific for this path'
  ];

  it.each(['en', 'pt-BR'] as SupportedLocale[])('%s renders none of them', (locale) => {
    const vm = model(locale);
    // Only the lines the user reads: tooltips may keep the long explanation.
    const visible = [
      vm.header?.summaryLine,
      vm.header?.tokensLine,
      vm.warningsLabel,
      vm.notApplicableLabel,
      vm.allDetectedLabel,
      ...vm.sections.flatMap((s) => [s.label, s.countLabel, s.emptyMessage]),
      ...everyRow(vm).flatMap((r) => [r.statusLabel, r.reason]),
      ...vm.warnings.flatMap((w) => [w.title, w.summary]),
      ...(vm.otherConfigurations?.rows ?? []).map((r) => r.note),
      ...(vm.possibleCustomInstructions?.rows ?? []).map((r) => r.note)
    ]
      .filter((value): value is string => typeof value === 'string')
      .join('\n');

    for (const retired of RETIRED) {
      expect(visible, `${locale} still shows "${retired}"`).not.toContain(retired);
    }
  });

  it('does not leak an English fallback into the Portuguese view', () => {
    const pt = model('pt-BR');
    const m = messagesFor('pt-BR');
    expect(pt.sections[0]?.label).toBe(m.sections.agents);
    for (const row of everyRow(pt)) {
      expect(row.statusLabel === '' || row.statusLabel !== messagesFor('en').status.matching).toBe(
        true
      );
    }
  });
});
