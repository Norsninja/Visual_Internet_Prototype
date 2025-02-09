// src/nodes.js
import * as THREE from 'three';

export class NodesManager {
  constructor(scene) {
    this.scene = scene;
    this.nodeRegistry = new Map();   // key: node.id, value: mesh
    this.nodePositions = new Map();  // key: node.id, value: THREE.Vector3
  }
  
  updateNodes(nodesData) {
    // Remove nodes that are no longer present
    const currentNodeIds = new Set(nodesData.map(node => node.id));
    for (let [nodeId, mesh] of this.nodeRegistry.entries()) {
      if (!currentNodeIds.has(nodeId)) {
        this.scene.remove(mesh);
        this.nodeRegistry.delete(nodeId);
        this.nodePositions.delete(nodeId);
      }
    }
    
    // Create or update nodes
    nodesData.forEach(node => {
      let mesh = this.nodeRegistry.get(node.id);
      
      // If no stored position, assign one based on node type
      if (!this.nodePositions.has(node.id)) {
        let pos = new THREE.Vector3();
        if (node.type === "ship" || node.type === "router") {
          pos.set(0, 0, 0);
        } else if (node.type === "device") {
          pos.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
        } else if (node.type === "external") {
          pos.set(Math.random() * 40 - 20, Math.random() * 40 - 20, 50);
        } else {
          pos.set(Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15);
        }
        this.nodePositions.set(node.id, pos);
      }
      const pos = this.nodePositions.get(node.id);
      
      if (!mesh) {
        const sphereSize = 2; // adjust as needed
        const color = node.color ? new THREE.Color(node.color).getHex() : 0xffffff;
        const geometry = new THREE.SphereGeometry(sphereSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color });
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        // Save node data for later use (e.g., in the UI)
        mesh.userData = { ...node };
        this.nodeRegistry.set(node.id, mesh);
        this.scene.add(mesh);
      } else {
        // Update metadata and color if necessary
        mesh.userData = { ...node };
        const newColor = node.color ? new THREE.Color(node.color).getHex() : 0xffffff;
        mesh.material.color.setHex(newColor);
      }
    });
  }
  
  // Return an array of node meshes (for raycasting)
  getNodesArray() {
    return Array.from(this.nodeRegistry.values());
  }
  
  // Optional helper to get a node by its ID
  getNodeById(id) {
    return this.nodeRegistry.get(id);
  }
}
