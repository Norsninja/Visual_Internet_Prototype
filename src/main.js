// src/main.js
import * as THREE from 'three';
import { CameraController } from './camera.js';
import { Ship } from './ship.js';
import { World } from './world.js';

// Create the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Initialize the camera controller
const cameraController = new CameraController(renderer);
// Expose the camera globally for the world module's raycaster (temporary workaround)
window.camera = cameraController.camera;

// Initialize the world (scene, nodes, edges)
const world = new World();

// Create the ship and add it to the scene
const ship = new Ship();
world.scene.add(ship.getMesh());

// Animation loop: update camera controls and render the scene
function animate() {
  requestAnimationFrame(animate);
  cameraController.update();
  renderer.render(world.scene, cameraController.camera);
}
animate();

// Periodically update network data (every 10 seconds) from the backend
setInterval(() => {
  world.updateNetworkData();
}, 10000);
// Initial update call
world.updateNetworkData();

// Handle window resize for the renderer
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});
