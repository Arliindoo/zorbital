import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, Suspense, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { queries } from '@/api/client'
import { AssistantWidget } from '@/assistant/AssistantWidget'
import { useAssistant } from '@/assistant/store'
import { installSpotlight } from '@/fx/spotlight'
import {
  type Icon,
  IconClipboard,
  IconCompare,
  IconCounterflow,
  IconDocumentAdd,
  IconDrop,
  IconExplore,
  IconGallery,
  IconGraph,
  IconLayers,
  IconLibrary,
  IconMenu,
  IconOrbit,
  IconSnowflake,
  IconStars,
  IconFilter,
  IconUpload,
} from '@/icons'
import { BrandOrbit, Wordmark } from './Brand'
import { ErrorBoundary } from './ErrorBoundary'
import { Loading } from './Loading'
import { ThemeToggle } from './ThemeToggle'

interface NavItem {
  to: string
  label: string
  sub: string
  icon: Icon
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Centro de comando',
    items: [
      { to: '/', label: 'Visão geral', sub: 'Investigações e fontes', icon: IconOrbit },
      { to: '/estudos', label: 'Estudos', sub: 'Todos, com busca', icon: IconLibrary },
    ],
  },
  {
    section: 'Gotas de combustível',
    items: [
      { to: '/flex', label: 'FLEX', sub: 'Extinção de gotas · ISS', icon: IconDrop },
      { to: '/cfi', label: 'CFI', sub: 'Chamas frias · ISS', icon: IconSnowflake },
      { to: '/psi117', label: 'PSI-117', sub: 'Medido × modelo · solo', icon: IconGraph },
    ],
  },
  {
    section: 'Outras chamas',
    items: [
      { to: '/bass', label: 'BASS-II', sub: 'Materiais sólidos · ISS', icon: IconLayers },
      { to: '/psi142', label: 'PSI-142', sub: 'Contrafluxo · solo', icon: IconCounterflow },
    ],
  },
  {
    section: 'Comparações',
    items: [
      { to: '/fichas', label: 'Fichas lado a lado', sub: 'O que dá para comparar', icon: IconClipboard },
      { to: '/comparacao', label: 'PSI-117 × CFI', sub: 'n-dodecano por pressão', icon: IconCompare },
    ],
  },
  {
    section: 'Dados',
    items: [
      { to: '/enviar', label: 'Enviar estudo', sub: 'Tabelas e documento', icon: IconUpload },
      { to: '/documentos', label: 'Adicionar documentos', sub: 'Ficha de um estudo', icon: IconDocumentAdd },
      { to: '/explorar', label: 'Explorar', sub: 'Compare qualquer tabela', icon: IconExplore },
    ],
  },
  { section: 'Ferramentas', items: [{ to: '/galeria', label: 'Galeria', sub: 'Todos os gráficos', icon: IconGallery }] },
]
const FLAT = NAV.flatMap(({ section, items }) => items.map((item) => ({ ...item, section })))
/** A página atual na trilha; um estudo enviado (/estudos/PSI-26) fica sob Estudos. */
const locate = (pathname: string) => FLAT.find((item) => item.to === pathname) ?? FLAT.find((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))

// As páginas mandam os filtros para o painel lateral por portal.
const DeckSlot = createContext<HTMLElement | null>(null)

export function SidebarFilters({ title, children }: { title: string; children: ReactNode }) {
  const target = useContext(DeckSlot)
  if (!target) return null
  return createPortal(
    <div className="filters">
      <h2 className="filters__title label">
        <IconFilter size={15} /> {title}
      </h2>
      {children}
    </div>,
    target,
  )
}

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop__grid" />
      <svg className="backdrop__orbits" viewBox="0 0 1100 1100" fill="none">
        <g stroke="rgb(var(--fg-rgb) / 0.09)">
          <ellipse cx="550" cy="550" rx="520" ry="210" transform="rotate(-24 550 550)" />
          <ellipse cx="550" cy="550" rx="400" ry="150" transform="rotate(-24 550 550)" strokeDasharray="2 7" />
          <circle cx="1025" cy="338" r="3" fill="var(--signal)" stroke="none" />
        </g>
        <g stroke="rgb(var(--fg-rgb) / 0.07)">
          <ellipse cx="550" cy="550" rx="300" ry="460" transform="rotate(32 550 550)" strokeDasharray="1 5" />
          <circle cx="306" cy="160" r="2.5" fill="var(--magenta)" stroke="none" />
        </g>
      </svg>
    </div>
  )
}

function Status() {
  const overview = useQuery(queries.overview())
  const stamp = overview.data?.meta.gerado_em
  if (!stamp) return null
  const date = new Date(stamp)
  const text = Number.isNaN(date.getTime())
    ? stamp.replace('T', ' ')
    : date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
  return (
    <span className="status label" title="Quando o banco foi gerado a partir de dados/">
      <i /> Banco · {text}
    </span>
  )
}

export function Layout() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deckOpen, setDeckOpen] = useState(() => window.innerWidth > 1180)
  const { pathname, search } = useLocation()
  const simulating = new URLSearchParams(search).get('vista') === 'simulacao'
  const { setOpen } = useAssistant()
  const current = locate(pathname)
  const child = current && current.to !== pathname ? decodeURIComponent(pathname.slice(current.to.length + 1)) : null

  // troca de página volta ao topo
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  useEffect(installSpotlight, [])

  return (
    <div className="app" data-deck={deckOpen ? 'open' : 'closed'} data-menu={menuOpen}>
      <Backdrop />
      <aside className="rail" data-open={menuOpen} aria-label="Navegação">
        <Link to="/" className="brand" aria-label="Zorbital" onClick={() => setMenuOpen(false)}>
          <BrandOrbit className="brand__orbit" />
          <Wordmark className="brand__name" />
        </Link>
        <nav>
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <p className="rail__section label">
                <span>{section}</span>
              </p>
              {items.map(({ to, label, sub, icon: IconFor }) => (
                <NavLink key={to} to={to} end={to === '/'} className="rail__link" title={label} onClick={() => setMenuOpen(false)}>
                  <IconFor size={20} />
                  <span className="rail__text">
                    <b>{label}</b>
                    <small>{sub}</small>
                  </span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <button type="button" className="icon-button topbar__menu" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
        <p className="crumbs label" aria-label="Você está em">
          {/* a visão geral é a página inicial: a seção dela não entra na trilha */}
          {current && current.to !== '/' && <span>{current.section}</span>}
          <span>{current?.label ?? 'Página'}</span>
          {child && <span>{child}</span>}
          {simulating && <span>Simulação</span>}
        </p>
        <span className="topbar__spacer" />
        <Status />
        <button
          type="button"
          className="icon-button deck__toggle"
          aria-label={deckOpen ? 'Recolher filtros' : 'Mostrar filtros'}
          aria-pressed={deckOpen}
          title="Filtros"
          onClick={() => setDeckOpen((open) => !open)}
        >
          <IconFilter />
        </button>
        <ThemeToggle />
        <button type="button" className="ask" onClick={() => setOpen(true)}>
          <IconStars size={16} />
          <span>Perguntar ao agente</span>
        </button>
        {/* um feixe cruza a barra a cada troca de página */}
        <i className="topbar__beam" key={pathname} aria-hidden />
      </header>

      <aside ref={setSlot} className="deck" aria-label="Filtros" />
      <div
        className="scrim"
        aria-hidden
        onClick={() => {
          setMenuOpen(false)
          if (window.innerWidth <= 760) setDeckOpen(false)
        }}
      />

      <DeckSlot value={slot}>
        <main className="stage" data-agent-stage>
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<Loading />}>
              <div className="route" key={pathname}>
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </DeckSlot>
      <AssistantWidget />
    </div>
  )
}
