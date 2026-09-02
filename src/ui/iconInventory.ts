/**
 * Which file backs each icon id, per theme. The files live in
 * media/icons/agents and are shipped inside the VSIX; sources.json in the
 * same folder records where every third party mark came from.
 *
 * Kept as data rather than a directory scan so a missing file is a test
 * failure instead of a blank icon at runtime.
 */
export interface IconFiles {
  light: string;
  dark: string;
}

/** Folder holding the marks, relative to the extension root. */
export const ICON_DIRECTORY: readonly string[] = ['media', 'icons', 'agents'];

/** Used when an id has no file of its own. */
export const FALLBACK_ICON_ID = 'generic-agent';

export const ICON_FILES: Readonly<Record<string, IconFiles>> = {
  'amazon-q': { light: 'amazon-q.svg', dark: 'amazon-q.svg' },
  'augment': { light: 'augment-light.svg', dark: 'augment-dark.svg' },
  'claude': { light: 'claude.svg', dark: 'claude.svg' },
  'cline': { light: 'cline-light.svg', dark: 'cline-dark.svg' },
  'codebuddy': { light: 'codebuddy.svg', dark: 'codebuddy.svg' },
  'continue': { light: 'continue-light.svg', dark: 'continue-dark.svg' },
  'cursor': { light: 'cursor-light.svg', dark: 'cursor-dark.svg' },
  'custom-rules': { light: 'custom-rules-light.svg', dark: 'custom-rules-dark.svg' },
  'gemini': { light: 'gemini.svg', dark: 'gemini.svg' },
  'generic-agent': { light: 'generic-agent-light.svg', dark: 'generic-agent-dark.svg' },
  'github-copilot': { light: 'github-copilot-light.svg', dark: 'github-copilot-dark.svg' },
  'junie': { light: 'junie.svg', dark: 'junie.svg' },
  'kiro': { light: 'kiro.svg', dark: 'kiro.svg' },
  'opencode': { light: 'opencode-light.svg', dark: 'opencode-dark.svg' },
  'qoder': { light: 'qoder.svg', dark: 'qoder.svg' },
  'qwen': { light: 'qwen.svg', dark: 'qwen.svg' },
  'replit': { light: 'replit.svg', dark: 'replit.svg' },
  'roo-code': { light: 'roo-code-light.svg', dark: 'roo-code-dark.svg' },
  'shared-rules': { light: 'shared-rules-light.svg', dark: 'shared-rules-dark.svg' },
  'trae': { light: 'trae.svg', dark: 'trae.svg' },
  'windsurf': { light: 'windsurf.svg', dark: 'windsurf.svg' },
  'zed': { light: 'zed-light.svg', dark: 'zed-dark.svg' }
};

/** Never throws: an unknown id falls back to the neutral agent mark. */
export function iconFilesFor(iconId: string): IconFiles {
  return ICON_FILES[iconId] ?? (ICON_FILES[FALLBACK_ICON_ID] as IconFiles);
}

/** Every file that has to be present, deduplicated. */
export function allIconFileNames(): string[] {
  return [...new Set(Object.values(ICON_FILES).flatMap((files) => [files.light, files.dark]))].sort();
}
