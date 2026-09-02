import { describe, expect, it } from 'vitest';
import {
  findInvalidPatterns,
  matchesAnyGlob,
  readPatternField,
  splitPatternList
} from '../src/utils/globs';
import {
  baseNameOf,
  directoryOf,
  isInsideDirectory,
  normalizeGlobPattern,
  normalizeRelativePath,
  pathDepth,
  relativeToRoot,
  resolveRelativePath,
  toPosixPath
} from '../src/utils/paths';
import { estimateTokens, formatTokens } from '../src/utils/tokens';

describe('path normalization', () => {
  it('converts Windows separators to POSIX', () => {
    expect(toPosixPath('src\\backend\\order.service.ts')).toBe('src/backend/order.service.ts');
  });

  it('normalizes POSIX and Windows relative paths the same way', () => {
    expect(normalizeRelativePath('./src\\frontend/OrderCard.tsx')).toBe(
      'src/frontend/OrderCard.tsx'
    );
    expect(normalizeRelativePath('/src//frontend/')).toBe('src/frontend');
    expect(normalizeRelativePath('src/frontend/OrderCard.tsx')).toBe('src/frontend/OrderCard.tsx');
  });

  it('strips a leading ./ from glob patterns', () => {
    expect(normalizeGlobPattern('./**/*.ts')).toBe('**/*.ts');
    expect(normalizeGlobPattern('src\\**\\*.tsx')).toBe('src/**/*.tsx');
  });

  it('makes paths relative to the workspace root on both platforms', () => {
    expect(relativeToRoot('C:\\repo', 'C:\\repo\\src\\a.ts')).toBe('src/a.ts');
    expect(relativeToRoot('C:\\repo', 'C:\\Repo\\src\\a.ts')).toBe('src/a.ts');
    expect(relativeToRoot('/home/user/repo', '/home/user/repo/src/a.ts')).toBe('src/a.ts');
    expect(relativeToRoot('/home/user/repo', '/home/user/other/a.ts')).toBeUndefined();
  });

  it('reports directories, base names and depth', () => {
    expect(directoryOf('src/backend/AGENTS.md')).toBe('src/backend');
    expect(directoryOf('AGENTS.md')).toBe('');
    expect(baseNameOf('src/backend/AGENTS.md')).toBe('AGENTS.md');
    expect(pathDepth('')).toBe(0);
    expect(pathDepth('src')).toBe(1);
    expect(pathDepth('src/backend')).toBe(2);
  });

  it('detects containment, with the root containing everything', () => {
    expect(isInsideDirectory('src/backend/order.service.ts', '')).toBe(true);
    expect(isInsideDirectory('src/backend/order.service.ts', 'src/backend')).toBe(true);
    expect(isInsideDirectory('src/frontend/OrderCard.tsx', 'src/backend')).toBe(false);
    expect(isInsideDirectory('src/backend-extra/a.ts', 'src/backend')).toBe(false);
  });

  it('resolves relative targets and refuses to escape the root', () => {
    expect(resolveRelativePath('docs', './guide.md')).toBe('docs/guide.md');
    expect(resolveRelativePath('docs/api', '../guide.md')).toBe('docs/guide.md');
    expect(resolveRelativePath('', '../outside.md')).toBeUndefined();
  });
});

describe('glob helpers', () => {
  it('splits comma separated lists while keeping brace expansions', () => {
    expect(splitPatternList('**/*.ts,**/*.tsx')).toEqual(['**/*.ts', '**/*.tsx']);
    expect(splitPatternList('**/*.{ts,tsx}, docs/**')).toEqual(['**/*.{ts,tsx}', 'docs/**']);
  });

  it('reads string, list and invalid pattern fields', () => {
    expect(readPatternField('src/**/*.ts')).toEqual({ patterns: ['src/**/*.ts'], invalid: false });
    expect(readPatternField(['a/**', 'b/**'])).toEqual({
      patterns: ['a/**', 'b/**'],
      invalid: false
    });
    expect(readPatternField(undefined)).toEqual({ invalid: false });
    expect(readPatternField(42).invalid).toBe(true);
    expect(readPatternField([1, 2]).invalid).toBe(true);
  });

  it('matches dotfiles and directory globs', () => {
    expect(matchesAnyGlob('src/frontend/OrderCard.tsx', ['src/frontend/**/*.tsx']).matched).toBe(
      true
    );
    expect(matchesAnyGlob('src/backend/order.service.ts', ['**/*.tsx']).matched).toBe(false);
    expect(matchesAnyGlob('.github/workflows/ci.yml', ['**/*.yml']).matched).toBe(true);
    expect(matchesAnyGlob('src', ['src/**']).matched).toBe(true);
    expect(matchesAnyGlob('anything/at/all.ts', ['**']).matched).toBe(true);
  });

  it('reports unusable patterns instead of throwing', () => {
    expect(findInvalidPatterns(['**/*.ts'])).toEqual([]);
    expect(() => findInvalidPatterns(['['])).not.toThrow();
  });
});

describe('token estimation', () => {
  it('uses one token per four characters, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
  });

  it('formats totals for the status bar', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1200)).toBe('1.2k');
    expect(formatTokens(123456)).toBe('123k');
  });
});
