import * as vscode from 'vscode';
import type { DetectedArtifact, ParsedRule, RuleAnalysis, RuleWarning } from '../domain/types';
import { relativeToRoot } from '../utils/paths';
import { collectImportTargets, validateClaudeImports } from './ruleDiagnostics';
import { validateUserPatterns } from './artifactClassifier';
import { discoverRuleFiles, workspaceFileExists } from './ruleDiscovery';
import { parseRuleFile } from './ruleParser';
import { analyzeRules } from './ruleResolver';

export const CUSTOM_PATTERNS_SETTING = 'agentRulesLens.customInstructionPatterns';

export interface RuleStoreState {
  hasWorkspace: boolean;
  /** Multi root workspaces are out of scope: only the first folder is used. */
  multipleFolders: boolean;
  loading: boolean;
  analysis: RuleAnalysis;
  /** Recognized files whose applicability is deliberately not asserted. */
  artifacts: DetectedArtifact[];
}

function emptyAnalysis(): RuleAnalysis {
  return {
    activeFileOutsideWorkspace: false,
    rules: [],
    matching: [],
    optional: [],
    unknown: [],
    invalid: [],
    notApplicable: [],
    warnings: [],
    matchingTokens: 0
  };
}

interface ActiveTarget {
  activeFile?: string;
  outsideWorkspace: boolean;
}

/**
 * Holds the discovered rules and re-resolves them against the active editor.
 * Discovery only runs when rule files change; switching editors just resolves
 * the cached rules again.
 */
export class RuleStore implements vscode.Disposable {
  private parsed: ParsedRule[] = [];
  private artifacts: DetectedArtifact[] = [];
  private discoveryWarnings: RuleWarning[] = [];
  private importWarnings: RuleWarning[] = [];
  private loading = false;
  private reloadQueued = false;
  private lastRejectionSignature = '';

  private state: RuleStoreState = {
    hasWorkspace: false,
    multipleFolders: false,
    loading: false,
    analysis: emptyAnalysis(),
    artifacts: []
  };

  private readonly changeEmitter = new vscode.EventEmitter<RuleStoreState>();
  readonly onDidChange = this.changeEmitter.event;

  /**
   * @param reportError unexpected failures, which may notify the user once.
   * @param note routine information, output channel only.
   */
  constructor(
    private readonly reportError: (message: string) => void,
    private readonly note: (message: string) => void = reportError
  ) {}

  get current(): RuleStoreState {
    return this.state;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  /** Rediscovers, reparses and resolves every rule file. */
  async reload(): Promise<void> {
    if (this.loading) {
      this.reloadQueued = true;
      return;
    }
    this.loading = true;
    try {
      do {
        this.reloadQueued = false;
        await this.reloadOnce();
      } while (this.reloadQueued);
    } finally {
      this.loading = false;
    }
  }

  /** Re-resolves the cached rules, used when the active editor changes. */
  resolve(): void {
    const folder = this.folder();
    const target = this.activeTarget(folder);
    this.publish({
      hasWorkspace: folder !== undefined,
      multipleFolders: (vscode.workspace.workspaceFolders?.length ?? 0) > 1,
      loading: this.loading,
      artifacts: this.artifacts,
      analysis: analyzeRules(this.parsed, {
        ...(target.activeFile !== undefined ? { activeFile: target.activeFile } : {}),
        activeFileOutsideWorkspace: target.outsideWorkspace,
        extraWarnings: [...this.discoveryWarnings, ...this.importWarnings]
      })
    });
  }

  /**
   * Extra globs the user asked to track. Invalid entries are dropped with a
   * note in the output channel, never silently and never fatally.
   */
  userPatterns(): string[] {
    const raw = vscode.workspace.getConfiguration().get(CUSTOM_PATTERNS_SETTING);
    const { patterns, rejected } = validateUserPatterns(raw);
    // The setting is read on every reload; only report a change.
    const signature = rejected.map((entry) => `${entry.value}:${entry.reason}`).join('|');
    if (signature !== this.lastRejectionSignature) {
      this.lastRejectionSignature = signature;
      for (const entry of rejected) {
        // A malformed setting entry is the user's to fix, not a crash to report.
        this.note(
          `Ignored an entry of ${CUSTOM_PATTERNS_SETTING}: ${JSON.stringify(entry.value)} (${entry.reason})`
        );
      }
    }
    return patterns;
  }

  private folder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders !== undefined && folders.length > 0 ? folders[0] : undefined;
  }

  private activeTarget(folder: vscode.WorkspaceFolder | undefined): ActiveTarget {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined || folder === undefined) {
      return { outsideWorkspace: false };
    }
    const uri = editor.document.uri;
    if (uri.scheme !== 'file') {
      return { outsideWorkspace: false };
    }
    const relativePath = relativeToRoot(folder.uri.fsPath, uri.fsPath);
    if (relativePath === undefined || relativePath.length === 0) {
      return { outsideWorkspace: true };
    }
    return { activeFile: relativePath, outsideWorkspace: false };
  }

  private async reloadOnce(): Promise<void> {
    const folder = this.folder();
    if (folder === undefined) {
      this.parsed = [];
      this.artifacts = [];
      this.discoveryWarnings = [];
      this.importWarnings = [];
      this.resolve();
      return;
    }

    try {
      const discovery = await discoverRuleFiles(folder, this.userPatterns());
      this.parsed = discovery.files.map(parseRuleFile);
      this.artifacts = discovery.artifacts;
      this.discoveryWarnings = discovery.warnings;
      this.importWarnings = await this.checkImports(folder);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.reportError(`Rule discovery failed: ${message}`);
    }

    this.resolve();
  }

  private async checkImports(folder: vscode.WorkspaceFolder): Promise<RuleWarning[]> {
    const targets = new Set<string>();
    for (const rule of this.parsed) {
      for (const target of collectImportTargets(rule.relativePath, rule.imports)) {
        targets.add(target);
      }
    }

    const existing = new Set<string>();
    await Promise.all(
      [...targets].map(async (target) => {
        if (await workspaceFileExists(folder, target)) {
          existing.add(target);
        }
      })
    );

    return this.parsed.flatMap((rule) =>
      validateClaudeImports(rule, rule.imports, (target) => existing.has(target))
    );
  }

  private publish(state: RuleStoreState): void {
    this.state = state;
    this.changeEmitter.fire(state);
  }
}
