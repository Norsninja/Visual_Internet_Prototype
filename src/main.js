import * as THREE from 'three';
import { Group, Tween } from '@tweenjs/tween.js';
import { CameraController } from './camera.js';
import { Ship } from './ship.js';
import { SceneManager } from './scene.js';
import { NodesManager } from './nodes.js';
import { EdgesManager } from './edges.js';
import { UIManager } from './ui.js';
import { EventsManager } from './events.js';
import { NetworkManager } from './network.js';

// Create a new Tween Group (avoiding a global TWEEN).
const tweenGroup = new Group();

// Create the renderer.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Create the scene.
const sceneManager = new SceneManager();
const scene = sceneManager.scene;


// Create and add the ship.
const ship = new Ship(tweenGroup);
scene.add(ship.getMesh());
window.ship = ship;

// Initialize the camera (passing the ship for centering/orbiting).
const cameraController = new CameraController(renderer, ship.getMesh());
window.cameraController = cameraController;
window.camera = cameraController.camera; // Make it globally accessible

// Initialize game objects.
const nodesManager = new NodesManager(scene);
const edgesManager = new EdgesManager(scene, (id) => nodesManager.getNodeById(id));
const uiManager = new UIManager();
const eventsManager = new EventsManager(window.camera, nodesManager, uiManager, ship);
const networkManager = new NetworkManager(nodesManager, edgesManager);
networkManager.startPeriodicUpdates(10000);

window.uiManager = uiManager;
window.maxTravelDistance = 500;
window.nodesManager = nodesManager;
window.edgesManager = edgesManager;

// Update the tween group manually every frame.
function animate(time) {
  requestAnimationFrame(animate);
  tweenGroup.update(time);
  cameraController.update();

  // Update node positions using forces.
  nodesManager.applyForces(edgesManager.edgesData || []);

  // Update the edge geometries to follow the moving nodes.
  edgesManager.updateEdgePositions();

  // Update animated traffic particles.
  edgesManager.updateTraffic();

  renderer.render(scene, window.camera);
}
animate();


