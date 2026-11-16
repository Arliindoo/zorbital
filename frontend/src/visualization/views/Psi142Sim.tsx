import { useMemo } from 'react'
import type { AlertRow, Psi142Point, Psi142Set } from '@/shared/api/types'
import Simulation from '@/visualization/Simulation'
import { psi142Study } from '@/visualization/studies/psi142'

export default function Psi142Sim({
  set,
  points,
  alerts,
  onReport,
}: {
  set: Psi142Set
  points: readonly Psi142Point[]
  alerts: readonly AlertRow[]
  onReport?: (text: string) => void
}) {
  const study = useMemo(() => psi142Study(set, points, alerts), [set, points, alerts])
  return <Simulation study={study} onReport={onReport} />
}
