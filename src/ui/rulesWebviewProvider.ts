import * as vscode from 'vscode';
import { OPEN_RULE_COMMAND, REFRESH_COMMAND } from '../commandIds';
import type { RuleStore } from '../services/ruleStore';
import { ICON_DIRECTORY, ICON_FILES } from './iconInventory';
import { isSupportedLocale, type SupportedLocale } from './i18n';
import { buildViewModel } from './viewModel';

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function createNonce(): string {
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += NONCE_ALPHABET.charAt(Math.floor(Math.random() * NONCE_ALPHABET.length));
  }
  return nonce;
}

/** Sidebar rendered as a webview, fed by the resolved analysis. */
export class RulesWebviewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;

  /**
   * @param locale current language, owned by the extension host.
   * @param onLocaleChange asked to persist and re-render; never re-analyzes.
   */
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: RuleStore,
    private readonly log: (message: string) => void,
    private locale: SupportedLocale,
    private readonly onLocaleChange: (locale: SupportedLocale) => void
  ) {}

  /** Re-renders the cached analysis in the new language. */
  setLocale(locale: SupportedLocale): void {
    this.locale = locale;
    this.update();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media');

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri]
    };
    view.webview.html = this.buildHtml(view.webview, mediaUri);

    view.webview.onDidReceiveMessage((message: unknown) => {
      this.handleMessage(message);
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.update();
      }
    });
    view.onDidDispose(() => {
      this.view = undefined;
    });

    this.update();
  }

  /** Pushes the current analysis to the webview. */
  update(): void {
    if (this.view === undefined) {
      return;
    }
    void this.view.webview.postMessage({
      type: 'state',
      model: buildViewModel({ ...this.store.current, locale: this.locale }),
      icons: this.iconUris(this.view.webview)
    });
  }

  /**
   * Local URIs for every mark, keyed by icon id. Nothing here can reach the
   * network: each entry is an extension file served through asWebviewUri.
   */
  private iconUris(webview: vscode.Webview): Record<string, { light: string; dark: string }> {
    const base = vscode.Uri.joinPath(this.extensionUri, ...ICON_DIRECTORY);
    const uri = (file: string): string =>
      webview.asWebviewUri(vscode.Uri.joinPath(base, file)).toString();
    const map: Record<string, { light: string; dark: string }> = {};
    for (const [iconId, files] of Object.entries(ICON_FILES)) {
      map[iconId] = { light: uri(files.light), dark: uri(files.dark) };
    }
    return map;
  }

  private buildHtml(webview: vscode.Webview, mediaUri: vscode.Uri): string {
    const nonce = createNonce();
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'rules.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'rules.js'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      // Local extension files only: a mark can never be fetched at runtime.
      `img-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    // No workspace content is interpolated here: the shell is static and the
    // renderer writes every value with textContent.
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <link href="${styleUri.toString()}" rel="stylesheet" />
    <title>Agent Rules Lens</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) {
      return;
    }
    const message = raw as Record<string, unknown>;
    const type = message['type'];

    if (type === 'ready') {
      this.update();
      return;
    }
    if (type === 'refresh') {
      void vscode.commands.executeCommand(REFRESH_COMMAND);
      return;
    }
    if (type === 'setLanguage') {
      const language = message['language'];
      if (!isSupportedLocale(language)) {
        // A bad value is the sender's problem, not something to interrupt over.
        this.log(`Ignored a webview language request: ${JSON.stringify(language)}`);
        return;
      }
      if (language !== this.locale) {
        this.onLocaleChange(language);
      }
      return;
    }
    if (type !== 'openRule' && type !== 'openWarning') {
      return;
    }

    const fsPath = message['fsPath'];
    if (typeof fsPath !== 'string' || !this.isKnownPath(fsPath)) {
      this.log(`Ignored a webview request for an unknown path: ${String(fsPath)}`);
      return;
    }
    void vscode.commands.executeCommand(OPEN_RULE_COMMAND, fsPath, readLine(message['line']));
  }

  /** Only files that the current analysis knows about can be opened. */
  private isKnownPath(fsPath: string): boolean {
    const { analysis, artifacts } = this.store.current;
    return (
      analysis.rules.some((rule) => rule.fsPath === fsPath) ||
      analysis.warnings.some((warning) => warning.fsPath === fsPath) ||
      artifacts.some((artifact) => artifact.fsPath === fsPath)
    );
  }
}

function readLine(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}
