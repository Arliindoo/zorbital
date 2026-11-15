import { useMemo } from 'react'
import type { CfiRow, Row } from '@/api/types'
import Simulation from '../Simulation'
import { cfiStudy } from '../studies/cfi'

export default function CfiSim({ rows, cameras, onReport }: { rows: readonly CfiRow[]; cameras: readonly Row[]; onReport?: (text: string) => void }) {
  const study = useMemo(() => cfiStudy(rows, cameras), [rows, cameras])
  return <Simulation study={study} onReport={onReport} />
}
