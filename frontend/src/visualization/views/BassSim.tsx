import { useMemo } from 'react'
import type { BassRow } from '@/shared/api/types'
import Simulation from '@/visualization/Simulation'
import { bassStudy } from '@/visualization/studies/bass'

export default function BassSim({ rows, onReport }: { rows: readonly BassRow[]; onReport?: (text: string) => void }) {
  const study = useMemo(() => bassStudy(rows), [rows])
  return <Simulation study={study} onReport={onReport} />
}
