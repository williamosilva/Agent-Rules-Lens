import type { RuleKind, RuleSource } from './types';

/**
 * The one place that knows which file names belong to which tool. Every service
 * derives its patterns from this table; no other module carries a list of
 * names.
 *
 * `supportLevel` is the honest claim this extension makes about a file:
 *
 * - `resolved`  — the documented resolution rules are implemented, so
 *                 applicability against the open file is computed.
 * - `detected`  — we know which tool the file belongs to, and nothing more.
 *                 Applicability is never asserted.
 * - `candidate` — the name or folder suggests hand written instructions. No
 *                 tool is attributed and applicability is never asserted.
 * - `nonRule`   — recognized, and deliberately not a rule: a custom agent
 *                 definition, a prompt or a skill.
 */
export type SupportLevel = 'resolved' | 'detected' | 'candidate' | 'nonRule';

export type ArtifactKind = 'rule' | 'agent' | 'prompt' | 'skill';

export interface RuleFormatDefinition {
  id: string;
  /** Tool name shown to the user. */
  displayName: string;
  /**
   * Base name of the mark in media/icons/agents, without the theme suffix.
   * Every id must resolve to a real file; the icon inventory test enforces it.
   */
  iconId: string;
  /** Workspace relative globs, POSIX separators. */
  patterns: readonly string[];
  supportLevel: SupportLevel;
  artifactKind: ArtifactKind;
  /** True for a file name a tool keeps only for backwards compatibility. */
  legacy?: boolean;
  /** Set only when `supportLevel` is `resolved`. */
  kind?: RuleKind;
  source?: RuleSource;
  /** Extra excludes to apply when discovering this format. */
  exclude?: readonly string[];
}

/** Higher wins when one file matches several definitions. */
export const SUPPORT_LEVEL_PRECEDENCE: Readonly<Record<SupportLevel, number>> = {
  resolved: 3,
  nonRule: 2,
  detected: 1,
  candidate: 0
};

const SHARED = 'AGENTS.md';

/**
 * Formats whose documented resolution rules are implemented. Changing these
 * changes what the extension claims to understand.
 */
const RESOLVED: readonly RuleFormatDefinition[] = [
  {
    id: 'shared-agents',
    displayName: SHARED,
    iconId: 'shared-rules',
    patterns: ['**/AGENTS.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'agents-md',
    source: 'agents'
  },
  {
    id: 'shared-agents-override',
    displayName: SHARED,
    iconId: 'shared-rules',
    patterns: ['**/AGENTS.override.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'agents-override-md',
    source: 'agents'
  },
  {
    id: 'claude-memory',
    displayName: 'Claude',
    iconId: 'claude',
    patterns: ['**/CLAUDE.md'],
    // `.claude/CLAUDE.md` is a project rule with its own definition below.
    exclude: ['**/.claude/**'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'claude-md',
    source: 'claude'
  },
  {
    id: 'claude-local-memory',
    displayName: 'Claude',
    iconId: 'claude',
    patterns: ['**/CLAUDE.local.md'],
    exclude: ['**/.claude/**'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'claude-local-md',
    source: 'claude'
  },
  {
    id: 'claude-project',
    displayName: 'Claude',
    iconId: 'claude',
    patterns: ['.claude/CLAUDE.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'claude-project-md',
    source: 'claude'
  },
  {
    id: 'claude-rules',
    displayName: 'Claude',
    iconId: 'claude',
    patterns: ['.claude/rules/**/*.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'claude-rule',
    source: 'claude'
  },
  {
    id: 'cursor-rules',
    displayName: 'Cursor',
    iconId: 'cursor',
    patterns: ['.cursor/rules/**/*.mdc'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'cursor-rule',
    source: 'cursor'
  },
  {
    id: 'copilot-repository',
    displayName: 'GitHub Copilot',
    iconId: 'github-copilot',
    patterns: ['.github/copilot-instructions.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'copilot-instructions',
    source: 'copilot'
  },
  {
    id: 'copilot-scoped',
    displayName: 'GitHub Copilot',
    iconId: 'github-copilot',
    patterns: ['.github/instructions/**/*.instructions.md'],
    supportLevel: 'resolved',
    artifactKind: 'rule',
    kind: 'copilot-scoped-instructions',
    source: 'copilot'
  }
];

/**
 * Official configuration of other tools. Listing a shared file such as
 * `AGENTS.md` here is deliberate: it makes the tool show up in `recognizedBy`
 * without turning the file into a second entry.
 */
const DETECTED: readonly RuleFormatDefinition[] = [
  {
    id: 'gemini',
    displayName: 'Gemini',
    iconId: 'gemini',
    patterns: ['**/GEMINI.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'qwen',
    displayName: 'Qwen',
    iconId: 'qwen',
    patterns: ['**/QWEN.md', '.qwen/QWEN.local.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    iconId: 'windsurf',
    patterns: ['.windsurf/rules/**/*.md', '**/AGENTS.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'windsurf-legacy',
    displayName: 'Windsurf',
    iconId: 'windsurf',
    patterns: ['**/.windsurfrules'],
    supportLevel: 'detected',
    artifactKind: 'rule',
    legacy: true
  },
  {
    id: 'cline',
    displayName: 'Cline',
    iconId: 'cline',
    // The bare `.clinerules` file and the `.clinerules/` folder are different
    // things; findFiles only ever returns files, so both stay unambiguous.
    patterns: ['.clinerules/**/*.md', '.clinerules/**/*.txt', '**/.clinerules'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'cline-legacy',
    displayName: 'Cline',
    iconId: 'cline',
    patterns: ['**/.cursorrules', '**/.windsurfrules'],
    supportLevel: 'detected',
    artifactKind: 'rule',
    legacy: true
  },
  {
    id: 'roo-code',
    displayName: 'Roo Code',
    iconId: 'roo-code',
    patterns: ['.roo/rules/**/*', '.roo/rules-*/**/*', '**/.roorules', '**/.roorules-*'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'continue',
    displayName: 'Continue',
    iconId: 'continue',
    patterns: ['.continue/rules/**/*.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    iconId: 'kiro',
    patterns: ['.kiro/steering/**/*.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'amazon-q',
    displayName: 'Amazon Q Developer',
    iconId: 'amazon-q',
    patterns: ['.amazonq/rules/**/*.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'junie',
    displayName: 'Junie',
    iconId: 'junie',
    patterns: [
      '.junie/AGENTS.md',
      '.junie/playbook.md',
      '.junie/guidelines.md',
      '.junie/rules/**/*.md',
      '.junie/guidelines/**/*.md'
    ],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'augment',
    displayName: 'Augment',
    iconId: 'augment',
    patterns: ['.augment/rules/**/*.md', '**/.augment-guidelines', '**/AGENTS.md', '**/CLAUDE.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'replit',
    displayName: 'Replit Agent',
    iconId: 'replit',
    // Root only, on purpose.
    patterns: ['replit.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'qoder',
    displayName: 'Qoder',
    iconId: 'qoder',
    patterns: ['.qoder/rules/**/*.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    iconId: 'codebuddy',
    patterns: [
      '**/CODEBUDDY.md',
      '**/CODEBUDDY.local.md',
      '.codebuddy/rules/**/*.md',
      '.codebuddy/rules/**/*.mdc'
    ],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'trae',
    displayName: 'Trae',
    iconId: 'trae',
    patterns: ['.trae/rules/**/*.md'],
    supportLevel: 'detected',
    artifactKind: 'rule'
  },
  {
    id: 'zed',
    displayName: 'Zed',
    iconId: 'zed',
    patterns: [
      '**/.rules',
      '**/AGENT.md',
      '**/AGENTS.md',
      '**/CLAUDE.md',
      '**/GEMINI.md',
      '**/.cursorrules',
      '**/.windsurfrules',
      '**/.clinerules'
    ],
    supportLevel: 'detected',
    artifactKind: 'rule'
  }
];

/** Recognized, and deliberately not instructions for the open file. */
const NON_RULE: readonly RuleFormatDefinition[] = [
  {
    id: 'copilot-custom-agents',
    displayName: 'GitHub Copilot',
    iconId: 'github-copilot',
    patterns: ['.github/agents/*.agent.md'],
    supportLevel: 'nonRule',
    artifactKind: 'agent'
  },
  {
    id: 'claude-subagents',
    displayName: 'Claude',
    iconId: 'claude',
    patterns: ['.claude/agents/**/*.md'],
    supportLevel: 'nonRule',
    artifactKind: 'agent'
  },
  {
    id: 'opencode-agents',
    displayName: 'OpenCode',
    iconId: 'opencode',
    patterns: ['.opencode/agents/**/*.md'],
    supportLevel: 'nonRule',
    artifactKind: 'agent'
  },
  {
    id: 'codebuddy-agents',
    displayName: 'CodeBuddy',
    iconId: 'codebuddy',
    patterns: ['.codebuddy/agents/**/*.md'],
    supportLevel: 'nonRule',
    artifactKind: 'agent'
  },
  {
    id: 'copilot-prompts',
    displayName: 'GitHub Copilot',
    iconId: 'github-copilot',
    patterns: ['.github/prompts/*.prompt.md'],
    supportLevel: 'nonRule',
    artifactKind: 'prompt'
  },
  {
    id: 'agent-skills',
    displayName: 'Agent Skills',
    iconId: 'generic-agent',
    patterns: ['.agents/skills/**/SKILL.md'],
    supportLevel: 'nonRule',
    artifactKind: 'skill'
  }
];

/** File names people commonly invent for hand written instructions. */
const CANDIDATE_NAMES: readonly string[] = [
  'RULES.md',
  'AI_RULES.md',
  'AI-RULES.md',
  'AGENT_RULES.md',
  'AGENT-RULES.md',
  'LLM_RULES.md',
  'LLM-RULES.md',
  'INSTRUCTIONS.md',
  'AI_INSTRUCTIONS.md',
  'AI-INSTRUCTIONS.md',
  'AGENT_INSTRUCTIONS.md',
  'AGENT-INSTRUCTIONS.md',
  'PROJECT_INSTRUCTIONS.md',
  'PROJECT-INSTRUCTIONS.md',
  'PROJECT_RULES.md',
  'PROJECT-RULES.md',
  'CODING_RULES.md',
  'CODING-RULES.md',
  'CODING_GUIDELINES.md',
  'CODING-GUIDELINES.md',
  'GUIDELINES.md',
  'CONVENTIONS.md',
  'CONTEXT.md',
  'PROMPT.md',
  'SYSTEM_PROMPT.md',
  'SYSTEM-PROMPT.md'
];

/**
 * Folders that hold hand written instructions. Numeric prefixes such as
 * `01-typescript.md` only count as candidates inside one of these, or inside an
 * official rules folder: there is no global `00-*.md` search, which would be a
 * false positive factory.
 */
const CANDIDATE_FOLDERS: readonly string[] = [
  '.ai/rules',
  '.agent/rules',
  '.agents/rules',
  '.rules',
  'ai-rules',
  'agent-rules',
  'instructions'
];

const CANDIDATE: readonly RuleFormatDefinition[] = [
  {
    id: 'manual-named-file',
    displayName: 'Custom instructions',
    iconId: 'custom-rules',
    patterns: CANDIDATE_NAMES.map((name) => `**/${name}`),
    supportLevel: 'candidate',
    artifactKind: 'rule'
  },
  {
    id: 'manual-rules-folder',
    displayName: 'Custom instructions',
    iconId: 'custom-rules',
    patterns: CANDIDATE_FOLDERS.map((folder) => `**/${folder}/**/*.md`),
    supportLevel: 'candidate',
    artifactKind: 'rule'
  }
];

/**
 * Ordinary repository documents. They are never promoted to candidates, even
 * when they sit inside a folder that otherwise holds instructions.
 */
export const NEVER_A_CANDIDATE: readonly string[] = [
  'README.md',
  'CONTRIBUTING.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'LICENSE.md',
  'CODE_OF_CONDUCT.md'
];

export const FORMAT_CATALOG: readonly RuleFormatDefinition[] = [
  ...RESOLVED,
  ...DETECTED,
  ...NON_RULE,
  ...CANDIDATE
];

/** The id used for files added through the user setting. */
export const USER_DECLARED_FORMAT_ID = 'user-declared';

/** The mark used for a resolved format, looked up by its rule source. */
export function iconIdForSource(source: RuleSource): string {
  return (
    FORMAT_CATALOG.find(
      (definition) => definition.supportLevel === 'resolved' && definition.source === source
    )?.iconId ?? 'generic-agent'
  );
}

export function definitionsByLevel(level: SupportLevel): RuleFormatDefinition[] {
  return FORMAT_CATALOG.filter((definition) => definition.supportLevel === level);
}

export function findDefinition(id: string): RuleFormatDefinition | undefined {
  return FORMAT_CATALOG.find((definition) => definition.id === id);
}
