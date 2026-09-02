import { FORMAT_CATALOG } from '../domain/formatCatalog';

/** Dependency and build output folders are never scanned. */
export const IGNORED_DIRECTORIES: readonly string[] = [
  '.git',
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.turbo',
  '.cache',
  '.parcel-cache',
  'coverage',
  '.venv',
  '__pycache__'
];

export interface DiscoveryPattern {
  include: string;
  /** Extra excludes on top of the shared ignore list. */
  exclude?: readonly string[];
}

/** Every include glob the catalog declares, deduplicated. */
export const CATALOG_PATTERNS: readonly string[] = [
  ...new Set(FORMAT_CATALOG.flatMap((definition) => definition.patterns))
];

function excludeKey(exclude: readonly string[] | undefined): string {
  return exclude === undefined ? '' : [...exclude].sort().join('|');
}

/**
 * One search per distinct set of extra excludes, so a catalog of forty patterns
 * still costs two workspace scans instead of forty.
 *
 * `CLAUDE.md` lookups skip `.claude/`, because the project level
 * `.claude/CLAUDE.md` has its own definition.
 */
export function buildDiscoveryPatterns(
  extraIncludes: readonly string[] = []
): DiscoveryPattern[] {
  const groups = new Map<string, { includes: string[]; exclude?: readonly string[] }>();

  for (const definition of FORMAT_CATALOG) {
    const key = excludeKey(definition.exclude);
    const group = groups.get(key) ?? {
      includes: [],
      ...(definition.exclude === undefined ? {} : { exclude: definition.exclude })
    };
    for (const pattern of definition.patterns) {
      if (!group.includes.includes(pattern)) {
        group.includes.push(pattern);
      }
    }
    groups.set(key, group);
  }

  const plain = groups.get('');
  for (const pattern of extraIncludes) {
    if (plain !== undefined && !plain.includes.includes(pattern)) {
      plain.includes.push(pattern);
    }
  }

  return [...groups.values()].map((group) => ({
    include: group.includes.length === 1 ? (group.includes[0] as string) : `{${group.includes.join(',')}}`,
    ...(group.exclude === undefined ? {} : { exclude: group.exclude })
  }));
}

/** Globs a FileSystemWatcher has to observe to keep the analysis fresh. */
export function buildWatchPatterns(extraIncludes: readonly string[] = []): string[] {
  return buildDiscoveryPatterns(extraIncludes).map((pattern) => pattern.include);
}

/** Builds the exclude glob passed to `workspace.findFiles`. */
export function buildExcludeGlob(extra: readonly string[] = []): string {
  const parts = [...IGNORED_DIRECTORIES.map((name) => `**/${name}/**`), ...extra];
  return `{${parts.join(',')}}`;
}
