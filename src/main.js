// src/main.js
import * as THREE from 'three';
import { CameraController } from './camera.js';
import { Ship } from './ship.js';
import { SceneManager } from './scene.js';
import { NodesManager } from './nodes.js';
import { EdgesManager } from './edges.js';
import { UIManager } from './ui.js';
import { EventsManager } from './events.js';
import { NetworkManager } from './network.js';

// Create the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Initialize the camera controller
const cameraController = new CameraController(renderer);
const camera = cameraController.camera;

// Create the scene using SceneManager
const sceneManager = new SceneManager();
const scene = sceneManager.getScene();

// Initialize the NodesManager with the scene
const nodesManager = new NodesManager(scene);

// Initialize the EdgesManager with the scene and a callback to get a node by ID
const edgesManager = new EdgesManager(scene, (id) => nodesManager.getNodeById(id));

// Initialize the UIManager (handles the info box)
const uiManager = new UIManager();

// Initialize the EventsManager with the camera, nodesManager, and uiManager
const eventsManager = new EventsManager(camera, nodesManager, uiManager);

// Initialize the NetworkManager with nodesManager and edgesManager
const networkManager = new NetworkManager(nodesManager, edgesManager);
networkManager.startPeriodicUpdates(10000); // update every 10 seconds

// Create the ship and add it to the scene (from your existing ship module)
const ship = new Ship();
scene.add(ship.getMesh());

// Animation loop: update camera controls and render the scene
function animate() {
  requestAnimationFrame(animate);
  cameraController.update();
  renderer.render(scene, camera);
}
animate();

// Handle window resize for the renderer
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});
