import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ========== SCENE SETUP ==========
const canvas = document.getElementById('canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Camera
const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(5, 3, 5);

// Renderer
const renderer = new THREE.WebGLRenderer({ 
    canvas, 
    antialias: true,
    preserveDrawingBuffer: true // For screenshots
});
renderer.setSize(window.innerWidth - 320, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const mainLight = new THREE.DirectionalLight(0xffffff, 1);
mainLight.position.set(5, 5, 5);
mainLight.castShadow = true;
scene.add(mainLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Helpers
const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// ========== STATE ==========
let currentModel = null;
let currentMode = 'default';
let originalMaterials = new Map();
let modelInfo = {
    vertices: 0,
    triangles: 0,
    meshes: 0,
    materials: 0,
    dimensions: { x: 0, y: 0, z: 0 },
    fileSize: 0
};

// ========== LOADERS ==========
const gltfLoader = new GLTFLoader();

// ========== UI ELEMENTS ==========
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const infoPanel = document.getElementById('info-panel');
const perfPanel = document.getElementById('perf-panel');

// ========== FILE UPLOAD ==========
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadModelFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadModelFile(file);
});

function loadModelFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['glb', 'gltf', 'obj', 'fbx'].includes(ext)) {
        alert('Unsupported format! Use .glb, .gltf, .obj, or .fbx');
        return;
    }

    modelInfo.fileSize = file.size;
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Loading: 0%';

    const url = URL.createObjectURL(file);

    if (ext === 'glb' || ext === 'gltf') {
        gltfLoader.load(
            url,
            (gltf) => onModelLoaded(gltf.scene),
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(0);
                progressFill.style.width = percent + '%';
                progressText.textContent = `Loading: ${percent}%`;
            },
            (error) => {
                console.error('Error loading model:', error);
                alert('Error loading model!');
                progressContainer.classList.add('hidden');
            }
        );
    } else {
        // For OBJ/FBX - would need additional loaders
        alert('OBJ/FBX support coming soon! Use GLB/GLTF for now.');
        progressContainer.classList.add('hidden');
    }
}

function onModelLoaded(model) {
    // Remove old model
    if (currentModel) {
        scene.remove(currentModel);
    }

    currentModel = model;
    scene.add(currentModel);

    // Analyze model
    analyzeModel(model);

    // Auto-fit camera
    fitCameraToModel(model);

    // Hide progress, show panels
    progressContainer.classList.add('hidden');
    infoPanel.classList.remove('hidden');
    perfPanel.classList.remove('hidden');

    // Update UI
    updateModelInfo();
    calculatePerformance();
    applyRenderMode(currentMode);
}

function analyzeModel(model) {
    modelInfo = {
        vertices: 0,
        triangles: 0,
        meshes: 0,
        materials: 0,
        dimensions: { x: 0, y: 0, z: 0 },
        fileSize: modelInfo.fileSize
    };

    const materials = new Set();
    originalMaterials.clear();

    model.traverse((child) => {
        if (child.isMesh) {
            modelInfo.meshes++;
            
            const geometry = child.geometry;
            if (geometry) {
                const posAttr = geometry.attributes.position;
                if (posAttr) {
                    modelInfo.vertices += posAttr.count;
                }
                if (geometry.index) {
                    modelInfo.triangles += geometry.index.count / 3;
                } else if (posAttr) {
                    modelInfo.triangles += posAttr.count / 3;
                }
            }

            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => materials.add(mat.uuid));
                originalMaterials.set(child.uuid, child.material.clone());
            }
        }
    });

    modelInfo.materials = materials.size;

    // Calculate dimensions
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    modelInfo.dimensions = { x: size.x, y: size.y, z: size.z };
}

function fitCameraToModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    
    box.getCenter(center);
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Zoom out a bit
    
    camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.5, center.z + cameraZ);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}

function updateModelInfo() {
    document.getElementById('info-vertices').textContent = modelInfo.vertices.toLocaleString();
    document.getElementById('info-triangles').textContent = Math.floor(modelInfo.triangles).toLocaleString();
    document.getElementById('info-meshes').textContent = modelInfo.meshes;
    document.getElementById('info-materials').textContent = modelInfo.materials;
    document.getElementById('info-dimensions').textContent = 
        `${modelInfo.dimensions.x.toFixed(2)} × ${modelInfo.dimensions.y.toFixed(2)} × ${modelInfo.dimensions.z.toFixed(2)}`;
}

function calculatePerformance() {
    const fileSizeMB = (modelInfo.fileSize / (1024 * 1024)).toFixed(2);
    const triangles = Math.floor(modelInfo.triangles);
    
    // Simple performance scoring (0-100)
    let score = 100;
    
    // Penalize high triangle count
    if (triangles > 100000) score -= 30;
    else if (triangles > 50000) score -= 15;
    else if (triangles > 20000) score -= 5;
    
    // Penalize large file size
    if (fileSizeMB > 10) score -= 25;
    else if (fileSizeMB > 5) score -= 15;
    else if (fileSizeMB > 2) score -= 5;
    
    // Penalize high mesh count
    if (modelInfo.meshes > 50) score -= 10;
    
    score = Math.max(0, Math.min(100, score));
    
    // Update UI
    const scoreEl = document.getElementById('perf-score');
    const statusEl = document.getElementById('perf-status');
    scoreEl.textContent = score;
    
    if (score >= 80) {
        scoreEl.style.color = '#4caf50';
        statusEl.textContent = 'Good Performance';
        statusEl.style.color = '#4caf50';
    } else if (score >= 55) {
        scoreEl.style.color = '#ff9800';
        statusEl.textContent = 'Moderate Performance';
        statusEl.style.color = '#ff9800';
    } else {
        scoreEl.style.color = '#f44336';
        statusEl.textContent = 'Poor Performance';
        statusEl.style.color = '#f44336';
    }
    
    document.getElementById('perf-filesize').textContent = fileSizeMB + ' MB';
    document.getElementById('perf-texmem').textContent = (fileSizeMB * 1.5).toFixed(2) + ' MB';
    document.getElementById('perf-triangles').textContent = triangles.toLocaleString();
    
    // Optimization tips
    let tip = '💡 ';
    if (triangles > 50000) {
        tip += 'Consider reducing polygon count for better performance.';
    } else if (fileSizeMB > 5) {
        tip += 'Try compressing textures to reduce file size.';
    } else if (modelInfo.meshes > 30) {
        tip += 'Combine meshes to reduce draw calls.';
    } else {
        tip += 'Model is well optimized!';
    }
    document.getElementById('perf-tip').textContent = tip;
}

// ========== RENDER MODES ==========
const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        currentMode = mode;
        
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        applyRenderMode(mode);
    });
});

function applyRenderMode(mode) {
    if (!currentModel) return;

    currentModel.traverse((child) => {
        if (child.isMesh) {
            const originalMat = originalMaterials.get(child.uuid);
            
            switch(mode) {
                case 'default':
                    child.material = originalMat.clone();
                    break;
                    
                case 'wireframe':
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0x00ff00,
                        wireframe: true
                    });
                    break;
                    
                case 'normals':
                    child.material = new THREE.MeshNormalMaterial();
                    break;
                    
                case 'uv':
                    const uvTexture = createCheckerTexture();
                    child.material = new THREE.MeshBasicMaterial({
                        map: uvTexture
                    });
                    break;
                    
                case 'unlit':
                    child.material = new THREE.MeshBasicMaterial({
                        color: originalMat.color || 0xcccccc
                    });
                    break;
            }
        }
    });
}

function createCheckerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    const size = 64;
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(x * size, y * size, size, size);
        }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

// ========== LIGHTING CONTROLS ==========
const mainIntensity = document.getElementById('main-intensity');
const mainIntensityVal = document.getElementById('main-intensity-val');
const mainColor = document.getElementById('main-color');
const mainReset = document.getElementById('main-reset');

mainIntensity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    mainLight.intensity = val;
    mainIntensityVal.textContent = val.toFixed(1);
});

mainColor.addEventListener('input', (e) => {
    mainLight.color.set(e.target.value);
});

mainReset.addEventListener('click', () => {
    mainLight.intensity = 1;
    mainLight.color.set(0xffffff);
    mainIntensity.value = 1;
    mainIntensityVal.textContent = '1.0';
    mainColor.value = '#ffffff';
});

const ambientIntensity = document.getElementById('ambient-intensity');
const ambientIntensityVal = document.getElementById('ambient-intensity-val');
const ambientColor = document.getElementById('ambient-color');
const ambientReset = document.getElementById('ambient-reset');

ambientIntensity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    ambientLight.intensity = val;
    ambientIntensityVal.textContent = val.toFixed(2);
});

ambientColor.addEventListener('input', (e) => {
    ambientLight.color.set(e.target.value);
});

ambientReset.addEventListener('click', () => {
    ambientLight.intensity = 0.5;
    ambientLight.color.set(0xffffff);
    ambientIntensity.value = 0.5;
    ambientIntensityVal.textContent = '0.50';
    ambientColor.value = '#ffffff';
});

// ========== CAMERA PRESETS ==========
const cameraButtons = document.querySelectorAll('[data-preset]');
cameraButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        setCameraPreset(preset);
    });
});

function setCameraPreset(preset) {
    const target = controls.target.clone();
    const distance = camera.position.distanceTo(target);
    
    switch(preset) {
        case 'front':
            camera.position.set(target.x, target.y, target.z + distance);
            break;
        case 'side':
            camera.position.set(target.x + distance, target.y, target.z);
            break;
        case 'top':
            camera.position.set(target.x, target.y + distance, target.z);
            break;
        case 'perspective':
            camera.position.set(
                target.x + distance * 0.7,
                target.y + distance * 0.5,
                target.z + distance * 0.7
            );
            break;
    }
    
    camera.lookAt(target);
    controls.update();
}

// ========== HELPERS ==========
document.getElementById('grid-helper').addEventListener('change', (e) => {
    gridHelper.visible = e.target.checked;
});

document.getElementById('axes-helper').addEventListener('change', (e) => {
    axesHelper.visible = e.target.checked;
});

// ========== SCREENSHOT ==========
document.getElementById('screenshot-btn').addEventListener('click', () => {
    renderer.render(scene, camera);
    
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `model-screenshot-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
    });
});

// ========== RESIZE ==========
window.addEventListener('resize', () => {
    const width = window.innerWidth - 320;
    const height = window.innerHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
});

// ========== ANIMATION LOOP ==========
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();

console.log('3D Model Viewer Ready!');
