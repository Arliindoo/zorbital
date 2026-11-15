/** As duas vistas de um estudo — o painel de dados e a simulação do experimento — e a troca entre elas. */

import { type ReactNode, Suspense, useEffect, useRef } from 'react'
import { reducedMotion } from '@/fx/useInView'
import { IconMonitor, IconOrbit } from '@/icons'
import { t } from '@/lib/i18n'
import type { StudyView } from '@/lib/useStudyView'
import { Loading } from './Loading'

const VIEWS = [
  { id: 'painel', label: t('Dashboard', 'Painel'), icon: IconMonitor },
  { id: 'simulacao', label: t('Simulation', 'Simulação'), icon: IconOrbit },
] as const

export function ViewSwitch({ view, onChange }: { view: StudyView; onChange: (view: StudyView) => void }) {
  return (
    <div className="views" role="tablist" aria-label={t('Study view', 'Vista do estudo')}>
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
      <Suspense fallback={<Loading label={t('Building the scene…', 'Montando a cena…')} />}>{children}</Suspense>
      <p className="caption sim-frame__note">
        {t(
          <>
            The scene is a reconstruction from the source values and a schematic mock-up of the environment — it is not video of the experiment. The <strong>ⓘ</strong> button in the scene says, test by test, what is data and
            what is illustration.
          </>,
          <>
            A cena é uma reconstrução a partir dos valores da fonte e uma maquete esquemática do ambiente — não é vídeo do experimento. O botão <strong>ⓘ</strong> na cena diz, ensaio a ensaio, o que é dado e o que é
            ilustração.
          </>,
        )}
      </p>
    </div>
  )
}
