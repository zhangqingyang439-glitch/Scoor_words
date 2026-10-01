import { createContext } from 'react'

/** 水面网格的 material ref 和指针 UV（NDC），涟漪 FX 通过它取指针位置 */
export const WaterContext = createContext<{ ref: { current: unknown }; refPointer: { current: unknown } }>({
  ref: { current: null },
  refPointer: { current: null },
})
