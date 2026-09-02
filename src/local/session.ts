import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NodeWorkspaceAccess, containedRelativePath } from '../adapters/nodeWorkspaceAccess';
import type { DetectedArtifact, ParsedRule, RuleWarning } from '../domain/types';
import { analyzeRules } from '../services/ruleResolver';
import { loadWorkspaceRules } from '../services/workspaceAnalysis';
import { DEFAULT_LOCALE, type SupportedLocale } from '../ui/i18n';
import { buildViewModel, type RulesViewModel } from '../ui/viewModel';

/** Larger files are listed but never sent to the browser preview. */
export const MAX_PREVIEW_BYTES = 512 * 1024;

const MAX_SEARCH_RESULTS = 100;

export interface AnalyzeOptions {
  file?: string;
  locale?: SupportedLocale;
}

export interface PreviewResult {
  relativePath: string;
  content: string;
  truncated: boolean;
}

export type PreviewError = 'unknown-handle' | 'too-large' | 'unreadable';

/**
 * One analyzed workspace, fixed for the lifetime of the process. Discovery,
 * parsing and resolution all come from the shared services, so the local mode
 * cannot drift from the extension.
 */
export class LocalSession {
  private readonly access: NodeWorkspaceAccess;
  private rules: ParsedRule[] = [];
  private artifacts: DetectedArtifact[] = [];
  private warnings: RuleWarning[] = [];
  /** Opaque handle to absolute path, rebuilt on every analysis. */
  private handles = new Map<string, string>();

  constructor(
    readonly rootPath: string,
    private readonly userPatterns: readonly string[] = []
  ) {
    this.access = new NodeWorkspaceAccess(rootPath);
  }

  get workspaceName(): string {
    return path.basename(this.rootPath);
  }

  /** Runs discovery from scratch. Called at startup and by Refresh. */
  async load(): Promise<void> {
    this.access.invalidate();
    const loaded = await loadWorkspaceRules(this.access, this.userPatterns);
    this.rules = loaded.rules;
    this.artifacts = loaded.artifacts;
    this.warnings = loaded.warnings;
    this.handles = new Map();
  }

  /**
   * The same view model the sidebar renders, with every absolute path replaced
   * by an opaque handle. The browser never learns a filesystem path, and the
   * preview endpoint only accepts handles from the current analysis.
   */
  analyze(options: AnalyzeOptions = {}): RulesViewModel {
    const model = buildViewModel({
      hasWorkspace: true,
      multipleFolders: false,
      artifacts: this.artifacts,
      locale: options.locale ?? DEFAULT_LOCALE,
      analysis: analyzeRules(this.rules, {
        ...(options.file !== undefined ? { activeFile: options.file } : {}),
        activeFileOutsideWorkspace: false,
        extraWarnings: this.warnings
      })
    });
    this.handles = new Map();
    return this.redact(model);
  }

  /** Workspace relative path of a file the user may analyze, if it is one. */
  async resolveFile(candidate: string): Promise<string | undefined> {
    const relative = containedRelativePath(this.rootPath, candidate);
    if (relative === undefined || relative.length === 0) {
      return undefined;
    }
    const absolute = path.join(this.rootPath, ...relative.split('/'));
    try {
      if (!(await fs.stat(absolute)).isFile()) {
        return undefined;
      }
    } catch {
      return undefined;
    }
    return relative;
  }

  /** Relative paths containing every whitespace separated term of the query. */
  async searchFiles(query: string, limit = MAX_SEARCH_RESULTS): Promise<string[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 0);
    const capped = Math.min(Math.max(limit, 1), MAX_SEARCH_RESULTS);
    const results: string[] = [];
    for (const file of await this.access.allFiles()) {
      const haystack = file.relativePath.toLowerCase();
      if (terms.every((term) => haystack.includes(term))) {
        results.push(file.relativePath);
        if (results.length >= capped) {
          break;
        }
      }
    }
    return results;
  }

  async preview(handle: string): Promise<PreviewResult | PreviewError> {
    const absolute = this.handles.get(handle);
    if (absolute === undefined) {
      return 'unknown-handle';
    }
    const relative = containedRelativePath(this.rootPath, absolute);
    if (relative === undefined || relative.length === 0) {
      return 'unknown-handle';
    }
    try {
      const stats = await fs.stat(absolute);
      if (!stats.isFile()) {
        return 'unreadable';
      }
      if (stats.size > MAX_PREVIEW_BYTES) {
        return 'too-large';
      }
      return { relativePath: relative, content: await fs.readFile(absolute, 'utf8'), truncated: false };
    } catch {
      return 'unreadable';
    }
  }

  private handleFor(fsPath: string): string {
    for (const [handle, value] of this.handles) {
      if (value === fsPath) {
        return handle;
      }
    }
    const handle = randomBytes(12).toString('hex');
    this.handles.set(handle, fsPath);
    return handle;
  }

  private redact(model: RulesViewModel): RulesViewModel {
    const rows = <T extends { fsPath: string }>(list: T[]): T[] =>
      list.map((row) => ({ ...row, fsPath: this.handleFor(row.fsPath) }));

    return {
      ...model,
      sections: model.sections.map((section) => ({ ...section, rules: rows(section.rules) })),
      warnings: rows(model.warnings),
      notApplicable: model.notApplicable.map((group) => ({ ...group, rules: rows(group.rules) })),
      detected: model.detected.map((group) => ({ ...group, rules: rows(group.rules) })),
      ...(model.otherConfigurations === undefined
        ? {}
        : {
            otherConfigurations: {
              ...model.otherConfigurations,
              rows: rows(model.otherConfigurations.rows)
            }
          }),
      ...(model.possibleCustomInstructions === undefined
        ? {}
        : {
            possibleCustomInstructions: {
              ...model.possibleCustomInstructions,
              rows: rows(model.possibleCustomInstructions.rows)
            }
          })
    };
  }
}
