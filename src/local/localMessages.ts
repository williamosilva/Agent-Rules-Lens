import type { SupportedLocale } from '../ui/i18n';

/**
 * Chrome that exists only in the browser panel: the header, the file picker,
 * the empty state and the preview. Everything about a rule — status, reason,
 * counts, warnings — still comes from the shared view model, so no rule wording
 * lives here.
 */
export interface LocalMessages {
  /** Header. `modeLabel` is a short badge, not a sentence. */
  modeLabel: string;
  workspaceLabel: string;
  privacy: string;
  /** File picker */
  pickerTitle: string;
  fileLabel: string;
  filePlaceholder: string;
  suggestionsLabel: string;
  analyze: string;
  refresh: string;
  analyzing: string;
  searching: string;
  noResults: string;
  /** Analysis panel */
  analysisTitle: string;
  emptyTitle: string;
  emptyBody: string;
  /** Plural forms; `many` carries a {count} placeholder. Sent as data so the
   *  page can format it without a dictionary of its own. */
  detectedFiles: { zero: string; one: string; many: string };
  /** Feedback */
  fileNotFound: string;
  analysisFailed: string;
  refreshed: string;
  /** Preview */
  preview: string;
  previewLine: string;
  copyPath: string;
  copied: string;
  close: string;
  previewTooLarge: string;
  previewUnavailable: string;
}

const EN: LocalMessages = {
  modeLabel: 'Local',
  workspaceLabel: 'Workspace',
  privacy: 'Runs locally. Your files stay on this computer.',

  pickerTitle: 'Analyze a file',
  fileLabel: 'File to analyze',
  filePlaceholder: 'Search files by name or path',
  suggestionsLabel: 'Matching files',
  analyze: 'Analyze file',
  refresh: 'Refresh files',
  analyzing: 'Analyzing…',
  searching: 'Searching…',
  noResults: 'No file matches that search.',

  analysisTitle: 'Analysis',
  emptyTitle: 'Choose a code file to see which instructions apply',
  emptyBody: 'Use the search to select a file from the workspace.',
  detectedFiles: {
    zero: 'No instruction files detected in this workspace',
    one: '1 instruction file detected in this workspace',
    many: '{count} instruction files detected in this workspace'
  },

  fileNotFound: 'That file is not in this workspace.',
  analysisFailed: 'The analysis could not be completed.',
  refreshed: 'File list updated.',

  preview: 'Preview',
  previewLine: 'Line',
  copyPath: 'Copy path',
  copied: 'Copied',
  close: 'Close',
  previewTooLarge: 'This file is too large to preview.',
  previewUnavailable: 'This file could not be read.'
};

const PT: LocalMessages = {
  modeLabel: 'Local',
  workspaceLabel: 'Projeto',
  privacy: 'Executado localmente. Seus arquivos permanecem neste computador.',

  pickerTitle: 'Analisar um arquivo',
  fileLabel: 'Arquivo para analisar',
  filePlaceholder: 'Pesquise arquivos por nome ou caminho',
  suggestionsLabel: 'Arquivos encontrados',
  analyze: 'Analisar arquivo',
  refresh: 'Atualizar arquivos',
  analyzing: 'Analisando…',
  searching: 'Pesquisando…',
  noResults: 'Nenhum arquivo corresponde a essa pesquisa.',

  analysisTitle: 'Análise',
  emptyTitle: 'Escolha um arquivo para ver quais instruções se aplicam',
  emptyBody: 'Use a busca para selecionar um arquivo do projeto.',
  detectedFiles: {
    zero: 'Nenhum arquivo de instruções detectado neste projeto',
    one: '1 arquivo de instruções detectado neste projeto',
    many: '{count} arquivos de instruções detectados neste projeto'
  },

  fileNotFound: 'Esse arquivo não está neste projeto.',
  analysisFailed: 'Não foi possível concluir a análise.',
  refreshed: 'Lista de arquivos atualizada.',

  preview: 'Pré-visualização',
  previewLine: 'Linha',
  copyPath: 'Copiar caminho',
  copied: 'Copiado',
  close: 'Fechar',
  previewTooLarge: 'Este arquivo é grande demais para pré-visualizar.',
  previewUnavailable: 'Não foi possível ler este arquivo.'
};

export function localMessagesFor(locale: SupportedLocale): LocalMessages {
  return locale === 'pt-BR' ? PT : EN;
}

/** Picks the plural form for a count. The page applies the same rule. */
export function detectedFilesText(messages: LocalMessages, count: number): string {
  const { detectedFiles } = messages;
  if (count === 0) {
    return detectedFiles.zero;
  }
  if (count === 1) {
    return detectedFiles.one;
  }
  return detectedFiles.many.replace('{count}', String(count));
}
