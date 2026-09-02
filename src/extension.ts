import * as vscode from 'vscode';
import {
  FOCUS_COMMAND,
  OPEN_RULE_COMMAND,
  REFRESH_COMMAND,
  VIEW_ID
} from './commandIds';
import { buildWatchPatterns } from './services/ruleDiscoveryPatterns';
import { CUSTOM_PATTERNS_SETTING, RuleStore } from './services/ruleStore';
import { RulesWebviewProvider } from './ui/rulesWebviewProvider';
import { RulesStatusBar } from './ui/statusBar';
import { messagesFor, resolveLocale, type SupportedLocale } from './ui/i18n';

const WATCH_DEBOUNCE_MS = 250;

/** Where the chosen language is remembered between sessions. */
export const LOCALE_STATE_KEY = 'agentRulesLens.locale';

interface Debounced extends vscode.Disposable {
  trigger(): void;
}

function debounce(action: () => void, delay: number): Debounced {
  let timer: NodeJS.Timeout | undefined;
  return {
    trigger(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        action();
      }, delay);
    },
    dispose(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Agent Rules Lens');
  context.subscriptions.push(output);

  const log = (message: string): void => {
    output.appendLine(`[${new Date().toISOString()}] ${message}`);
  };

  // Unexpected failures notify once; routine things such as a rejected webview
  // message are only written to the output channel.
  // Read lazily so a language change is reflected by later notifications.
  let currentLocale: () => SupportedLocale = () => resolveLocale(vscode.env.language);
  let notifiedError = false;
  const reportError = (message: string): void => {
    log(message);
    if (!notifiedError) {
      notifiedError = true;
      void vscode.window.showWarningMessage(messagesFor(currentLocale()).notices.unexpectedProblem);
    }
  };

  // The language lives here, not in the webview: it survives a reload, a
  // theme change and a restart, and it never triggers a new analysis.
  let locale: SupportedLocale = resolveLocale(
    vscode.env.language,
    context.globalState.get(LOCALE_STATE_KEY)
  );
  currentLocale = () => locale;

  const store = new RuleStore(reportError, log);
  const statusBar = new RulesStatusBar(FOCUS_COMMAND);
  const applyLocale = (next: SupportedLocale): void => {
    locale = next;
    void context.globalState.update(LOCALE_STATE_KEY, next);
    sidebar.setLocale(next);
    statusBar.setLocale(next, store.current);
  };
  const sidebar = new RulesWebviewProvider(
    context.extensionUri,
    store,
    log,
    locale,
    applyLocale
  );
  statusBar.setLocale(locale, store.current);

  context.subscriptions.push(
    store,
    statusBar,
    vscode.window.registerWebviewViewProvider(VIEW_ID, sidebar)
  );

  context.subscriptions.push(
    store.onDidChange((state) => {
      sidebar.update();
      statusBar.update(state);
    })
  );

  const reload = (): void => {
    void store.reload();
  };
  const debouncedReload = debounce(reload, WATCH_DEBOUNCE_MS);
  context.subscriptions.push(debouncedReload);

  let watchers: vscode.FileSystemWatcher[] = [];
  const installWatchers = (): void => {
    for (const watcher of watchers) {
      watcher.dispose();
    }
    watchers = buildWatchPatterns(store.userPatterns()).map((pattern) => {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidCreate(() => debouncedReload.trigger());
      watcher.onDidChange(() => debouncedReload.trigger());
      watcher.onDidDelete(() => debouncedReload.trigger());
      return watcher;
    });
  };
  installWatchers();
  context.subscriptions.push({
    dispose: () => {
      for (const watcher of watchers) {
        watcher.dispose();
      }
    }
  });

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      store.resolve();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      reload();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CUSTOM_PATTERNS_SETTING)) {
        installWatchers();
        reload();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(REFRESH_COMMAND, () => {
      reload();
    }),
    vscode.commands.registerCommand(FOCUS_COMMAND, async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    }),
    vscode.commands.registerCommand(
      OPEN_RULE_COMMAND,
      async (fsPath?: string, line?: number) => {
        try {
          const target = fsPath ?? (await pickRule(store, locale));
          if (target === undefined) {
            return;
          }
          await openRuleFile(target, line);
        } catch (error) {
          reportError(`Could not open the rule file: ${describeError(error)}`);
        }
      }
    )
  );

  reload();
}

export function deactivate(): void {
  // Everything is disposed through context.subscriptions.
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

async function pickRule(
  store: RuleStore,
  locale: SupportedLocale
): Promise<string | undefined> {
  const m = messagesFor(locale);
  const rules = store.current.analysis.rules;
  if (rules.length === 0) {
    void vscode.window.showInformationMessage(m.notices.noRuleFiles);
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    rules.map((rule) => ({
      label: rule.relativePath,
      description: messagesFor(locale).status[rule.status],
      detail: rule.scopeDescription,
      fsPath: rule.fsPath
    })),
    { placeHolder: m.notices.pickRule }
  );
  return picked?.fsPath;
}

async function openRuleFile(fsPath: string, line?: number): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  if (line === undefined) {
    return;
  }
  const targetLine = Math.max(0, Math.min(line - 1, document.lineCount - 1));
  const position = new vscode.Position(targetLine, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
}
