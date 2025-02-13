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

// Debug renderer
renderer.debug.checkShaderErrors = true;

// ✅ Create the scene FIRST (so `scene` exists before using it)
const sceneManager = new SceneManager(window.camera);
window.sceneManager = sceneManager;
const scene = sceneManager.scene;

// ✅ Now create the ship (AFTER scene is defined)
const ship = new Ship(tweenGroup);
scene.add(ship.getMesh());
window.ship = ship;

// ✅ Create the camera AFTER ship is created
const cameraController = new CameraController(renderer, ship.getMesh());
window.cameraController = cameraController;
window.camera = cameraController.camera; // Store globally

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
  const delta = time * 0.001; // delta in seconds

  // Compute network metrics
  const nodesArray = window.nodesManager.getNodesArray();
  const totalNodes = nodesArray.length;
  const localNodes = nodesArray.filter(n => n.userData.type === "device").length;
  const externalNodes = nodesArray.filter(n => n.userData.type === "external").length;
  
  // Get traffic level metric
  const trafficLevel = window.getTrafficLevel ? window.getTrafficLevel() : 0;

  const metrics = {
    trafficLevel,
    totalNodes,
    localNodes,
    externalNodes,
  };

  // Update procedural background
  if (window.sceneManager.animateBackground) {
    window.sceneManager.animateBackground(delta, metrics);
  }

  tweenGroup.update(time);
  cameraController.update();

  nodesManager.applyForces(edgesManager.edgesData || []);
  edgesManager.updateEdgePositions();
  edgesManager.updateTraffic();

  renderer.render(scene, window.camera);
}
animate();
