/**
 * Preferências do navegador (tema, assistente aberto). Sempre em try/catch: em janela privada ou com
 * armazenamento bloqueado o acesso lança erro, e o painel precisa funcionar do mesmo jeito.
 */
function make(area: () => Storage) {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = area().getItem(`zorbital:${key}`)
        return raw === null ? null : (JSON.parse(raw) as T)
      } catch {
        return null
      }
    },
    set(key: string, value: unknown): void {
      try {
        area().setItem(`zorbital:${key}`, JSON.stringify(value))
      } catch {
        // sem armazenamento: a preferência vale só até recarregar
      }
    },
  }
}

export const storage = make(() => window.localStorage)
/** Some ao fechar a aba: conversas do assistente. */
export const session = make(() => window.sessionStorage)
