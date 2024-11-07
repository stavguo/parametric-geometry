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
    cameraPitch: -0.3,
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

// Snowboard parameters
const snowboardParams = {
    length: 1.6,
    width: 0.3,
    thickness: 0.05,
    bevelSize: 0.02,  // Size of the rounded edges
    distanceFromCamera: 1.5,
    tilt: 0, // Side-to-side tilt
};

function createSnowboard() {
    const boardShape = new THREE.Shape();
    // Create rounded rectangle shape for the board
    const radius = snowboardParams.width / 2;
    
    // Draw the shape rotated 90 degrees so length is along Z-axis
    boardShape.moveTo(-snowboardParams.width / 2 + radius, -snowboardParams.length / 2);
    boardShape.lineTo(snowboardParams.width / 2 - radius, -snowboardParams.length / 2);
    boardShape.quadraticCurveTo(
        snowboardParams.width / 2,
        -snowboardParams.length / 2,
        snowboardParams.width / 2,
        -snowboardParams.length / 2 + radius
    );
    boardShape.lineTo(snowboardParams.width / 2, snowboardParams.length / 2 - radius);
    boardShape.quadraticCurveTo(
        snowboardParams.width / 2,
        snowboardParams.length / 2,
        snowboardParams.width / 2 - radius,
        snowboardParams.length / 2
    );
    boardShape.lineTo(-snowboardParams.width / 2 + radius, snowboardParams.length / 2);
    boardShape.quadraticCurveTo(
        -snowboardParams.width / 2,
        snowboardParams.length / 2,
        -snowboardParams.width / 2,
        snowboardParams.length / 2 - radius
    );
    boardShape.lineTo(-snowboardParams.width / 2, -snowboardParams.length / 2 + radius);
    boardShape.quadraticCurveTo(
        -snowboardParams.width / 2,
        -snowboardParams.length / 2,
        -snowboardParams.width / 2 + radius,
        -snowboardParams.length / 2
    );

    const extrudeSettings = {
        steps: 1,
        depth: snowboardParams.thickness,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 3
    };

    const geometry = new THREE.ExtrudeGeometry(boardShape, extrudeSettings);

    // Rotate the geometry to lay flat
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshPhongMaterial({
        color: 0x2244ff,
        shininess: 100,
        flatShading: false
    });

    return new THREE.Mesh(geometry, material);
}

const snowboard = createSnowboard();
scene.add(snowboard);

function updateSnowboarderView() {
    // Update camera position and rotation
    snowboarderPosition.y = getTerrainHeight(snowboarderPosition.x, snowboarderPosition.z) + params.snowboarderHeight;
    snowboarderCamera.position.copy(snowboarderPosition);
    snowboarderCamera.rotation.set(params.cameraPitch, Math.PI, 0);
    snowboarderMarker.position.copy(snowboarderPosition);

    // Calculate board center position
    const boardOffset = new THREE.Vector3(0, 0, -snowboardParams.distanceFromCamera);
    boardOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const boardCenter = snowboarderPosition.clone().add(boardOffset);

    // Get primary directions relative to board orientation
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const right = new THREE.Vector3(1, 0, 0);

    // Calculate the true bottom points, accounting for thickness and bevel
    const halfLength = snowboardParams.length / 2;
    const halfWidth = snowboardParams.width / 2;
    const bottomOffset = -(snowboardParams.thickness + snowboardParams.bevelSize) / 2;
    const down = new THREE.Vector3(0, bottomOffset, 0);
    
    // Add a small outward offset to account for rounded edges
    const edgeOffset = snowboardParams.bevelSize;
    
    const sampleOffsets = [
        // Front-right bottom corner (including bevel offset)
        forward.clone().multiplyScalar(halfLength + edgeOffset)
            .add(right.clone().multiplyScalar(halfWidth + edgeOffset))
            .add(down),
        
        // Front-left bottom corner
        forward.clone().multiplyScalar(halfLength + edgeOffset)
            .add(right.clone().multiplyScalar(-(halfWidth + edgeOffset)))
            .add(down),
        
        // Back-right bottom corner
        forward.clone().multiplyScalar(-(halfLength + edgeOffset))
            .add(right.clone().multiplyScalar(halfWidth + edgeOffset))
            .add(down),
        
        // Back-left bottom corner
        forward.clone().multiplyScalar(-(halfLength + edgeOffset))
            .add(right.clone().multiplyScalar(-(halfWidth + edgeOffset)))
            .add(down),
        
        // Center bottom point
        down
    ];

    // Sample heights at all five points
    const sampleHeights = sampleOffsets.map(offset => {
        const samplePos = boardCenter.clone().add(offset);
        return getTerrainHeight(samplePos.x, samplePos.z);
    });

    // Find highest sampled height and add back the bottom offset to position the center correctly
    const maxHeight = Math.max(...sampleHeights) - bottomOffset;
    
    // Position board center
    boardCenter.y = maxHeight;
    snowboard.position.copy(boardCenter);

    // Calculate terrain normal at center point for overall orientation
    const epsilon = 0.1;
    const centerHeight = sampleHeights[4]; // Use the sampled center height
    const forwardHeight = getTerrainHeight(boardCenter.x, boardCenter.z + epsilon);
    const rightHeight = getTerrainHeight(boardCenter.x + epsilon, boardCenter.z);
    
    const forwardSlope = new THREE.Vector3(0, forwardHeight - centerHeight, epsilon).normalize();
    const rightSlope = new THREE.Vector3(epsilon, rightHeight - centerHeight, 0).normalize();
    const normal = rightSlope.cross(forwardSlope).normalize();

    // Apply terrain-based orientation
    const alignMatrix = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        forwardSlope,
        normal
    );
    snowboard.quaternion.setFromRotationMatrix(alignMatrix);
    
    // Apply side tilt last
    snowboard.rotateZ(snowboardParams.tilt);
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add orbit controls (only for orbit camera)
const controls = new OrbitControls(orbitCamera, renderer.domElement);
orbitCamera.position.set(0, 15, 20);
controls.update();

// Initialize noise generator with random seed
let noise2D = createNoise2D();


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

    // Add snowboard update
    updateSnowboarderView();
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
    .onChange(updateSnowboarderView);
cameraFolder.add(params, 'cameraPitch', -0.8, 0.8)
    .name('Camera Pitch')
    .onChange(updateSnowboarderView);

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

const snowboardFolder = gui.addFolder('Snowboard Settings');
snowboardFolder.add(snowboardParams, 'distanceFromCamera', 0.5, 3)
    .name('Distance from Camera')
    .onChange(updateSnowboarderView);
snowboardFolder.add(snowboardParams, 'tilt', -0.5, 0.5)
    .name('Board Tilt')
    .onChange(updateSnowboarderView);

// Handle camera switching
document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC') {
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

    // Update snowboard position and rotation
    updateSnowboarderView();
    
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
