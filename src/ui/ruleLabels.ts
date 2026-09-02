import type { AgentRule, RuleSource, RuleWarning } from '../domain/types';
import { isDirectoryScoped, scopeDepth } from '../services/ruleResolver';
import type { Messages } from './i18n';

/** Formats are shown in this order everywhere in the view. */
export const FORMAT_ORDER: readonly RuleSource[] = ['agents', 'claude', 'cursor', 'copilot'];

export function sectionLabel(source: RuleSource, m: Messages): string {
  return m.sections[source];
}

/**
 * Inside one format, the rule closest to the open file is the most specific.
 * Only relevant when a nested file competes with a broader one.
 */
export function findClosestRuleId(rules: readonly AgentRule[]): string | undefined {
  const scoped = rules.filter((rule) => isDirectoryScoped(rule.kind));
  if (scoped.length < 2) {
    return undefined;
  }
  const deepest = Math.max(...scoped.map(scopeDepth));
  if (deepest === 0) {
    return undefined;
  }
  // `rules` arrives sorted from the broadest to the most specific scope, so the
  // last file at the deepest level is the one that overrides the others.
  return scoped.filter((rule) => scopeDepth(rule) === deepest).at(-1)?.id;
}

/**
 * The resolver states its causes in English, because it is a domain layer and
 * must not know about the interface. This is where they become readable text.
 */
export function localizeCause(cause: string, m: Messages): string {
  if (cause === 'replaced by AGENTS.override.md in this directory') {
    return m.reason.replacedByOverride;
  }
  if (cause === 'malformed YAML frontmatter') {
    return m.reason.malformedFrontmatter;
  }
  if (cause === 'missing frontmatter block') {
    return m.reason.missingFrontmatter;
  }
  if (cause === 'missing applyTo') {
    return m.reason.missingApplyTo;
  }
  const invalid = /^invalid (.+) metadata$/.exec(cause);
  if (invalid !== null) {
    return m.reason.invalidMetadata(invalid[1] ?? '');
  }
  return cause;
}

/** Short answer to "why is this rule listed here?", in one line. */
export function describeMatchReason(rule: AgentRule, m: Messages, isClosest = false): string {
  if (rule.cause !== undefined) {
    return localizeCause(rule.cause, m);
  }
  if (rule.status === 'agentDecided' || rule.status === 'manual' || rule.status === 'unknown') {
    return m.status[rule.status];
  }

  // Out of scope by pattern: the glob itself lives in the tooltip.
  if (rule.status === 'notApplicable' && rule.patterns !== undefined) {
    return m.reason.patternDoesNotMatch;
  }

  switch (rule.kind) {
    case 'agents-override-md':
      return m.reason.directoryOverride;

    case 'agents-md':
    case 'claude-md':
    case 'claude-local-md':
      if (isClosest) {
        return m.reason.mostSpecific;
      }
      return rule.directory.length === 0
        ? m.reason.workspaceDefault
        : m.reason.scopedTo(rule.directory);

    case 'claude-project-md':
    case 'copilot-instructions':
      return m.reason.projectWide;

    case 'claude-rule':
    case 'cursor-rule':
    case 'copilot-scoped-instructions':
      if (rule.patterns !== undefined) {
        return m.reason.matches(rule.patterns.join(', '));
      }
      return m.reason.alwaysApplies;

    default:
      return m.status[rule.status];
  }
}

export interface GroupCounts {
  matching: number;
  optional: number;
  unknown: number;
  invalid: number;
}

/** `1 match · 2 optional`, right aligned in the section heading. */
export function describeGroupCount(counts: GroupCounts, m: Messages): string {
  const parts: string[] = [];
  if (
    counts.matching > 0 ||
    (counts.optional === 0 && counts.unknown === 0 && counts.invalid === 0)
  ) {
    parts.push(m.counts.matches(counts.matching));
  }
  if (counts.optional > 0) {
    parts.push(m.counts.optional(counts.optional));
  }
  if (counts.unknown > 0) {
    parts.push(m.counts.unknown(counts.unknown));
  }
  if (counts.invalid > 0) {
    parts.push(m.counts.invalid(counts.invalid));
  }
  return parts.join(' · ');
}

export interface FormatBreakdown {
  source: RuleSource;
  matching: number;
  optional: number;
  unknown: number;
  tokens: number;
}

/** Per format counts used by the header and the status bar tooltip. */
export function breakdownByFormat(rules: readonly AgentRule[]): FormatBreakdown[] {
  const breakdown: FormatBreakdown[] = [];
  for (const source of FORMAT_ORDER) {
    const bySource = rules.filter((rule) => rule.source === source);
    const matching = bySource.filter((rule) => rule.status === 'matching');
    const optional = bySource.filter(
      (rule) => rule.status === 'agentDecided' || rule.status === 'manual'
    );
    const unknown = bySource.filter((rule) => rule.status === 'unknown');
    if (matching.length === 0 && optional.length === 0 && unknown.length === 0) {
      continue;
    }
    breakdown.push({
      source,
      matching: matching.length,
      optional: optional.length,
      unknown: unknown.length,
      tokens: matching.reduce((total, rule) => total + rule.estimatedTokens, 0)
    });
  }
  return breakdown;
}

/**
 * Diagnostics are produced in English by the domain layer. The tool name and
 * the field are pulled back out so the title can be written in either language.
 */
export function localizeWarningTitle(warning: RuleWarning, m: Messages): string {
  if (warning.title !== undefined) {
    const unsupported = /^Unsupported (.+) metadata: (.+)$/.exec(warning.title);
    if (unsupported !== null) {
      return m.warnings.unsupportedMetadata(unsupported[1] ?? '', unsupported[2] ?? '');
    }
    const invalid = /^Invalid (.+) metadata: (.+)$/.exec(warning.title);
    if (invalid !== null) {
      return m.warnings.invalidMetadata(invalid[1] ?? '', invalid[2] ?? '');
    }
  }
  return m.warnings.title[warning.code];
}

/** The one line that sits beside the location, with the detail in the tooltip. */
export function localizeWarningSummary(warning: RuleWarning, m: Messages): string {
  if (warning.code === 'missing-import') {
    const target = /^(\S+) was referenced/.exec(warning.message);
    if (target !== null) {
      return m.warnings.importNotFound(target[1] ?? '');
    }
  }
  if (warning.code === 'long-rule-file') {
    const lines = /has (\d+) lines/.exec(warning.message);
    if (lines !== null) {
      return m.warnings.lineCount(Number(lines[1]));
    }
  }
  return m.warnings.summary[warning.code];
}
