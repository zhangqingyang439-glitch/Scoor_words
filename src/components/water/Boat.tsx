import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'

type BoatProps = ThreeElements['group']

/** 水面上的小船（boat.glb，两个网格：船体 Surface + 帆布 cloth） */
export function Boat(props: BoatProps) {
  const { nodes, materials } = useGLTF('/boat.glb') as unknown as {
    nodes: {
      Plane004_Boat_0_1: THREE.Mesh
      Plane004_Boat_0_2: THREE.Mesh
    }
    materials: {
      Surface: THREE.MeshStandardMaterial
      cloth: THREE.MeshStandardMaterial
    }
  }
  return (
    <group {...props} dispose={null}>
      <mesh castShadow receiveShadow geometry={nodes.Plane004_Boat_0_1.geometry} material={materials.Surface} />
      <mesh castShadow receiveShadow geometry={nodes.Plane004_Boat_0_2.geometry} material={materials.cloth} />
    </group>
  )
}

useGLTF.preload('/boat.glb')
