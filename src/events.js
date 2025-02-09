// src/events.js
import * as THREE from 'three';

export class EventsManager {
  /**
   * @param {THREE.Camera} camera - The camera for raycasting.
   * @param {NodesManager} nodesManager - Instance of NodesManager.
   * @param {UIManager} uiManager - Instance of UIManager.
   */
  constructor(camera, nodesManager, uiManager) {
    this.camera = camera;
    this.nodesManager = nodesManager;
    this.uiManager = uiManager;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Bind mouse move event
    document.addEventListener("mousemove", this.handleMouseMove.bind(this), false);
  }
  
  handleMouseMove(event) {
    // Check if mouse is over the UI info box; if so, do nothing.
    const rect = this.uiManager.infoBox.getBoundingClientRect();
    if (
      this.uiManager.infoBox.style.display === "block" &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    ) {
      return;
    }
    
    // Update mouse vector for raycasting
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const nodesArray = this.nodesManager.getNodesArray();
    const intersects = this.raycaster.intersectObjects(nodesArray);
    if (intersects.length > 0) {
      this.uiManager.showInfo(intersects[0].object, event);
    } else {
      this.uiManager.hideInfo();
    }
  }
}
