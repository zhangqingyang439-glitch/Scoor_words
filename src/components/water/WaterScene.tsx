import { Canvas } from '@react-three/fiber'
import { Environment, Float } from '@react-three/drei'
import { EffectComposer, N8AO } from '@react-three/postprocessing'
import WaterSurfaceSimple from './WaterSurfaceSimple'
import RippleFX from './RippleFX'
import { Boat } from './Boat'
import { NightStars } from './NightStars'

/**
 * 首页的全屏水面场景，移植自 WaterSurface
 * （github.com/nhtoby311/WaterSurface，by nhtoby）：
 * 冬夜环境反射的镜面水面 + 小船 + 指针划过时的涟漪 + 会闪烁的星空。
 *
 * 相对原项目裁掉的部分：leva 调参面板、r3f-perf、OrbitControls、
 * complex 水面和 fluid FX（保留原项目的默认组合：simple + ripple）。
 * 相机固定（手机上拖拽旋转会和页面滚动打架），dpr 压到 1.5 省电。
 *
 * 背景：public/cubemap/winter-night.jpg，一张 360° 全景
 * （Poly Haven 的 Horn-koppe Snow 改的冬夜版：压暗 + 冷蓝调 + 手绘月亮）。
 * 星星不在图里 —— 由 NightStars 点云实时画，会闪，水面倒影也跟着闪。
 *
 * 指针事件：外层 div 不拦截，首页内容层用 pointer-events-none 让空处
 * 的事件落到 canvas 上 —— 划过水面就有涟漪，点在卡片上则照常操作。
 */
export default function WaterScene() {
  return (
    <div className="fixed inset-0 z-0" aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [12, 1, 6] }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        gl={{ powerPreference: 'high-performance' }}
      >
        <Environment background files="cubemap/winter-night.jpg" />
        <ambientLight />

        <NightStars />

        <WaterSurfaceSimple
          position={[0, -3, 0]}
          width={190}
          length={190}
          waterColor="#020617"
          distortionScale={0.7}
          fxDistortionFactor={0.05}
          fxDisplayColorAlpha={0}
          fxMixColor="#12233d"
        >
          <RippleFX alpha={1.0} fadeoutSpeed={0.94} frequency={0.01} rotation={0.02} scale={0.06} />
        </WaterSurfaceSimple>

        <EffectComposer>
          <N8AO intensity={5} aoRadius={8} halfRes />
        </EffectComposer>

        <Float speed={2} floatingRange={[-0.2, -0.3]} floatIntensity={0.1} rotationIntensity={0.5}>
          <Boat rotation-y={Math.PI / 1.8} position={[0, -3.3, 0]} />
        </Float>
      </Canvas>
    </div>
  )
}
