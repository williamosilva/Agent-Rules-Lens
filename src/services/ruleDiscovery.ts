import { USER_DECLARED_FORMAT_ID } from '../domain/formatCatalog';
import type { DetectedArtifact, RuleFile, RuleWarning } from '../domain/types';
import { normalizeRelativePath } from '../utils/paths';
import { classifyArtifact } from './artifactClassifier';
import { createWarning } from './ruleDiagnostics';
import { buildDiscoveryPatterns } from './ruleDiscoveryPatterns';
import type { WorkspaceAccess, WorkspaceFile } from './workspaceAccess';

export interface DiscoveryResult {
  /** Files of a resolved format, read so they can be parsed. */
  files: RuleFile[];
  /** Recognized files whose applicability is never asserted. Not read. */
  artifacts: DetectedArtifact[];
  warnings: RuleWarning[];
}

/**
 * Finds every file the catalog recognizes inside one workspace root. Only files
 * of a resolved format are read; a detected or candidate file contributes
 * nothing but its path, so it can never affect a token estimate.
 */
export async function discoverRuleFiles(
  access: WorkspaceAccess,
  userPatterns: readonly string[] = []
): Promise<DiscoveryResult> {
  const found = new Map<string, WorkspaceFile>();

  await Promise.all(
    buildDiscoveryPatterns(userPatterns).map(async (pattern) => {
      for (const file of await access.findFiles(pattern)) {
        found.set(file.relativePath, file);
      }
    })
  );

  const files: RuleFile[] = [];
  const artifacts: DetectedArtifact[] = [];
  const warnings: RuleWarning[] = [];

  // Deterministic order: two runs over the same tree produce the same analysis.
  const ordered = [...found.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of ordered) {
    const { relativePath } = file;
    if (relativePath.length === 0) {
      continue;
    }
    const classification = classifyArtifact(relativePath, userPatterns);
    if (classification === undefined) {
      continue;
    }

    if (
      classification.supportLevel === 'resolved' &&
      classification.kind !== undefined &&
      classification.source !== undefined
    ) {
      try {
        files.push({
          kind: classification.kind,
          source: classification.source,
          relativePath,
          fsPath: file.fsPath,
          content: await access.readTextFile(file)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(
          createWarning('unreadable-file', `Could not read this rule file: ${message}`, {
            relativePath,
            fsPath: file.fsPath
          })
        );
      }
      continue;
    }

    if (classification.supportLevel === 'resolved') {
      // A resolved format with no kind cannot happen, but never guess.
      continue;
    }

    artifacts.push({
      id: `${classification.supportLevel}:${relativePath}`,
      relativePath,
      fsPath: file.fsPath,
      supportLevel: classification.supportLevel,
      artifactKind: classification.artifactKind,
      recognizedBy: classification.recognizedBy,
      userDeclared: classification.formatIds.includes(USER_DECLARED_FORMAT_ID),
      legacy: classification.legacy,
      iconId: classification.iconId
    });
  }

  return { files, artifacts, warnings };
}

/** Checks whether a workspace relative path exists on disk. */
export async function workspaceFileExists(
  access: WorkspaceAccess,
  relativePath: string
): Promise<boolean> {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.length === 0) {
    return false;
  }
  return access.exists(normalized);
}
