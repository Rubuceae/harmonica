import { attachLyrics, parseJianpu } from './jianpu'
import type { Score } from './types'

export const DEMO_JIANPU = `
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 - |
6 6 5 5 #4 #4 3 - | 6 6 5 5 #4 #4 3 - |
2 2 6 6 7 7 6 - | 5 5 #4 #4 3 3 2 -
`

export const DURATION_DEMO = `
1 1_ 1_ 1. 2_ | 2 - 3 - | 4 4_ 4_ 4. 5_ | 5 - - - |
6__ 6__ 6__ 6__ 7__ 7__ 7__ 7__ 1'_ 1'_ 2'_ 2'_ |
3' - 4' - | 5' 5'_ 5'_ 5'. 6'_ | 1'' - - - |
1, 2, 3, 4, | 5, - - -
`

const VERSE_1 = '一 闪 一 闪 亮 晶 晶 满 天 都 是 小 星 星 挂 在 天 上 放 光 明 好 像 许 多 小 眼 睛 一 闪 一 闪 亮 晶 晶 满 天 都 是 小 星 星'.split(
  ' ',
)

const VERSE_2 = '一 闪 一 闪 亮 晶 晶 满 天 都 是 小 星 星 太 阳 出 来 天 亮 了 小 星 星 睡 着 了 一 闪 一 闪 亮 晶 晶 满 天 都 是 小 星 星'.split(
  ' ',
)

export const DEMO_LYRICS = `${VERSE_1.join(' ')}\n${VERSE_2.join(' ')}`

const DEMO_SLURS = [
  { from: 'n0', to: 'n1' },
  { from: 'n2', to: 'n3' },
  { from: 'n4', to: 'n5' },
  { from: 'n7', to: 'n8' },
  { from: 'n9', to: 'n10' },
  { from: 'n11', to: 'n12' },
  { from: 'n14', to: 'n15' },
  { from: 'n16', to: 'n17' },
  { from: 'n18', to: 'n19' },
]

export function demoScore(): Score {
  const base = parseJianpu(DEMO_JIANPU, 96, { tonic: 2, mode: 'major' }, '小星星')
  return attachLyrics(
    {
      ...base,
      composer: '传统 曲',
      lyricist: '佚名 词',
      slurs: DEMO_SLURS,
    },
    [VERSE_1, VERSE_2],
  )
}
