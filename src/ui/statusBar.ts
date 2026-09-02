import * as vscode from 'vscode';
import type { RuleStoreState } from '../services/ruleStore';
import { formatTokens } from '../utils/tokens';
import { DEFAULT_LOCALE, messagesFor, type SupportedLocale } from './i18n';
import { breakdownByFormat, sectionLabel } from './ruleLabels';

/** Status bar summary of the instructions that match the active file. */
export class RulesStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private locale: SupportedLocale = DEFAULT_LOCALE;

  constructor(focusCommand: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = focusCommand;
    this.item.name = 'Agent Rules Lens';
  }

  /** Re-renders in the new language without touching the analysis. */
  setLocale(locale: SupportedLocale, state: RuleStoreState): void {
    this.locale = locale;
    this.update(state);
  }

  update(state: RuleStoreState): void {
    const { analysis } = state;
    if (
      !state.hasWorkspace ||
      analysis.activeFileOutsideWorkspace ||
      analysis.activeFile === undefined
    ) {
      this.item.hide();
      return;
    }

    const m = messagesFor(this.locale);
    const breakdown = breakdownByFormat(analysis.matching);
    this.item.text =
      analysis.matching.length === 0
        ? `$(list-tree) ${m.statusBar.none}`
        : `$(list-tree) ${m.statusBar.text(
            analysis.matching.length,
            breakdown.length,
            analysis.warnings.length
          )}`;

    this.item.tooltip = new vscode.MarkdownString(
      [
        `**${m.statusBar.tooltipTitle}**`,
        '',
        `\`${analysis.activeFile}\``,
        '',
        ...(breakdown.length === 0
          ? [`- ${m.statusBar.noneApply}`]
          : breakdown.map(
              (entry) =>
                `- ${sectionLabel(entry.source, m)}: ${entry.matching} · ~${formatTokens(
                  entry.tokens
                )} tokens`
            )),
        '',
        `- ${m.statusBar.optional}: ${analysis.optional.length}`,
        `- ${m.statusBar.cannotDetermine}: ${analysis.unknown.length}`,
        `- ${m.statusBar.invalid}: ${analysis.invalid.length}`,
        `- ${m.statusBar.warnings}: ${analysis.warnings.length}`,
        '',
        m.statusBar.perFormatNote(`~${formatTokens(analysis.matchingTokens)}`),
        '',
        m.statusBar.disclaimer
      ].join('\n')
    );
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
