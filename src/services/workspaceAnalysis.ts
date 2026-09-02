import type { DetectedArtifact, ParsedRule, RuleWarning } from '../domain/types';
import { collectImportTargets, validateClaudeImports } from './ruleDiagnostics';
import { discoverRuleFiles, workspaceFileExists } from './ruleDiscovery';
import { parseRuleFile } from './ruleParser';
import type { WorkspaceAccess } from './workspaceAccess';

export interface LoadedWorkspace {
  rules: ParsedRule[];
  /** Recognized files whose applicability is deliberately not asserted. */
  artifacts: DetectedArtifact[];
  /** Discovery and import warnings, passed to the resolver as extras. */
  warnings: RuleWarning[];
}

/**
 * Discovery, parsing and import validation for one root. Both the extension
 * and the local CLI call this, so a rule can never resolve differently
 * depending on which one is running.
 */
export async function loadWorkspaceRules(
  access: WorkspaceAccess,
  userPatterns: readonly string[] = []
): Promise<LoadedWorkspace> {
  const discovery = await discoverRuleFiles(access, userPatterns);
  const rules = discovery.files.map(parseRuleFile);
  const importWarnings = await checkImports(access, rules);
  return {
    rules,
    artifacts: discovery.artifacts,
    warnings: [...discovery.warnings, ...importWarnings]
  };
}

async function checkImports(
  access: WorkspaceAccess,
  rules: readonly ParsedRule[]
): Promise<RuleWarning[]> {
  const targets = new Set<string>();
  for (const rule of rules) {
    for (const target of collectImportTargets(rule.relativePath, rule.imports)) {
      targets.add(target);
    }
  }

  const existing = new Set<string>();
  await Promise.all(
    [...targets].map(async (target) => {
      if (await workspaceFileExists(access, target)) {
        existing.add(target);
      }
    })
  );

  return rules.flatMap((rule) =>
    validateClaudeImports(rule, rule.imports, (target) => existing.has(target))
  );
}
