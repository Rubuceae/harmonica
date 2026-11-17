import { parseJianpu } from './jianpu'
import type { Score } from './types'

export const DEMO_JIANPU = `
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 - |
6 6 5 5 #4 #4 3 - | 6 6 5 5 #4 #4 3 - |
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 -
`

export const DURATION_DEMO = `
1 1_ 1_ 1. 2_ | 2 - 3 - | 4 4_ 4_ 4. 5_ | 5 - - - |
6__ 6__ 6__ 6__ 7__ 7__ 7__ 7__ 1'_ 1'_ 2'_ 2'_ |
3' - 4' - | 5' 5'_ 5'_ 5'. 6'_ | 1'' - - -
`

export function demoScore(): Score {
  return parseJianpu(DEMO_JIANPU, 96, { tonic: 2, mode: 'major' }, '小星星')
}
