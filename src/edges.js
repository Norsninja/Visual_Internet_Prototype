// src/edges.js
import * as THREE from 'three';

export class EdgesManager {
  /**
   * @param {THREE.Scene} scene - The Three.js scene.
   * @param {Function} getNodeById - Callback to return a node mesh given an ID.
   */
  constructor(scene, getNodeById) {
    this.scene = scene;
    this.edgeRegistry = new Map(); // key: "source-target", value: line
    this.getNodeById = getNodeById;
  }
  
  updateEdges(edgesData) {
    const edgeKeys = new Set(edgesData.map(edge => `${edge.source}-${edge.target}`));
    
    // Remove outdated edges
    for (let key of this.edgeRegistry.keys()) {
      if (!edgeKeys.has(key)) {
        const line = this.edgeRegistry.get(key);
        this.scene.remove(line);
        this.edgeRegistry.delete(key);
      }
    }
    
    // Create new edges
    edgesData.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);
        if (sourceMesh && targetMesh) {
          const points = [sourceMesh.position, targetMesh.position];
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({ color: 0xffffff });
          const line = new THREE.Line(geometry, material);
          this.scene.add(line);
          this.edgeRegistry.set(key, line);
        }
      }
    });
  }
}
