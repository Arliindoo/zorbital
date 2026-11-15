import { isRouteErrorResponse, useRouteError } from 'react-router'

/** Último recurso: um erro fora das páginas (no layout ou no roteador). */
export function RootError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error)
  return (
    <main className="stage">
      <h1>Algo deu errado</h1>
      <p className="callout callout--error">{message}</p>
      <p>
        <a href="/">Recarregar o painel</a>
      </p>
    </main>
  )
}
