export type RuleSource = 'agents' | 'claude' | 'cursor' | 'copilot';

/**
 * The six outcomes of a static analysis of one rule file:
 *
 * - `matching`: the configuration is recognized and covers the open file.
 * - `notApplicable`: recognized, but it does not cover the open file.
 * - `agentDecided`: the agent chooses, based on a description.
 * - `manual`: only when the rule is mentioned explicitly.
 * - `unknown`: applicability depends on a field this extension cannot read.
 * - `invalid`: the file itself is malformed.
 *
 * Only `matching` rules count towards the totals and the token estimate.
 */
export type RuleStatus =
  | 'matching'
  | 'notApplicable'
  | 'agentDecided'
  | 'manual'
  | 'unknown'
  | 'invalid';

/**
 * A rule file is identified by its kind, not only by its source, because a
 * single source can define several resolution behaviours (for example
 * `CLAUDE.md` is directory scoped while `.claude/CLAUDE.md` is workspace wide).
 */
export type RuleKind =
  | 'agents-md'
  | 'agents-override-md'
  | 'claude-md'
  | 'claude-local-md'
  | 'claude-project-md'
  | 'claude-rule'
  | 'cursor-rule'
  | 'copilot-instructions'
  | 'copilot-scoped-instructions';

export type RuleWarningCode =
  | 'invalid-frontmatter'
  | 'missing-frontmatter'
  | 'missing-apply-to'
  | 'invalid-pattern-field'
  | 'invalid-metadata-type'
  | 'unsupported-metadata'
  | 'invalid-glob'
  | 'missing-import'
  | 'long-rule-file'
  | 'unreadable-file';

export interface RuleWarning {
  code: RuleWarningCode;
  /** Overrides the generic title of the code, for per field diagnostics. */
  title?: string;
  message: string;
  /** Workspace relative path, POSIX separators. */
  relativePath: string;
  /** Absolute path with the separators of the host platform. */
  fsPath: string;
  /** 1 based line number, when the warning can be located inside the file. */
  line?: number;
}

/** A rule file found on disk, before any parsing. */
export interface RuleFile {
  kind: RuleKind;
  source: RuleSource;
  relativePath: string;
  fsPath: string;
  content: string;
}

export interface ClaudeImport {
  /** The raw text found after `@`. */
  target: string;
  /** 1 based line number. */
  line: number;
}

export interface ParsedRule extends RuleFile {
  id: string;
  /** Frontmatter body without the YAML block. */
  body: string;
  frontmatter: Record<string, unknown>;
  hasFrontmatter: boolean;
  /** True when a frontmatter block exists but could not be parsed as YAML. */
  frontmatterInvalid: boolean;
  /**
   * Globs declared by the rule (`paths`, `globs` or `applyTo`), already
   * normalized. `undefined` means the field was absent.
   */
  patterns?: string[];
  /**
   * Recognized fields that decide applicability but hold an unusable value.
   * A rule with any of these resolves to `unknown`, never to a silent default.
   */
  blockingFields: string[];
  /** Frontmatter keys this format does not document. Reported, never used. */
  unsupportedFields: string[];
  description?: string;
  alwaysApply?: boolean;
  /** Directory the rule file lives in, workspace relative, `''` at the root. */
  directory: string;
  imports: ClaudeImport[];
  estimatedTokens: number;
  warnings: RuleWarning[];
}

export interface AgentRule extends ParsedRule {
  status: RuleStatus;
  scopeDescription: string;
  /** Why the status is `unknown` or `invalid`, in a few words. */
  cause?: string;
}

/**
 * A file the catalog recognizes but whose applicability is never asserted:
 * another agent's official configuration, or a hand written candidate.
 */
export interface DetectedArtifact {
  id: string;
  relativePath: string;
  fsPath: string;
  supportLevel: 'detected' | 'candidate' | 'nonRule';
  artifactKind: 'rule' | 'agent' | 'prompt' | 'skill';
  /** Tools known to read this file. Empty for an unattributed candidate. */
  recognizedBy: string[];
  /** True when the user setting is what put this file on the list. */
  userDeclared: boolean;
  /** Mark to show for this file, resolved through the icon inventory. */
  iconId: string;
  legacy: boolean;
}

export interface RuleAnalysis {
  /** Workspace relative path of the active file, when there is one. */
  activeFile?: string;
  /** True when an editor is open on a file that is not part of the workspace. */
  activeFileOutsideWorkspace: boolean;
  rules: AgentRule[];
  /** Recognized and covering the open file. The only group that is counted. */
  matching: AgentRule[];
  /** `agentDecided` and `manual`: the agent, or the user, decides. */
  optional: AgentRule[];
  /** Applicability could not be determined from the declared fields. */
  unknown: AgentRule[];
  /** Malformed files. */
  invalid: AgentRule[];
  /** Recognized, but out of scope for the open file. */
  notApplicable: AgentRule[];
  warnings: RuleWarning[];
  matchingTokens: number;
}
