import { parseJianpu } from './jianpu'
import type { Score } from './types'

export const DEMO_JIANPU = `
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 - |
6 6 5 5 #4 #4 3 - | 6 6 5 5 #4 #4 3 - |
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 -
`

export function demoScore(): Score {
  return parseJianpu(DEMO_JIANPU, 96, { tonic: 2, mode: 'major' }, '小星星')
}
