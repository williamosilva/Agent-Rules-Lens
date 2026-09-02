import { describe, expect, it } from 'vitest';
import type { RuleKind } from '../src/domain/types';
import {
  expectedTypeMessage,
  inspectMetadata,
  METADATA_POLICY,
  scopeFieldOf,
  UNSUPPORTED_FIELD_MESSAGE,
  unsupportedFieldTitle
} from '../src/services/metadataPolicy';

const ALL_KINDS: RuleKind[] = [
  'agents-md',
  'agents-override-md',
  'claude-md',
  'claude-local-md',
  'claude-project-md',
  'claude-rule',
  'cursor-rule',
  'copilot-instructions',
  'copilot-scoped-instructions'
];

describe('metadata policy', () => {
  it('covers every rule kind exactly once', () => {
    expect(Object.keys(METADATA_POLICY).sort()).toEqual([...ALL_KINDS].sort());
  });

  it('documents one scope field per format, and none for plain Markdown formats', () => {
    expect(scopeFieldOf('claude-rule')).toBe('paths');
    expect(scopeFieldOf('cursor-rule')).toBe('globs');
    expect(scopeFieldOf('copilot-scoped-instructions')).toBe('applyTo');
    expect(scopeFieldOf('agents-md')).toBeUndefined();
    expect(scopeFieldOf('claude-md')).toBeUndefined();
    expect(scopeFieldOf('copilot-instructions')).toBeUndefined();
  });

  it('reports anything the format does not document', () => {
    expect(inspectMetadata('claude-rule', { scope: 'backend' })).toEqual({
      unsupportedFields: ['scope'],
      invalidFields: [],
      blockingFields: []
    });
    expect(inspectMetadata('cursor-rule', { priority: 1, owner: 'team' }).unsupportedFields).toEqual(
      ['owner', 'priority']
    );
    // AGENTS.md and the Claude memory files document no frontmatter at all.
    expect(inspectMetadata('agents-md', { anything: true }).unsupportedFields).toEqual(['anything']);
  });

  it('accepts every documented shape of a scope field', () => {
    for (const value of ['**/*.ts', ['a/**', 'b/**'], '**/*.ts,**/*.tsx']) {
      expect(inspectMetadata('claude-rule', { paths: value }).invalidFields).toEqual([]);
    }
  });

  it('flags a scope field with an unusable value as blocking', () => {
    for (const value of [42, true, { nested: 1 }, [1, 2], ['ok', 3]]) {
      const result = inspectMetadata('claude-rule', { paths: value });
      expect(result.invalidFields).toEqual(['paths']);
      expect(result.blockingFields).toEqual(['paths']);
    }
  });

  it('treats an empty YAML value as absent, not malformed', () => {
    const result = inspectMetadata('cursor-rule', {
      globs: null,
      description: null,
      alwaysApply: null
    });
    expect(result).toEqual({ unsupportedFields: [], invalidFields: [], blockingFields: [] });
  });

  it('accepts booleans written as strings, and rejects other words', () => {
    expect(inspectMetadata('cursor-rule', { alwaysApply: true }).invalidFields).toEqual([]);
    expect(inspectMetadata('cursor-rule', { alwaysApply: 'false' }).invalidFields).toEqual([]);
    expect(inspectMetadata('cursor-rule', { alwaysApply: 'maybe' }).blockingFields).toEqual([
      'alwaysApply'
    ]);
    expect(inspectMetadata('cursor-rule', { alwaysApply: 1 }).blockingFields).toEqual([
      'alwaysApply'
    ]);
  });

  it('separates fields that decide applicability from those that do not', () => {
    // A Copilot description is documented but never used to resolve scope.
    const copilot = inspectMetadata('copilot-scoped-instructions', { description: 42 });
    expect(copilot.invalidFields).toEqual(['description']);
    expect(copilot.blockingFields).toEqual([]);

    // A Cursor description does decide between agentDecided and manual.
    const cursor = inspectMetadata('cursor-rule', { description: 42 });
    expect(cursor.invalidFields).toEqual(['description']);
    expect(cursor.blockingFields).toEqual(['description']);
  });

  it('writes the diagnostic text the product specifies', () => {
    expect(unsupportedFieldTitle('claude-rule', 'scope')).toBe(
      'Unsupported Claude metadata: scope'
    );
    expect(unsupportedFieldTitle('cursor-rule', 'priority')).toBe(
      'Unsupported Cursor metadata: priority'
    );
    expect(unsupportedFieldTitle('copilot-scoped-instructions', 'x')).toBe(
      'Unsupported Copilot metadata: x'
    );
    expect(UNSUPPORTED_FIELD_MESSAGE).toBe(
      'This field was ignored when determining applicability.'
    );
  });

  it('says what a malformed field should have been', () => {
    expect(expectedTypeMessage('claude-rule', 'paths')).toContain('glob string or a list');
    expect(expectedTypeMessage('cursor-rule', 'alwaysApply')).toContain('true or false');
    expect(expectedTypeMessage('cursor-rule', 'description')).toContain('must be a string');
  });

  it('never crashes on unusual frontmatter shapes', () => {
    for (const kind of ALL_KINDS) {
      expect(() =>
        inspectMetadata(kind, {
          '': 1,
          nested: { deep: { deeper: [1, 2, 3] } },
          'weird-key!': Symbol('x') as unknown
        })
      ).not.toThrow();
    }
  });
});
