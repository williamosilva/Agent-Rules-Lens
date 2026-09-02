import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..');
const read = (name: string): string => readFileSync(join(REPO_ROOT, name), 'utf8');

// English is the primary README, because it is the one GitHub shows first and
// the one vsce packages for the Marketplace listing.
const EN = read('README.md');
const PT = read('README.pt-BR.md');
const CLI = read(join('cli', 'README.md'));
const READMES: Array<[string, string]> = [
  ['README.md', EN],
  ['README.pt-BR.md', PT]
];
const ALL_DOCS: Array<[string, string]> = [...READMES, ['cli/README.md', CLI]];

const manifest = JSON.parse(read('package.json')) as {
  name: string;
  publisher: string;
  version: string;
  pricing?: string;
  icon?: string;
  repository: { url: string };
  bugs: { url: string };
  homepage: string;
  scripts: Record<string, string>;
  contributes: { viewsContainers: { activitybar: Array<{ icon: string }> } };
};
const scripts = manifest.scripts;

const REPO = 'https://github.com/williamosilva/agent-rules-lens';
const MARKETPLACE =
  'https://marketplace.visualstudio.com/items?itemName=williamosilva.agent-rules-lens';
const RAW = 'https://raw.githubusercontent.com/williamosilva/agent-rules-lens/main/';

/** Each README shows the captures taken in its own language. */
const SHOTS: Record<string, string[]> = {
  'README.md': ['docs/images/agent-rules-lens-en.png', 'docs/images/local-dashboard-en.png'],
  'README.pt-BR.md': ['docs/images/agent-rules-lens.png', 'docs/images/local-dashboard.png']
};

describe('which language is primary', () => {
  it('makes README.md English and README.pt-BR.md Portuguese', () => {
    expect(EN).toContain('English | [Português](README.pt-BR.md)');
    expect(PT).toContain('[English](README.md) | Português');

    // A handful of load-bearing phrases, not a word-for-word comparison.
    expect(EN).toContain('See which coding-agent instructions apply');
    expect(EN).toContain('## Choose how to use it');
    expect(PT).toContain('Veja quais instruções de agentes de código se aplicam');
    expect(PT).toContain('## Escolha como usar');
  });

  it('opens the English README with English, not a Portuguese line', () => {
    // Whatever GitHub and the Marketplace render first has to be English.
    const opening = EN.split('\n').slice(0, 6).join('\n');
    expect(opening).toContain('English |');
    expect(opening).not.toMatch(/Veja quais|Instalar no VS Code/);
  });

  it('lets the language switch work in both directions', () => {
    expect(EN).toContain('](README.pt-BR.md)');
    expect(PT).toContain('](README.md)');
    expect(existsSync(join(REPO_ROOT, 'README.md'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'README.pt-BR.md'))).toBe(true);
  });

  it('leaves no README.en.md behind, and nothing pointing at it', () => {
    expect(existsSync(join(REPO_ROOT, 'README.en.md'))).toBe(false);
    for (const [name, text] of [...READMES, ['cli/README.md', CLI] as [string, string]]) {
      expect(text, name).not.toContain('README.en.md');
    }
  });

  it('covers the same sections in both, without demanding identical prose', () => {
    const sections = (text: string): number =>
      text.split('\n').filter((line) => line.startsWith('## ')).length;
    expect(sections(PT)).toBe(sections(EN));
    expect(sections(PT)).toBeGreaterThan(10);
  });
});

describe('repository URLs', () => {
  it('spells the repository slug in lower case everywhere', () => {
    // The repository was renamed; any capital letter in the slug is the old one.
    const files = [
      ...ALL_DOCS,
      ['package.json', read('package.json')] as [string, string],
      ['cli/package.json', read(join('cli', 'package.json'))] as [string, string]
    ];
    for (const [name, text] of files) {
      for (const url of [...text.matchAll(/github(?:usercontent)?\.com\/[^\s)>"']+/g)].map(
        (m) => m[0]
      )) {
        expect(url, `${name} -> ${url}`).not.toMatch(/williamosilva\/[^/\s]*[A-Z]/);
      }
    }
  });

  it('points the manifests at the renamed repository', () => {
    expect(manifest.repository.url).toBe(`${REPO}.git`);
    expect(manifest.bugs.url).toBe(`${REPO}/issues`);
    expect(manifest.homepage).toBe(`${REPO}#readme`);

    const cliManifest = JSON.parse(read(join('cli', 'package.json'))) as {
      repository: { url: string };
      bugs: { url: string };
      homepage: string;
    };
    expect(cliManifest.repository.url).toBe(`${REPO}.git`);
    expect(cliManifest.bugs.url).toBe(`${REPO}/issues`);
    expect(cliManifest.homepage).toBe(`${REPO}#readme`);
  });

  it('uses only hosts that belong to this project', () => {
    const allowed = [REPO, MARKETPLACE, RAW];
    for (const [name, text] of ALL_DOCS) {
      const urls = [...text.matchAll(/https?:\/\/[^\s)>]+/g)].map((m) => m[0]);
      expect(urls.length, name).toBeGreaterThan(0);
      for (const url of urls) {
        expect(allowed.some((prefix) => url.startsWith(prefix)), `${name} -> ${url}`).toBe(true);
      }
    }
  });

  it('links the official Marketplace listing and no other extension', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toContain(MARKETPLACE);
      expect(text, name).toContain('code --install-extension williamosilva.agent-rules-lens');
      expect(text, name).not.toMatch(/itemName=(?!williamosilva\.agent-rules-lens)/);
    }
  });
});

describe('screenshots', () => {
  it('serves both through absolute raw URLs, so the Marketplace can load them', () => {
    for (const [name, text] of READMES) {
      const images = [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
      expect(images.length, name).toBe(2);
      for (const [, alt, src] of images) {
        expect((alt as string).length, `${name} alt text`).toBeGreaterThan(20);
        expect((src as string).startsWith(RAW), `${name} -> ${src}`).toBe(true);
        // The raw URL must correspond to a file that is really in the repo.
        const local = (src as string).slice(RAW.length);
        expect(existsSync(join(REPO_ROOT, local)), `${name} -> ${local}`).toBe(true);
      }
    }
  });

  it('shows each README the captures taken in its own language', () => {
    for (const [name, text] of READMES) {
      const shown = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) =>
        (m[1] as string).slice(RAW.length)
      );
      expect(shown.sort(), name).toEqual([...SHOTS[name]!].sort());
    }
    // An English page must never fall back to a Portuguese capture, or vice versa.
    expect(EN).not.toContain(`${RAW}docs/images/agent-rules-lens.png`);
    expect(EN).not.toContain(`${RAW}docs/images/local-dashboard.png`);
    expect(PT).not.toContain('-en.png');
  });

  it('keeps all four captures in the repository', () => {
    for (const file of Object.values(SHOTS).flat()) {
      const path = join(REPO_ROOT, file);
      expect(existsSync(path), file).toBe(true);
      const png = readFileSync(path);
      expect(
        png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        `${file} is a real PNG`
      ).toBe(true);
      expect(png.length, `${file} is not empty`).toBeGreaterThan(1000);
    }
  });

  it('writes the alt text in the language of its own README', () => {
    const alt = (text: string): string[] =>
      [...text.matchAll(/!\[([^\]]*)\]/g)].map((m) => m[1] as string);
    for (const text of alt(EN)) {
      expect(text).toMatch(/\b(the|in|with|and)\b/);
    }
    for (const text of alt(PT)) {
      expect(text).toMatch(/\b(do|no|na|com|que|à)\b/);
    }
  });

  it('embeds no SVG as a README image', () => {
    for (const [name, text] of READMES) {
      const sources = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1] as string);
      for (const src of sources) {
        expect(src.toLowerCase().endsWith('.svg'), `${name} -> ${src}`).toBe(false);
      }
    }
  });
});

describe('relative links', () => {
  it('resolves every one to a file that exists', () => {
    for (const [name, text] of READMES) {
      const targets = [...text.matchAll(/\]\(([^)]+)\)/g)]
        .map((m) => m[1] as string)
        .filter((target) => !target.startsWith('http') && !target.startsWith('#'));
      expect(targets.length, name).toBeGreaterThan(0);
      for (const target of targets) {
        expect(existsSync(join(REPO_ROOT, target)), `${name} -> ${target}`).toBe(true);
      }
    }
  });

  it('links the licence and the mark provenance', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toMatch(/\[(licença MIT|MIT License)\]\(LICENSE\)/);
      expect(text, name).toContain('[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)');
      expect(text, name).toContain(
        '[`media/icons/agents/sources.json`](media/icons/agents/sources.json)'
      );
    }
    // The CLI package carries its own copies of both.
    expect(CLI).toContain('[MIT License](LICENSE)');
    expect(CLI).toContain('[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)');
  });

  it('keeps the in-page anchors pointing at real headings', () => {
    const slug = (heading: string): string =>
      heading
        .replace(/^##\s+/, '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

    for (const [name, text] of READMES) {
      const headings = new Set(
        text.split('\n').filter((line) => line.startsWith('## ')).map(slug)
      );
      const anchors = [...text.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1] as string);
      expect(anchors.length, name).toBeGreaterThan(0);
      for (const anchor of anchors) {
        expect(headings.has(anchor), `${name} -> #${anchor}`).toBe(true);
      }
    }
  });
});

describe('the four ways to use it', () => {
  it('presents all four in the comparison table', () => {
    expect(PT).toContain('Extensão do Marketplace');
    expect(PT).toContain('Extensão pelo código-fonte');
    expect(PT).toContain('Dashboard local');
    expect(PT).toContain('Relatório JSON');

    expect(EN).toContain('Marketplace extension');
    expect(EN).toContain('Extension from source');
    expect(EN).toContain('Local dashboard');
    expect(EN).toContain('JSON report');
  });

  it('gives each one a starting command', () => {
    for (const [name, text] of READMES) {
      expect(text, name).toContain('npm run install:local');
      expect(text, name).toMatch(/`arl`/);
      expect(text, name).toContain('--json');
      expect(text, name).toContain('npm run demo');
      expect(text, name).toContain('npm run local:link');
    }
  });

  it('spells out the difference between install:local and arl', () => {
    expect(PT).toContain('`npm run install:local` compila a extensão');
    expect(PT).toContain('`arl` inicia o dashboard local');
    expect(PT).toContain('A extensão não precisa da CLI');
    expect(EN).toContain('`npm run install:local` builds the extension');
    expect(EN).toContain('`arl` starts the local dashboard');
    expect(EN).toContain('The extension does not need the CLI');
  });

  it('documents the local mode as loopback only, read-only and manually refreshed', () => {
    expect(PT).toContain('`127.0.0.1`');
    expect(PT).toContain('somente leitura');
    expect(PT).toContain('atualização é manual');
    expect(EN).toContain('`127.0.0.1`');
    expect(EN).toContain('read-only');
    expect(EN).toContain('Refreshing is manual');
  });
});

describe('honesty', () => {
  it('never presents the CLI as published on npm', () => {
    for (const [name, text] of ALL_DOCS) {
      expect(text, name).not.toContain('npx agent-rules-lens');
      expect(text, name).not.toMatch(/npm i(nstall)? -g agent-rules-lens/);
    }
    expect(PT).toContain('pacote npm público da CLI ainda não foi lançado');
    expect(EN).toContain("CLI's public npm package has not been released");
  });

  it('says detecting a file is not the same as confirming a tool loaded it', () => {
    expect(PT).toContain('não** significa confirmar que alguma ferramenta realmente o carregou');
    expect(EN).toContain('does **not** confirm that any tool actually loaded it');
  });

  it('never claims to read a live agent context', () => {
    expect(PT).toContain('Não inspeciona o contexto interno');
    expect(EN).toContain('does not inspect the private, running context');
  });

  it('separates analysed applicability from mere detection in the format table', () => {
    expect(PT).toContain('Aplicabilidade analisada');
    expect(EN).toContain('Applicability analysed');
    for (const [name, text] of READMES) {
      expect(text, name).toContain('`AGENTS.md`, `AGENTS.override.md`');
      expect(text, name).toContain('Windsurf');
      expect(text, name).toMatch(/Zed \| (Sim|Yes) \| (Não|No) \|/);
    }
  });

  it('mentions no personal path', () => {
    for (const [name, text] of ALL_DOCS) {
      expect(text, name).not.toMatch(/C:\\Users\\/);
      expect(text, name).not.toContain('Desktop\\');
    }
  });

  it('avoids marketing filler, badge walls and decorative emoji', () => {
    for (const [name, text] of ALL_DOCS) {
      for (const banned of [
        'revolucion',
        'poderos',
        'experiência perfeita',
        'eleve sua produtividade',
        'solução completa',
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
    for (const [name, text] of ALL_DOCS) {
      expect(text, name).not.toMatch(/\d+\s+(tests|testes)\b/i);
    }
  });
});

describe('documented commands exist', () => {
  it('names only real npm scripts', () => {
    const documented = new Set<string>();
    for (const [, text] of ALL_DOCS) {
      for (const match of text.matchAll(/npm run ([a-z:]+)/g)) {
        documented.add(match[1] as string);
      }
    }
    expect(documented.size).toBeGreaterThan(5);
    for (const name of documented) {
      expect(scripts, name).toHaveProperty(name);
    }
  });

  it('names only flags the CLI parser accepts', () => {
    const parser = read(join('src', 'local', 'cli.ts'));
    const accepted = new Set(
      [...parser.matchAll(/case '(--[a-z-]+|-[hv])'/g)].map((m) => m[1] as string)
    );
    for (const [name, text] of ALL_DOCS) {
      const used = new Set(
        [...text.matchAll(/`?arl\b[^`\n]*?(--[a-z-]+)/g)].map((m) => m[1] as string)
      );
      for (const flag of used) {
        expect(accepted.has(flag), `${name} documents ${flag}`).toBe(true);
      }
    }
    // The ones the READMEs lean on.
    for (const flag of ['--json', '--locale', '--no-open', '--help', '--workspace', '--file', '--port']) {
      expect(accepted.has(flag), flag).toBe(true);
    }
  });
});

describe('marketplace manifest', () => {
  it('keeps the published identity untouched', () => {
    expect(manifest.publisher).toBe('williamosilva');
    expect(manifest.name).toBe('agent-rules-lens');
    expect(`${manifest.publisher}.${manifest.name}`).toBe('williamosilva.agent-rules-lens');
    expect(manifest.version).toBe('0.1.2');
    expect(manifest.pricing).toBe('Free');
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
});

describe('marketplace icon', () => {
  const png = readFileSync(join(REPO_ROOT, 'media', 'agent-rules-lens.png'));

  it('is a real 128 by 128 PNG with an alpha channel', () => {
    expect(
      png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ).toBe(true);
    expect(png.toString('ascii', 12, 16)).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
  });

  it('is a well formed chunk stream with no text or EXIF metadata', () => {
    const chunks: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      chunks.push(png.toString('ascii', offset + 4, offset + 8));
      offset += 12 + length;
    }
    expect(chunks[0]).toBe('IHDR');
    expect(chunks[chunks.length - 1]).toBe('IEND');
    expect(offset).toBe(png.length);
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
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(svg).not.toMatch(/<rect|<title|<desc|<!--|generator/i);
    expect(svg).not.toMatch(/opacity|linearGradient|filter/i);
  });

  it('draws three rules, a lens and a handle', () => {
    const svg = read(join('media', 'agent-rules-lens.svg'));
    const rules = [...svg.matchAll(/d="M3 (\d+)h(\d+)"/g)].map((m) => ({
      y: Number(m[1]),
      length: Number(m[2])
    }));
    expect(rules).toHaveLength(3);
    expect(new Set(rules.map((r) => r.length)).size).toBe(3);
    expect(rules[1]!.y - rules[0]!.y).toBe(rules[2]!.y - rules[1]!.y);
    expect(svg).toMatch(/<circle cx="15\.5" cy="13\.5" r="5\.2"/);
    expect(svg).toMatch(/d="M19\.2 17\.2 21\.2 19\.2"/);
  });

  it('adds no dependency for the icon', () => {
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
