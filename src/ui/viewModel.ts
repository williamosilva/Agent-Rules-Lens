import type {
  AgentRule,
  DetectedArtifact,
  RuleAnalysis,
  RuleSource,
  RuleStatus,
  RuleWarning
} from '../domain/types';
import { iconIdForSource } from '../domain/formatCatalog';
import { baseNameOf } from '../utils/paths';
import { formatTokens } from '../utils/tokens';
import {
  DEFAULT_LOCALE,
  messagesFor,
  type Messages,
  SUPPORTED_LOCALES,
  type SupportedLocale
} from './i18n';
import {
  describeGroupCount,
  describeMatchReason,
  findClosestRuleId,
  FORMAT_ORDER,
  localizeWarningSummary,
  localizeWarningTitle,
  sectionLabel
} from './ruleLabels';

/** Visual state of a row. Always paired with a status label, never alone. */
export type RuleTone = 'matching' | 'agent' | 'manual' | 'unknown' | 'invalid' | 'notApplicable';

const STATUS_TONE: Record<RuleStatus, RuleTone> = {
  matching: 'matching',
  agentDecided: 'agent',
  manual: 'manual',
  unknown: 'unknown',
  invalid: 'invalid',
  notApplicable: 'notApplicable'
};

export interface RuleRowViewModel {
  id: string;
  iconId: string;
  /** File name, or the relative path when another file shares that name. */
  label: string;
  relativePath: string;
  fsPath: string;
  statusLabel: string;
  tone: RuleTone;
  reason: string;
  tokens: string;
  tooltip: string;
}

export interface FormatSectionViewModel {
  id: RuleSource;
  iconId: string;
  label: string;
  matchingCount: number;
  optionalCount: number;
  unknownCount: number;
  invalidCount: number;
  countLabel: string;
  tokens: string;
  expanded: boolean;
  rules: RuleRowViewModel[];
  emptyMessage?: string;
}

export interface WarningViewModel {
  id: string;
  title: string;
  location: string;
  /** `CLAUDE.md:4 · docs/architecture.md not found` */
  summary: string;
  tooltip: string;
  relativePath: string;
  fsPath: string;
  line?: number;
  message: string;
}

/** A recognized file whose applicability this extension does not assert. */
export interface ArtifactRowViewModel {
  id: string;
  iconId: string;
  label: string;
  relativePath: string;
  fsPath: string;
  note: string;
  tooltip: string;
}

export interface ArtifactSectionViewModel {
  id: string;
  label: string;
  count: number;
  rows: ArtifactRowViewModel[];
}

export interface RuleGroupViewModel {
  id: string;
  iconId: string;
  label: string;
  count: number;
  rules: RuleRowViewModel[];
}

export interface HeaderViewModel {
  relativePath: string;
  /** `8 matching files · 4 formats` */
  summaryLine: string;
  /** `~277 tokens · configuration analysis only` */
  tokensLine: string;
  tooltip: string;
}

/** The compact PT | EN control that sits beside the path. */
export interface LanguageSwitchViewModel {
  current: SupportedLocale;
  ariaLabel: string;
  options: Array<{ locale: SupportedLocale; label: string; ariaLabel: string; active: boolean }>;
}

export type ViewModelKind =
  | 'no-workspace'
  | 'no-rules'
  | 'no-file'
  | 'outside-workspace'
  | 'analysis';

export interface EmptyStateViewModel {
  title: string;
  body: string;
}

export interface RulesViewModel {
  locale: SupportedLocale;
  language: LanguageSwitchViewModel;
  /** Headings the webview needs for the sections it builds itself. */
  warningsLabel: string;
  notApplicableLabel: string;
  allDetectedLabel: string;
  kind: ViewModelKind;
  notice?: string;
  empty?: EmptyStateViewModel;
  header?: HeaderViewModel;
  sections: FormatSectionViewModel[];
  warnings: WarningViewModel[];
  /** Closed by default: rules whose scope does not cover the open file. */
  notApplicable: RuleGroupViewModel[];
  /** Closed by default: everything detected, used when no file is open. */
  detected: RuleGroupViewModel[];
  detectedCount: number;
  /** Closed by default. Never counted, never given a status. */
  otherConfigurations?: ArtifactSectionViewModel;
  possibleCustomInstructions?: ArtifactSectionViewModel;
}

/** Structural subset of the store state, so this module stays vscode free. */
export interface ViewModelInput {
  hasWorkspace: boolean;
  multipleFolders: boolean;
  analysis: RuleAnalysis;
  /** Detected and candidate files. Never part of any count or estimate. */
  artifacts?: readonly DetectedArtifact[];
  /** Chosen in the sidebar; changing it never re-runs the analysis. */
  locale?: SupportedLocale;
}

/**
 * File names that more than one detected rule file uses. Those rows fall back
 * to the relative path so `AGENTS.md` and `src/backend/AGENTS.md` stay apart.
 */
function findAmbiguousNames(rules: readonly AgentRule[]): ReadonlySet<string> {
  const seen = new Map<string, number>();
  for (const rule of rules) {
    const name = baseNameOf(rule.relativePath);
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, count]) => count > 1).map(([name]) => name));
}

function toRow(
  rule: AgentRule,
  closestId: string | undefined,
  ambiguousNames: ReadonlySet<string>,
  m: Messages
): RuleRowViewModel {
  const reason = describeMatchReason(rule, m, rule.id === closestId);
  // The "Not applicable" section already says so in its heading, so the row
  // spends its one line on the reason instead of repeating the status.
  const statusLabel = rule.status === 'notApplicable' ? '' : m.status[rule.status];
  const tokens = `~${formatTokens(rule.estimatedTokens)}`;
  const fileName = baseNameOf(rule.relativePath);
  const counted = rule.status === 'matching';
  const scope = rule.patterns === undefined ? rule.scopeDescription : rule.patterns.join(', ');
  return {
    id: rule.id,
    iconId: iconIdForSource(rule.source),
    label: ambiguousNames.has(fileName) ? rule.relativePath : fileName,
    relativePath: rule.relativePath,
    fsPath: rule.fsPath,
    statusLabel,
    tone: STATUS_TONE[rule.status],
    reason,
    tokens,
    tooltip: [
      `${m.tooltip.path}: ${rule.relativePath}`,
      `${m.tooltip.status}: ${m.status[rule.status]}`,
      `${m.tooltip.why}: ${reason}`,
      `${m.tooltip.scope}: ${scope}`,
      `${tokens} ${counted ? m.tooltip.tokens : m.tooltip.tokensNotCounted}`,
      `${m.tooltip.fullPath}: ${rule.fsPath}`
    ].join('\n')
  };
}

function groupByFormat(
  prefix: string,
  rules: readonly AgentRule[],
  ambiguousNames: ReadonlySet<string>,
  m: Messages
): RuleGroupViewModel[] {
  const groups: RuleGroupViewModel[] = [];
  for (const source of FORMAT_ORDER) {
    const bySource = rules.filter((rule) => rule.source === source);
    if (bySource.length === 0) {
      continue;
    }
    groups.push({
      id: `${prefix}:${source}`,
      iconId: iconIdForSource(source),
      label: sectionLabel(source, m),
      count: bySource.length,
      rules: bySource.map((rule) => toRow(rule, undefined, ambiguousNames, m))
    });
  }
  return groups;
}

/**
 * One section per detected format. Rules the agent decides about, and rules
 * this extension cannot read, stay next to the ones that match, so nothing is
 * hidden behind a collapsed section.
 */
function buildSections(
  analysis: RuleAnalysis,
  ambiguousNames: ReadonlySet<string>,
  m: Messages
): FormatSectionViewModel[] {
  const sections: FormatSectionViewModel[] = [];
  for (const source of FORMAT_ORDER) {
    const detected = analysis.rules.filter((rule) => rule.source === source);
    if (detected.length === 0) {
      continue;
    }
    const bySource = (group: readonly AgentRule[]): AgentRule[] =>
      group.filter((rule) => rule.source === source);

    const matching = bySource(analysis.matching);
    const optional = bySource(analysis.optional);
    const unknown = bySource(analysis.unknown);
    const invalid = bySource(analysis.invalid);
    const closestId = findClosestRuleId(matching);
    const rules = [
      ...matching.map((rule) => toRow(rule, closestId, ambiguousNames, m)),
      ...optional.map((rule) => toRow(rule, undefined, ambiguousNames, m)),
      ...unknown.map((rule) => toRow(rule, undefined, ambiguousNames, m)),
      ...invalid.map((rule) => toRow(rule, undefined, ambiguousNames, m))
    ];
    const tokens = matching.reduce((total, rule) => total + rule.estimatedTokens, 0);

    sections.push({
      id: source,
      iconId: iconIdForSource(source),
      label: sectionLabel(source, m),
      matchingCount: matching.length,
      optionalCount: optional.length,
      unknownCount: unknown.length,
      invalidCount: invalid.length,
      countLabel: describeGroupCount(
        {
          matching: matching.length,
          optional: optional.length,
          unknown: unknown.length,
          invalid: invalid.length
        },
        m
      ),
      tokens: `~${formatTokens(tokens)}`,
      expanded: rules.length > 0,
      rules,
      ...(rules.length === 0 ? { emptyMessage: m.sections.empty } : {})
    });
  }
  return sections;
}

function toArtifactRow(
  artifact: DetectedArtifact,
  ambiguousNames: ReadonlySet<string>,
  m: Messages
): ArtifactRowViewModel {
  const note = artifact.userDeclared
    ? m.artifacts.userDeclared
    : artifact.supportLevel === 'detected'
      ? m.artifacts.detected(artifact.recognizedBy.join(', '))
      : m.artifacts.candidate;

  const tooltipLines = [artifact.relativePath];
  tooltipLines.push(
    artifact.recognizedBy.length > 0
      ? `${m.tooltip.recognizedBy}: ${artifact.recognizedBy.join(', ')}`
      : m.tooltip.recognizedByNone
  );
  if (artifact.legacy) {
    tooltipLines.push(m.tooltip.legacyName);
  }
  if (artifact.userDeclared) {
    tooltipLines.push(m.tooltip.fromSetting);
  }
  tooltipLines.push(
    artifact.supportLevel === 'detected' ? m.tooltip.supportDetected : m.tooltip.supportCandidate,
    m.tooltip.notCounted,
    artifact.fsPath
  );

  return {
    id: artifact.id,
    iconId: artifact.iconId,
    label: ambiguousNames.has(baseNameOf(artifact.relativePath))
      ? artifact.relativePath
      : baseNameOf(artifact.relativePath),
    relativePath: artifact.relativePath,
    fsPath: artifact.fsPath,
    note,
    tooltip: tooltipLines.join('\n')
  };
}

/**
 * The two collapsed sections below the analysis. Custom agents, prompts and
 * skills are recognized only so they can be left out entirely.
 */
function buildArtifactSections(
  artifacts: readonly DetectedArtifact[],
  m: Messages
): {
  otherConfigurations?: ArtifactSectionViewModel;
  possibleCustomInstructions?: ArtifactSectionViewModel;
} {
  const byPath = new Map<string, DetectedArtifact>();
  for (const artifact of artifacts) {
    if (artifact.supportLevel === 'nonRule') {
      continue;
    }
    // One row per file, whatever the number of tools that recognize it.
    if (!byPath.has(artifact.relativePath)) {
      byPath.set(artifact.relativePath, artifact);
    }
  }

  const sorted = [...byPath.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const seen = new Map<string, number>();
  for (const artifact of sorted) {
    const name = baseNameOf(artifact.relativePath);
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const ambiguousNames = new Set(
    [...seen].filter(([, count]) => count > 1).map(([name]) => name)
  );
  const detected = sorted.filter((artifact) => artifact.supportLevel === 'detected');
  const candidates = sorted.filter((artifact) => artifact.supportLevel === 'candidate');

  return {
    ...(detected.length === 0
      ? {}
      : {
          otherConfigurations: {
            id: 'section:other-configurations',
            label: m.sections.otherConfigurations,
            count: detected.length,
            rows: detected.map((artifact) => toArtifactRow(artifact, ambiguousNames, m))
          }
        }),
    ...(candidates.length === 0
      ? {}
      : {
          possibleCustomInstructions: {
            id: 'section:possible-custom-instructions',
            label: m.sections.possibleCustom,
            count: candidates.length,
            rows: candidates.map((artifact) => toArtifactRow(artifact, ambiguousNames, m))
          }
        })
  };
}

/** Two lines: the title, then `location · what it means`. */
function buildWarnings(warnings: readonly RuleWarning[], m: Messages): WarningViewModel[] {
  return warnings.map((warning, index) => {
    const location =
      warning.line === undefined
        ? warning.relativePath
        : `${warning.relativePath}:${warning.line}`;
    const title = localizeWarningTitle(warning, m);
    return {
      id: `${index}:${warning.code}:${warning.relativePath}`,
      title,
      location,
      summary: `${location} · ${localizeWarningSummary(warning, m)}`,
      relativePath: warning.relativePath,
      fsPath: warning.fsPath,
      ...(warning.line === undefined ? {} : { line: warning.line }),
      message: warning.message,
      tooltip: [
        title,
        warning.message,
        `${m.tooltip.warningIn}: ${location}`,
        `${m.tooltip.fullPath}: ${warning.fsPath}`,
        `${m.tooltip.warningCode}: ${warning.code}`
      ].join('\n')
    };
  });
}

function buildHeader(analysis: RuleAnalysis, formatCount: number, m: Messages): HeaderViewModel {
  const relativePath = analysis.activeFile ?? '';
  return {
    relativePath,
    summaryLine: m.header.summary(analysis.matching.length, formatCount),
    tokensLine: m.header.tokens(`~${formatTokens(analysis.matchingTokens)}`),
    tooltip: m.header.pathTooltip(relativePath)
  };
}

function buildLanguageSwitch(locale: SupportedLocale, m: Messages): LanguageSwitchViewModel {
  return {
    current: locale,
    ariaLabel: m.header.languageSwitch,
    options: SUPPORTED_LOCALES.map((option) => ({
      locale: option,
      label: option === 'pt-BR' ? 'PT' : 'EN',
      ariaLabel: m.header.languageOption(option),
      active: option === locale
    }))
  };
}

function emptyStates(m: Messages): Record<Exclude<ViewModelKind, 'analysis'>, EmptyStateViewModel> {
  return {
    'no-workspace': { title: m.empty.noWorkspaceTitle, body: m.empty.noWorkspaceBody },
    'no-rules': { title: m.empty.noRulesTitle, body: m.empty.noRulesBody },
    'no-file': { title: m.empty.noFileTitle, body: m.empty.noFileBody },
    'outside-workspace': { title: m.empty.outsideTitle, body: m.empty.outsideBody }
  };
}

/** Everything the sidebar needs, derived from the already resolved analysis. */
export function buildViewModel(input: ViewModelInput): RulesViewModel {
  const { analysis } = input;
  const locale = input.locale ?? DEFAULT_LOCALE;
  const m = messagesFor(locale);
  const empty = emptyStates(m);
  const ambiguousNames = findAmbiguousNames(analysis.rules);
  // Detected and candidate files ride along in every state, and never touch a
  // count, a token estimate or a status.
  const artifactSections = buildArtifactSections(input.artifacts ?? [], m);
  const base = {
    locale,
    language: buildLanguageSwitch(locale, m),
    warningsLabel: m.sections.warnings,
    notApplicableLabel: m.sections.notApplicable,
    allDetectedLabel: m.sections.allDetected,
    sections: [] as FormatSectionViewModel[],
    warnings: [] as WarningViewModel[],
    notApplicable: [] as RuleGroupViewModel[],
    detected: [] as RuleGroupViewModel[],
    detectedCount: analysis.rules.length,
    ...artifactSections,
    ...(input.multipleFolders ? { notice: m.notices.multiRoot } : {})
  };

  if (!input.hasWorkspace) {
    return { ...base, kind: 'no-workspace', empty: empty['no-workspace'], detectedCount: 0 };
  }

  if (analysis.rules.length === 0) {
    return { ...base, kind: 'no-rules', empty: empty['no-rules'] };
  }

  if (analysis.activeFileOutsideWorkspace) {
    return {
      ...base,
      kind: 'outside-workspace',
      empty: empty['outside-workspace'],
      detected: groupByFormat('detected', analysis.rules, ambiguousNames, m)
    };
  }

  if (analysis.activeFile === undefined) {
    return {
      ...base,
      kind: 'no-file',
      empty: empty['no-file'],
      detected: groupByFormat('detected', analysis.rules, ambiguousNames, m)
    };
  }

  const sections = buildSections(analysis, ambiguousNames, m);
  const formatCount = sections.filter((section) => section.matchingCount > 0).length;

  return {
    ...base,
    kind: 'analysis',
    header: buildHeader(analysis, formatCount, m),
    sections,
    warnings: buildWarnings(analysis.warnings, m),
    notApplicable: groupByFormat('not-applicable', analysis.notApplicable, ambiguousNames, m)
  };
}
