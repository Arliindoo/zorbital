// Gera src/icons/index.tsx a partir do conjunto Solar (Iconify), via CLI `better-icons`.
// Uso: node scripts/icons.mjs   (requer `npm i -g better-icons`)
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const ICONS = {
  Orbit: 'planet-2',
  Drop: 'waterdrop',
  Snowflake: 'snowflake',
  Graph: 'graph-new',
  Layers: 'layers-minimalistic',
  Counterflow: 'sort-vertical',
  Compare: 'transfer-horizontal',
  Explore: 'chart-2',
  Gallery: 'widget-4',
  Menu: 'hamburger-menu',
  Close: 'close-circle',
  ArrowRight: 'arrow-right',
  ArrowRightUp: 'arrow-right-up',
  ArrowUp: 'arrow-up',
  ArrowDown: 'arrow-down',
  ChevronRight: 'alt-arrow-right',
  ChevronDown: 'alt-arrow-down',
  Check: 'check-circle',
  CheckRead: 'check-read',
  Minus: 'minus-circle',
  Download: 'download-minimalistic',
  Upload: 'upload-minimalistic',
  Info: 'info-circle',
  Warning: 'danger-triangle',
  Danger: 'danger-circle',
  Tuning: 'tuning-2',
  Filter: 'filter',
  Search: 'magnifer',
  Scale: 'scale',
  Checklist: 'checklist-minimalistic',
  Command: 'command',
  Flame: 'fire-minimalistic',
  Database: 'database',
  Document: 'document-text',
  Satellite: 'satellite',
  Rocket: 'rocket-2',
  Stars: 'stars-minimalistic',
  Eye: 'eye',
  Link: 'link-minimalistic',
  Pulse: 'pulse-2',
  Atom: 'atom',
  Scan: 'code-scan',
  TestTube: 'test-tube',
  Ruler: 'ruler',
  ListAdd: 'list-arrow-down',
  Pie: 'pie-chart-2',
  Scatter: 'chart-square',
  PanelClose: 'sidebar-minimalistic',
  Sun: 'sun-2',
  Moon: 'moon',
  // simulação
  Play: 'play',
  Pause: 'pause',
  SkipNext: 'skip-next',
  SkipPrevious: 'skip-previous',
  Restart: 'restart',
  Repeat: 'repeat',
  FullScreen: 'full-screen',
  QuitFullScreen: 'quit-full-screen',
  Target: 'target',
  RotateView: 'rotate-clockwise-2',
  ZoomIn: 'magnifer-zoom-in',
  ZoomOut: 'magnifer-zoom-out',
  Routing: 'routing',
  Monitor: 'monitor',
  Question: 'question-circle',
  // estudos, fichas e envio
  Library: 'library',
  Clipboard: 'clipboard-list',
  DocumentAdd: 'document-add',
  Trash: 'trash-bin-minimalistic',
  Add: 'add-circle',
  ArrowLeft: 'arrow-left',
  Verified: 'verified-check',
  Magic: 'magic-stick-3',
}

const camel = (s) => s.replace(/([a-z])-([a-z])/g, (_, a, b) => a + b.toUpperCase())
let out = `/* Gerado por scripts/icons.mjs — ícones Solar (linear), via better-icons. Não edite à mão. */
import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}
export type Icon = (props: IconProps) => React.JSX.Element

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
      {children}
    </svg>
  )
}
`
for (const [name, id] of Object.entries(ICONS)) {
  let svg
  try {
    svg = execFileSync('better-icons', ['get', `solar:${id}-linear`], { encoding: 'utf8' })
  } catch {
    console.error('faltou', id)
    continue
  }
  if (!svg.includes('<svg')) { console.error('faltou', id); continue }
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    // o CLI injeta fill="currentColor" em cada forma, o que preenche ícones que são só traço
    .replace(/<(path|circle|rect|ellipse|line|polyline|polygon) fill="currentColor"/g, '<$1')
    .replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (_, attr) => ` ${camel(attr)}=`)
  out += `\nexport const Icon${name}: Icon = (p) => <Svg {...p}>${inner}</Svg>\n`
}
writeFileSync(new URL('../src/icons/index.tsx', import.meta.url), out)
console.log('ok')
