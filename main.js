import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(0, 5, 10);
controls.update();

// Control points for the surface
const controlPoints = [
    [[-5, 0, -5], [-2.5, 2, -5], [2.5, -1, -5], [5, 0, -5]],
    [[-5, 1, -2.5], [-2.5, 3, -2.5], [2.5, 0, -2.5], [5, 1, -2.5]],
    [[-5, -1, 2.5], [-2.5, 0, 2.5], [2.5, 2, 2.5], [5, -1, 2.5]],
    [[-5, 0, 5], [-2.5, -2, 5], [2.5, 1, 5], [5, 0, 5]]
];

// Bernstein polynomial
function bernstein(n, i, t) {
    const factorial = (n) => {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    };
    
    const combination = factorial(n) / (factorial(i) * factorial(n - i));
    return combination * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

// Surface function using Bézier surface equation
function surfaceFunction(u, v, target) {
    const n = controlPoints.length - 1;
    const m = controlPoints[0].length - 1;
    
    let x = 0, y = 0, z = 0;
    
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= m; j++) {
            const factor = bernstein(n, i, u) * bernstein(m, j, v);
            x += controlPoints[i][j][0] * factor;
            y += controlPoints[i][j][1] * factor;
            z += controlPoints[i][j][2] * factor;
        }
    }
    
    // Add some animated waves
    const time = Date.now() * 0.001;
    const waveHeight = 0.5;
    const waveFreq = 2;
    y += waveHeight * Math.sin(x * waveFreq + time) * Math.cos(z * waveFreq + time);
    
    target.set(x, y, z);
}

// Create parametric surface
const geometry = new ParametricGeometry(surfaceFunction, 50, 50);
const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    flatShading: false,
    shininess: 50
});
const surface = new THREE.Mesh(geometry, material);

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

scene.add(surface);

// Animation loop
let vertices = geometry.attributes.position.array;
let vertexCount = vertices.length;

function animate() {
    requestAnimationFrame(animate);
    
    // Update vertex positions
    const time = Date.now() * 0.001;
    const waveHeight = 0.5;
    const waveFreq = 2;
    
    for (let i = 0; i < vertexCount; i += 3) {
        const x = vertices[i];
        const z = vertices[i + 2];
        const y = waveHeight * Math.sin(x * waveFreq + time) * Math.cos(z * waveFreq + time);
        vertices[i + 1] = y;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    controls.update();
    renderer.render(scene, camera);
}

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
