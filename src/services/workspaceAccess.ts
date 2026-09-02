import type { DiscoveryPattern } from './ruleDiscoveryPatterns';

/** A file the catalog may recognize, located inside the workspace root. */
export interface WorkspaceFile {
  /** Workspace relative, POSIX separators. */
  relativePath: string;
  /** Absolute path with the separators of the host platform. */
  fsPath: string;
}

/**
 * The only filesystem operations discovery needs. VS Code and the local CLI
 * each provide their own implementation so the catalog, the classifier and the
 * resolver stay identical on both sides.
 */
export interface WorkspaceAccess {
  /** Absolute path of the analyzed root. */
  readonly rootPath: string;
  /** Files matching one catalog pattern, already filtered by the exclude list. */
  findFiles(pattern: DiscoveryPattern): Promise<WorkspaceFile[]>;
  readTextFile(file: WorkspaceFile): Promise<string>;
  /** Whether a workspace relative path resolves to an existing entry. */
  exists(relativePath: string): Promise<boolean>;
}
