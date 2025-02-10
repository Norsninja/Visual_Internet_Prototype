import * as THREE from 'three';
import { Group, Tween } from '@tweenjs/tween.js'; // ✅ Import Group and Tween
import { CameraController } from './camera.js';
import { Ship } from './ship.js';
import { SceneManager } from './scene.js';
import { NodesManager } from './nodes.js';
import { EdgesManager } from './edges.js';
import { UIManager } from './ui.js';
import { EventsManager } from './events.js';
import { NetworkManager } from './network.js';

// ✅ Create a new Tween Group (avoid global TWEEN)
const tweenGroup = new Group();

// Create the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Initialize the camera
const cameraController = new CameraController(renderer);
const camera = cameraController.camera;
window.camera = cameraController.camera;

// Create the scene
const sceneManager = new SceneManager();
const scene = sceneManager.getScene();

// Initialize game objects
const nodesManager = new NodesManager(scene);
const edgesManager = new EdgesManager(scene, (id) => nodesManager.getNodeById(id));
const uiManager = new UIManager();
const eventsManager = new EventsManager(camera, nodesManager, uiManager);
const networkManager = new NetworkManager(nodesManager, edgesManager);
networkManager.startPeriodicUpdates(10000);
window.uiManager = uiManager
// Create and add the ship (pass the tween group)
const ship = new Ship(tweenGroup);
scene.add(ship.getMesh());
console.log("Ship added to scene:", ship.getMesh().position);

window.ship = ship;
window.maxTravelDistance = 500;
window.nodesManager = nodesManager;

// Update the tween group manually every frame
function animate(time) {
  requestAnimationFrame(animate);

  tweenGroup.update(time);  // Now using our custom tween group!

  cameraController.update();
  if (edgesManager && edgesManager.updateEdges) {
    nodesManager.applyForces(edgesManager.edgesData || []);
  } else {
      console.warn("Warning: edgesManager or edgesData is not available.");
  }
  renderer.render(scene, camera);
}
animate();
