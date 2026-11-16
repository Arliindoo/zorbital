import { useMemo } from 'react'
import type { FlexRow } from '@/shared/api/types'
import Simulation from '@/visualization/Simulation'
import { flexStudy } from '@/visualization/studies/flex'

export default function FlexSim({ rows, onReport }: { rows: readonly FlexRow[]; onReport?: (text: string) => void }) {
  const study = useMemo(() => flexStudy(rows), [rows])
  return <Simulation study={study} onReport={onReport} />
}
