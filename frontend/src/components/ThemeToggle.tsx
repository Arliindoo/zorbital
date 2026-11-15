import { IconMoon, IconSun } from '@/icons'
import { t } from '@/lib/i18n'
import { setTheme, useTheme } from '@/lib/theme'

/** Um clique troca entre escuro e claro; o ícone mostra o tema em uso e gira ao trocar. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'light' ? t('Switch to the light theme', 'Mudar para o tema claro') : t('Switch to the dark theme', 'Mudar para o tema escuro')
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      data-theme-now={theme}
      aria-label={label}
      title={label}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        setTheme(next, { x: box.left + box.width / 2, y: box.top + box.height / 2 })
      }}
    >
      <IconMoon className="theme-toggle__moon" />
      <IconSun className="theme-toggle__sun" />
    </button>
  )
}
