import type {
  ArtifactSectionViewModel,
  RuleGroupViewModel,
  RuleRowViewModel,
  RulesViewModel
} from '../ui/viewModel';

export const REPORT_SCHEMA_VERSION = 1;

interface ReportRule {
  label: string;
  relativePath: string;
  status: string;
  tone: string;
  reason: string;
  tokens: string;
}

/**
 * The `--json` payload, derived from the same view model the sidebar renders.
 * Absolute paths and opaque handles are left out: everything is workspace
 * relative, so the output is safe to pipe into another tool.
 */
export interface LocalReport {
  schemaVersion: number;
  workspace: string;
  file: string;
  summary: {
    locale: string;
    kind: string;
    summaryLine: string;
    tokensLine: string;
    formats: number;
    matchingRules: number;
    warnings: number;
  };
  groups: Array<{
    id: string;
    label: string;
    countLabel: string;
    matchingCount: number;
    optionalCount: number;
    unknownCount: number;
    invalidCount: number;
    tokens: string;
    rules: ReportRule[];
  }>;
  warnings: Array<{
    title: string;
    summary: string;
    message: string;
    relativePath: string;
    line?: number;
  }>;
  notApplicable: Array<{ label: string; count: number; rules: ReportRule[] }>;
  detectedArtifacts: Array<{ label: string; relativePath: string; note: string }>;
  candidates: Array<{ label: string; relativePath: string; note: string }>;
}

function reportRule(rule: RuleRowViewModel): ReportRule {
  return {
    label: rule.label,
    relativePath: rule.relativePath,
    status: rule.statusLabel,
    tone: rule.tone,
    reason: rule.reason,
    tokens: rule.tokens
  };
}

function reportGroup(group: RuleGroupViewModel): {
  label: string;
  count: number;
  rules: ReportRule[];
} {
  return { label: group.label, count: group.count, rules: group.rules.map(reportRule) };
}

function reportArtifacts(
  section: ArtifactSectionViewModel | undefined
): Array<{ label: string; relativePath: string; note: string }> {
  if (section === undefined) {
    return [];
  }
  return section.rows.map((row) => ({
    label: row.label,
    relativePath: row.relativePath,
    note: row.note
  }));
}

export function buildReport(
  workspace: string,
  file: string,
  model: RulesViewModel
): LocalReport {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    workspace,
    file,
    summary: {
      locale: model.locale,
      kind: model.kind,
      summaryLine: model.header?.summaryLine ?? '',
      tokensLine: model.header?.tokensLine ?? '',
      formats: model.sections.length,
      matchingRules: model.sections.reduce((total, section) => total + section.matchingCount, 0),
      warnings: model.warnings.length
    },
    groups: model.sections.map((section) => ({
      id: section.id,
      label: section.label,
      countLabel: section.countLabel,
      matchingCount: section.matchingCount,
      optionalCount: section.optionalCount,
      unknownCount: section.unknownCount,
      invalidCount: section.invalidCount,
      tokens: section.tokens,
      rules: section.rules.map(reportRule)
    })),
    warnings: model.warnings.map((warning) => ({
      title: warning.title,
      summary: warning.summary,
      message: warning.message,
      relativePath: warning.relativePath,
      ...(warning.line === undefined ? {} : { line: warning.line })
    })),
    notApplicable: model.notApplicable.map(reportGroup),
    detectedArtifacts: reportArtifacts(model.otherConfigurations),
    candidates: reportArtifacts(model.possibleCustomInstructions)
  };
}
