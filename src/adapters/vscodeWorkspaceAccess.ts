import * as vscode from 'vscode';
import type { DiscoveryPattern } from '../services/ruleDiscoveryPatterns';
import { buildExcludeGlob } from '../services/ruleDiscoveryPatterns';
import type { WorkspaceAccess, WorkspaceFile } from '../services/workspaceAccess';
import { relativeToRoot } from '../utils/paths';

const MAX_RESULTS = 4000;

/** Workspace access backed by the editor, used by the extension. */
export class VsCodeWorkspaceAccess implements WorkspaceAccess {
  private readonly decoder = new TextDecoder('utf-8');

  constructor(private readonly folder: vscode.WorkspaceFolder) {}

  get rootPath(): string {
    return this.folder.uri.fsPath;
  }

  async findFiles(pattern: DiscoveryPattern): Promise<WorkspaceFile[]> {
    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.folder, pattern.include),
      buildExcludeGlob(pattern.exclude),
      MAX_RESULTS
    );

    const files: WorkspaceFile[] = [];
    for (const uri of uris) {
      // Anything outside this folder is not ours to classify: a multi root
      // workspace must never attribute a file to the wrong root.
      const relativePath = relativeToRoot(this.rootPath, uri.fsPath);
      if (relativePath === undefined || relativePath.length === 0) {
        continue;
      }
      files.push({ relativePath, fsPath: uri.fsPath });
    }
    return files;
  }

  async readTextFile(file: WorkspaceFile): Promise<string> {
    return this.decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.file(file.fsPath)));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(
        vscode.Uri.joinPath(this.folder.uri, ...relativePath.split('/'))
      );
      return true;
    } catch {
      return false;
    }
  }
}
