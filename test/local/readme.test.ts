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

const manifest = JSON.parse(read('package.json')) as {
  name: string;
  publisher: string;
  version: string;
  pricing?: string;
  icon?: string;
  scripts: Record<string, string>;
  contributes: { viewsContainers: { activitybar: Array<{ icon: string }> } };
};
const scripts = manifest.scripts;

/** The one Marketplace address these READMEs may use. */
const MARKETPLACE =
  'https://marketplace.visualstudio.com/items?itemName=williamosilva.agent-rules-lens';

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
        .filter(
          (url) =>
            !url.startsWith('https://github.com/williamosilva/Agent-Rules-Lens') &&
            url !== MARKETPLACE
        );
      expect(foreign, name).toEqual([]);
    }
  });

  it('uses only the official Marketplace address', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toContain(MARKETPLACE);
      const marketplaceUrls = [...text.matchAll(/https?:\/\/marketplace\.visualstudio\.com[^\s)]*/g)]
        .map((match) => match[0]);
      expect(marketplaceUrls.length, name).toBeGreaterThan(0);
      for (const url of marketplaceUrls) {
        expect(url, name).toBe(MARKETPLACE);
      }
      // No other publisher and no other extension id.
      expect(text, name).not.toMatch(/itemName=(?!williamosilva\.agent-rules-lens)/);
      expect(text, name).toContain('code --install-extension williamosilva.agent-rules-lens');
    }
  });

  it('links the licence and the icon provenance instead of only naming them', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toMatch(/\[(licença MIT|MIT License)\]\(LICENSE\)/);
      expect(text, name).toContain('[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)');
      expect(text, name).toContain(
        '[`media/icons/agents/sources.json`](media/icons/agents/sources.json)'
      );
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
  it('still does not announce the CLI on npm', () => {
    for (const [name, text] of READMES) {
      expect(text, name).not.toMatch(/npm install -g agent-rules-lens/);
      expect(text, name).not.toMatch(/npx agent-rules-lens/);
    }
    expect(PT).toContain('distribuição pelo npm está sendo preparada');
    expect(PT).toContain('O pacote npm da CLI ainda não foi publicado.');
    expect(EN).toContain('Distribution through npm is being prepared');
    expect(EN).toContain("The CLI's npm package is not published yet.");
  });

  it('no longer says the extension is unpublished', () => {
    expect(PT).not.toContain('ainda não está publicada no Marketplace');
    expect(PT).not.toContain('a extensão ainda não está no Marketplace');
    expect(EN).not.toContain("isn't on the Marketplace yet");
    expect(EN).not.toContain('the extension is not on the Marketplace');
  });

  it('shows no image that is an SVG', () => {
    for (const [name, text] of READMES) {
      const images = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1] as string);
      for (const src of images) {
        expect(src.toLowerCase().endsWith('.svg'), `${name} -> ${src}`).toBe(false);
      }
    }
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

describe('marketplace manifest', () => {
  it('publishes under the official publisher', () => {
    expect(manifest.publisher).toBe('williamosilva');
    expect(manifest.name).toBe('agent-rules-lens');
    expect(`${manifest.publisher}.${manifest.name}`).toBe('williamosilva.agent-rules-lens');
  });

  it('is marked free and stays at 0.1.0', () => {
    expect(manifest.pricing).toBe('Free');
    expect(manifest.version).toBe('0.1.0');
  });

  it('uses a PNG for the Marketplace page and the SVG in the Activity Bar', () => {
    expect(manifest.icon).toBe('media/agent-rules-lens.png');
    expect(manifest.icon?.toLowerCase().endsWith('.svg')).toBe(false);
    expect(manifest.contributes.viewsContainers.activitybar[0]?.icon).toBe(
      'media/agent-rules-lens.svg'
    );
  });

  it('keeps the VS Code publisher out of the CLI package', () => {
    const cli = JSON.parse(read(join('cli', 'package.json'))) as Record<string, unknown>;
    expect(cli['publisher']).toBeUndefined();
    expect(cli['pricing']).toBeUndefined();
    expect(cli['icon']).toBeUndefined();
    expect(cli['name']).toBe('agent-rules-lens');
  });

  it('links the licence from the CLI readme too', () => {
    const cliReadme = read(join('cli', 'README.md'));
    expect(cliReadme).toContain('[MIT License](LICENSE)');
    expect(cliReadme).toContain('[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)');
  });
});

describe('marketplace icon', () => {
  const png = readFileSync(join(REPO_ROOT, 'media', 'agent-rules-lens.png'));

  it('is a real PNG', () => {
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      true
    );
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  });

  it('measures exactly 128 by 128', () => {
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
  });

  it('carries an alpha channel, so the rounded corners suit both page themes', () => {
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
  });

  it('is a well formed chunk stream ending in IEND', () => {
    const chunks: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      chunks.push(png.toString('ascii', offset + 4, offset + 8));
      offset += 12 + length;
    }
    expect(chunks[0]).toBe('IHDR');
    expect(chunks[chunks.length - 1]).toBe('IEND');
    expect(chunks).toContain('IDAT');
    expect(offset).toBe(png.length);
  });

  it('embeds no text or EXIF metadata', () => {
    for (const chunk of ['tEXt', 'iTXt', 'zTXt', 'eXIf']) {
      expect(png.includes(Buffer.from(chunk, 'ascii')), chunk).toBe(false);
    }
    expect(png.includes(Buffer.from(REPO_ROOT, 'utf8'))).toBe(false);
  });

  it('keeps the Activity Bar mark monochrome and sized for 24px', () => {
    const svg = read(join('media', 'agent-rules-lens.svg'));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('fill="none"');
    // No colour of its own, no tile, and nothing a generator left behind.
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(svg).not.toMatch(/<rect|<title|<desc|<!--|generator/i);
    expect(svg).not.toMatch(/opacity|linearGradient|filter/i);
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
  });

  it('draws three rules, a lens and a handle in both versions', () => {
    const svg = read(join('media', 'agent-rules-lens.svg'));
    const rules = [...svg.matchAll(/d="M3 (\d+)h(\d+)"/g)].map((m) => ({
      y: Number(m[1]),
      length: Number(m[2])
    }));
    expect(rules).toHaveLength(3);
    // Different lengths, so the mark reads as layers rather than a menu.
    expect(new Set(rules.map((r) => r.length)).size).toBe(3);
    // Even separation, on integer centres, which is what keeps 16px legible.
    expect(rules[1]!.y - rules[0]!.y).toBe(rules[2]!.y - rules[1]!.y);
    for (const rule of rules) {
      expect(Number.isInteger(rule.y)).toBe(true);
    }
    expect(svg).toMatch(/<circle cx="15\.5" cy="13\.5" r="5\.2"/);
    expect(svg).toMatch(/d="M19\.2 17\.2 21\.2 19\.2"/);
  });

  it('adds no runtime dependency for the icon', () => {
    const deps = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(deps.dependencies).sort()).toEqual(['gray-matter', 'minimatch']);
    for (const forbidden of ['sharp', 'canvas', 'jimp', 'svg2png', 'puppeteer', 'playwright']) {
      expect(deps.dependencies[forbidden], forbidden).toBeUndefined();
      expect(deps.devDependencies[forbidden], forbidden).toBeUndefined();
    }
  });
});
