import { useMemo, useRef } from 'react'
import { PlaneGeometry, RepeatWrapping, Vector2 } from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { WaterSimple } from './WaterSimple'
import { WaterContext } from './WaterContext'

type Props = {
  width?: number
  length?: number
  dimensions?: number
  waterColor?: number | string
  position?: [number, number, number]
  distortionScale?: number
  fxDistortionFactor?: number
  fxDisplayColorAlpha?: number
  fxMixColor?: number | string
  children?: React.ReactNode
}

/**
 * 镜面反射水面（基于 three 的 Water 改造，混入 use-shader-fx 的涟漪扰动）。
 * 指针在水面上滑动时 e.uv 被记录下来，交给 children 里的 RippleFX 画涟漪。
 */
export default function WaterSurfaceSimple({
  width = 190,
  length = 190,
  dimensions = 1024,
  waterColor = 0x000000,
  position = [0, 0, 0],
  distortionScale = 0.7,
  fxDistortionFactor = 0.2,
  fxDisplayColorAlpha = 0.0,
  fxMixColor = 0x000000,
  children,
}: Props) {
  const ref = useRef<any>(null)
  const refPointer = useRef(new Vector2(0, 0))

  const waterNormals = useTexture('/water/simple/waternormals.jpeg')
  waterNormals.wrapS = waterNormals.wrapT = RepeatWrapping

  const geom = useMemo(() => new PlaneGeometry(width, length), [length, width])

  const config = useMemo(
    () => ({
      textureWidth: dimensions,
      textureHeight: dimensions,
      waterNormals,
      waterColor,
      distortionScale,
      fxDistortionFactor,
      fxDisplayColorAlpha,
      fxMixColor,
      fog: false,
    }),
    [dimensions, distortionScale, fxDisplayColorAlpha, fxDistortionFactor, fxMixColor, waterColor, waterNormals],
  )

  useFrame((_, delta) => {
    if (ref.current) ref.current.material.uniforms.time.value += delta / 2
  })

  const waterObj = useMemo(() => new WaterSimple(geom, config), [geom, config])

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return
    refPointer.current = e.uv.multiplyScalar(2).subScalar(1)
  }

  return (
    <WaterContext.Provider value={{ ref, refPointer }}>
      <primitive
        ref={ref}
        onPointerMove={handlePointerMove}
        object={waterObj}
        rotation-x={-Math.PI / 2}
        position={position}
      />
      {children}
    </WaterContext.Provider>
  )
}
