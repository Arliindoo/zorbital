import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AssistantProvider } from '@/features/assistant/context'
import { Intro } from '@/app/Intro'
import { Layout } from '@/app/Layout'
import { RootError } from '@/app/RootError'

// Cada página é um pedaço separado do bundle: só baixa ao abrir.
const Overview = lazy(() => import('@/pages/Overview'))
const Flex = lazy(() => import('@/pages/Flex'))
const Cfi = lazy(() => import('@/pages/Cfi'))
const Psi117 = lazy(() => import('@/pages/Psi117'))
const Bass = lazy(() => import('@/pages/Bass'))
const Psi142 = lazy(() => import('@/pages/Psi142'))
const Comparacao = lazy(() => import('@/pages/Comparacao'))
const Estudos = lazy(() => import('@/pages/Estudos'))
const Estudo = lazy(() => import('@/pages/Estudo'))
const Fichas = lazy(() => import('@/pages/Fichas'))
const Enviar = lazy(() => import('@/pages/Enviar'))
const Documentos = lazy(() => import('@/pages/Documentos'))
const Explore = lazy(() => import('@/pages/Explore'))
const Galeria = lazy(() => import('@/pages/Galeria'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RootError />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'flex', element: <Flex /> },
      { path: 'cfi', element: <Cfi /> },
      { path: 'psi117', element: <Psi117 /> },
      { path: 'bass', element: <Bass /> },
      { path: 'psi142', element: <Psi142 /> },
      { path: 'comparacao', element: <Comparacao /> },
      { path: 'estudos', element: <Estudos /> },
      { path: 'estudos/:id', element: <Estudo /> },
      { path: 'fichas', element: <Fichas /> },
      { path: 'enviar', element: <Enviar /> },
      { path: 'documentos', element: <Documentos /> },
      { path: 'explorar', element: <Explore /> },
      { path: 'galeria', element: <Galeria /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

const queryClient = new QueryClient({
  defaultOptions: {
    // o banco só muda quando um envio é aprovado, e a aprovação invalida tudo: o que já veio não fica velho
    queries: { staleTime: Infinity, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantProvider>
        <RouterProvider router={router} />
        <Intro />
      </AssistantProvider>
    </QueryClientProvider>
  )
}
