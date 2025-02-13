// src/scene.js
import * as THREE from 'three';

// Utility function to generate random positions for stars.
function generateStarPositions(count, range) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * range;
    positions[i * 3 + 1] = (Math.random() - 0.5) * range;
    positions[i * 3 + 2] = (Math.random() - 0.5) * range;
  }
  return positions;
}

export class SceneManager {
  constructor(camera, backgroundColor = 0x000000) { // ✅ Accept camera as a parameter
    this.scene = new THREE.Scene();
    this.camera = camera; // ✅ Store reference to the camera
    this.setBackground(backgroundColor);

    this.nebulaMaterial = null;
    this.starField = null;

    this.createProceduralBackground();
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

  /**
   * createProceduralBackground()
   * Creates a layered background:
   *   - A star field (static or slowly drifting).
   *   - A procedural nebula that pulses and shifts based on network metrics.
   */
  createProceduralBackground() {
    // --- Layer 1: Star Field ---
    const starCount = 1000;
    const starGeometry = new THREE.BufferGeometry();
    const positions = generateStarPositions(starCount, 2000);
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      transparent: true,
      opacity: 0.8
    });
    
    this.starField = new THREE.Points(starGeometry, starMaterial);
    // Position star field in the background.
    this.starField.position.z = -500;
    this.scene.add(this.starField);

    // --- Layer 2: Nebula Layer ---
    const nebulaGeometry = new THREE.PlaneGeometry(2000, 2000);
    const nebulaUniforms = {
      time: { value: 0.0 },
      trafficLevel: { value: 0.0 },
      totalNodes: { value: 0.0 },
      localNodes: { value: 0.0 },
      externalNodes: { value: 0.0 }
    };

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float time;
      uniform float trafficLevel;
      uniform float totalNodes;
      uniform float localNodes;
      uniform float externalNodes;
      varying vec2 vUv;

      // --- Smooth Noise Functions ---
      float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(mix(hash(i + vec2(0.0, 0.0)), 
                        hash(i + vec2(1.0, 0.0)), u.x),
                    mix(hash(i + vec2(0.0, 1.0)), 
                        hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      // --- Fractal Brownian Motion (Smooth Nebula) ---
      float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;

          for (int i = 0; i < 4; i++) {
              value += amplitude * noise(p * frequency);
              frequency *= 2.0;
              amplitude *= 0.5;
          }
          return value;
      }

      void main() {
          // 🌫 **Base Coordinates & Motion**
          vec2 uv = vUv * 3.0;
          vec2 motion = vec2(time * 0.0002, time * 0.0001); // ⏳ MUCH SLOWER Motion

          // 🌐 **Network-Driven Expansion & Sway**
          float trafficFactor = 1.0 + trafficLevel * 0.2; // 🌐 Less aggressive
          uv += motion * trafficFactor;

          float externalInfluence = externalNodes / (totalNodes + 1.0);
          float localInfluence = localNodes / (totalNodes + 1.0);

          uv.x += sin(time * 0.002 + externalInfluence * 1.5) * 0.05; // 🌐 Super Slow Sway
          uv.y += cos(time * 0.003 + localInfluence * 1.0) * 0.05;

          // 🌊 **Shockwave Ripples from Traffic Spikes (Super Subtle)**
          float pulse = sin(time * (trafficLevel * 0.5)) * 0.1 + 0.95; // ⚡ Barely noticeable pulse
          uv += pulse * vec2(sin(time * 0.0005), cos(time * 0.00075)) * trafficLevel * 0.05;

          // 🌫 **Generate Nebula Shape**
          float nebula = fbm(uv);
          nebula *= 1.0 + trafficLevel * 0.1; // 📉 Subtle Growth

          // 🎨 **ULTRA-SLOW Color Oscillation**
          float colorCycle = sin(time * 0.002) * 0.5 + 0.5;  // 🌈 Takes **10+ minutes to fully shift**
          float colorCycle2 = sin(time * 0.0015) * 0.5 + 0.5; 

          vec3 redPurple = mix(vec3(0.8, 0.1, 0.2), vec3(0.5, 0.0, 0.5), colorCycle); 
          vec3 blueCyan = mix(vec3(0.1, 0.2, 0.8), vec3(0.0, 0.6, 1.0), colorCycle2); 

          // 🔥 **Blend Oscillation with Network Bias**
          vec3 baseColor = mix(redPurple, blueCyan, externalInfluence);
          baseColor *= (nebula * 1.1 + 0.3); // 📉 Less Brightness Variation

          // 🌀 **Final Output**
          gl_FragColor = vec4(baseColor, 1.0);
      }





    `;

    this.nebulaMaterial = new THREE.ShaderMaterial({
      uniforms: nebulaUniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthWrite: false,
    });


    const nebulaMesh = new THREE.Mesh(nebulaGeometry, this.nebulaMaterial);
    // Position the nebula layer in the background (in front of the star field if desired).
    nebulaMesh.position.set(0, 0, -2); // Just in front of the camera
    // this.scene.add(nebulaMesh); // 

    // Expose an update function for the background.
    this.animateBackground = (delta, metrics) => {
      if (isNaN(delta) || !isFinite(delta)) {
        console.error("NaN detected in delta, setting default value");
        delta = 0.016;
      }

      if (isNaN(this.nebulaMaterial.uniforms.time.value)) {
          console.warn("NaN detected in time.value, resetting to 0");
          this.nebulaMaterial.uniforms.time.value = 0;
      }
      this.nebulaMaterial.uniforms.time.value += delta;
      this.nebulaMaterial.uniforms.trafficLevel.value = metrics.trafficLevel;
      this.nebulaMaterial.uniforms.totalNodes.value = metrics.totalNodes;
      this.nebulaMaterial.uniforms.localNodes.value = metrics.localNodes;
      this.nebulaMaterial.uniforms.externalNodes.value = metrics.externalNodes;


    };
  }
}
