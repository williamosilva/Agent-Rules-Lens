import * as vscode from 'vscode';
import { USER_DECLARED_FORMAT_ID } from '../domain/formatCatalog';
import type { DetectedArtifact, RuleFile, RuleWarning } from '../domain/types';
import { normalizeRelativePath, relativeToRoot } from '../utils/paths';
import { classifyArtifact } from './artifactClassifier';
import { createWarning } from './ruleDiagnostics';
import { buildDiscoveryPatterns, buildExcludeGlob } from './ruleDiscoveryPatterns';

const MAX_RESULTS = 4000;

export interface DiscoveryResult {
  /** Files of a resolved format, read so they can be parsed. */
  files: RuleFile[];
  /** Recognized files whose applicability is never asserted. Not read. */
  artifacts: DetectedArtifact[];
  warnings: RuleWarning[];
}

/**
 * Finds every file the catalog recognizes inside one workspace folder. Only
 * files of a resolved format are read from disk; a detected or candidate file
 * contributes nothing but its path, so it can never affect a token estimate.
 */
export async function discoverRuleFiles(
  folder: vscode.WorkspaceFolder,
  userPatterns: readonly string[] = []
): Promise<DiscoveryResult> {
  const uris = new Map<string, vscode.Uri>();

  await Promise.all(
    buildDiscoveryPatterns(userPatterns).map(async (pattern) => {
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, pattern.include),
        buildExcludeGlob(pattern.exclude),
        MAX_RESULTS
      );
      for (const uri of found) {
        uris.set(uri.toString(), uri);
      }
    })
  );

  const files: RuleFile[] = [];
  const artifacts: DetectedArtifact[] = [];
  const warnings: RuleWarning[] = [];
  const decoder = new TextDecoder('utf-8');

  for (const uri of uris.values()) {
    // Anything outside this folder is not ours to classify: a multi root
    // workspace must never attribute a file to the wrong root.
    const relativePath = relativeToRoot(folder.uri.fsPath, uri.fsPath);
    if (relativePath === undefined || relativePath.length === 0) {
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
        const bytes = await vscode.workspace.fs.readFile(uri);
        files.push({
          kind: classification.kind,
          source: classification.source,
          relativePath,
          fsPath: uri.fsPath,
          content: decoder.decode(bytes)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(
          createWarning('unreadable-file', `Could not read this rule file: ${message}`, {
            relativePath,
            fsPath: uri.fsPath
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
      fsPath: uri.fsPath,
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
  folder: vscode.WorkspaceFolder,
  relativePath: string
): Promise<boolean> {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized.length === 0) {
    return false;
  }
  try {
    await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, ...normalized.split('/')));
    return true;
  } catch {
    return false;
  }
}
