import { storage } from '@/shared/lib/storage'

/**
 * Idioma da interface. O padrão é inglês; português é uma preferência guardada no navegador.
 * O idioma é lido uma vez, ao carregar: trocar recarrega a página, e por isso `t()` é uma função
 * comum, que vale também em constantes de módulo, fora de componentes.
 */
export type Lang = 'en' | 'pt'

export const lang: Lang = storage.get<Lang>('lang') === 'pt' ? 'pt' : 'en'

/** Para `Intl` e `toLocaleString`: números e datas seguem o idioma. */
export const locale = lang === 'pt' ? 'pt-BR' : 'en-US'

/** O texto no idioma em uso: `t('Overview', 'Visão geral')`. Serve também para JSX e funções. */
export function t<T>(en: T, pt: T): T {
  return lang === 'pt' ? pt : en
}

export function setLang(next: Lang) {
  if (next === lang) return
  storage.set('lang', next)
  window.location.reload()
}

// index.html nasce em inglês; em português, a língua do documento e o título são trocados aqui
if (typeof document !== 'undefined' && lang === 'pt') {
  document.documentElement.lang = locale
  document.title = 'Zorbital — combustão em microgravidade'
}
