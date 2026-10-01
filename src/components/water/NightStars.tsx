import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, ShaderMaterial } from 'three'
import type { Points } from 'three'
import type { ThreeElements } from '@react-three/fiber'

type NightStarsProps = ThreeElements['points'] & {
  count?: number
  /** 星星到原点的距离，要大于水面半宽（95），不然会沉到地平线下面 */
  radius?: number
}

/**
 * 夜空里会闪烁的星星。
 *
 * 只撒在上半球（仰角 4° 以上），每颗星有自己的相位和快慢，
 * 亮度按 sin(uTime·speed + phase) 呼吸；整片天再绕极轴极慢旋转。
 * 用的是加法混合的点精灵，水面的镜面反射会把它们原样映进去，
 * 所以倒影里的星星也是会闪的 —— 这是把星星烤进全景图做不到的。
 *
 * 布局用固定种子生成：改 count 之外的参数重跑，星空的样子不变。
 */
export function NightStars({ count = 800, radius = 130, ...props }: NightStarsProps) {
  const material = useMemo(() => {
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aTint;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        varying float vTint;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // 亮度呼吸：大部分时间偏亮，偶尔暗下去
          float tw = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
          vAlpha = 0.25 + 0.75 * tw;
          vTint = aTint;
          gl_PointSize = aSize * uPixelRatio * (0.7 + 0.3 * tw);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vTint;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a; // 中心更实、边缘柔和
          // 少数星偏冷蓝，多数纯白
          vec3 col = mix(vec3(1.0), vec3(0.81, 0.88, 1.0), vTint);
          gl_FragColor = vec4(col, a * vAlpha);
        }
      `,
    })
  }, [])

  const geometryAttrs = useMemo(() => {
    // mulberry32 固定种子 —— 星图可复现
    let seed = 20261001
    const rand = () => {
      seed += 0x6d2b79f5
      let t = seed
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const positions = new Float32Array(count * 3)
    const sizes = new Float32Array(count)
    const phases = new Float32Array(count)
    const speeds = new Float32Array(count)
    const tints = new Float32Array(count)
    const DEG = Math.PI / 180
    for (let i = 0; i < count; i++) {
      const az = rand() * Math.PI * 2
      // 仰角下限 4°：贴着树线留一点，别让星星沉进山影里
      const elev = (4 + rand() * rand() * 84) * DEG
      positions[i * 3] = radius * Math.cos(elev) * Math.sin(az)
      positions[i * 3 + 1] = radius * Math.sin(elev)
      positions[i * 3 + 2] = radius * Math.cos(elev) * Math.cos(az)
      // 绝大多数是小星，撒几颗大的
      sizes[i] = rand() < 0.9 ? 1.1 + rand() * 1.3 : 2.6 + rand() * 1.6
      phases[i] = rand() * Math.PI * 2
      speeds[i] = 0.4 + rand() * 1.4
      tints[i] = rand() < 0.18 ? 1 : 0
    }
    return { positions, sizes, phases, speeds, tints }
  }, [count, radius])

  const pointsRef = useRef<Points>(null)

  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    const pr = state.gl.getPixelRatio()
    if (material.uniforms.uPixelRatio.value !== pr) material.uniforms.uPixelRatio.value = pr
    if (pointsRef.current) pointsRef.current.rotation.y += delta * 0.004
  })

  return (
    <points ref={pointsRef} material={material} frustumCulled={false} {...props}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[geometryAttrs.positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[geometryAttrs.sizes, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[geometryAttrs.phases, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[geometryAttrs.speeds, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[geometryAttrs.tints, 1]} />
      </bufferGeometry>
    </points>
  )
}
