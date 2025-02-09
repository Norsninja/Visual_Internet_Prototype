// src/ship.js
import * as THREE from 'three';

export class Ship {
  constructor() {
    // Create a unique geometry for the ship.
    // Here, we use a cone to represent the ship.
    const geometry = new THREE.ConeGeometry(2, 4, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    this.mesh = new THREE.Mesh(geometry, material);

    // Position the ship at the origin (or adjust as needed)
    this.mesh.position.set(0, 0, 0);
    // Rotate the cone so that it points forward (optional)
    this.mesh.rotation.x = Math.PI / 2;
  }

  // Update ship properties if needed (e.g., based on new data)
  update(data) {
    // Example: update position, rotation, etc.
  }

  getMesh() {
    return this.mesh;
  }
}
