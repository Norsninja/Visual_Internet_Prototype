import * as THREE from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';

export class Ship {
  constructor(tweenGroup) {
    this.tweenGroup = tweenGroup;
    this.shipContainer = new THREE.Group(); // Holds exterior and cockpit

    // Exterior Mesh
    this.shipExterior = this.createShipMesh();
    this.shipContainer.add(this.shipExterior);

    // Placeholder Cockpit (Invisible for now)
    this.cockpit = new THREE.Object3D();
    this.cockpit.position.set(0, 0, 0);
    this.shipContainer.add(this.cockpit);

    this.currentView = 'external';
    this.previousPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
  }

  createShipMesh() {
    const geometry = new THREE.ConeGeometry(2, 4, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, Math.PI / 2, 0);
    mesh.name = "Ship";
    return mesh;
  }

  getMesh() {
    return this.shipContainer;
  }

  travelTo(target, duration = 2000) {
    // If target is an Object3D, compute its world position
    let targetPosition = target instanceof THREE.Object3D 
      ? target.getWorldPosition(new THREE.Vector3())
      : target;
  
    console.log("Ship is moving from:", this.shipContainer.position, "to", targetPosition);
    this.previousPosition.copy(this.shipContainer.position);
  
    // Determine the direction and target quaternion for the ship
    const direction = new THREE.Vector3()
      .subVectors(targetPosition, this.shipContainer.position)
      .normalize();
  
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(targetPosition, this.shipContainer.position, this.shipContainer.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
  
    // Tween rotation first
    const rotationTween = new Tween(this.shipContainer.quaternion, this.tweenGroup)
      .to({ 
        x: targetQuaternion.x, 
        y: targetQuaternion.y, 
        z: targetQuaternion.z, 
        w: targetQuaternion.w 
      }, duration / 2)
      .easing(Easing.Quadratic.Out)
      .onUpdate(() => this.shipContainer.updateMatrixWorld(true))
      .start();
  
    // Delay the position tween until rotation is underway
    setTimeout(() => {
      new Tween(this.shipContainer.position, this.tweenGroup)
        .to({ 
          x: targetPosition.x, 
          y: targetPosition.y, 
          z: targetPosition.z 
        }, duration)
        .easing(Easing.Quadratic.Out)
        .onUpdate(() => this.shipContainer.updateMatrixWorld(true))
        .onComplete(() => {
          console.log("Ship arrived at:", this.shipContainer.position);
          if (window.uiManager) {
            window.uiManager.updateTravelStatus("Arrived!");
          }
          this.setOrbitAroundNode(targetPosition);
        })
        .start();
    }, duration / 2);
  }
  

  setOrbitAroundNode(nodePosition) {
    if (!nodePosition) {
      console.warn("No valid node position found for orbit.");
      return;
    }


    this.orbitTarget = nodePosition;  // Save the node reference for continuous tracking
    this.orbitRadius = 4;
    this.orbitAngle = Math.random() * Math.PI * 2;
    

    console.log("Ship placed in orbit at:", this.shipContainer.position);
  }

  switchView() {
    if (this.currentView === 'external') {
      this.enterCockpit();
    } else {
      this.exitCockpit();
    }
  }

  enterCockpit() {
    this.currentView = 'cockpit';
    console.log("Entering cockpit view");

    if (window.cameraController) {
      window.cameraController.camera.position.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y,
        this.shipContainer.position.z
      );
      window.cameraController.controls.target.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y,
        this.shipContainer.position.z + 1
      );
    }
  }

  exitCockpit() {
    this.currentView = 'external';
    console.log("Exiting cockpit view");

    if (window.cameraController) {
      window.cameraController.camera.position.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y + 20,
        this.shipContainer.position.z + 50
      );
      window.cameraController.controls.target.copy(this.shipContainer.position);
    }
  }
}
