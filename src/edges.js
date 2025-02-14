// edges.js
import * as THREE from 'three';

export class EdgesManager {
  constructor(scene, getNodeById) {
    this.scene = scene;
    this.edgeRegistry = new Map(); // key: "source-target", value: line
    this.getNodeById = getNodeById;
    this.trafficParticles = [];
    this.edgesData = [];
  }

  updateEdges(edgesData) {
    this.edgesData = edgesData; // Save edges for access in main.js  
    const edgeKeys = new Set(edgesData.map(edge => `${edge.source}-${edge.target}`));

    // Do not remove edges unless backend explicitly marks them as outdated
    const currentKeys = new Set(this.edgeRegistry.keys());
    edgeKeys.forEach(key => currentKeys.delete(key)); // Remove only what's NOT in the new dataset

    // Remove explicitly outdated edges
    currentKeys.forEach(key => {
      const line = this.edgeRegistry.get(key);
      this.scene.remove(line);
      this.edgeRegistry.delete(key);
    });


    // Create new edges
    edgesData.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);
        if (sourceMesh && targetMesh) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            sourceMesh.position.clone(),
            targetMesh.position.clone()
          ]);

          const material = new THREE.LineBasicMaterial({ 
            color: 0xadd8e6, 
            transparent: true, 
            opacity: 0.5  // Adjust the opacity as needed
          });
          
          const line = new THREE.Line(geometry, material);
          this.scene.add(line);
          this.edgeRegistry.set(key, line);
        }
      }
    });
  }

  updateEdgePositions() {
    this.edgeRegistry.forEach((line, key) => {
      // Extract source and target IDs from the key (assuming key format "source-target")
      const [sourceId, targetId] = key.split('-');
      const sourceMesh = this.getNodeById(sourceId);
      const targetMesh = this.getNodeById(targetId);
      if (sourceMesh && targetMesh) {
        const points = [sourceMesh.position.clone(), targetMesh.position.clone()];
        line.geometry.setFromPoints(points);
        line.geometry.computeBoundingSphere();  // Ensure correct updates
        line.geometry.attributes.position.needsUpdate = true;
        
      }
    });
  }

  animateTraffic(srcNode, dstNode, size) {
    const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const packetGeometry = new THREE.SphereGeometry(size / 500, 8, 8);
    const packet = new THREE.Mesh(packetGeometry, packetMaterial);
    this.scene.add(packet);
    this.trafficParticles.push({ packet, srcNode, dstNode, progress: 0 });
  }

  updateTraffic() {
    this.trafficParticles.forEach((traffic, index) => {
      traffic.progress += 0.05;
      if (traffic.progress >= 1) {
        this.scene.remove(traffic.packet);
        this.trafficParticles.splice(index, 1);
      } else {
        traffic.packet.position.lerpVectors(traffic.srcNode.position, traffic.dstNode.position, traffic.progress);
      }
    });
  }
}
