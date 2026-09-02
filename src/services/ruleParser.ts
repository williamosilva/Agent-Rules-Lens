import matter from 'gray-matter';
import type {
  ClaudeImport,
  ParsedRule,
  RuleFile,
  RuleKind,
  RuleSource,
  RuleWarning
} from '../domain/types';
import { classifyResolvedRule } from './artifactClassifier';
import { findInvalidPatterns, readPatternField } from '../utils/globs';
import { directoryOf } from '../utils/paths';
import { estimateTokens } from '../utils/tokens';
import {
  checkRuleLength,
  createWarning,
  findKeyLine,
  type WarningTarget
} from './ruleDiagnostics';
import {
  expectedTypeMessage,
  inspectMetadata,
  invalidFieldTitle,
  scopeFieldOf,
  UNSUPPORTED_FIELD_MESSAGE,
  unsupportedFieldTitle
} from './metadataPolicy';

const FRONTMATTER_DELIMITER = /^---[ \t]*\r?\n/;
const FRONTMATTER_BLOCK = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;
const FENCE_LINE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
const CLAUDE_IMPORT = /(?:^|[\s(\[{>])@([^\s`'"()[\]{},;]+)/g;

const CLAUDE_KINDS: ReadonlySet<RuleKind> = new Set<RuleKind>([
  'claude-md',
  'claude-local-md',
  'claude-project-md',
  'claude-rule'
]);

export interface RuleClassification {
  kind: RuleKind;
  source: RuleSource;
}

/**
 * Maps a workspace relative path to a supported rule kind, using the shared
 * format catalog. Only a file's location and the name pattern of its format
 * matter: a rule's own name never influences what it applies to.
 */
export function classifyRuleFile(relativePath: string): RuleClassification | undefined {
  return classifyResolvedRule(relativePath);
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function stripFrontmatterBlock(content: string): string {
  const match = FRONTMATTER_BLOCK.exec(content);
  return match === null ? content : content.slice(match[0].length);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Finds Claude `@path` imports. Frontmatter, fenced blocks and inline code are
 * skipped, and a candidate must look like a path so plain mentions such as
 * `@team` are not reported as imports.
 */
export function extractClaudeImports(content: string): ClaudeImport[] {
  const lines = stripBom(content).split(/\r?\n/);
  const imports: ClaudeImport[] = [];
  let fenceChar: string | undefined;
  let inFrontmatter = lines[0] !== undefined && /^---[ \t]*$/.test(lines[0]);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';

    if (inFrontmatter) {
      if (index > 0 && /^---[ \t]*$/.test(raw)) {
        inFrontmatter = false;
      }
      continue;
    }

    const fenceMatch = FENCE_LINE.exec(raw);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]?.charAt(0);
      if (fenceChar === undefined) {
        fenceChar = marker;
      } else if (marker === fenceChar) {
        fenceChar = undefined;
      }
      continue;
    }
    if (fenceChar !== undefined) {
      continue;
    }

    const line = raw.replace(INLINE_CODE, ' ');
    for (const match of line.matchAll(CLAUDE_IMPORT)) {
      const candidate = (match[1] ?? '').replace(/[.,;:!?]+$/, '');
      if (candidate.length === 0) {
        continue;
      }
      if (!candidate.includes('/') && !candidate.includes('.')) {
        continue;
      }
      imports.push({ target: candidate, line: index + 1 });
    }
  }

  return imports;
}

/**
 * Parses a discovered rule file into the internal model. The body text is never
 * inspected for scope: only the fields the format documents are read.
 */
export function parseRuleFile(file: RuleFile): ParsedRule {
  const target: WarningTarget = { relativePath: file.relativePath, fsPath: file.fsPath };
  const warnings: RuleWarning[] = [];

  const content = stripBom(file.content);
  let frontmatter: Record<string, unknown> = {};
  let body = content;
  let hasFrontmatter = FRONTMATTER_DELIMITER.test(content);
  let frontmatterInvalid = false;

  if (hasFrontmatter) {
    try {
      const parsed = matter(content);
      if (isPlainObject(parsed.data)) {
        frontmatter = parsed.data;
        body = parsed.content;
      } else {
        // A leading `---` that is not a YAML mapping is just plain content.
        hasFrontmatter = false;
      }
    } catch (error) {
      frontmatterInvalid = true;
      hasFrontmatter = false;
      body = stripFrontmatterBlock(content);
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      warnings.push(
        createWarning(
          'invalid-frontmatter',
          `The YAML frontmatter could not be parsed, so this rule cannot be resolved: ${message ?? 'parse error'}`,
          target,
          1
        )
      );
    }
  }

  const metadata = inspectMetadata(file.kind, frontmatter);

  for (const field of metadata.unsupportedFields) {
    warnings.push(
      createWarning('unsupported-metadata', UNSUPPORTED_FIELD_MESSAGE, target, findKeyLine(content, field), {
        title: unsupportedFieldTitle(file.kind, field)
      })
    );
  }

  const scopeField = scopeFieldOf(file.kind);
  for (const field of metadata.invalidFields) {
    const isScopeField = field === scopeField;
    warnings.push(
      createWarning(
        isScopeField ? 'invalid-pattern-field' : 'invalid-metadata-type',
        `${expectedTypeMessage(file.kind, field)}${
          metadata.blockingFields.includes(field)
            ? ' Applicability cannot be determined until it is fixed.'
            : ' The value was ignored.'
        }`,
        target,
        findKeyLine(content, field),
        { title: invalidFieldTitle(file.kind, field) }
      )
    );
  }

  let patterns: string[] | undefined;
  if (scopeField !== undefined && !frontmatterInvalid && !metadata.blockingFields.includes(scopeField)) {
    const field = readPatternField(frontmatter[scopeField]);
    if (field.patterns !== undefined && field.patterns.length > 0) {
      patterns = field.patterns;
      const invalidPatterns = findInvalidPatterns(patterns);
      if (invalidPatterns.length > 0) {
        warnings.push(
          createWarning(
            'invalid-glob',
            `Glob pattern could not be processed and was skipped when matching files: ${invalidPatterns.join(', ')}`,
            target,
            findKeyLine(content, scopeField)
          )
        );
        const usable = patterns.filter((pattern) => !invalidPatterns.includes(pattern));
        patterns = usable.length > 0 ? usable : undefined;
      }
    }
  }

  if (file.kind === 'cursor-rule' && !hasFrontmatter && !frontmatterInvalid) {
    warnings.push(
      createWarning(
        'missing-frontmatter',
        'Without frontmatter, Cursor cannot tell when to use this rule. It will never be applied automatically.',
        target,
        1
      )
    );
  }

  if (
    file.kind === 'copilot-scoped-instructions' &&
    !frontmatterInvalid &&
    metadata.blockingFields.length === 0 &&
    patterns === undefined
  ) {
    warnings.push(
      createWarning(
        'missing-apply-to',
        'Without an "applyTo" field, Copilot cannot tell which files this rule covers. It will be ignored.',
        target,
        1
      )
    );
  }

  const isClaudeKind = CLAUDE_KINDS.has(file.kind);
  const imports = isClaudeKind ? extractClaudeImports(content) : [];

  if (isClaudeKind) {
    const lengthWarning = checkRuleLength(target, content);
    if (lengthWarning !== undefined) {
      warnings.push(lengthWarning);
    }
  }

  const rule: ParsedRule = {
    ...file,
    id: `${file.kind}:${file.relativePath}`,
    body,
    frontmatter,
    hasFrontmatter,
    frontmatterInvalid,
    blockingFields: metadata.blockingFields,
    unsupportedFields: metadata.unsupportedFields,
    directory: directoryOf(file.relativePath),
    imports,
    estimatedTokens: estimateTokens(body),
    warnings
  };

  if (patterns !== undefined) {
    rule.patterns = patterns;
  }
  const description = readOptionalString(frontmatter['description']);
  if (description !== undefined) {
    rule.description = description;
  }
  const alwaysApply = readOptionalBoolean(frontmatter['alwaysApply']);
  if (alwaysApply !== undefined) {
    rule.alwaysApply = alwaysApply;
  }

  return rule;
}
