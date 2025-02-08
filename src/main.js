// src/main.js

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Set up the camera
const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  1000
);
camera.position.z = 50;

// Set up the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add OrbitControls for camera navigation
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // optional for smoother controls

// Function to fetch network data from the Flask API
// Store positions of nodes between updates
let networkObjects = [];
let nodePositions = {}; // Stores { nodeId: THREE.Vector3 }

async function updateNetworkData() {
  try {
    const response = await fetch('http://localhost:5000/network');
    const data = await response.json();
    console.log('Network data:', data);

    // Track which nodes still exist after the update
    const newNodePositions = {};

    // Create or update nodes
    data.nodes.forEach(node => {
      if (!nodePositions[node.id]) {
        // Assign a new position only if the node is new
        nodePositions[node.id] = new THREE.Vector3(
          Math.random() * 40 - 20,
          Math.random() * 40 - 20,
          Math.random() * 40 - 20
        );
      }
      newNodePositions[node.id] = nodePositions[node.id]; // Keep track of valid nodes

      // Create sphere for the node
      const geometry = new THREE.SphereGeometry(1.5, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: node.color || 0xffffff });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(nodePositions[node.id]);

      scene.add(sphere);
      networkObjects.push(sphere);
    });

    // Remove old nodes (nodes that no longer exist in the new dataset)
    Object.keys(nodePositions).forEach(nodeId => {
      if (!newNodePositions[nodeId]) {
        delete nodePositions[nodeId]; // Forget old node position
      }
    });

    // Update global node positions
    nodePositions = newNodePositions;

    // Create edges
    data.edges.forEach(edge => {
      const sourcePos = nodePositions[edge.source];
      const targetPos = nodePositions[edge.target];

      if (sourcePos && targetPos) {
        const material = new THREE.LineBasicMaterial({ color: 0x888888 });
        const geometry = new THREE.BufferGeometry().setFromPoints([sourcePos, targetPos]);
        const line = new THREE.Line(geometry, material);

        scene.add(line);
        networkObjects.push(line);
      }
    });

  } catch (error) {
    console.error('Error fetching network data:', error);
  }
}



// Update network data every 10 seconds
setInterval(updateNetworkData, 10000);
updateNetworkData(); // Initial call

// Handle window resize events
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
