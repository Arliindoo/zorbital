import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, Suspense, useContext, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { queries } from '@/shared/api/client'
import { AssistantWidget } from '@/features/assistant/AssistantWidget'
import { useAssistant } from '@/features/assistant/store'
import { installSpotlight } from '@/shared/fx/spotlight'
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
} from '@/shared/icons/index'
import { locale, t } from '@/shared/lib/i18n'
import { BrandOrbit, Wordmark } from '@/shared/ui/Brand'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'
import { Loading } from '@/shared/ui/Loading'
import { Settings } from '@/shared/ui/Settings'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'

interface NavItem {
  to: string
  label: string
  sub: string
  icon: Icon
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: t('Command center', 'Centro de comando'),
    items: [
      { to: '/', label: t('Overview', 'Visão geral'), sub: t('Investigations and sources', 'Investigações e fontes'), icon: IconOrbit },
      { to: '/estudos', label: t('Studies', 'Estudos'), sub: t('All of them, with search', 'Todos, com busca'), icon: IconLibrary },
    ],
  },
  {
    section: t('Fuel droplets', 'Gotas de combustível'),
    items: [
      { to: '/flex', label: 'FLEX', sub: t('Droplet extinction · ISS', 'Extinção de gotas · ISS'), icon: IconDrop },
      { to: '/cfi', label: 'CFI', sub: t('Cool flames · ISS', 'Chamas frias · ISS'), icon: IconSnowflake },
      { to: '/psi117', label: 'PSI-117', sub: t('Measured × model · ground', 'Medido × modelo · solo'), icon: IconGraph },
    ],
  },
  {
    section: t('Other flames', 'Outras chamas'),
    items: [
      { to: '/bass', label: 'BASS-II', sub: t('Solid materials · ISS', 'Materiais sólidos · ISS'), icon: IconLayers },
      { to: '/psi142', label: 'PSI-142', sub: t('Counterflow · ground', 'Contrafluxo · solo'), icon: IconCounterflow },
    ],
  },
  {
    section: t('Comparisons', 'Comparações'),
    items: [
      { to: '/fichas', label: t('Study sheets side by side', 'Fichas lado a lado'), sub: t('What can be compared', 'O que dá para comparar'), icon: IconClipboard },
      { to: '/comparacao', label: 'PSI-117 × CFI', sub: t('n-dodecane by pressure', 'n-dodecano por pressão'), icon: IconCompare },
    ],
  },
  {
    section: t('Data', 'Dados'),
    items: [
      { to: '/enviar', label: t('Upload study', 'Enviar estudo'), sub: t('Tables and document', 'Tabelas e documento'), icon: IconUpload },
      { to: '/documentos', label: t('Add documents', 'Adicionar documentos'), sub: t('A study’s sheet', 'Ficha de um estudo'), icon: IconDocumentAdd },
      { to: '/explorar', label: t('Explore', 'Explorar'), sub: t('Compare any table', 'Compare qualquer tabela'), icon: IconExplore },
    ],
  },
  { section: t('Tools', 'Ferramentas'), items: [{ to: '/galeria', label: t('Gallery', 'Galeria'), sub: t('Every chart', 'Todos os gráficos'), icon: IconGallery }] },
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
    : date.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
  return (
    <span className="status label" title={t('When the database was built from dados/', 'Quando o banco foi gerado a partir de dados/')}>
      <i /> {t('Database', 'Banco')} · {text}
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
      <aside className="rail" data-open={menuOpen} aria-label={t('Navigation', 'Navegação')}>
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
        <button type="button" className="icon-button topbar__menu" aria-label={t('Open menu', 'Abrir menu')} onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
        <p className="crumbs label" aria-label={t('You are in', 'Você está em')}>
          {/* a visão geral é a página inicial: a seção dela não entra na trilha */}
          {current && current.to !== '/' && <span>{current.section}</span>}
          <span>{current?.label ?? t('Page', 'Página')}</span>
          {child && <span>{child}</span>}
          {simulating && <span>{t('Simulation', 'Simulação')}</span>}
        </p>
        <span className="topbar__spacer" />
        <Status />
        <button
          type="button"
          className="icon-button deck__toggle"
          aria-label={deckOpen ? t('Hide filters', 'Recolher filtros') : t('Show filters', 'Mostrar filtros')}
          aria-pressed={deckOpen}
          title={t('Filters', 'Filtros')}
          onClick={() => setDeckOpen((open) => !open)}
        >
          <IconFilter />
        </button>
        <ThemeToggle />
        <Settings />
        <button type="button" className="ask" onClick={() => setOpen(true)}>
          <IconStars size={16} />
          <span>{t('Ask the agent', 'Perguntar ao agente')}</span>
        </button>
        {/* um feixe cruza a barra a cada troca de página */}
        <i className="topbar__beam" key={pathname} aria-hidden />
      </header>

      <aside ref={setSlot} className="deck" aria-label={t('Filters', 'Filtros')} />
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
