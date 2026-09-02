import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeWorkspaceAccess } from '../../src/adapters/nodeWorkspaceAccess';
import { analyzeRules } from '../../src/services/ruleResolver';
import { loadWorkspaceRules } from '../../src/services/workspaceAnalysis';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../../src/ui/i18n';
import { buildViewModel } from '../../src/ui/viewModel';
import { detectedFilesText, localMessagesFor, type LocalMessages } from '../../src/local/localMessages';
import { LocalSession } from '../../src/local/session';
import { SAMPLE_ROOT } from '../helpers';

const REPO_ROOT = resolve(__dirname, '..', '..');
const read = (...parts: string[]): string => readFileSync(join(REPO_ROOT, ...parts), 'utf8');

const HTML = read('media', 'local', 'index.html');
const CSS = read('media', 'local', 'local.css');
const JS = read('media', 'local', 'local.js');
const RENDERER = read('media', 'shared', 'rulesRenderer.js');
const SIDEBAR = read('media', 'rules.js');

describe('local dictionary', () => {
  it('offers both locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-BR', 'en']);
    expect(localMessagesFor('en').workspaceLabel).toBe('Workspace');
    expect(localMessagesFor('pt-BR').workspaceLabel).toBe('Projeto');
  });

  it('uses a short badge for the mode, not a sentence repeating the name', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const badge = localMessagesFor(locale).modeLabel;
      expect(badge).toBe('Local');
      expect(badge).not.toContain('Agent Rules Lens');
      expect(badge.split(' ').length).toBe(1);
    }
  });

  it('says nothing about uploading', () => {
    expect(localMessagesFor('en').privacy).toBe(
      'Runs locally. Your files stay on this computer.'
    );
    expect(localMessagesFor('pt-BR').privacy).toBe(
      'Executado localmente. Seus arquivos permanecem neste computador.'
    );
    for (const locale of SUPPORTED_LOCALES) {
      expect(JSON.stringify(localMessagesFor(locale))).not.toMatch(/upload/i);
    }
  });

  it('uses browser wording for the empty state, not the editor wording', () => {
    expect(localMessagesFor('en').emptyTitle).toBe(
      'Choose a code file to see which instructions apply'
    );
    expect(localMessagesFor('en').emptyBody).toBe(
      'Use the search to select a file from the workspace.'
    );
    expect(localMessagesFor('pt-BR').emptyTitle).toBe(
      'Escolha um arquivo para ver quais instruções se aplicam'
    );
    expect(localMessagesFor('pt-BR').emptyBody).toBe(
      'Use a busca para selecionar um arquivo do projeto.'
    );
    for (const locale of SUPPORTED_LOCALES) {
      expect(localMessagesFor(locale).emptyTitle).not.toContain('Open a code file');
      expect(localMessagesFor(locale).emptyTitle).not.toContain('Abra um arquivo');
    }
  });

  it('describes the empty state without naming a screen position', () => {
    // The picker sits beside the analysis on a desktop and above it on a phone.
    for (const locale of SUPPORTED_LOCALES) {
      const body = localMessagesFor(locale).emptyBody.toLowerCase();
      for (const direction of ['left', 'right', 'above', 'below', 'esquerda', 'direita', 'acima', 'abaixo', 'ao lado']) {
        expect(body, `${locale} / ${direction}`).not.toContain(direction);
      }
    }
  });

  it('translates every leaf, with no English left in Portuguese', () => {
    const en = localMessagesFor('en') as unknown as Record<string, unknown>;
    const pt = localMessagesFor('pt-BR') as unknown as Record<string, unknown>;
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      const a = en[key];
      const b = pt[key];
      expect(typeof b, key).toBe(typeof a);
      // `modeLabel` is the badge text, the same word in both languages.
      if (typeof a === 'string' && key !== 'modeLabel') {
        expect(b, key).not.toBe(a);
      }
    }
  });

  it.each<SupportedLocale>(['en', 'pt-BR'])('has no empty string in %s', (locale) => {
    const messages = localMessagesFor(locale) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(messages)) {
      if (typeof value === 'string') {
        expect(value.trim().length, key).toBeGreaterThan(0);
      } else {
        for (const [form, text] of Object.entries(value as Record<string, string>)) {
          expect(text.trim().length, `${key}.${form}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('detected file count', () => {
  it.each([
    [0, 'No instruction files detected in this workspace'],
    [1, '1 instruction file detected in this workspace'],
    [2, '2 instruction files detected in this workspace'],
    [12, '12 instruction files detected in this workspace']
  ])('renders %i in English', (count, expected) => {
    expect(detectedFilesText(localMessagesFor('en'), count)).toBe(expected);
  });

  it.each([
    [0, 'Nenhum arquivo de instruções detectado neste projeto'],
    [1, '1 arquivo de instruções detectado neste projeto'],
    [2, '2 arquivos de instruções detectados neste projeto'],
    [12, '12 arquivos de instruções detectados neste projeto']
  ])('renders %i in Portuguese', (count, expected) => {
    expect(detectedFilesText(localMessagesFor('pt-BR'), count)).toBe(expected);
  });

  it('leaves no placeholder behind', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(detectedFilesText(localMessagesFor(locale), 7)).not.toContain('{count}');
    }
  });

  it('matches the workspace the analysis actually found', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const model = session.analyze({ locale: 'en' });
    expect(model.detectedCount).toBe(12);
    expect(detectedFilesText(localMessagesFor('en'), model.detectedCount)).toBe(
      '12 instruction files detected in this workspace'
    );
  });

  it('is serialisable, because the dictionary crosses HTTP as JSON', () => {
    const roundTrip = JSON.parse(JSON.stringify(localMessagesFor('en'))) as LocalMessages;
    expect(roundTrip.detectedFiles).toEqual(localMessagesFor('en').detectedFiles);
    expect(detectedFilesText(roundTrip, 3)).toContain('3');
  });
});

describe('page structure', () => {
  it('is semantic, with a labelled combobox', () => {
    expect(HTML).toContain('<header class="topbar">');
    expect(HTML).toContain('<main class="layout">');
    expect(HTML).toContain('<label class="field-label" for="file-input"');
    expect(HTML).toContain('role="combobox"');
    expect(HTML).toContain('aria-expanded="false"');
    expect(HTML).toContain('aria-controls="suggestions"');
    expect(HTML).toContain('role="listbox"');
    expect(HTML).toContain('aria-labelledby="picker-title"');
    expect(HTML).toContain('aria-labelledby="analysis-title"');
  });

  it('names the product once and labels the project separately', () => {
    expect((HTML.match(/Agent Rules Lens/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(HTML).toContain('<h1 class="brand-name">Agent Rules Lens</h1>');
    expect(HTML).toContain('<span class="badge" id="mode-label">');
    expect(HTML).toContain('id="workspace-label"');
    expect(JS).toContain("els.workspaceLabel.textContent = t.workspaceLabel ? t.workspaceLabel + ':' : ''");
  });

  it('keeps the badge plain', () => {
    expect(CSS).toMatch(/\.badge\s*\{[^}]*border:\s*1px solid/s);
    expect(CSS).not.toMatch(/\.badge\s*\{[^}]*(gradient|box-shadow)/s);
  });

  it('announces status changes and disables analysis until a file is named', () => {
    expect(HTML).toContain('role="status"');
    expect(HTML).toContain('aria-live="polite"');
    expect(HTML).toMatch(/id="analyze"[^>]*disabled/);
  });

  it('uses real buttons everywhere', () => {
    const clickable = HTML.match(/<(a|div|span)[^>]*onclick/gi) ?? [];
    expect(clickable).toEqual([]);
    expect(HTML.match(/<button/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    for (const button of HTML.match(/<button[^>]*>/g) ?? []) {
      expect(button).toContain('type="button"');
    }
  });

  it('loads only local assets, with no inline script and no CDN', () => {
    expect(HTML).toContain('src="/assets/rulesRenderer.js"');
    expect(HTML).toContain('src="/assets/local.js"');
    expect(HTML).not.toMatch(/<script(?![^>]*src=)/);
    expect(HTML).not.toMatch(/https?:\/\//);
    expect(HTML).not.toMatch(/fonts\.googleapis|cdn|unpkg/i);
    expect(CSS).not.toMatch(/https?:\/\/|@import/);
  });

  it('keeps the token in a meta tag the script removes', () => {
    expect(HTML).toContain('name="arl-token"');
    expect(JS).toContain('tokenMeta.remove()');
    expect(JS).not.toMatch(/localStorage|sessionStorage/);
  });
});

describe('layout', () => {
  it('centres a wide container and splits into two columns on desktop', () => {
    expect(CSS).toMatch(/max-width:\s*1280px/);
    expect(CSS).toContain('@media (min-width: 960px)');
    expect(CSS).toMatch(/grid-template-columns:\s*minmax\(300px,\s*320px\)\s*minmax\(0,\s*1fr\)/);
  });

  it('stacks the picker above the analysis on narrow screens', () => {
    expect(CSS).toMatch(/\.layout\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(CSS).toContain('@media (max-width: 959px)');
    expect(CSS).toContain('align-content: start');
  });

  it('gives the format sections two columns only when there is room', () => {
    expect(CSS).toContain('@media (min-width: 1100px)');
    expect(CSS).toMatch(/\.section-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(CSS).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // Each section keeps its own height rather than stretching to a neighbour.
    expect(CSS).toMatch(/\.section-grid\s*\{[^}]*align-items:\s*start/);
  });

  it('lets long text wrap instead of clipping it', () => {
    expect(CSS).toMatch(/overflow-wrap:\s*anywhere/);
    expect(CSS).toMatch(/white-space:\s*normal/);
  });

  it('defines both themes and no theme switcher', () => {
    expect(CSS).toContain('@media (prefers-color-scheme: dark)');
    expect(CSS).toMatch(/--local-page:\s*#f6f8fa/);
    expect(CSS).toMatch(/--local-page:\s*#010409/);
    expect(HTML).not.toMatch(/theme-toggle|data-theme/);
  });

  it('paints the brand mark with the text colour, so it works in both themes', () => {
    // The shared SVG is stroke-only around currentColor, which an <img> cannot
    // resolve; a mask takes the page colour instead.
    expect(HTML).toContain('<span class="brand-mark"');
    expect(HTML).not.toMatch(/<img[^>]*brand-mark/);
    expect(CSS).toMatch(/\.brand-mark\s*\{[^}]*background-color:\s*var\(--vscode-foreground\)/s);
    expect(CSS).toMatch(/mask:\s*url\('\/assets\/logo\.svg'\)/);
  });

  it('honours reduced motion', () => {
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none/s);
  });

  it('marks a disabled button and an error without relying on colour alone', () => {
    expect(CSS).toMatch(/\.button:disabled\s*\{[^}]*cursor:\s*not-allowed/s);
    expect(CSS).toMatch(/\.status\.is-error\s*\{[^}]*font-weight:\s*600/s);
    expect(CSS).toMatch(/:focus-visible[^{]*\{[^}]*outline:/s);
  });
});

describe('picker behaviour', () => {
  it('focuses the field on open', () => {
    expect(JS).toContain('els.input.focus()');
  });

  it('handles the four required keys', () => {
    expect(JS).toContain("event.key === 'ArrowDown'");
    expect(JS).toContain("event.key === 'ArrowUp'");
    expect(JS).toContain("event.key === 'Enter'");
    expect(JS).toContain("event.key === 'Escape'");
  });

  it('wraps the keyboard selection around the list', () => {
    expect(JS).toMatch(/next\s*=\s*state\.matches\.length - 1/);
    expect(JS).toMatch(/next\s*=\s*0/);
  });

  it('maintains the combobox and option state', () => {
    expect(JS).toContain("setAttribute('aria-expanded', 'true')");
    expect(JS).toContain("setAttribute('aria-expanded', 'false')");
    expect(JS).toContain('aria-activedescendant');
    expect(JS).toContain("setAttribute('aria-selected'");
  });

  it('closes the list on an outside click', () => {
    expect(JS).toMatch(/document\.addEventListener\('click'[\s\S]{0,200}closeSuggestions/);
  });

  it('debounces the search', () => {
    expect(JS).toMatch(/SEARCH_DEBOUNCE_MS\s*=\s*\d+/);
    expect(JS).toContain('window.setTimeout');
  });

  it('never uses alert, confirm or prompt for an error', () => {
    expect(JS).not.toMatch(/\b(alert|confirm|prompt)\s*\(/);
    expect(JS).toContain("setStatus(text().analysisFailed, 'error')");
    expect(JS).toContain('fileNotFound');
  });

  it('blocks a second analysis while one is running', () => {
    expect(JS).toMatch(/if \(state\.busy\) \{\s*return Promise\.resolve\(\);/);
    expect(JS).toMatch(/els\.analyze\.disabled\s*=\s*state\.busy/);
  });

  it('shows a loading state while analysing', () => {
    expect(JS).toContain("setStatus(text().analyzing, 'busy')");
    expect(CSS).toContain('.status.is-busy::before');
  });

  it('cancels a pending search when an analysis starts', () => {
    // Otherwise a late "no results" would overwrite the analysis outcome.
    expect(JS).toMatch(/clearTimeout\(state\.searchTimer\);\s*\n\s*var payload/);
    expect(JS).toMatch(/if \(!state\.busy\) \{\s*setStatus\(text\(\)\.noResults/);
  });

  it('changes language without repeating discovery', () => {
    // Only `refresh: true` reloads the workspace, and setLocale never sets it.
    expect(JS).toMatch(/function setLocale[\s\S]{0,320}void analyze\(\);/);
    expect(JS).not.toMatch(/function setLocale[\s\S]{0,320}refresh/);
  });

  it('takes every string from the server dictionary', () => {
    // No language ternaries and no wording decided in the page.
    expect(JS).not.toMatch(/locale === 'pt-BR'\s*\?\s*'[A-Za-zÀ-ú]{4,}/);
    expect(JS).toContain('state.strings[state.locale]');
  });
});

describe('the shared renderer stays sidebar-first', () => {
  it('only groups sections when a caller asks for the dashboard', () => {
    expect(RENDERER).toContain("options.presentation === 'dashboard'");
    expect(RENDERER).toContain("element('div', 'section-grid')");
    expect(RENDERER).toMatch(/var sectionHost = root;/);
  });

  it('only suppresses the empty state when a caller asks', () => {
    expect(RENDERER).toContain('options.suppressEmptyState !== true');
  });

  it('leaves the VS Code webview on the default presentation', () => {
    expect(SIDEBAR).not.toContain('presentation');
    expect(SIDEBAR).not.toContain('suppressEmptyState');
    expect(SIDEBAR).toContain('showLanguageSwitch: true');
    expect(SIDEBAR).toContain('acquireVsCodeApi()');
    expect(SIDEBAR).toContain("vscode.postMessage({ type: 'openRule'");
  });

  it('is the local page that opts in', () => {
    expect(JS).toContain("presentation: 'dashboard'");
    expect(JS).toContain('suppressEmptyState: true');
    expect(JS).toContain('showLanguageSwitch: false');
  });
});

describe('the analysis the dashboard renders', () => {
  it('has four format sections to lay out for the sample backend file', async () => {
    const loaded = await loadWorkspaceRules(new NodeWorkspaceAccess(SAMPLE_ROOT));
    const model = buildViewModel({
      hasWorkspace: true,
      multipleFolders: false,
      artifacts: loaded.artifacts,
      locale: 'en',
      analysis: analyzeRules(loaded.rules, {
        activeFile: 'src/backend/order.service.ts',
        extraWarnings: loaded.warnings
      })
    });
    expect(model.sections).toHaveLength(4);
    expect(model.warnings).toHaveLength(2);
    expect(model.notApplicable.length).toBeGreaterThan(0);
    expect(model.otherConfigurations?.count).toBe(1);
    expect(model.possibleCustomInstructions?.count).toBe(1);
    expect(model.header?.summaryLine).toBe('8 matching files · 4 formats');
  });

  it('has no format sections in the initial state, so no grid is drawn', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const model = session.analyze({ locale: 'en' });
    expect(model.kind).toBe('no-file');
    expect(model.sections).toEqual([]);
    expect(model.detected.length).toBeGreaterThan(0);
  });

  it('reports an empty workspace without inventing anything', async () => {
    const session = new LocalSession(join(REPO_ROOT, 'media', 'icons'));
    await session.load();
    const model = session.analyze({ locale: 'en' });
    expect(model.detectedCount).toBe(0);
    expect(model.sections).toEqual([]);
    expect(detectedFilesText(localMessagesFor('en'), model.detectedCount)).toBe(
      'No instruction files detected in this workspace'
    );
  });
});
