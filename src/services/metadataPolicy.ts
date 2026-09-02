import type { RuleKind } from '../domain/types';

/**
 * What each supported format documents, in one place. Nothing outside this
 * table may be given meaning: an unrecognized key is reported and ignored, and
 * a recognized key with an unusable value makes applicability `unknown` instead
 * of falling back to a silent default.
 */

export type FieldType = 'string' | 'boolean' | 'patterns';

export interface FieldSpec {
  type: FieldType;
  /**
   * True when applicability is derived from this field, so a malformed value
   * has to produce `unknown` rather than a guess.
   */
  decidesApplicability: boolean;
}

export interface FormatMetadataPolicy {
  /** Format name used in diagnostics, e.g. "Unsupported Claude metadata". */
  label: string;
  fields: Readonly<Record<string, FieldSpec>>;
}

const NO_FRONTMATTER: Readonly<Record<string, FieldSpec>> = {};

export const METADATA_POLICY: Readonly<Record<RuleKind, FormatMetadataPolicy>> = {
  // agents.md documents plain Markdown. Scope comes from the folder only.
  'agents-md': { label: 'AGENTS.md', fields: NO_FRONTMATTER },
  'agents-override-md': { label: 'AGENTS.md', fields: NO_FRONTMATTER },

  // Claude memory files are plain Markdown as well.
  'claude-md': { label: 'Claude', fields: NO_FRONTMATTER },
  'claude-local-md': { label: 'Claude', fields: NO_FRONTMATTER },
  'claude-project-md': { label: 'Claude', fields: NO_FRONTMATTER },

  'claude-rule': {
    label: 'Claude',
    fields: {
      paths: { type: 'patterns', decidesApplicability: true }
    }
  },

  'cursor-rule': {
    label: 'Cursor',
    fields: {
      alwaysApply: { type: 'boolean', decidesApplicability: true },
      globs: { type: 'patterns', decidesApplicability: true },
      description: { type: 'string', decidesApplicability: true }
    }
  },

  'copilot-instructions': { label: 'Copilot', fields: NO_FRONTMATTER },

  'copilot-scoped-instructions': {
    label: 'Copilot',
    fields: {
      applyTo: { type: 'patterns', decidesApplicability: true },
      description: { type: 'string', decidesApplicability: false },
      // Documented, but never used to resolve applicability.
      excludeAgent: { type: 'string', decidesApplicability: false }
    }
  }
};

/** The field a format reads to filter by path, when it has one. */
export function scopeFieldOf(kind: RuleKind): string | undefined {
  const { fields } = METADATA_POLICY[kind];
  return Object.entries(fields).find(([, spec]) => spec.type === 'patterns')?.[0];
}

/** YAML writes an empty value as null; that means absent, not malformed. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isValidValue(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      if (typeof value === 'boolean') {
        return true;
      }
      return typeof value === 'string' && ['true', 'false'].includes(value.trim().toLowerCase());
    case 'patterns':
      if (typeof value === 'string') {
        return true;
      }
      return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
    default:
      return false;
  }
}

export interface MetadataInspection {
  /** Keys the format does not document, sorted. */
  unsupportedFields: string[];
  /** Recognized keys holding an unusable value, sorted. */
  invalidFields: string[];
  /** Subset of `invalidFields` that applicability depends on, sorted. */
  blockingFields: string[];
}

/** Classifies every frontmatter key of a rule file against its format. */
export function inspectMetadata(
  kind: RuleKind,
  frontmatter: Readonly<Record<string, unknown>>
): MetadataInspection {
  const { fields } = METADATA_POLICY[kind];
  const unsupportedFields: string[] = [];
  const invalidFields: string[] = [];
  const blockingFields: string[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    const spec = fields[key];
    if (spec === undefined) {
      unsupportedFields.push(key);
      continue;
    }
    if (isAbsent(value) || isValidValue(value, spec.type)) {
      continue;
    }
    invalidFields.push(key);
    if (spec.decidesApplicability) {
      blockingFields.push(key);
    }
  }

  return {
    unsupportedFields: unsupportedFields.sort(),
    invalidFields: invalidFields.sort(),
    blockingFields: blockingFields.sort()
  };
}

/** `Unsupported Claude metadata: scope` */
export function unsupportedFieldTitle(kind: RuleKind, field: string): string {
  return `Unsupported ${METADATA_POLICY[kind].label} metadata: ${field}`;
}

export const UNSUPPORTED_FIELD_MESSAGE =
  'This field was ignored when determining applicability.';

/** `Invalid Claude metadata: paths` */
export function invalidFieldTitle(kind: RuleKind, field: string): string {
  return `Invalid ${METADATA_POLICY[kind].label} metadata: ${field}`;
}

/** What the author has to fix for a recognized field with a bad value. */
export function expectedTypeMessage(kind: RuleKind, field: string): string {
  const spec = METADATA_POLICY[kind].fields[field];
  switch (spec?.type) {
    case 'patterns':
      return `"${field}" must be a glob string or a list of glob strings.`;
    case 'boolean':
      return `"${field}" must be true or false.`;
    case 'string':
      return `"${field}" must be a string.`;
    default:
      return `"${field}" holds a value this format does not allow.`;
  }
}
