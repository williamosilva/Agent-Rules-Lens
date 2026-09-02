/**
 * Deliberately rough estimate: one token per four characters. A real tokenizer
 * would add a heavy dependency for a number that is only informative here.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** `950` -> `950`, `1234` -> `1.2k`. */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }
  const thousands = tokens / 1000;
  if (thousands >= 100) {
    return `${Math.round(thousands)}k`;
  }
  return `${thousands.toFixed(1)}k`;
}
