import type { RuleStatus, RuleWarningCode } from '../domain/types';

/**
 * Every user facing string, in one typed place. No module outside this file
 * chooses wording, and the webview only renders what it is handed.
 */
export type SupportedLocale = 'pt-BR' | 'en';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['pt-BR', 'en'];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * A stored preference always wins. Otherwise the editor language decides:
 * anything starting with `pt` gets Portuguese, everything else English.
 */
export function resolveLocale(editorLanguage: string | undefined, saved?: unknown): SupportedLocale {
  if (isSupportedLocale(saved)) {
    return saved;
  }
  if (typeof editorLanguage === 'string' && editorLanguage.toLowerCase().startsWith('pt')) {
    return 'pt-BR';
  }
  return DEFAULT_LOCALE;
}

export interface Messages {
  localeName: string;
  header: {
    /** `8 matching files · 4 formats` */
    summary: (files: number, formats: number) => string;
    /** `~277 tokens · configuration analysis only` */
    tokens: (tokens: string) => string;
    pathTooltip: (path: string) => string;
    languageSwitch: string;
    languageOption: (locale: SupportedLocale) => string;
  };
  sections: {
    agents: string;
    claude: string;
    cursor: string;
    copilot: string;
    warnings: string;
    notApplicable: string;
    otherConfigurations: string;
    possibleCustom: string;
    allDetected: string;
    empty: string;
  };
  counts: {
    matches: (n: number) => string;
    optional: (n: number) => string;
    unknown: (n: number) => string;
    invalid: (n: number) => string;
    plain: (n: number) => string;
  };
  status: Record<RuleStatus, string>;
  reason: {
    workspaceDefault: string;
    scopedTo: (directory: string) => string;
    directoryOverride: string;
    mostSpecific: string;
    alwaysApplies: string;
    projectWide: string;
    matches: (patterns: string) => string;
    patternDoesNotMatch: string;
    replacedByOverride: string;
    cannotDetermine: (detail: string) => string;
    malformedFrontmatter: string;
    missingFrontmatter: string;
    missingApplyTo: string;
    invalidMetadata: (fields: string) => string;
  };
  artifacts: {
    detected: (tools: string) => string;
    candidate: string;
    userDeclared: string;
  };
  warnings: {
    title: Record<RuleWarningCode, string>;
    /** `Unsupported Cursor metadata: title` */
    unsupportedMetadata: (tool: string, field: string) => string;
    invalidMetadata: (tool: string, field: string) => string;
    summary: Record<RuleWarningCode, string>;
    importNotFound: (target: string) => string;
    lineCount: (lines: number) => string;
  };
  empty: {
    noWorkspaceTitle: string;
    noWorkspaceBody: string;
    noRulesTitle: string;
    noRulesBody: string;
    noFileTitle: string;
    noFileBody: string;
    outsideTitle: string;
    outsideBody: string;
  };
  tooltip: {
    path: string;
    format: string;
    status: string;
    why: string;
    scope: string;
    tokens: string;
    tokensNotCounted: string;
    description: string;
    excludeAgent: string;
    warningCount: string;
    fullPath: string;
    recognizedBy: string;
    recognizedByNone: string;
    legacyName: string;
    fromSetting: string;
    supportDetected: string;
    supportCandidate: string;
    notCounted: string;
    warningIn: string;
    warningCode: string;
  };
  statusBar: {
    /** `Agent Rules: 8 files · 4 formats · 1 warning` */
    text: (files: number, formats: number, warnings: number) => string;
    none: string;
    tooltipTitle: string;
    optional: string;
    cannotDetermine: string;
    invalid: string;
    warnings: string;
    perFormatNote: (tokens: string) => string;
    disclaimer: string;
    noneApply: string;
  };
  notices: {
    multiRoot: string;
    unexpectedProblem: string;
    noRuleFiles: string;
    pickRule: string;
  };
}

const EN: Messages = {
  localeName: 'English',
  header: {
    summary: (files, formats) =>
      files === 0
        ? 'No matching files'
        : `${files} matching ${files === 1 ? 'file' : 'files'} · ${formats} ${
            formats === 1 ? 'format' : 'formats'
          }`,
    tokens: (tokens) => `${tokens} tokens · configuration analysis only`,
    pathTooltip: (path) => `${path}\nRules are resolved for this file.`,
    languageSwitch: 'Change language',
    languageOption: (locale) => (locale === 'pt-BR' ? 'Switch to Portuguese' : 'Switch to English')
  },
  sections: {
    agents: 'Shared / AGENTS.md',
    claude: 'Claude',
    cursor: 'Cursor',
    copilot: 'GitHub Copilot',
    warnings: 'Warnings',
    notApplicable: 'Not applicable to this file',
    otherConfigurations: 'Other agent configurations',
    possibleCustom: 'Possible custom instructions',
    allDetected: 'All detected rule files',
    empty: 'Nothing from this format applies to this file.'
  },
  counts: {
    matches: (n) => `${n} ${n === 1 ? 'match' : 'matches'}`,
    optional: (n) => `${n} optional`,
    unknown: (n) => `${n} unknown`,
    invalid: (n) => `${n} invalid`,
    plain: (n) => String(n)
  },
  status: {
    matching: 'Automatic',
    agentDecided: 'Agent decides',
    manual: 'Manual only',
    notApplicable: 'Not applicable',
    unknown: 'Cannot determine',
    invalid: 'Invalid configuration'
  },
  reason: {
    workspaceDefault: 'Workspace default',
    scopedTo: (directory) => `Scoped to ${directory}/`,
    directoryOverride: 'Directory override',
    mostSpecific: 'Most specific',
    alwaysApplies: 'Always applies',
    projectWide: 'Project-wide',
    matches: (patterns) => `Matches ${patterns}`,
    patternDoesNotMatch: 'Pattern does not match this file',
    replacedByOverride: 'Replaced by directory override',
    cannotDetermine: (detail) => detail,
    malformedFrontmatter: 'Malformed YAML frontmatter',
    missingFrontmatter: 'Missing frontmatter block',
    missingApplyTo: 'Missing applyTo',
    invalidMetadata: (fields) => `Invalid ${fields} metadata`
  },
  artifacts: {
    detected: (tools) =>
      tools.length > 0 ? `${tools} · Applicability not analyzed` : 'Applicability not analyzed',
    candidate: 'Custom candidate · loading not verified',
    userDeclared: 'User-declared · loading not verified'
  },
  warnings: {
    title: {
      'invalid-frontmatter': 'Invalid YAML frontmatter',
      'missing-frontmatter': 'Cursor rule without frontmatter',
      'missing-apply-to': 'Copilot instructions without applyTo',
      'invalid-pattern-field': 'Invalid glob field',
      'invalid-metadata-type': 'Invalid metadata value',
      'unsupported-metadata': 'Unsupported metadata',
      'invalid-glob': 'Unusable glob pattern',
      'missing-import': 'Missing Claude import',
      'long-rule-file': 'Long rule file',
      'unreadable-file': 'Unreadable rule file'
    },
    unsupportedMetadata: (tool, field) => `Unsupported ${tool} metadata: ${field}`,
    invalidMetadata: (tool, field) => `Invalid ${tool} metadata: ${field}`,
    summary: {
      'invalid-frontmatter': 'YAML could not be parsed',
      'missing-frontmatter': 'No frontmatter block',
      'missing-apply-to': 'applyTo is missing',
      'invalid-pattern-field': 'Applicability cannot be determined',
      'invalid-metadata-type': 'Value ignored',
      'unsupported-metadata': 'Ignored for matching',
      'invalid-glob': 'Pattern skipped',
      'missing-import': 'Import not found',
      'long-rule-file': 'Long file',
      'unreadable-file': 'Could not be read'
    },
    importNotFound: (target) => `${target} not found`,
    lineCount: (lines) => `${lines} lines`
  },
  empty: {
    noWorkspaceTitle: 'Open a folder to analyze agent instructions',
    noWorkspaceBody: 'Agent Rules Lens reads instruction files from the workspace you have open.',
    noRulesTitle: 'No instruction files found',
    noRulesBody:
      'Add an AGENTS.md, CLAUDE.md, .cursor/rules or .github/instructions file and it will show up here.',
    noFileTitle: 'Open a code file to analyze its instructions',
    noFileBody: 'Agent Rules Lens will show which instructions apply and why.',
    outsideTitle: 'Outside the workspace',
    outsideBody: 'Its scope cannot be resolved, so no instructions are matched against it.'
  },
  tooltip: {
    path: 'Path',
    format: 'Format',
    status: 'Status',
    why: 'Why',
    scope: 'Scope',
    tokens: 'tokens (rough estimate)',
    tokensNotCounted: 'tokens, not counted (only matching rules are)',
    description: 'Description',
    excludeAgent: 'excludeAgent',
    warningCount: 'Warnings',
    fullPath: 'Full path',
    recognizedBy: 'Recognized by',
    recognizedByNone: 'Recognized by: no specific tool',
    legacyName: 'Legacy file name, kept for backwards compatibility.',
    fromSetting: 'Added through agentRulesLens.customInstructionPatterns.',
    supportDetected:
      'Support level: detected. This extension knows the tool, not whether the file applies.',
    supportCandidate:
      'Support level: candidate. The name suggests instructions; no tool is attributed and applicability is not evaluated.',
    notCounted: 'Not counted in the matching files or the token estimate.',
    warningIn: 'In',
    warningCode: 'Code'
  },
  statusBar: {
    text: (files, formats, warnings) => {
      const head = `${files} ${files === 1 ? 'file' : 'files'} · ${formats} ${
        formats === 1 ? 'format' : 'formats'
      }`;
      const tail = warnings > 0 ? ` · ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : '';
      return `Agent Rules: ${head}${tail}`;
    },
    none: 'Agent Rules: no matching files',
    tooltipTitle: 'Agent Rules Lens',
    optional: 'Optional',
    cannotDetermine: 'Cannot determine',
    invalid: 'Invalid',
    warnings: 'Warnings',
    perFormatNote: (tokens) =>
      `Each format is read by its own agent, so the ${tokens} tokens across all formats are not all sent to a single one. Token counts are rough estimates.`,
    disclaimer: 'Configuration analysis only, not the live agent context.',
    noneApply: 'No instruction files match this file'
  },
  notices: {
    multiRoot: 'Multi-folder workspace: only the first folder is analyzed.',
    unexpectedProblem:
      'Agent Rules Lens hit an unexpected problem. See the "Agent Rules Lens" output channel.',
    noRuleFiles: 'No instruction files found.',
    pickRule: 'Select a rule file to open'
  }
};

const PT: Messages = {
  localeName: 'Português',
  header: {
    summary: (files, formats) =>
      files === 0
        ? 'Nenhum arquivo aplicável'
        : `${files} ${files === 1 ? 'arquivo aplicável' : 'arquivos aplicáveis'} · ${formats} ${
            formats === 1 ? 'formato' : 'formatos'
          }`,
    tokens: (tokens) => `${tokens} tokens · somente análise de configuração`,
    pathTooltip: (path) => `${path}\nAs regras são resolvidas para este arquivo.`,
    languageSwitch: 'Alterar idioma',
    languageOption: (locale) =>
      locale === 'pt-BR' ? 'Mudar para português' : 'Mudar para inglês'
  },
  sections: {
    agents: 'Compartilhado / AGENTS.md',
    claude: 'Claude',
    cursor: 'Cursor',
    copilot: 'GitHub Copilot',
    warnings: 'Avisos',
    notApplicable: 'Não se aplica a este arquivo',
    otherConfigurations: 'Outras configurações de agentes',
    possibleCustom: 'Possíveis instruções personalizadas',
    allDetected: 'Todos os arquivos de regras detectados',
    empty: 'Nada deste formato se aplica a este arquivo.'
  },
  counts: {
    matches: (n) => `${n} ${n === 1 ? 'aplicável' : 'aplicáveis'}`,
    optional: (n) => `${n} ${n === 1 ? 'opcional' : 'opcionais'}`,
    unknown: (n) => `${n} ${n === 1 ? 'indeterminado' : 'indeterminados'}`,
    invalid: (n) => `${n} ${n === 1 ? 'inválido' : 'inválidos'}`,
    plain: (n) => String(n)
  },
  status: {
    matching: 'Aplicação automática',
    agentDecided: 'O agente decide',
    manual: 'Somente manual',
    notApplicable: 'Não se aplica',
    unknown: 'Não foi possível determinar',
    invalid: 'Configuração inválida'
  },
  reason: {
    workspaceDefault: 'Padrão do projeto',
    scopedTo: (directory) => `Restrito a ${directory}/`,
    directoryOverride: 'Regra do diretório',
    mostSpecific: 'Mais específico',
    alwaysApplies: 'Sempre se aplica',
    projectWide: 'Todo o projeto',
    matches: (patterns) => `Corresponde a ${patterns}`,
    patternDoesNotMatch: 'O padrão não corresponde a este arquivo',
    replacedByOverride: 'Substituído pela regra do diretório',
    cannotDetermine: (detail) => detail,
    malformedFrontmatter: 'Frontmatter YAML malformado',
    missingFrontmatter: 'Bloco de frontmatter ausente',
    missingApplyTo: 'applyTo ausente',
    invalidMetadata: (fields) => `Metadados ${fields} inválidos`
  },
  artifacts: {
    detected: (tools) =>
      tools.length > 0
        ? `${tools} · Aplicabilidade não analisada`
        : 'Aplicabilidade não analisada',
    candidate: 'Possível instrução · carregamento não verificado',
    userDeclared: 'Declarado pelo usuário · carregamento não verificado'
  },
  warnings: {
    title: {
      'invalid-frontmatter': 'Frontmatter YAML inválido',
      'missing-frontmatter': 'Regra do Cursor sem frontmatter',
      'missing-apply-to': 'Instruções do Copilot sem applyTo',
      'invalid-pattern-field': 'Campo de glob inválido',
      'invalid-metadata-type': 'Valor de metadado inválido',
      'unsupported-metadata': 'Metadado não suportado',
      'invalid-glob': 'Padrão de glob inutilizável',
      'missing-import': 'Importação do Claude ausente',
      'long-rule-file': 'Arquivo de regras extenso',
      'unreadable-file': 'Arquivo de regras ilegível'
    },
    unsupportedMetadata: (tool, field) => `Metadado do ${tool} não suportado: ${field}`,
    invalidMetadata: (tool, field) => `Metadado do ${tool} inválido: ${field}`,
    summary: {
      'invalid-frontmatter': 'Não foi possível interpretar o YAML',
      'missing-frontmatter': 'Sem bloco de frontmatter',
      'missing-apply-to': 'applyTo ausente',
      'invalid-pattern-field': 'Não é possível determinar a aplicabilidade',
      'invalid-metadata-type': 'Valor ignorado',
      'unsupported-metadata': 'Ignorado na correspondência',
      'invalid-glob': 'Padrão ignorado',
      'missing-import': 'Importação não encontrada',
      'long-rule-file': 'Arquivo extenso',
      'unreadable-file': 'Não foi possível ler'
    },
    importNotFound: (target) => `${target} não encontrado`,
    lineCount: (lines) => `${lines} linhas`
  },
  empty: {
    noWorkspaceTitle: 'Abra uma pasta para analisar as instruções dos agentes',
    noWorkspaceBody: 'O Agent Rules Lens lê os arquivos de instruções do projeto aberto.',
    noRulesTitle: 'Nenhum arquivo de instruções encontrado',
    noRulesBody:
      'Adicione um AGENTS.md, CLAUDE.md, .cursor/rules ou .github/instructions e ele aparecerá aqui.',
    noFileTitle: 'Abra um arquivo de código para analisar suas instruções',
    noFileBody: 'O Agent Rules Lens mostrará quais instruções se aplicam e por quê.',
    outsideTitle: 'Fora do projeto aberto',
    outsideBody: 'O escopo não pode ser resolvido, então nenhuma instrução é comparada com ele.'
  },
  tooltip: {
    path: 'Caminho',
    format: 'Formato',
    status: 'Status',
    why: 'Motivo',
    scope: 'Escopo',
    tokens: 'tokens (estimativa aproximada)',
    tokensNotCounted: 'tokens, não contabilizados (somente os aplicáveis contam)',
    description: 'Descrição',
    excludeAgent: 'excludeAgent',
    warningCount: 'Avisos',
    fullPath: 'Caminho completo',
    recognizedBy: 'Reconhecido por',
    recognizedByNone: 'Reconhecido por: nenhuma ferramenta específica',
    legacyName: 'Nome de arquivo legado, mantido por compatibilidade.',
    fromSetting: 'Adicionado via agentRulesLens.customInstructionPatterns.',
    supportDetected:
      'Nível de suporte: detectado. A extensão conhece a ferramenta, mas não avalia se o arquivo se aplica.',
    supportCandidate:
      'Nível de suporte: candidato. O nome sugere instruções; nenhuma ferramenta é atribuída e a aplicabilidade não é avaliada.',
    notCounted: 'Não contabilizado nos arquivos aplicáveis nem na estimativa de tokens.',
    warningIn: 'Em',
    warningCode: 'Código'
  },
  statusBar: {
    text: (files, formats, warnings) => {
      const head = `${files} ${files === 1 ? 'arquivo' : 'arquivos'} · ${formats} ${
        formats === 1 ? 'formato' : 'formatos'
      }`;
      const tail = warnings > 0 ? ` · ${warnings} ${warnings === 1 ? 'aviso' : 'avisos'}` : '';
      return `Agent Rules: ${head}${tail}`;
    },
    none: 'Agent Rules: nenhum arquivo aplicável',
    tooltipTitle: 'Agent Rules Lens',
    optional: 'Opcionais',
    cannotDetermine: 'Indeterminados',
    invalid: 'Inválidos',
    warnings: 'Avisos',
    perFormatNote: (tokens) =>
      `Cada formato é lido por seu próprio agente, então os ${tokens} tokens somados não vão todos para um único agente. As contagens são estimativas aproximadas.`,
    disclaimer: 'Somente análise de configuração, não é o contexto real do agente.',
    noneApply: 'Nenhum arquivo de instruções se aplica a este arquivo'
  },
  notices: {
    multiRoot: 'Projeto com várias pastas: somente a primeira é analisada.',
    unexpectedProblem:
      'O Agent Rules Lens encontrou um problema inesperado. Veja o canal de saída "Agent Rules Lens".',
    noRuleFiles: 'Nenhum arquivo de instruções encontrado.',
    pickRule: 'Selecione um arquivo de regras para abrir'
  }
};

const DICTIONARIES: Record<SupportedLocale, Messages> = { en: EN, 'pt-BR': PT };

export function messagesFor(locale: SupportedLocale): Messages {
  return DICTIONARIES[locale] ?? EN;
}

export { DICTIONARIES };
