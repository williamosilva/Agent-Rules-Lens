import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedRule, RuleFile, RuleWarning } from '../src/domain/types';
import { validateClaudeImports } from '../src/services/ruleDiagnostics';
import { IGNORED_DIRECTORIES } from '../src/services/ruleDiscoveryPatterns';
import { classifyRuleFile, parseRuleFile } from '../src/services/ruleParser';
import { toPosixPath } from '../src/utils/paths';

/** Builds a discovered rule file fixture from a workspace relative path. */
export function makeRuleFile(relativePath: string, content: string): RuleFile {
  const classification = classifyRuleFile(relativePath);
  if (classification === undefined) {
    throw new Error(`Unsupported rule path in fixture: ${relativePath}`);
  }
  return {
    kind: classification.kind,
    source: classification.source,
    relativePath,
    fsPath: `/repo/${relativePath}`,
    content
  };
}

export function parseFixture(relativePath: string, content: string): ParsedRule {
  return parseRuleFile(makeRuleFile(relativePath, content));
}

/** Joins lines with `\n`, so fixtures stay readable. */
export function lines(...values: string[]): string {
  return values.join('\n');
}

export const SAMPLE_ROOT = join(__dirname, '..', 'examples', 'sample-workspace');
export const MONOREPO_ROOT = join(__dirname, 'fixtures', 'monorepo');
export const ECOSYSTEM_ROOT = join(__dirname, 'fixtures', 'ecosystem');

function walk(directory: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.includes(entry.name)) {
        continue;
      }
      found.push(...walk(join(directory, entry.name), relativePath));
      continue;
    }
    found.push(toPosixPath(relativePath));
  }
  return found;
}

/** Reads a workspace folder through the real classifier and parser. */
export function loadWorkspace(root: string): ParsedRule[] {
  const files: RuleFile[] = [];
  for (const relativePath of walk(root)) {
    const classification = classifyRuleFile(relativePath);
    if (classification === undefined) {
      continue;
    }
    files.push({
      kind: classification.kind,
      source: classification.source,
      relativePath,
      fsPath: join(root, relativePath),
      content: readFileSync(join(root, relativePath), 'utf8')
    });
  }
  return files.map(parseRuleFile);
}

export function loadSampleWorkspace(): ParsedRule[] {
  return loadWorkspace(SAMPLE_ROOT);
}

export function loadMonorepo(): ParsedRule[] {
  return loadWorkspace(MONOREPO_ROOT);
}

/** Import warnings resolved against the real disk, for a given root. */
export function importWarningsFor(root: string, rules: readonly ParsedRule[]): RuleWarning[] {
  return rules.flatMap((rule) =>
    validateClaudeImports(rule, rule.imports, (target) => existsSync(join(root, target)))
  );
}

export function sampleImportWarnings(rules: readonly ParsedRule[]): RuleWarning[] {
  return importWarningsFor(SAMPLE_ROOT, rules);
}
