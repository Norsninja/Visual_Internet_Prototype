// src/scene.js
import * as THREE from 'three';

export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
  }
  
  getScene() {
    return this.scene;
  }
  
  addObject(object) {
    this.scene.add(object);
  }
  
  removeObject(object) {
    this.scene.remove(object);
  }
}
