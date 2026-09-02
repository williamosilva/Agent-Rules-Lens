import { minimatch } from 'minimatch';
import { normalizeGlobPattern, normalizeRelativePath } from './paths';

export interface PatternFieldResult {
  /** Normalized patterns, `undefined` when the field was absent. */
  patterns?: string[];
  /** True when the field existed but was not a string nor a list of strings. */
  invalid: boolean;
}

/**
 * Splits a comma separated pattern list while keeping brace expansions intact,
 * so `**\/*.{ts,tsx},docs/**` becomes two patterns and not three.
 */
export function splitPatternList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let braceDepth = 0;
  for (const char of value) {
    if (char === '{') {
      braceDepth += 1;
    } else if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
    }
    if (char === ',' && braceDepth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Reads a `paths` / `globs` / `applyTo` frontmatter value. */
export function readPatternField(value: unknown): PatternFieldResult {
  if (value === undefined || value === null) {
    return { invalid: false };
  }
  if (typeof value === 'string') {
    const patterns = splitPatternList(value).map(normalizeGlobPattern);
    return { patterns, invalid: false };
  }
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === 'string')) {
      return { invalid: true };
    }
    const patterns = (value as string[])
      .flatMap((entry) => splitPatternList(entry))
      .map(normalizeGlobPattern);
    return { patterns, invalid: false };
  }
  return { invalid: true };
}

export interface GlobMatchResult {
  matched: boolean;
  /** Patterns minimatch could not process. */
  invalidPatterns: string[];
}

/** Matches a workspace relative path against a list of globs. */
export function matchesAnyGlob(relativePath: string, patterns: readonly string[]): GlobMatchResult {
  const target = normalizeRelativePath(relativePath);
  const invalidPatterns: string[] = [];
  let matched = false;
  for (const rawPattern of patterns) {
    const pattern = normalizeGlobPattern(rawPattern);
    if (pattern.length === 0) {
      continue;
    }
    try {
      if (minimatch(target, pattern, { dot: true })) {
        matched = true;
      }
      // A bare directory glob such as `src/**` should also cover `src` itself.
      if (!matched && pattern.endsWith('/**') && minimatch(target, pattern.slice(0, -3), { dot: true })) {
        matched = true;
      }
    } catch {
      invalidPatterns.push(pattern);
    }
  }
  return { matched, invalidPatterns };
}

/** Patterns minimatch cannot compile. */
export function findInvalidPatterns(patterns: readonly string[]): string[] {
  const invalid: string[] = [];
  for (const pattern of patterns) {
    const normalized = normalizeGlobPattern(pattern);
    if (normalized.length === 0) {
      continue;
    }
    try {
      minimatch('probe.txt', normalized, { dot: true });
    } catch {
      invalid.push(normalized);
    }
  }
  return invalid;
}
