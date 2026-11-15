/** As duas vistas de um estudo — o painel de dados e a simulação do experimento — e a troca entre elas. */

import { type ReactNode, Suspense, useEffect, useRef } from 'react'
import { reducedMotion } from '@/fx/useInView'
import { IconMonitor, IconOrbit } from '@/icons'
import type { StudyView } from '@/lib/useStudyView'
import { Loading } from './Loading'

const VIEWS = [
  { id: 'painel', label: 'Painel', icon: IconMonitor },
  { id: 'simulacao', label: 'Simulação', icon: IconOrbit },
] as const

export function ViewSwitch({ view, onChange }: { view: StudyView; onChange: (view: StudyView) => void }) {
  return (
    <div className="views" role="tablist" aria-label="Vista do estudo">
      {VIEWS.map(({ id, label, icon: IconFor }) => (
        <button key={id} type="button" role="tab" aria-selected={view === id} className={`views__tab views__tab--${id}`} onClick={() => onChange(id)}>
          <IconFor size={18} />
          <b>{label}</b>
        </button>
      ))}
    </div>
  )
}

/** Moldura da simulação: carrega a cena sob demanda e a traz para o centro da tela. */
export function SimFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // depois dos efeitos da página: ao chegar por link, o layout ainda vai rolar para o topo
    const id = window.setTimeout(() => ref.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }), 60)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div ref={ref} className="sim-frame">
      <Suspense fallback={<Loading label="Montando a cena…" />}>{children}</Suspense>
      <p className="caption sim-frame__note">
        A cena é uma reconstrução a partir dos valores da fonte e uma maquete esquemática do ambiente — não é vídeo do experimento. O botão <strong>ⓘ</strong> na cena diz, ensaio a ensaio, o que é dado e o que é
        ilustração.
      </p>
    </div>
  )
}
