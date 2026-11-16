import { useEffect, useRef, useState } from 'react'
import { IconSettings } from '@/shared/icons/index'
import { type Lang, lang, setLang, t } from '@/shared/lib/i18n'

const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pt', name: 'Português' },
]

/** Engrenagem na barra superior: abre um painel pequeno com as preferências (por ora, o idioma). */
export function Settings() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const title = t('Settings', 'Configurações')
  return (
    <div className="settings" ref={root}>
      <button
        type="button"
        className="icon-button settings__toggle"
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={title}
        onClick={() => setOpen((now) => !now)}
      >
        <IconSettings />
      </button>
      {open && (
        <div className="settings__panel" role="dialog" aria-label={title}>
          <p className="label">{t('Language', 'Idioma')}</p>
          <div className="settings__langs" role="radiogroup" aria-label={t('Language', 'Idioma')}>
            {LANGS.map(({ id, name }) => (
              <button key={id} type="button" role="radio" aria-checked={id === lang} lang={id} onClick={() => setLang(id)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
