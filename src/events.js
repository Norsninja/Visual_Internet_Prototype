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
    
    // Store the currently selected node.
    this.selectedNode = null;
    
   
    // Bind click event to handle selection/deselection.
    document.addEventListener("click", this.handleClick.bind(this), false);
  }
  resetSelection(skipUI = false) {
    console.log("Resetting selection...");
    
    if (this.selectedNode) {
        console.log("Previous selected node:", this.selectedNode.userData.id);

        if (this.selectedNode.material) {
            if (this.selectedNode.userData.originalColor !== undefined) {
                console.log("Restoring color to:", this.selectedNode.userData.originalColor);
                this.selectedNode.material.color.setHex(this.selectedNode.userData.originalColor);
            } else {
                console.warn("Previous node missing original color!", this.selectedNode.userData.id);
                this.selectedNode.material.color.setHex(0xffffff);
            }
        }

        this.selectedNode = null;
        if (!skipUI) {  // Only hide UI when not scanning
            this.uiManager.hideInfo();
        }
    }
}


 
handleClick(event) {
    console.log("Handling click event...");

    // ✅ Ignore clicks on UI elements
    if (event.target.closest("#uiContainer")) {
        console.log("Click ignored: UI element was clicked.");
        return;
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.nodesManager.getNodesArray().forEach(node => node.updateMatrixWorld(true));

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const nodesArray = this.nodesManager.getNodesArray();
    const intersects = this.raycaster.intersectObjects(nodesArray);

    console.log("Intersections found:", intersects.length);

    if (intersects.length > 0) {
        const clickedNode = intersects[0].object;
        console.log("Clicked node:", clickedNode.userData.id);

        if (!clickedNode.userData.originalColor) {
            clickedNode.userData.originalColor = clickedNode.material.color.getHex();
        }

        if (this.selectedNode && this.selectedNode !== clickedNode) {
            if (this.selectedNode.userData.originalColor !== undefined) {
                this.selectedNode.material.color.setHex(this.selectedNode.userData.originalColor);
            }
        }

        this.selectedNode = clickedNode;
        clickedNode.material.color.set(0xffffff);
        window.selectedNode = this.selectedNode;
        this.uiManager.showInfo(clickedNode, event);
    } else {
        console.log("No node clicked, resetting selection.");
        this.resetSelection();
    }
}

}
