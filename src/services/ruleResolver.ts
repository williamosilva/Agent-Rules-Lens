import type {
  AgentRule,
  ParsedRule,
  RuleAnalysis,
  RuleKind,
  RuleSource,
  RuleStatus,
  RuleWarning
} from '../domain/types';
import { matchesAnyGlob } from '../utils/globs';
import { isInsideDirectory, pathDepth } from '../utils/paths';

/** Kinds whose scope is the folder of the rule file plus its descendants. */
const DIRECTORY_SCOPED: ReadonlySet<RuleKind> = new Set<RuleKind>([
  'agents-md',
  'agents-override-md',
  'claude-md',
  'claude-local-md'
]);

/** Kinds whose applicability is declared in the frontmatter. */
const FRONTMATTER_DRIVEN: ReadonlySet<RuleKind> = new Set<RuleKind>([
  'claude-rule',
  'cursor-rule',
  'copilot-scoped-instructions'
]);

const SOURCE_ORDER: Record<RuleSource, number> = {
  agents: 0,
  claude: 1,
  cursor: 2,
  copilot: 3
};

/**
 * Order inside a single folder. `CLAUDE.md` must come before
 * `CLAUDE.local.md`, and project wide Claude files come before both.
 */
const KIND_ORDER: Record<RuleKind, number> = {
  'agents-md': 0,
  'agents-override-md': 1,
  'claude-project-md': 0,
  'claude-rule': 1,
  'claude-md': 2,
  'claude-local-md': 3,
  'cursor-rule': 0,
  'copilot-instructions': 0,
  'copilot-scoped-instructions': 1
};

/** True when the scope of a rule comes from the folder it lives in. */
export function isDirectoryScoped(kind: RuleKind): boolean {
  return DIRECTORY_SCOPED.has(kind);
}

/** How deep the scope of a rule is. Zero means the whole workspace. */
export function scopeDepth(rule: Pick<ParsedRule, 'kind' | 'directory'>): number {
  return DIRECTORY_SCOPED.has(rule.kind) ? pathDepth(rule.directory) : 0;
}

/** Sorts from the broadest scope to the most specific one. */
export function sortRules<T extends AgentRule>(rules: readonly T[]): T[] {
  return [...rules].sort((left, right) => {
    const depth = scopeDepth(left) - scopeDepth(right);
    if (depth !== 0) {
      return depth;
    }
    const source = SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source];
    if (source !== 0) {
      return source;
    }
    const kind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    if (kind !== 0) {
      return kind;
    }
    return left.relativePath.localeCompare(right.relativePath);
  });
}

function describeDirectory(directory: string): string {
  return directory.length === 0
    ? 'Workspace root and all subfolders'
    : `${directory}/ and all subfolders`;
}

function describePatterns(patterns: readonly string[]): string {
  return `Files matching ${patterns.join(', ')}`;
}

function withResolution(
  rule: ParsedRule,
  status: RuleStatus,
  scopeDescription: string,
  cause?: string
): AgentRule {
  const resolved: AgentRule = { ...rule, status, scopeDescription };
  if (cause !== undefined) {
    resolved.cause = cause;
  }
  return resolved;
}

/** `unknown`: a field this extension cannot read decides the applicability. */
function undeterminable(rule: ParsedRule, cause: string): AgentRule {
  return withResolution(rule, 'unknown', 'Applicability cannot be determined', cause);
}

function resolveByPatterns(
  rule: ParsedRule,
  patterns: readonly string[],
  activeFile: string | undefined
): AgentRule {
  const scopeDescription = describePatterns(patterns);
  if (activeFile === undefined) {
    return withResolution(rule, 'notApplicable', scopeDescription);
  }
  const { matched } = matchesAnyGlob(activeFile, patterns);
  return withResolution(rule, matched ? 'matching' : 'notApplicable', scopeDescription);
}

function describeBlockingFields(rule: ParsedRule): string {
  return `invalid ${rule.blockingFields.join(', ')} metadata`;
}

export interface ResolutionContext {
  /** Directories that hold an AGENTS.override.md. */
  overriddenDirectories?: ReadonlySet<string>;
}

/**
 * Decides the status of a single rule for the currently active file, using only
 * the fields the format documents. The rule's own file name and body text are
 * never consulted.
 */
export function resolveRule(
  rule: ParsedRule,
  activeFile: string | undefined,
  context: ResolutionContext = {}
): AgentRule {
  // A frontmatter block that is not valid YAML makes a frontmatter driven file
  // unusable. Formats that carry no frontmatter keep resolving normally.
  if (rule.frontmatterInvalid && FRONTMATTER_DRIVEN.has(rule.kind)) {
    return withResolution(
      rule,
      'invalid',
      'File cannot be read as configuration',
      'malformed YAML frontmatter'
    );
  }

  // A recognized field that decides applicability but holds an unusable value
  // must never fall back to a silent global default.
  if (rule.blockingFields.length > 0) {
    return undeterminable(rule, describeBlockingFields(rule));
  }

  switch (rule.kind) {
    case 'agents-md': {
      const scopeDescription = describeDirectory(rule.directory);
      // An AGENTS.override.md in the same directory replaces this file.
      if (context.overriddenDirectories?.has(rule.directory) === true) {
        return withResolution(
          rule,
          'notApplicable',
          scopeDescription,
          'replaced by AGENTS.override.md in this directory'
        );
      }
      const inScope = activeFile !== undefined && isInsideDirectory(activeFile, rule.directory);
      return withResolution(rule, inScope ? 'matching' : 'notApplicable', scopeDescription);
    }

    case 'agents-override-md':
    case 'claude-md':
    case 'claude-local-md': {
      const scopeDescription = describeDirectory(rule.directory);
      const inScope = activeFile !== undefined && isInsideDirectory(activeFile, rule.directory);
      return withResolution(rule, inScope ? 'matching' : 'notApplicable', scopeDescription);
    }

    case 'claude-project-md':
      return withResolution(rule, 'matching', 'Entire workspace (project memory)');

    case 'copilot-instructions':
      return withResolution(rule, 'matching', 'Entire workspace');

    case 'claude-rule': {
      // No `paths` field is the documented unconditional behaviour.
      if (rule.patterns === undefined) {
        return withResolution(rule, 'matching', 'Entire workspace (no paths field)');
      }
      return resolveByPatterns(rule, rule.patterns, activeFile);
    }

    case 'cursor-rule': {
      if (!rule.hasFrontmatter) {
        return withResolution(
          rule,
          'invalid',
          'File cannot be read as configuration',
          'missing frontmatter block'
        );
      }
      if (rule.alwaysApply === true) {
        return withResolution(rule, 'matching', 'Any file (alwaysApply: true)');
      }
      if (rule.patterns !== undefined) {
        return resolveByPatterns(rule, rule.patterns, activeFile);
      }
      if (rule.description !== undefined) {
        return withResolution(rule, 'agentDecided', 'Requested by the agent when relevant');
      }
      return withResolution(rule, 'manual', 'Only when mentioned manually');
    }

    case 'copilot-scoped-instructions': {
      // A modular file without applyTo must not become a repository wide rule.
      if (rule.patterns === undefined) {
        return undeterminable(rule, 'missing applyTo');
      }
      return resolveByPatterns(rule, rule.patterns, activeFile);
    }

    default:
      return undeterminable(rule, 'unsupported rule kind');
  }
}

export interface AnalyzeOptions {
  /** Workspace relative path of the active file, when there is one. */
  activeFile?: string;
  activeFileOutsideWorkspace?: boolean;
  /** Warnings produced outside parsing, such as unreadable files. */
  extraWarnings?: readonly RuleWarning[];
}

/** Builds everything the UI needs from the parsed rules of a workspace. */
export function analyzeRules(
  rules: readonly ParsedRule[],
  options: AnalyzeOptions = {}
): RuleAnalysis {
  const activeFile = options.activeFile;
  const overriddenDirectories = new Set(
    rules.filter((rule) => rule.kind === 'agents-override-md').map((rule) => rule.directory)
  );
  const resolved = sortRules(
    rules.map((rule) => resolveRule(rule, activeFile, { overriddenDirectories }))
  );
  const byStatus = (...statuses: RuleStatus[]): AgentRule[] =>
    resolved.filter((rule) => statuses.includes(rule.status));

  const matching = byStatus('matching');
  const warnings: RuleWarning[] = [
    ...(options.extraWarnings ?? []),
    ...resolved.flatMap((rule) => rule.warnings)
  ];

  const analysis: RuleAnalysis = {
    activeFileOutsideWorkspace: options.activeFileOutsideWorkspace === true,
    rules: resolved,
    matching,
    optional: byStatus('agentDecided', 'manual'),
    unknown: byStatus('unknown'),
    invalid: byStatus('invalid'),
    notApplicable: byStatus('notApplicable'),
    warnings,
    // Only matching rules are counted, so an unreadable rule can never inflate
    // the estimate.
    matchingTokens: matching.reduce((total, rule) => total + rule.estimatedTokens, 0)
  };
  if (activeFile !== undefined) {
    analysis.activeFile = activeFile;
  }
  return analysis;
}
