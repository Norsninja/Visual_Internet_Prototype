import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * Creates a procedural node mesh with unique geometry and materials.
 * @param {string} id - Unique node ID (usually the IP address).
 * @param {string} type - Type of the node (router, device, external).
 * @param {string} color - Default color assigned by the system.
 * @returns {THREE.Mesh} - A fully constructed Three.js mesh object.
 */
export function createNodeMesh(id, type, color) {
    const seed = hashIP(id);
    const geometry = generateDistortedGeometry(seed, type);
    const material = generateMaterial(type, color, seed);
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id, type, color, seed }; // ✅ Explicitly assign ID!

    return mesh;
}



/**
 * Generates a unique seed based on an IP address.
 * @param {string} ip - The node's IP address.
 * @returns {number} - A pseudo-random seed value.
 */
function hashIP(ip) {
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
        hash = (hash << 5) - hash + ip.charCodeAt(i);
        hash &= hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 1000; // Keep it within reasonable range
}

/**
 * Creates a procedurally distorted sphere using Simplex Noise.
 * @param {number} seed - Seed value to modify distortion.
 * @param {string} type - Node type, affecting distortion levels.
 * @returns {THREE.BufferGeometry} - The modified geometry.
 */
const noise = new SimplexNoise(); //

function generateDistortedGeometry(seed, type) {
    const geometry = new THREE.SphereGeometry(2, 32, 32); // ✅ Increase smoothness
    const noise = new SimplexNoise();
    
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];

        // ✅ Reduce distortion to maintain a spherical shape
        const noiseFactor = noise.noise3d(x * 0.1, y * 0.1, z * 0.1) * 0.2; // ✅ Lower intensity
        positions[i] += noiseFactor;
        positions[i + 1] += noiseFactor;
        positions[i + 2] += noiseFactor;
    }

    geometry.attributes.position.needsUpdate = true;
    return geometry;
}


/**
 * Generates a dynamic material with emissive and glowing effects.
 * @param {string} type - Node type to determine material style.
 * @param {string} baseColor - Assigned color.
 * @param {number} seed - Unique per-node variation.
 * @returns {THREE.ShaderMaterial} - A custom shader material.
 */
export function generateMaterial(type, color, seed) {
    return new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,  
        emissiveIntensity: 0.4,  // ✅ Add subtle glow
        roughness: 0.4,          // ✅ Restore proper lighting response
        metalness: 0.3,          // ✅ Ensures nodes aren’t too flat-looking
    });
}

