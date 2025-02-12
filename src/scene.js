// src/scene.js
import * as THREE from 'three';

export class SceneManager {
  constructor(backgroundColor = 0x000000) {
    this.scene = new THREE.Scene();
    this.setBackground(backgroundColor);
  }

  addObjects(objects = []) {
    objects.forEach(obj => this.scene.add(obj));
  }

  removeObjects(objects = []) {
    objects.forEach(obj => this.scene.remove(obj));
  }

  setBackground(colorHex) {
    this.scene.background = new THREE.Color(colorHex);
  }
}


