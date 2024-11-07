import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { createNoise2D } from 'simplex-noise';
import GUI from 'lil-gui';

// Enhanced vertex shader with proper transform and normals
const vertexShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

uniform float curvature;
uniform float curvatureDistance;

void main() {
    vUv = uv;
    
    // Copy positions and apply curve
    vec3 pos = position;
    float dist = max(0.0, pos.z + curvatureDistance);
    pos.y -= pow(dist * curvature, 2.0);
    
    // Transform position into view space
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    
    // Calculate normal by looking at nearby vertices
    // This gives us curved normals for proper lighting
    vec3 tangent = normalize(vec3(1.0, 
        2.0 * dist * curvature * curvature,
        0.0));
    vec3 bitangent = normalize(vec3(0.0,
        2.0 * pos.z * curvature * curvature,
        1.0));
    vNormal = normalize(normalMatrix * normalize(cross(tangent, bitangent)));
    
    gl_Position = projectionMatrix * mvPosition;
}
`;

// Enhanced fragment shader with phong lighting
const fragmentShader = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

uniform vec3 color;
uniform float fogNear;
uniform float fogFar;
uniform vec3 lightPosition;
uniform vec3 ambientColor;
uniform float shininess;

void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightPosition - vViewPosition);
    
    // Ambient
    vec3 ambient = ambientColor;
    
    // Diffuse
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * color;
    
    // Specular
    vec3 viewDir = normalize(vViewPosition);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
    vec3 specular = spec * vec3(1.0);
    
    // Combine lighting
    vec3 finalColor = ambient + diffuse + specular;
    
    // Add fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = smoothstep(fogNear, fogFar, depth);
    finalColor = mix(finalColor, vec3(1.0), fogFactor * 0.6);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

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

    curvature: 0.003,
    curvatureDistance: 10.0,
    fogNear: 1.0,
    fogFar: 50.0,
    
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

// Create custom shader material
const shaderMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        curvature: { value: params.curvature },
        curvatureDistance: { value: params.curvatureDistance },
        fogNear: { value: params.fogNear },
        fogFar: { value: params.fogFar }
    },
    side: THREE.DoubleSide
});

let geometry = new ParametricGeometry(surfaceFunction, params.resolution, params.resolution);
const surface = new THREE.Mesh(geometry, shaderMaterial);
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

// Add curve effect controls to GUI
const curveFolder = gui.addFolder('World Curve Effect');
curveFolder.add(params, 'curvature', 0, 0.01, 0.0001)
    .name('Curvature Amount')
    .onChange(value => {
        shaderMaterial.uniforms.curvature.value = value;
    });
curveFolder.add(params, 'curvatureDistance', 0, 50)
    .name('Curve Distance')
    .onChange(value => {
        shaderMaterial.uniforms.curvatureDistance.value = value;
    });
curveFolder.add(params, 'fogNear', 0, 50)
    .name('Fog Start')
    .onChange(value => {
        shaderMaterial.uniforms.fogNear.value = value;
    });
curveFolder.add(params, 'fogFar', 0, 100)
    .name('Fog End')
    .onChange(value => {
        shaderMaterial.uniforms.fogFar.value = value;
    });

// Function to update material color
function updateMaterialColor(color) {
    shaderMaterial.uniforms.color.value.set(color);
}

// Visual settings folder
const visualFolder = gui.addFolder('Visual Settings');
visualFolder.add(params, 'wireframe').onChange(value => {
    material.wireframe = value;
});
visualFolder.add(params, 'flatShading').onChange(value => {
    material.flatShading = value;
    material.needsUpdate = true;
});
visualFolder.addColor(params, 'color').onChange(updateMaterialColor);

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
