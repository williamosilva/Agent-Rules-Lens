import { describe, expect, it } from 'vitest';
import { FORMAT_CATALOG, type SupportLevel } from '../src/domain/formatCatalog';
import {
  classifyArtifact,
  classifyResolvedRule,
  validateUserPatterns
} from '../src/services/artifactClassifier';
import { buildDiscoveryPatterns, buildWatchPatterns } from '../src/services/ruleDiscoveryPatterns';
import { toPosixPath } from '../src/utils/paths';

function levelOf(path: string, userPatterns: string[] = []): SupportLevel | undefined {
  return classifyArtifact(path, userPatterns)?.supportLevel;
}

describe('catalog integrity', () => {
  it('gives every definition an id, a name and at least one pattern', () => {
    for (const definition of FORMAT_CATALOG) {
      expect(definition.id.length).toBeGreaterThan(0);
      expect(definition.displayName.length).toBeGreaterThan(0);
      expect(definition.patterns.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids', () => {
    const ids = FORMAT_CATALOG.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only attaches a rule kind to a resolved format', () => {
    for (const definition of FORMAT_CATALOG) {
      if (definition.supportLevel === 'resolved') {
        expect(definition.kind).toBeDefined();
        expect(definition.source).toBeDefined();
      } else {
        expect(definition.kind).toBeUndefined();
      }
    }
  });

  it('collapses the catalog into a couple of workspace scans', () => {
    const patterns = buildDiscoveryPatterns();
    expect(patterns.length).toBeLessThanOrEqual(3);
    expect(buildWatchPatterns()).toEqual(patterns.map((pattern) => pattern.include));
    // The CLAUDE.md group keeps its exclude, so `.claude/CLAUDE.md` stays a
    // project rule rather than a folder scoped memory file.
    expect(patterns.some((pattern) => pattern.exclude?.includes('**/.claude/**') === true)).toBe(
      true
    );
  });

  it('adds validated user patterns to the scans and the watchers', () => {
    const patterns = buildDiscoveryPatterns(['**/MY_RULES.md']);
    expect(patterns.some((pattern) => pattern.include.includes('**/MY_RULES.md'))).toBe(true);
    expect(buildWatchPatterns(['**/MY_RULES.md']).join(' ')).toContain('**/MY_RULES.md');
  });
});

describe('resolved formats keep resolving', () => {
  it.each([
    ['AGENTS.md', 'agents-md'],
    ['src/backend/AGENTS.md', 'agents-md'],
    ['AGENTS.override.md', 'agents-override-md'],
    ['src/backend/AGENTS.override.md', 'agents-override-md'],
    ['CLAUDE.md', 'claude-md'],
    ['pkg/CLAUDE.local.md', 'claude-local-md'],
    ['.claude/CLAUDE.md', 'claude-project-md'],
    ['.claude/rules/style.md', 'claude-rule'],
    ['.cursor/rules/frontend.mdc', 'cursor-rule'],
    ['.github/copilot-instructions.md', 'copilot-instructions'],
    ['.github/instructions/ts.instructions.md', 'copilot-scoped-instructions']
  ])('%s resolves as %s', (path, kind) => {
    expect(classifyResolvedRule(path)?.kind).toBe(kind);
    expect(levelOf(path)).toBe('resolved');
  });
});

describe('detected configurations', () => {
  it.each([
    ['GEMINI.md', 'Gemini'],
    ['.qwen/QWEN.local.md', 'Qwen'],
    ['QWEN.md', 'Qwen'],
    ['.windsurf/rules/backend.md', 'Windsurf'],
    ['.clinerules/01-typescript.md', 'Cline'],
    ['.clinerules', 'Cline'],
    ['.roo/rules/general', 'Roo Code'],
    ['.roo/rules-code/style.md', 'Roo Code'],
    ['.roorules', 'Roo Code'],
    ['.continue/rules/style.md', 'Continue'],
    ['.kiro/steering/tech.md', 'Kiro'],
    ['.amazonq/rules/backend.md', 'Amazon Q Developer'],
    ['.junie/guidelines.md', 'Junie'],
    ['.junie/rules/style.md', 'Junie'],
    ['.augment/rules/style.md', 'Augment'],
    ['.augment-guidelines', 'Augment'],
    ['replit.md', 'Replit Agent'],
    ['.qoder/rules/style.md', 'Qoder'],
    ['CODEBUDDY.md', 'CodeBuddy'],
    ['.codebuddy/rules/style.mdc', 'CodeBuddy'],
    ['.trae/rules/style.md', 'Trae'],
    ['.rules', 'Zed'],
    ['AGENT.md', 'Zed']
  ])('%s is detected and attributed to %s', (path, tool) => {
    const artifact = classifyArtifact(path);
    expect(artifact?.supportLevel).toBe('detected');
    expect(artifact?.recognizedBy).toContain(tool);
    // Detected never means resolved.
    expect(classifyResolvedRule(path)).toBeUndefined();
  });

  it('keeps replit.md to the workspace root', () => {
    expect(levelOf('replit.md')).toBe('detected');
    expect(levelOf('packages/api/replit.md')).toBeUndefined();
  });

  it('separates the .clinerules file from the .clinerules folder', () => {
    expect(classifyArtifact('.clinerules')?.formatIds).toContain('cline');
    expect(classifyArtifact('.clinerules/01-typescript.md')?.formatIds).toContain('cline');
    expect(classifyArtifact('.clinerules/notes.txt')?.supportLevel).toBe('detected');
  });

  it('marks a legacy file name as legacy', () => {
    expect(classifyArtifact('.cursorrules')?.legacy).toBe(true);
    expect(classifyArtifact('.windsurf/rules/x.md')?.legacy).toBe(false);
  });
});

describe('one file, several tools', () => {
  it('returns a single resolved entry for AGENTS.md and lists who reads it', () => {
    const artifact = classifyArtifact('AGENTS.md');
    expect(artifact?.supportLevel).toBe('resolved');
    expect(artifact?.kind).toBe('agents-md');
    expect(artifact?.recognizedBy.length).toBeGreaterThan(1);
    expect(artifact?.recognizedBy).toContain('AGENTS.md');
    expect(artifact?.recognizedBy).toContain('Windsurf');
    expect(artifact?.recognizedBy).toContain('Zed');
    // No duplicated tool names.
    expect(new Set(artifact?.recognizedBy).size).toBe(artifact?.recognizedBy.length);
  });

  it('keeps CLAUDE.md resolved even though other tools read it', () => {
    const artifact = classifyArtifact('CLAUDE.md');
    expect(artifact?.supportLevel).toBe('resolved');
    expect(artifact?.recognizedBy).toContain('Claude');
    expect(artifact?.recognizedBy).toContain('Zed');
  });

  it('lists every tool that claims a shared legacy name', () => {
    const artifact = classifyArtifact('.windsurfrules');
    expect(artifact?.supportLevel).toBe('detected');
    expect(artifact?.recognizedBy.sort()).toEqual(['Cline', 'Windsurf', 'Zed']);
  });
});

describe('candidate files', () => {
  it.each([
    'RULES.md',
    'AI_RULES.md',
    'AI-RULES.md',
    'AGENT_RULES.md',
    'LLM_RULES.md',
    'INSTRUCTIONS.md',
    'PROJECT_INSTRUCTIONS.md',
    'CODING_GUIDELINES.md',
    'GUIDELINES.md',
    'CONVENTIONS.md',
    'CONTEXT.md',
    'PROMPT.md',
    'SYSTEM_PROMPT.md',
    'docs/AI-INSTRUCTIONS.md'
  ])('%s is only a candidate', (path) => {
    const artifact = classifyArtifact(path);
    expect(artifact?.supportLevel).toBe('candidate');
    // A candidate is never attributed to a tool.
    expect(artifact?.recognizedBy).toEqual([]);
    expect(classifyResolvedRule(path)).toBeUndefined();
  });

  it.each([
    '.ai/rules/00-general.md',
    '.agent/rules/style.md',
    '.agents/rules/style.md',
    '.rules/01-typescript.md',
    'ai-rules/10-backend.md',
    'agent-rules/99-overrides.md',
    'instructions/00-general.md'
  ])('%s is a candidate because of its folder', (path) => {
    expect(levelOf(path)).toBe('candidate');
  });

  it('does not hunt for numeric prefixes outside a rules folder', () => {
    expect(levelOf('01-introduction.md')).toBeUndefined();
    expect(levelOf('docs/01-introduction.md')).toBeUndefined();
    expect(levelOf('src/00-general.md')).toBeUndefined();
  });

  it.each([
    'README.md',
    'CONTRIBUTING.md',
    'ARCHITECTURE.md',
    'CHANGELOG.md',
    'SECURITY.md',
    'LICENSE.md',
    'docs/README.md',
    '.ai/rules/README.md'
  ])('%s never becomes a rule or a candidate', (path) => {
    expect(classifyArtifact(path)).toBeUndefined();
  });

  it('ignores ordinary source and document files', () => {
    for (const path of [
      'src/index.ts',
      'docs/guide.md',
      'package.json',
      'src/frontend/OrderCard.tsx'
    ]) {
      expect(classifyArtifact(path)).toBeUndefined();
    }
  });
});

describe('files that are not rules', () => {
  it.each([
    ['.github/agents/reviewer.agent.md', 'agent'],
    ['.claude/agents/planner.md', 'agent'],
    ['.opencode/agents/build.md', 'agent'],
    ['.codebuddy/agents/review.md', 'agent'],
    ['.github/prompts/refactor.prompt.md', 'prompt'],
    ['.agents/skills/pdf/SKILL.md', 'skill']
  ])('%s is recognized as a %s, never as a rule', (path, artifactKind) => {
    const artifact = classifyArtifact(path);
    expect(artifact?.supportLevel).toBe('nonRule');
    expect(artifact?.artifactKind).toBe(artifactKind);
    expect(classifyResolvedRule(path)).toBeUndefined();
  });

  it('prefers the non rule classification over a candidate folder match', () => {
    // `.agents/rules/**` is a candidate folder, `.agents/skills/**/SKILL.md` is
    // a skill: the more specific, deliberately excluded meaning wins.
    expect(levelOf('.agents/skills/pdf/SKILL.md')).toBe('nonRule');
  });
});

describe('user declared patterns', () => {
  it('adds a matching file as a candidate', () => {
    const artifact = classifyArtifact('config/house-style.md', ['config/**/*.md']);
    expect(artifact?.supportLevel).toBe('candidate');
    expect(artifact?.formatIds).toContain('user-declared');
    expect(artifact?.recognizedBy).toEqual([]);
  });

  it('never upgrades what the catalog already knows', () => {
    const artifact = classifyArtifact('AGENTS.md', ['**/AGENTS.md']);
    expect(artifact?.supportLevel).toBe('resolved');
  });

  it('leaves unmatched files alone', () => {
    expect(classifyArtifact('src/index.ts', ['config/**/*.md'])).toBeUndefined();
  });

  it('keeps only usable patterns', () => {
    const result = validateUserPatterns([
      '**/AI_RULES.md',
      '.ai/rules/**/*.md',
      '',
      '   ',
      42,
      null,
      '../outside/**',
      '/etc/passwd',
      'C:/Windows/**',
      '**/AI_RULES.md'
    ]);
    expect(result.patterns).toEqual(['**/AI_RULES.md', '.ai/rules/**/*.md']);
    expect(result.rejected.map((entry) => entry.reason)).toEqual([
      'empty',
      'empty',
      'not a string',
      'not a string',
      'must stay inside the workspace',
      'absolute paths are not allowed',
      'absolute paths are not allowed'
    ]);
  });

  it('survives a setting that is not an array at all', () => {
    for (const value of [undefined, null, 'string', 42, {}, [[]], [{}]]) {
      expect(() => validateUserPatterns(value)).not.toThrow();
    }
    expect(validateUserPatterns('nonsense').patterns).toEqual([]);
    expect(validateUserPatterns(undefined).patterns).toEqual([]);
  });
});

describe('path normalization', () => {
  it('classifies a Windows style relative path the same as a POSIX one', () => {
    const windows = 'src\\backend\\AGENTS.md';
    const posix = 'src/backend/AGENTS.md';
    expect(classifyArtifact(toPosixPath(windows))?.kind).toBe('agents-md');
    expect(classifyArtifact(windows)?.relativePath).toBe(posix);
    expect(classifyArtifact(windows)?.kind).toBe(classifyArtifact(posix)?.kind);
  });

  it('tolerates a leading ./ and duplicated separators', () => {
    expect(classifyArtifact('./AGENTS.md')?.kind).toBe('agents-md');
    expect(classifyArtifact('src//backend//AGENTS.md')?.kind).toBe('agents-md');
    expect(classifyArtifact('.\\.kiro\\steering\\tech.md')?.supportLevel).toBe('detected');
  });

  it('rejects an empty path', () => {
    expect(classifyArtifact('')).toBeUndefined();
    expect(classifyArtifact('   ')).toBeUndefined();
  });
});
