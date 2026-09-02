import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..');
const read = (name: string): string => readFileSync(join(REPO_ROOT, name), 'utf8');

const PT = read('README.md');
const EN = read('README.en.md');
const READMES: Array<[string, string]> = [
  ['README.md', PT],
  ['README.en.md', EN]
];

const scripts = (
  JSON.parse(read('package.json')) as { scripts: Record<string, string> }
).scripts;

describe('which language is primary', () => {
  it('makes README.md Portuguese', () => {
    expect(PT.split('\n')[2]).toBe('Português | [English](README.en.md)');
    for (const phrase of [
      'Veja quais arquivos de instruções',
      'Como você quer usar?',
      'Usar a extensão no VS Code',
      'Limitações'
    ]) {
      expect(PT, phrase).toContain(phrase);
    }
  });

  it('makes README.en.md English', () => {
    expect(EN.split('\n')[2]).toBe('[Português](README.md) | English');
    for (const phrase of [
      'See which AI instruction files',
      'Choose how you want to use it',
      'Using the VS Code extension',
      'Limitations'
    ]) {
      expect(EN, phrase).toContain(phrase);
    }
  });

  it('leaves no trace of the old Portuguese file name', () => {
    expect(existsSync(join(REPO_ROOT, 'README.pt-BR.md'))).toBe(false);
    for (const [name, text] of READMES) {
      expect(text, name).not.toContain('README.pt-BR');
    }
  });

  it('keeps the same structure in both', () => {
    const headings = (text: string): string[] =>
      text.split('\n').filter((line) => line.startsWith('## '));
    expect(headings(PT)).toHaveLength(headings(EN).length);
    expect(headings(PT).length).toBeGreaterThan(10);
  });

  it('has exactly two READMEs at the root', () => {
    expect(existsSync(join(REPO_ROOT, 'README.md'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'README.en.md'))).toBe(true);
  });
});

describe('links', () => {
  it('resolves every relative link', () => {
    for (const [name, text] of READMES) {
      const targets = [...text.matchAll(/\]\(([^)]+)\)/g)]
        .map((match) => match[1] as string)
        .filter((target) => !target.startsWith('http'));
      expect(targets.length, name).toBeGreaterThan(0);
      for (const target of targets) {
        expect(existsSync(join(REPO_ROOT, target)), `${name} -> ${target}`).toBe(true);
      }
    }
  });

  it('points at the real repository and issue tracker', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toContain('https://github.com/williamosilva/Agent-Rules-Lens');
      expect(text, name).toContain('/issues');
      const foreign = [...text.matchAll(/https?:\/\/[^\s)]+/g)]
        .map((match) => match[0])
        .filter((url) => !url.startsWith('https://github.com/williamosilva/Agent-Rules-Lens'));
      expect(foreign, name).toEqual([]);
    }
  });

  it('shows both screenshots with alternative text', () => {
    for (const [name, text] of READMES) {
      const images = [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
      expect(images.length, name).toBe(2);
      for (const [, alt, src] of images) {
        expect((alt as string).length, `${name} alt`).toBeGreaterThan(20);
        expect(existsSync(join(REPO_ROOT, src as string)), `${name} -> ${src}`).toBe(true);
      }
      expect(text, name).toContain('docs/images/agent-rules-lens.png');
      expect(text, name).toContain('docs/images/local-dashboard.png');
    }
  });
});

describe('honesty', () => {
  it('claims no published package', () => {
    for (const [name, text] of READMES) {
      expect(text, name).not.toMatch(/npm install -g agent-rules-lens/);
      expect(text, name).not.toMatch(/npx agent-rules-lens/);
      expect(text, name).not.toMatch(/marketplace\.visualstudio\.com/i);
    }
    expect(PT).toContain('ainda não está publicada no Marketplace');
    expect(PT).toContain('distribuição pelo npm está sendo preparada');
    expect(EN).toContain("isn't on the Marketplace yet");
    expect(EN).toContain('Distribution through npm is being prepared');
  });

  it('mentions no personal path and no private project', () => {
    for (const [name, text] of READMES) {
      expect(text, name).not.toMatch(/C:\\Users\\/);
      expect(text, name).not.toContain('Desktop');
      expect(text, name).not.toMatch(/\bInhire\b/);
    }
  });

  it('never says the analysis reads a live agent context', () => {
    expect(PT).toContain('Não inspeciona o contexto interno');
    expect(EN).toContain('does not inspect the private, running context');
  });

  it('avoids marketing language, badge walls and decorative emoji', () => {
    for (const [name, text] of READMES) {
      for (const banned of [
        'revolucion',
        'poderos',
        'experiência perfeita',
        'revolutionary',
        'powerful',
        'seamless',
        'game-chang',
        'production-ready'
      ]) {
        expect(text.toLowerCase(), `${name} / ${banned}`).not.toContain(banned);
      }
      expect(text, name).not.toContain('shields.io');
      expect((text.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? []).length, name).toBe(0);
    }
  });

  it('quotes no test count that would go stale', () => {
    for (const [name, text] of READMES) {
      expect(text, name).not.toMatch(/\d+\s+(tests|testes)\b/i);
    }
  });
});

describe('the documented commands exist', () => {
  it('names only real npm scripts', () => {
    const documented = new Set<string>();
    for (const [, text] of READMES) {
      for (const match of text.matchAll(/npm run ([a-z:]+)/g)) {
        documented.add(match[1] as string);
      }
    }
    expect(documented.size).toBeGreaterThan(5);
    for (const name of documented) {
      expect(scripts, name).toHaveProperty(name);
    }
  });

  it('documents the split between installing the extension and running the CLI', () => {
    expect(PT).toContain('instala a extensão compilada no VS Code');
    expect(PT).toContain('abre um dashboard no navegador');
    expect(PT).toContain('Nenhum dos dois precisa do outro');
    expect(EN).toContain('installs the compiled extension into VS Code');
    expect(EN).toContain('opens a dashboard in the browser');
    expect(EN).toContain('Neither one needs the other');
  });

  it('offers the "choose how" table with all four rows', () => {
    for (const [name, text] of READMES) {
      const table = text.slice(text.indexOf('| ---'), text.indexOf('| ---') + 400);
      expect(table.split('\n').filter((line) => line.startsWith('|')).length, name).toBeGreaterThanOrEqual(5);
    }
    expect(PT).toContain('Dashboard local com `arl`');
    expect(EN).toContain('Local dashboard with `arl`');
  });

  it('documents the demo both ways', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toContain('npm run demo');
      expect(text, name).toContain('cd examples\\sample-workspace');
      expect(text, name).toContain('arl src\\backend\\order.service.ts');
    }
  });

  it('lists the flags the parser accepts', () => {
    for (const [name, text] of READMES) {
      for (const flag of ['--json', '--locale pt-BR', '--locale en', '--no-open', '--help']) {
        expect(text, `${name} / ${flag}`).toContain(flag);
      }
    }
  });
});
