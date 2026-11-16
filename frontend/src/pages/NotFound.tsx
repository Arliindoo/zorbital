import { Link } from 'react-router'
import { useScreen } from '@/features/assistant/store'
import { t } from '@/shared/lib/i18n'

export default function NotFound() {
  useScreen({ pagina: 'overview', titulo: t('Page not found', 'Página não encontrada') })
  return (
    <header className="page-header">
      <h1>{t('Page not found', 'Página não encontrada')}</h1>
      <p>
        {t('This address does not exist in the dashboard.', 'Este endereço não existe no painel.')} <Link to="/">{t('Back to the overview', 'Voltar para a visão geral')}</Link>.
      </p>
    </header>
  )
}
