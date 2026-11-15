import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Callout } from './ui'

interface Props {
  children: ReactNode
  onReset?: () => void
}

interface State {
  error: Error | null
}

class Boundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <Callout tone="error">
        <p>
          <strong>{t('Could not load this page.', 'Não foi possível carregar esta página.')}</strong> {error.message}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            this.props.onReset?.()
            this.setState({ error: null })
          }}
        >
          {t('Try again', 'Tentar de novo')}
        </button>
      </Callout>
    )
  }
}

/**
 * Erro de uma página (inclusive de consulta à API) fica na página; o menu continua funcionando.
 * Use `key` com a rota para esquecer o erro ao trocar de página.
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Boundary onReset={reset}>
          {children}
        </Boundary>
      )}
    </QueryErrorResetBoundary>
  )
}
