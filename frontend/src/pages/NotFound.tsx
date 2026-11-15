import { Link } from 'react-router'
import { useScreen } from '@/assistant/store'

export default function NotFound() {
  useScreen({ pagina: 'overview', titulo: 'Página não encontrada' })
  return (
    <header className="page-header">
      <h1>Página não encontrada</h1>
      <p>
        Este endereço não existe no painel. <Link to="/">Voltar para a visão geral</Link>.
      </p>
    </header>
  )
}
