import * as THREE from 'three';

export class NodesManager {
  constructor(scene) {
    this.scene = scene;
    this.nodeRegistry = new Map();   // key: node.id, value: mesh
    this.nodePositions = new Map();  // key: node.id, value: THREE.Vector3
    this.velocity = new Map();  // key: node.id, value: THREE.Vector3 (for smooth movement)
  }

  updateNodes(nodesData) {
    const currentNodeIds = new Set(nodesData.map(node => node.id));

    // Remove obsolete nodes (but keep child nodes)
    for (let [nodeId, mesh] of this.nodeRegistry.entries()) {
      if (!currentNodeIds.has(nodeId) && mesh.userData.type !== "child") {
        this.scene.remove(mesh);
        this.nodeRegistry.delete(nodeId);
        this.nodePositions.delete(nodeId);
        this.velocity.delete(nodeId);
      }
    }

    nodesData.forEach(node => {
      let mesh = this.nodeRegistry.get(node.id);
      if (!this.nodePositions.has(node.id)) {
        // Random initial position for the force-directed graph
        this.nodePositions.set(node.id, new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100
        ));
        this.velocity.set(node.id, new THREE.Vector3());
      }

      if (!mesh) {
        const geometry = new THREE.SphereGeometry(2, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: node.color || 0xffffff });
        mesh = new THREE.Mesh(geometry, material);
        this.scene.add(mesh);
        this.nodeRegistry.set(node.id, mesh);
      }

      if (!mesh.userData.originalColor) {
        mesh.userData.originalColor = mesh.material.color.getHex();
    }

    // Merge instead of replacing userData
    mesh.userData = { ...mesh.userData, ...node };
    });
  }

  applyForces(edgesData) {
    const damping = 0.85; // Prevents jittering
    const repulsionStrength = 100;
    const springStrength = 0.1;
    const equilibriumDistance = 30;

    const forces = new Map();

    // Initialize forces for non-child nodes
    this.nodePositions.forEach((_, id) => {
        if (this.nodeRegistry.get(id)?.userData?.type !== "child") {
            forces.set(id, new THREE.Vector3());
        }
    });

    // Repulsion force (Coulomb's Law) - Ignore child nodes
    this.nodePositions.forEach((posA, idA) => {
        if (this.nodeRegistry.get(idA)?.userData?.type === "child") return;
        
        this.nodePositions.forEach((posB, idB) => {
            if (idA !== idB && this.nodeRegistry.get(idB)?.userData?.type !== "child") {
                let force = new THREE.Vector3().subVectors(posA, posB);
                let distance = force.length() + 0.1;
                force.normalize().multiplyScalar(repulsionStrength / (distance * distance));
                forces.get(idA).add(force);
            }
        });
    });

    // Spring force (Hooke's Law) - Ignore child nodes
    edgesData.forEach(edge => {
        let posA = this.nodePositions.get(edge.source);
        let posB = this.nodePositions.get(edge.target);
        if (!posA || !posB) return;
        if (this.nodeRegistry.get(edge.source)?.userData?.type === "child" || 
            this.nodeRegistry.get(edge.target)?.userData?.type === "child") return;

        let force = new THREE.Vector3().subVectors(posB, posA);
        let distance = force.length();
        let stretch = distance - equilibriumDistance;
        force.normalize().multiplyScalar(springStrength * stretch);

        forces.get(edge.source).add(force);
        forces.get(edge.target).sub(force);
    });

    // Apply forces - Ignore child nodes
    this.nodePositions.forEach((pos, id) => {
        if (this.nodeRegistry.get(id)?.userData?.type === "child") return;
        
        let velocity = this.velocity.get(id);
        let force = forces.get(id);

        velocity.add(force);
        velocity.multiplyScalar(damping);
        pos.add(velocity);
    });

    // Update mesh positions for non-child nodes
    this.nodeRegistry.forEach((mesh, id) => {
        if (this.nodeRegistry.get(id)?.userData?.type !== "child") {
            mesh.position.copy(this.nodePositions.get(id));
        }
    });

    // Update child node positions to follow their parent
    this.nodeRegistry.forEach((childMesh, childId) => {
        if (childMesh.userData?.type === "child") {
            let parentMesh = this.nodeRegistry.get(childMesh.userData.parentId);
            if (parentMesh && parentMesh.userData.open_ports) {  //  Ensure open_ports exists
                let numPorts = parentMesh.userData.open_ports.length || 1;  //  Avoid division by zero
                let angle = (2 * Math.PI * childMesh.userData.port) / numPorts;
                let orbitRadius = 8;
                let childPos = new THREE.Vector3(
                    parentMesh.position.x + Math.cos(angle) * orbitRadius,
                    parentMesh.position.y + Math.sin(angle) * orbitRadius,
                    parentMesh.position.z
                );
                childMesh.position.copy(childPos);
            } else {
                console.warn(`Parent node missing open_ports:`, parentMesh);
            }
        }
    });
  }

  spawnChildNodes(parentNode, openPorts) {
    console.log(`Spawning child nodes for ${parentNode.userData.id} with ports:`, openPorts);

    const parentPos = parentNode.position.clone();
    const orbitRadius = 5;
    const numPorts = openPorts.length;

    openPorts.forEach((port, index) => {
        console.log(`Creating moon for port: ${port}, index: ${index}`);

        const angle = (2 * Math.PI * index) / numPorts;
        const childX = parentPos.x + orbitRadius * Math.cos(angle);
        const childY = parentPos.y + orbitRadius * Math.sin(angle);
        const childZ = parentPos.z + orbitRadius * Math.cos(angle);
        const childPos = new THREE.Vector3(childX, childY, childZ);

        const childSize = 0.5;
        const geometry = new THREE.SphereGeometry(childSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
        const childMesh = new THREE.Mesh(geometry, material);
        childMesh.position.copy(childPos);

        const childId = `${parentNode.userData.id}-port-${port}`;
        childMesh.userData = {
            id: childId,
            label: `Port ${port}`,
            type: "child",
            port: port,
            parentId: parentNode.userData.id,
        };

        console.log(`Adding moon: ${childId} at position`, childMesh.position);

        this.nodeRegistry.set(childId, childMesh);
        this.scene.add(childMesh);
    });
}


  getNodesArray() {
    return Array.from(this.nodeRegistry.values());
  }

  getNodeById(id) {
    return this.nodeRegistry.get(id);
  }
}
