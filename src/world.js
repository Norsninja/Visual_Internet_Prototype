// src/world.js
import * as THREE from 'three';

export class World {
  constructor() {
    // Create the Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Registries for nodes and edges
    this.nodeRegistry = new Map();  // Map of nodeID to Three.js Mesh
    this.edgeRegistry = new Map();  // Map of edgeKey to Three.js Line
    this.nodePositions = new Map(); // Persistent positions for nodes

    // Create an HTML info box for displaying node details
    this.infoBox = document.createElement("div");
    this.infoBox.style.position = "absolute";
    this.infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    this.infoBox.style.color = "white";
    this.infoBox.style.padding = "10px";
    this.infoBox.style.borderRadius = "5px";
    this.infoBox.style.display = "none";
    document.body.appendChild(this.infoBox);

    // Set up raycaster and mouse vector for interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Bind mouse move event for hover interactions
    document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
  }

  // Fetch network data from the backend and update the scene
  async updateNetworkData() {
    try {
      const response = await fetch('http://localhost:5000/network');
      const data = await response.json();
      this.updateNodes(data.nodes);
      this.updateEdges(data.edges);
    } catch (error) {
      console.error('Error fetching network data:', error);
    }
  }

  // Update or create node objects based on the fetched data
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

      // If the node doesn't have a stored position, assign one
      if (!this.nodePositions.has(node.id)) {
        let pos = new THREE.Vector3();
        if (node.type === "ship") {
          pos.set(0, 0, 0);
        } else if (node.type === "router") {
          // Place the router at the center (or adjust as desired)
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
        const sphereSize = 2; // Default size; adjust as needed

        // Use THREE.Color to handle both named colors and hex values
        const color = node.color ? new THREE.Color(node.color).getHex() : 0xffffff;
        const geometry = new THREE.SphereGeometry(sphereSize, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color });
        mesh = new THREE.Mesh(geometry, material);

        // Set the mesh's position from the persistent position
        mesh.position.copy(pos);

        // Store metadata for interactions
        mesh.userData = { ...node };

        this.nodeRegistry.set(node.id, mesh);
        this.scene.add(mesh);
      } else {
        // Update node metadata if needed
        mesh.userData = { ...node };
        const newColor = node.color ? new THREE.Color(node.color).getHex() : 0xffffff;
        mesh.material.color.setHex(newColor);
      }
    });
  }

  // Update or create edge objects connecting nodes
  updateEdges(edgesData) {
    // Remove edges that no longer exist
    const edgeKeys = new Set(edgesData.map(edge => `${edge.source}-${edge.target}`));
    for (let key of this.edgeRegistry.keys()) {
      if (!edgeKeys.has(key)) {
        const line = this.edgeRegistry.get(key);
        this.scene.remove(line);
        this.edgeRegistry.delete(key);
      }
    }

    // Create new edges or update existing ones
    edgesData.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        // Look up source and target meshes
        const sourceMesh = this.nodeRegistry.get(edge.source);
        const targetMesh = this.nodeRegistry.get(edge.target);
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

  // Handle mouse movement to display node details on hover
  onMouseMove(event) {
    // Update mouse vector for raycasting
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // For raycasting, we need the camera.
    // (A temporary solution: expose the camera as window.camera from main.js)
    if (!window.camera) return;
    this.raycaster.setFromCamera(this.mouse, window.camera);
    const intersects = this.raycaster.intersectObjects(Array.from(this.nodeRegistry.values()));
    if (intersects.length > 0) {
      this.showNodeInfo(intersects[0].object, event);
    } else {
      this.infoBox.style.display = "none";
    }
  }

  showNodeInfo(node, event) {
    const data = node.userData;
    this.infoBox.innerHTML = `
      <strong>${data.label || "Unknown"}</strong><br>
      MAC: ${data.mac || "N/A"}<br>
      Role: ${data.role || "N/A"}<br>
    `;
    this.infoBox.style.left = `${event.clientX + 10}px`;
    this.infoBox.style.top = `${event.clientY + 10}px`;
    this.infoBox.style.display = "block";
  }
}
