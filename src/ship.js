import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import * as TWEEN from '@tweenjs/tween.js';

export class Ship {
  constructor(tweenGroup) {
    // Create the ship's mesh with proper initial orientation
    const geometry = new THREE.ConeGeometry(2, 4, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0, 0, 0);
    this.mesh.rotation.set(0, Math.PI / 2, 0); // Correct initial alignment

    this.mesh.name = "Ship";

    this.previousPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.tweenGroup = tweenGroup;
  }

  getMesh() {
    return this.mesh;
  }

  travelTo(targetPosition, duration = 2000) {
    console.log("Ship is moving from:", this.mesh.position, "to", targetPosition);

    // Store initial position and orientation
    this.previousPosition.copy(this.mesh.position);
    const startQuaternion = this.mesh.quaternion.clone();

    // Compute the direction vector (where the ship should face)
    const direction = new THREE.Vector3()
      .subVectors(targetPosition, this.mesh.position)
      .normalize();

    // Create target quaternion to face direction
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(targetPosition, this.mesh.position, this.mesh.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);

    // Rotate the ship BEFORE moving
    const rotationTween = new Tween(this.mesh.quaternion, this.tweenGroup)
      .to({ x: targetQuaternion.x, y: targetQuaternion.y, z: targetQuaternion.z, w: targetQuaternion.w }, duration / 2)
      .easing(Easing.Quadratic.Out)
      .onUpdate(() => {
        this.mesh.updateMatrixWorld(true);
      })
      .start();

    // Wait for rotation to complete, then move the ship
    setTimeout(() => {
      new Tween(this.mesh.position, this.tweenGroup)
        .to({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }, duration)
        .easing(Easing.Quadratic.Out)
        .onUpdate(() => {
          this.mesh.updateMatrixWorld(true);
        })
        .onComplete(() => {
          console.log("Ship arrived at:", this.mesh.position);
          if (window.uiManager) {
            window.uiManager.updateTravelStatus("Arrived!");
          }

          // ✅ Place ship in orbit around the destination node
          this.setOrbitAroundNode(targetPosition);
        })
        .start();
    }, duration / 2); // Move after rotation completes
  }


setInitialOrbit(routerNode) {
  if (!routerNode) {
      console.warn("No router node found, cannot set ship orbit.");
      return;
  }
  
  if (this.initialized) {
      console.log("Ship already initialized, skipping orbit placement.");
      return;
  }

  // Convert router position to Vector3
  const routerPos = new THREE.Vector3(routerNode.x || 0, routerNode.y || 0, routerNode.z || 0);

  // Compute orbital position (fixed radius)
  const orbitRadius = 1;
  const angle = Math.random() * Math.PI * 2;

  const shipX = routerPos.x + orbitRadius * Math.cos(angle);
  const shipY = routerPos.y + orbitRadius * Math.sin(angle);
  const shipZ = routerPos.z;

  // Set ship position
  this.mesh.position.set(shipX, shipY, shipZ);
  console.log("Ship placed in orbit around router at:", this.mesh.position);

  //  Mark the ship as initialized
  this.initialized = true;
}
setOrbitAroundNode(nodePosition) {
  if (!nodePosition) {
    console.warn("No valid node position found for orbit.");
    return;
  }

  // Compute a small orbital position around the node
  const orbitRadius = 5;
  const angle = Math.random() * Math.PI * 2;

  const orbitX = nodePosition.x + orbitRadius * Math.cos(angle);
  const orbitY = nodePosition.y + orbitRadius * Math.sin(angle);
  const orbitZ = nodePosition.z;

  // Move ship into orbit position
  this.mesh.position.set(orbitX, orbitY, orbitZ);

  // Ensure ship tip faces the node
  this.mesh.lookAt(new THREE.Vector3(nodePosition.x, nodePosition.y, nodePosition.z));


  console.log("Ship placed in orbit around node at:", this.mesh.position);
}





}
