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

    // Create an HTML info box for displaying node details and the port scan button/results
    this.infoBox = document.createElement("div");
    this.infoBox.style.position = "absolute";
    this.infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    this.infoBox.style.color = "white";
    this.infoBox.style.padding = "10px";
    this.infoBox.style.borderRadius = "5px";
    this.infoBox.style.display = "none";
    // Prevent pointer events on the infoBox from propagating to the document
    this.infoBox.addEventListener("mouseenter", (e) => e.stopPropagation());
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
        // Update node metadata and color if needed
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

  // Updated onMouseMove: do not hide infoBox if the mouse is over it
  onMouseMove(event) {
    // Check if the mouse is currently over the infoBox
    const rect = this.infoBox.getBoundingClientRect();
    if (
      this.infoBox.style.display === "block" &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      // Do nothing so that the box remains visible and interactive.
      return;
    }

    // Update mouse vector for raycasting
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Use the global camera (exposed from main.js) for raycasting
    if (!window.camera) return;
    this.raycaster.setFromCamera(this.mouse, window.camera);
    const intersects = this.raycaster.intersectObjects(Array.from(this.nodeRegistry.values()));
    if (intersects.length > 0) {
      this.showNodeInfo(intersects[0].object, event);
    } else {
      this.infoBox.style.display = "none";
    }
  }

  // Display the node info along with a "Scan Ports" button if appropriate.
  // Also update the info box with scan results and update the node on the map.
  showNodeInfo(node, event) {
    const data = node.userData;
    // Check if the node's id looks like an IP address (and isn't the ship)
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    let scanButtonHtml = "";
    if (ipRegex.test(data.id) && data.type !== "ship") {
      scanButtonHtml = `<button id="portScanButton">Scan Ports</button>`;
    }
    // Basic info display plus an empty container for scan results.
    this.infoBox.innerHTML = `
      <strong>${data.label || "Unknown"}</strong><br>
      MAC: ${data.mac || "N/A"}<br>
      Role: ${data.role || "N/A"}<br>
      ${scanButtonHtml}
      <div id="scanResults"></div>
    `;
    this.infoBox.style.left = `${event.clientX + 10}px`;
    this.infoBox.style.top = `${event.clientY + 10}px`;
    this.infoBox.style.display = "block";

    // If a Scan Ports button was added, attach a click listener.
    if (scanButtonHtml) {
      const portScanButton = this.infoBox.querySelector("#portScanButton");
      portScanButton.addEventListener("click", async () => {
        try {
          // Disable the button and indicate progress.
          portScanButton.disabled = true;
          portScanButton.innerText = "Scanning...";
          // Call the backend endpoint to perform the port scan.
          const response = await fetch(`http://localhost:5000/scan_ports?ip=${data.id}`);
          const result = await response.json();
          // Update the node's metadata with the open ports.
          node.userData.open_ports = result.ports;
          // Update the info box to display the scan results.
          const scanResultsDiv = this.infoBox.querySelector("#scanResults");
          scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
          // Optionally, update the node's appearance on the map.
          if (result.ports.length > 0) {
            // For example, change the node's color to yellow.
            node.material.color.set(0xffff00);
          }
        } catch (err) {
          const scanResultsDiv = this.infoBox.querySelector("#scanResults");
          scanResultsDiv.innerHTML = `<br><strong>Error scanning ports:</strong> ${err}`;
        } finally {
          portScanButton.disabled = false;
          portScanButton.innerText = "Scan Ports";
        }
      }, { once: true });
    }
  }
}
