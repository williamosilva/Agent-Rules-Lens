import type {
  ClaudeImport,
  RuleWarning,
  RuleWarningCode
} from '../domain/types';
import { directoryOf, resolveRelativePath, toPosixPath } from '../utils/paths';

/** Files longer than this get an informative warning, never an error. */
export const MAX_RULE_LINES = 200;

export interface WarningTarget {
  relativePath: string;
  fsPath: string;
}

export function createWarning(
  code: RuleWarningCode,
  message: string,
  target: WarningTarget,
  line?: number,
  options: { title?: string } = {}
): RuleWarning {
  const warning: RuleWarning = {
    code,
    message,
    relativePath: target.relativePath,
    fsPath: target.fsPath
  };
  if (line !== undefined) {
    warning.line = line;
  }
  if (options.title !== undefined) {
    warning.title = options.title;
  }
  return warning;
}

export function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

/** 1 based line of a top level frontmatter key, when it can be located. */
export function findKeyLine(content: string, key: string): number | undefined {
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(`^[ \\t]*${key}[ \\t]*:`);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && pattern.test(line)) {
      return index + 1;
    }
  }
  return undefined;
}

export function checkRuleLength(target: WarningTarget, content: string): RuleWarning | undefined {
  const lines = countLines(content);
  if (lines <= MAX_RULE_LINES) {
    return undefined;
  }
  return createWarning(
    'long-rule-file',
    `This file has ${lines} lines. Long instruction files are harder for agents to follow and take up more of the context window.`,
    target
  );
}

/**
 * A Claude import only needs to be checked when it points inside the workspace.
 * Home relative (`~/...`), absolute and remote targets are left alone.
 */
export function shouldValidateImport(target: string): boolean {
  const value = target.trim();
  if (value.length === 0) {
    return false;
  }
  if (value.includes('://')) {
    return false;
  }
  if (value.startsWith('~')) {
    return false;
  }
  const posix = toPosixPath(value);
  if (posix.startsWith('/') || /^[A-Za-z]:\//.test(posix)) {
    return false;
  }
  return posix.includes('/') || posix.includes('.');
}

/** Workspace relative path an import points to, or `undefined` when unchecked. */
export function resolveImportTarget(
  ruleRelativePath: string,
  target: string
): string | undefined {
  if (!shouldValidateImport(target)) {
    return undefined;
  }
  const resolved = resolveRelativePath(directoryOf(ruleRelativePath), target);
  if (resolved === undefined || resolved.length === 0) {
    return undefined;
  }
  return resolved;
}

/** Every workspace relative path that a set of imports refers to. */
export function collectImportTargets(
  ruleRelativePath: string,
  imports: readonly ClaudeImport[]
): string[] {
  const targets = new Set<string>();
  for (const entry of imports) {
    const resolved = resolveImportTarget(ruleRelativePath, entry.target);
    if (resolved !== undefined) {
      targets.add(resolved);
    }
  }
  return [...targets];
}

/** Warnings for Claude imports whose local target does not exist. */
export function validateClaudeImports(
  target: WarningTarget,
  imports: readonly ClaudeImport[],
  exists: (relativePath: string) => boolean
): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const reported = new Set<string>();
  for (const entry of imports) {
    const resolved = resolveImportTarget(target.relativePath, entry.target);
    if (resolved === undefined || reported.has(resolved) || exists(resolved)) {
      continue;
    }
    reported.add(resolved);
    warnings.push(
      createWarning(
        'missing-import',
        `${resolved} was referenced but not found. It will not be added to Claude's context.`,
        target,
        entry.line
      )
    );
  }
  return warnings;
}
