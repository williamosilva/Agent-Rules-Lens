import {
  type ArtifactKind,
  FORMAT_CATALOG,
  NEVER_A_CANDIDATE,
  type RuleFormatDefinition,
  type SupportLevel,
  SUPPORT_LEVEL_PRECEDENCE,
  USER_DECLARED_FORMAT_ID
} from '../domain/formatCatalog';
import type { RuleKind, RuleSource } from '../domain/types';
import { matchesAnyGlob } from '../utils/globs';
import { baseNameOf, normalizeRelativePath } from '../utils/paths';

export interface ClassifiedArtifact {
  /** Workspace relative path, POSIX separators. */
  relativePath: string;
  supportLevel: SupportLevel;
  artifactKind: ArtifactKind;
  /** Every tool that reads this file, deduplicated and ordered. */
  recognizedBy: string[];
  /** Catalog ids that matched, for diagnostics and tests. */
  formatIds: string[];
  /** Set only when the winning definition is `resolved`. */
  kind?: RuleKind;
  source?: RuleSource;
  /** True when only legacy definitions matched. */
  legacy: boolean;
  /** Mark to show for this file. */
  iconId: string;
}

function matches(definition: RuleFormatDefinition, relativePath: string): boolean {
  return matchesAnyGlob(relativePath, definition.patterns).matched;
}

/**
 * How precisely a pattern names a file. Higher wins, so `.claude/CLAUDE.md`
 * beats `**\/CLAUDE.md` for the same path and the project rule is not mistaken
 * for a folder scoped memory file.
 */
function specificity(pattern: string): number {
  const wildcards = (pattern.match(/[*?]/g) ?? []).length;
  const literal = pattern.replace(/[*?{}[\]]/g, '').length;
  return literal - wildcards * 1000;
}

/** The best score among the patterns of a definition that match the path. */
function definitionSpecificity(definition: RuleFormatDefinition, relativePath: string): number {
  return definition.patterns
    .filter((pattern) => matchesAnyGlob(relativePath, [pattern]).matched)
    .reduce((best, pattern) => Math.max(best, specificity(pattern)), Number.NEGATIVE_INFINITY);
}

/**
 * Classifies one workspace relative path against the whole catalog.
 *
 * A file recognized by several tools produces a single result: the strongest
 * support level wins, and every tool that reads it is listed in `recognizedBy`.
 * Returns `undefined` when nothing in the catalog claims the path.
 */
export function classifyArtifact(
  relativePath: string,
  userPatterns: readonly string[] = []
): ClassifiedArtifact | undefined {
  const path = normalizeRelativePath(relativePath);
  if (path.length === 0) {
    return undefined;
  }

  const matched = FORMAT_CATALOG.filter((definition) => matches(definition, path));
  const userDeclared = userPatterns.length > 0 && matchesAnyGlob(path, userPatterns).matched;

  if (matched.length === 0 && !userDeclared) {
    return undefined;
  }

  const best = matched.reduce<RuleFormatDefinition | undefined>((winner, definition) => {
    if (winner === undefined) {
      return definition;
    }
    return SUPPORT_LEVEL_PRECEDENCE[definition.supportLevel] >
      SUPPORT_LEVEL_PRECEDENCE[winner.supportLevel]
      ? definition
      : winner;
  }, undefined);

  // The user setting only ever adds a file to the candidate group; it never
  // upgrades or downgrades what the catalog already knows.
  const supportLevel: SupportLevel = best?.supportLevel ?? 'candidate';

  // An ordinary repository document never becomes a candidate on its own, even
  // inside a folder that otherwise holds instructions.
  if (
    supportLevel === 'candidate' &&
    !userDeclared &&
    NEVER_A_CANDIDATE.includes(baseNameOf(path))
  ) {
    return undefined;
  }

  const winners = matched.filter((definition) => definition.supportLevel === supportLevel);
  const formatIds = winners.map((definition) => definition.id);
  if (userDeclared) {
    formatIds.push(USER_DECLARED_FORMAT_ID);
  }

  // Every tool that reads the file, whatever level it claimed it at, so a
  // shared file such as AGENTS.md can say who else picks it up. A file that is
  // only a candidate is attributed to no tool at all.
  const namedBy = matched.filter((definition) => definition.supportLevel !== 'candidate');

  // Among equally supported winners the most precise pattern decides the kind.
  const resolvedDefinition = winners
    .filter((definition) => definition.kind !== undefined)
    .sort(
      (left, right) =>
        definitionSpecificity(right, path) - definitionSpecificity(left, path)
    )[0];

  const artifact: ClassifiedArtifact = {
    relativePath: path,
    supportLevel,
    artifactKind: best?.artifactKind ?? 'rule',
    recognizedBy: [...new Set(namedBy.map((definition) => definition.displayName))],
    iconId: (resolvedDefinition ?? winners[0])?.iconId ?? 'generic-agent',
    formatIds,
    // A file name any tool treats as legacy is shown as legacy.
    legacy: matched.some((definition) => definition.legacy === true)
  };

  if (resolvedDefinition?.kind !== undefined) {
    artifact.kind = resolvedDefinition.kind;
  }
  if (resolvedDefinition?.source !== undefined) {
    artifact.source = resolvedDefinition.source;
  }
  return artifact;
}

/** Convenience wrapper for the resolved formats. */
export function classifyResolvedRule(
  relativePath: string
): { kind: RuleKind; source: RuleSource } | undefined {
  const artifact = classifyArtifact(relativePath);
  if (
    artifact === undefined ||
    artifact.supportLevel !== 'resolved' ||
    artifact.kind === undefined ||
    artifact.source === undefined
  ) {
    return undefined;
  }
  return { kind: artifact.kind, source: artifact.source };
}

/**
 * Keeps only the user patterns that are usable and cannot escape the
 * workspace. Anything else is dropped, with a reason for the output channel.
 */
export interface PatternValidation {
  patterns: string[];
  rejected: Array<{ value: string; reason: string }>;
}

export function validateUserPatterns(values: unknown): PatternValidation {
  const patterns: string[] = [];
  const rejected: Array<{ value: string; reason: string }> = [];
  if (!Array.isArray(values)) {
    return { patterns, rejected };
  }

  for (const raw of values) {
    if (typeof raw !== 'string') {
      rejected.push({ value: String(raw), reason: 'not a string' });
      continue;
    }
    const value = raw.trim();
    if (value.length === 0) {
      rejected.push({ value: raw, reason: 'empty' });
      continue;
    }
    const normalized = normalizeRelativePath(value);
    if (normalized.length === 0) {
      rejected.push({ value: raw, reason: 'empty after normalization' });
      continue;
    }
    if (/^[A-Za-z]:/.test(normalized) || raw.trim().startsWith('/') || raw.trim().startsWith('\\')) {
      rejected.push({ value: raw, reason: 'absolute paths are not allowed' });
      continue;
    }
    if (normalized.split('/').includes('..')) {
      rejected.push({ value: raw, reason: 'must stay inside the workspace' });
      continue;
    }
    if (patterns.includes(normalized)) {
      continue;
    }
    patterns.push(normalized);
  }

  return { patterns, rejected };
}
