import { useMemo } from 'react'
import type { Dataset, Psi117Comparison } from '@/shared/api/types'
import Simulation from '@/visualization/Simulation'
import { psi117Study } from '@/visualization/studies/psi117'

export default function Psi117Sim({
  comparison,
  series,
  tables,
  onReport,
}: {
  comparison: readonly Psi117Comparison[]
  series: Dataset | null
  tables: Dataset | null
  onReport?: (text: string) => void
}) {
  const study = useMemo(() => psi117Study(comparison, series, tables), [comparison, series, tables])
  return <Simulation study={study} onReport={onReport} />
}
