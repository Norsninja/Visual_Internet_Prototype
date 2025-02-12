import * as THREE from 'three';

export class NodesManager {
  constructor(scene) {
    this.scene = scene;
    this.nodeRegistry = new Map();  // Stores meshes by ID
    this.nodePositions = new Map(); // Stores persistent positions
    this.velocity = new Map();      // Smooth physics updates
    this.missedUpdates = new Map(); // Tracks how many times a node was missing
  }

  updateNodes(nodesData, { preservePositions = true } = {}) {
    const updatedIds = new Set();
    let routerNode = Array.from(this.nodeRegistry.values()).find(n => n.userData?.type === "router");

    nodesData.forEach(node => {
        updatedIds.add(node.id);
        let mesh = this.nodeRegistry.get(node.id);

        if (!mesh) {
            console.log(`Adding new node: ${node.id}`);
            const geometry = new THREE.SphereGeometry(2, 16, 16);
            const material = new THREE.MeshBasicMaterial({ color: node.color || 0xffffff });
            mesh = new THREE.Mesh(geometry, material);
            this.scene.add(mesh);
            this.nodeRegistry.set(node.id, mesh);

            // ✅ Fix: Keep the router locked at (0,0,0)
            if (node.type === "router") {
                this.nodePositions.set(node.id, new THREE.Vector3(0, 0, 0));
            }
            // ✅ Local nodes: Cluster **near** the router in 3D
            else if (node.type === "device" && routerNode) {
                let angle = Math.random() * Math.PI * 2;
                let radius = 30 + Math.random() * 20;
                let zOffset = (Math.random() - 0.5) * 20; // **Subtle** Z spread

                let pos = new THREE.Vector3(
                    routerNode.position.x + radius * Math.cos(angle),
                    routerNode.position.y + radius * Math.sin(angle),
                    routerNode.position.z + zOffset
                );
                this.nodePositions.set(node.id, pos);
            }
            // ✅ External nodes: Further away, but still **stabilized**
            else {
                let angle = Math.random() * Math.PI * 2;
                let radius = 100 + Math.random() * 50;
                let zOffset = (Math.random() - 0.5) * 50; // **Controlled** spread

                let pos = new THREE.Vector3(
                    radius * Math.cos(angle),
                    radius * Math.sin(angle),
                    routerNode ? routerNode.position.z + zOffset : zOffset
                );
                this.nodePositions.set(node.id, pos);
            }

            this.velocity.set(node.id, new THREE.Vector3());
        }

        mesh.userData = { ...mesh.userData, ...node };
        mesh.material.color.set(mesh.userData.color);

        if (preservePositions && this.nodePositions.has(node.id)) {
            mesh.position.copy(this.nodePositions.get(node.id));
        }

        this.missedUpdates.set(node.id, 0);

        // ✅ Automatically create the external port moon (Red sphere)
        if (node.type === "router" && node.open_external_port) {
            console.log(`Router ${node.id} has an open external port: ${node.open_external_port}`);
            
            // Ensure this port isn't already visualized
            let portMoonId = `external-port-${node.open_external_port}`;
            if (!this.nodeRegistry.has(portMoonId)) {
                this.spawnChildNodes(mesh, [node.open_external_port]); // Pass the external port
            }
        }
    });
}





applyForces(edgesData) {
    const damping = 0.85;
    const repulsionStrength = 20;
    const springStrength = 0.01;
    const equilibriumDistance = 40;
    const externalPushStrength = 0.01;
  
    const forces = new Map();
  
    // First, initialize forces for non-child nodes.
    this.nodeRegistry.forEach((mesh, id) => {
        // If this is the router, skip force accumulation.
        if (mesh.userData?.type === "router") {
            forces.set(id, new THREE.Vector3());
            return;
        }
        forces.set(id, new THREE.Vector3());
    });
  
    // Calculate repulsion forces (skip router if necessary).
    this.nodeRegistry.forEach((meshA, idA) => {
        if (meshA.userData?.type === "child" || meshA.userData?.type === "router") return;
  
        this.nodeRegistry.forEach((meshB, idB) => {
            if (idA !== idB && meshB.userData?.type !== "child") {
                let force = new THREE.Vector3().subVectors(meshA.position, meshB.position);
                let distance = force.length() + 0.1;
                force.normalize().multiplyScalar(repulsionStrength / (distance * distance));
                forces.get(idA).add(force);
            }
        });
    });
  
    // Process spring forces for edges (apply to all nodes except children).
    edgesData.forEach(edge => {
        let meshA = this.nodeRegistry.get(edge.source);
        let meshB = this.nodeRegistry.get(edge.target);
        if (!meshA || !meshB) return;
        let force = new THREE.Vector3().subVectors(meshB.position, meshA.position);
        let distance = force.length();
        let stretch = distance - equilibriumDistance;
        force.normalize().multiplyScalar(springStrength * stretch);
  
        // Note: If one of these nodes is the router and you want it fixed,
        // you might choose not to apply forces to it.
        if (meshA.userData?.type !== "router") {
          forces.get(edge.source).add(force);
        }
        if (meshB.userData?.type !== "router") {
          forces.get(edge.target).sub(force);
        }
    });
  
    // External push forces, etc.
    this.nodeRegistry.forEach((mesh, id) => {
        if (mesh.userData?.type === "external" && this.getNodeById("router")) { // assuming router has an id "router"
            let routerMesh = this.getNodeById("router");
            let direction = new THREE.Vector3().subVectors(mesh.position, routerMesh.position).normalize();
            direction.multiplyScalar(externalPushStrength);
            forces.get(id).add(direction);
        }
    });
  
    // Finally update the positions based on forces.
    this.nodeRegistry.forEach((mesh, id) => {
        if (mesh.userData?.type === "router") {
            // Force the router to stay at (0,0,0)
            mesh.position.set(0, 0, 0);
            this.velocity.set(id, new THREE.Vector3()); // optionally zero out its velocity
        } else if (mesh.userData?.type !== "child") {
            let velocity = this.velocity.get(id) || new THREE.Vector3();
            let force = forces.get(id);
            velocity.add(force);
            velocity.multiplyScalar(damping);
            mesh.position.add(velocity);
            this.velocity.set(id, velocity);
        }
    });
  

  

}



spawnChildNodes(parentNode, openPorts) {
    console.log(`Spawning child nodes for ${parentNode.userData.id} with ports:`, openPorts);
    const orbitRadius = 3;
    const numPorts = openPorts.length;
  
    // Handle the special external open port (for the router)
    if (parentNode.userData.type === "router" && parentNode.userData.open_external_port) {
      let externalPort = parentNode.userData.open_external_port;
      if (externalPort) {
        console.log(`Creating external port visualization for ${externalPort}`);
        let angle = Math.PI / 4;  // Position slightly above
        // Compute the offset in parent's local coordinates:
        let offset = new THREE.Vector3(
            Math.cos(angle) * orbitRadius,
            Math.sin(angle) * orbitRadius,
            3  // Slight Z offset
        );
  
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const externalMesh = new THREE.Mesh(geometry, material);
        externalMesh.position.copy(offset);  // Set local offset
  
        externalMesh.userData = {
            id: `external-port-${externalPort}`,
            label: `External Port ${externalPort}`,
            type: "child",
            port: externalPort,
            parentId: parentNode.userData.id,
        };
  
        // Instead of adding to scene, add as a child:
        parentNode.add(externalMesh);
        this.nodeRegistry.set(externalMesh.userData.id, externalMesh);
      }
    }
  
    // Handle normal open ports (local devices)
    openPorts.forEach((port, index) => {
      console.log(`Creating moon for port: ${port}, index: ${index}`);
      let angle = (2 * Math.PI * index) / numPorts;
      let offset = new THREE.Vector3(
          Math.cos(angle) * orbitRadius,
          Math.sin(angle) * orbitRadius,
          0
      );
  
      const geometry = new THREE.SphereGeometry(0.5, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
      const childMesh = new THREE.Mesh(geometry, material);
      childMesh.position.copy(offset);  // Set local offset
  
      childMesh.userData = {
          id: `${parentNode.userData.id}-port-${port}`,
          label: `Port ${port}`,
          type: "child",
          port: port,
          parentId: parentNode.userData.id,
      };
  
      // Parent the child mesh to the router node
      parentNode.add(childMesh);
      this.nodeRegistry.set(childMesh.userData.id, childMesh);
    });
  }
  


  getNodesArray() {
    return Array.from(this.nodeRegistry.values());
  }

  getNodeById(id) {
    return this.nodeRegistry.get(id);
  }
}
