/**
 * Fit a procedural object into one board cell so every element occupies the
 * same footprint (no overlap with neighbours).
 */
import * as THREE from "three";

/**
 * Scale `obj` so its max horizontal (X/Z) extent equals `target`, then center it
 * at the origin (or drop it onto the ground plane when `ground` is true).
 * `obj` must have an identity parent transform (call before positioning it).
 */
export function fitObject(obj: THREE.Object3D, target: number, ground = false): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const maxXZ = Math.max(size.x, size.z) || 1;
  obj.scale.multiplyScalar(target / maxXZ);

  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.x -= center.x;
  obj.position.z -= center.z;
  obj.position.y -= ground ? box2.min.y : center.y;
}
