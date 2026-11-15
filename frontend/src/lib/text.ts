/** Cada frase das cautelas num parágrafo: elas são lidas como uma lista de avisos. */
export function cautions(text: string): string {
  return text.replaceAll('. ', '.\n\n')
}
