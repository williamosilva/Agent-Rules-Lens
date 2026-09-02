/** Converts Windows separators to POSIX so every comparison uses one form. */
export function toPosixPath(value: string): string {
  return value.split('\\').join('/');
}

/**
 * Normalizes a workspace relative path: POSIX separators, no `./` prefix,
 * no leading or trailing slash and no empty segments.
 */
export function normalizeRelativePath(value: string): string {
  let result = toPosixPath(value).trim();
  while (result.startsWith('./')) {
    result = result.slice(2);
  }
  result = result.replace(/^\/+/, '').replace(/\/+$/, '');
  return result.replace(/\/{2,}/g, '/');
}

/** Same normalization as paths, kept separate because globs may keep `**`. */
export function normalizeGlobPattern(pattern: string): string {
  let result = toPosixPath(pattern).trim();
  while (result.startsWith('./')) {
    result = result.slice(2);
  }
  return result.replace(/^\/+/, '');
}

/** Workspace relative path of `absolutePath`, or `undefined` when outside. */
export function relativeToRoot(root: string, absolutePath: string): string | undefined {
  const normalizedRoot = normalizeRelativePath(root);
  const normalizedPath = normalizeRelativePath(absolutePath);
  if (normalizedRoot.length === 0) {
    return normalizedPath;
  }
  if (normalizedPath.toLowerCase() === normalizedRoot.toLowerCase()) {
    return '';
  }
  const prefix = `${normalizedRoot}/`;
  if (normalizedPath.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normalizedPath.slice(prefix.length);
  }
  return undefined;
}

/** Directory of a workspace relative path. Returns `''` for root level files. */
export function directoryOf(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? '' : normalized.slice(0, index);
}

export function baseNameOf(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const index = normalized.lastIndexOf('/');
  return index === -1 ? normalized : normalized.slice(index + 1);
}

/** Number of path segments, used to sort from the broadest to the narrowest. */
export function pathDepth(relativePath: string): number {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.length === 0 ? 0 : normalized.split('/').length;
}

/** True when `relativePath` is inside `directory` (or `directory` is the root). */
export function isInsideDirectory(relativePath: string, directory: string): boolean {
  const file = normalizeRelativePath(relativePath);
  const dir = normalizeRelativePath(directory);
  if (dir.length === 0) {
    return true;
  }
  return file.startsWith(`${dir}/`);
}

/**
 * Resolves `target` against `baseDir`, both workspace relative.
 * Returns `undefined` when the result escapes the workspace root.
 */
export function resolveRelativePath(baseDir: string, target: string): string | undefined {
  const base = normalizeRelativePath(baseDir);
  const segments = [
    ...(base.length > 0 ? base.split('/') : []),
    ...toPosixPath(target).split('/')
  ];
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (stack.length === 0) {
        return undefined;
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
}
