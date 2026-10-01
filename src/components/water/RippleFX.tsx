import { useBlending, usePointer, useRipple } from '@funtech-inc/use-shader-fx'
import { useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useContext } from 'react'
import { WaterContext } from './WaterContext'

export type FXRippleProps = {
  frequency?: number
  rotation?: number
  fadeoutSpeed?: number
  scale?: number
  alpha?: number
}

/** 指针划过水面时的涟漪：模拟 → 混合进水面的 u_fx，由水 shader 做折射扰动 */
export default function RippleFX({
  frequency = 0.01,
  rotation = 0.05,
  fadeoutSpeed = 0.9,
  scale = 0.2,
  alpha = 1.0,
}: FXRippleProps) {
  const { ref: materialRef, refPointer } = useContext(WaterContext)

  const { size, dpr } = useThree((state) => {
    return { size: state.size, dpr: state.viewport.dpr }
  })

  const rippleTexture = useTexture('/fx/smoke.png')

  const [updateRipple, setRipple] = useRipple({
    size,
    texture: rippleTexture,
    dpr,
  })
  const [updateBlending, setBlending] = useBlending({ size, dpr })

  setRipple({
    frequency,
    rotation,
    fadeoutSpeed,
    scale,
    alpha,
  })

  const updatePointer = usePointer()

  useFrame((props) => {
    const ripple = updateRipple(props, {
      pointerValues: updatePointer(refPointer.current as never),
    })
    const fx = updateBlending(props, {
      map: ripple,
      alphaMap: false,
    })
    const material = (materialRef.current as { material: { uniforms: Record<string, { value: unknown }> } } | null)
      ?.material
    if (material) material.uniforms.u_fx.value = fx
  })

  return null
}
