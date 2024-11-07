import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { createNoise2D } from 'simplex-noise';
import GUI from 'lil-gui';

// Scene setup
const scene = new THREE.Scene();

// Create both cameras
const orbitCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const snowboarderCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Track active camera
let activeCamera = orbitCamera;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add orbit controls (only for orbit camera)
const controls = new OrbitControls(orbitCamera, renderer.domElement);
orbitCamera.position.set(0, 15, 20);
controls.update();

// Initialize noise generator with random seed
let noise2D = createNoise2D();

// Terrain parameters
const params = {
    // Overall settings
    terrainWidth: 20,
    terrainLength: 20,
    resolution: 100,
    baseHeight: 3,
    
    // Mountains
    mountainScale: 0.15,
    mountainHeight: 0.78,
    
    // Hills
    hillScale: 0.4,
    hillHeight: 0.02,
    
    // Rough terrain
    roughScale: 0.8,
    roughHeight: 0.05,
    
    // Material
    wireframe: false,
    flatShading: false,
    color: '#ffffff',

    // Snowboarder settings
    snowboarderHeight: 0.5,
    activeView: 'Orbit View',

    // Motion parameters
    speed: 1.0, // Units per second
    isMoving: true, // Toggle motion
    
    // Function to regenerate geometry with new seed
    regenerate: () => {
        // Create new noise generator with different random seed
        noise2D = createNoise2D();
        updateGeometry();
    }
};

// Add time offset for motion
let timeOffset = 0;

function getTerrainHeight(x, z) {
    // Add timeOffset to z coordinate to create forward motion
    const offsetZ = z + timeOffset;
    
    const mountains = noise2D(x * params.mountainScale, offsetZ * params.mountainScale) * params.mountainHeight;
    const hills = noise2D(x * params.hillScale, offsetZ * params.hillScale) * params.hillHeight;
    const roughness = noise2D(x * params.roughScale, offsetZ * params.roughScale) * params.roughHeight;
    
    return params.baseHeight + mountains + hills + roughness;
}

function surfaceFunction(u, v, target) {
    const x = (u - 0.5) * params.terrainWidth;
    const z = (v - 0.5) * params.terrainLength;
    const y = getTerrainHeight(x, z);
    target.set(x, y, z);
}

const material = new THREE.MeshPhongMaterial({
    color: params.color,
    side: THREE.DoubleSide,
    flatShading: params.flatShading,
    wireframe: params.wireframe,
    shininess: 50
});

let geometry = new ParametricGeometry(surfaceFunction, params.resolution, params.resolution);
const surface = new THREE.Mesh(geometry, material);
scene.add(surface);

// Setup snowboarder camera position
const snowboarderPosition = new THREE.Vector3(0, 0, 0); // Center of the terrain
snowboarderPosition.y = getTerrainHeight(0, 0) + params.snowboarderHeight;
snowboarderCamera.position.copy(snowboarderPosition);
snowboarderCamera.rotation.y = Math.PI; // Face forward (down the slope)
snowboarderCamera.rotation.x = -0.2; // Tilt down slightly

// Add a small marker to show snowboarder position
const snowboarderMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.2),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
snowboarderMarker.position.copy(snowboarderPosition);
scene.add(snowboarderMarker);

// Function to update geometry
function updateGeometry() {
    if (geometry) {
        geometry.dispose();
    }
    
    geometry = new ParametricGeometry(surfaceFunction, params.resolution, params.resolution);
    surface.geometry = geometry;
    
    // Update snowboarder height when terrain changes
    snowboarderPosition.y = getTerrainHeight(snowboarderPosition.x, snowboarderPosition.z) + params.snowboarderHeight;
    snowboarderCamera.position.copy(snowboarderPosition);
    snowboarderMarker.position.copy(snowboarderPosition);
}

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// Setup GUI
const gui = new GUI();

// Terrain dimensions folder
const dimensionsFolder = gui.addFolder('Terrain Dimensions');
dimensionsFolder.add(params, 'terrainWidth', 10, 50).name('Width').onChange(updateGeometry);
dimensionsFolder.add(params, 'terrainLength', 10, 50).name('Length').onChange(updateGeometry);
dimensionsFolder.add(params, 'resolution', 50, 200, 1).name('Resolution').onChange(updateGeometry);
dimensionsFolder.add(params, 'baseHeight', 0, 10).name('Base Height').onChange(updateGeometry);

// Mountain features folder
const mountainFolder = gui.addFolder('Mountains');
mountainFolder.add(params, 'mountainScale', 0.01, 0.5).name('Scale').onChange(updateGeometry);
mountainFolder.add(params, 'mountainHeight', 0, 10).name('Height').onChange(updateGeometry);

// Hill features folder
const hillFolder = gui.addFolder('Hills');
hillFolder.add(params, 'hillScale', 0.1, 1).name('Scale').onChange(updateGeometry);
hillFolder.add(params, 'hillHeight', 0, 5).name('Height').onChange(updateGeometry);

// Rough terrain folder
const roughFolder = gui.addFolder('Small Features');
roughFolder.add(params, 'roughScale', 0.1, 2).name('Scale').onChange(updateGeometry);
roughFolder.add(params, 'roughHeight', 0, 2).name('Height').onChange(updateGeometry);

const motionFolder = gui.addFolder('Motion Controls');
motionFolder.add(params, 'speed', 0, 20).name('Speed');
motionFolder.add(params, 'isMoving').name('Toggle Motion');

const cameraFolder = gui.addFolder('Camera Settings');
cameraFolder.add(params, 'snowboarderHeight', 0.5, 5)
    .name('Snowboarder Height')
    .onChange(() => {
        snowboarderPosition.y = getTerrainHeight(snowboarderPosition.x, snowboarderPosition.z) + params.snowboarderHeight;
        snowboarderCamera.position.copy(snowboarderPosition);
        snowboarderMarker.position.copy(snowboarderPosition);
    });

const visualFolder = gui.addFolder('Visual Settings');
visualFolder.add(params, 'wireframe').onChange(value => {
    material.wireframe = value;
});
visualFolder.add(params, 'flatShading').onChange(value => {
    material.flatShading = value;
    material.needsUpdate = true;
});
visualFolder.addColor(params, 'color').onChange(value => {
    material.color.set(value);
});

// Handle camera switching
document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        activeCamera = (activeCamera === orbitCamera) ? snowboarderCamera : orbitCamera;
        params.activeView = (activeCamera === orbitCamera) ? 'Orbit View' : 'Snowboarder View';
        gui.controllers.forEach(controller => controller.updateDisplay());
    }
});

// Add regenerate button
gui.add(params, 'regenerate').name('Regenerate Terrain');

// Add this before the animation loop
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;
    
    if (params.isMoving) {
        // Update timeOffset based on speed
        timeOffset += params.speed * deltaTime;
        
        // Update geometry for smooth motion
        updateGeometry();
    }
    
    if (activeCamera === orbitCamera) {
        controls.update();
    }
    
    renderer.render(scene, activeCamera);
}

// Handle window resizing
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    
    // Update both cameras
    orbitCamera.aspect = aspect;
    orbitCamera.updateProjectionMatrix();
    
    snowboarderCamera.aspect = aspect;
    snowboarderCamera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
