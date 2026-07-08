import * as THREE from 'three'

/**
 * Local face normals on the die mesh.
 * Standard layout: 2 on top (+Y), 1 toward front (+Z), 3 left (-X), 4 right (+X).
 */
export const FACE_NORMALS: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(0, 0, 1),
  2: new THREE.Vector3(0, 1, 0),
  3: new THREE.Vector3(-1, 0, 0),
  4: new THREE.Vector3(1, 0, 0),
  5: new THREE.Vector3(0, -1, 0),
  6: new THREE.Vector3(0, 0, -1),
}

const WORLD_UP = new THREE.Vector3(0, 1, 0)

/**
 * Orient the die so the rolled value sits face-up (+Y world)
 * and the front edge (where 1 sits when 2 is up) faces the camera (+Z).
 * Always returns a new quaternion — never a shared mutable instance.
 */
export function getQuaternionForFace(value: number): THREE.Quaternion {
  const faceNormal = FACE_NORMALS[value] ?? FACE_NORMALS[1]
  const orientation = new THREE.Quaternion().setFromUnitVectors(faceNormal, WORLD_UP)

  const localFront = new THREE.Vector3(0, 0, 1).applyQuaternion(orientation)
  localFront.y = 0

  if (localFront.lengthSq() > 1e-4) {
    localFront.normalize()
    const angle = Math.atan2(localFront.x, localFront.z)
    const twist = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, -angle)
    return twist.multiply(orientation)
  }

  return orientation
}

export function combineQuaternions(a: THREE.Quaternion, b: THREE.Quaternion): THREE.Quaternion {
  return a.clone().multiply(b)
}
