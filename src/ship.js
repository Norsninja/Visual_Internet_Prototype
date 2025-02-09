// src/ship.js
import * as THREE from 'three';

export class Ship {
  constructor() {
    const geometry = new THREE.ConeGeometry(2, 6, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Bright blue color
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = Math.PI / 2;
  }

  getMesh() {
    return this.mesh;
  }
}
