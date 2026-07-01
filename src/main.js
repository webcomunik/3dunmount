import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as fflate from 'fflate';

// Assign fflate to window for ThreeMFLoader compatibility
window.fflate = fflate;

// ==========================================
// STATE MANAGEMENT & CONSTANTS
// ==========================================
let currentUser = null;
let currentFile = null;
let loadedModelRawData = null; // Base64 string of the loaded model file
let loadedModelName = "";
let loadedModelExt = "";

// Three.js instances
let scene, camera, renderer, controls;
let gridHelper;
let transformControls;        // Translation gizmo
let activeMesh = null;        // Original single mesh
let originalGeometry = null;  // Clone of the loaded geometry (unpainted)
let splitMeshes = [];         // Array of meshes created after splitting
let selectedSplitMesh = null; // Currently selected split part
let isSplit = false;          // Whether the model is currently split

// Scene lighting
let dirLight, dirLight2, ambientLight;

// Brush state
let toolMode = 'brush'; // 'brush' or 'polygon'
let brushSize = 15;
let activeColor = '#8b5cf6';
let isEraseMode = false;
let isPainting = false;
let brushIndicator = null;
let modelRadius = 1.0;

// Polygon / Circle mask state
let maskShapeType = 'polygon'; // 'polygon' or 'circle'
let polyPoints = [];
let isDraggingHandle = false;
let activeHandleIdx = -1;
let circleCenter = { x: 0, y: 0 };
let circleRadius = 50;
let isDraggingCenter = false;
let isDraggingRadius = false;

// Photo projection state
let originalProjectionImage = null; // Store raw uploaded photo
let projectionImage = null; // Processed or raw HTMLImageElement
let isPhotoLoaded = false;

// Color presets
const PRESET_COLORS = [
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f59e0b', // Orange
  '#eab308', // Yellow
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#059669', // Dark green
  '#475569'  // Slate
];

// Raycaster for brush paint & hover
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ==========================================
// DOM ELEMENTS
// ==========================================
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const btnLogout = document.getElementById('btn-logout');
const userDisplayName = document.getElementById('user-display-name');
const avatarLetters = document.getElementById('avatar-letters');

// Files & Upload
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileBadgeContainer = document.getElementById('file-badge-container');

// Modes
const modeBrushBtn = document.getElementById('mode-brush');
const modePolygonBtn = document.getElementById('mode-polygon');
const modeMoveBtn = document.getElementById('mode-move');

// Panels
const brushSettingsPanel = document.getElementById('brush-settings-panel');
const polygonSettingsPanel = document.getElementById('polygon-settings-panel');

// Brush Controls
const brushSizeSlider = document.getElementById('brush-size');
const brushSizeVal = document.getElementById('brush-size-val');
const colorPresetsContainer = document.getElementById('color-presets');
const customColorPicker = document.getElementById('custom-color');
const eraseToggle = document.getElementById('erase-toggle');

// Polygon Controls
const polygonOverlay = document.getElementById('polygon-overlay');
const polygonPath = document.getElementById('polygon-path');
const polygonHandlesGroup = document.getElementById('polygon-handles-group');
const btnPolyFill = document.getElementById('btn-poly-fill');
const btnPolyReset = document.getElementById('btn-poly-reset');
const selectPolyShapeType = document.getElementById('poly-shape-type');

// Photo Projection Selectors
const btnTriggerUploadPhoto = document.getElementById('btn-trigger-upload-photo');
const photoFileInput = document.getElementById('photo-file-input');
const photoControlPanel = document.getElementById('photo-control-panel');
const photoOpacitySlider = document.getElementById('photo-opacity-slider');
const photoOpacityVal = document.getElementById('photo-opacity-val');
const btnProjectPhoto = document.getElementById('btn-project-photo');
const btnClearPhoto = document.getElementById('btn-clear-photo');
const imageProjectionOverlay = document.getElementById('image-projection-overlay');
const photoQuantizeCheck = document.getElementById('photo-quantize-check');

// Action Buttons
const btnSaveProject = document.getElementById('btn-save-project');
const btnSmoothPaint = document.getElementById('btn-smooth-paint');
const btnSplitMesh = document.getElementById('btn-split-mesh');
const btnResetMesh = document.getElementById('btn-reset-mesh');

// Model Orientation Controls
const btnRotX = document.getElementById('btn-rot-x');
const btnRotY = document.getElementById('btn-rot-y');
const btnRotZ = document.getElementById('btn-rot-z');
const btnAutoAlign = document.getElementById('btn-auto-align');

// Model Position Controls
const positionSettingsPanel = document.getElementById('position-settings-panel');
const inputPosX = document.getElementById('pos-x');
const inputPosY = document.getElementById('pos-y');
const inputPosZ = document.getElementById('pos-z');
const sliderPosX = document.getElementById('slider-pos-x');
const sliderPosY = document.getElementById('slider-pos-y');
const sliderPosZ = document.getElementById('slider-pos-z');
const btnResetPos = document.getElementById('btn-reset-pos');

// Floating Viewport Controls
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');

// Right Sidebar (Split Parts)
const rightSidebar = document.getElementById('right-sidebar');
const workspaceLayout = document.getElementById('workspace-layout');
const splitPartsList = document.getElementById('split-parts-list');
const splitPartsCount = document.getElementById('split-parts-count');
const btnDownloadAll = document.getElementById('btn-download-all');
const btnMergeBack = document.getElementById('btn-merge-back');

// Loading Screen
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const loadingProgressBar = document.getElementById('loading-progress-bar');

// Viewport Overlays
const canvasContainer = document.getElementById('canvas-container');
const workbenchIndicator = document.getElementById('workbench-indicator');
const workbenchStatusText = document.getElementById('workbench-status-text');

// ==========================================
// TOAST ALERTS SYSTEM
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon based on type
  let iconPath = '';
  if (type === 'success') {
    iconPath = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
  } else if (type === 'error') {
    iconPath = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
  } else if (type === 'warning') {
    iconPath = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z';
  } else {
    // Info
    iconPath = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
  }

  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24">
      <path d="${iconPath}"/>
    </svg>
    <div class="toast-content">${message}</div>
    <div class="toast-close">&times;</div>
  `;
  
  container.appendChild(toast);
  
  // Close handler
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 250);
  });
  
  // Auto remove (only for non-error alerts to let users copy stack traces if needed)
  if (type !== 'error') {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 250);
      }
    }, 4500);
  }
}

// ==========================================
// MOCK AUTHENTICATION SYSTEM
// ==========================================
function checkAuth() {
  const loggedIn = localStorage.getItem('studio_logged_in') === 'true';
  const savedUser = localStorage.getItem('studio_username') || 'designer';
  
  if (loggedIn) {
    currentUser = savedUser;
    userDisplayName.textContent = currentUser;
    avatarLetters.textContent = currentUser.slice(0, 2).toUpperCase();
    
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    
    initThreeJS();
    showToast(`Welcome back, ${currentUser}!`, 'success');
  } else {
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
  }
}

loginForm.addEventListener('submit', () => {
  const username = usernameInput.value.trim();
  if (username) {
    localStorage.setItem('studio_logged_in', 'true');
    localStorage.setItem('studio_username', username);
    checkAuth();
  }
});

btnLogout.addEventListener('click', () => {
  localStorage.setItem('studio_logged_in', 'false');
  localStorage.removeItem('studio_username');
  currentUser = null;
  
  // Cleanup Three.js references
  if (renderer) {
    renderer.dispose();
  }
  
  checkAuth();
  showToast('Logged out successfully', 'info');
});

// ==========================================
// THREE.JS VIEWPORT INITIALIZATION
// ==========================================
function initThreeJS() {
  // Dispose of old renderer if it exists to free the WebGL context and forcefully lose it
  if (renderer) {
    renderer.dispose();
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) {}
    renderer = null;
  }
  if (window.__threeRenderer) {
    window.__threeRenderer.dispose();
    try {
      const gl = window.__threeRenderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (e) {}
    window.__threeRenderer = null;
  }

  // Clear any previous canvas
  canvasContainer.innerHTML = '';
  
  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#070a13'); // solid background matching theme to prevent compositing flicker
  
  // Camera
  camera = new THREE.PerspectiveCamera(
    45, 
    canvasContainer.clientWidth / canvasContainer.clientHeight, 
    0.1, 
    1000
  );
  camera.position.set(0, 50, 100);
  
  // Renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    window.__threeRenderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasContainer.appendChild(renderer.domElement);
  } catch (rendererError) {
    console.error("WebGL Context Creation Failed:", rendererError);
    canvasContainer.innerHTML = `
      <div class="webgl-error-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #ef4444; padding: 20px; text-align: center; font-family: sans-serif;">
        <svg style="width: 64px; height: 64px; margin-bottom: 15px; fill: #ef4444;" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600;">WebGL Context Creation Failed</h3>
        <p style="color: #94a3b8; max-width: 450px; margin: 0; font-size: 14px; line-height: 1.6;">
          Your browser has temporarily blocked or disabled WebGL context creation (GL_RENDERER = Disabled). 
          Please <strong>restart your browser</strong> (or verify that Hardware Acceleration is enabled in browser settings) to restore 3D functionality.
        </p>
      </div>
    `;
    showToast("WebGL Context Creation Failed. Please restart your browser.", "error");
    return;
  }
  
  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI * 0.95; // don't go fully under
  
  // Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(40, 100, 40);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);
  
  dirLight2 = new THREE.DirectionalLight(0xa78bfa, 0.4); // soft purple back fill light
  dirLight2.position.set(-40, -20, -40);
  scene.add(dirLight2);
  
  // Grid Helper
  gridHelper = new THREE.GridHelper(100, 40, 0x4f46e5, 0x1e293b);
  gridHelper.position.y = -10;
  scene.add(gridHelper);

  // Transform Controls (for moving objects)
  transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.size = 0.75;
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
  });
  transformControls.addEventListener('change', () => {
    const target = transformControls.object;
    if (target) {
      updateSidebarPositionValues(target.position);
    }
  });
  scene.add(transformControls);
  
  // Brush Indicator (visual helper sphere)
  const indicatorGeom = new THREE.SphereGeometry(1, 16, 16);
  const indicatorMat = new THREE.MeshBasicMaterial({
    color: 0xec4899,
    wireframe: true,
    transparent: true,
    opacity: 0.8,
    depthTest: false // always render on top
  });
  brushIndicator = new THREE.Mesh(indicatorGeom, indicatorMat);
  brushIndicator.visible = false;
  scene.add(brushIndicator);
  
  // Start Animation Loop
  animate();
  
  // Handle Resize
  window.addEventListener('resize', onWindowResize);
}

function animate() {
  requestAnimationFrame(animate);
  
  if (controls && controls.enabled) {
    controls.update();
  }
  
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  if (!camera || !renderer || !canvasContainer) return;
  
  camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera.updateProjectionMatrix();
  
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  
  if (toolMode === 'polygon') {
    // If window resizes, redraw the polygon to fit coordinates
    drawPolygonSVG();
  }
}

// ==========================================
// FILE UPLOADER & LOADER SUBSYSTEM
// ==========================================
function showLoading(text, percent = 0) {
  loadingOverlay.classList.add('active');
  loadingText.textContent = text;
  loadingProgressBar.style.width = `${percent}%`;
}

function hideLoading() {
  loadingOverlay.classList.remove('active');
}

// Setup drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleLoadedFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    handleLoadedFile(files[0]);
  }
});

function handleLoadedFile(file) {
  if (!renderer) {
    showToast("Cannot load model: WebGL is not available. Please restart your browser.", "error");
    return;
  }
  const extension = file.name.split('.').pop().toLowerCase();
  
  if (extension === 'json') {
    loadProjectFile(file);
    return;
  }
  
  if (!['stl', 'obj', '3mf'].includes(extension)) {
    showToast('Unsupported file type. Use .stl, .obj, .3mf, or .json project files', 'error');
    return;
  }
  
  currentFile = file;
  loadedModelName = file.name;
  loadedModelExt = extension;
  
  // Show badge in sidebar
  fileBadgeContainer.innerHTML = `
    <div class="file-info-badge">
      <div class="file-info-name" title="${file.name}">${file.name}</div>
      <div class="file-info-remove" id="btn-remove-file">&times;</div>
    </div>
  `;
  
  document.getElementById('btn-remove-file').addEventListener('click', () => {
    unloadMesh();
    currentFile = null;
    loadedModelRawData = null;
    loadedModelName = "";
    loadedModelExt = "";
    fileBadgeContainer.innerHTML = '';
    fileInput.value = '';
    showToast('Model removed', 'info');
  });
  
  showLoading(`Reading file...`, 15);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const arrayBuffer = e.target.result;
    
    // Store raw model base64 data for project saving
    loadedModelRawData = arrayBufferToBase64(arrayBuffer);
    
    showLoading(`Parsing geometry...`, 50);
    setTimeout(() => {
      parseAndLoadModel(arrayBuffer, extension, () => {
        hideLoading();
        showToast("Model loaded successfully!", "success");
      });
    }, 50);
  };
  reader.readAsArrayBuffer(file);
}

function parseAndLoadModel(arrayBuffer, ext, callback) {
  let loader;
  let parsedObj;
  
  try {
    if (ext === 'stl') {
      loader = new STLLoader();
      parsedObj = loader.parse(arrayBuffer);
    } else if (ext === 'obj') {
      loader = new OBJLoader();
      const text = new TextDecoder().decode(arrayBuffer);
      parsedObj = loader.parse(text);
    } else if (ext === '3mf') {
      loader = new ThreeMFLoader();
      parsedObj = loader.parse(arrayBuffer);
    }
    
    setupLoadedMesh(parsedObj, ext);
    if (callback) callback();
  } catch (err) {
    console.error(err);
    showToast(`Failed to parse model: ${err.message}<br><small style="font-family:monospace; opacity:0.8; display:block; margin-top:5px; max-height:150px; overflow-y:auto; white-space:pre-wrap; text-align:left;">${err.stack || ''}</small>`, 'error');
    hideLoading();
  }
}

function createPlatformDisc(radius) {
  const group = new THREE.Group();
  group.name = "movementPlatform";
  
  // 1. Central disc (flat cylinder)
  const discGeom = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, radius * 0.015, 32);
  const discMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.35,
    roughness: 0.3,
    metalness: 0.7,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const disc = new THREE.Mesh(discGeom, discMat);
  disc.receiveShadow = true;
  group.add(disc);
  
  // 2. Outer glowing ring
  const ringGeom = new THREE.RingGeometry(radius * 0.24, radius * 0.26, 32);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  group.add(ring);
  
  // Shift slightly down to sit just below bottom faces and avoid z-fighting
  group.position.y = -0.005; 
  
  return group;
}

function setupLoadedMesh(loadedObj, ext) {
  showLoading("Preparing 3D geometry...", 90);
  
  // Clean previous meshes
  unloadMesh();
  
  let geometry;
  
  if (ext === 'stl') {
    // STLLoader returns a BufferGeometry
    geometry = loadedObj;
  } else {
    // OBJ and 3MF loaders return a Group containing meshes
    // We need to traverse the group and merge children into a single geometry
    const geometries = [];
    loadedObj.traverse((child) => {
      if (child.isMesh) {
        let childGeom = child.geometry.clone();
        
        // Ensure child geometry is non-indexed for proper vertex mapping
        if (childGeom.index) {
          childGeom = childGeom.toNonIndexed();
        }
        
        // Apply matrix transforms relative to the group root
        child.updateMatrixWorld(true);
        childGeom.applyMatrix4(child.matrixWorld);
        
        // Clean attributes: keep ONLY position and normal to ensure mergeGeometries succeeds!
        const keys = Object.keys(childGeom.attributes);
        keys.forEach(key => {
          if (key !== 'position' && key !== 'normal') {
            childGeom.deleteAttribute(key);
          }
        });
        
        // Ensure normals exist
        if (!childGeom.attributes.normal) {
          childGeom.computeVertexNormals();
        }
        
        geometries.push(childGeom);
      }
    });
    
    if (geometries.length === 0) {
      throw new Error("No mesh geometries found in the uploaded file.");
    }
    
    // Merge geometries
    geometry = BufferGeometryUtils.mergeGeometries(geometries, false);
    if (!geometry) {
      throw new Error("Failed to merge model geometries. The file structure might be unsupported or contain incompatible geometries.");
    }
  }
  
  // CRITICAL: Convert geometry to Non-Indexed to guarantee sharp face color boundaries!
  if (geometry.index) {
    geometry = geometry.toNonIndexed();
  }
  
  // Center and normalize geometry bounding box
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  
  if (!geometry.boundingSphere) {
    geometry.computeBoundingSphere();
  }
  
  modelRadius = geometry.boundingSphere ? geometry.boundingSphere.radius : 1.0;
  if (!modelRadius || isNaN(modelRadius)) {
    modelRadius = 1.0;
  }
  
  // Center the model in X/Z, but offset Y so bottom rests at Y = 0
  geometry.center();
  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  const min = geometry.boundingBox.min;
  geometry.translate(0, -min.y, 0);
  
  // Initialize vertex colors with white (1.0, 1.0, 1.0)
  const positionAttr = geometry.attributes.position;
  const colors = new Float32Array(positionAttr.count * 3);
  colors.fill(1.0); // fill white
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  // Store a clone of the original unpainted geometry for easy resets
  originalGeometry = geometry.clone();
  
  // Create beautiful material
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  
  // Create primary mesh
  activeMesh = new THREE.Mesh(geometry, material);
  activeMesh.castShadow = true;
  activeMesh.receiveShadow = true;
  scene.add(activeMesh);
  
  // Create and add Movement Platform anchor disc
  const platform = createPlatformDisc(modelRadius);
  if (platform) {
    activeMesh.add(platform);
    platform.visible = (toolMode === 'move');
  }
  
  // Frame camera to look at the model bounds (centered around height midpoint)
  camera.position.set(0, modelRadius * 1.8, modelRadius * 2.2);
  camera.lookAt(0, modelRadius, 0);
  if (controls) {
    controls.target.set(0, modelRadius, 0);
    controls.update();
  }
  
  // Reposition grid helper at Y = 0
  scene.remove(gridHelper);
  gridHelper = new THREE.GridHelper(modelRadius * 5, 50, 0x4f46e5, 0x1e293b);
  gridHelper.position.y = 0;
  scene.add(gridHelper);
  
  // Adjust brush indicator scale relative to model radius
  updateBrushIndicatorScale();
  
  // Enable buttons
  btnSaveProject.disabled = false;
  btnSmoothPaint.disabled = false;
  btnSplitMesh.disabled = false;
  btnResetMesh.disabled = false;
  btnRotX.disabled = false;
  btnRotY.disabled = false;
  btnRotZ.disabled = false;
  btnAutoAlign.disabled = false;
  
  // Initialize position slider limits and default values
  updatePositionSlidersRange(modelRadius);
  updateSidebarPositionValues(activeMesh.position);
  
  hideLoading();
  showToast("Model loaded successfully!", "success");
}

function unloadMesh() {
  if (transformControls) {
    transformControls.detach();
    transformControls.visible = false;
  }
  selectedSplitMesh = null;

  if (activeMesh) {
    scene.remove(activeMesh);
    if (activeMesh.geometry) activeMesh.geometry.dispose();
    activeMesh = null;
  }
  if (originalGeometry) {
    originalGeometry.dispose();
    originalGeometry = null;
  }
  
  // Clear any split meshes
  clearSplitMeshes();
  
  // Reset buttons
  btnSaveProject.disabled = true;
  btnSmoothPaint.disabled = true;
  btnSplitMesh.disabled = true;
  btnResetMesh.disabled = true;
  btnRotX.disabled = true;
  btnRotY.disabled = true;
  btnRotZ.disabled = true;
  btnAutoAlign.disabled = true;
  if (brushIndicator) {
    brushIndicator.visible = false;
  }
}

function clearSplitMeshes() {
  if (transformControls) {
    transformControls.detach();
    transformControls.visible = false;
  }
  selectedSplitMesh = null;

  splitMeshes.forEach((mesh) => {
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
  });
  splitMeshes = [];
  isSplit = false;
  
  // Collapse right sidebar UI
  workspaceLayout.classList.remove('right-active');
  splitPartsList.innerHTML = '';
  
  // Restore original mesh visibility if hidden
  if (activeMesh) {
    activeMesh.visible = true;
  }
}

// ==========================================
// COLOR SWATCH PALETTE
// ==========================================
function renderColorPalette() {
  colorPresetsContainer.innerHTML = '';
  
  PRESET_COLORS.forEach((color, idx) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    if (color === activeColor && !isEraseMode) {
      swatch.classList.add('active');
    }
    
    swatch.addEventListener('click', () => {
      // Deactivate erase mode
      isEraseMode = false;
      eraseToggle.checked = false;
      
      // Update active color
      activeColor = color;
      customColorPicker.value = color;
      
      // Toggle active states on presets
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      
      // Update brush indicator color
      brushIndicator.material.color.set(color);
      
      showToast(`Selected color: ${color}`, 'info');
    });
    
    colorPresetsContainer.appendChild(swatch);
  });
}

// Custom color picker handler
customColorPicker.addEventListener('input', (e) => {
  isEraseMode = false;
  eraseToggle.checked = false;
  
  activeColor = e.target.value;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  
  brushIndicator.material.color.set(activeColor);
});

// Erase Switch handler
eraseToggle.addEventListener('change', (e) => {
  isEraseMode = e.target.checked;
  if (isEraseMode) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    brushIndicator.material.color.set('#ef4444'); // red indicator for erase
    showToast('Eraser active (restores white background)', 'warning');
  } else {
    brushIndicator.material.color.set(activeColor);
    renderColorPalette(); // re-highlight active preset
    showToast('Painter active', 'info');
  }
  updateWorkbenchStatusText();
});

// ==========================================
// BRUSH SIZE & INDICATOR
// ==========================================
brushSizeSlider.addEventListener('input', (e) => {
  brushSize = parseInt(e.target.value);
  brushSizeVal.textContent = `${brushSize} px`;
  updateBrushIndicatorScale();
});

function updateBrushIndicatorScale() {
  if (!brushIndicator) return;
  
  // Dynamic scale: brush size ratio is relative to viewport screen space,
  // we map it to 3D world space relative to the model radius.
  const brushRatio = brushSize / 250;
  const radius = brushRatio * modelRadius;
  
  brushIndicator.scale.set(radius, radius, radius);
}

function updateBrushIndicator(e) {
  if (!renderer || toolMode !== 'brush' || !activeMesh || isSplit) {
    if (brushIndicator) brushIndicator.visible = false;
    return;
  }
  
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(activeMesh);
  
  if (intersects.length > 0) {
    const intersect = intersects[0];
    if (brushIndicator) {
      brushIndicator.position.copy(intersect.point);
      brushIndicator.visible = true;
    }
  } else {
    if (brushIndicator) brushIndicator.visible = false;
  }
}

// ==========================================
// INTERACTIVE BRUSH PAINTING
// ==========================================
canvasContainer.addEventListener('pointerdown', (e) => {
  if (isSplit && toolMode === 'move') {
    selectSplitMeshAtMouse(e);
    return;
  }
  if (toolMode !== 'brush' || !activeMesh || isSplit) return;
  if (e.button !== 0) return; // Only paint with left click
  
  isPainting = true;
  paintAtMouse(e);
});

canvasContainer.addEventListener('pointermove', (e) => {
  if (!activeMesh || isSplit) return;
  
  updateBrushIndicator(e);
  
  if (isPainting && toolMode === 'brush') {
    paintAtMouse(e);
  }
});

window.addEventListener('pointerup', () => {
  isPainting = false;
});

function paintAtMouse(e) {
  if (!renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(activeMesh);
  
  if (intersects.length > 0) {
    const intersect = intersects[0];
    
    // Transform intersect point into mesh local space
    const localPoint = activeMesh.worldToLocal(intersect.point.clone());
    
    // 3D brush radius relative to model bounding radius
    const brushRatio = brushSize / 250;
    const localBrushRadius = brushRatio * modelRadius;
    
    paintGeometry(activeMesh.geometry, localPoint, localBrushRadius);
  }
}

function paintGeometry(geometry, localPoint, radius) {
  const positionAttr = geometry.attributes.position;
  const colorAttr = geometry.attributes.color;
  const colors = colorAttr.array;
  
  // Set paint color (erase mode sets white)
  const paintColor = new THREE.Color(isEraseMode ? '#ffffff' : activeColor);
  
  const faceCount = positionAttr.count / 3;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const faceCentroid = new THREE.Vector3();
  
  let needsUpdate = false;
  
  for (let i = 0; i < faceCount; i++) {
    // Read the three vertex positions of the face
    vA.fromBufferAttribute(positionAttr, i * 3);
    vB.fromBufferAttribute(positionAttr, i * 3 + 1);
    vC.fromBufferAttribute(positionAttr, i * 3 + 2);
    
    // Calculate centroids & distances
    faceCentroid.set(0, 0, 0).add(vA).add(vB).add(vC).divideScalar(3);
    const distCentroid = faceCentroid.distanceTo(localPoint);
    const distA = vA.distanceTo(localPoint);
    const distB = vB.distanceTo(localPoint);
    const distC = vC.distanceTo(localPoint);
    
    // If any vertex or centroid falls in the brush sphere, paint the entire face!
    if (distCentroid < radius || distA < radius || distB < radius || distC < radius) {
      const idx = i * 9;
      
      colors[idx]     = paintColor.r;
      colors[idx + 1] = paintColor.g;
      colors[idx + 2] = paintColor.b;
      
      colors[idx + 3] = paintColor.r;
      colors[idx + 4] = paintColor.g;
      colors[idx + 5] = paintColor.b;
      
      colors[idx + 6] = paintColor.r;
      colors[idx + 7] = paintColor.g;
      colors[idx + 8] = paintColor.b;
      
      needsUpdate = true;
    }
  }
  
  if (needsUpdate) {
    colorAttr.needsUpdate = true;
  }
}

// Reset mesh colors back to original
btnResetMesh.addEventListener('click', () => {
  if (!activeMesh || !originalGeometry) return;
  
  // Re-copy original unpainted color array to active geometry
  const activeColorAttr = activeMesh.geometry.attributes.color;
  const originalColorAttr = originalGeometry.attributes.color;
  
  activeColorAttr.array.set(originalColorAttr.array);
  activeColorAttr.needsUpdate = true;
  
  showToast('Reset all paint coatings to base', 'warning');
});

// Save current project state to a JSON file
btnSaveProject.addEventListener('click', () => {
  if (!activeMesh || !loadedModelRawData || isSplit) {
    showToast('Can only save project before splitting the mesh', 'warning');
    return;
  }
  
  showLoading("Packaging project file...", 40);
  
  setTimeout(() => {
    try {
      const colorsAttr = activeMesh.geometry.attributes.color;
      const projectData = {
        appName: "3D Unmounth Studio",
        version: "1.0",
        savedAt: new Date().toISOString(),
        modelName: loadedModelName,
        fileExtension: loadedModelExt,
        modelData: loadedModelRawData,
        position: { x: activeMesh.position.x, y: activeMesh.position.y, z: activeMesh.position.z },
        rotation: { x: activeMesh.rotation.x, y: activeMesh.rotation.y, z: activeMesh.rotation.z },
        scale: { x: activeMesh.scale.x, y: activeMesh.scale.y, z: activeMesh.scale.z },
        colors: Array.from(colorsAttr.array)
      };
      
      const jsonStr = JSON.stringify(projectData);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${loadedModelName.split('.')[0]}_project.unmounth.json`;
      link.click();
      
      URL.revokeObjectURL(url);
      showToast('Project downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      hideLoading();
    }
  }, 50);
});

// Smooth boundary paint lines
btnSmoothPaint.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  
  showLoading("Smoothing paint boundaries...", 30);
  
  setTimeout(() => {
    try {
      smoothPaintBorders();
      showToast('Paint borders smoothed successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast(`Smoothing failed: ${err.message}`, 'error');
    } finally {
      hideLoading();
    }
  }, 50);
});

// ==========================================
// SVG POLYGON MASK OVERLAY & ENGINE
// ==========================================
modeBrushBtn.addEventListener('click', () => {
  setToolMode('brush');
});

modePolygonBtn.addEventListener('click', () => {
  setToolMode('polygon');
});

modeMoveBtn.addEventListener('click', () => {
  setToolMode('move');
});

function setToolMode(mode) {
  if (isSplit && mode !== 'move') {
    showToast('Click "Return to Editor" to paint the model again', 'warning');
    return;
  }
  
  toolMode = mode;
  
  // Toggle UI buttons
  modeBrushBtn.classList.toggle('active', toolMode === 'brush');
  modePolygonBtn.classList.toggle('active', toolMode === 'polygon');
  modeMoveBtn.classList.toggle('active', toolMode === 'move');
  
  // Detach transform controls initially
  if (transformControls) {
    transformControls.detach();
    transformControls.visible = false;
  }
  
  // Toggle visibility of all movement platforms depending on move mode
  scene.traverse((child) => {
    if (child.name === "movementPlatform") {
      child.visible = (mode === 'move');
    }
  });
  
  if (toolMode === 'brush') {
    brushSettingsPanel.classList.remove('hidden');
    polygonSettingsPanel.classList.add('hidden');
    positionSettingsPanel.classList.add('hidden');
    polygonOverlay.classList.remove('active');
    controls.enabled = true; // enable OrbitControls
  } else if (toolMode === 'polygon') {
    brushSettingsPanel.classList.add('hidden');
    polygonSettingsPanel.classList.remove('hidden');
    positionSettingsPanel.classList.add('hidden');
    polygonOverlay.classList.add('active');
    controls.enabled = true; // KEEP OrbitControls enabled to allow camera zoom/rotation in polygon mode!
    
    // Initialize default polygon in center of screen
    initPolygonPoints();
  } else if (toolMode === 'move') {
    brushSettingsPanel.classList.add('hidden');
    polygonSettingsPanel.classList.add('hidden');
    positionSettingsPanel.classList.remove('hidden');
    polygonOverlay.classList.remove('active');
    controls.enabled = true; // enable OrbitControls
    
    if (isSplit) {
      if (splitMeshes.length > 0) {
        selectSplitMesh(selectedSplitMesh || splitMeshes[0]);
      }
    } else if (activeMesh && transformControls) {
      transformControls.attach(activeMesh);
      transformControls.visible = true;
      updateSidebarPositionValues(activeMesh.position);
    }
  }
  
  updateWorkbenchStatusText();
}

function updateWorkbenchStatusText() {
  if (isSplit) {
    if (toolMode === 'move') {
      workbenchStatusText.textContent = "Move Mode Active: Drag a part's arrows to move it. Click another part in scene/sidebar to select.";
      workbenchIndicator.className = "indicator poly-mode";
    } else {
      workbenchStatusText.textContent = "Previewing Split Parts. Select 'Move Object' tool to reposition parts.";
      workbenchIndicator.className = "indicator erase-mode";
    }
    return;
  }
  
  if (toolMode === 'brush') {
    if (isEraseMode) {
      workbenchStatusText.textContent = "Eraser Active (Click & Drag)";
      workbenchIndicator.className = "indicator erase-mode";
    } else {
      workbenchStatusText.textContent = "Brush Paint Active (Click & Drag)";
      workbenchIndicator.className = "indicator";
    }
  } else if (toolMode === 'polygon') {
    workbenchStatusText.textContent = "Polygon Selection Mode (Drag handles | Double-click line to add crease | Right-click handle to delete)";
    workbenchIndicator.className = "indicator poly-mode";
  } else if (toolMode === 'move') {
    workbenchStatusText.textContent = "Move Mode Active: Use the 3D translation gizmo to move the model.";
    workbenchIndicator.className = "indicator poly-mode";
  }
}

function initPolygonPoints() {
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  
  const cx = w / 2;
  const cy = h / 2;
  
  if (maskShapeType === 'polygon') {
    const size = Math.min(w, h) * 0.22; // 22% viewport size
    // Create standard square centered
    polyPoints = [
      { x: cx - size, y: cy - size },
      { x: cx + size, y: cy - size },
      { x: cx + size, y: cy + size },
      { x: cx - size, y: cy + size }
    ];
  } else if (maskShapeType === 'circle') {
    circleCenter = { x: cx, y: cy };
    circleRadius = Math.min(w, h) * 0.16; // 16% viewport size
  }
  
  renderPolygonHandles();
  drawPolygonSVG();
}

function drawPolygonSVG() {
  if (maskShapeType === 'polygon') {
    if (polyPoints.length === 0) {
      polygonPath.setAttribute('d', '');
      return;
    }
    // Construct path descriptor string: M x0 y0 L x1 y1 ... Z
    let d = `M ${polyPoints[0].x} ${polyPoints[0].y}`;
    for (let i = 1; i < polyPoints.length; i++) {
      d += ` L ${polyPoints[i].x} ${polyPoints[i].y}`;
    }
    d += ' Z';
    polygonPath.setAttribute('d', d);
  } else if (maskShapeType === 'circle') {
    const cx = circleCenter.x;
    const cy = circleCenter.y;
    const r = circleRadius;
    const d = `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`;
    polygonPath.setAttribute('d', d);
  }
}

function renderPolygonHandles() {
  polygonHandlesGroup.innerHTML = '';
  
  if (maskShapeType === 'polygon') {
    polyPoints.forEach((pt, idx) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', 8);
      circle.setAttribute('class', 'poly-handle');
      circle.setAttribute('data-index', idx);
      
      // Attach handle dragging events
      circle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        isDraggingHandle = true;
        activeHandleIdx = idx;
        circle.setPointerCapture(e.pointerId);
        controls.enabled = false; // disable camera OrbitControls during active handle drag
      });
      
      circle.addEventListener('pointermove', (e) => {
        if (isDraggingHandle && activeHandleIdx === idx) {
          e.stopPropagation();
          const rect = polygonOverlay.getBoundingClientRect();
          let px = e.clientX - rect.left;
          let py = e.clientY - rect.top;
          
          // Clamp dragging to canvas boundaries
          px = Math.max(0, Math.min(px, rect.width));
          py = Math.max(0, Math.min(py, rect.height));
          
          polyPoints[idx].x = px;
          polyPoints[idx].y = py;
          
          circle.setAttribute('cx', px);
          circle.setAttribute('cy', py);
          drawPolygonSVG();
        }
      });
      
      circle.addEventListener('pointerup', (e) => {
        if (isDraggingHandle && activeHandleIdx === idx) {
          e.stopPropagation();
          circle.releasePointerCapture(e.pointerId);
          isDraggingHandle = false;
          activeHandleIdx = -1;
          controls.enabled = true; // re-enable camera OrbitControls after handle drag
        }
      });
      
      circle.addEventListener('pointercancel', (e) => {
        if (isDraggingHandle && activeHandleIdx === idx) {
          circle.releasePointerCapture(e.pointerId);
          isDraggingHandle = false;
          activeHandleIdx = -1;
          controls.enabled = true; // re-enable camera OrbitControls after handle drag
        }
      });
      
      // Right click deletion (crease reduction)
      circle.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (polyPoints.length <= 3) {
          showToast('A polygon must have at least 3 vertices', 'warning');
          return;
        }
        
        polyPoints.splice(idx, 1);
        renderPolygonHandles();
        drawPolygonSVG();
        showToast('Node removed', 'info');
      });
      
      polygonHandlesGroup.appendChild(circle);
    });
  } else if (maskShapeType === 'circle') {
    // 1. Center Handle (to translate)
    const centerHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerHandle.setAttribute('cx', circleCenter.x);
    centerHandle.setAttribute('cy', circleCenter.y);
    centerHandle.setAttribute('r', 9);
    centerHandle.setAttribute('class', 'poly-handle');
    centerHandle.setAttribute('style', 'fill: #ffffff; stroke: #06b6d4; stroke-width: 3px; cursor: move;');
    
    centerHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isDraggingCenter = true;
      centerHandle.setPointerCapture(e.pointerId);
      controls.enabled = false;
    });
    
    centerHandle.addEventListener('pointermove', (e) => {
      if (isDraggingCenter) {
        e.stopPropagation();
        const rect = polygonOverlay.getBoundingClientRect();
        let px = e.clientX - rect.left;
        let py = e.clientY - rect.top;
        
        circleCenter.x = Math.max(0, Math.min(px, rect.width));
        circleCenter.y = Math.max(0, Math.min(py, rect.height));
        
        centerHandle.setAttribute('cx', circleCenter.x);
        centerHandle.setAttribute('cy', circleCenter.y);
        
        updateRadiusHandlePosition(radiusHandle);
        drawPolygonSVG();
      }
    });
    
    centerHandle.addEventListener('pointerup', (e) => {
      if (isDraggingCenter) {
        e.stopPropagation();
        centerHandle.releasePointerCapture(e.pointerId);
        isDraggingCenter = false;
        controls.enabled = true;
        renderPolygonHandles(); // rebuild to lock updated positions
      }
    });
    
    centerHandle.addEventListener('pointercancel', (e) => {
      if (isDraggingCenter) {
        centerHandle.releasePointerCapture(e.pointerId);
        isDraggingCenter = false;
        controls.enabled = true;
        renderPolygonHandles();
      }
    });
    
    polygonHandlesGroup.appendChild(centerHandle);
    
    // 2. Radius Handle (to scale)
    const angle = -Math.PI / 4; // Top-right position
    const radiusHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    radiusHandle.setAttribute('r', 8);
    radiusHandle.setAttribute('class', 'poly-handle');
    radiusHandle.setAttribute('style', 'fill: #ffffff; stroke: #ec4899; stroke-width: 3px; cursor: ew-resize;');
    
    function updateRadiusHandlePosition(handle) {
      const rx = circleCenter.x + circleRadius * Math.cos(angle);
      const ry = circleCenter.y + circleRadius * Math.sin(angle);
      handle.setAttribute('cx', rx);
      handle.setAttribute('cy', ry);
    }
    
    updateRadiusHandlePosition(radiusHandle);
    
    radiusHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      isDraggingRadius = true;
      radiusHandle.setPointerCapture(e.pointerId);
      controls.enabled = false;
    });
    
    radiusHandle.addEventListener('pointermove', (e) => {
      if (isDraggingRadius) {
        e.stopPropagation();
        const rect = polygonOverlay.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        
        const dx = px - circleCenter.x;
        const dy = py - circleCenter.y;
        circleRadius = Math.max(10, Math.sqrt(dx * dx + dy * dy));
        
        updateRadiusHandlePosition(radiusHandle);
        drawPolygonSVG();
      }
    });
    
    radiusHandle.addEventListener('pointerup', (e) => {
      if (isDraggingRadius) {
        e.stopPropagation();
        radiusHandle.releasePointerCapture(e.pointerId);
        isDraggingRadius = false;
        controls.enabled = true;
        renderPolygonHandles();
      }
    });
    
    radiusHandle.addEventListener('pointercancel', (e) => {
      if (isDraggingRadius) {
        radiusHandle.releasePointerCapture(e.pointerId);
        isDraggingRadius = false;
        controls.enabled = true;
        renderPolygonHandles();
      }
    });
    
    polygonHandlesGroup.appendChild(radiusHandle);
  }
}

// Double-click line segment to insert new nodes (creases/folds)
polygonOverlay.addEventListener('dblclick', (e) => {
  if (toolMode !== 'polygon' || isSplit || maskShapeType === 'circle') return;
  
  const rect = polygonOverlay.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  
  const mousePt = { x: mx, y: my };
  
  // Find which segment the mouse was double-clicked on
  let bestIdx = -1;
  let minDist = Infinity;
  const threshold = 16; // pick line within 16px radius
  
  for (let i = 0; i < polyPoints.length; i++) {
    const p1 = polyPoints[i];
    const p2 = polyPoints[(i + 1) % polyPoints.length];
    
    const dist = getDistanceToSegment(mousePt, p1, p2);
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }
  
  if (minDist <= threshold && bestIdx !== -1) {
    // Insert new vertex point right between bestIdx and bestIdx + 1
    polyPoints.splice(bestIdx + 1, 0, mousePt);
    
    renderPolygonHandles();
    drawPolygonSVG();
    showToast('New fold handle inserted', 'success');
  }
});

// Distance from point to line segment formula helper
function getDistanceToSegment(p, p1, p2) {
  const x = p.x, y = p.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = x - xx;
  const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Reset Polygon/Circle shape back to standard size
btnPolyReset.addEventListener('click', () => {
  if (toolMode !== 'polygon') return;
  initPolygonPoints();
  const shapeName = maskShapeType === 'polygon' ? 'center quad' : 'default circle';
  showToast(`Reset mask shape to ${shapeName}`, 'info');
});

selectPolyShapeType.addEventListener('change', (e) => {
  maskShapeType = e.target.value;
  initPolygonPoints();
  showToast(`Switched mask shape to ${maskShapeType.toUpperCase()}`, 'info');
});

// ==========================================
// PHOTO PROJECTION EVENT LISTENERS & LOGIC
// ==========================================
btnTriggerUploadPhoto.addEventListener('click', () => {
  photoFileInput.click();
});

photoFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  showLoading("Loading reference photo...", 30);
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      originalProjectionImage = img;
      projectionImage = img;
      isPhotoLoaded = true;
      
      // Show control panel first
      photoControlPanel.classList.remove('hidden');
      
      // Update overlay source initially to allow correct dimensions reading
      imageProjectionOverlay.src = event.target.result;
      imageProjectionOverlay.style.display = 'block';
      imageProjectionOverlay.style.opacity = photoOpacitySlider.value / 100;
      
      if (photoQuantizeCheck.checked) {
        solidifyOverlayImage();
      } else {
        hideLoading();
        showToast("Photo loaded! Align the 3D model and click Project.", "success");
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

photoOpacitySlider.addEventListener('input', (e) => {
  const val = e.target.value;
  photoOpacityVal.textContent = `${val}%`;
  if (imageProjectionOverlay) {
    imageProjectionOverlay.style.opacity = val / 100;
  }
});

photoQuantizeCheck.addEventListener('change', (e) => {
  if (!isPhotoLoaded) return;
  if (e.target.checked) {
    solidifyOverlayImage();
  } else {
    // Restore original photo
    projectionImage = originalProjectionImage;
    imageProjectionOverlay.src = originalProjectionImage.src;
    showToast("Restored original reference photo", "info");
  }
});

btnClearPhoto.addEventListener('click', () => {
  originalProjectionImage = null;
  projectionImage = null;
  isPhotoLoaded = false;
  imageProjectionOverlay.src = '';
  imageProjectionOverlay.style.display = 'none';
  photoControlPanel.classList.add('hidden');
  photoFileInput.value = '';
  showToast("Photo overlay removed", "info");
});

btnProjectPhoto.addEventListener('click', () => {
  if (!activeMesh || !isPhotoLoaded || isSplit) {
    showToast("No active model or reference photo loaded (must be unsplit)", "warning");
    return;
  }
  
  showLoading("Projecting photo colors...", 10);
  
  setTimeout(() => {
    try {
      projectPhotoColors();
      showToast("Photo colors projected successfully!", "success");
    } catch (err) {
      console.error(err);
      showToast(`Projection failed: ${err.message}`, "error");
    } finally {
      hideLoading();
    }
  }, 50);
});

function getPaletteColors() {
  const list = [...PRESET_COLORS];
  const customVal = customColorPicker.value;
  if (!list.includes(customVal)) {
    list.push(customVal);
  }
  if (!list.includes(activeColor) && activeColor) {
    list.push(activeColor);
  }
  return list;
}

function findNearestPaletteColor(r, g, b, paletteHexList) {
  let minDistance = Infinity;
  let nearestHex = '#ffffff';
  
  const fullList = ['#ffffff', ...paletteHexList];
  
  fullList.forEach(hex => {
    const rgb = hexToRgb(hex);
    const dr = r - rgb.r;
    const dg = g - rgb.g;
    const db = b - rgb.b;
    const dist = Math.sqrt(dr*dr + dg*dg + db*db);
    
    if (dist < minDistance) {
      minDistance = dist;
      nearestHex = hex;
    }
  });
  
  return nearestHex;
}

function solidifyOverlayImage() {
  if (!originalProjectionImage) return;
  
  showLoading("Solidifying and filtering image colors...", 20);
  
  setTimeout(() => {
    try {
      const w = canvasContainer.clientWidth;
      const h = canvasContainer.clientHeight;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const ctx = tempCanvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      
      const imgRatio = originalProjectionImage.width / originalProjectionImage.height;
      const viewRatio = w / h;
      let drawW, drawH, drawX, drawY;
      
      if (imgRatio > viewRatio) {
        drawW = w;
        drawH = w / imgRatio;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawW = h * imgRatio;
        drawH = h;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }
      ctx.drawImage(originalProjectionImage, drawX, drawY, drawW, drawH);
      
      const imgData = ctx.getImageData(0, 0, w, h);
      const pixels = imgData.data;
      
      const paletteList = getPaletteColors();
      
      // 1. First pass: Quantize every pixel color to the nearest palette color
      const quantizedHexArray = new Array(w * h);
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const alpha = pixels[idx + 3];
          
          if (alpha <= 30) {
            quantizedHexArray[y * w + x] = 'transparent';
          } else {
            const r = pixels[idx] / 255;
            const g = pixels[idx + 1] / 255;
            const b = pixels[idx + 2] / 255;
            
            const nearestHex = findNearestPaletteColor(r, g, b, paletteList);
            quantizedHexArray[y * w + x] = nearestHex;
          }
        }
      }
      
      // 2. Second pass: 2D Majority Filter (Median) with a radius of 2 pixels (5x5 grid) to clean noise
      const radius = 2;
      const finalPixels = new Uint8ClampedArray(pixels.length);
      
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const myHex = quantizedHexArray[y * w + x];
          
          if (myHex === 'transparent') {
            finalPixels[idx] = 0;
            finalPixels[idx + 1] = 0;
            finalPixels[idx + 2] = 0;
            finalPixels[idx + 3] = 0;
            continue;
          }
          
          // Poll 5x5 neighborhood
          const counts = {};
          let total = 0;
          
          for (let ny = y - radius; ny <= y + radius; ny++) {
            if (ny < 0 || ny >= h) continue;
            for (let nx = x - radius; nx <= x + radius; nx++) {
              if (nx < 0 || nx >= w) continue;
              
              const neighborHex = quantizedHexArray[ny * w + nx];
              if (neighborHex !== 'transparent') {
                counts[neighborHex] = (counts[neighborHex] || 0) + 1;
                total++;
              }
            }
          }
          
          // Determine majority color
          let maxCount = 0;
          let majorityHex = myHex;
          
          for (const [hex, count] of Object.entries(counts)) {
            if (count > maxCount) {
              maxCount = count;
              majorityHex = hex;
            }
          }
          
          const rgb = hexToRgb(majorityHex);
          finalPixels[idx] = Math.round(rgb.r * 255);
          finalPixels[idx + 1] = Math.round(rgb.g * 255);
          finalPixels[idx + 2] = Math.round(rgb.b * 255);
          finalPixels[idx + 3] = 255;
        }
      }
      
      // 3. Write back to offscreen canvas
      const filteredImgData = new ImageData(finalPixels, w, h);
      ctx.putImageData(filteredImgData, 0, 0);
      
      // 4. Update the visual overlay so the user sees the flat, clean color zones!
      const dataURL = tempCanvas.toDataURL();
      imageProjectionOverlay.src = dataURL;
      
      // 5. Replace projectionImage with the processed canvas image
      const newImg = new Image();
      newImg.onload = () => {
        projectionImage = newImg;
        hideLoading();
        showToast("Photo colors cleaned and solidified!", "success");
      };
      newImg.src = dataURL;
      
    } catch (err) {
      console.error(err);
      showToast(`Failed to solidify photo: ${err.message}`, "error");
      hideLoading();
    }
  }, 50);
}

function projectPhotoColors() {
  const geometry = activeMesh.geometry;
  const positionAttr = geometry.attributes.position;
  const colorAttr = geometry.attributes.color;
  const colors = colorAttr.array;
  
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  
  // 1. Draw image to offscreen canvas using object-fit contain
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const ctx = offscreen.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  
  const imgRatio = projectionImage.width / projectionImage.height;
  const viewRatio = w / h;
  let drawW, drawH, drawX, drawY;
  
  if (imgRatio > viewRatio) {
    drawW = w;
    drawH = w / imgRatio;
    drawX = 0;
    drawY = (h - drawH) / 2;
  } else {
    drawW = h * imgRatio;
    drawH = h;
    drawX = (w - drawW) / 2;
    drawY = 0;
  }
  ctx.drawImage(projectionImage, drawX, drawY, drawW, drawH);
  
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;
  
  // Get active palette colors if quantize is enabled
  const doQuantize = photoQuantizeCheck.checked;
  const paletteList = getPaletteColors();
  
  // 2. Iterate faces and project from camera space
  const faceCount = positionAttr.count / 3;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  
  const centroid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  
  const toCam = new THREE.Vector3();
  let paintedCount = 0;
  
  for (let i = 0; i < faceCount; i++) {
    // A. Get vertices in world space
    vA.fromBufferAttribute(positionAttr, i * 3).applyMatrix4(activeMesh.matrixWorld);
    vB.fromBufferAttribute(positionAttr, i * 3 + 1).applyMatrix4(activeMesh.matrixWorld);
    vC.fromBufferAttribute(positionAttr, i * 3 + 2).applyMatrix4(activeMesh.matrixWorld);
    
    // B. Backface culling
    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    normal.crossVectors(cb, ab).normalize();
    
    toCam.copy(camera.position).sub(vA).normalize();
    if (normal.dot(toCam) < -0.05) {
      continue; // skip backfaces
    }
    
    // C. Get screen pixel position of face centroid
    centroid.set(0,0,0).add(vA).add(vB).add(vC).divideScalar(3);
    centroid.project(camera);
    
    const px = Math.round(((centroid.x + 1) / 2) * w);
    const py = Math.round(((-centroid.y + 1) / 2) * h);
    
    if (px >= 0 && px < w && py >= 0 && py < h) {
      const idx = (py * w + px) * 4;
      const alpha = pixels[idx + 3];
      
      // Skip transparent parts of the overlay image
      if (alpha > 30) {
        let r = pixels[idx] / 255;
        let g = pixels[idx + 1] / 255;
        let b = pixels[idx + 2] / 255;
        
        if (doQuantize) {
          const nearestHex = findNearestPaletteColor(r, g, b, paletteList);
          const nearestRgb = hexToRgb(nearestHex);
          r = nearestRgb.r;
          g = nearestRgb.g;
          b = nearestRgb.b;
        }
        
        const faceColIdx = i * 9;
        colors[faceColIdx]     = r;
        colors[faceColIdx + 1] = g;
        colors[faceColIdx + 2] = b;
        
        colors[faceColIdx + 3] = r;
        colors[faceColIdx + 4] = g;
        colors[faceColIdx + 5] = b;
        
        colors[faceColIdx + 6] = r;
        colors[faceColIdx + 7] = g;
        colors[faceColIdx + 8] = b;
        
        paintedCount++;
      }
    }
  }
  
  if (paintedCount > 0) {
    colorAttr.needsUpdate = true;
    showToast(`Projected colors onto ${paintedCount} faces!`, 'success');
  } else {
    showToast("No faces were projected. Make sure the model overlaps with the photo.", "warning");
  }
}

// ==========================================
// POLYGON PROJECTION PAINT ALGORITHM
// ==========================================
btnPolyFill.addEventListener('click', () => {
  if (!activeMesh || toolMode !== 'polygon' || isSplit) return;
  
  showLoading("Projecting selection mask...", 10);
  
  setTimeout(() => {
    try {
      projectPolygonMask();
      hideLoading();
    } catch (err) {
      console.error(err);
      showToast(`Projection failed: ${err.message}`, 'error');
      hideLoading();
    }
  }, 50);
});

function projectPolygonMask() {
  const geometry = activeMesh.geometry;
  const positionAttr = geometry.attributes.position;
  const colorAttr = geometry.attributes.color;
  const colors = colorAttr.array;
  
  const paintColor = new THREE.Color(isEraseMode ? '#ffffff' : activeColor);
  
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  
  const faceCount = positionAttr.count / 3;
  
  // Vectors for vertex transformations
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  
  const centroid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  
  // Get camera view vector to filter backfaces
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  
  let paintedCount = 0;
  
  for (let i = 0; i < faceCount; i++) {
    // 1. Get vertex positions in local space
    vA.fromBufferAttribute(positionAttr, i * 3);
    vB.fromBufferAttribute(positionAttr, i * 3 + 1);
    vC.fromBufferAttribute(positionAttr, i * 3 + 2);
    
    // 2. Transform vertices to world space
    vA.applyMatrix4(activeMesh.matrixWorld);
    vB.applyMatrix4(activeMesh.matrixWorld);
    vC.applyMatrix4(activeMesh.matrixWorld);
    
    // 3. Compute face normal in world space to skip occluded backfaces
    cb.subVectors(vC, vB);
    ab.subVectors(vA, vB);
    normal.crossVectors(cb, ab).normalize();
    
    const toCam = new THREE.Vector3().copy(camera.position).sub(vA).normalize();
    
    // Dot product determines if face normal faces the camera direction
    if (normal.dot(toCam) < -0.05) {
      // Skipping faces facing away from camera (back-faces)
      continue;
    }
    
    // 4. Calculate face centroid in world space
    centroid.set(0,0,0).add(vA).add(vB).add(vC).divideScalar(3);
    
    // 5. Project centroid into camera NDC (Normalized Device Coordinates) space
    centroid.project(camera);
    
    // 6. Convert NDC coordinates [-1, 1] to pixel coordinates on canvas
    const px = ((centroid.x + 1) / 2) * w;
    const py = ((-centroid.y + 1) / 2) * h;
    
    // 7. Check if screen point lies inside our polygon/circle selection mask
    const point = { x: px, y: py };
    let isInside = false;
    if (maskShapeType === 'polygon') {
      isInside = isPointInPolygon(point, polyPoints);
    } else if (maskShapeType === 'circle') {
      const dx = px - circleCenter.x;
      const dy = py - circleCenter.y;
      isInside = (dx * dx + dy * dy <= circleRadius * circleRadius);
    }
    
    if (isInside) {
      const idx = i * 9;
      
      colors[idx]     = paintColor.r;
      colors[idx + 1] = paintColor.g;
      colors[idx + 2] = paintColor.b;
      
      colors[idx + 3] = paintColor.r;
      colors[idx + 4] = paintColor.g;
      colors[idx + 5] = paintColor.b;
      
      colors[idx + 6] = paintColor.r;
      colors[idx + 7] = paintColor.g;
      colors[idx + 8] = paintColor.b;
      
      paintedCount++;
    }
  }
  
  if (paintedCount > 0) {
    colorAttr.needsUpdate = true;
    showToast(`Projected selection: Painted ${paintedCount} faces`, 'success');
  } else {
    showToast('No visible faces fell inside the polygon selection boundary', 'warning');
  }
}

// Point-in-polygon Raycasting algorithm (PNPOLY)
function isPointInPolygon(pt, poly) {
  let inside = false;
  
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    
    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        
    if (intersect) inside = !inside;
  }
  
  return inside;
}

// ==========================================
// MESH SPLITTING LOGIC
// ==========================================
btnSplitMesh.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  
  showLoading("Analyzing color segments...", 10);
  
  setTimeout(() => {
    try {
      splitMeshByColor();
    } catch (err) {
      console.error(err);
      showToast(`Split failed: ${err.message}`, 'error');
      hideLoading();
    }
  }, 50);
});

function splitMeshByColor() {
  if (transformControls) {
    transformControls.detach();
    transformControls.visible = false;
  }
  selectedSplitMesh = null;

  const geometry = activeMesh.geometry;
  const positionAttr = geometry.attributes.position;
  const normalAttr = geometry.attributes.normal;
  const colorAttr = geometry.attributes.color;
  
  const colors = colorAttr.array;
  const faceCount = positionAttr.count / 3;
  
  // 1. Group face indices by rounding colors to hex strings
  const colorGroups = {};
  
  for (let i = 0; i < faceCount; i++) {
    // We check the color of the first vertex of each face (non-indexed colors are grouped in blocks of 9 floats per face)
    const r = Math.round(colors[i * 9] * 255);
    const g = Math.round(colors[i * 9 + 1] * 255);
    const b = Math.round(colors[i * 9 + 2] * 255);
    const hex = rgbToHex(r, g, b);
    
    if (!colorGroups[hex]) {
      colorGroups[hex] = [];
    }
    colorGroups[hex].push(i);
  }
  
  const numGroups = Object.keys(colorGroups).length;
  
  // If only white (base color) or a single solid color exists, there is nothing to split!
  if (numGroups <= 1) {
    showToast('Please paint some parts of the object before splitting.', 'warning');
    hideLoading();
    return;
  }
  
  // Hide active base mesh
  if (activeMesh) activeMesh.visible = false;
  if (brushIndicator) brushIndicator.visible = false;
  
  splitMeshes = [];
  
  // 2. Build a new BufferGeometry for each color group
  let index = 1;
  
  for (const [hex, faceIndices] of Object.entries(colorGroups)) {
    const N = faceIndices.length;
    if (N === 0) continue;
    
    showLoading(`Extracting part ${index}...`, 30 + Math.round((index / numGroups) * 50));
    
    const newGeom = new THREE.BufferGeometry();
    
    // Allocate arrays for positions, normals, and colors
    const newPos = new Float32Array(N * 9);
    const newNorm = new Float32Array(N * 9);
    const newCol = new Float32Array(N * 9);
    
    // Copy face attribute float groups
    for (let f = 0; f < N; f++) {
      const origFaceIdx = faceIndices[f];
      
      // Copy position
      for (let offset = 0; offset < 9; offset++) {
        newPos[f * 9 + offset] = positionAttr.array[origFaceIdx * 9 + offset];
      }
      
      // Copy normals
      for (let offset = 0; offset < 9; offset++) {
        newNorm[f * 9 + offset] = normalAttr.array[origFaceIdx * 9 + offset];
      }
      
      // Set solid color for the mesh material later, but keep color attribute
      for (let offset = 0; offset < 9; offset++) {
        newCol[f * 9 + offset] = colorAttr.array[origFaceIdx * 9 + offset];
      }
    }
    
    newGeom.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    newGeom.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
    newGeom.setAttribute('color', new THREE.BufferAttribute(newCol, 3));
    
    // Create a material loaded with the specific color of the part
    const partColor = new THREE.Color(hex);
    
    // Standard colored material
    const mat = new THREE.MeshStandardMaterial({
      color: partColor,
      roughness: 0.55,
      metalness: 0.05,
      side: THREE.DoubleSide
    });
    
    const splitMesh = new THREE.Mesh(newGeom, mat);
    splitMesh.castShadow = true;
    splitMesh.receiveShadow = true;
    
    // Copy parent transforms so it aligns perfectly in 3D space
    splitMesh.position.copy(activeMesh.position);
    splitMesh.rotation.copy(activeMesh.rotation);
    splitMesh.scale.copy(activeMesh.scale);
    
    // Create and add Movement Platform anchor disc to split part
    splitMesh.geometry.computeBoundingSphere();
    const partRadius = splitMesh.geometry.boundingSphere.radius;
    const platform = createPlatformDisc(partRadius);
    if (platform) {
      splitMesh.add(platform);
      platform.visible = (toolMode === 'move');
    }
    
    // Calculate and apply exploded-view offset away from model center
    const partCenter = splitMesh.geometry.boundingSphere.center.clone();
    const refCenter = new THREE.Vector3(0, modelRadius * 0.8, 0); // vertical center reference
    const dir = new THREE.Vector3().subVectors(partCenter, refCenter);
    if (dir.lengthSq() === 0) {
      dir.set(1, 0, 0);
    } else {
      dir.normalize();
    }
    dir.applyEuler(activeMesh.rotation); // align with model's rotated orientation
    
    // Displace by 15% of the model radius to show clear separation
    const offsetDist = modelRadius * 0.15;
    splitMesh.position.addScaledVector(dir, offsetDist);
    
    // Store metadata
    const isBase = (hex === '#ffffff');
    splitMesh.userData = {
      hexColor: hex,
      partName: isBase ? "Base Body" : `Part ${hex.toUpperCase()}`,
      faceCount: N,
      isBase: isBase
    };
    
    scene.add(splitMesh);
    splitMeshes.push(splitMesh);
    index++;
  }
  
  isSplit = true;
  
  // 3. Populate Right Sidebar Split parts panel
  populateSplitPartsPanel();
  
  // Show sidebars
  workspaceLayout.classList.add('right-active');
  
  // Switch automatically to move mode to let the user see the gizmo and move the split parts!
  setToolMode('move');
  
  hideLoading();
  showToast(`Mesh successfully separated into ${splitMeshes.length} separate objects!`, 'success');
  updateWorkbenchStatusText();
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function selectSplitMeshAtMouse(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(splitMeshes);
  
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    selectSplitMesh(hitMesh);
  }
}

function selectSplitMesh(mesh) {
  if (!isSplit || !mesh) return;
  
  selectedSplitMesh = mesh;
  
  // Attach transform controls to this mesh
  if (transformControls) {
    transformControls.attach(mesh);
    transformControls.visible = true;
  }
  
  // Update sidebar inputs for this mesh position
  updateSidebarPositionValues(mesh.position);
  
  // Adjust slider bounds to match the active modelRadius
  updatePositionSlidersRange(modelRadius);
  
  // Highlight the sidebar item
  document.querySelectorAll('.part-item').forEach(item => item.classList.remove('active-part'));
  
  // Find which index this mesh is in splitMeshes
  const idx = splitMeshes.indexOf(mesh);
  if (idx !== -1) {
    const items = splitPartsList.querySelectorAll('.part-item');
    if (items[idx]) {
      items[idx].classList.add('active-part');
    }
  }
}

function populateSplitPartsPanel() {
  splitPartsList.innerHTML = '';
  splitPartsCount.textContent = `${splitMeshes.length} parts`;
  
  splitMeshes.forEach((mesh, idx) => {
    const meta = mesh.userData;
    
    const item = document.createElement('div');
    item.className = 'part-item';
    
    item.innerHTML = `
      <div class="part-color-dot" style="background-color: ${meta.hexColor}"></div>
      <div class="part-info">
        <span class="part-name" title="${meta.partName}">${meta.partName}</span>
        <span class="part-meta">${meta.faceCount.toLocaleString()} polygons</span>
      </div>
      <div class="part-actions">
        <button class="part-btn btn-visibility" title="Toggle Visibility">
          <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        </button>
        <button class="part-btn btn-download" title="Download Part (.STL)">
          <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
          </svg>
        </button>
      </div>
    `;
    
    // Toggle part visibility
    const visBtn = item.querySelector('.btn-visibility');
    visBtn.addEventListener('click', () => {
      mesh.visible = !mesh.visible;
      if (mesh.visible) {
        visBtn.classList.remove('hidden-mesh');
        visBtn.querySelector('svg').innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
      } else {
        visBtn.classList.add('hidden-mesh');
        visBtn.querySelector('svg').innerHTML = '<path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.82l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.74-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.34-1.2l3.52 3.52c.07-.35.13-.71.13-1.12 0-2.76-2.24-5-5-5-.41 0-.77.06-1.12.13z"/>';
      }
    });
    
    // Download part STL
    item.querySelector('.btn-download').addEventListener('click', () => {
      exportPartToSTL(mesh);
    });
    
    // Select part on clicking the list item
    item.addEventListener('click', (e) => {
      if (e.target.closest('.part-btn')) return;
      if (toolMode !== 'move') {
        setToolMode('move');
      }
      selectSplitMesh(mesh);
    });
    
    splitPartsList.appendChild(item);
  });
}

// Merge back / return to painting
btnMergeBack.addEventListener('click', () => {
  clearSplitMeshes();
  updateWorkbenchStatusText();
  showToast('Returned to Paint Editor', 'info');
});

// ==========================================
// EXPORTERS & DOWNLOADERS
// ==========================================
function exportPartToSTL(mesh) {
  const meta = mesh.userData;
  showLoading(`Exporting ${meta.partName}...`, 50);
  
  setTimeout(() => {
    try {
      const exporter = new STLExporter();
      // Generate STL as binary array
      const result = exporter.parse(mesh, { binary: true });
      
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const downloadURL = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = `${meta.partName.replace(/\s+/g, '_')}.stl`;
      link.click();
      
      URL.revokeObjectURL(downloadURL);
      hideLoading();
      showToast(`Downloaded: ${meta.partName}.stl`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Export failed: ${err.message}`, 'error');
      hideLoading();
    }
  }, 50);
}

// Bulk download all parts
btnDownloadAll.addEventListener('click', () => {
  if (splitMeshes.length === 0) return;
  
  showToast('Starting bulk download of all parts...', 'info');
  
  splitMeshes.forEach((mesh, index) => {
    setTimeout(() => {
      exportPartToSTL(mesh);
    }, index * 400); // staggering downloads to prevent browser blocking
  });
});

// ==========================================
// MESH ROTATION & AUTO-ALIGNMENT LOGIC
// ==========================================
btnRotX.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  activeMesh.rotation.x += Math.PI / 2;
  showToast('Rotated X +90°', 'info');
});

btnRotY.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  activeMesh.rotation.y += Math.PI / 2;
  showToast('Rotated Y +90°', 'info');
});

btnRotZ.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  activeMesh.rotation.z += Math.PI / 2;
  showToast('Rotated Z +90°', 'info');
});

btnAutoAlign.addEventListener('click', () => {
  if (!activeMesh || isSplit) return;
  
  activeMesh.updateMatrixWorld(true);
  
  // Calculate bounding box of the active mesh in world space
  const box = new THREE.Box3().setFromObject(activeMesh);
  
  // Translate mesh Y position so bottom is at Y = 0 (grid level)
  activeMesh.position.y -= box.min.y;
  
  // Center it in X and Z
  const centerX = (box.max.x + box.min.x) / 2;
  const centerZ = (box.max.z + box.min.z) / 2;
  activeMesh.position.x -= centerX;
  activeMesh.position.z -= centerZ;
  
  showToast('Model aligned flat on build plate and centered', 'success');
});

// ==========================================
// PAINT BOUNDARY SMOOTHING (MEDIAN FILTER) LOGIC
// ==========================================
function getFaceColor(faceIdx) {
  const colors = activeMesh.geometry.attributes.color.array;
  const idx = faceIdx * 9;
  const r = Math.round(colors[idx] * 255);
  const g = Math.round(colors[idx+1] * 255);
  const b = Math.round(colors[idx+2] * 255);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 1.0, g: 1.0, b: 1.0 };
}

function smoothPaintBorders() {
  const geometry = activeMesh.geometry;
  const colorAttr = geometry.attributes.color;
  const colors = colorAttr.array;
  const faceCount = geometry.attributes.position.count / 3;
  
  // 1. Create a merged (indexed) geometry using standard mergeVertices to resolve float discrepancies
  // Tolerance scaled dynamically to the model size
  const tolerance = Math.max(0.0001, modelRadius * 0.0005);
  const mergedGeom = BufferGeometryUtils.mergeVertices(geometry, tolerance);
  
  const indexAttr = mergedGeom.index;
  if (!indexAttr) {
    showToast("Geometry merging failed. Cannot smooth borders.", "error");
    return;
  }
  
  const indices = indexAttr.array;
  const mergedFaceCount = indices.length / 3;
  
  // 2. Map each edge (pair of merged vertex indices) to the list of face indices sharing it
  const edgeMap = {};
  
  for (let i = 0; i < mergedFaceCount; i++) {
    const a = indices[i * 3];
    const b = indices[i * 3 + 1];
    const c = indices[i * 3 + 2];
    
    // Sort vertex indices lexicographically for unique edge hashing
    const edges = [
      [a, b].sort().join('_'),
      [b, c].sort().join('_'),
      [c, a].sort().join('_')
    ];
    
    edges.forEach(edgeKey => {
      if (!edgeMap[edgeKey]) edgeMap[edgeKey] = [];
      edgeMap[edgeKey].push(i);
    });
  }
  
  // 3. Map faces to their adjacent neighbors
  const faceNeighbors = Array.from({ length: mergedFaceCount }, () => []);
  for (const [edgeKey, faces] of Object.entries(edgeMap)) {
    if (faces.length > 1) {
      for (let u = 0; u < faces.length; u++) {
        for (let v = u + 1; v < faces.length; v++) {
          faceNeighbors[faces[u]].push(faces[v]);
          faceNeighbors[faces[v]].push(faces[u]);
        }
      }
    }
  }
  
  // 4. Perform multiple iterations of neighborhood majority voting (median filter)
  const newColors = new Float32Array(colors.length);
  newColors.set(colors); // copy original
  
  const ITERATIONS = 4;
  let totalSmoothedCount = 0;
  
  // Helper to read from current color buffer instead of geometry directly
  const getColorFromBuffer = (buffer, faceIdx) => {
    const idx = faceIdx * 9;
    const r = Math.round(buffer[idx] * 255);
    const g = Math.round(buffer[idx + 1] * 255);
    const b = Math.round(buffer[idx + 2] * 255);
    return rgbToHex(r, g, b);
  };
  
  for (let iter = 0; iter < ITERATIONS; iter++) {
    let smoothedCount = 0;
    const currentColors = new Float32Array(newColors); // Snapshot of current iteration
    
    for (let i = 0; i < mergedFaceCount; i++) {
      const myColor = getColorFromBuffer(currentColors, i);
      const neighbors = faceNeighbors[i];
      if (neighbors.length === 0) continue;
      
      // Check if the face sits on a color boundary
      let isOnBoundary = false;
      const nbColors = [];
      
      for (let n = 0; n < neighbors.length; n++) {
        const nbCol = getColorFromBuffer(currentColors, neighbors[n]);
        nbColors.push(nbCol);
        if (nbCol !== myColor) {
          isOnBoundary = true;
        }
      }
      
      if (!isOnBoundary) continue;
      
      // Vote on majority color in neighborhood
      const colorCounts = {};
      colorCounts[myColor] = 0.9; // self weight < 1.0 favors neighbors in a tie
      
      nbColors.forEach(col => {
        colorCounts[col] = (colorCounts[col] || 0) + 1.0;
      });
      
      let maxCount = 0;
      let majorityColor = myColor;
      for (const [col, count] of Object.entries(colorCounts)) {
        if (count > maxCount) {
          maxCount = count;
          majorityColor = col;
        }
      }
      
      if (majorityColor !== myColor) {
        const rgb = hexToRgb(majorityColor);
        const idx = i * 9;
        
        newColors[idx] = rgb.r;
        newColors[idx+1] = rgb.g;
        newColors[idx+2] = rgb.b;
        
        newColors[idx+3] = rgb.r;
        newColors[idx+4] = rgb.g;
        newColors[idx+5] = rgb.b;
        
        newColors[idx+6] = rgb.r;
        newColors[idx+7] = rgb.g;
        newColors[idx+8] = rgb.b;
        
        smoothedCount++;
      }
    }
    
    totalSmoothedCount += smoothedCount;
    if (smoothedCount === 0) break; // converge early
  }
  
  // Update geometry color attribute
  colorAttr.array.set(newColors);
  colorAttr.needsUpdate = true;
  
  // Clean up temporary geometry memory
  mergedGeom.dispose();
}

// ==========================================
// OBJECT POSITIONING SYNCHRONIZER LOGIC
// ==========================================
function updateSidebarPositionValues(pos) {
  inputPosX.value = Math.round(pos.x);
  sliderPosX.value = Math.round(pos.x);
  
  inputPosY.value = Math.round(pos.y);
  sliderPosY.value = Math.round(pos.y);
  
  inputPosZ.value = Math.round(pos.z);
  sliderPosZ.value = Math.round(pos.z);
}

function updatePositionSlidersRange(radius) {
  // Bound limit is roughly 1.5 times the bounding radius
  const limit = Math.max(10, Math.round(radius * 1.5));
  
  sliderPosX.min = -limit;
  sliderPosX.max = limit;
  sliderPosY.min = -limit;
  sliderPosY.max = limit;
  sliderPosZ.min = -limit;
  sliderPosZ.max = limit;
}

function onPositionControlChange(axis, val) {
  const target = transformControls.object;
  if (target) {
    target.position[axis] = val;
    
    // Synchronize number input and range slider
    if (axis === 'x') {
      inputPosX.value = Math.round(val);
      sliderPosX.value = Math.round(val);
    } else if (axis === 'y') {
      inputPosY.value = Math.round(val);
      sliderPosY.value = Math.round(val);
    } else if (axis === 'z') {
      inputPosZ.value = Math.round(val);
      sliderPosZ.value = Math.round(val);
    }
  }
}

// Add input & slider listeners
inputPosX.addEventListener('input', (e) => onPositionControlChange('x', parseFloat(e.target.value) || 0));
sliderPosX.addEventListener('input', (e) => onPositionControlChange('x', parseFloat(e.target.value) || 0));

inputPosY.addEventListener('input', (e) => onPositionControlChange('y', parseFloat(e.target.value) || 0));
sliderPosY.addEventListener('input', (e) => onPositionControlChange('y', parseFloat(e.target.value) || 0));

inputPosZ.addEventListener('input', (e) => onPositionControlChange('z', parseFloat(e.target.value) || 0));
sliderPosZ.addEventListener('input', (e) => onPositionControlChange('z', parseFloat(e.target.value) || 0));

// Reset position button listener
btnResetPos.addEventListener('click', () => {
  const target = transformControls.object;
  if (target) {
    if (target === activeMesh) {
      target.position.set(0, 0, 0);
      autoAlignModel(); // re-align flat to grid helper
    } else {
      // For split parts, reset to initial relative origin
      target.position.set(activeMesh.position.x, activeMesh.position.y, activeMesh.position.z);
    }
    updateSidebarPositionValues(target.position);
    showToast('Reset position to default origin', 'info');
  }
});

// ==========================================
// FLOATING VIEWPORT ZOOM & FOCUS CONTROLS
// ==========================================
btnZoomIn.addEventListener('click', () => {
  // Zoom in relative to the active target
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
  const step = Math.max(1, modelRadius * 0.25);
  camera.position.addScaledVector(dir.normalize(), step);
  controls.update();
});

btnZoomOut.addEventListener('click', () => {
  // Zoom out relative to the active target
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
  const step = Math.max(1, modelRadius * 0.25);
  camera.position.addScaledVector(dir.normalize(), step);
  controls.update();
});

btnZoomFit.addEventListener('click', () => {
  let targetMesh = activeMesh;
  if (isSplit) {
    targetMesh = selectedSplitMesh || splitMeshes[0];
  }
  
  if (!targetMesh) {
    showToast('No model loaded to focus', 'warning');
    return;
  }
  
  const box = new THREE.Box3().setFromObject(targetMesh);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
  cameraZ *= 1.4; // add visual padding
  
  // Reposition camera and target center
  controls.target.copy(center);
  camera.position.set(center.x, center.y + maxDim * 0.7, center.z + cameraZ);
  controls.update();
  showToast('View focused on object', 'info');
});

// ==========================================
// PROJECT FILE SERIALIZATION & LOADING HELPERS
// ==========================================
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, sub);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function loadProjectFile(file) {
  showLoading("Reading project file...", 20);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const projectData = JSON.parse(e.target.result);
      if (projectData.appName !== "3D Unmounth Studio") {
        throw new Error("Invalid project file format");
      }
      
      showLoading("Restoring 3D geometry...", 50);
      
      const arrayBuffer = base64ToArrayBuffer(projectData.modelData);
      
      // Store globals
      loadedModelRawData = projectData.modelData;
      loadedModelName = projectData.modelName;
      loadedModelExt = projectData.fileExtension;
      
      // Display file badge in sidebar
      fileBadgeContainer.innerHTML = `
        <div class="file-info-badge">
          <div class="file-info-name" title="${projectData.modelName}">${projectData.modelName} (Project)</div>
          <div class="file-info-remove" id="btn-remove-file">&times;</div>
        </div>
      `;
      
      const removeBtn = document.getElementById('btn-remove-file');
      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          unloadMesh();
          loadedModelRawData = null;
          loadedModelName = "";
          loadedModelExt = "";
          fileBadgeContainer.innerHTML = '';
          fileInput.value = '';
          showToast('Model removed', 'info');
        });
      }
      
      setTimeout(() => {
        parseAndLoadModel(arrayBuffer, projectData.fileExtension, () => {
          // Restore position, rotation, scale
          activeMesh.position.set(projectData.position.x, projectData.position.y, projectData.position.z);
          activeMesh.rotation.set(projectData.rotation.x, projectData.rotation.y, projectData.rotation.z);
          activeMesh.scale.set(projectData.scale.x, projectData.scale.y, projectData.scale.z);
          
          // Restore colors
          const colorsAttr = activeMesh.geometry.attributes.color;
          if (colorsAttr.array.length === projectData.colors.length) {
            colorsAttr.array.set(projectData.colors);
            colorsAttr.needsUpdate = true;
          } else {
            showToast("Warning: project color size mismatch. Restored base mesh.", "warning");
          }
          
          // Update sidebars
          updateSidebarPositionValues(activeMesh.position);
          updatePositionSlidersRange(modelRadius);
          
          hideLoading();
          showToast(`Project '${projectData.modelName}' restored!`, 'success');
        });
      }, 50);
      
    } catch (err) {
      console.error(err);
      showToast(`Failed to restore project: ${err.message}`, 'error');
      hideLoading();
    }
  };
  reader.readAsText(file);
}

// ==========================================
// APPLICATION ENTRY POINT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Render presets
  renderColorPalette();
  
  // Check user login session
  checkAuth();
  
  // Set brush indicator color initially
  if (brushIndicator && brushIndicator.material) {
    brushIndicator.material.color.set(activeColor);
  }
  
  updateWorkbenchStatusText();
});

// Clean up WebGL context during hot-reloads (Vite HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (renderer) {
      renderer.dispose();
    }
  });
}
