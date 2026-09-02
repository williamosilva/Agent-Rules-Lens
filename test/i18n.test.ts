import { describe, expect, it } from 'vitest';
import type { AgentRule, RuleWarning, RuleWarningCode } from '../src/domain/types';
import { analyzeRules, resolveRule } from '../src/services/ruleResolver';
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  isSupportedLocale,
  messagesFor,
  resolveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale
} from '../src/ui/i18n';
import {
  describeGroupCount,
  describeMatchReason,
  findClosestRuleId,
  localizeCause,
  localizeWarningSummary,
  localizeWarningTitle,
  sectionLabel
} from '../src/ui/ruleLabels';
import { lines, parseFixture } from './helpers';

const en = messagesFor('en');
const pt = messagesFor('pt-BR');

function resolve(relativePath: string, content: string, activeFile?: string): AgentRule {
  return resolveRule(parseFixture(relativePath, content), activeFile);
}

/** Walks a dictionary and records the shape of every key. */
function shapeOf(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') {
    return [`${prefix}:fn(${value.length})`];
  }
  if (value === null || typeof value !== 'object') {
    return [`${prefix}:value`];
  }
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((key) =>
      shapeOf((value as Record<string, unknown>)[key], prefix.length === 0 ? key : `${prefix}.${key}`)
    );
}

describe('dictionaries', () => {
  it('offers exactly the two supported locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en']);
    expect(Object.keys(DICTIONARIES).sort()).toEqual(['en', 'pt-BR']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('has the same keys, with the same arities, in both languages', () => {
    expect(shapeOf(pt)).toEqual(shapeOf(en));
  });

  it('leaves no string untranslated between the two', () => {
    // Every leaf that is a plain string must differ or be a deliberate proper
    // noun. Anything else means a forgotten translation.
    const keepAsIs = new Set([
      'sections.claude',
      'sections.cursor',
      'sections.copilot',
      'tooltip.status',
      'tooltip.excludeAgent',
      'statusBar.tooltipTitle',
      'warnings.summary.missing-apply-to',
      'reason.missingApplyTo'
    ]);
    const flatten = (value: unknown, prefix = ''): Array<[string, string]> => {
      if (typeof value === 'string') {
        return [[prefix, value]];
      }
      if (value === null || typeof value !== 'object') {
        return [];
      }
      return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) =>
        flatten(inner, prefix.length === 0 ? key : `${prefix}.${key}`)
      );
    };
    const english = new Map(flatten(en));
    for (const [key, value] of flatten(pt)) {
      if (keepAsIs.has(key)) {
        continue;
      }
      expect(value, `${key} was not translated`).not.toBe(english.get(key));
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('covers every warning code in both languages', () => {
    const codes: RuleWarningCode[] = [
      'invalid-frontmatter',
      'missing-frontmatter',
      'missing-apply-to',
      'invalid-pattern-field',
      'invalid-metadata-type',
      'unsupported-metadata',
      'invalid-glob',
      'missing-import',
      'long-rule-file',
      'unreadable-file'
    ];
    for (const locale of SUPPORTED_LOCALES) {
      const m = messagesFor(locale);
      expect(Object.keys(m.warnings.title).sort()).toEqual([...codes].sort());
      expect(Object.keys(m.warnings.summary).sort()).toEqual([...codes].sort());
    }
  });
});

describe('initial locale', () => {
  it('follows the editor language when nothing is saved', () => {
    expect(resolveLocale('pt-br')).toBe('pt-BR');
    expect(resolveLocale('pt')).toBe('pt-BR');
    expect(resolveLocale('PT-BR')).toBe('pt-BR');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('lets a saved preference win over the editor language', () => {
    expect(resolveLocale('en', 'pt-BR')).toBe('pt-BR');
    expect(resolveLocale('pt-br', 'en')).toBe('en');
  });

  it('ignores a saved value that is not a supported locale', () => {
    for (const bad of ['es', '', null, 42, {}, ['pt-BR'], undefined]) {
      expect(resolveLocale('pt-br', bad)).toBe('pt-BR');
      expect(resolveLocale('en', bad)).toBe('en');
    }
  });

  it('validates a locale strictly', () => {
    expect(isSupportedLocale('pt-BR')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    for (const bad of ['pt', 'PT-BR', 'en-US', '', null, 1, {}, []]) {
      expect(isSupportedLocale(bad), String(bad)).toBe(false);
    }
  });
});

describe('pluralisation', () => {
  it.each([
    ['en', 1, '1 match', '1 optional', '1 unknown', '1 invalid'],
    ['en', 2, '2 matches', '2 optional', '2 unknown', '2 invalid'],
    ['pt-BR', 1, '1 aplicável', '1 opcional', '1 indeterminado', '1 inválido'],
    ['pt-BR', 2, '2 aplicáveis', '2 opcionais', '2 indeterminados', '2 inválidos']
  ])('%s counts %i correctly', (locale, n, matches, optional, unknown, invalid) => {
    const m = messagesFor(locale as SupportedLocale);
    expect(m.counts.matches(n as number)).toBe(matches);
    expect(m.counts.optional(n as number)).toBe(optional);
    expect(m.counts.unknown(n as number)).toBe(unknown);
    expect(m.counts.invalid(n as number)).toBe(invalid);
  });

  it('pluralises the status bar in both languages', () => {
    expect(en.statusBar.text(1, 1, 1)).toBe('Agent Rules: 1 file · 1 format · 1 warning');
    expect(en.statusBar.text(8, 4, 2)).toBe('Agent Rules: 8 files · 4 formats · 2 warnings');
    expect(en.statusBar.text(8, 4, 0)).toBe('Agent Rules: 8 files · 4 formats');
    expect(pt.statusBar.text(1, 1, 1)).toBe('Agent Rules: 1 arquivo · 1 formato · 1 aviso');
    expect(pt.statusBar.text(8, 4, 2)).toBe('Agent Rules: 8 arquivos · 4 formatos · 2 avisos');
  });

  it('writes the compact header summary in both languages', () => {
    expect(en.header.summary(8, 4)).toBe('8 matching files · 4 formats');
    expect(en.header.summary(1, 1)).toBe('1 matching file · 1 format');
    expect(en.header.summary(0, 0)).toBe('No matching files');
    expect(pt.header.summary(8, 4)).toBe('8 arquivos aplicáveis · 4 formatos');
    expect(pt.header.summary(1, 1)).toBe('1 arquivo aplicável · 1 formato');
    expect(pt.header.summary(0, 0)).toBe('Nenhum arquivo aplicável');
    expect(en.header.tokens('~277')).toBe('~277 tokens · configuration analysis only');
    expect(pt.header.tokens('~277')).toBe('~277 tokens · somente análise de configuração');
  });
});

describe('section counts', () => {
  it('reads the way the product specifies', () => {
    const counts = (matching: number, optional: number, unknown = 0, invalid = 0) => ({
      matching,
      optional,
      unknown,
      invalid
    });
    expect(describeGroupCount(counts(2, 0), en)).toBe('2 matches');
    expect(describeGroupCount(counts(1, 2), en)).toBe('1 match · 2 optional');
    expect(describeGroupCount(counts(2, 0), pt)).toBe('2 aplicáveis');
    expect(describeGroupCount(counts(1, 2), pt)).toBe('1 aplicável · 2 opcionais');
    expect(describeGroupCount(counts(3, 0, 1), pt)).toBe('3 aplicáveis · 1 indeterminado');
  });

  it('translates the format headings', () => {
    expect(sectionLabel('agents', en)).toBe('Shared / AGENTS.md');
    expect(sectionLabel('agents', pt)).toBe('Compartilhado / AGENTS.md');
    expect(sectionLabel('claude', pt)).toBe('Claude');
  });
});

describe('reasons', () => {
  it('uses the short wording in both languages', () => {
    expect(describeMatchReason(resolve('AGENTS.md', 'x', 'src/a.ts'), en)).toBe('Workspace default');
    expect(describeMatchReason(resolve('AGENTS.md', 'x', 'src/a.ts'), pt)).toBe('Padrão do projeto');

    const override = resolve('src/backend/AGENTS.override.md', 'x', 'src/backend/a.ts');
    expect(describeMatchReason(override, en, true)).toBe('Directory override');
    expect(describeMatchReason(override, pt, true)).toBe('Regra do diretório');

    expect(describeMatchReason(resolve('.claude/rules/s.md', 'x', 'a.ts'), en)).toBe(
      'Always applies'
    );
    expect(describeMatchReason(resolve('.claude/rules/s.md', 'x', 'a.ts'), pt)).toBe(
      'Sempre se aplica'
    );
    expect(describeMatchReason(resolve('.github/copilot-instructions.md', 'x', 'a.ts'), pt)).toBe(
      'Todo o projeto'
    );

    const ts = resolve('.claude/rules/t.md', lines('---', 'paths: "**/*.ts"', '---', 'x'), 'a.ts');
    expect(describeMatchReason(ts, en)).toBe('Matches **/*.ts');
    expect(describeMatchReason(ts, pt)).toBe('Corresponde a **/*.ts');
  });

  it('says only what is left to say inside "not applicable"', () => {
    const outOfScope = resolve(
      '.cursor/rules/f.mdc',
      lines('---', 'alwaysApply: false', 'globs: "src/frontend/**"', '---', 'x'),
      'src/backend/a.ts'
    );
    expect(describeMatchReason(outOfScope, en)).toBe('Pattern does not match this file');
    expect(describeMatchReason(outOfScope, pt)).toBe('O padrão não corresponde a este arquivo');
  });

  it('translates the causes the resolver reports in English', () => {
    expect(localizeCause('replaced by AGENTS.override.md in this directory', en)).toBe(
      'Replaced by directory override'
    );
    expect(localizeCause('replaced by AGENTS.override.md in this directory', pt)).toBe(
      'Substituído pela regra do diretório'
    );
    expect(localizeCause('malformed YAML frontmatter', pt)).toBe('Frontmatter YAML malformado');
    expect(localizeCause('missing applyTo', pt)).toBe('applyTo ausente');
    expect(localizeCause('invalid paths metadata', en)).toBe('Invalid paths metadata');
    expect(localizeCause('invalid paths metadata', pt)).toBe('Metadados paths inválidos');
    // Anything unrecognised survives untouched rather than disappearing.
    expect(localizeCause('something new', pt)).toBe('something new');
  });

  it('marks the closest directory file without repeating the old wording', () => {
    const root = parseFixture('AGENTS.md', 'root');
    const nested = parseFixture('src/backend/AGENTS.md', 'nested');
    const analysis = analyzeRules([root, nested], { activeFile: 'src/backend/a.ts' });
    const closest = findClosestRuleId(analysis.matching);
    const row = analysis.matching.find((rule) => rule.id === closest);
    expect(describeMatchReason(row as AgentRule, en, true)).toBe('Most specific');
    expect(describeMatchReason(row as AgentRule, pt, true)).toBe('Mais específico');
  });
});

describe('warning text', () => {
  const warning = (over: Partial<RuleWarning>): RuleWarning => ({
    code: 'missing-import',
    message: 'docs/architecture.md was referenced but not found. It will not be added.',
    relativePath: 'CLAUDE.md',
    fsPath: '/repo/CLAUDE.md',
    line: 4,
    ...over
  });

  it('keeps the title short and translated', () => {
    expect(localizeWarningTitle(warning({}), en)).toBe('Missing Claude import');
    expect(localizeWarningTitle(warning({}), pt)).toBe('Importação do Claude ausente');
  });

  it('rebuilds a per field title in either language', () => {
    const unsupported = warning({
      code: 'unsupported-metadata',
      title: 'Unsupported Cursor metadata: title',
      message: 'This field was ignored when determining applicability.'
    });
    expect(localizeWarningTitle(unsupported, en)).toBe('Unsupported Cursor metadata: title');
    expect(localizeWarningTitle(unsupported, pt)).toBe('Metadado do Cursor não suportado: title');

    const invalid = warning({
      code: 'invalid-pattern-field',
      title: 'Invalid Claude metadata: paths',
      message: '"paths" must be a glob string or a list of glob strings.'
    });
    expect(localizeWarningTitle(invalid, pt)).toBe('Metadado do Claude inválido: paths');
  });

  it('summarises the consequence in one short line', () => {
    expect(localizeWarningSummary(warning({}), en)).toBe('docs/architecture.md not found');
    expect(localizeWarningSummary(warning({}), pt)).toBe('docs/architecture.md não encontrado');

    const unsupported = warning({
      code: 'unsupported-metadata',
      title: 'Unsupported Cursor metadata: title',
      message: 'This field was ignored when determining applicability.'
    });
    expect(localizeWarningSummary(unsupported, en)).toBe('Ignored for matching');
    expect(localizeWarningSummary(unsupported, pt)).toBe('Ignorado na correspondência');

    const long = warning({
      code: 'long-rule-file',
      message: 'This file has 205 lines. Long instruction files are harder to follow.'
    });
    expect(localizeWarningSummary(long, en)).toBe('205 lines');
    expect(localizeWarningSummary(long, pt)).toBe('205 linhas');
  });
});
