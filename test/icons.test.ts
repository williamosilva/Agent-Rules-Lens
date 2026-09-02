import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FORMAT_CATALOG } from '../src/domain/formatCatalog';
import {
  allIconFileNames,
  FALLBACK_ICON_ID,
  ICON_DIRECTORY,
  ICON_FILES,
  iconFilesFor
} from '../src/ui/iconInventory';

const ICON_DIR = join(__dirname, '..', ...ICON_DIRECTORY);
const files = readdirSync(ICON_DIR);
const svgFiles = files.filter((name) => name.endsWith('.svg'));
const read = (name: string): string => readFileSync(join(ICON_DIR, name), 'utf8');

describe('icon inventory', () => {
  it('gives every catalog definition an icon id that resolves to real files', () => {
    for (const definition of FORMAT_CATALOG) {
      expect(definition.iconId.length, definition.id).toBeGreaterThan(0);
      const entry = ICON_FILES[definition.iconId];
      expect(entry, `${definition.id} -> ${definition.iconId}`).toBeDefined();
      expect(existsSync(join(ICON_DIR, entry!.light))).toBe(true);
      expect(existsSync(join(ICON_DIR, entry!.dark))).toBe(true);
    }
  });

  it('has a file on disk for every inventory entry, and no orphans', () => {
    for (const name of allIconFileNames()) {
      expect(existsSync(join(ICON_DIR, name)), name).toBe(true);
    }
    const declared = new Set(allIconFileNames());
    const orphans = svgFiles.filter((name) => !declared.has(name));
    expect(orphans).toEqual([]);
  });

  it('ships the three neutral first party marks', () => {
    for (const id of ['shared-rules', 'custom-rules', 'generic-agent']) {
      expect(ICON_FILES[id], id).toBeDefined();
    }
  });

  it('falls back to the neutral agent mark for an unknown id', () => {
    expect(iconFilesFor('does-not-exist')).toEqual(ICON_FILES[FALLBACK_ICON_ID]);
    expect(iconFilesFor('claude')).toEqual(ICON_FILES['claude']);
  });

  it('keeps AGENTS.md on the shared mark, never on a vendor logo', () => {
    const shared = FORMAT_CATALOG.filter((definition) =>
      definition.patterns.some((pattern) => pattern.endsWith('AGENTS.md'))
    );
    const resolvedShared = shared.filter((definition) => definition.supportLevel === 'resolved');
    expect(resolvedShared.length).toBeGreaterThan(0);
    for (const definition of resolvedShared) {
      expect(definition.iconId).toBe('shared-rules');
    }
    // Hand written candidates get their own neutral mark too.
    for (const definition of FORMAT_CATALOG.filter((d) => d.supportLevel === 'candidate')) {
      expect(definition.iconId).toBe('custom-rules');
    }
  });
});

describe('icon safety', () => {
  it.each(svgFiles)('%s carries nothing active or remote', (name) => {
    const svg = read(name);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    expect(svg).not.toMatch(/<foreignObject/i);
    expect(svg).not.toMatch(/<image\b/i);
    expect(svg).not.toMatch(/@import/i);
    expect(svg).not.toMatch(/base64/i);
    // No remote reference of any kind: href, xlink:href or url().
    expect(svg).not.toMatch(/(?:xlink:)?href\s*=\s*["']?https?:/i);
    expect(svg).not.toMatch(/url\(\s*["']?(?:https?:|\/\/)/i);
    expect(svg).not.toMatch(/<!ENTITY/i);
  });

  it.each(svgFiles)('%s keeps a viewBox so it scales without distortion', (name) => {
    const svg = read(name);
    const viewBox = /viewBox\s*=\s*"([^"]+)"/i.exec(svg);
    expect(viewBox, `${name} has no viewBox`).not.toBeNull();
    const numbers = String(viewBox?.[1] ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    expect(numbers).toHaveLength(4);
    expect(numbers.every((value) => Number.isFinite(value))).toBe(true);
    expect(numbers[2] ?? 0).toBeGreaterThan(0);
    expect(numbers[3] ?? 0).toBeGreaterThan(0);
  });

  it.each(svgFiles)('%s draws something', (name) => {
    const svg = read(name);
    expect(svg).toMatch(/<(path|rect|circle|polygon|ellipse|g|mask)\b/i);
  });
});

describe('icon provenance', () => {
  const sources = JSON.parse(read('sources.json')) as {
    icons: Record<
      string,
      {
        tool: string;
        sourceType: string;
        license: string;
        licenseUrl?: string;
        retrievedAt: string;
        files: { light: string; dark: string };
      }
    >;
  };

  it('records a source for every third party mark that ships', () => {
    const firstParty = new Set(['shared-rules', 'custom-rules', 'generic-agent']);
    const thirdParty = Object.keys(ICON_FILES).filter((id) => !firstParty.has(id));
    expect(Object.keys(sources.icons).sort()).toEqual(thirdParty.sort());
  });

  it('gives every record a real source, licence and date', () => {
    for (const [id, record] of Object.entries(sources.icons)) {
      expect(record.tool.length, id).toBeGreaterThan(0);
      expect(record.sourceType.length, id).toBeGreaterThan(0);
      expect(record.license.length, id).toBeGreaterThan(0);
      expect(record.retrievedAt, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(existsSync(join(ICON_DIR, record.files.light)), id).toBe(true);
      expect(existsSync(join(ICON_DIR, record.files.dark)), id).toBe(true);
    }
  });

  it('only claims source types it can back up', () => {
    const allowed = [
      'official-website',
      'official-repository',
      'official-package',
      'official-marketplace',
      'simple-icons'
    ];
    for (const [id, record] of Object.entries(sources.icons)) {
      expect(allowed, `${id}: ${record.sourceType}`).toContain(record.sourceType);
    }
  });

  it('is mirrored by THIRD_PARTY_NOTICES.md', () => {
    const notices = readFileSync(join(__dirname, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const record of Object.values(sources.icons)) {
      expect(notices, record.tool).toContain(record.tool);
    }
  });
});
