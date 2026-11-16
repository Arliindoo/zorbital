import { useMemo } from 'react'
import type { CfiRow, Row } from '@/shared/api/types'
import Simulation from '@/visualization/Simulation'
import { cfiStudy } from '@/visualization/studies/cfi'

export default function CfiSim({ rows, cameras, onReport }: { rows: readonly CfiRow[]; cameras: readonly Row[]; onReport?: (text: string) => void }) {
  const study = useMemo(() => cfiStudy(rows, cameras), [rows, cameras])
  return <Simulation study={study} onReport={onReport} />
}
