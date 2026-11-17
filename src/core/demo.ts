import { parseJianpu } from './jianpu'
import type { Score } from './types'

const TWINKLE = `
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 - |
6 6 5 5 #4 #4 3 - | 6 6 5 5 #4 #4 3 - |
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 -
`

export function demoScore(): Score {
  return parseJianpu(TWINKLE, 96, { tonic: 2, mode: 'major' }, '小星星')
}
