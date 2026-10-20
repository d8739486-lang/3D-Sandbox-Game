import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Предотвращаем спам SecurityError / PointerLockControls в консоли
if (typeof document !== 'undefined') {
  document.addEventListener('pointerlockerror', (e) => {
    if (e && typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }
  }, true);
}
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import { Peer } from 'peerjs';


// --- Инициализация физического мира CANNON с высокой оптимизацией ---
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0)
});
// SAPBroadphase: алгоритм O(N log N) вместо медленного полного перебора O(N^2)
world.broadphase = new CANNON.SAPBroadphase(world);
// Включаем засыпание (sleep) неподвижных тел: они больше не тратят ресурсы процессора
world.allowSleep = true;
world.solver.iterations = 35;
world.solver.tolerance = 0.0001;
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.25;

// Материалы коллизий для кубов и пола
const groundMaterial = new CANNON.Material('ground');
const cubeMaterial = new CANNON.Material('cube');

const cubeGroundContact = new CANNON.ContactMaterial(groundMaterial, cubeMaterial, {
  friction: 0.3,
  restitution: 0.25, // кубы отскакивают и свободно катятся при броске
  contactEquationStiffness: 1e7,
  contactEquationRelaxation: 3
});
const cubeCubeContact = new CANNON.ContactMaterial(cubeMaterial, cubeMaterial, {
  friction: 0.3,
  restitution: 0.2, // естественный мягкий отскок при столкновении блоков
  contactEquationStiffness: 5e6,
  contactEquationRelaxation: 4
});
world.addContactMaterial(cubeGroundContact);
world.addContactMaterial(cubeCubeContact);

// Физическая платформа baseplate (512x512, толщина 2, верх на y = 0)
// За ее пределами — настоящая открытая пустота / бездна
const baseplateSize = 512;
const groundShape = new CANNON.Box(new CANNON.Vec3(baseplateSize / 2, 1, baseplateSize / 2));
const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: groundShape,
  material: groundMaterial
});
groundBody.position.set(0, -1, 0);
world.addBody(groundBody);

const scene = new THREE.Scene();

// --- Скайбокс: белый горизонт, плавный переход в чёрный в зените и чёрная точка в самом центре ---
const skyVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = `
  varying vec3 vWorldPosition;
  uniform float uRedness;
  void main() {
    vec3 dir = normalize(vWorldPosition);
    float y = clamp(dir.y, 0.0, 1.0);

    // Плавный переход от белого у горизонта к черному наверху
    float t = pow(y, 1.6);
    vec3 normalCol = mix(vec3(1.0, 1.0, 1.0), vec3(0.0, 0.0, 0.0), t);
    
    // Зловещее красное небо во время ивента
    vec3 bloodCol = mix(vec3(0.95, 0.12, 0.12), vec3(0.18, 0.01, 0.02), t);
    vec3 col = mix(normalCol, bloodCol, clamp(uRedness, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const skyGeo = new THREE.SphereGeometry(800, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uRedness: { value: 0.0 }
  },
  vertexShader: skyVertexShader,
  fragmentShader: skyFragmentShader,
  side: THREE.BackSide,
  depthWrite: false
});
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, -999, 0);

const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight - 26);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// 3D-сцена и рендерер активны для отображения динамического фона меню и игры
renderer.domElement.style.display = 'block';
document.body.appendChild(renderer.domElement);

// --- Освещение для объема и видимости поверхности ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

// --- Процедурная текстура современных стадов Roblox (закругленные квадраты) ---
function createRobloxStudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Базовый цвет темного бейсплейта Roblox (Dark Stone Grey)
  ctx.fillStyle = '#545558';
  ctx.fillRect(0, 0, 128, 128);

  // Параметры закругленного квадрата (Roblox stud)
  const x = 20;
  const y = 20;
  const w = 88;
  const h = 88;
  const radius = 18;

  function roundedRect(ox, oy, width, height, r) {
    ctx.beginPath();
    ctx.moveTo(ox + r, oy);
    ctx.lineTo(ox + width - r, oy);
    ctx.quadraticCurveTo(ox + width, oy, ox + width, oy + r);
    ctx.lineTo(ox + width, oy + height - r);
    ctx.quadraticCurveTo(ox + width, oy + height, ox + width - r, oy + height);
    ctx.lineTo(ox + r, oy + height);
    ctx.quadraticCurveTo(ox, oy + height, ox, oy + height - r);
    ctx.lineTo(ox, oy + r);
    ctx.quadraticCurveTo(ox, oy, ox + r, oy);
    ctx.closePath();
  }

  // 1. Мягкая внешняя тень снизу-справа (объем)
  roundedRect(x + 4, y + 5, w, h, radius);
  ctx.fillStyle = 'rgba(25, 26, 28, 0.55)';
  ctx.fill();

  // 2. Внешний светлый скос сверху-слева (Bevel highlight)
  roundedRect(x - 2, y - 2, w + 4, h + 4, radius + 2);
  ctx.fillStyle = 'rgba(130, 133, 138, 0.45)';
  ctx.fill();

  // 3. Основная скошенная фаска
  roundedRect(x, y, w, h, radius);
  ctx.fillStyle = '#3f4043';
  ctx.fill();

  // 4. Верхняя площадка стада со световым градиентом
  roundedRect(x + 5, y + 4, w - 10, h - 10, radius - 4);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#6c6e73'); // свет сверху
  grad.addColorStop(1, '#535559'); // тень снизу
  ctx.fillStyle = grad;
  ctx.fill();

  // 5. Тонкий верхний блик по кромке
  ctx.beginPath();
  ctx.moveTo(x + radius, y + 4);
  ctx.lineTo(x + w - radius, y + 4);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1024, 1024); // Уменьшенный в 4 раза размер стадов
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const studTexture = createRobloxStudTexture();

// --- Baseplate (Roblox-style платформа) ---
const baseplateGeo = new THREE.BoxGeometry(baseplateSize, 2, baseplateSize);
const baseplateMat = new THREE.MeshStandardMaterial({
  map: studTexture,
  roughness: 0.65,
  metalness: 0.1
});
const baseplate = new THREE.Mesh(baseplateGeo, baseplateMat);
baseplate.position.y = -1; // верхняя грань на y = 0
scene.add(baseplate);

// --- Управление от 1 лица (PointerLockControls) ---
const controls = new PointerLockControls(camera, document.body);

// --- Меню спавна предметов (открытие/закрытие на B) ---
const spawnMenu = document.getElementById('spawn-menu');
const closeMenuBtn = document.getElementById('close-menu');
const customCursorEl = document.getElementById('custom-cursor');
const crosshairEl = document.getElementById('crosshair');
const pauseOverlay = document.getElementById('pause-overlay');
let isMenuOpen = false;
let isPaused = false;
let isRotateMenuOpen = false;
let rotateTargetObj = null;
const rotateMenuEl = document.getElementById('rotate-menu');

// Позиция виртуального кастомного курсора в окне
let mouseScreenX = window.innerWidth / 2;
let mouseScreenY = window.innerHeight / 2;

// Переменные системы сильного броска по зажатию ПКМ (с осцилляцией силы вверх-вниз)
const throwPowerOverlay = document.getElementById('throw-power-overlay');
const throwPowerFill = document.getElementById('throw-power-fill');
const throwPowerVal = document.getElementById('throw-power-val');
let isChargingThrow = false;
let throwChargeStartTime = 0;
let throwChargeProgress = 0.5; // 0.0 -> 1.0

function updateThrowPowerUI(progress) {
  const percent = Math.round(progress * 100);
  if (throwPowerFill) throwPowerFill.style.width = `${percent}%`;
  if (throwPowerVal) throwPowerVal.textContent = `${percent}%`;
}

// ============================================================================
// --- СИСТЕМА ПРЕЛОАДЕРА И ГЛАВНОГО МЕНЮ (3D SANDBOX) ---
// ============================================================================
const preloaderOverlay = document.getElementById('preloader-overlay');
const preloaderFill = document.getElementById('preloader-fill');
const mainMenuEl = document.getElementById('main-menu');
const btnPlay = document.getElementById('btn-play');
const btnSettings = document.getElementById('btn-settings');
const btnExit = document.getElementById('btn-exit');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnApplySettings = document.getElementById('btn-apply-settings');
// --- Настройки игры (Громкость, FOV, Чувствительность) ---
let masterVolume = 1.0;
let sfxVolume = 0.8;
let musicVolume = 0.5;
let currentDefaultFov = 70; // Дефолтный FOV 70, макс 90
let mouseSensMultiplier = 1.0;

const settingVolMaster = document.getElementById('setting-vol-master');
const settingVolSfx = document.getElementById('setting-vol-sfx');
const settingVolMusic = document.getElementById('setting-vol-music');
const settingFov = document.getElementById('setting-fov');
const settingSens = document.getElementById('setting-sens');

const valVolMaster = document.getElementById('val-vol-master');
const valVolSfx = document.getElementById('val-vol-sfx');
const valVolMusic = document.getElementById('val-vol-music');
const valFov = document.getElementById('val-fov');
const valSens = document.getElementById('val-sens');

let isGameStarted = false; // До нажатия «Играть» игра в режиме меню
let isInMainMenu = true;

// ============================================================================
// --- СИСТЕМА ДИНАМИЧЕСКОГО ХАОСА НА ФОНЕ ГЛАВНОГО МЕНЮ (3D MENU CHAOS) ---
// ============================================================================
// В главном меню разворачивается масштабный и разнообразный физический экшен:
// 1. Статичная камера под сбалансированным углом без искажений бэйсплейта
// 2. Ядерная бомба (nuke_bomb.glb, смотрящая строго носом вниз!) со взрывом и резким сбросом через 0.5с
// 3. Гроза, ливень и молнии, бьющие в землю с яркими вспышками и искрами
// 4. Огненный метеорит с последующим тушением водой из облака и паром
// 5. Вихрь/торнадо из кубов (антигравитация)
// 6. Орбитальный лазерный удар с фокусировкой луча
// 7. Мега-домино и супер-батут (джамппад)
// 8. Двойные башни, пушечные ядра, непрерывный ливень цветных шаров и летающие шипы
const menuChaosSceneGroup = new THREE.Group();
scene.add(menuChaosSceneGroup);

// Статичная позиция камеры: идеально сбалансированный вид на бэйсплейт без искажений
const menuCamera = new THREE.PerspectiveCamera(54, window.innerWidth / (window.innerHeight - 26), 0.1, 1000);
const MENU_CAM_POS = new THREE.Vector3(0, 8.5, 21.0);
const MENU_CAM_TARGET = new THREE.Vector3(0, 2.2, 0);
menuCamera.position.copy(MENU_CAM_POS);
menuCamera.lookAt(MENU_CAM_TARGET);

// Смещение для сотрясения экрана при взрывах
let menuCameraShake = 0;

// Материал для ультра-прыгучих цветных шаров фона меню
const menuBouncyMaterial = new CANNON.Material('menuBouncy');
world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, menuBouncyMaterial, {
  friction: 0.15,
  restitution: 0.85
}));
world.addContactMaterial(new CANNON.ContactMaterial(cubeMaterial, menuBouncyMaterial, {
  friction: 0.2,
  restitution: 0.75
}));

const menuPhysicsBodies = [];

// Нейтральная палитра для динамичных объектов (серый, бетон, сталь, графит - БЕЗ цветных попугайских фигур)
const MONO_CHAOS_COLORS = [
  0xb8bac0, // Классический серый бетон кубов песочницы
  0xd0d2d8, // Светлый матовый бетон
  0x94979e, // Средний цемент
  0x787b82, // Тёмный бетон
  0x555860, // Графит
  0xe2e4ea  // Светлая побелка
];

function getRandomChaosColor() {
  return MONO_CHAOS_COLORS[Math.floor(Math.random() * MONO_CHAOS_COLORS.length)];
}

// Общие переиспользуемые геометрии
const menuBoxGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
const menuBoxShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
const menuBallGeo = new THREE.SphereGeometry(0.7, 16, 16);
const menuBallShape = new CANNON.Sphere(0.7);

// Добавление тела в список с контролем лимита для железных 60 FPS
function addMenuPhysicsItem(mesh, body, isKinematic = false, vel = null, rotVel = null) {
  if (menuPhysicsBodies.length > 130) {
    const old = menuPhysicsBodies.shift();
    if (old.body) world.removeBody(old.body);
    if (old.mesh) menuChaosSceneGroup.remove(old.mesh);
  }
  menuChaosSceneGroup.add(mesh);
  if (body) {
    world.addBody(body);
  }
  menuPhysicsBodies.push({
    mesh,
    body,
    customKinematic: isKinematic,
    vel,
    rotVel
  });
}

// ============================================================================
// --- ПРОЦЕДУРНЫЙ ЗВУКОВОЙ ДВИЖОК ДЛЯ ИВЕНТОВ МЕНЮ (WEB AUDIO API) ---
// ============================================================================
// Все звуки фоновых событий меню звучат ПРИГЛУШЁННО И ТИХО ВДАЛЕКЕ (OG далёкий эмбиент)
const MENU_BG_SOUND_VOLUME = 0.16;

function playMenuSound(synthFn, customFileUrl = null) {
  if (customFileUrl) {
    try {
      const audio = new Audio(customFileUrl);
      audio.volume = Math.max(0, Math.min(1, masterVolume * sfxVolume * MENU_BG_SOUND_VOLUME));
      audio.play().catch(() => {
        if (synthFn) synthFn();
      });
      return;
    } catch (_) {}
  }
  if (synthFn) synthFn();
}

// 1. Сирена ядерной тревоги (приглушённая вдалеке)
function synthNukeAlarm() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, now); // приглушение высоких частот вдалеке
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.linearRampToValueAtTime(820, now + 0.4);
  osc.frequency.linearRampToValueAtTime(440, now + 0.8);
  osc.frequency.linearRampToValueAtTime(820, now + 1.2);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12 * masterVolume * sfxVolume, now + 0.1);
  gain.gain.linearRampToValueAtTime(0, now + 1.6);
  osc.connect(gain);
  gain.connect(filter);
  filter.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.6);
}

let activeNukeAudioStopFn = null;
let activeNukeAudioEl = null;

// 2. Глухой мощный ядерный взрыв
// 2. Глухой мощный ядерный взрыв (приглушённый вдали, глубокий рокот)
function synthNukeExplosion() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const nukeMasterGain = ctx.createGain();
  nukeMasterGain.gain.setValueAtTime(1.0, now);
  nukeMasterGain.connect(ctx.destination);

  // Саб-басовый удар вдали
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(95, now);
  osc.frequency.exponentialRampToValueAtTime(28, now + 0.8);
  oscGain.gain.setValueAtTime(0.20 * masterVolume * sfxVolume, now);
  oscGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
  osc.connect(oscGain);
  oscGain.connect(nukeMasterGain);
  osc.start(now);

  // Низкочастотный приглушённый шум взрыва (глубокий lowpass фильтр 240 Гц)
  const bufferSize = ctx.sampleRate * 1.5;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(240, now);
  filter.frequency.exponentialRampToValueAtTime(45, now + 1.4);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22 * masterVolume * sfxVolume, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(nukeMasterGain);
  noise.start(now);

  activeNukeAudioStopFn = () => {
    try {
      nukeMasterGain.gain.setValueAtTime(0, ctx.currentTime);
      osc.stop();
      noise.stop();
      nukeMasterGain.disconnect();
    } catch (_) {}
  };
}

// 3.1. Ускоряющийся писк таймера ядерных боеголовок (приглушённый вдали)
function synthNukeWarningBeep(freq = 880, duration = 0.05) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, now);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.14 * masterVolume * sfxVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(filter);
  filter.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// 3.2. Глухой металлический удар при падении ядерки в кучу (вдали)
function synthNukeThud() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.13);
  gain.gain.setValueAtTime(0.16 * masterVolume * sfxVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
  osc.connect(gain);
  gain.connect(filter);
  filter.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

// 3.3. Мемный зависший спам звуков ошибок Windows (win_error.wav / win_error2.wav)
let winErrorSoundToggle = false;
function playGlitchWinError() {
  winErrorSoundToggle = !winErrorSoundToggle;
  const targetFile = winErrorSoundToggle ? './sounds/win_error.wav' : './sounds/win_error2.wav';
  const fallbackFile = winErrorSoundToggle ? './sounds/windows-10-error-sound.mp3' : './sounds/erro.mp3';

  try {
    const audio = new Audio(targetFile);
    // Приглушённый, далёкий звук ошибки
    audio.volume = Math.max(0, Math.min(1, masterVolume * sfxVolume * 0.25));
    // Небольшой случайный сдвиг питча для реалистичного «глюкающего/орущего» зависания
    audio.playbackRate = 0.88 + Math.random() * 0.28;
    audio.play().catch(() => {
      try {
        const fbAudio = new Audio(fallbackFile);
        fbAudio.volume = Math.max(0, Math.min(1, masterVolume * sfxVolume * 0.25));
        fbAudio.play().catch(() => {
          synthWinErrorSound(winErrorSoundToggle ? 1 : 2);
        });
      } catch (_) {
        synthWinErrorSound(winErrorSoundToggle ? 1 : 2);
      }
    });
  } catch (_) {
    synthWinErrorSound(winErrorSoundToggle ? 1 : 2);
  }
}

function playWinErrorSound() {
  playGlitchWinError();
}

function synthWinErrorSound(type = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200; // приглушение высоких частот
  filter.connect(ctx.destination);

  if (type === 1) {
    // Windows Critical Stop / Error Chord
    [150, 220].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18 * masterVolume * sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  } else {
    // Windows Ding / Exclamation Error
    [330, 495].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.16 * masterVolume * sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(now + 0.28);
    });
  }
}

// 4. Гром и молния (очень далёкий, мягкий приглушённый раскат)
function synthThunder() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * 1.5);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(140, now); // глубокий приглушённый бас вдали без резких высоких частот
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.045 * masterVolume * sfxVolume, now); // тихо и ненавязчиво
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

// 5. Шипение воды / облако (тихое мягкое шипение вдали)
function synthExtinguishSteam() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.floor(ctx.sampleRate * 0.7);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(900, now); // мягкий средний тон вместо визгливого шипения
  filter.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.03 * masterVolume * sfxVolume, now); // тихий шелест
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
}

// 6. Орбитальный лазер (приглушённый вдали)
function synthLaserZap() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(950, now);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1100, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.28);
  gain.gain.setValueAtTime(0.14 * masterVolume * sfxVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
  osc.connect(gain);
  gain.connect(filter);
  filter.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

// 7. Пружинный отскок джамппада (Boing)
function synthBoing() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.16);
  gain.gain.setValueAtTime(0.12 * masterVolume * sfxVolume, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

// ============================================================================
// --- ЗАГРУЗКА И ТОЧНАЯ ОРИЕНТАЦИЯ МОДЕЛИ ЯДЕРНОЙ БОМБЫ (nuke_bomb.glb) ---
// ============================================================================
let nukePreparedModel = null;

// Загрузка nuke_bomb.glb с разворотом строго носом вниз
const nukeGltfLoader = new GLTFLoader();
nukeGltfLoader.load(
  './nuke_bomb.glb',
  (gltf) => {
    const rawModel = gltf.scene;

    // Включаем тени
    rawModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Точные координаты наконечника (Tip) и хвоста (Tail) в исходной модели:
    // Tip:  [-0.3923, -0.0986, 0.2093]
    // Tail: [ 0.4710,  0.1722, -0.0639]
    // Длина исходной модели вдоль оси: ~0.945 м
    const tip = new THREE.Vector3(-0.3923, -0.0986, 0.2093);
    const tail = new THREE.Vector3(0.4710, 0.1722, -0.0639);
    const mid = new THREE.Vector3().addVectors(tip, tail).multiplyScalar(0.5);

    // Масштабируем до удобного размера бомбы: длина 3.2м
    const targetLength = 3.2;
    const targetScale = targetLength / 0.9451;
    rawModel.scale.setScalar(targetScale);

    // Центрируем геометрический центр точно в (0, 0, 0)
    rawModel.position.set(-mid.x * targetScale, -mid.y * targetScale, -mid.z * targetScale);

    // Обертка для поворота носом строго вниз (-Y)
    const wrapper = new THREE.Group();
    wrapper.add(rawModel);

    // Вектор оси бомбы от хвоста к носу
    const axisDir = new THREE.Vector3().subVectors(tip, tail).normalize();
    const downDir = new THREE.Vector3(0, -1, 0);
    const alignQuat = new THREE.Quaternion().setFromUnitVectors(axisDir, downDir);
    wrapper.quaternion.copy(alignQuat);

    nukePreparedModel = wrapper;
    console.log('nuke_bomb.glb успешно загружена, отцентрирована и сориентирована строго носом вниз!');
  },
  undefined,
  (err) => {
    console.warn('nuke_bomb.glb не загрузилась, используем процедурную модель:', err);
  }
);

// Процедурный запасной вариант ядерной бомбы (тоже строго носом вниз)
function createProceduralNukeModel() {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 3.2, 16);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2e3532, metalness: 0.7, roughness: 0.3 });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  // Острый нос, смотрящий строго вниз
  const noseGeo = new THREE.ConeGeometry(0.65, 1.3, 16);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xd63031, metalness: 0.6, roughness: 0.2 });
  const noseMesh = new THREE.Mesh(noseGeo, noseMat);
  noseMesh.rotation.x = Math.PI; // острием вниз
  noseMesh.position.y = -2.25;
  group.add(noseMesh);

  // Стабилизаторы на хвосте
  const finGeo = new THREE.BoxGeometry(0.1, 0.9, 2.0);
  const finMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.5 });
  const fin1 = new THREE.Mesh(finGeo, finMat);
  fin1.position.y = 1.3;
  group.add(fin1);
  const fin2 = fin1.clone();
  fin2.rotation.y = Math.PI / 2;
  group.add(fin2);

  return group;
}

// ============================================================================
// --- СИСТЕМА ИВЕНТОВ ХАОСА (ЯДЕРКА, ГРОЗА, ПОЖАР, ВИХРЬ, ЛАЗЕР, БАТУТ) ---
// ============================================================================

// ============================================================================
// --- РЕДКИЙ ТРОЛЛЬ-ИВЕНТ: СКОПЛЕНИЕ ЯДЕРОК В КУЧУ, ПИСК, ФЕЙК-ЛАГ И СБРОС ---
// ============================================================================

// Флаг искусственного фейк-лага ТОЛЬКО для 3D фона меню (тролль для игрока!)
let menuFakeLagActive = false;
let menuFakeLagNextRenderTime = 0;

let nukePileState = 'idle'; // 'idle' | 'warning' | 'accumulating' | 'armed_beeping' | 'exploded'
let nukePileWarningTimer = 0;
// Редкий супер-ивент: первое срабатывание через ~40-65 сек, затем каждые 85-130 сек
let nukeRareTrollTimer = 40.0 + Math.random() * 25.0;

let nukePileList = [];      // Упавшие и зафиксированные в куче ядерки
let nukeFallingList = [];   // Падающие в данный момент бомбы
const nukeTotalBombs = 7;   // Количество ядерок, скапливающихся в кучу
let nukeSpawnedCount = 0;
let nukeNextDropTimer = 0;
let nukeBeepTimer = 0;
let nukeArmingStartTime = 0;
let nukeExplodeStartTime = 0;
let nukeLastGlitchToggleTime = 0;
let nukeExplosionGroup = null;
let nukeTargetCenter = new THREE.Vector3(1.4, 0.05, -2.2);
let nukeWarningCircle = null;

// Офсеты для реалистичной кучи из 7 ядерок (все смотрят носом строго вниз, образуя горку боеголовок)
const nukePileOffsets = [
  { x: 0.0,   z: 0.0,   targetY: 0.85, rotZ: 0.0,   rotX: 0.0 },
  { x: -0.65, z: 0.4,   targetY: 0.90, rotZ: 0.07,  rotX: -0.05 },
  { x: 0.7,   z: -0.35, targetY: 0.90, rotZ: -0.08, rotX: 0.06 },
  { x: -0.3,  z: -0.65, targetY: 0.95, rotZ: -0.05, rotX: -0.07 },
  { x: 0.4,   z: 0.55,  targetY: 1.55, rotZ: 0.11,  rotX: 0.06 }, // 2-й ярус кучи
  { x: -0.45, z: -0.05, targetY: 1.95, rotZ: -0.10, rotX: -0.05 },
  { x: 0.05,  z: 0.05,  targetY: 2.75, rotZ: 0.04,  rotX: 0.04 }  // верхушка кучи
];

// Знаменитая текстура ошибки Valve / Source Engine: фиолетово-черные шашечки (Missing Texture)
let missingTextureMaterial = null;
function getMissingTextureMaterial() {
  if (missingTextureMaterial) return missingTextureMaterial;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const size = 32;

  // Шахматка маджента (#ff00ff) / черный (#000000)
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillRect(size, size, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);

  missingTextureMaterial = new THREE.MeshBasicMaterial({ map: texture });
  return missingTextureMaterial;
}

let nukeGlitchIsMissing = false;
let nukeGlitchNextSpamTime = 0;
let nukeGlitchBurstRemaining = 0;

function toggleNukeGlitchTextures() {
  nukeGlitchIsMissing = !nukeGlitchIsMissing;
  const missingMat = getMissingTextureMaterial();

  for (const item of nukePileList) {
    if (item.meshMaterialPairs) {
      for (const pair of item.meshMaterialPairs) {
        pair.mesh.material = nukeGlitchIsMissing ? missingMat : pair.origMaterial;
      }
    }
    // Дёргаем и глючим позицию и масштаб ядерок для эффекта «орущего бага»
    if (item.group && item.pileInfo) {
      const p = item.pileInfo;
      const jitter = nukeGlitchIsMissing ? 0.25 : 0;
      item.group.position.x = nukeTargetCenter.x + p.x + (Math.random() - 0.5) * jitter;
      item.group.position.z = nukeTargetCenter.z + p.z + (Math.random() - 0.5) * jitter;
      const sc = nukeGlitchIsMissing ? (1.0 + (Math.random() - 0.5) * 0.3) : 1.0;
      item.group.scale.set(sc, sc, sc);
    }
  }
}

// Зависающий случайный спам звуков ошибок Windows во время 5-секундного лага
function updateNukeAudioFreezeSpam(time) {
  if (nukePileState !== 'exploded') return;

  const elapsed = time - nukeExplodeStartTime;
  if (elapsed >= 5000) {
    resetNukeGagToNormal();
    return;
  }

  // Зависливый рандомный спам: серия быстрых пулемётных щелчков, затем случайная заминка
  if (time >= nukeGlitchNextSpamTime) {
    if (nukeGlitchBurstRemaining <= 0) {
      nukeGlitchBurstRemaining = 3 + Math.floor(Math.random() * 5); // 3-7 звуков в пачке зависания
    }

    playGlitchWinError();
    toggleNukeGlitchTextures();

    nukeGlitchBurstRemaining--;

    if (nukeGlitchBurstRemaining > 0) {
      // Пулемётный завис (60-120мс)
      nukeGlitchNextSpamTime = time + (55 + Math.random() * 65);
    } else {
      // Случайная заминка между пачками зависания (200-450мс)
      nukeGlitchNextSpamTime = time + (200 + Math.random() * 250);
    }
  }
}

function createNukePhysicsInstance(spawnX, spawnY, spawnZ, isInitial = false) {
  const group = new THREE.Group();
  const baseModel = nukePreparedModel ? nukePreparedModel.clone(true) : createProceduralNukeModel();
  group.add(baseModel);

  // Красный светодиодный маячок тревоги на хвосте каждой ядерки
  const beaconGeo = new THREE.SphereGeometry(0.18, 10, 10);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, 2.7, 0); // верхняя часть хвоста
  group.add(beaconMesh);

  // Сохраняем все меши модели и их исходные материалы для переключения на missing texture
  const meshMaterialPairs = [];
  group.traverse((child) => {
    if (child.isMesh && child !== beaconMesh) {
      meshMaterialPairs.push({
        mesh: child,
        origMaterial: child.material
      });
    }
  });

  // Физическое тело Cannon.js: масса 35, форма цилиндр/бокс для реалистичного кувыркания и упора друг на друга
  const nukeShape = new CANNON.Box(new CANNON.Vec3(0.65, 1.6, 0.65));
  const body = new CANNON.Body({
    mass: 35.0,
    shape: nukeShape,
    material: cubeMaterial,
    linearDamping: 0.15,
    angularDamping: 0.35
  });

  body.position.set(spawnX, spawnY, spawnZ);

  // Задаем легкое начальное отклонение чтобы бомбы реалистично заваливались друг на друга
  const tiltX = (Math.random() - 0.5) * 0.45;
  const tiltZ = (Math.random() - 0.5) * 0.45;
  const initialQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, Math.random() * Math.PI, tiltZ));
  body.quaternion.set(initialQuat.x, initialQuat.y, initialQuat.z, initialQuat.w);

  // Скорость падения вниз
  body.velocity.set(
    (Math.random() - 0.5) * 1.5,
    -32.0 - Math.random() * 8.0,
    (Math.random() - 0.5) * 1.5
  );
  body.angularVelocity.set((Math.random() - 0.5) * 2.0, (Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 2.0);

  // Звук удара о базу или другие ядерки
  let hasHitOnce = false;
  body.addEventListener('collide', (e) => {
    if (!hasHitOnce) {
      hasHitOnce = true;
      synthNukeThud();
      menuCameraShake = 0.22;
      beaconMat.color.setHex(0xff0000);
    }
  });

  world.addBody(body);
  menuChaosSceneGroup.add(group);

  const nukeObj = {
    group,
    body,
    beaconMat,
    beaconMesh,
    meshMaterialPairs,
    hasSettled: false,
    spawnTime: performance.now()
  };

  return nukeObj;
}

// Запуск редкого ивента накопления ядерок в кучу
function triggerNukePileupEvent() {
  if (nukePileState !== 'idle') return;
  nukePileState = 'warning';
  nukePileWarningTimer = 1.4; // 1.4 секунды сирены и предупреждения
  nukeSpawnedCount = 0;
  nukeNextDropTimer = 0;

  // Очистка предыдущих ядерок
  for (const item of nukePileList) {
    if (item.body) world.removeBody(item.body);
    if (item.group) menuChaosSceneGroup.remove(item.group);
  }
  nukePileList = [];

  playMenuSound(synthNukeAlarm, './sounds/nuke_siren.mp3');

  // Зона опасности на полу
  const ringGeo = new THREE.RingGeometry(2.5, 2.85, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff1100, side: THREE.DoubleSide });
  nukeWarningCircle = new THREE.Mesh(ringGeo, ringMat);
  nukeWarningCircle.position.copy(nukeTargetCenter);
  menuChaosSceneGroup.add(nukeWarningCircle);
}

// Обратная совместимость имени функции
function triggerNukeEvent() {
  triggerNukePileupEvent();
}

function updateNukeGag(delta, now) {
  if (nukePileState === 'warning') {
    nukePileWarningTimer -= delta;
    if (nukeWarningCircle) {
      const pulse = 1.0 + Math.sin(now * 0.015) * 0.25;
      nukeWarningCircle.scale.set(pulse, pulse, pulse);
    }
    if (nukePileWarningTimer <= 0) {
      nukePileState = 'accumulating';
      nukeSpawnedCount = 0;
      nukeNextDropTimer = 0;
    }
  } else if (nukePileState === 'accumulating') {
    // 1. Сбрасываем бомбы одну за другой с неба в одну зону, где они физически падают друг на друга
    if (nukeSpawnedCount < nukeTotalBombs) {
      nukeNextDropTimer -= delta;
      if (nukeNextDropTimer <= 0) {
        // Случайный разброс в пределах кучи
        const dropX = nukeTargetCenter.x + (Math.random() - 0.5) * 1.8;
        const dropZ = nukeTargetCenter.z + (Math.random() - 0.5) * 1.8;
        const dropY = 32.0 + Math.random() * 4.0;

        const nukeObj = createNukePhysicsInstance(dropX, dropY, dropZ);
        nukePileList.push(nukeObj);

        nukeSpawnedCount++;
        nukeNextDropTimer = 0.32; // Интервал между падениями ядерок
      }
    }

    // 2. Синхронизируем положение визуального меша с физическим телом Cannon.js
    let allLanded = nukeSpawnedCount >= nukeTotalBombs;
    for (const item of nukePileList) {
      if (item.body && item.group) {
        item.group.position.copy(item.body.position);
        item.group.quaternion.copy(item.body.quaternion);

        // Дымный шлейф во время полета сверху
        if (item.body.velocity.y < -10 && item.body.position.y > 2.0 && Math.random() > 0.4) {
          const smokeGeo = new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 8, 8);
          const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.6 });
          const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
          smokeMesh.position.copy(item.group.position);
          smokeMesh.position.y += 2.0;
          menuChaosSceneGroup.add(smokeMesh);
          setTimeout(() => menuChaosSceneGroup.remove(smokeMesh), 350);
        }

        // Проверяем, приземлилась ли бомба
        if (item.body.position.y > 6.0) {
          allLanded = false;
        }
      }
    }

    // 3. Когда все ядерки упали и собрались в кучу — переходим к ускоряющемуся писку взвода
    if (allLanded && nukePileList.length >= nukeTotalBombs) {
      nukePileState = 'armed_beeping';
      nukeArmingStartTime = now;
      nukeBeepTimer = 0;
    }
  } else if (nukePileState === 'armed_beeping') {
    // Синхронизируем кучу
    for (const item of nukePileList) {
      if (item.body && item.group) {
        item.group.position.copy(item.body.position);
        item.group.quaternion.copy(item.body.quaternion);
      }
    }

    const elapsed = now - nukeArmingStartTime;
    const totalArmingTime = 1800; // 1.8 секунды ускоряющегося писка перед взрывом

    nukeBeepTimer -= delta;
    if (nukeBeepTimer <= 0) {
      const progress = Math.min(1.0, elapsed / totalArmingTime);
      // Ускоряем тон писка от 780 Гц до 1650 Гц
      synthNukeWarningBeep(780 + progress * 870, 0.045);

      // Синхронно вспыхивают красные диоды на всех ядерках в куче
      for (const item of nukePileList) {
        if (item.beaconMat) {
          item.beaconMat.color.setHex(0xff1111);
          setTimeout(() => {
            if (item.beaconMat) item.beaconMat.color.setHex(0x330000);
          }, 45);
        }
      }

      // Интервал между писками сокращается: от 0.35с вплоть до безумных 0.035с
      const nextInterval = Math.max(0.035, 0.35 * Math.pow(1.0 - progress * 0.88, 1.8));
      nukeBeepTimer = nextInterval;
    }

    if (elapsed >= totalArmingTime) {
      detonateAllNukes(now);
    }
  } else if (nukePileState === 'exploded') {
    const elapsed = now - nukeExplodeStartTime;
    const totalGlitchLagTime = 5000; // Ровно 5 секунд лагов в 1 кадр/с и переключения текстур!

    if (elapsed < totalGlitchLagTime) {
      // Каждый кадр текстурки мемно мигают между missing texture и обычной!
      toggleNukeGlitchTextures();

      if (nukeExplosionGroup) {
        const progress = Math.min(1.0, elapsed / 800);
        const fireScale = 1.0 + progress * 16.0 + (Math.random() - 0.5) * 2.0;
        nukeExplosionGroup.scale.set(fireScale, fireScale * 1.2, fireScale);
      }
      menuCameraShake = 0.8 * (1.0 - elapsed / totalGlitchLagTime);
    } else {
      // Ровно через 5 секунд всё «отлагивает» и возвращается в норму без чпока!
      resetNukeGagToNormal();
    }
  }
}


// Одновременная детонация всей кучи ядерок с активацией фейк-лага фона 1 FPS на 5 секунд
function detonateAllNukes(now) {
  nukePileState = 'exploded';
  nukeExplodeStartTime = now;
  nukeLastGlitchToggleTime = now;

  // ВКЛЮЧАЕМ ФЕЙК-ЛАГ ТОЛЬКО ДЛЯ 3D ФОНА МЕНЮ (1 кадр в секунду в течение 5 секунд)!
  menuFakeLagActive = true;
  menuFakeLagNextRenderTime = now + 1000;

  // Во время взрыва резко приглушаем/останавливаем фоновую музыку меню
  if (menuMusicAudio) {
    try {
      menuMusicAudio.pause();
    } catch (_) {}
  }

  // Запуск звука мощного ядерного взрыва
  activeNukeAudioStopFn = null;
  activeNukeAudioEl = null;
  try {
    const audio = new Audio('./sounds/nuke_explosion.wav');
    audio.volume = Math.max(0, Math.min(1, masterVolume * sfxVolume));
    audio.play().then(() => {
      activeNukeAudioEl = audio;
    }).catch(() => {
      synthNukeExplosion();
    });
  } catch (_) {
    synthNukeExplosion();
  }

  // ЯДЕРКИ НЕ УДАЛЯЮТСЯ! Они остаются в куче на бейсплейте, чтобы мемно глючить 5 секунд!
  // Только скрываем маячки
  for (const item of nukePileList) {
    if (item.beaconMesh) item.beaconMesh.visible = false;
  }

  if (nukeWarningCircle) {
    menuChaosSceneGroup.remove(nukeWarningCircle);
    nukeWarningCircle = null;
  }

  // Создаем колоссальный гриб и огненные сферы взрыва
  nukeExplosionGroup = new THREE.Group();
  nukeExplosionGroup.position.copy(nukeTargetCenter);

  // Внешний огненный шар
  const fireGeo = new THREE.SphereGeometry(1.6, 16, 16);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8 });
  const fireMesh = new THREE.Mesh(fireGeo, fireMat);
  nukeExplosionGroup.add(fireMesh);

  // Средняя плазменная сфера
  const midGeo = new THREE.SphereGeometry(1.2, 14, 14);
  const midMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.85 });
  const midMesh = new THREE.Mesh(midGeo, midMat);
  nukeExplosionGroup.add(midMesh);

  // Белоснежное раскаленное ядро
  const coreGeo = new THREE.SphereGeometry(0.85, 12, 12);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  nukeExplosionGroup.add(coreMesh);

  // Взрывная ударная волна 1 (кольцо по полу)
  const waveGeo = new THREE.RingGeometry(1.2, 2.2, 32);
  waveGeo.rotateX(-Math.PI / 2);
  const waveMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, side: THREE.DoubleSide });
  const waveMesh = new THREE.Mesh(waveGeo, waveMat);
  waveMesh.position.y = 0.1;
  nukeExplosionGroup.add(waveMesh);

  // Взрывная ударная волна 2
  const waveGeo2 = new THREE.RingGeometry(2.0, 3.2, 32);
  waveGeo2.rotateX(-Math.PI / 2);
  const waveMat2 = new THREE.MeshBasicMaterial({ color: 0xff5500, side: THREE.DoubleSide });
  const waveMesh2 = new THREE.Mesh(waveGeo2, waveMat2);
  waveMesh2.position.y = 0.15;
  nukeExplosionGroup.add(waveMesh2);

  menuChaosSceneGroup.add(nukeExplosionGroup);

  // Разбрасываем все физические кубики и шары сверхмощным импульсом взрыва!
  for (const item of menuPhysicsBodies) {
    if (item.body) {
      const dx = item.body.position.x - nukeTargetCenter.x;
      const dz = item.body.position.z - nukeTargetCenter.z;
      const dist = Math.hypot(dx, dz) || 1.0;
      if (dist < 38.0) {
        const force = 120.0 / Math.max(1.0, dist * 0.35);
        item.body.velocity.x += (dx / dist) * force;
        item.body.velocity.y += 22.0 + Math.random() * 25.0;
        item.body.velocity.z += (dz / dist) * force;
      }
    }
  }

  // Вспышка на весь экран
  ambientLight.intensity = 5.5;

  // Сразу делаем первый переключатель текстуры с ошибкой Windows
  toggleNukeGlitchTextures();
}

// Полный мгновенный сброс тролль-гэга после 5 секунд: отлагивает, музыка играет, всё чисто, БЕЗ ЧПОКА!
function resetNukeGagToNormal() {
  nukePileState = 'idle';
  menuCameraShake = 0;
  ambientLight.intensity = 0.85;

  // 1. ФЕЙК-ЛАГ МГНОВЕННО ОТКЛЮЧАЕТСЯ: ФПС ФОНА СНОВА 60 FPS («ОТЛАГАЛО»)!
  menuFakeLagActive = false;

  // 2. ЗВУК ВЗРЫВА РЕЗКО И МГНОВЕННО ОБРЫВАЕТСЯ!
  if (activeNukeAudioStopFn) {
    activeNukeAudioStopFn();
    activeNukeAudioStopFn = null;
  }
  if (activeNukeAudioEl) {
    try {
      activeNukeAudioEl.pause();
      activeNukeAudioEl.currentTime = 0;
      activeNukeAudioEl = null;
    } catch (_) {}
  }

  // 3. МУЗЫКА МЕНЮ ПРОДОЛЖАЕТ ИГРАТЬ КАК НИ В ЧЁМ НЕ БЫВАЛО!
  if (menuMusicAudio && isInMainMenu) {
    menuMusicAudio.volume = Math.max(0, Math.min(1, masterVolume * musicVolume));
    menuMusicAudio.play().catch(() => {});
  }

  // 4. БЕЗ ЧПОКА (звук чпока убран по просьбе пользователя!)

  // 5. Очищаем все объекты взрыва и ядерок
  if (nukeExplosionGroup) {
    menuChaosSceneGroup.remove(nukeExplosionGroup);
    nukeExplosionGroup = null;
  }
  for (const item of nukePileList) {
    if (item.body) world.removeBody(item.body);
    if (item.group) menuChaosSceneGroup.remove(item.group);
  }
  nukePileList = [];
  if (nukeWarningCircle) {
    menuChaosSceneGroup.remove(nukeWarningCircle);
    nukeWarningCircle = null;
  }

  // 6. ПОСЛЕ ВЗРЫВА ЯДЕРКИ: сброс фона до заново, когда стоят только 2 пирамидки!
  for (const item of menuPhysicsBodies) {
    if (item.body) world.removeBody(item.body);
    if (item.mesh) menuChaosSceneGroup.remove(item.mesh);
  }
  menuPhysicsBodies.length = 0;

  // Строим ровно две свежие пирамидки слева и справа
  buildMenuTowerAt(-12.5, 4);
  buildMenuTowerAt(12.5, 4);
  leftTowerBuilt = true;
  rightTowerBuilt = true;
  leftTowerTimer = 14.0;
  rightTowerTimer = 16.0;

  // Следующий редкий ивент произойдет не скоро (через 85-130 сек)
  nukeRareTrollTimer = 85.0 + Math.random() * 45.0;
}

// Экспортируем в window для легкого вызова из консоли: window.triggerNukeTroll()
window.triggerNukeTroll = triggerNukePileupEvent;

// 2. ИВЕНТ: ГРОЗА, ДОЖДЬ И МОЛНИЯ
let stormState = 'idle'; // 'idle' | 'rain' | 'lightning' | 'clearing'
let stormTimer = 0;
let rainMeshGroup = null;
let lightningLine = null;

function triggerThunderstormEvent() {
  if (stormState !== 'idle') return;
  stormState = 'rain';
  stormTimer = 4.5;

  // Создаем частицы дождя
  const rainGeo = new THREE.BufferGeometry();
  const rainCount = 220;
  const positions = new Float32Array(rainCount * 6);
  for (let i = 0; i < rainCount; i++) {
    const x = (Math.random() - 0.5) * 40;
    const y = 2 + Math.random() * 24;
    const z = (Math.random() - 0.5) * 30;
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y - 1.2;
    positions[i * 6 + 5] = z;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.65 });
  rainMeshGroup = new THREE.LineSegments(rainGeo, rainMat);
  menuChaosSceneGroup.add(rainMeshGroup);
}

function updateThunderstorm(delta) {
  if (stormState === 'rain') {
    stormTimer -= delta;
    if (rainMeshGroup) {
      const pos = rainMeshGroup.geometry.attributes.position.array;
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] -= 32.0 * delta;
        if (pos[i] < 0) pos[i] += 26.0;
      }
      rainMeshGroup.geometry.attributes.position.needsUpdate = true;
    }
    // В середине дождя бьет молния!
    if (stormTimer <= 2.8 && !lightningLine) {
      strikeLightning();
    }
    if (stormTimer <= 0) {
      if (rainMeshGroup) {
        menuChaosSceneGroup.remove(rainMeshGroup);
        rainMeshGroup = null;
      }
      stormState = 'idle';
    }
  }
}

function strikeLightning() {
  playMenuSound(synthThunder, null); // используем процедурный мягкий низкий раскат грома
  ambientLight.intensity = 1.6;
  setTimeout(() => { ambientLight.intensity = 0.85; }, 70);

  // Изломанная 3D линия молнии вдали
  const targetX = (Math.random() - 0.5) * 16;
  const targetZ = -4 + (Math.random() - 0.5) * 8;
  const points = [];
  let cur = new THREE.Vector3(targetX + (Math.random() - 0.5) * 6, 26, targetZ);
  points.push(cur.clone());
  while (cur.y > 0) {
    cur.y -= 4.0 + Math.random() * 2.0;
    cur.x += (Math.random() - 0.5) * 2.2;
    cur.z += (Math.random() - 0.5) * 2.2;
    points.push(cur.clone());
  }
  points[points.length - 1].y = 0;

  const boltGeo = new THREE.BufferGeometry().setFromPoints(points);
  const boltMat = new THREE.LineBasicMaterial({ color: 0xccddff, linewidth: 1 });
  lightningLine = new THREE.Line(boltGeo, boltMat);
  menuChaosSceneGroup.add(lightningLine);

  setTimeout(() => {
    if (lightningLine) {
      menuChaosSceneGroup.remove(lightningLine);
      lightningLine = null;
    }
  }, 100);
}

// 3. ИВЕНТ: ОГНЕННЫЙ МЕТЕОРИТ И ТУШЕНИЕ ВОДОЙ ИЗ ОБЛАКА
let fireState = 'idle'; // 'idle' | 'meteor' | 'burning' | 'cloud_extinguish'
let fireTimer = 0;
let firePos = new THREE.Vector3();
let meteorMesh = null;
let fireFlamesGroup = null;
let rainCloudMesh = null;

function triggerFireMeteorEvent() {
  if (fireState !== 'idle') return;
  fireState = 'meteor';
  firePos.set(Math.random() > 0.5 ? -10.0 : 10.0, 0.2, (Math.random() - 0.5) * 6);

  // Метеорит летит из неба
  const meteorGeo = new THREE.SphereGeometry(1.1, 12, 12);
  const meteorMat = new THREE.MeshBasicMaterial({ color: 0xff3b00 });
  meteorMesh = new THREE.Mesh(meteorGeo, meteorMat);
  meteorMesh.position.set(firePos.x - 12, 28, firePos.z - 8);
  menuChaosSceneGroup.add(meteorMesh);
}

function updateFireMeteor(delta) {
  if (fireState === 'meteor') {
    if (meteorMesh) {
      meteorMesh.position.lerp(firePos, delta * 7.0);
      if (meteorMesh.position.distanceTo(firePos) < 1.2) {
        menuChaosSceneGroup.remove(meteorMesh);
        meteorMesh = null;
        fireState = 'burning';
        fireTimer = 2.4; // горит 2.4 секунды до прилета облака

        // Разводим костёр
        fireFlamesGroup = new THREE.Group();
        fireFlamesGroup.position.copy(firePos);
        for (let i = 0; i < 5; i++) {
          const coneGeo = new THREE.ConeGeometry(0.4 + Math.random() * 0.3, 1.4 + Math.random() * 0.6, 8);
          const coneMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xff4500 : 0xffcc00 });
          const cone = new THREE.Mesh(coneGeo, coneMat);
          cone.position.set((Math.random() - 0.5) * 0.8, 0.7, (Math.random() - 0.5) * 0.8);
          fireFlamesGroup.add(cone);
        }
        menuChaosSceneGroup.add(fireFlamesGroup);
      }
    }
  } else if (fireState === 'burning') {
    fireTimer -= delta;
    if (fireFlamesGroup) {
      fireFlamesGroup.children.forEach(c => {
        c.scale.y = 0.8 + Math.random() * 0.5;
      });
    }
    if (fireTimer <= 0) {
      // Прилетает облако тушить!
      fireState = 'cloud_extinguish';
      fireTimer = 2.0;

      rainCloudMesh = new THREE.Group();
      const cMat = new THREE.MeshStandardMaterial({ color: 0x4a69bd, roughness: 0.8 });
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.7 + j * 0.1, 10, 10), cMat);
        s.position.set((j - 1.5) * 0.7, 0, (Math.random() - 0.5) * 0.4);
        rainCloudMesh.add(s);
      }
      rainCloudMesh.position.set(firePos.x, 6.5, firePos.z);
      menuChaosSceneGroup.add(rainCloudMesh);
      playMenuSound(synthExtinguishSteam);
    }
  } else if (fireState === 'cloud_extinguish') {
    fireTimer -= delta;
    // Пар и тушение
    if (fireFlamesGroup) {
      fireFlamesGroup.scale.multiplyScalar(0.92);
      if (fireFlamesGroup.scale.x < 0.1) {
        menuChaosSceneGroup.remove(fireFlamesGroup);
        fireFlamesGroup = null;
      }
    }
    if (fireTimer <= 0) {
      if (rainCloudMesh) {
        menuChaosSceneGroup.remove(rainCloudMesh);
        rainCloudMesh = null;
      }
      fireState = 'idle';
    }
  }
}

// 4. ИВЕНТ: ОРБИТАЛЬНЫЙ ЛАЗЕРНЫЙ УДАР
let laserState = 'idle'; // 'idle' | 'charging' | 'firing'
let laserTimer = 0;
let laserTargetPos = new THREE.Vector3();
let laserBeamMesh = null;

function triggerOrbitalLaserEvent() {
  if (laserState !== 'idle') return;
  laserState = 'charging';
  laserTimer = 1.0;
  laserTargetPos.set(Math.random() > 0.5 ? 8.0 : -8.0, 0, (Math.random() - 0.5) * 6);
}

function updateOrbitalLaser(delta) {
  if (laserState === 'charging') {
    laserTimer -= delta;
    if (laserTimer <= 0) {
      laserState = 'firing';
      laserTimer = 0.55;
      playMenuSound(synthLaserZap);

      // Мощный световой цилиндр от неба до земли
      const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 38, 16);
      const cylMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
      laserBeamMesh = new THREE.Mesh(cylGeo, cylMat);
      laserBeamMesh.position.set(laserTargetPos.x, 19, laserTargetPos.z);
      menuChaosSceneGroup.add(laserBeamMesh);

      // Расталкиваем кубы лазерным импульсом
      for (const item of menuPhysicsBodies) {
        if (item.body) {
          const d = item.body.position.distanceTo(laserTargetPos);
          if (d < 10) {
            item.body.velocity.y += 24;
            item.body.velocity.x += (item.body.position.x - laserTargetPos.x) * 6;
          }
        }
      }
    }
  } else if (laserState === 'firing') {
    laserTimer -= delta;
    if (laserBeamMesh) {
      laserBeamMesh.scale.x = 0.5 + Math.random() * 0.8;
      laserBeamMesh.scale.z = laserBeamMesh.scale.x;
    }
    if (laserTimer <= 0) {
      if (laserBeamMesh) {
        menuChaosSceneGroup.remove(laserBeamMesh);
        laserBeamMesh = null;
      }
      laserState = 'idle';
    }
  }
}

// 5. ИВЕНТ: СУПЕР-БАТУТ (ДЖАМППАД) - Убран, никаких ярких посторонних платформ на бейсплейте!
let jumpPadMesh = null;
function setupJumpPad() {
  jumpPadMesh = null;
}

function checkJumpPadCollisions() {
  if (!jumpPadMesh) return;
}

// 6. ИВЕНТ: ВИХРЬ / ТОРНАДО ИЗ КУБОВ (АНТИГРАВИТАЦИЯ)
let vortexActive = false;
let vortexTimer = 0;
let vortexPos = new THREE.Vector3(9.0, 0, -2.0);

function triggerVortexEvent() {
  vortexActive = true;
  vortexTimer = 4.0;
}

function updateVortex(delta) {
  if (!vortexActive) return;
  vortexTimer -= delta;
  for (const item of menuPhysicsBodies) {
    if (item.body) {
      const dx = item.body.position.x - vortexPos.x;
      const dz = item.body.position.z - vortexPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 14.0) {
        // Сила закручивания вихря
        const angle = Math.atan2(dz, dx) + delta * 5.0;
        const targetX = vortexPos.x + Math.cos(angle) * Math.max(1.5, dist - delta * 3.0);
        const targetZ = vortexPos.z + Math.sin(angle) * Math.max(1.5, dist - delta * 3.0);
        item.body.velocity.x += (targetX - item.body.position.x) * 4.0;
        item.body.velocity.z += (targetZ - item.body.position.z) * 4.0;
        item.body.velocity.y += 18.0 * delta;
      }
    }
  }
  if (vortexTimer <= 0) {
    vortexActive = false;
    // Разбрасываем накопленные блоки
    for (const item of menuPhysicsBodies) {
      if (item.body && Math.hypot(item.body.position.x - vortexPos.x, item.body.position.z - vortexPos.z) < 14.0) {
        item.body.velocity.x += (Math.random() - 0.5) * 30.0;
        item.body.velocity.z += (Math.random() - 0.5) * 30.0;
      }
    }
  }
}

// 7. ИВЕНТ: МЕГА-ДОМИНО
function spawnDominoSequence() {
  const dominoCount = 8;
  const startX = 5.0;
  const startZ = 8.0;
  for (let i = 0; i < dominoCount; i++) {
    const geo = new THREE.BoxGeometry(0.35, 2.2, 1.2);
    const color = MONO_CHAOS_COLORS[i % MONO_CHAOS_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
    const mesh = new THREE.Mesh(geo, mat);

    const x = startX + i * 1.35;
    const y = 1.1;
    const z = startZ - i * 0.4;
    mesh.position.set(x, y, z);

    const body = new CANNON.Body({
      mass: 4.0,
      shape: new CANNON.Box(new CANNON.Vec3(0.175, 1.1, 0.6)),
      material: cubeMaterial
    });
    body.position.set(x, y, z);
    addMenuPhysicsItem(mesh, body);
  }

  // Шар, толкающий первое домино
  setTimeout(() => {
    if (!isInMainMenu) return;
    const ballMesh = new THREE.Mesh(menuBallGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9 }));
    const ballBody = new CANNON.Body({
      mass: 12,
      shape: menuBallShape,
      material: cubeMaterial
    });
    ballMesh.position.set(startX - 2.5, 1.2, startZ + 0.5);
    ballBody.position.copy(ballMesh.position);
    ballBody.velocity.set(12, 0, -2);
    addMenuPhysicsItem(ballMesh, ballBody);
  }, 400);
}

// 8. Постройка башни/пирамиды на указанной позиции X (слева или справа от меню)
function buildMenuTowerAt(centerX, layers = 4) {
  if (!isInMainMenu || isGameStarted || isHostingServer || isConnectedToHost) return;
  const cubeSize = 1.0;
  for (let layer = 0; layer < layers; layer++) {
    const count = layers - layer;
    const y = layer * cubeSize + cubeSize / 2;
    const offset = ((count - 1) * cubeSize) / 2;

    for (let ix = 0; ix < count; ix++) {
      for (let iz = 0; iz < count; iz++) {
        const x = centerX + (ix * cubeSize - offset);
        const z = iz * cubeSize - offset;

        const color = getRandomChaosColor();
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.2
        });
        const mesh = new THREE.Mesh(menuBoxGeo, mat);
        mesh.position.set(x, y, z);

        const body = new CANNON.Body({
          mass: 2.5,
          shape: menuBoxShape,
          material: cubeMaterial,
          linearDamping: 0.15,
          angularDamping: 0.25
        });
        body.position.set(x, y, z);
        addMenuPhysicsItem(mesh, body);
      }
    }
  }
}

// 9. Выстрел тяжелого пушечного ядра прямо в башню
function shootCannonballAtTower(targetX) {
  const sphereRadius = 1.4;
  const sphereGeo = new THREE.SphereGeometry(sphereRadius, 20, 20);
  const sphereShape = new CANNON.Sphere(sphereRadius);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f2429,
    roughness: 0.15,
    metalness: 0.85
  });
  const mesh = new THREE.Mesh(sphereGeo, mat);

  const startX = targetX > 0 ? targetX + 4 : targetX - 4;
  const startY = 4.0;
  const startZ = 20.0;
  mesh.position.set(startX, startY, startZ);

  const body = new CANNON.Body({
    mass: 130, // Мощное таранное ядро
    shape: sphereShape,
    material: cubeMaterial,
    linearDamping: 0.05
  });
  body.position.set(startX, startY, startZ);

  const dirX = targetX - startX;
  const dirZ = 0 - startZ;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
  const speed = 46.0;

  body.velocity.set((dirX / len) * speed, 0.5, (dirZ / len) * speed);
  addMenuPhysicsItem(mesh, body);
}

// 10. Спавн одного ультра-прыгучего цветного шара из непрерывного ливня
function spawnMenuCascadeBall() {
  const isLeft = Math.random() > 0.5;
  const x = isLeft ? -5.0 - Math.random() * 11.0 : 5.0 + Math.random() * 11.0;
  const y = 13.0 + Math.random() * 4.0;
  const z = -6.0 + Math.random() * 14.0;

  const color = getRandomChaosColor();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    metalness: 0.35
  });
  const mesh = new THREE.Mesh(menuBallGeo, mat);
  mesh.position.set(x, y, z);

  const body = new CANNON.Body({
    mass: 4.0,
    shape: menuBallShape,
    material: menuBouncyMaterial,
    linearDamping: 0.05,
    angularDamping: 0.15
  });
  body.position.set(x, y, z);
  body.velocity.set(
    (Math.random() - 0.5) * 8.0,
    -12.0 - Math.random() * 6.0,
    (Math.random() - 0.5) * 8.0
  );
  addMenuPhysicsItem(mesh, body);
}

// 11. Пролетающие высокоскоростные шипы / ракеты над меню
function spawnMenuHighSpeedSpike() {
  const coneGeo = new THREE.ConeGeometry(0.55, 2.2, 8);
  coneGeo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: Math.random() > 0.5 ? 0x94979e : 0x555860,
    roughness: 0.25,
    metalness: 0.8
  });
  const mesh = new THREE.Mesh(coneGeo, mat);

  const fromLeft = Math.random() > 0.5;
  const startX = fromLeft ? -30 : 30;
  const startY = 5.0 + Math.random() * 8.0;
  const startZ = -10.0 + Math.random() * 22.0;

  mesh.position.set(startX, startY, startZ);
  const vx = fromLeft ? 45 + Math.random() * 20 : -45 - Math.random() * 20;
  const vy = (Math.random() - 0.5) * 3;
  const vz = (Math.random() - 0.5) * 6;

  addMenuPhysicsItem(mesh, null, true, new THREE.Vector3(vx, vy, vz), new THREE.Vector3(8, 12, 5));
}

// Очистка всех динамических объектов фона меню
function cleanupMenuChaosObjects() {
  for (const item of menuPhysicsBodies) {
    if (item.body) {
      try { world.removeBody(item.body); } catch (_) {}
    }
    if (item.mesh) {
      try { menuChaosSceneGroup.remove(item.mesh); } catch (_) {}
    }
  }
  menuPhysicsBodies.length = 0;
  resetNukeGagToNormal();
  if (rainMeshGroup) {
    menuChaosSceneGroup.remove(rainMeshGroup);
    rainMeshGroup = null;
  }
  if (lightningLine) {
    menuChaosSceneGroup.remove(lightningLine);
    lightningLine = null;
  }
  if (meteorMesh) {
    menuChaosSceneGroup.remove(meteorMesh);
    meteorMesh = null;
  }
  if (fireFlamesGroup) {
    menuChaosSceneGroup.remove(fireFlamesGroup);
    fireFlamesGroup = null;
  }
  if (rainCloudMesh) {
    menuChaosSceneGroup.remove(rainCloudMesh);
    rainCloudMesh = null;
  }
  if (laserBeamMesh) {
    menuChaosSceneGroup.remove(laserBeamMesh);
    laserBeamMesh = null;
  }
  // Гарантированно вычищаем все оставшиеся меши из группы меню
  while (menuChaosSceneGroup.children.length > 0) {
    menuChaosSceneGroup.remove(menuChaosSceneGroup.children[0]);
  }
  if (!isInMainMenu || isGameStarted || isHostingServer || isConnectedToHost) {
    menuChaosSceneGroup.visible = false;
  }
  stormState = 'idle';
  fireState = 'idle';
  laserState = 'idle';
  vortexActive = false;
  leftTowerBuilt = false;
  rightTowerBuilt = false;
  leftTowerTimer = (isInMainMenu && !isGameStarted) ? 0.5 : 99999;
  rightTowerTimer = (isInMainMenu && !isGameStarted) ? 1.8 : 99999;
  menuCascadeBallTimer = 0.4;
  menuSpikeTimer = 3.0;
}

let leftTowerBuilt = false;
let rightTowerBuilt = false;
let leftTowerTimer = 0.5;
let rightTowerTimer = 1.8;
let menuCascadeBallTimer = 0.4;
let menuSpikeTimer = 3.0;

// Таймер ротации глобальных зрелищных ивентов в стиле OG Windows (спокойный, атмосферный интервал)
let bigEventTimer = 28.0 + Math.random() * 12.0; // при запуске чисто и спокойно, первый ивент через ~28-40с!
let bigEventCycleIndex = 0;

function triggerNextBigMenuEvent() {
  if (!isInMainMenu || isGameStarted || isHostingServer || isConnectedToHost) return;
  const eventTypes = [
    'fire_meteor', // 1. Метеорит, огонь и тушение облаком с водой
    'lightning',   // 2. Гроза, ливень и удар молнии
    'vortex',      // 3. Антигравитационный вихрь блоков
    'laser',       // 4. Орбитальный лазерный луч
    'domino'       // 5. Мега-домино
  ];

  const currentType = eventTypes[bigEventCycleIndex % eventTypes.length];
  bigEventCycleIndex++;

  if (currentType === 'fire_meteor') {
    triggerFireMeteorEvent();
  } else if (currentType === 'lightning') {
    triggerThunderstormEvent();
  } else if (currentType === 'vortex') {
    triggerVortexEvent();
  } else if (currentType === 'laser') {
    triggerOrbitalLaserEvent();
  } else if (currentType === 'domino') {
    spawnDominoSequence();
  }
}

// Главная функция обновления физики и эффектов меню (каждый кадр)
function updateMenuChaos(delta) {
  if (!isInMainMenu || isGameStarted || isHostingServer || isConnectedToHost) {
    if (menuPhysicsBodies.length > 0 || menuChaosSceneGroup.children.length > 0) {
      cleanupMenuChaosObjects();
    }
    menuChaosSceneGroup.visible = false;
    return;
  }
  menuChaosSceneGroup.visible = true;
  const now = performance.now();

  // Гарантируем, что пистолет и модель игрока полностью скрыты во время меню
  if (viewmodelRoot) viewmodelRoot.visible = false;

  // Камера статична в одной точке с учетом кратковременного сотрясения от взрывов
  menuCamera.position.copy(MENU_CAM_POS);
  if (menuCameraShake > 0.001) {
    menuCamera.position.x += (Math.random() - 0.5) * menuCameraShake;
    menuCamera.position.y += (Math.random() - 0.5) * menuCameraShake;
    menuCamera.position.z += (Math.random() - 0.5) * menuCameraShake;
  }
  menuCamera.lookAt(MENU_CAM_TARGET);

  // Инициализируем джамппад один раз
  if (!jumpPadMesh) {
    setupJumpPad();
  }
  checkJumpPadCollisions();

  // 1. Обновление текущего глобального ивента
  updateNukeGag(delta, now);
  updateThunderstorm(delta);
  updateFireMeteor(delta);
  updateOrbitalLaser(delta);
  updateVortex(delta);

  // 2. Двойные башни слева и справа с периодическим выстрелом пушечного ядра
  leftTowerTimer -= delta;
  if (leftTowerTimer <= 0) {
    if (!leftTowerBuilt) {
      buildMenuTowerAt(-12.5, 4);
      leftTowerBuilt = true;
      leftTowerTimer = 4.2;
    } else {
      shootCannonballAtTower(-12.5);
      leftTowerBuilt = false;
      leftTowerTimer = 16.0 + Math.random() * 8.0;
    }
  }

  rightTowerTimer -= delta;
  if (rightTowerTimer <= 0) {
    if (!rightTowerBuilt) {
      buildMenuTowerAt(12.5, 4);
      rightTowerBuilt = true;
      rightTowerTimer = 4.2;
    } else {
      shootCannonballAtTower(12.5);
      rightTowerBuilt = false;
      rightTowerTimer = 18.0 + Math.random() * 8.0;
    }
  }

  // 3. Динамичный дождь ультра-прыгучих монохромных шаров на бейсплейт
  menuCascadeBallTimer -= delta;
  if (menuCascadeBallTimer <= 0) {
    spawnMenuCascadeBall();
    menuCascadeBallTimer = 0.55 + Math.random() * 0.45;
  }

  // 4. Пролетающие скоростные металлические шипы-ракеты
  menuSpikeTimer -= delta;
  if (menuSpikeTimer <= 0) {
    spawnMenuHighSpeedSpike();
    menuSpikeTimer = 6.0 + Math.random() * 7.0;
  }

  // Редкий супер-ивент троллинга: скопление ядерок в кучу, ускоряющийся писк, взрыв с фейк-лагом фона и мгновенный сброс!
  nukeRareTrollTimer -= delta;
  if (nukeRareTrollTimer <= 0) {
    if (nukePileState === 'idle') {
      triggerNukePileupEvent();
    }
    nukeRareTrollTimer = 85.0 + Math.random() * 45.0; // раз в 85-130 секунд
  }

  // Ротация зрелищных глобальных ивентов (метеорит, лазер, вихрь, домино, гроза)
  bigEventTimer -= delta;
  if (bigEventTimer <= 0) {
    bigEventTimer = 24.0 + Math.random() * 14.0;
    triggerNextBigMenuEvent();
  }

  // Шаг физики Cannon
  world.step(Math.min(delta, 0.05));

  // Жесткая синхронизация скрепленных кубов: полное отсутствие люфта, болтанки и колебаний
  syncWeldConstraintsPositions();

  // Синхронизация мешей с физическими телами и очистка упавших в бездну
  for (let i = menuPhysicsBodies.length - 1; i >= 0; i--) {
    const item = menuPhysicsBodies[i];
    if (item.body) {
      item.mesh.position.copy(item.body.position);
      item.mesh.quaternion.copy(item.body.quaternion);

      // Удаление улетевших за пределы арены тел
      if (
        item.body.position.y < -12 ||
        Math.abs(item.body.position.x) > 48 ||
        Math.abs(item.body.position.z) > 42
      ) {
        world.removeBody(item.body);
        menuChaosSceneGroup.remove(item.mesh);
        menuPhysicsBodies.splice(i, 1);
      }
    } else if (item.customKinematic) {
      item.mesh.position.addScaledVector(item.vel, delta);
      item.mesh.rotation.x += item.rotVel.x * delta;
      item.mesh.rotation.y += item.rotVel.y * delta;
      item.mesh.rotation.z += item.rotVel.z * delta;

      if (item.mesh.position.lengthSq() > 3600) {
        menuChaosSceneGroup.remove(item.mesh);
        menuPhysicsBodies.splice(i, 1);
      }
    }
  }
}

// Загрузка только ключевых игровых ресурсов: 3D-модель оружия, текстуры и звуковые эффекты
// Реальный предварительный загрузчик всех звуков и ресурсов (кэширование без задержек при первом воспроизведении)
function loadEssentialAssets(onProgress) {
  return new Promise((resolve) => {
    const soundNames = [
      'pistol_shoot', 'pistol_reload', 'empty_click', 'weapon_switch',
      'weapon_deploy', 'spawn', 'secret_cube_fall', 'block_hit',
      'block_drop', 'button_click', 'throw_object', 'weld', 'unweld', 'toolgun_weld', 'toolgun_remove'
    ];

    const assetsToLoad = [
      { type: 'model', url: './9mm_pistol.glb' },
      { type: 'model', url: './tool_gun.glb' },
      { type: 'texture', url: './logo.png' },
      { type: 'texture', url: './secret-cube-texture.png' },
      { type: 'texture', url: './app-icon.png' },
      ...soundNames.map(name => ({ type: 'sound', name, url: `./sounds/${name}.wav` }))
    ];

    let loadedCount = 0;
    const total = assetsToLoad.length;

    function itemDone() {
      loadedCount++;
      if (onProgress) onProgress(loadedCount / total);
      if (loadedCount >= total) resolve();
    }

    assetsToLoad.forEach((asset) => {
      if (asset.type === 'sound') {
        fetch(asset.url)
          .then(res => {
            if (!res.ok) throw new Error('Not found');
            return res.blob();
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            const audio = new Audio(objectUrl);
            audio.preload = 'auto';
            audioFiles[asset.name] = audio;
            itemDone();
          })
          .catch(() => {
            itemDone();
          });
      } else {
        fetch(asset.url)
          .then(() => itemDone())
          .catch(() => itemDone());
      }
    });
  });
}

// ============================================================================
// --- СИСТЕМА УПРАВЛЕНИЯ МИРАМИ (MAX 5 МИРОВ, СОХРАНЕНИЕ / ЗАГРУЗКА) ---
// ============================================================================
const MAX_WORLDS_COUNT = 5;
const WORLDS_STORAGE_KEY = 'sandbox_saved_worlds_v1';
let currentActiveWorldId = null;

// Получение списка всех сохраненных миров из localStorage
function getAllWorlds() {
  try {
    const raw = localStorage.getItem(WORLDS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Ошибка чтения миров:', err);
    return [];
  }
}

function saveAllWorlds(worlds) {
  try {
    localStorage.setItem(WORLDS_STORAGE_KEY, JSON.stringify(worlds));
  } catch (err) {
    console.error('Ошибка сохранения списка миров:', err);
  }
}

// Сериализация текущего состояния мира (позиция игрока, полет, скорость, оружие, блоки)
function serializeCurrentWorldState(worldName) {
  const blocksData = [];
  for (const obj of physicsObjects) {
    if (!obj.body || !obj.mesh) continue;
    let type = 'cube';
    if (obj.isSecretCube) type = 'secret_cube';
    else if (obj.isSphere) type = 'sphere';
    else if (obj.isTriangle) type = 'triangle';
    else if (obj.isRamp) type = 'ramp';
    else if (obj.isNuke) type = 'nuke';

    blocksData.push({
      type,
      pos: { x: obj.body.position.x, y: obj.body.position.y, z: obj.body.position.z },
      rot: { x: obj.body.quaternion.x, y: obj.body.quaternion.y, z: obj.body.quaternion.z, w: obj.body.quaternion.w },
      vel: { x: obj.body.velocity.x, y: obj.body.velocity.y, z: obj.body.velocity.z },
      angVel: { x: obj.body.angularVelocity.x, y: obj.body.angularVelocity.y, z: obj.body.angularVelocity.z }
    });
  }

  // Получаем поворот камеры
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  camEuler.setFromQuaternion(camera.quaternion, 'YXZ');

  return {
    id: currentActiveWorldId || 'world_' + Date.now(),
    name: worldName || 'Мой мир',
    lastSaved: Date.now(),
    blocksCount: blocksData.length,
    player: {
      pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      pitch: camEuler.x,
      yaw: camEuler.y,
      isFlying: isFlying,
      flySpeed: flyBaseSpeed,
      equippedWeapon: currentEquippedSlot || '2-1',
      ammo: { ...pistolAmmo }
    },
    blocks: blocksData
  };
}

// Очистка всех созданных физических блоков из сцены и физики Cannon
function clearGameplayWorldObjects() {
  for (let i = physicsObjects.length - 1; i >= 0; i--) {
    const obj = physicsObjects[i];
    if (obj.body) world.removeBody(obj.body);
    if (obj.mesh) {
      if (obj.mesh.parent) obj.mesh.parent.remove(obj.mesh);
      else scene.remove(obj.mesh);
      if (obj.geo) obj.geo.dispose();
    }
  }
  physicsObjects.length = 0;
}

// ============================================================================
// --- КАСТОМНЫЕ РЕТРО-ДИАЛОГИ WINDOWS (ВМЕСТО ОШИБКИ window.prompt В ELECTRON) ---
// ============================================================================
const retroDialogModal = document.getElementById('retro-dialog-modal');
const retroDialogTitle = document.getElementById('retro-dialog-title');
const retroDialogMsg = document.getElementById('retro-dialog-message');
const retroDialogInput = document.getElementById('retro-dialog-input');
const btnRetroDialogOk = document.getElementById('btn-retro-dialog-ok');
const btnRetroDialogCancel = document.getElementById('btn-retro-dialog-cancel');
const btnRetroDialogClose = document.getElementById('btn-retro-dialog-close');

let retroDialogResolver = null;

function closeRetroDialog(value) {
  if (retroDialogModal) {
    retroDialogModal.classList.add('hidden');
  }
  if (retroDialogResolver) {
    const res = retroDialogResolver;
    retroDialogResolver = null;
    res(value);
  }
}

if (btnRetroDialogOk) {
  btnRetroDialogOk.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!retroDialogInput.classList.contains('hidden')) {
      closeRetroDialog(retroDialogInput.value);
    } else {
      closeRetroDialog(true);
    }
  });
}

if (btnRetroDialogCancel) {
  btnRetroDialogCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    closeRetroDialog(null);
  });
}

if (btnRetroDialogClose) {
  btnRetroDialogClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeRetroDialog(null);
  });
}

if (retroDialogInput) {
  retroDialogInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      closeRetroDialog(retroDialogInput.value);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeRetroDialog(null);
    }
  });
}

function showRetroPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    retroDialogResolver = resolve;
    if (retroDialogTitle) retroDialogTitle.textContent = 'Создание мира';
    if (retroDialogMsg) retroDialogMsg.textContent = message;
    if (retroDialogInput) {
      retroDialogInput.classList.remove('hidden');
      retroDialogInput.value = defaultValue;
    }
    if (btnRetroDialogCancel) btnRetroDialogCancel.style.display = '';
    if (retroDialogModal) retroDialogModal.classList.remove('hidden');
    setTimeout(() => {
      if (retroDialogInput) {
        retroDialogInput.focus();
        retroDialogInput.select();
      }
    }, 50);
  });
}

function showRetroConfirm(message, title = 'Подтверждение') {
  return new Promise((resolve) => {
    retroDialogResolver = (val) => resolve(!!val);
    if (retroDialogTitle) retroDialogTitle.textContent = title;
    if (retroDialogMsg) retroDialogMsg.textContent = message;
    if (retroDialogInput) {
      retroDialogInput.classList.add('hidden');
      retroDialogInput.value = '';
    }
    if (btnRetroDialogCancel) btnRetroDialogCancel.style.display = '';
    if (retroDialogModal) retroDialogModal.classList.remove('hidden');
    setTimeout(() => {
      if (btnRetroDialogOk) btnRetroDialogOk.focus();
    }, 50);
  });
}

function showRetroAlert(message, title = 'Внимание') {
  return new Promise((resolve) => {
    retroDialogResolver = () => resolve(true);
    if (retroDialogTitle) retroDialogTitle.textContent = title;
    if (retroDialogMsg) retroDialogMsg.textContent = message;
    if (retroDialogInput) {
      retroDialogInput.classList.add('hidden');
    }
    if (btnRetroDialogCancel) btnRetroDialogCancel.style.display = 'none';
    if (retroDialogModal) retroDialogModal.classList.remove('hidden');
    setTimeout(() => {
      if (btnRetroDialogOk) btnRetroDialogOk.focus();
    }, 50);
  });
}

// UI элементы модального окна миров и экрана загрузки мира
const worldsModal = document.getElementById('worlds-modal');
const worldsListEl = document.getElementById('worlds-list');
const btnCloseWorlds = document.getElementById('btn-close-worlds');
const btnCreateWorld = document.getElementById('btn-create-world');
const btnImportWorld = document.getElementById('btn-import-world');
const inputImportWorld = document.getElementById('input-import-world');
const worldLoadingOverlay = document.getElementById('world-loading-overlay');
const worldLoadingTitle = document.getElementById('world-loading-title');
const worldLoadingStatus = document.getElementById('world-loading-status');
const worldLoadingFill = document.getElementById('world-loading-fill');

// Экспорт мира в JSON файл (выгрузка)
function exportWorldById(worldId) {
  const worlds = getAllWorlds();
  const worldData = worlds.find((w) => w.id === worldId);
  if (!worldData) return;

  const jsonStr = JSON.stringify(worldData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (worldData.name || 'world').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
  a.href = url;
  a.download = `${safeName}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Импорт мира из JSON файла (загрузка извне)
async function importWorldFromFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || typeof data !== 'object') {
      await showRetroAlert('Некорректный формат файла мира!', 'Ошибка импорта');
      return;
    }

    const worlds = getAllWorlds();
    if (worlds.length >= MAX_WORLDS_COUNT) {
      await showRetroAlert('Достигнут максимум миров (5). Удалите один из миров перед импортом.', 'Лимит миров');
      return;
    }

    const importedId = 'world_' + Date.now();
    const importedWorld = {
      id: importedId,
      name: (data.name ? `${data.name} (Импорт)` : `Импортированный мир #${worlds.length + 1}`).slice(0, 32),
      lastSaved: Date.now(),
      blocksCount: Array.isArray(data.blocks) ? data.blocks.length : (data.blocksCount || 0),
      player: data.player || {
        pos: { x: 0, y: standHeight, z: 0 },
        pitch: 0,
        yaw: 0,
        isFlying: false,
        flySpeed: 12.0,
        equippedWeapon: '1-1',
        ammo: { current: 18, maxClip: 18, reserve: 54, isReloading: false, reloadTimer: 0, lastShotTime: 0, fireRate: 0.16 }
      },
      blocks: Array.isArray(data.blocks) ? data.blocks : []
    };

    worlds.unshift(importedWorld);
    saveAllWorlds(worlds);
    renderWorldsListUI();
    await showRetroAlert(`Мир «${importedWorld.name}» успешно импортирован!`, 'Успех');
  } catch (err) {
    console.error('Ошибка импорта мира:', err);
    await showRetroAlert('Не удалось прочитать файл мира. Убедитесь, что это валидный .json файл.', 'Ошибка импорта');
  }
}

// Отображение списка миров в окне
function renderWorldsListUI() {
  if (!worldsListEl) return;
  const worlds = getAllWorlds();
  worldsListEl.innerHTML = '';

  if (worlds.length === 0) {
    worldsListEl.innerHTML = '<div style="color: #8c8f99; text-align: center; padding: 24px 10px; font-size: 13px;">У вас пока нет сохранённых миров.<br>Нажмите «+ Создать новый мир», чтобы начать!</div>';
  } else {
    worlds.forEach((w) => {
      const dateStr = new Date(w.lastSaved).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const card = document.createElement('div');
      card.className = 'world-card';
      card.innerHTML = `
        <div class="world-card-info">
          <div class="world-card-name">${w.name || 'Мир ' + w.id}</div>
          <div class="world-card-meta">Карта: ${w.mapTitle || (w.map === 'flat_grid' ? 'Сетка инженера' : 'Baseplate')} • Сохранено: ${dateStr} • Блоков: ${w.blocksCount || (w.blocks ? w.blocks.length : 0)}</div>
        </div>
        <div class="world-card-actions">
          <button class="menu-btn world-btn-play" data-world-id="${w.id}">Загрузить</button>
          <button class="menu-btn world-btn-export" data-world-id="${w.id}">Экспорт</button>
          <button class="menu-btn world-btn-delete" data-world-id="${w.id}">Удалить</button>
        </div>
      `;
      worldsListEl.appendChild(card);
    });
  }

  // Блокируем кнопку создания если уже 5 миров
  if (btnCreateWorld) {
    if (worlds.length >= MAX_WORLDS_COUNT) {
      btnCreateWorld.disabled = true;
      btnCreateWorld.textContent = 'Лимит миров исчерпан (макс 5)';
      btnCreateWorld.style.opacity = '0.5';
      btnCreateWorld.style.cursor = 'not-allowed';
    } else {
      btnCreateWorld.disabled = false;
      btnCreateWorld.textContent = `+ Создать новый мир (${worlds.length}/${MAX_WORLDS_COUNT})`;
      btnCreateWorld.style.opacity = '1';
      btnCreateWorld.style.cursor = 'pointer';
    }
  }

  if (btnImportWorld) {
    if (worlds.length >= MAX_WORLDS_COUNT) {
      btnImportWorld.disabled = true;
      btnImportWorld.style.opacity = '0.5';
      btnImportWorld.style.cursor = 'not-allowed';
    } else {
      btnImportWorld.disabled = false;
      btnImportWorld.style.opacity = '1';
      btnImportWorld.style.cursor = 'pointer';
    }
  }

  // Навешиваем слушатели на кнопки миров
  document.querySelectorAll('.world-btn-play').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const wid = b.getAttribute('data-world-id');
      loadWorldAndEnterGame(wid);
    });
  });

  document.querySelectorAll('.world-btn-export').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const wid = b.getAttribute('data-world-id');
      exportWorldById(wid);
    });
  });

  document.querySelectorAll('.world-btn-delete').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wid = b.getAttribute('data-world-id');
      const confirmed = await showRetroConfirm('Вы уверены, что хотите удалить этот мир?', 'Удаление мира');
      if (confirmed) {
        deleteWorldById(wid);
        renderWorldsListUI();
      }
    });
  });
}

function deleteWorldById(worldId) {
  const worlds = getAllWorlds().filter((w) => w.id !== worldId);
  saveAllWorlds(worlds);
  if (currentActiveWorldId === worldId) {
    currentActiveWorldId = null;
  }
}

// Загрузка мира с лаконичным оверлеем загрузки (без лишних технических описаний)
function loadWorldAndEnterGame(worldId, isNewWorld = false) {
  if (worldsModal) worldsModal.classList.add('hidden');
  stopMenuMusic();

  // Мгновенно отключаем главное меню и фоновый хаос ДО таймаутов, исключая спавн пирамид
  isInMainMenu = false;
  isGameStarted = true;
  cleanupMenuChaosObjects();

  const worlds = getAllWorlds();
  const worldData = isNewWorld ? null : worlds.find((w) => w.id === worldId);

  currentActiveWorldId = worldId;

  // Открываем лаконичный экран загрузки
  if (worldLoadingOverlay) {
    worldLoadingOverlay.classList.remove('hidden');
    let title = isNewWorld ? 'СОЗДАНИЕ НОВОГО МИРА...' : `ЗАГРУЗКА...`;
    if (isHostingServer) title = 'СОЗДАНИЕ СЕРВЕРА...';
    if (isConnectedToHost) title = 'ПОДКЛЮЧЕНИЕ К СЕРВЕРУ...';
    if (worldLoadingTitle) worldLoadingTitle.textContent = title;
    if (worldLoadingStatus) worldLoadingStatus.textContent = '';
    if (worldLoadingFill) worldLoadingFill.style.width = '20%';
  }

  setTimeout(() => {
    // 1. Очищаем старые объекты
    clearGameplayWorldObjects();
    if (worldLoadingFill) worldLoadingFill.style.width = '55%';
    if (worldLoadingStatus) worldLoadingStatus.textContent = '';

    // 2. Если мир сохраненный — восстанавливаем блоки
    if (worldData && worldData.blocks) {
      for (const b of worldData.blocks) {
        if (b.type === 'cube') {
          spawnCubeAt(b.pos, b.rot, b.vel, b.angVel);
        } else if (b.type === 'secret_cube') {
          spawnSecretCubeAt(b.pos, b.rot, b.vel, b.angVel);
        } else if (b.type === 'sphere') {
          spawnSphereAt(b.pos, b.rot, b.vel, b.angVel);
        } else if (b.type === 'triangle') {
          spawnTriangleAt(b.pos, b.rot, b.vel, b.angVel);
        } else if (b.type === 'ramp') {
          spawnRampAt(b.pos, b.rot, b.vel, b.angVel);
        } else if (b.type === 'nuke') {
          spawnNukePropAt(b.pos, b.rot, b.vel, b.angVel);
        }
      }
    }

    // 3. Восстанавливаем позицию игрока и полет
    if (worldData && worldData.player) {
      const p = worldData.player;
      camera.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.pitch !== undefined && p.yaw !== undefined) {
        const euler = new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(euler);
      }
      isFlying = !!p.isFlying;
      const weaponToEquip = p.equippedWeapon || '1-1';
      if (WEAPON_REGISTRY[weaponToEquip] && !WEAPON_REGISTRY[weaponToEquip].locked) {
        equipWeapon(weaponToEquip);
      } else {
        equipWeapon('1-1');
      }
      if (p.ammo) {
        Object.assign(pistolAmmo, p.ammo);
        updateAmmoHud();
      }
    } else {
      // Дефолтная точка спавна
      camera.position.set(0, standHeight, 0);
      isFlying = false;
      equipWeapon('1-1');
    }

    camera.fov = currentDefaultFov;
    camera.updateProjectionMatrix();

    if (worldLoadingFill) worldLoadingFill.style.width = '85%';
    if (worldLoadingStatus) worldLoadingStatus.textContent = '';

    setTimeout(() => {
      if (worldLoadingFill) worldLoadingFill.style.width = '100%';

      setTimeout(() => {
        // Мгновенно скрываем главное меню ДО показа 3D мира
        if (mainMenuEl) {
          mainMenuEl.classList.remove('visible');
          mainMenuEl.classList.add('hidden');
        }

        renderer.domElement.style.display = 'block';
        prevTime = performance.now();
        isInMainMenu = false;
        isGameStarted = true;
        cleanupMenuChaosObjects();
        if (viewmodelRoot) viewmodelRoot.visible = (!isInMainMenu && currentEquippedSlot === '2-1');
        if (pistolMeshGroup) pistolMeshGroup.visible = (!isInMainMenu && currentEquippedSlot === '2-1');
        controls.enabled = true;
        crosshairEl.style.display = '';

        const hintEl = document.getElementById('hint-bottom-left');
        if (hintEl) hintEl.style.display = '';

        requestPointerLockSafely();

        // Плавное оттухание экрана загрузки
        if (worldLoadingOverlay) {
          worldLoadingOverlay.classList.add('fade-out');
          setTimeout(() => {
            worldLoadingOverlay.classList.add('hidden');
            worldLoadingOverlay.classList.remove('fade-out');
          }, 350);
        }
      }, 150);
    }, 150);
  }, 150);
}

// Сетевая синхронизация спавна блоков
function notifySpawnBlock(obj, blockType) {
  if (!obj || !obj.mesh) return;
  if (!obj.netId) {
    obj.netId = 'prop_' + (localPeer ? localPeer.id : 'h') + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  }
  if (isHostingServer || isConnectedToHost) {
    broadcastNetworkPacket({
      type: 'spawn_block',
      netId: obj.netId,
      blockType: blockType,
      pos: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
      qx: obj.mesh.quaternion.x,
      qy: obj.mesh.quaternion.y,
      qz: obj.mesh.quaternion.z,
      qw: obj.mesh.quaternion.w
    });
  }
}

// Функции точного спавна блоков в координаты мира
function spawnCubeAt(pos, rot, vel, angVel) {
  const size = 1.0;
  const cubeGeo = new THREE.BoxGeometry(size, size, size);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.35, metalness: 0.1 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  cubeMesh.position.set(pos.x, pos.y, pos.z);
  if (rot) cubeMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  scene.add(cubeMesh);

  const cubeShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
  const cubeBody = new CANNON.Body({ mass: 5, shape: cubeShape, material: cubeMaterial, linearDamping: 0.05, angularDamping: 0.08 });
  cubeBody.position.set(pos.x, pos.y, pos.z);
  if (rot) cubeBody.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) cubeBody.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) cubeBody.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(cubeBody, false);
  world.addBody(cubeBody);
  physicsObjects.push({ mesh: cubeMesh, body: cubeBody, isCube: true, geo: cubeGeo });
  return physicsObjects[physicsObjects.length - 1];
}

function spawnSecretCubeAt(pos, rot, vel, angVel) {
  const size = 1.0;
  const cubeGeo = new THREE.BoxGeometry(size, size, size);
  const cubeMat = new THREE.MeshStandardMaterial({ map: secretCubeTexture, roughness: 0.3, metalness: 0.1 });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  cubeMesh.position.set(pos.x, pos.y, pos.z);
  if (rot) cubeMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  scene.add(cubeMesh);

  const cubeShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
  const cubeBody = new CANNON.Body({ mass: 5.5, shape: cubeShape, material: cubeMaterial, linearDamping: 0.05, angularDamping: 0.08 });
  cubeBody.position.set(pos.x, pos.y, pos.z);
  if (rot) cubeBody.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) cubeBody.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) cubeBody.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(cubeBody, false);
  world.addBody(cubeBody);
  physicsObjects.push({ mesh: cubeMesh, body: cubeBody, isCube: true, isSecretCube: true, geo: cubeGeo });
  return physicsObjects[physicsObjects.length - 1];
}

function spawnSphereAt(pos, rot, vel, angVel) {
  const radius = 0.5;
  const sphereGeo = new THREE.SphereGeometry(radius, 24, 24);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.3, metalness: 0.1 });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
  sphereMesh.position.set(pos.x, pos.y, pos.z);
  scene.add(sphereMesh);

  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({ mass: 4.0, shape: sphereShape, material: cubeMaterial, linearDamping: 0.05, angularDamping: 0.08 });
  sphereBody.position.set(pos.x, pos.y, pos.z);
  if (rot) sphereBody.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) sphereBody.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) sphereBody.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(sphereBody, true);
  world.addBody(sphereBody);
  physicsObjects.push({ mesh: sphereMesh, body: sphereBody, isSphere: true, wasHeldByPlayer: false, geo: sphereGeo });
  return physicsObjects[physicsObjects.length - 1];
}

function spawnTriangleAt(pos, rot, vel, angVel) {
  const size = 1.0;
  const triGeo = createEquilateralPrismGeometry(size, size);
  const triMat = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.35, metalness: 0.1 });
  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.position.set(pos.x, pos.y, pos.z);
  if (rot) triMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  scene.add(triMesh);

  const a = size;
  const h = a * (Math.sqrt(3) / 2);
  const l = size / 2;
  const halfA = a / 2;
  const yB = -h / 3;
  const yT = 2 * h / 3;
  const cannonVerts = [
    new CANNON.Vec3(-halfA, yB, l),
    new CANNON.Vec3(halfA, yB, l),
    new CANNON.Vec3(0, yT, l),
    new CANNON.Vec3(-halfA, yB, -l),
    new CANNON.Vec3(halfA, yB, -l),
    new CANNON.Vec3(0, yT, -l)
  ];
  const cannonFaces = [[0, 1, 2], [4, 3, 5], [3, 4, 1, 0], [0, 2, 5, 3], [4, 5, 2, 1]];
  const triShape = new CANNON.ConvexPolyhedron({ vertices: cannonVerts, faces: cannonFaces });

  const triBody = new CANNON.Body({ mass: 4.0, shape: triShape, material: cubeMaterial, linearDamping: 0.05, angularDamping: 0.08 });
  triBody.position.set(pos.x, pos.y, pos.z);
  if (rot) triBody.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) triBody.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) triBody.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(triBody, false);
  world.addBody(triBody);
  physicsObjects.push({ mesh: triMesh, body: triBody, isTriangle: true, geo: triGeo });
  return physicsObjects[physicsObjects.length - 1];
}

function spawnRampAt(pos, rot, vel, angVel) {
  const size = 1.0;
  const rampGeo = createRampGeometry(size);
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.35, metalness: 0.1 });
  const rampMesh = new THREE.Mesh(rampGeo, rampMat);
  rampMesh.position.set(pos.x, pos.y, pos.z);
  if (rot) rampMesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  scene.add(rampMesh);

  const h = size / 2;
  const cannonVerts = [
    new CANNON.Vec3(-h, -h, -h),
    new CANNON.Vec3(h, -h, -h),
    new CANNON.Vec3(h, -h, h),
    new CANNON.Vec3(-h, -h, h),
    new CANNON.Vec3(-h, h, -h),
    new CANNON.Vec3(h, h, -h)
  ];
  const cannonFaces = [[0, 4, 5, 1], [0, 1, 2, 3], [4, 3, 2, 5], [0, 3, 4], [1, 5, 2]];
  const rampShape = new CANNON.ConvexPolyhedron({ vertices: cannonVerts, faces: cannonFaces });

  const rampBody = new CANNON.Body({ mass: 4.5, shape: rampShape, material: cubeMaterial, linearDamping: 0.05, angularDamping: 0.08 });
  rampBody.position.set(pos.x, pos.y, pos.z);
  if (rot) rampBody.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) rampBody.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) rampBody.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(rampBody, false);
  world.addBody(rampBody);
  physicsObjects.push({ mesh: rampMesh, body: rampBody, isRamp: true, geo: rampGeo });
  return physicsObjects[physicsObjects.length - 1];
}

function detonateNukeProp(nukeObj) {
  if (!nukeObj || nukeObj.isDetonated) return;
  nukeObj.isDetonated = true;

  const epicPos = nukeObj.body ? nukeObj.body.position : (nukeObj.mesh ? nukeObj.mesh.position : new THREE.Vector3(0, 0, 0));
  const blastCenter = new THREE.Vector3(epicPos.x, Math.max(0.2, epicPos.y), epicPos.z);

  // Удаляем взорванную ядерку из игры
  const idx = physicsObjects.indexOf(nukeObj);
  if (idx !== -1) {
    physicsObjects.splice(idx, 1);
  }
  if (nukeObj.body) world.removeBody(nukeObj.body);
  if (nukeObj.mesh) scene.remove(nukeObj.mesh);

  // 1. Мощный саб-басовый ядерный звук взрыва
  synthNukeExplosion();

  // 2. Ядерная ударная волна: раскидываем ВСЕ соседние объекты и игрока
  const blastRadius = 38.0;
  for (const obj of physicsObjects) {
    if (obj.body) {
      const dx = obj.body.position.x - blastCenter.x;
      const dy = obj.body.position.y - blastCenter.y;
      const dz = obj.body.position.z - blastCenter.z;
      const dist = Math.hypot(dx, dy, dz) || 0.5;
      if (dist < blastRadius) {
        obj.body.wakeUp();
        const force = (1.0 - dist / blastRadius) * 65.0;
        obj.body.velocity.x += (dx / dist) * force;
        obj.body.velocity.y += Math.max(12.0, (dy / dist) * force + 15.0);
        obj.body.velocity.z += (dz / dist) * force;

        // Если рядом была другая ядерка — цепная детонация через 0.15с!
        if (obj.isNuke && !obj.isDetonated) {
          setTimeout(() => detonateNukeProp(obj), 120 + Math.random() * 80);
        }
      }
    }
  }

  // Отбрасываем игрока, если близко
  const pDist = camera.position.distanceTo(blastCenter);
  if (pDist < blastRadius) {
    const pForce = (1.0 - pDist / blastRadius) * 22.0;
    const pDir = new THREE.Vector3().subVectors(camera.position, blastCenter).normalize();
    jumpY = Math.max(jumpY, pForce * 0.4);
    verticalVelocity = Math.max(verticalVelocity, pForce);
    camera.position.x += pDir.x * pForce * 0.25;
    camera.position.z += pDir.z * pForce * 0.25;
  }

  // 3. Ядерный огненный гриб / сфера взрыва
  const fireballGeo = new THREE.SphereGeometry(2.0, 16, 16);
  const fireballMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.95
  });
  const fireball = new THREE.Mesh(fireballGeo, fireballMat);
  fireball.position.copy(blastCenter);
  scene.add(fireball);

  // Световая вспышка взрыва
  const nukeLight = new THREE.PointLight(0xff6600, 8.0, 60.0);
  nukeLight.position.copy(blastCenter);
  scene.add(nukeLight);

  // Кольцо ударной волны по земле
  const shockRingGeo = new THREE.RingGeometry(0.5, 2.0, 32);
  shockRingGeo.rotateX(-Math.PI / 2);
  const shockRingMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
  shockRing.position.set(blastCenter.x, 0.08, blastCenter.z);
  scene.add(shockRing);

  // Анимация взрыва
  const startTime = performance.now();
  const blastDuration = 1400; // 1.4 секунды
  const blastInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1.0, elapsed / blastDuration);

    const fScale = 1.0 + progress * 8.5;
    fireball.scale.set(fScale, fScale * 1.3, fScale);
    fireball.material.opacity = Math.max(0, 0.95 * (1.0 - progress));
    nukeLight.intensity = Math.max(0, 8.0 * (1.0 - progress));

    const rScale = 1.0 + progress * 16.0;
    shockRing.scale.set(rScale, rScale, rScale);
    shockRing.material.opacity = Math.max(0, 0.9 * (1.0 - progress));

    if (progress >= 1.0) {
      clearInterval(blastInterval);
      scene.remove(fireball);
      scene.remove(nukeLight);
      scene.remove(shockRing);
      fireballGeo.dispose();
      fireballMat.dispose();
      shockRingGeo.dispose();
      shockRingMat.dispose();
    }
  }, 25);
}

function spawnNukePropAt(pos, rot, vel, angVel) {
  const model = nukePreparedModel ? nukePreparedModel.clone(true) : createProceduralNukeModel();
  model.position.set(pos.x, pos.y, pos.z);
  if (rot) model.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  scene.add(model);

  const nukeShape = new CANNON.Box(new CANNON.Vec3(0.65, 1.6, 0.65));
  const body = new CANNON.Body({
    mass: 25.0,
    shape: nukeShape,
    material: cubeMaterial,
    linearDamping: 0.25,
    angularDamping: 0.4
  });
  body.position.set(pos.x, pos.y, pos.z);
  if (rot) body.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  if (vel) body.velocity.set(vel.x, vel.y, vel.z);
  if (angVel) body.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  setupBodyCollisionAudio(body, false);
  world.addBody(body);
  const nukeObj = { mesh: model, body: body, isNuke: true, isDetonated: false };
  physicsObjects.push(nukeObj);
  return nukeObj;
}

// DOM элементы модального окна создания мира с картами
const worldCreateDialog = document.getElementById('world-create-dialog');
const btnWorldCreateClose = document.getElementById('btn-world-create-close');
const btnWorldCreateConfirm = document.getElementById('btn-world-create-confirm');
const btnWorldCreateCancel = document.getElementById('btn-world-create-cancel');
const worldCreateNameInput = document.getElementById('world-create-name');
let selectedMapId = 'baseplate';

// Выбор карты кликом по карточке
document.querySelectorAll('.map-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedMapId = card.getAttribute('data-map-id') || 'baseplate';
  });
});

if (btnWorldCreateClose) {
  btnWorldCreateClose.addEventListener('click', (e) => {
    e.stopPropagation();
    if (worldCreateDialog) worldCreateDialog.classList.add('hidden');
  });
}

if (btnWorldCreateCancel) {
  btnWorldCreateCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (worldCreateDialog) worldCreateDialog.classList.add('hidden');
  });
}

if (btnWorldCreateConfirm) {
  btnWorldCreateConfirm.addEventListener('click', () => {
    const worlds = getAllWorlds();
    if (worlds.length >= MAX_WORLDS_COUNT) {
      showRetroAlert('Достигнут максимум миров (5). Удалите один из миров, чтобы создать новый.', 'Лимит миров');
      if (worldCreateDialog) worldCreateDialog.classList.add('hidden');
      return;
    }

    const worldName = (worldCreateNameInput ? worldCreateNameInput.value.trim() : '') || `Мир #${worlds.length + 1}`;
    const newId = 'world_' + Date.now();
    const mapName = selectedMapId === 'flat_grid' ? 'Сетка инженера' : 'Baseplate';

    const newWorldData = {
      id: newId,
      name: worldName,
      map: selectedMapId,
      mapTitle: mapName,
      lastSaved: Date.now(),
      blocksCount: 0,
      player: {
        pos: { x: 0, y: standHeight, z: 0 },
        pitch: 0,
        yaw: 0,
        isFlying: false,
        flySpeed: 12.0,
        equippedWeapon: '1-1',
        ammo: { current: 18, maxClip: 18, reserve: 54, isReloading: false, reloadTimer: 0, lastShotTime: 0, fireRate: 0.16 }
      },
      blocks: []
    };

    worlds.unshift(newWorldData);
    saveAllWorlds(worlds);

    // Закрываем модалку создания мира и обновляем список в меню миров (НЕ закидываем сразу в игру!)
    if (worldCreateDialog) worldCreateDialog.classList.add('hidden');
    renderWorldsListUI();
    showFlightHudNotification(`Мир «${worldName}» [${mapName}] успешно создан!`);
  });
}

// Открытие окна создания нового мира
function openCreateWorldDialog() {
  const worlds = getAllWorlds();
  if (worlds.length >= MAX_WORLDS_COUNT) {
    showRetroAlert('Достигнут максимум миров (5). Удалите один из миров, чтобы создать новый.', 'Лимит миров');
    return;
  }
  if (worldCreateNameInput) {
    worldCreateNameInput.value = `Мир #${worlds.length + 1}`;
  }
  if (worldCreateDialog) {
    worldCreateDialog.classList.remove('hidden');
  }
}

// Создание нового мира
function createNewWorldFlow() {
  openCreateWorldDialog();
}

// Сохранение текущего активного мира
function saveCurrentActiveWorld() {
  if (!currentActiveWorldId) {
    currentActiveWorldId = 'world_' + Date.now();
  }
  const worlds = getAllWorlds();
  let existing = worlds.find((w) => w.id === currentActiveWorldId);
  const worldName = existing ? existing.name : `Мир #${worlds.length + 1}`;
  const state = serializeCurrentWorldState(worldName);

  if (existing) {
    const idx = worlds.indexOf(existing);
    worlds[idx] = state;
  } else {
    if (worlds.length >= MAX_WORLDS_COUNT) {
      worlds.pop(); // держим в лимите 5
    }
    worlds.unshift(state);
  }
  saveAllWorlds(worlds);
}

// Запуск прелоадера: настоящая загрузка ресурсов с гарантированным завершением
function startPreloaderSequence() {
  crosshairEl.style.display = 'none';
  const hintEl = document.getElementById('hint-bottom-left');
  if (hintEl) hintEl.style.display = 'none';
  controls.enabled = false;

  let currentVisualProgress = 0;
  let targetProgress = 0;
  let assetsLoaded = false;
  const startTime = performance.now();
  const minLoadingTime = 1600;

  loadEssentialAssets((ratio) => {
    targetProgress = ratio * 100;
  }).then(() => {
    assetsLoaded = true;
  });

  // Гарантированный таймаут: если ресурсы грузятся дольше 3.5 сек, принудительно открываем меню
  const safetyTimeout = setTimeout(() => {
    assetsLoaded = true;
    targetProgress = 100;
  }, 3500);

  function finishPreloader() {
    clearTimeout(safetyTimeout);
    if (preloaderFill) preloaderFill.style.width = '100%';
    setTimeout(() => {
      if (preloaderOverlay) {
        preloaderOverlay.classList.add('fade-out');
      }
      setTimeout(() => {
        if (preloaderOverlay) {
          preloaderOverlay.style.display = 'none';
        }
        if (mainMenuEl) {
          mainMenuEl.classList.remove('hidden');
          void mainMenuEl.offsetWidth;
          mainMenuEl.classList.add('visible');
          startMenuMusic();
          // Автоматическая проверка обновлений игры с GitHub
          setTimeout(() => {
            if (typeof checkForGameUpdates === 'function') {
              checkForGameUpdates(false);
            }
          }, 1200);
        }
      }, 900);
    }, 250);
  }

  function tickPreloader(now) {
    const elapsed = now - startTime;
    const minProgress = Math.min(95, (elapsed / minLoadingTime) * 100);
    const effectiveTarget = assetsLoaded && elapsed >= minLoadingTime ? 100 : Math.max(targetProgress, minProgress);

    currentVisualProgress += (effectiveTarget - currentVisualProgress) * 0.15;
    if (effectiveTarget === 100 && 100 - currentVisualProgress < 0.6) {
      currentVisualProgress = 100;
    }

    if (preloaderFill) {
      preloaderFill.style.width = `${Math.min(100, Math.round(currentVisualProgress))}%`;
    }

    if (currentVisualProgress < 99.8) {
      requestAnimationFrame(tickPreloader);
    } else {
      finishPreloader();
    }
  }

  requestAnimationFrame(tickPreloader);
}

let menuMusicAudio = null;

function startMenuMusic() {
  if (menuMusicAudio) return;
  menuMusicAudio = new Audio('./sounds/menu_music.mp3');
  menuMusicAudio.loop = true;
  menuMusicAudio.volume = 0.45;
  menuMusicAudio.play().catch(() => {
    // Если браузер блокирует автоплей до первого клика, запускаем по любому взаимодействию
    const resumeOnInteraction = () => {
      if (isInMainMenu && menuMusicAudio) {
        menuMusicAudio.play().catch(() => {});
      }
      window.removeEventListener('pointerdown', resumeOnInteraction);
      window.removeEventListener('keydown', resumeOnInteraction);
    };
    window.addEventListener('pointerdown', resumeOnInteraction, { once: true });
    window.addEventListener('keydown', resumeOnInteraction, { once: true });
  });
}

function stopMenuMusic() {
  if (!menuMusicAudio) return;
  // Плавное затухание громкости музыки при переходе в игру
  const fadeAudio = setInterval(() => {
    if (menuMusicAudio && menuMusicAudio.volume > 0.05) {
      menuMusicAudio.volume = Math.max(0, menuMusicAudio.volume - 0.05);
    } else {
      clearInterval(fadeAudio);
      if (menuMusicAudio) {
        menuMusicAudio.pause();
        menuMusicAudio.currentTime = 0;
        menuMusicAudio = null;
      }
    }
  }, 40);
}

// Навешиваем события на кнопки главного меню
if (btnPlay) {
  btnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    // При нажатии «Играть» открывается окно со списком миров (до 5 миров)
    renderWorldsListUI();
    if (worldsModal) worldsModal.classList.remove('hidden');
  });
}

if (btnCloseWorlds) {
  btnCloseWorlds.addEventListener('click', (e) => {
    e.stopPropagation();
    if (worldsModal) worldsModal.classList.add('hidden');
  });
}

if (btnCreateWorld) {
  btnCreateWorld.addEventListener('click', (e) => {
    e.stopPropagation();
    createNewWorldFlow();
  });
}

if (btnImportWorld && inputImportWorld) {
  btnImportWorld.addEventListener('click', (e) => {
    e.stopPropagation();
    inputImportWorld.value = '';
    inputImportWorld.click();
  });

  inputImportWorld.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      importWorldFromFile(file);
    }
  });
}

// --- Управление разделами (вкладками) настроек ---
document.querySelectorAll('.settings-tab-btn').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    const targetTab = tabBtn.getAttribute('data-tab');
    document.querySelectorAll('.settings-tab-btn').forEach((b) => b.classList.remove('active'));
    tabBtn.classList.add('active');

    document.querySelectorAll('.settings-tab-pane').forEach((pane) => {
      pane.classList.add('hidden');
    });
    const activePane = document.getElementById(`tab-pane-${targetTab}`);
    if (activePane) activePane.classList.remove('hidden');
  });
});

// Слушатели слайдеров настроек:
if (settingVolMaster) {
  settingVolMaster.addEventListener('input', (e) => {
    masterVolume = parseInt(e.target.value, 10) / 100;
    if (valVolMaster) valVolMaster.textContent = `${e.target.value}%`;
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
    }
    if (menuMusicAudio) {
      menuMusicAudio.volume = Math.max(0, Math.min(1, masterVolume * musicVolume));
    }
  });
}

if (settingVolSfx) {
  settingVolSfx.addEventListener('input', (e) => {
    sfxVolume = parseInt(e.target.value, 10) / 100;
    if (valVolSfx) valVolSfx.textContent = `${e.target.value}%`;
    if (sfxGainNode && audioCtx) {
      sfxGainNode.gain.setValueAtTime(sfxVolume, audioCtx.currentTime);
    }
  });
}

if (settingVolMusic) {
  settingVolMusic.addEventListener('input', (e) => {
    musicVolume = parseInt(e.target.value, 10) / 100;
    if (valVolMusic) valVolMusic.textContent = `${e.target.value}%`;
    if (menuMusicAudio) {
      menuMusicAudio.volume = Math.max(0, Math.min(1, masterVolume * musicVolume));
    }
  });
}

if (settingFov) {
  settingFov.addEventListener('input', (e) => {
    currentDefaultFov = parseInt(e.target.value, 10);
    if (valFov) valFov.textContent = `${currentDefaultFov}°`;
    if (!keys.zoom) {
      camera.fov = currentDefaultFov;
      camera.updateProjectionMatrix();
    }
  });
}

if (settingSens) {
  settingSens.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    mouseSensMultiplier = val / 5.0; // 1 -> 0.2x, 5 -> 1.0x, 10 -> 2.0x
    if (valSens) valSens.textContent = val;
    if (controls) {
      controls.pointerSpeed = mouseSensMultiplier;
    }
  });
}

if (btnSettings) {
  btnSettings.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.remove('hidden');
  });
}

if (btnCloseSettings) {
  btnCloseSettings.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.add('hidden');
  });
}

if (btnApplySettings) {
  btnApplySettings.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.add('hidden');
  });
}

if (btnExit) {
  btnExit.addEventListener('click', () => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('win-close');
      } catch (_) {
        window.close();
      }
    } else {
      window.close();
    }
  });
}

// Запуск прелоадера сразу при загрузке страницы
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    startPreloaderSequence();
  });
} else {
  // DOM уже загружен к моменту выполнения модуля
  startPreloaderSequence();
}

let isLockingRequested = false;
let lastPointerUnlockTime = 0;

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) {
    lastPointerUnlockTime = performance.now();
  }
});

function requestPointerLockSafely(retryCount = 0) {
  if (isInMainMenu || isPaused || isMenuOpen || isRotateMenuOpen) return;
  if (controls && controls.isLocked) return;

  const timeSinceUnlock = performance.now() - lastPointerUnlockTime;
  if (timeSinceUnlock < 140) {
    setTimeout(() => requestPointerLockSafely(retryCount), 140 - timeSinceUnlock + 20);
    return;
  }

  isLockingRequested = true;
  try {
    const el = (renderer && renderer.domElement) ? renderer.domElement : document.body;
    const promise = el.requestPointerLock ? el.requestPointerLock() : null;
    if (promise && typeof promise.catch === 'function') {
      promise.then(() => {
        if (controls) {
          controls.isLocked = true;
          controls.enabled = true;
        }
      }).catch(() => {
        if (retryCount < 2 && !isInMainMenu && !isPaused && !isMenuOpen && !isRotateMenuOpen && controls && !controls.isLocked) {
          setTimeout(() => requestPointerLockSafely(retryCount + 1), 250 * (retryCount + 1));
        }
      });
    }
  } catch (_) {}
}

function openPause() {
  if (isInMainMenu) return; // В главном меню пауза не открывается
  if (isMenuOpen) closeMenu();
  isPaused = true;
  controls.enabled = false;
  pauseOverlay.classList.remove('hidden');
  crosshairEl.style.display = 'none';

  for (const k in keys) {
    keys[k] = false;
  }
  flyVelocity.set(0, 0, 0);

  if (grabbedBody) {
    releaseGrabbedBody(false);
  }
}

function closePause() {
  isPaused = false;
  pauseOverlay.classList.add('hidden');
  crosshairEl.style.display = '';
  controls.enabled = true;

  if (!controls.isLocked) {
    requestPointerLockSafely();
  }
}

function togglePause() {
  if (isPaused) {
    closePause();
  } else {
    openPause();
    if (controls.isLocked) {
      try {
        controls.unlock();
      } catch (_) {}
    }
  }
}

// Кнопки полноценного меню паузы:
const btnPauseResume = document.getElementById('btn-pause-resume');
const btnPauseSettings = document.getElementById('btn-pause-settings');
const btnPauseExit = document.getElementById('btn-pause-exit');

if (btnPauseResume) {
  btnPauseResume.addEventListener('click', (e) => {
    e.stopPropagation();
    closePause();
  });
}

if (btnPauseSettings) {
  btnPauseSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settingsModal) settingsModal.classList.remove('hidden');
  });
}

if (btnPauseExit) {
  btnPauseExit.addEventListener('click', (e) => {
    e.stopPropagation();

    // Если находились в сетевой сессии — корректно выходим без сохранения мира
    if (isHostingServer || isConnectedToHost) {
      leaveMultiplayerSession();
    }

    // 2. Закрываем паузу и очищаем игровой мир
    isPaused = false;
    pauseOverlay.classList.add('hidden');
    clearGameplayWorldObjects();

    // Полная очистка удаленных аватаров из Three.js сцены
    remotePlayerAvatars.forEach((avatar) => {
      try {
        if (avatar && avatar.group) scene.remove(avatar.group);
      } catch (_) {}
    });
    remotePlayerAvatars.clear();

    isInMainMenu = true;
    isGameStarted = false;
    if (viewmodelRoot) {
      viewmodelRoot.visible = false;
    }
    if (pistolMeshGroup) {
      pistolMeshGroup.visible = false;
    }
    if (toolgunMeshGroup) {
      toolgunMeshGroup.visible = false;
    }
    camera.position.set(0, -999, 0);
    controls.enabled = false;
    if (controls.isLocked) {
      try {
        controls.unlock();
      } catch (_) {}
    }

    // Полностью скрываем весь игровой HUD
    if (crosshairEl) crosshairEl.style.display = 'none';
    if (ammoHudEl) ammoHudEl.classList.add('hidden');
    if (weaponHudEl) weaponHudEl.classList.add('hidden');
    const flightSpeedEl = document.getElementById('flight-speed-overlay');
    if (flightSpeedEl) flightSpeedEl.classList.add('hidden');
    const throwPowerEl = document.getElementById('throw-power-overlay');
    if (throwPowerEl) throwPowerEl.classList.add('hidden');
    const axisHudEl = document.getElementById('axis-hud');
    if (axisHudEl) axisHudEl.classList.add('hidden');
    const hintEl = document.getElementById('hint-bottom-left');
    if (hintEl) hintEl.style.display = 'none';
    if (mpRoomHud) mpRoomHud.classList.add('hidden');
    if (mpTabOverlay) mpTabOverlay.classList.add('hidden');

    // В главном меню виртуальный игровой курсор скрыт — активен нормальный курсор интерфейса
    if (customCursorEl) {
      customCursorEl.classList.add('hidden');
    }

    if (mainMenuEl) {
      mainMenuEl.classList.remove('hidden', 'fade-out-game');
      void mainMenuEl.offsetWidth;
      mainMenuEl.classList.add('visible');
    }
    startMenuMusic();
    cleanupMenuChaosObjects();
  });
}

function getItemDisplayName(type) {
  switch (type) {
    case 'sphere': return 'Круг';
    case 'triangle': return 'Треугольник';
    case 'ramp': return 'Рампа';
    case 'secret_cube': return 'Секретный куб';
    case 'nuke': return 'Ядерная бомба';
    case 'cube':
    default: return 'Куб';
  }
}

function updateSpawnMenuModeUI() {
  const isToolGun = (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1');
  const spawnMenuTitle = document.getElementById('spawn-menu-title');
  const modeBanner = document.getElementById('spawn-menu-mode-banner');
  const toolgunFooter = document.getElementById('spawn-menu-toolgun-footer');
  const currentItemLabel = document.getElementById('spawn-menu-current-item-label');

  if (spawnMenuTitle) {
    spawnMenuTitle.textContent = isToolGun ? 'Предметы [Режим Tool Gun: выбор блока]' : 'Предметы';
  }
  if (modeBanner) {
    if (isToolGun) modeBanner.classList.remove('hidden');
    else modeBanner.classList.add('hidden');
  }
  if (toolgunFooter) {
    if (isToolGun) toolgunFooter.classList.remove('hidden');
    else toolgunFooter.classList.add('hidden');
  }
  if (currentItemLabel) {
    currentItemLabel.textContent = getItemDisplayName(toolGunSelectedItem);
  }

  document.querySelectorAll('.item-card').forEach(card => {
    const itemType = card.getAttribute('data-item');
    const isSelected = isToolGun && (toolGunSelectedItem === itemType);
    if (isSelected) {
      card.classList.add('is-selected-for-toolgun');
    } else {
      card.classList.remove('is-selected-for-toolgun');
    }

    const btn = card.querySelector('.spawn-btn');
    if (btn) {
      if (isToolGun) {
        if (isSelected) {
          btn.classList.add('is-selected-btn');
          btn.textContent = '[Выбрано]';
        } else {
          btn.classList.remove('is-selected-btn');
          btn.textContent = 'Выбрать';
        }
      } else {
        btn.classList.remove('is-selected-btn');
        btn.textContent = 'Создать';
      }
    }
  });
}

function openMenu() {
  if (isPaused) closePause();
  isMenuOpen = true;
  controls.enabled = false; // Блокируем вращение камеры пока открыто меню
  updateSpawnMenuModeUI();
  spawnMenu.classList.remove('hidden');
  mouseScreenX = window.innerWidth / 2;
  mouseScreenY = window.innerHeight / 2;
  // Показываем виртуальный курсор ТОЛЬКО когда мышь захвачена игрой (в Pointer Lock),
  // иначе браузер уже отображает системный курсор ОС и двойной курсор исключен
  if (customCursorEl) {
    if (controls.isLocked) {
      customCursorEl.classList.remove('hidden');
      customCursorEl.style.transform = `translate3d(${mouseScreenX}px, ${mouseScreenY}px, 0)`;
    } else {
      customCursorEl.classList.add('hidden');
    }
  }
}

function closeMenu() {
  isMenuOpen = false;
  controls.enabled = !isPaused; // Восстанавливаем вращение камеры
  spawnMenu.classList.add('hidden');
  if (customCursorEl) {
    customCursorEl.classList.add('hidden');
    customCursorEl.classList.remove('pointer');
  }
  if (currentHoveredEl) {
    currentHoveredEl.classList.remove('is-hovered');
    currentHoveredEl = null;
  }
  if (pressedEl) {
    pressedEl.classList.remove('is-active');
    pressedEl = null;
  }
  if (!isPaused) {
    crosshairEl.style.display = '';
  }
  if (!controls.isLocked && !isPaused) {
    requestPointerLockSafely();
  }
}

// При потере фокуса окна (Alt + Tab) или выходе из PointerLock скрываем кастомный курсор
window.addEventListener('blur', () => {
  for (const k in keys) {
    keys[k] = false;
  }
  flyVelocity.set(0, 0, 0);
  if (customCursorEl) {
    customCursorEl.classList.add('hidden');
  }
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    controls.isLocked = true;
    isLockingRequested = false;
    // Если сняли с паузы — оверлей точно скрыт, управление активно
    if (!isPaused) {
      pauseOverlay.classList.add('hidden');
      crosshairEl.style.display = '';
    }
    controls.enabled = !isMenuOpen && !isPaused;
    if (isMenuOpen && customCursorEl) {
      customCursorEl.classList.remove('hidden');
      customCursorEl.style.transform = `translate3d(${mouseScreenX}px, ${mouseScreenY}px, 0)`;
    }
  } else {
    controls.isLocked = false;
    controls.enabled = false;

    // При выходе из захвата мыши (по ESC, Alt+Tab или клику вне игры):
    for (const k in keys) {
      keys[k] = false;
    }
    flyVelocity.set(0, 0, 0);

    // Если держали предмет — мягко отпускаем его
    if (grabbedBody) {
      releaseGrabbedBody(false);
    }

    // Всегда скрываем виртуальный курсор при отсутствии захвата, чтобы никогда не было раздвоения
    if (customCursorEl) {
      customCursorEl.classList.add('hidden');
    }

    // Если меню предметов было открыто при сбросе PointerLock (например, нажатие ESC) —
    // закрываем меню предметов, но НЕ открываем оверлей паузы!
    if (isMenuOpen) {
      isLockingRequested = true;
      closeMenu();
      return;
    }

    // Если было открыто меню вращения — не открываем паузу!
    if (isRotateMenuOpen) {
      return;
    }

    // Открываем оверлей паузы только если игра не на паузе и не была вызвана намеренная переблокировка
    if (!isPaused && !isLockingRequested) {
      openPause();
    }
    isLockingRequested = false;
  }
});

function toggleMenu() {
  if (isMenuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

if (closeMenuBtn) {
  closeMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeMenu();
  });
}



// --- Система физических объектов (Спавн и манипуляция) ---
// --- Система физических объектов (Спавн и манипуляция) ---
const physicsObjects = [];

// Текстура для секретного пасхального кубика (мем-текстура)
const textureLoader = new THREE.TextureLoader();
const secretCubeTexture = textureLoader.load('./secret-cube-texture.png');
secretCubeTexture.colorSpace = THREE.SRGBColorSpace;
secretCubeTexture.generateMipmaps = true;
secretCubeTexture.minFilter = THREE.LinearMipmapLinearFilter;
secretCubeTexture.magFilter = THREE.LinearFilter;

function spawnCube() {
  const size = 1.0;
  const cubeGeo = new THREE.BoxGeometry(size, size, size);

  // Классический цельный светло-серый материал (как у сферы и клина)
  const cubeMat = new THREE.MeshStandardMaterial({
    color: 0xb8bac0,
    roughness: 0.35,
    metalness: 0.1
  });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);

  // Спавним на 2.5 метра строго на уровне глаз, чтобы он падал вниз
  const spawnDir = new THREE.Vector3();
  camera.getWorldDirection(spawnDir);
  const spawnPos = new THREE.Vector3(
    camera.position.x + spawnDir.x * 2.5,
    camera.position.y,
    camera.position.z + spawnDir.z * 2.5
  );
  // Проверяем, нет ли уже куба в точке спавна, чтобы не спавнить тело строго внутри тела
  let adjustedY = spawnPos.y;
  for (const obj of physicsObjects) {
    const distSq = spawnPos.distanceToSquared(obj.mesh.position);
    if (distSq < 0.9) {
      adjustedY = Math.max(adjustedY, obj.mesh.position.y + size + 0.1);
    }
  }
  spawnPos.y = adjustedY;

  cubeMesh.position.copy(spawnPos);
  scene.add(cubeMesh);

  // Физическое тело CANNON с низким демпфированием (без залипания)
  const halfExtents = new CANNON.Vec3(size / 2, size / 2, size / 2);
  const cubeShape = new CANNON.Box(halfExtents);
  const cubeBody = new CANNON.Body({
    mass: 5,
    shape: cubeShape,
    material: cubeMaterial,
    linearDamping: 0.05,
    angularDamping: 0.08
  });
  cubeBody.sleepSpeedLimit = 0.15;
  cubeBody.sleepTimeLimit = 0.5;
  cubeBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  cubeBody.velocity.set(0, -0.5, 0);
  setupBodyCollisionAudio(cubeBody, false);
  world.addBody(cubeBody);

  const obj = { mesh: cubeMesh, body: cubeBody, isCube: true, geo: cubeGeo };
  physicsObjects.push(obj);
  notifySpawnBlock(obj, 'cube');
  return obj;
}

// Спавн секретного пасхального куба с кастомной мем-текстурой
function spawnSecretCube(pos, initialVelocity = new CANNON.Vec3(0, 0, 0)) {
  const size = 1.0;
  const cubeGeo = new THREE.BoxGeometry(size, size, size);
  const cubeMat = new THREE.MeshStandardMaterial({
    map: secretCubeTexture,
    roughness: 0.3,
    metalness: 0.1
  });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  cubeMesh.position.copy(pos);
  scene.add(cubeMesh);

  const halfExtents = new CANNON.Vec3(size / 2, size / 2, size / 2);
  const cubeShape = new CANNON.Box(halfExtents);
  const cubeBody = new CANNON.Body({
    mass: 5.5,
    shape: cubeShape,
    material: cubeMaterial,
    linearDamping: 0.05,
    angularDamping: 0.08
  });
  cubeBody.position.set(pos.x, pos.y, pos.z);
  cubeBody.velocity.copy(initialVelocity);
  cubeBody.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
  setupBodyCollisionAudio(cubeBody, false);
  world.addBody(cubeBody);

  const obj = { mesh: cubeMesh, body: cubeBody, isCube: true, isSecretCube: true, geo: cubeGeo };
  physicsObjects.push(obj);
  notifySpawnBlock(obj, 'secret_cube');
  return obj;
}


// --- Спавн Сферы (Круг / Шар) ---
function spawnSphere() {
  const radius = 0.5;
  const sphereGeo = new THREE.SphereGeometry(radius, 24, 24);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xb8bac0,
    roughness: 0.3,
    metalness: 0.1
  });
  const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);

  const spawnDir = new THREE.Vector3();
  camera.getWorldDirection(spawnDir);
  const spawnPos = new THREE.Vector3(
    camera.position.x + spawnDir.x * 2.5,
    camera.position.y,
    camera.position.z + spawnDir.z * 2.5
  );

  let adjustedY = spawnPos.y;
  for (const obj of physicsObjects) {
    const distSq = spawnPos.distanceToSquared(obj.mesh.position);
    if (distSq < 0.9) {
      adjustedY = Math.max(adjustedY, obj.mesh.position.y + radius * 2 + 0.1);
    }
  }
  spawnPos.y = adjustedY;
  sphereMesh.position.copy(spawnPos);
  scene.add(sphereMesh);

  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({
    mass: 4.0,
    shape: sphereShape,
    material: cubeMaterial,
    linearDamping: 0.05,
    angularDamping: 0.08
  });
  sphereBody.sleepSpeedLimit = 0.15;
  sphereBody.sleepTimeLimit = 0.5;
  sphereBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  sphereBody.velocity.set(0, -0.5, 0);
  setupBodyCollisionAudio(sphereBody, true);
  world.addBody(sphereBody);

  const obj = { mesh: sphereMesh, body: sphereBody, isSphere: true, wasHeldByPlayer: false, geo: sphereGeo };
  physicsObjects.push(obj);
  notifySpawnBlock(obj, 'sphere');
  return obj;
}

// --- Спавн Треугольника (Классическая Треугольная Призма / Triangle Block) ---
function createEquilateralPrismGeometry(width = 1.0, length = 1.0) {
  // Равносторонний треугольник в плоскости XY, вытянутый по Z (длина)
  // Сторона a = width, высота h = a * sqrt(3) / 2
  const a = width;
  const h = a * (Math.sqrt(3) / 2);
  const l = length / 2;
  const halfA = a / 2;
  const yBottom = -h / 3; // центрирование по центру масс
  const yTop = 2 * h / 3;

  // 6 вершин призмы:
  // Нижний левый (перед/зад):  (-halfA, yBottom, +l / -l)
  // Нижний правый (перед/зад): ( halfA, yBottom, +l / -l)
  // Верхний пик (перед/зад):   (     0, yTop,    +l / -l)
  const positions = [
    // 1. Передняя грань (треугольник Z = +l)
    -halfA, yBottom, l, halfA, yBottom, l, 0, yTop, l,

    // 2. Задняя грань (треугольник Z = -l)
    halfA, yBottom, -l, -halfA, yBottom, -l, 0, yTop, -l,

    // 3. Нижняя грань (прямоугольник Y = yBottom)
    -halfA, yBottom, -l, halfA, yBottom, -l, halfA, yBottom, l,
    -halfA, yBottom, -l, halfA, yBottom, l, -halfA, yBottom, l,

    // 4. Левый скат (прямоугольник от низа к вершине)
    -halfA, yBottom, l, 0, yTop, l, 0, yTop, -l,
    -halfA, yBottom, l, 0, yTop, -l, -halfA, yBottom, -l,

    // 5. Правый скат (прямоугольник от низа к вершине)
    halfA, yBottom, -l, 0, yTop, -l, 0, yTop, l,
    halfA, yBottom, -l, 0, yTop, l, halfA, yBottom, l,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function spawnTriangle() {
  const size = 1.0;
  const triGeo = createEquilateralPrismGeometry(size, size);
  const triMat = new THREE.MeshStandardMaterial({
    color: 0xb8bac0,
    roughness: 0.35,
    metalness: 0.1
  });
  const triMesh = new THREE.Mesh(triGeo, triMat);

  const spawnDir = new THREE.Vector3();
  camera.getWorldDirection(spawnDir);
  const spawnPos = new THREE.Vector3(
    camera.position.x + spawnDir.x * 2.5,
    camera.position.y,
    camera.position.z + spawnDir.z * 2.5
  );

  let adjustedY = spawnPos.y;
  for (const obj of physicsObjects) {
    const distSq = spawnPos.distanceToSquared(obj.mesh.position);
    if (distSq < 0.9) {
      adjustedY = Math.max(adjustedY, obj.mesh.position.y + size + 0.1);
    }
  }
  spawnPos.y = adjustedY;
  triMesh.position.copy(spawnPos);
  scene.add(triMesh);

  // CANNON ConvexPolyhedron: правильная треугольная призма
  const a = size;
  const h = a * (Math.sqrt(3) / 2);
  const l = size / 2;
  const halfA = a / 2;
  const yB = -h / 3;
  const yT = 2 * h / 3;

  const cannonVerts = [
    new CANNON.Vec3(-halfA, yB, l), // 0: перед-лево-низ
    new CANNON.Vec3(halfA, yB, l), // 1: перед-право-низ
    new CANNON.Vec3(0, yT, l), // 2: перед-верх
    new CANNON.Vec3(-halfA, yB, -l), // 3: зад-лево-низ
    new CANNON.Vec3(halfA, yB, -l), // 4: зад-право-низ
    new CANNON.Vec3(0, yT, -l), // 5: зад-верх
  ];
  const cannonFaces = [
    [0, 1, 2],    // перед
    [4, 3, 5],    // зад
    [3, 4, 1, 0], // дно
    [0, 2, 5, 3], // левый скат
    [4, 5, 2, 1], // правый скат
  ];
  const triShape = new CANNON.ConvexPolyhedron({
    vertices: cannonVerts,
    faces: cannonFaces
  });

  const triBody = new CANNON.Body({
    mass: 4.0,
    shape: triShape,
    material: cubeMaterial,
    linearDamping: 0.05,
    angularDamping: 0.08
  });
  triBody.sleepSpeedLimit = 0.15;
  triBody.sleepTimeLimit = 0.5;
  triBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  triBody.velocity.set(0, -0.5, 0);
  setupBodyCollisionAudio(triBody, false);
  world.addBody(triBody);

  const obj = { mesh: triMesh, body: triBody, isTriangle: true, geo: triGeo };
  physicsObjects.push(obj);
  notifySpawnBlock(obj, 'triangle');
  return obj;
}

// --- Спавн Рампы (Классический Клин / Трамплин) ---
function createRampGeometry(size = 1.0) {
  const h = size / 2;
  const positions = [
    // 1. Задняя вертикальная грань (прямоугольник Z = -h)
    -h, -h, -h, h, h, -h, h, -h, -h,
    -h, -h, -h, -h, h, -h, h, h, -h,

    // 2. Нижняя грань (прямоугольник Y = -h)
    -h, -h, -h, h, -h, -h, h, -h, h,
    -h, -h, -h, h, -h, h, -h, -h, h,

    // 3. Наклонный скат (от Z=-h, Y=h к Z=h, Y=-h)
    -h, h, -h, h, -h, h, h, h, -h,
    -h, h, -h, -h, -h, h, h, -h, h,

    // 4. Левый треугольник (X = -h)
    -h, -h, -h, -h, -h, h, -h, h, -h,

    // 5. Правый треугольник (X = h)
    h, -h, -h, h, h, -h, h, -h, h,
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function spawnRamp() {
  const size = 1.0;
  const rampGeo = createRampGeometry(size);
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xb8bac0,
    roughness: 0.35,
    metalness: 0.1
  });
  const rampMesh = new THREE.Mesh(rampGeo, rampMat);

  const spawnDir = new THREE.Vector3();
  camera.getWorldDirection(spawnDir);
  const spawnPos = new THREE.Vector3(
    camera.position.x + spawnDir.x * 2.5,
    camera.position.y,
    camera.position.z + spawnDir.z * 2.5
  );

  let adjustedY = spawnPos.y;
  for (const obj of physicsObjects) {
    const distSq = spawnPos.distanceToSquared(obj.mesh.position);
    if (distSq < 0.9) {
      adjustedY = Math.max(adjustedY, obj.mesh.position.y + size + 0.1);
    }
  }
  spawnPos.y = adjustedY;
  rampMesh.position.copy(spawnPos);
  scene.add(rampMesh);

  const h = size / 2;
  const cannonVertices = [
    new CANNON.Vec3(-h, -h, -h), // 0
    new CANNON.Vec3(h, -h, -h), // 1
    new CANNON.Vec3(h, -h, h), // 2
    new CANNON.Vec3(-h, -h, h), // 3
    new CANNON.Vec3(-h, h, -h), // 4
    new CANNON.Vec3(h, h, -h), // 5
  ];
  const cannonFaces = [
    [0, 4, 5, 1], // задняя
    [0, 1, 2, 3], // нижняя
    [4, 3, 2, 5], // наклонная
    [0, 3, 4],    // левый треугольник
    [1, 5, 2],    // правый треугольник
  ];
  const rampShape = new CANNON.ConvexPolyhedron({
    vertices: cannonVertices,
    faces: cannonFaces
  });

  const rampBody = new CANNON.Body({
    mass: 4.5,
    shape: rampShape,
    material: cubeMaterial,
    linearDamping: 0.05,
    angularDamping: 0.08
  });
  rampBody.sleepSpeedLimit = 0.15;
  rampBody.sleepTimeLimit = 0.5;
  rampBody.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  rampBody.velocity.set(0, -0.5, 0);
  setupBodyCollisionAudio(rampBody, false);
  world.addBody(rampBody);

  const obj = { mesh: rampMesh, body: rampBody, isRamp: true, geo: rampGeo };
  physicsObjects.push(obj);
  notifySpawnBlock(obj, 'ramp');
  return obj;
}

function spawnNukeProp() {
  const spawnDir = new THREE.Vector3();
  camera.getWorldDirection(spawnDir);
  const spawnPos = new THREE.Vector3(
    camera.position.x + spawnDir.x * 3.0,
    camera.position.y + 0.6,
    camera.position.z + spawnDir.z * 3.0
  );
  const obj = spawnNukePropAt(spawnPos, null, null, null);
  notifySpawnBlock(obj, 'nuke');
  return obj;
}

// Кулдаун спавна предметов (1 секунда)
let lastSpawnTime = 0;
const SPAWN_COOLDOWN_MS = 1000;

// Привязка кликов по карточкам меню
function spawnItemByType(type) {
  const isToolGun = (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1');
  if (isToolGun) {
    toolGunSelectedItem = type;
    updateToolGunHologramMesh();
    updateSpawnMenuModeUI();
    playCustomOrSynth('tg_select', (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(540, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(840, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    });
    showFlightHudNotification(`Tool Gun: выбран блок [${getItemDisplayName(type)}]`);
    closeMenu();
    return;
  }
  const now = performance.now();
  if (now - lastSpawnTime < SPAWN_COOLDOWN_MS) {
    const remainingSec = ((SPAWN_COOLDOWN_MS - (now - lastSpawnTime)) / 1000).toFixed(1);
    showFlightHudNotification(`Подождите ${remainingSec}с перед следующим спавном!`);
    return;
  }
  lastSpawnTime = now;

  // Воспроизводим звук спавна (spawn.mp3 / spawn.wav)
  playSpawnSound();

  let created = null;
  if (type === 'sphere') created = spawnSphere();
  else if (type === 'triangle') created = spawnTriangle();
  else if (type === 'ramp') created = spawnRamp();
  else if (type === 'nuke') created = spawnNukeProp();
  else created = spawnCube();
}

document.querySelectorAll('.item-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    spawnItemByType(card.getAttribute('data-item'));
  });
});

document.querySelectorAll('.spawn-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    spawnItemByType(btn.getAttribute('data-item'));
  });
});

// --- 3D предпросмотр моделек в карточках меню спавна ---
function createCardPreview(canvasId, createMeshFn) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(100, 100, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  camera.position.set(1.7, 1.3, 1.7);
  camera.lookAt(0, 0, 0);

  const amb = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  const mesh = createMeshFn();
  scene.add(mesh);

  return { renderer, scene, camera, mesh };
}

const previewCubeObj = createCardPreview('cube-preview-canvas', () => {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.0, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xb8bac0, roughness: 0.35, metalness: 0.15 })
  );
});

const previewSphereObj = createCardPreview('sphere-preview-canvas', () => {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xb5b7bc, roughness: 0.3, metalness: 0.15 })
  );
});

const previewTriangleObj = createCardPreview('triangle-preview-canvas', () => {
  return new THREE.Mesh(
    createEquilateralPrismGeometry(1.0, 1.0),
    new THREE.MeshStandardMaterial({ color: 0xb5b7bc, roughness: 0.35, metalness: 0.15 })
  );
});

const previewRampObj = createCardPreview('ramp-preview-canvas', () => {
  return new THREE.Mesh(
    createRampGeometry(1.0),
    new THREE.MeshStandardMaterial({ color: 0xb5b7bc, roughness: 0.35, metalness: 0.15 })
  );
});

const previewNukeObj = createCardPreview('nuke-preview-canvas', () => {
  const m = nukePreparedModel ? nukePreparedModel.clone(true) : createProceduralNukeModel();
  m.scale.multiplyScalar(0.38);
  return m;
});

const allPreviews = [previewCubeObj, previewSphereObj, previewTriangleObj, previewRampObj].filter(Boolean);

function updatePreview3D() {
  if (isMenuOpen) {
    for (const p of allPreviews) {
      p.mesh.rotation.y += 0.007;
      p.mesh.rotation.x = 0.22;
      p.renderer.render(p.scene, p.camera);
    }
  }
}

// --- Физика взаимодействия левой кнопкой мыши (таскать, толкать, метать по инерции) ---
let grabbedBody = null;
let grabDistance = 3.5;
let targetGrabDistance = 3.5;
const MIN_GRAB_DISTANCE = 1.2;
const MAX_GRAB_DISTANCE = 12.0;
let isGrabLocked = false; // Режим постоянного удержания (только по двойному клику)
let lastGrabClickTime = 0;

const grabRelativeQuat = new THREE.Quaternion(); // сохраняет относительный угол к игроку при взятии
let isGrabRotationLocked = false; // Блокировка ориентации по R: предмет статичен в пространстве
const fixedGrabQuat = new THREE.Quaternion(); // Фиксированная мировая ориентация при нажатии R
const raycaster = new THREE.Raycaster();
const centerScreen = new THREE.Vector2(0, 0);
const grabVelocityHistory = new THREE.Vector3(); // вектор реальной скорости маха рукой/камерой
const lastTargetPos = new THREE.Vector3(); // предыдущая позиция точки удержания для чистого замера скорости
let hasLastTargetPos = false;

function releaseGrabbedBody(applySwing = true) {
  if (!grabbedBody) return;

  if (applySwing) {
    const swingSpeed = grabVelocityHistory.length();
    // Бросок срабатывает только если игрок РЕАЛЬНО взмахнул рукой/камерой (> 1.2 м/с)
    if (swingSpeed > 1.2) {
      const swingVel = new THREE.Vector3(grabVelocityHistory.x, grabVelocityHistory.y, grabVelocityHistory.z);
      const swingAngVel = new THREE.Vector3(
        (Math.random() - 0.5) * Math.min(swingSpeed, 5.0),
        (Math.random() - 0.5) * Math.min(swingSpeed, 5.0),
        (Math.random() - 0.5) * Math.min(swingSpeed, 5.0)
      );
      setWeldClusterVelocity(grabbedBody, swingVel, swingAngVel);
    } else {
      // Игрок стоял неподвижно и просто отпустил кнопку — кубик аккуратно падает вниз под гравитацией
      grabbedBody.velocity.set(0, -0.5, 0);
      grabbedBody.angularVelocity.set(0, 0, 0);
    }
  } else {
    grabbedBody.velocity.set(0, 0, 0);
    grabbedBody.angularVelocity.set(0, 0, 0);
  }

  grabbedBody.wakeUp();
  grabbedBody = null;
  isGrabLocked = false;
  isGrabRotationLocked = false;
  hasLastTargetPos = false;
  grabVelocityHistory.set(0, 0, 0);
  crosshairEl.classList.remove('grabbed');
}

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// --- Система связок/закрепов (Weld / LockConstraint на Z) ---
const weldConstraints = [];

// ============================================================================
// --- СИСТЕМА ДИНАМИЧЕСКИХ СВЯЗОК И КЛАСТЕРОВ СВАРЕННЫХ БЛОКОВ ---
// ============================================================================
function getWeldClusterForBody(body) {
  if (!body) return [];
  const cluster = new Set([body]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of weldConstraints) {
      if (cluster.has(w.bodyA) && !cluster.has(w.bodyB)) {
        cluster.add(w.bodyB);
        changed = true;
      } else if (cluster.has(w.bodyB) && !cluster.has(w.bodyA)) {
        cluster.add(w.bodyA);
        changed = true;
      }
    }
  }
  return Array.from(cluster);
}

function wakeWeldCluster(body) {
  if (!body) return;
  const cluster = getWeldClusterForBody(body);
  for (const b of cluster) {
    b.wakeUp();
  }
}

function setWeldClusterVelocity(body, vel, angVel) {
  if (!body) return;
  const cluster = getWeldClusterForBody(body);
  for (const b of cluster) {
    b.wakeUp();
    if (vel) b.velocity.set(vel.x, vel.y, vel.z);
    if (angVel) b.angularVelocity.set(angVel.x, angVel.y, angVel.z);
  }
}

function syncWeldConstraintsPositions() {
  if (weldConstraints.length === 0) return;
  // Итерируем 3 раза для мгновенного и стабильного распространения координат по цепочкам любой длины
  for (let iter = 0; iter < 3; iter++) {
    for (const w of weldConstraints) {
      if (!w.parentBody || !w.childBody) continue;
      const pPos = w.parentBody.position;
      const pQuat = w.parentBody.quaternion;
      const worldRelPos = pQuat.vmult(w.relPos);
      w.childBody.position.set(pPos.x + worldRelPos.x, pPos.y + worldRelPos.y, pPos.z + worldRelPos.z);
      const worldRelQuat = pQuat.mult(w.relQuat);
      w.childBody.quaternion.set(worldRelQuat.x, worldRelQuat.y, worldRelQuat.z, worldRelQuat.w);
      w.childBody.velocity.copy(w.parentBody.velocity);
      w.childBody.angularVelocity.copy(w.parentBody.angularVelocity);
    }
  }
}


// ============================================================================
// --- СИСТЕМА TOOL GUN (MINECRAFT-STYLE СЕТКА, ТОЧКИ ПРИВЯЗКИ И СВАРКА) ---
// ============================================================================
const toolGunPreviewMaterial = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.40,
  wireframe: false,
  depthWrite: false
});

// Создаем видимые интерактивные точки на гранях блоков (как в Minecraft / Spore)
const MAX_SNAP_DOTS = 18;
const toolGunSnapDotsGroup = new THREE.Group();
scene.add(toolGunSnapDotsGroup);

const snapDotGeo = new THREE.SphereGeometry(0.065, 12, 12);
const snapDotMatNormal = new THREE.MeshBasicMaterial({ color: 0x00e1ff, transparent: true, opacity: 0.75 });
const snapDotMatActive = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

const snapDotMeshes = [];
for (let i = 0; i < MAX_SNAP_DOTS; i++) {
  const dot = new THREE.Mesh(snapDotGeo, snapDotMatNormal);
  dot.visible = false;
  toolGunSnapDotsGroup.add(dot);
  snapDotMeshes.push(dot);
}

let activeSnapPoint = null; // { pos: Vector3, normal: Vector3, parentObj: object }

function getToolGunGeometry(type) {
  if (type === 'triangle') {
    return createEquilateralPrismGeometry(1.0, 1.0);
  } else if (type === 'ramp') {
    return createRampGeometry(1.0);
  } else if (type === 'sphere') {
    return new THREE.SphereGeometry(0.5, 20, 20);
  } else if (type === 'nuke') {
    return new THREE.CylinderGeometry(0.24, 0.24, 1.1, 14);
  } else if (type === 'secret_cube') {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  return new THREE.BoxGeometry(1, 1, 1);
}

function updateToolGunHologramMesh() {
  if (toolGunHologram) {
    scene.remove(toolGunHologram);
    toolGunHologram.geometry.dispose();
    toolGunHologram = null;
  }
  const geo = getToolGunGeometry(toolGunSelectedItem);
  toolGunHologram = new THREE.Mesh(geo, toolGunPreviewMaterial);
  toolGunHologram.visible = false;
  scene.add(toolGunHologram);
}

// Вычисляет 6 центров граней блока для идеального примагничивания
function getObjectSnapFacePoints(obj) {
  const points = [];
  const p = obj.mesh.position;
  const q = obj.mesh.quaternion;

  // 6 направлений граней куба: +X, -X, +Y, -Y, +Z, -Z
  const faceDirs = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];

  for (const dir of faceDirs) {
    const worldNormal = dir.clone().applyQuaternion(q).normalize();
    // Позиция центра грани (смещение 0.5м)
    const faceCenter = p.clone().addScaledVector(worldNormal, 0.5);
    // Позиция центра нового блока (смещение 1.0м - ровно сетка 1x1x1 вплотную)
    const blockCenter = p.clone().addScaledVector(worldNormal, 1.0);
    points.push({
      dotPos: faceCenter,
      blockPos: blockCenter,
      normal: worldNormal,
      parentObj: obj
    });
  }
  return points;
}

function updateToolGunLoop() {
  const isToolActive = (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1') && controls.isLocked && !isMenuOpen && !isPaused;
  if (!isToolActive) {
    if (toolGunHologram) toolGunHologram.visible = false;
    snapDotMeshes.forEach(d => d.visible = false);
    activeSnapPoint = null;
    return;
  }

  if (!toolGunHologram) {
    updateToolGunHologramMesh();
  }

  raycaster.setFromCamera(centerScreen, camera);
  const eligibleObjects = physicsObjects.filter(obj => !obj.isSphere);
  const meshes = eligibleObjects.map(obj => obj.mesh);
  
  // Также проверяем попадание по базовой плите
  const targets = [...meshes, baseplate];
  const intersects = raycaster.intersectObjects(targets, true);

  if (intersects.length > 0 && intersects[0].distance < 16.0) {
    const hit = intersects[0];
    let hitObj = physicsObjects.find(obj => obj.mesh === hit.object || (obj.mesh && obj.mesh.children.includes(hit.object)));

    if (hitObj && !hitObj.isSphere) {
      // 1. Показываем точки привязки на гранях целевого куба (как в Minecraft)
      const snapPoints = getObjectSnapFacePoints(hitObj);

      let closestSnap = null;
      let minRayDist = Infinity;

      // Находим грань, ближе всего к лучу прицела
      const ray = raycaster.ray;
      snapPoints.forEach((sp, idx) => {
        if (idx < snapDotMeshes.length) {
          const dotMesh = snapDotMeshes[idx];
          dotMesh.position.copy(sp.dotPos);
          dotMesh.visible = true;

          const distToRay = ray.distanceToPoint(sp.dotPos);
          if (distToRay < minRayDist) {
            minRayDist = distToRay;
            closestSnap = sp;
          }
        }
      });

      // Скрываем неиспользуемые точки
      for (let i = snapPoints.length; i < snapDotMeshes.length; i++) {
        snapDotMeshes[i].visible = false;
      }

      // Подсвечиваем активную выбранную точку зеленым
      snapPoints.forEach((sp, idx) => {
        if (idx < snapDotMeshes.length) {
          snapDotMeshes[idx].material = (sp === closestSnap) ? snapDotMatActive : snapDotMatNormal;
        }
      });

      if (closestSnap) {
        activeSnapPoint = closestSnap;

        // Идеальное позиционирование блока в сетку 1х1х1 вплотную
        toolGunHologram.position.copy(closestSnap.blockPos);

        // Вращение: сориентировано по родителю + поворот R/T
        const parentQ = hitObj.mesh.quaternion.clone();
        const rotEuler = new THREE.Euler(toolGunRotX, toolGunRotY, 0, 'YXZ');
        const addQuat = new THREE.Quaternion().setFromEuler(rotEuler);
        toolGunHologram.quaternion.copy(parentQ).multiply(addQuat);

        toolGunHologram.visible = true;
        return;
      }
    } else if (hit.object === baseplate && hit.face) {
      // Спавн прямо на полу по сетке 1x1x1
      snapDotMeshes.forEach(d => d.visible = false);
      const snapX = Math.round(hit.point.x);
      const snapZ = Math.round(hit.point.z);
      const holoPos = new THREE.Vector3(snapX, 0.5, snapZ);
      
      activeSnapPoint = {
        dotPos: hit.point.clone(),
        blockPos: holoPos,
        normal: new THREE.Vector3(0, 1, 0),
        parentObj: null
      };

      toolGunHologram.position.copy(holoPos);
      const rotEuler = new THREE.Euler(toolGunRotX, toolGunRotY, 0, 'YXZ');
      toolGunHologram.quaternion.setFromEuler(rotEuler);
      toolGunHologram.visible = true;
      return;
    }
  }

  if (toolGunHologram) toolGunHologram.visible = false;
  snapDotMeshes.forEach(d => d.visible = false);
  activeSnapPoint = null;
}

function fireToolGun() {
  if (!activeSnapPoint || !toolGunHologram || !toolGunHologram.visible) {
    playCustomOrSynth('empty_click', (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(750, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    });
    return;
  }

  const pos = toolGunHologram.position.clone();
  const quat = toolGunHologram.quaternion.clone();
  const rotObj = { x: quat.x, y: quat.y, z: quat.z, w: quat.w };

  let newObj = null;
  if (toolGunSelectedItem === 'secret_cube') {
    newObj = spawnSecretCubeAt(pos, rotObj);
  } else if (toolGunSelectedItem === 'triangle') {
    newObj = spawnTriangleAt(pos, rotObj);
  } else if (toolGunSelectedItem === 'ramp') {
    newObj = spawnRampAt(pos, rotObj);
  } else if (toolGunSelectedItem === 'sphere') {
    newObj = spawnSphereAt(pos, rotObj);
  } else if (toolGunSelectedItem === 'nuke') {
    newObj = spawnNukePropAt(pos, rotObj);
  } else {
    newObj = spawnCubeAt(pos, rotObj);
  }

  if (newObj) {
    notifySpawnBlock(newObj, toolGunSelectedItem);
    broadcastNetworkPacket({
      type: 'toolgun_fire',
      id: localPeer ? localPeer.id : 'me'
    });

    // Вспышка и анимация выстрела Tool Gun
    if (toolgunMeshGroup) {
      toolgunMeshGroup.position.z += 0.08;
      setTimeout(() => {
        if (toolgunMeshGroup) toolgunMeshGroup.position.z -= 0.08;
      }, 70);
    }

    // Если строим на блоке — свариваем намертво (LockConstraint)
    if (activeSnapPoint.parentObj) {
      const parentBody = activeSnapPoint.parentObj.body;
      const childBody = newObj.body;

      const lock = new CANNON.LockConstraint(childBody, parentBody, {
        maxForce: 1e12,
        collideConnected: false
      });
      for (const eq of lock.equations) {
        if (eq.setSpookParams) {
          eq.setSpookParams(1e12, 1, 1 / 120);
        }
      }
      world.addConstraint(lock);
      wakeWeldCluster(parentBody);
      wakeWeldCluster(childBody);

      const invParentQuat = parentBody.quaternion.clone().inverse();
      const relPos = invParentQuat.vmult(childBody.position.vsub(parentBody.position));
      const relQuat = invParentQuat.mult(childBody.quaternion);

      weldConstraints.push({
        constraint: lock,
        bodyA: childBody,
        bodyB: parentBody,
        objA: newObj,
        objB: activeSnapPoint.parentObj,
        parentBody: parentBody,
        childBody: childBody,
        relPos: relPos,
        relQuat: relQuat
      });

      playWeldSound();
      showFlightHudNotification('Блок приварен (Z - отсоединить)');
    } else {
      playWeldSound();
      showFlightHudNotification('Блок установлен на платформу');
    }
  }
}


function removeToolGunTarget() {
  raycaster.setFromCamera(centerScreen, camera);
  const eligibleObjects = physicsObjects.filter(obj => !obj.isSphere);
  const meshes = eligibleObjects.map(obj => obj.mesh);
  const intersects = raycaster.intersectObjects(meshes, true);

  if (intersects.length === 0 || intersects[0].distance > 16.0) {
    playCustomOrSynth('empty_click', (ctx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    });
    return;
  }

  const hit = intersects[0];
  const targetObj = physicsObjects.find(obj => obj.mesh === hit.object || (obj.mesh && obj.mesh.children.includes(hit.object)));
  if (!targetObj) return;

  // 1. Удаляем все связанные с объектом сварки (weld constraints)
  for (let i = weldConstraints.length - 1; i >= 0; i--) {
    const c = weldConstraints[i];
    if (c.bodyA === targetObj.body || c.bodyB === targetObj.body) {
      world.removeConstraint(c.constraint);
      weldConstraints.splice(i, 1);
    }
  }

  // 2. Если объект удерживался в руках — сбрасываем захват
  if (grabbedBody === targetObj.body) {
    grabbedBody = null;
    crosshairEl.classList.remove('grabbed');
  }

  // 3. Удаляем физическое тело и 3D меш
  const idx = physicsObjects.indexOf(targetObj);
  if (idx !== -1) {
    physicsObjects.splice(idx, 1);
  }
  if (targetObj.body) {
    world.removeBody(targetObj.body);
  }
  if (targetObj.mesh) {
    scene.remove(targetObj.mesh);
  }

  // 4. Отдача тулгана при удалении
  if (toolgunMeshGroup) {
    toolgunMeshGroup.position.z += 0.06;
    setTimeout(() => {
      if (toolgunMeshGroup) toolgunMeshGroup.position.z -= 0.06;
    }, 60);
  }

  // 5. Звук разборки/удаления
    // Сетевая синхронизация удаления
  broadcastNetworkPacket({
    type: 'remove_block',
    netId: targetObj.netId || null,
    pos: { x: targetObj.mesh.position.x, y: targetObj.mesh.position.y, z: targetObj.mesh.position.z }
  });
  playUnweldSound();
  showFlightHudNotification('Блок удален (ПКМ Tool Gun)');
}


function toggleWeldAtCrosshair() {
  raycaster.setFromCamera(centerScreen, camera);
  const meshes = physicsObjects.map(obj => obj.mesh);
  const intersects = raycaster.intersectObjects(meshes);

  if (intersects.length === 0) return;

  const hitMesh = intersects[0].object;
  const targetObj = physicsObjects.find(obj => obj.mesh === hitMesh || obj.mesh.children.includes(hitMesh));
  if (!targetObj) return;

  // 1. Проверяем, закреплен ли уже этот куб. Если да — открепляем все его закрепы (unweld)
  const connectedWelds = weldConstraints.filter(c => c.bodyA === targetObj.body || c.bodyB === targetObj.body);
  if (connectedWelds.length > 0) {
    for (const c of connectedWelds) {
      world.removeConstraint(c.constraint);
      // Восстанавливаем коллизии между связанными телами
      targetObj.body.collisionResponse = true;
      c.bodyA.collisionResponse = true;
      c.bodyB.collisionResponse = true;
      const idx = weldConstraints.indexOf(c);
      if (idx !== -1) weldConstraints.splice(idx, 1);
    }
    playUnweldSound();
    showFlightHudNotification('Куб откреплен (Z)');
    return;
  }

  // 2. Иначе ищем ближайший соседний соприкасающийся куб для жесткого закрепа (дистанция центров <= 1.45м)
  let closestNeighbor = null;
  let minDist = 1.45;

  for (const other of physicsObjects) {
    if (other === targetObj) continue;
    const dist = targetObj.body.position.distanceTo(other.body.position);
    if (dist < minDist) {
      minDist = dist;
      closestNeighbor = other;
    }
  }

  if (closestNeighbor) {
    // Будим оба тела
    targetObj.body.wakeUp();
    closestNeighbor.body.wakeUp();

    // Создаем абсолютно жесткий LockConstraint с максимальной жесткостью
    const lock = new CANNON.LockConstraint(targetObj.body, closestNeighbor.body, {
      maxForce: 1e12,
      collideConnected: false
    });

    for (const eq of lock.equations) {
      if (eq.setSpookParams) {
        eq.setSpookParams(1e12, 1, 1 / 120);
      }
    }

    world.addConstraint(lock);

    // Запоминаем точное относительное положение и вращение для 100% монолитности (как единое целое)
    const invParentQuat = closestNeighbor.body.quaternion.clone().inverse();
    const relPos = invParentQuat.vmult(targetObj.body.position.vsub(closestNeighbor.body.position));
    const relQuat = invParentQuat.mult(targetObj.body.quaternion);

    weldConstraints.push({
      constraint: lock,
      bodyA: targetObj.body,
      bodyB: closestNeighbor.body,
      objA: targetObj,
      objB: closestNeighbor,
      parentBody: closestNeighbor.body,
      childBody: targetObj.body,
      relPos: relPos,
      relQuat: relQuat
    });

    playWeldSound();
    showFlightHudNotification('Кубы скреплены (Z)');
  } else {
    showFlightHudNotification('Рядом нет куба для закрепа (поднесите ближе)');
  }
}

// Звук скрепления и разъединения кубов (Weld Sound)
function playWeldSound() {
  playCustomOrSynth('toolgun_weld', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(650, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.32, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);

    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(920, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.05);
        gain2.gain.setValueAtTime(0.24, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.05);
      } catch (e) {}
    }, 45);
  });
}

function playUnweldSound() {
  playCustomOrSynth('toolgun_remove', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  });
}

// Активные плавные анимации выравнивания (для объектов в мире и в руках)
const aligningObjects = new Map();

// ============================================================================
// --- СИСТЕМА МЕНЮ ПОВОРОТА ОБЪЕКТА (УДЕРЖАНИЕ R) ---
// ============================================================================
let rotateKeyHoldTimer = null;
let isRPressed = false;
let isRotateKeyHeld = false;

function getTargetObjectForRotation() {
  if (grabbedBody) {
    return physicsObjects.find(o => o.body === grabbedBody) || null;
  }
  raycaster.setFromCamera(centerScreen, camera);
  const meshes = physicsObjects.map(obj => obj.mesh);
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    return physicsObjects.find(obj => obj.mesh === hitMesh || (obj.mesh && obj.mesh.children.includes(hitMesh))) || null;
  }
  return null;
}

function openRotateMenu(targetObj) {
  if (!targetObj || isRotateMenuOpen || isInMainMenu || isPaused) return;
  rotateTargetObj = targetObj;
  isRotateMenuOpen = true;

  if (controls && controls.isLocked) {
    try {
      controls.unlock();
    } catch (_) {}
  }
  controls.enabled = false;

  if (rotateMenuEl) {
    rotateMenuEl.classList.remove('hidden');
  }
  if (customCursorEl) {
    customCursorEl.classList.remove('hidden');
    mouseScreenX = window.innerWidth / 2;
    mouseScreenY = window.innerHeight / 2;
    customCursorEl.style.transform = `translate3d(${mouseScreenX}px, ${mouseScreenY}px, 0)`;
  }
  crosshairEl.style.display = 'none';
}

function closeRotateMenu() {
  if (!isRotateMenuOpen) return;
  isRotateMenuOpen = false;
  if (rotateMenuEl) {
    rotateMenuEl.classList.add('hidden');
  }
  if (customCursorEl) {
    customCursorEl.classList.add('hidden');
  }
  crosshairEl.style.display = '';
  controls.enabled = !isPaused && !isMenuOpen;

  if (!isPaused && !isMenuOpen) {
    requestPointerLockSafely();
  }
}

// Применение поворота к целевому объекту
function applyObjectRotationPreset(actionType, extraDeg = 0) {
  if (!rotateTargetObj || !rotateTargetObj.mesh) return;

  // Направление взгляда игрока (плоское по XZ)
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  camDir.normalize();

  // Вектор вправо от взгляда игрока
  const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

  // Базовый угол взгляда в радианах вокруг Y
  const playerYaw = Math.atan2(camDir.x, camDir.z); // угол в XZ

  const newQuat = new THREE.Quaternion();

  switch (actionType) {
    case 'look-away': {
      // Смотрит прямо от игрока
      const euler = new THREE.Euler(0, playerYaw, 0, 'YXZ');
      newQuat.setFromEuler(euler);
      break;
    }
    case 'look-right': {
      // Ровно на 90 градусов вправо от игрока
      const euler = new THREE.Euler(0, playerYaw - Math.PI / 2, 0, 'YXZ');
      newQuat.setFromEuler(euler);
      break;
    }
    case 'look-towards': {
      // Смотрит прямо на игрока
      const euler = new THREE.Euler(0, playerYaw + Math.PI, 0, 'YXZ');
      newQuat.setFromEuler(euler);
      break;
    }
    case 'look-left': {
      // Ровно на 90 градусов влево от игрока
      const euler = new THREE.Euler(0, playerYaw + Math.PI / 2, 0, 'YXZ');
      newQuat.setFromEuler(euler);
      break;
    }
    case 'pitch-up': {
      // Вертикально основанием вниз
      newQuat.setFromEuler(new THREE.Euler(0, playerYaw, 0, 'YXZ'));
      break;
    }
    case 'pitch-down': {
      // Вверх ногами (180 по Z или X)
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), playerYaw);
      const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      newQuat.multiplyQuaternions(qYaw, qFlip);
      break;
    }
    case 'snap-grid': {
      // Выравнивание по мировой сетке 90°
      const currentEuler = new THREE.Euler().setFromQuaternion(rotateTargetObj.mesh.quaternion, 'YXZ');
      const snapAngle = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      newQuat.setFromEuler(new THREE.Euler(snapAngle(currentEuler.x), snapAngle(currentEuler.y), snapAngle(currentEuler.z), 'YXZ'));
      break;
    }
    case 'reset': {
      newQuat.set(0, 0, 0, 1);
      break;
    }
    case 'step-yaw': {
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (extraDeg * Math.PI) / 180);
      newQuat.multiplyQuaternions(deltaQ, rotateTargetObj.mesh.quaternion);
      break;
    }
    case 'step-pitch': {
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(camRight, (extraDeg * Math.PI) / 180);
      newQuat.multiplyQuaternions(deltaQ, rotateTargetObj.mesh.quaternion);
      break;
    }
    case 'step-roll': {
      const deltaQ = new THREE.Quaternion().setFromAxisAngle(camDir, (extraDeg * Math.PI) / 180);
      newQuat.multiplyQuaternions(deltaQ, rotateTargetObj.mesh.quaternion);
      break;
    }
  }

  // Применяем плавно через alignObjectToGrid / slerp
  if (rotateTargetObj.body) {
    rotateTargetObj.body.angularVelocity.set(0, 0, 0);
    rotateTargetObj.body.wakeUp();
  }

  aligningObjects.set(rotateTargetObj, {
    startQuat: rotateTargetObj.mesh.quaternion.clone(),
    targetQuat: newQuat.clone(),
    progress: 0,
    duration: 0.22,
    onComplete: (q) => {
      if (grabbedBody && rotateTargetObj.body === grabbedBody) {
        fixedGrabQuat.copy(q);
        isGrabRotationLocked = true;
      }
    }
  });

  if (grabbedBody && rotateTargetObj.body === grabbedBody) {
    fixedGrabQuat.copy(newQuat);
    isGrabRotationLocked = true;
  }

  showFlightHudNotification('Поворот применен!');
}

// Слушатели кнопок внутри меню поворота
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const rotateBtn = e.target.closest('.rotate-btn');
    if (rotateBtn) {
      const action = rotateBtn.dataset.action;
      applyObjectRotationPreset(action);
      return;
    }

    const stepBtn = e.target.closest('.rotate-step-btn');
    if (stepBtn) {
      const stepType = stepBtn.dataset.step;
      const deg = parseFloat(stepBtn.dataset.deg) || 45;
      applyObjectRotationPreset(`step-${stepType}`, deg);
      return;
    }
  });
}


// --- Функция плавного выравнивания предмета на R ---
function alignObjectToGrid(target, onComplete = null) {
  if (!target) return;

  // Рассчитываем идеальные прямые углы сетки (шаг 90 градусов)
  const currentEuler = new THREE.Euler().setFromQuaternion(target.mesh.quaternion, 'YXZ');
  const snapAngle = (angle) => Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);

  const targetEuler = new THREE.Euler(
    snapAngle(currentEuler.x),
    snapAngle(currentEuler.y),
    snapAngle(currentEuler.z),
    'YXZ'
  );

  const startQuat = target.mesh.quaternion.clone();
  const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);

  // Сбрасываем инерцию вращения, чтобы физика Cannon не сопротивлялась плавному переходу
  target.body.angularVelocity.set(0, 0, 0);
  target.body.wakeUp();

  // Добавляем в список плавно выравнивающихся объектов
  aligningObjects.set(target, {
    startQuat,
    targetQuat,
    progress: 0,
    duration: 0.28, // 280 миллисекунд приятной и плавной интерполяции
    onComplete
  });
}

// --- Звуковые процедурные эффекты через Web Audio API ---
let audioCtx = null;
let masterGainNode = null;
let sfxGainNode = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGainNode = audioCtx.createGain();
      sfxGainNode = audioCtx.createGain();

      masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
      sfxGainNode.gain.setValueAtTime(sfxVolume, audioCtx.currentTime);

      sfxGainNode.connect(masterGainNode);
      masterGainNode.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getAudioDestination() {
  getAudioContext();
  return sfxGainNode || audioCtx.destination;
}

function playRitualHumSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 2.5);
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 1.8);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 2.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 2.5);
  } catch (e) { }
}

function playLaunchSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 1.8);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 1.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.8);
  } catch (e) { }
}

function playKaboomSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 1.4);
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.4);
  } catch (e) { }
}

function playImpactSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) { }
}

// --- Система звуков оружия и инвентаря Garry's Mod ---
// Поддерживает кастомные WAV файлы из папки public/sounds/,
// а также мгновенный процедурный аудиосинтез через Web Audio API (если файл ещё не загружен)
const audioFiles = {};
function playCustomOrSynth(soundName, synthFallback) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (!audioFiles[soundName]) {
      const audio = new Audio(`./sounds/${soundName}.wav`);
      audio.preload = 'auto';
      audioFiles[soundName] = audio;
    }

    const audio = audioFiles[soundName];
    audio.volume = Math.max(0, Math.min(1, masterVolume * sfxVolume));
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Если WAV файл еще не добавлен в папку — звучит процедурный синтез
        synthFallback(ctx);
      });
    }
  } catch (e) {
    try {
      const ctx = getAudioContext();
      if (ctx) synthFallback(ctx);
    } catch (_) {}
  }
}

// --- Пространственный 3D-звук с эффектом реверберации/эхо для падения секретного кубика ---
let secretCubeFallAudioBuffer = null;
fetch('./sounds/secret_cube_fall.wav')
  .then(res => res.arrayBuffer())
  .then(arrayBuf => {
    const ctx = getAudioContext();
    if (ctx) {
      ctx.decodeAudioData(arrayBuf, (decoded) => {
        secretCubeFallAudioBuffer = decoded;
      });
    }
  })
  .catch(() => {});

// Создаем искусственный импульсный отклик для мягкого уличного эхо/реверберации
function createSubtleReverbNode(ctx) {
  const convolver = ctx.createConvolver();
  const rate = ctx.sampleRate;
  const length = rate * 1.4; // 1.4 секунды мягкого затухания
  const impulse = ctx.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const decay = Math.exp(-t * 4.2);
    // Добавляем дискретные мягкие переотражения (эхо)
    const echo1 = i === Math.floor(rate * 0.12) ? 0.35 : 0;
    const echo2 = i === Math.floor(rate * 0.24) ? 0.2 : 0;
    left[i] = ((Math.random() * 2 - 1) * decay * 0.25 + echo1) * 0.8;
    right[i] = ((Math.random() * 2 - 1) * decay * 0.25 + echo2) * 0.8;
  }
  convolver.buffer = impulse;
  return convolver;
}

function playSpatialSecretCubeFall(sourcePos) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Вычисляем положение источника звука относительно взгляда игрока (Stereo Panning)
    // forward / right векторы камеры
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();

    // Вектор от камеры к источнику звука
    const toSource = new THREE.Vector3().subVectors(sourcePos, camera.position);
    const distance = Math.max(1.0, toSource.length());
    toSource.normalize();

    // Панорама: скалярное произведение с camRight дает от -1 (строго слева) до +1 (строго справа)
    const pan = Math.max(-1.0, Math.min(1.0, toSource.dot(camRight)));

    // Затухание громкости от расстояния
    const distanceGainValue = Math.max(0.15, Math.min(1.0, 30.0 / (distance + 15.0)));

    if (secretCubeFallAudioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = secretCubeFallAudioBuffer;

      // Stereo Panner для четкого позиционирования в левом/правом ухе
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.setValueAtTime(pan, ctx.currentTime);
      }

      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(distanceGainValue * 0.9, ctx.currentTime);

      // Легкое эхо (Reverb send)
      const reverb = createSubtleReverbNode(ctx);
      const reverbGain = ctx.createGain();
      reverbGain.gain.setValueAtTime(0.35, ctx.currentTime);

      if (panner) {
        source.connect(panner);
        panner.connect(mainGain);
      } else {
        source.connect(mainGain);
      }

      mainGain.connect(ctx.destination);

      // Посыл на эхо/реверберацию
      mainGain.connect(reverb);
      reverb.connect(reverbGain);
      reverbGain.connect(ctx.destination);

      source.start();
    } else {
      // Фолбэк на Audio элемент с балансом
      const audio = new Audio('./sounds/secret_cube_fall.wav');
      audio.volume = distanceGainValue;
      audio.play().catch(() => {});
    }
  } catch (err) {
    console.warn('Ошибка воспроизведения пространственного звука падения:', err);
  }
}

// 1. Звук переключения слотов предметов (щелчок/тик селектора GMod)
function playSlotSwitchSound() {
  playCustomOrSynth('weapon_switch', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  });
}

// 2. Звук подтверждения выбора / доставания оружия (GMod draw/deploy sound)
function playWeaponDeploySound() {
  playCustomOrSynth('weapon_deploy', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  });
}

// 3. Звук захвата/взятия предмета физикой (GMod Physgun / Hands grab)
function playGrabSound() {
  playCustomOrSynth('grab_object', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  });
}

// 4. Звук выстрела из пистолета (бас, затвор и пороховой хлопок)
function playPistolShootSound() {
  playCustomOrSynth('pistol_shoot', (ctx) => {
    // Шумовой всплеск порохового пороха
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(3200, ctx.currentTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.65, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.12);

    // Ударный басовый панч выстрела
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  });
}

// 5. Звук перезарядки (лязг затвора и смена обоймы)
function playReloadSound() {
  playCustomOrSynth('pistol_reload', (ctx) => {
    // 1 этап: извлечение магазина
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
    osc1.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.25);
    gain1.gain.setValueAtTime(0.3, ctx.currentTime + 0.1);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime + 0.1);
    osc1.stop(ctx.currentTime + 0.3);

    // 2 этап: вставка магазина (щелчок)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(350, ctx.currentTime + 0.65);
    osc2.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.75);
    gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.65);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.65);
    osc2.stop(ctx.currentTime + 0.8);

    // 3 этап: спуск затвора
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(700, ctx.currentTime + 1.05);
    osc3.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 1.2);
    gain3.gain.setValueAtTime(0.4, ctx.currentTime + 1.05);
    gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.25);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(ctx.currentTime + 1.05);
    osc3.stop(ctx.currentTime + 1.25);
  });
}

// 6. Холостой щелчок (осечка)
function playEmptyClickSound() {
  playCustomOrSynth('empty_click', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(0.2 * masterVolume * sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  });
}

// 6.1 Звук клика по кнопкам UI (поддерживает кастомный button_click.wav из public/sounds/)
function playButtonClickSound() {
  playCustomOrSynth('button_click', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.18 * masterVolume * sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  });
}

// Глобальный обработчик клика по любым кнопкам в интерфейсе
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .menu-btn, .spawn-btn, .rotate-btn, .rotate-step-btn');
    if (btn) {
      playButtonClickSound();
    }
  }, true);
}

// 7. Звук спавна предмета из меню (spawn.mp3 / spawn.wav)
function playSpawnSound() {
  playCustomOrSynth('spawn', (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  });
}

// 8. Физический звук удара блока об пол/блок (глухой удар малюсенького камешка без пищания)
// Поддерживает кастомные WAV из public/sounds/: block_hit.wav, block_drop.wav
let lastPhysicsSoundTime = 0;
function playPhysicsCollisionSound(impactSpeed, worldPos, isSphere = false) {
  const now = performance.now();
  if (now - lastPhysicsSoundTime < 32) return;
  lastPhysicsSoundTime = now;

  try {
    const toSource = new THREE.Vector3().subVectors(worldPos, camera.position);
    const dist = toSource.length();

    // Реалистичная дистанция слышимости: дальше 32 метров звук полностью затихает в 0
    const maxAudibleDist = 32.0;
    if (dist >= maxAudibleDist) return;

    // Квадратичное затухание громкости с расстоянием
    const distFactor = Math.max(0, 1.0 - (dist / maxAudibleDist));
    const distAtten = distFactor * distFactor;

    // Проверяем наличие кастомного звука block_hit.wav в public/sounds/
    if (audioFiles['block_hit']) {
      playCustomOrSynth('block_hit', () => {});
      return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const normSpeed = Math.min(1.0, impactSpeed / 8.0);
    const volume = Math.max(0.02, Math.min(0.20, 0.03 + normSpeed * 0.15)) * (masterVolume * sfxVolume);
    const finalGainVal = volume * distAtten;
    if (finalGainVal <= 0.001) return;

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0)).normalize();
    toSource.normalize();
    const pan = Math.max(-0.95, Math.min(0.95, toSource.dot(camRight)));

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(finalGainVal, ctx.currentTime);

    // Низкочастотный фильтр: срезаем высокие частоты, делаем звук глухим как маленький камушек
    const cutoffFreq = Math.max(160, 480 - dist * 9);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(cutoffFreq, ctx.currentTime);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      mainGain.connect(lowpass);
      lowpass.connect(panner);
      panner.connect(ctx.destination);
    } else {
      mainGain.connect(lowpass);
      lowpass.connect(ctx.destination);
    }

    // Глухой удар (мягкий саб-импульс 95Hz -> 36Hz)
    const oscBody = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    const bodyFreq = 95 + Math.random() * 25;
    oscBody.type = 'sine';
    oscBody.frequency.setValueAtTime(bodyFreq, ctx.currentTime);
    oscBody.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 0.024);

    bodyGain.gain.setValueAtTime(0.55, ctx.currentTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.026);

    oscBody.connect(bodyGain);
    bodyGain.connect(mainGain);
    oscBody.start(ctx.currentTime);
    oscBody.stop(ctx.currentTime + 0.028);

    // Легкий глухой щелчок камешка (без высокого пищания, 180Hz -> 60Hz)
    const oscPebble = ctx.createOscillator();
    const pebbleGain = ctx.createGain();
    oscPebble.type = 'triangle';
    oscPebble.frequency.setValueAtTime(180 + (Math.random() - 0.5) * 30, ctx.currentTime);
    oscPebble.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.016);

    pebbleGain.gain.setValueAtTime(0.25, ctx.currentTime);
    pebbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.018);

    oscPebble.connect(pebbleGain);
    pebbleGain.connect(mainGain);
    oscPebble.start(ctx.currentTime);
    oscPebble.stop(ctx.currentTime + 0.02);
  } catch (err) {}
}

// Привязка обработчика столкновений для тел CANNON.js
function setupBodyCollisionAudio(body, isSphere = false) {
  let lastBodyHitTime = 0;
  body.addEventListener('collide', (event) => {
    const now = performance.now();
    if (now - lastBodyHitTime < 35) return;

    const contact = event.contact;
    if (!contact) return;

    // Относительная скорость удара в точке соприкосновения
    const impactSpeed = Math.abs(contact.getImpactVelocityAlongNormal());
    if (impactSpeed < 0.28) return; // Игнорируем микроколебания в состоянии покоя

    lastBodyHitTime = now;
    const hitPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    playPhysicsCollisionSound(impactSpeed, hitPos, isSphere);
  });
}

// --- Система Пасхалки: Выкидывание созданного шара рукой за пределы карты ---
// Если заспавнить шар и ВЫКИНУТЬ ЕГО РУКОЙ ЗА КАРТУ:
// в центре карты (0, 0, 0) начинается ивент: небо багровеет/краснеет, гремит гул,
// затем небо успокаивается и возвращается в норму, а в центре карты с небес падает секретный куб!
let activeRitual = null;
let ritualDetectionTimer = 0;

function playOminousRumbleSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Мягкий глубокий кинематографичный бас (без резких жужжащих sawtooth пил)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(75, ctx.currentTime + 1.5);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 4.5);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 4.6);
  } catch (e) { }
}

function startRedSkyCenterEvent() {
  if (activeRitual) return;

  const centerPos = new THREE.Vector3(0, 0, 0);

  // Световой столб/маяк в центре карты
  const beaconLight = new THREE.PointLight(0xff2222, 0.1, 80);
  beaconLight.position.set(0, 5, 0);
  scene.add(beaconLight);

  // Центральный вихрь частиц красной бездны
  const particleCount = 100;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleVelocities = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 1.0 + Math.random() * 8.0;
    particlePositions[i * 3] = Math.cos(angle) * rad;
    particlePositions[i * 3 + 1] = 0.5 + Math.random() * 25.0;
    particlePositions[i * 3 + 2] = Math.sin(angle) * rad;
    particleVelocities.push({
      angle,
      rad,
      speed: 1.5 + Math.random() * 3.0,
      baseY: particlePositions[i * 3 + 1]
    });
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xff3333,
    size: 0.28,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // Запуск ритуала без резкого жужжания
  activeRitual = {
    phase: 'REDDENING', // REDDENING -> CALMING_AND_DROP -> IMPACT -> DONE
    time: 0,
    centerPos,
    beaconLight,
    particles,
    particlePositions,
    particleVelocities,
    descendingCube: null,
    descendingVy: -18.0
  };
}

function updateEasterEggRitual(delta) {
  if (!activeRitual) return;

  activeRitual.time += delta;
  const r = activeRitual;

  // Вращение частиц в центре карты
  if (r.particles && r.particlePositions) {
    const pos = r.particles.geometry.attributes.position.array;
    for (let i = 0; i < r.particleVelocities.length; i++) {
      const pv = r.particleVelocities[i];
      pv.angle += pv.speed * delta;
      pv.rad = Math.max(0.3, pv.rad - 0.2 * delta);
      pos[i * 3] = Math.cos(pv.angle) * pv.rad;
      pos[i * 3 + 1] = (pv.baseY + r.time * 4.0) % 35.0;
      pos[i * 3 + 2] = Math.sin(pv.angle) * pv.rad;
    }
    r.particles.geometry.attributes.position.needsUpdate = true;
  }

  if (r.phase === 'REDDENING') {
    // 1. Небо наливается зловещим кроваво-красным цветом (длится 2.8 секунды)
    const duration = 2.8;
    const progress = Math.min(r.time / duration, 1.0);
    const easeProg = Math.sin(progress * Math.PI * 0.5);

    skyMat.uniforms.uRedness.value = easeProg * 1.0;
    r.beaconLight.intensity = easeProg * 6.5;
    r.particles.material.opacity = easeProg * 0.85;

    if (r.time >= duration) {
      r.phase = 'CALMING_AND_DROP';
      r.calmStartTime = r.time;

      // Создаем секретный кубик, падающий из зенита неба строго в центр (0, 75, 0)
      const secretMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({
          map: secretCubeTexture,
          roughness: 0.25,
          metalness: 0.1,
          emissive: 0x331100,
          emissiveIntensity: 0.4
        })
      );
      secretMesh.position.set(0, 70, 0);
      scene.add(secretMesh);
      r.descendingCube = secretMesh;
      r.descendingVy = -15.0;
    }
  } else if (r.phase === 'CALMING_AND_DROP') {
    // 2. Небо постепенно успокаивается и возвращается в норму, а в центр падает кубик
    const calmElapsed = r.time - r.calmStartTime;
    const duration = 2.2;
    const calmProgress = Math.min(calmElapsed / duration, 1.0);

    // Плавное возвращение цвета неба в норму
    skyMat.uniforms.uRedness.value = Math.max(0.0, 1.0 - calmProgress);
    r.beaconLight.intensity = Math.max(0.0, 6.5 * (1.0 - calmProgress));
    r.particles.material.opacity = Math.max(0.0, 0.85 * (1.0 - calmProgress));

    // Падение секретного кубика вниз
    if (r.descendingCube) {
      r.descendingVy -= 32.0 * delta;
      r.descendingCube.position.y += r.descendingVy * delta;
      r.descendingCube.rotation.x += 5.0 * delta;
      r.descendingCube.rotation.y += 7.0 * delta;
      r.beaconLight.position.y = Math.max(1.0, r.descendingCube.position.y);

      // Удар о землю: воспроизводим пространственный 3D-звук падения секретного кубика secret_cube_fall.wav с эхо
      if (r.descendingCube.position.y <= 0.6) {
        const impactPosition = new THREE.Vector3(0, 0.6, 0);
        scene.remove(r.descendingCube);
        scene.remove(r.beaconLight);
        scene.remove(r.particles);
        skyMat.uniforms.uRedness.value = 0.0;
        
        // Воспроизводим звук падения с точным позиционированием в пространстве и эхом
        playSpatialSecretCubeFall(impactPosition);

        // Спавним интерактивный секретный кубик в центр карты
        spawnSecretCube(
          new THREE.Vector3(0, 0.7, 0),
          new CANNON.Vec3((Math.random() - 0.5) * 2, 5.0, (Math.random() - 0.5) * 2)
        );

        // Земное световое кольцо удара в центре
        const groundRingGeo = new THREE.RingGeometry(0.3, 1.4, 32);
        const groundRingMat = new THREE.MeshBasicMaterial({
          color: 0xff4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.95
        });
        const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
        groundRing.position.set(0, 0.05, 0);
        groundRing.rotation.x = -Math.PI / 2;
        scene.add(groundRing);

        let gFade = 0;
        const fadeInterval = setInterval(() => {
          gFade += 0.05;
          const sc = 1.0 + gFade * 18.0;
          groundRing.scale.set(sc, sc, sc);
          groundRing.material.opacity = Math.max(0, 0.95 - gFade * 1.3);
          if (gFade >= 0.8) {
            clearInterval(fadeInterval);
            scene.remove(groundRing);
            groundRingGeo.dispose();
          }
        }, 30);

        activeRitual = null;
      }
    }
  }
}

function checkEasterEggFormation(delta) {
  if (activeRitual) return;

  ritualDetectionTimer += delta;
  if (ritualDetectionTimer < 0.15) return;
  ritualDetectionTimer = 0;

  // Проверяем: заспавнили шар и ВЫКИНУЛИ ЕГО РУКОЙ ЗА КАРТУ
  for (let i = physicsObjects.length - 1; i >= 0; i--) {
    const obj = physicsObjects[i];
    if (obj.isSphere && obj.wasHeldByPlayer && obj.body !== grabbedBody) {
      const pos = obj.body.position;
      // Предел карты Baseplate (размер 512, радиус 256) либо падение в бездну (y < -12)
      const isOutOfBounds = pos.y < -12.0 || Math.abs(pos.x) > 260.0 || Math.abs(pos.z) > 260.0;
      if (isOutOfBounds) {
        // Удаляем выкинутый за карту шар из физики и сцены
        world.removeBody(obj.body);
        scene.remove(obj.mesh);
        if (obj.geo) obj.geo.dispose();
        physicsObjects.splice(i, 1);

        // Запускаем эпичный ивент с краснеющим небом и падением кубика в центре карты!
        startRedSkyCenterEvent();
        break;
      }
    }
  }
}

// ============================================================================
// --- СИСТЕМА ОРУЖИЯ И ИНВЕНТАРЯ В СТИЛЕ GARRY'S MOD ---
// ============================================================================
// 5 разделов (1..5), в каждом по 2 слота.
// Раздел 1, Слот 1: Пустые руки (Физика захвата)
// Раздел 1, Слот 2: Монтировка (Crowbar)
// Раздел 2, Слот 1: 9mm Пистолет (настоящая .glb модель с глушителем)
// Раздел 2, Слот 2: Револьвер .357
// Раздел 3: SMG / Shotgun
// Раздел 4: Grenade / RPG
// Раздел 5: Tool Gun / Physgun
const WEAPON_REGISTRY = {
  '1-1': { id: 'hands', name: 'Руки (Физика)', category: 1, sub: 1, hasAmmo: false },
  '1-2': { id: 'toolgun', name: 'Tool Gun', category: 1, sub: 2, hasAmmo: false, locked: false },
  '2-1': { id: 'pistol', name: 'Glock-19', category: 2, sub: 1, hasAmmo: true, maxClip: 18, damage: 25 },
  '2-2': { id: 'revolver', name: 'Револьвер .357', category: 2, sub: 2, hasAmmo: true, locked: true },
  '3-1': { id: 'smg', name: 'SMG', category: 3, sub: 1, hasAmmo: true, locked: true },
  '3-2': { id: 'shotgun', name: 'Shotgun', category: 3, sub: 2, hasAmmo: true, locked: true },
  '4-1': { id: 'grenade', name: 'Гранаты', category: 4, sub: 1, hasAmmo: true, locked: true },
  '4-2': { id: 'rpg', name: 'РПГ', category: 4, sub: 2, hasAmmo: true, locked: true },
  '5-1': { id: 'toolgun', name: 'Tool Gun', category: 5, sub: 1, hasAmmo: false, locked: false },
  '5-2': { id: 'physgun', name: 'Физган', category: 5, sub: 2, hasAmmo: false, locked: true },
};

let currentEquippedSlot = '1-1'; // по умолчанию пустые руки / физика
let selectedSlot = '1-1';
let isWeaponHudVisible = false;
let weaponHudHideTimeout = null;

const weaponHudEl = document.getElementById('weapon-hud');
const ammoHudEl = document.getElementById('ammo-hud');
const ammoCurrentEl = document.getElementById('ammo-current');
const ammoReserveEl = document.getElementById('ammo-reserve');

// Состояние патронов для 9mm пистолета
const pistolAmmo = {
  current: 18,
  maxClip: 18,
  reserve: 54,
  isReloading: false,
  reloadTimer: 0,
  lastShotTime: 0,
  fireRate: 0.16 // макс ~6 выстрелов в секунду
};

function updateAmmoHud() {
  const wep = WEAPON_REGISTRY[currentEquippedSlot];
  if (wep && wep.hasAmmo) {
    ammoHudEl.classList.remove('hidden');
    ammoCurrentEl.textContent = pistolAmmo.current;
    ammoReserveEl.textContent = pistolAmmo.reserve;
  } else {
    ammoHudEl.classList.add('hidden');
  }
}

// Список всех доступных слотов оружия по порядку
const ALL_WEAPON_SLOTS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2', '5-1', '5-2'];

function updateWeaponHudHighlight() {
  document.querySelectorAll('.gmod-item').forEach(el => {
    const slotId = el.getAttribute('data-slot');
    el.classList.toggle('active', slotId === selectedSlot);
    el.classList.toggle('equipped', slotId === currentEquippedSlot);
  });
}

// Отображение и выбор слотов через селектор в стиле Garry's Mod / Half-Life 2
function showWeaponSelector(category) {
  if (isMenuOpen || isPaused) return;

  clearTimeout(weaponHudHideTimeout);
  isWeaponHudVisible = true;
  weaponHudEl.classList.remove('hidden');

  // Если нажата клавиша того же раздела — циклим по слотам внутри раздела (1-1 -> 1-2 -> 1-1)
  const currentCat = parseInt(selectedSlot.split('-')[0]);
  const currentSub = parseInt(selectedSlot.split('-')[1]);

  let nextSub = 1;
  if (currentCat === category) {
    nextSub = currentSub === 1 ? 2 : 1;
  }
  selectedSlot = `${category}-${nextSub}`;

  updateWeaponHudHighlight();
  playSlotSwitchSound();

  // Меню отображается до подтверждения (ЛКМ) или таймаута
  weaponHudHideTimeout = setTimeout(() => {
    isWeaponHudVisible = false;
    weaponHudEl.classList.add('hidden');
  }, 1600);
}

function selectWeaponSlotByStep(step) {
  if (isMenuOpen || isPaused) return;

  clearTimeout(weaponHudHideTimeout);
  isWeaponHudVisible = true;
  weaponHudEl.classList.remove('hidden');

  let curIdx = ALL_WEAPON_SLOTS.indexOf(selectedSlot);
  if (curIdx === -1) curIdx = 0;
  curIdx = (curIdx + step + ALL_WEAPON_SLOTS.length) % ALL_WEAPON_SLOTS.length;
  selectedSlot = ALL_WEAPON_SLOTS[curIdx];

  updateWeaponHudHighlight();
  playSlotSwitchSound();

  weaponHudHideTimeout = setTimeout(() => {
    isWeaponHudVisible = false;
    weaponHudEl.classList.add('hidden');
  }, 1600);
}

function confirmWeaponSelection() {
  if (!isWeaponHudVisible) return;
  isWeaponHudVisible = false;
  weaponHudEl.classList.add('hidden');

  const targetWep = WEAPON_REGISTRY[selectedSlot];
  if (targetWep && targetWep.locked) {
    showFlightHudNotification(`${targetWep.name}: Скоро будет доступно!`);
    return;
  }

  if (currentEquippedSlot !== selectedSlot) {
    equipWeapon(selectedSlot);
  }
}

let deployCooldown = 0;

function equipWeapon(slotId) {
  const targetWep = WEAPON_REGISTRY[slotId];
  if (!targetWep || targetWep.locked) return;

  // Если держали куб рукой — отпускаем перед доставанием пистолета
  if (grabbedBody) {
    releaseGrabbedBody(false);
  }

  currentEquippedSlot = slotId;
  selectedSlot = slotId;

  const isToolGun = (slotId === '1-2' || slotId === '5-1');
  const isPistol = (slotId === '2-1');

  if (viewmodelRoot) {
    viewmodelRoot.visible = (!isInMainMenu && (isPistol || isToolGun));
  }
  if (pistolMeshGroup) {
    pistolMeshGroup.visible = (!isInMainMenu && isPistol);
  }
  if (toolgunMeshGroup) {
    toolgunMeshGroup.visible = (!isInMainMenu && isToolGun);
  }

  // Воспроизводим звук доставания специально для 9mm пистолета (Слот 2-1)
  if (slotId === '2-1') {
    playWeaponDeploySound();
  }

  // Сетевая синхронизация смены оружия для других игроков
  broadcastNetworkPacket({
    type: 'weapon_switch',
    id: localPeer ? localPeer.id : 'me',
    slot: slotId
  });

  // Запуск анимации доставания (Draw / Deploy animation)
  deployProgress = 0;
  isDeploying = true;
  deployCooldown = 0.45; // 450 мс задержка перед первым выстрелом (исключает случайный выстрел при доставании)
  pistolAmmo.isReloading = false;
  isAiming = false;

  if (isToolGun) {
    updateToolGunHologramMesh();
  }
  updateSpawnMenuModeUI();

  updateAmmoHud();
}

// ============================================================================
// --- 3D VIEWMODEL 9MM ПИСТОЛЕТА С ГЛУШИТЕЛЕМ ---
// ============================================================================
const viewmodelRoot = new THREE.Group();
viewmodelRoot.visible = false;
camera.add(viewmodelRoot);
scene.add(camera);

// Базовые координаты пистолета от бедра (Hip-fire position)
// Пистолет аккуратно расположен справа внизу, чуть меньше и естественнее в руке
const PISTOL_HIP_POS = new THREE.Vector3(0.24, -0.22, -0.42);
const PISTOL_HIP_ROT = new THREE.Euler(0.01, -0.02, 0.0);

// Координаты пистолета при прицеливании (ADS - Aim Down Sights)
// Смещен комфортно от лица, исключая застревание в камере
const PISTOL_AIM_POS = new THREE.Vector3(0.0, -0.17, -0.38);
const PISTOL_AIM_ROT = new THREE.Euler(0.0, 0.0, 0.0);

// Точка ухода оружия вниз при анимации доставания
const PISTOL_DRAW_OFFSET_Y = -0.75;

let pistolMeshGroup = null;
let toolgunMeshGroup = null;
let toolGunSelectedItem = 'cube';
let toolGunRotX = 0;
let toolGunRotY = 0;
let toolGunHologram = null;
let toolGunFaceNormal = new THREE.Vector3(0, 1, 0);
let toolGunHitPoint = new THREE.Vector3();
let toolGunHitObject = null;
let isToolGunActive = false;

let slideMesh = null;
let initialSlidePos = new THREE.Vector3();
let slideBlowback = 0;
let isDeploying = false;
let deployProgress = 1.0;
let isAiming = false;
let currentAdsBlend = 0; // 0 = от бедра, 1 = в прицеле

// Динамика отдачи, покачивания и дыхания (Recoil & Sway)
const recoilOffset = new THREE.Vector3();
const recoilRotation = new THREE.Vector3();
let recoilVelocityZ = 0;
let recoilRotX = 0;

let swayX = 0;
let swayY = 0;
let walkBobTimer = 0;

// Пул физических гильз и дымка от выстрелов
const activeShellCasings = [];
const casingGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.024, 7);
const casingMat = new THREE.MeshStandardMaterial({
  color: 0xd4af37,
  metalness: 0.9,
  roughness: 0.25
});

function spawnShellCasing() {
  if (!pistolMeshGroup) return;

  const casing = new THREE.Mesh(casingGeo, casingMat.clone());
  const spawnWorldPos = new THREE.Vector3(0.08, -0.01, -0.36);
  spawnWorldPos.applyMatrix4(camera.matrixWorld);
  casing.position.copy(spawnWorldPos);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  const vel = new THREE.Vector3()
    .addScaledVector(right, 2.4 + Math.random() * 0.7)
    .addScaledVector(up, 1.8 + Math.random() * 0.5)
    .addScaledVector(forward, -0.3 + (Math.random() - 0.5) * 0.4);

  const rotVel = new THREE.Vector3(
    (Math.random() - 0.5) * 35,
    (Math.random() - 0.5) * 35,
    (Math.random() - 0.5) * 35
  );

  scene.add(casing);
  activeShellCasings.push({
    mesh: casing,
    vel,
    rotVel,
    life: 0,
    maxLife: 3.5,
    bounces: 0
  });
}

// Система следов от пуль (декали на объектах и земле, строго максимум 50 штук)
const activeBulletDecals = [];
const MAX_BULLET_DECALS = 50;

// Текстура следа от пули (обугленное круглое отверстие с трещинками)
function createBulletHoleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Прозрачный фон
  ctx.clearRect(0, 0, 64, 64);

  // Внешний ободок копоти и порохового нагара
  const outerGrad = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
  outerGrad.addColorStop(0, 'rgba(15, 15, 15, 0.95)');
  outerGrad.addColorStop(0.35, 'rgba(35, 30, 25, 0.8)');
  outerGrad.addColorStop(0.7, 'rgba(50, 45, 40, 0.35)');
  outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  // Глубокое отверстие пули в центре
  ctx.fillStyle = '#080808';
  ctx.beginPath();
  ctx.arc(32, 32, 8.5, 0, Math.PI * 2);
  ctx.fill();

  // Неровные микротрещины вокруг отверстия
  ctx.strokeStyle = 'rgba(20, 20, 20, 0.7)';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const len = 14 + Math.random() * 12;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(angle) * 7, 32 + Math.sin(angle) * 7);
    ctx.lineTo(32 + Math.cos(angle) * len, 32 + Math.sin(angle) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

const bulletHoleTexture = createBulletHoleTexture();
const bulletHoleGeo = new THREE.PlaneGeometry(0.12, 0.12);

// Создание следа от пули
function spawnBulletHole(targetMesh, hitPoint, hitNormal) {
  const decalMat = new THREE.MeshBasicMaterial({
    map: bulletHoleTexture,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4
  });

  const decal = new THREE.Mesh(bulletHoleGeo, decalMat);

  // Смещение от поверхности вдоль нормали, чтобы исключить z-fighting
  const decalPos = hitPoint.clone().addScaledVector(hitNormal, 0.0035);

  // Если попали в объект из physicsObjects, прикрепляем декаль прямо к нему, чтобы след двигался вместе с кубом!
  if (targetMesh && targetMesh !== baseplate) {
    targetMesh.updateMatrixWorld(true);
    targetMesh.worldToLocal(decalPos);
    decal.position.copy(decalPos);

    // Ориентируем плоскость декали по локальной нормали
    const localNormal = hitNormal.clone().transformDirection(new THREE.Matrix4().copy(targetMesh.matrixWorld).invert()).normalize();
    const lookTarget = decalPos.clone().add(localNormal);
    decal.lookAt(lookTarget);
    decal.rotateZ(Math.random() * Math.PI * 2); // случайный угол поворота дырки
    targetMesh.add(decal);
  } else {
    // Попадание в baseplate / землю
    decal.position.copy(decalPos);
    const lookTarget = decalPos.clone().add(hitNormal);
    decal.lookAt(lookTarget);
    decal.rotateZ(Math.random() * Math.PI * 2);
    scene.add(decal);
  }

  activeBulletDecals.push({
    mesh: decal,
    parent: decal.parent,
    mat: decalMat,
    createdAt: performance.now()
  });

  // Ограничение: максимум 50 следов во всей игре! При превышении удаляем самые старые
  while (activeBulletDecals.length > MAX_BULLET_DECALS) {
    const oldest = activeBulletDecals.shift();
    if (oldest) {
      if (oldest.parent) {
        oldest.parent.remove(oldest.mesh);
      } else {
        scene.remove(oldest.mesh);
      }
      oldest.mat.dispose();
    }
  }
}

// Система видимых летящих пуль (Трассеры)
const activeBulletTracers = [];
const tracerGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.38, 5);
tracerGeo.rotateX(Math.PI / 2); // выравниваем вдоль оси Z

function getMuzzleWorldPosition() {
  if (pistolMeshGroup && pistolMeshGroup.muzzleFlash) {
    pistolMeshGroup.updateMatrixWorld(true);
    const pos = new THREE.Vector3();
    pistolMeshGroup.muzzleFlash.getWorldPosition(pos);
    return pos;
  }
  // Запасная точка на случай, если модель еще грузится
  return new THREE.Vector3(0.18, -0.16, -0.45).applyMatrix4(camera.matrixWorld);
}

function spawnBulletTracer(startPos, endPos) {
  const tracerMat = new THREE.MeshBasicMaterial({
    color: 0xffea77,
    transparent: true,
    opacity: 0.95
  });

  const tracer = new THREE.Mesh(tracerGeo, tracerMat);
  tracer.position.copy(startPos);
  tracer.lookAt(endPos);
  scene.add(tracer);

  const direction = new THREE.Vector3().subVectors(endPos, startPos);
  const totalDist = direction.length();
  const dirNorm = direction.clone().normalize();

  activeBulletTracers.push({
    mesh: tracer,
    mat: tracerMat,
    dir: dirNorm,
    speed: 135.0, // Высокая, реалистичная скорость трассера (~135 м/с)
    traveled: 0,
    maxDist: totalDist
  });
}

function updateBulletTracers(delta) {
  for (let i = activeBulletTracers.length - 1; i >= 0; i--) {
    const bt = activeBulletTracers[i];
    const step = bt.speed * delta;
    bt.mesh.position.addScaledVector(bt.dir, step);
    bt.traveled += step;

    if (bt.traveled >= bt.maxDist) {
      scene.remove(bt.mesh);
      bt.mat.dispose();
      activeBulletTracers.splice(i, 1);
    }
  }
}

const activeSmokePuffs = [];
const smokeGeo = new THREE.SphereGeometry(0.018, 6, 6);

function spawnMuzzleSmoke() {
  if (!pistolMeshGroup) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  // Позиция дымка строго у дульного среза пистолета в мировом пространстве
  const muzzlePos = getMuzzleWorldPosition();

  for (let i = 0; i < 3; i++) {
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xd0d0d0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const puff = new THREE.Mesh(smokeGeo, smokeMat);
    puff.position.copy(muzzlePos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02,
      (Math.random() - 0.5) * 0.02
    ));

    const vel = forward.clone().multiplyScalar(0.7 + Math.random() * 0.4).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.12,
      0.35 + Math.random() * 0.25,
      (Math.random() - 0.5) * 0.12
    ));

    scene.add(puff);
    activeSmokePuffs.push({
      mesh: puff,
      vel,
      life: 0,
      maxLife: 0.45 + Math.random() * 0.15
    });
  }
}

// Загрузка официальной модели 9mm_pistol.glb
const gltfLoader = new GLTFLoader();
gltfLoader.load(
  './9mm_pistol.glb',
  (gltf) => {
    pistolMeshGroup = gltf.scene;

    // Центрируем геометрию модели
    const box = new THREE.Box3().setFromObject(pistolMeshGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Масштаб: уменьшаем до аккуратного, компактного размера (0.36 вместо 0.48)
    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = 0.36 / (maxDim || 1.0);
    pistolMeshGroup.scale.setScalar(scaleFactor);

    // Доворачиваем модель на -90 градусов по оси Y для взгляда вперед (-Z)
    pistolMeshGroup.rotation.y = -Math.PI / 2;

    pistolMeshGroup.position.set(
      -center.z * scaleFactor,
      -center.y * scaleFactor,
      center.x * scaleFactor
    );

    // Настраиваем материалы и находим подвижный затвор (slide)
    pistolMeshGroup.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.metalness = Math.min(1.0, (child.material.metalness || 0.6) + 0.15);
          child.material.roughness = Math.max(0.18, child.material.roughness || 0.35);
        }
        if (child.name.includes('9m1') || child.name.includes('Slide')) {
          slideMesh = child;
          initialSlidePos.copy(child.position);
        }
      }
    });

    // Обертка для позиционирования и динамики отдачи
    const pistolWrapper = new THREE.Group();
    pistolWrapper.add(pistolMeshGroup);
    viewmodelRoot.add(pistolWrapper);
    pistolMeshGroup = pistolWrapper;

    // Вспышка выстрела (Muzzle flash light) строго у среза ствола спереди
    const flashLight = new THREE.PointLight(0xffaa33, 0, 4.0);
    flashLight.position.set(0, 0.05, -0.42);
    pistolWrapper.add(flashLight);
    pistolWrapper.muzzleFlash = flashLight;

    if (isInMainMenu) {
      viewmodelRoot.visible = false;
    }

    console.log('9mm_pistol.glb успешно загружен в руки игрока с правильной ориентацией!');
  },
  undefined,
  (err) => {
    console.error('Ошибка загрузки 9mm_pistol.glb:', err);
  }
);
// Загрузка 3D модели Tool Gun (public/tool_gun.glb)
// Загрузка 3D модели Tool Gun (public/tool_gun.glb) с исправлением освещения и материалов
gltfLoader.load(
  './tool_gun.glb',
  (gltf) => {
    const rawScene = gltf.scene;

    // Удаляем встроенные источники света и камеры из GLB, которые ослепляли модель белым цветом
    const toRemove = [];
    rawScene.traverse((child) => {
      if (child.isLight || child.isCamera || child.name === 'Area' || child.name === 'Camera') {
        toRemove.push(child);
      }
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Исправляем белые пересвеченные материалы
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m) {
            // Если материал чисто белый (из блендера по умолчанию) — даем ему благородный темный металл/пластик
            if (m.color && (m.color.r > 0.5 && m.color.g > 0.5 && m.color.b > 0.5)) {
              m.color.setRGB(0.18, 0.20, 0.24); // темный оружейный графит
            }
            if (m.emissive) {
              m.emissive.setRGB(0, 0, 0); // гасим белое самосвечение
            }
            m.roughness = 0.45;
            m.metalness = 0.25;
            m.needsUpdate = true;
          }
        });
      }
    });

    toRemove.forEach((item) => {
      if (item.parent) item.parent.remove(item);
    });

    const box = new THREE.Box3().setFromObject(rawScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scaleFactor = 0.35 / (maxDim || 1.0);
    rawScene.scale.setScalar(scaleFactor);

    // Центрируем внутри контейнера
    rawScene.position.set(
      -center.x * scaleFactor,
      -center.y * scaleFactor,
      -center.z * scaleFactor
    );

    const wrapper = new THREE.Group();
    wrapper.add(rawScene);
    wrapper.visible = false;
    viewmodelRoot.add(wrapper);
    toolgunMeshGroup = wrapper;

    console.log('tool_gun.glb успешно загружен с оптимизированными материалами!');
  },
  undefined,
  (err) => {
    console.error('Ошибка загрузки tool_gun.glb:', err);
  }
);


// Функция выстрела из пистолета
function shootPistol() {
  const now = performance.now() / 1000;

  // Нельзя стрелять во время анимации доставания или перезарядки!
  if (isDeploying || deployProgress < 1.0) return;
  if (deployCooldown > 0) return;
  if (now - pistolAmmo.lastShotTime < pistolAmmo.fireRate) return;
  if (pistolAmmo.isReloading) return;

  if (pistolAmmo.current <= 0) {
    playEmptyClickSound();
    pistolAmmo.lastShotTime = now;
    return;
  }

  pistolAmmo.current--;
  pistolAmmo.lastShotTime = now;
  updateAmmoHud();

  // Звук выстрела
  playPistolShootSound();

  // Сетевая синхронизация звука и вспышки выстрела
  broadcastNetworkPacket({
    type: 'shoot_bullet',
    id: localPeer ? localPeer.id : 'me'
  });

  // Выброс 3D гильзы и дымок строго из дула
  spawnShellCasing();
  spawnMuzzleSmoke();

  // Механический откат затвора назад
  slideBlowback = 0.07;

  // Импульс отдачи: ствол резко дергается назад и вверх
  const aimMult = isAiming ? 0.45 : 1.0;
  recoilOffset.z += 0.055 * aimMult;
  recoilOffset.y += 0.012 * aimMult;
  recoilRotation.x += 0.14 * aimMult;
  recoilRotation.y += (Math.random() - 0.5) * 0.025 * aimMult;

  // Динамическая отдача самой камеры игрока
  const camRecoilEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  camRecoilEuler.setFromQuaternion(camera.quaternion, 'YXZ');
  camRecoilEuler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camRecoilEuler.x + 0.012 * aimMult));
  camRecoilEuler.z = 0;
  camera.quaternion.setFromEuler(camRecoilEuler);

  // Вспышка из дула на 40 мс
  if (pistolMeshGroup && pistolMeshGroup.muzzleFlash) {
    pistolMeshGroup.muzzleFlash.intensity = 3.5;
    setTimeout(() => {
      if (pistolMeshGroup && pistolMeshGroup.muzzleFlash) {
        pistolMeshGroup.muzzleFlash.intensity = 0;
      }
    }, 45);
  }

  // Точка вылета пули (срез ствола пистолета)
  const muzzlePos = getMuzzleWorldPosition();

  // Raycast попадания пули: проверяем ВСЕ физические объекты + землю (baseplate)
  raycaster.setFromCamera(centerScreen, camera);
  const shootTargets = [...physicsObjects.map(obj => obj.mesh), baseplate];
  const intersects = raycaster.intersectObjects(shootTargets, true);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const hitPoint = hit.point;
    const hitNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

    // Если нормаль локальная у меша, переводим ее в мировую
    hitNormal.transformDirection(hit.object.matrixWorld).normalize();

    // Запуск видимого трассера пули от ствола до точки попадания
    spawnBulletTracer(muzzlePos, hitPoint);

    // Создание следа от пули (декаль с дыркой и нагаром)
    spawnBulletHole(hit.object, hitPoint, hitNormal);

    // Искры от удара пули
    spawnBulletImpactSparks(hitPoint, hitNormal);

    // Физический импульс Cannon.js, если попали в физический объект (куб, сферу и т.д.)
    let current = hit.object;
    let targetObj = null;
    while (current && !targetObj && current !== scene) {
      targetObj = physicsObjects.find(obj => obj.mesh === current);
      current = current.parent;
    }

    if (targetObj && targetObj.body) {
      targetObj.body.wakeUp();
      const shootDir = new THREE.Vector3();
      camera.getWorldDirection(shootDir);

      const bulletForce = 18.0;
      targetObj.body.applyImpulse(
        new CANNON.Vec3(shootDir.x * bulletForce, shootDir.y * bulletForce + 1.5, shootDir.z * bulletForce),
        new CANNON.Vec3(hitPoint.x, hitPoint.y, hitPoint.z)
      );

      // Если выстрелили в ядерную бомбу — ДЕТОНАЦИЯ И ВЗРЫВ!
      if (targetObj.isNuke && !targetObj.isDetonated) {
        setTimeout(() => detonateNukeProp(targetObj), 60);
      }
    }
  } else {
    // Если пуля улетела вдаль в небо, трассер летит вперед
    const farPoint = new THREE.Vector3();
    camera.getWorldDirection(farPoint);
    farPoint.multiplyScalar(90.0).add(camera.position);
    spawnBulletTracer(muzzlePos, farPoint);
  }
}

// Перезарядка пистолета
function reloadPistol() {
  if (pistolAmmo.isReloading) return;
  if (pistolAmmo.current >= pistolAmmo.maxClip) return;
  if (pistolAmmo.reserve <= 0) return;

  pistolAmmo.isReloading = true;
  pistolAmmo.reloadTimer = 0;
  playReloadSound();
  showFlightHudNotification('Перезарядка...');
}

// Визуальные искры при попадании пули
function spawnBulletImpactSparks(pos, normal) {
  const sparkGeo = new THREE.BufferGeometry();
  const count = 8;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 0.1;
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const sparkMat = new THREE.PointsMaterial({
    color: 0xffcc44,
    size: 0.08,
    transparent: true,
    opacity: 1.0
  });

  const p = new THREE.Points(sparkGeo, sparkMat);
  p.position.copy(pos);
  scene.add(p);

  let age = 0;
  const sparkInterval = setInterval(() => {
    age += 0.04;
    sparkMat.opacity = Math.max(0, 1.0 - age * 3.5);
    if (age >= 0.3) {
      clearInterval(sparkInterval);
      scene.remove(p);
      sparkGeo.dispose();
      sparkMat.dispose();
    }
  }, 30);
}

window.addEventListener('mousedown', (e) => {
  // Клик в окно восстанавливает захват мыши только в игре, но не в главном меню и не при открытых модалках
  if (!isInMainMenu && !controls.isLocked && !isMenuOpen && !isPaused && !e.target.closest('#win-titlebar') && !e.target.closest('#spawn-menu') && !e.target.closest('#pause-overlay') && !e.target.closest('#settings-modal') && !e.target.closest('#worlds-modal') && !e.target.closest('#retro-dialog-modal') && !e.target.closest('#rotate-menu')) {
    requestPointerLockSafely();
  }

  // Если открыт селектор оружия — клик ЛКМ подтверждает выбор, ПКМ — отменяет
  if (isWeaponHudVisible) {
    if (e.button === 0) {
      confirmWeaponSelection();
      return;
    } else if (e.button === 2) {
      e.preventDefault();
      isWeaponHudVisible = false;
      weaponHudEl.classList.add('hidden');
      return;
    }
  }

  // ПКМ (e.button === 2):
  // 1. Если в руках пистолет — ЗАЖАТИЕ прицела (Hold to ADS)
  // ПКМ на Tool Gun (Слот 1-2 или 5-1): удаление целевого блока
  if (e.button === 2 && (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1') && controls.isLocked && !isMenuOpen) {
    e.preventDefault();
    removeToolGunTarget();
    return;
  }

  if (e.button === 2 && currentEquippedSlot === '2-1' && controls.isLocked && !isMenuOpen) {
    e.preventDefault();
    isAiming = true;
    return;
  }

  // 2. Если держим объект физикой — НАЧАЛО ЗАРЯДКИ БРОСКА / УДАРА (Зажатие ПКМ)
  if (e.button === 2 && grabbedBody && controls.isLocked && !isMenuOpen) {
    e.preventDefault();
    isChargingThrow = true;
    throwChargeStartTime = performance.now();
    throwChargeProgress = 0.5; // стартуем с 50%
    if (throwPowerOverlay) {
      throwPowerOverlay.classList.remove('hidden');
      updateThrowPowerUI(throwChargeProgress);
    }
    return;
  }

  // ЛКМ (e.button === 0):
  // 1. Если экипирован 9mm Пистолет — производим выстрел!
  if (e.button === 0 && currentEquippedSlot === '2-1' && controls.isLocked && !isMenuOpen) {
    shootPistol();
    return;
  }

  // 2. Если экипированы руки (Слот 1-1): Основной физический режим — Hold & Drag!
  // Зажимаешь — держишь и несёшь. Отпускаешь палец — предмет сразу отпускается и летит по инерции!
  // Выстрел Tool Gun (Слот 1-2 / 5-1)
  if (e.button === 0 && (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1') && controls.isLocked && !isMenuOpen) {
    fireToolGun();
    return;
  }

  // Захват/отпускание руками в 1 клик (Слот 1-1 Hands)
  if (e.button === 0 && currentEquippedSlot === '1-1' && controls.isLocked && !isMenuOpen) {
    if (grabbedBody) {
      releaseGrabbedBody(false);
      return;
    }

    raycaster.setFromCamera(centerScreen, camera);
    const meshes = physicsObjects.map(obj => obj.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const target = physicsObjects.find(obj => obj.mesh === hitMesh || (obj.mesh && obj.mesh.children.includes(hitMesh)));
      if (target) {
        grabbedBody = target.body;
        target.wasHeldByPlayer = true;
        grabDistance = intersects[0].distance;
        targetGrabDistance = Math.min(3.2, Math.max(MIN_GRAB_DISTANCE, intersects[0].distance));

        isGrabLocked = false;
        isGrabRotationLocked = false;
        grabbedBody.wakeUp();
        grabbedBody.angularVelocity.set(0, 0, 0);
        crosshairEl.classList.remove('hovered');
        crosshairEl.classList.add('grabbed');
        playGrabSound();

        const invCamQ = camera.quaternion.clone().invert();
        const objQ = new THREE.Quaternion(
          grabbedBody.quaternion.x,
          grabbedBody.quaternion.y,
          grabbedBody.quaternion.z,
          grabbedBody.quaternion.w
        );
        grabRelativeQuat.multiplyQuaternions(invCamQ, objQ);
      }
    }
    return;
  }
});

window.addEventListener('mouseup', (e) => {
  // При отпускании ЛКМ предмет НЕ бросается (захват работает по клику-переключателю)
  // Для броска используется зажатие ПКМ или повторный клик ЛКМ
  // (исправлено по требованию: достаточно 1 клика чтобы взять и 1 клика чтобы отпустить)
  // При отпускании ПКМ: если в руках пистолет — выходим из режима прицеливания (Hold to Aim)
  if (e.button === 2 && currentEquippedSlot === '2-1') {
    isAiming = false;
  }
  // При отпускании ПКМ: если заряжали бросок предмета в руках — мощно запускаем предмет!
  if (e.button === 2 && isChargingThrow) {
    isChargingThrow = false;
    if (throwPowerOverlay) throwPowerOverlay.classList.add('hidden');

    if (grabbedBody) {
      const throwDir = new THREE.Vector3();
      camera.getWorldDirection(throwDir);

      // Сила броска масштабируется от 8 м/с (слабый бросок) до 38 м/с (сокрушительный удар при 100%)
      const minForce = 8.0;
      const maxForce = 38.0;
      const effectiveForce = minForce + (maxForce - minForce) * throwChargeProgress;

      const throwVel = new THREE.Vector3(
        throwDir.x * effectiveForce,
        throwDir.y * effectiveForce + 1.2 * (1.0 + throwChargeProgress * 0.8),
        throwDir.z * effectiveForce
      );
      const rotStrength = 2.0 + throwChargeProgress * 6.0;
      const throwAngVel = new THREE.Vector3(
        (Math.random() - 0.5) * rotStrength,
        (Math.random() - 0.5) * rotStrength,
        (Math.random() - 0.5) * rotStrength
      );
      setWeldClusterVelocity(grabbedBody, throwVel, throwAngVel);

      // Озвучка броска (поддерживает кастомный throw_object.wav из public/sounds/)
      playCustomOrSynth('throw_object', (ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const startF = 180 + throwChargeProgress * 160;
        osc.frequency.setValueAtTime(startF, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime((0.15 + throwChargeProgress * 0.15) * masterVolume * sfxVolume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
      });

      grabbedBody = null;
      isGrabLocked = false;
      crosshairEl.classList.remove('grabbed');
    }
  }
});

// Клик по экрану захватывает курсор только если меню закрыто и игра начата
window.addEventListener('click', (e) => {
  if (!isInMainMenu && !isMenuOpen && !isPaused && !controls.isLocked && !e.target.closest('#win-titlebar') && !e.target.closest('#spawn-menu') && !e.target.closest('#pause-overlay') && !e.target.closest('#settings-modal') && !e.target.closest('#worlds-modal') && !e.target.closest('#retro-dialog-modal') && !e.target.closest('#rotate-menu')) {
    requestPointerLockSafely();
  }
});

// Состояние клавиатуры
const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  crouch: false,
  up: false,
  zoom: false
};

let isFlying = false;
let verticalVelocity = 0;
const gravity = 25.0;
const jumpStrength = 8.5;
const standHeight = 1.85; // Нормальный реалистичный рост глаз человека (1.85м)
const crouchHeight = 1.25; // Присед (1.25м - колени согнуты, не ползает по полу)
let currentEyeHeight = standHeight;
let jumpY = 0;
let isOnGround = true;

// Физическая динамика удара о землю и наклона камеры
let landingCompression = 0;
let landingTilt = 0;
let currentFallTilt = 0;

// Скорость полёта и управление слайдером мыши (по зажатию V на 0.7с)
let flyBaseSpeed = 12.0;
const MIN_FLY_SPEED = 2.0;
const MAX_FLY_SPEED = 50.0; // Максимальная скорость 50 м/с
let isAdjustingFlySpeed = false;
let vHoldTimer = null;
let vWasHeld = false;

// Приближение камеры на клавишу Q
const ZOOM_FOV = 22; // Приближение камеры
let currentFov = currentDefaultFov;

const flightSpeedOverlay = document.getElementById('flight-speed-overlay');
const flightSpeedValEl = document.getElementById('flight-speed-val');
const flightSpeedFillEl = document.getElementById('flight-speed-fill');

function updateFlightSpeedUI() {
  if (flightSpeedValEl) {
    flightSpeedValEl.innerHTML = `${flyBaseSpeed.toFixed(1)} <span class="flight-speed-unit">м/с</span>`;
  }
  if (flightSpeedFillEl) {
    const pct = ((flyBaseSpeed - MIN_FLY_SPEED) / (MAX_FLY_SPEED - MIN_FLY_SPEED)) * 100;
    flightSpeedFillEl.style.width = `${Math.max(2, Math.min(100, pct))}%`;
  }
}

let flightHudTimeout = null;

function showFlightHudNotification(text, duration = 1500) {
  const hintEl = document.getElementById('hint-bottom-left');
  if (!hintEl) return;
  hintEl.textContent = text;
  if (flightHudTimeout) clearTimeout(flightHudTimeout);
  flightHudTimeout = setTimeout(() => {
    hintEl.textContent = '[1-5] Оружие | [ЛКМ] Огонь / Взять | [ПКМ] Прицел | [Q] Зум | [V] Полёт';
  }, duration);
}

// Движение мыши: управление курсором в меню / обзор камеры
let currentHoveredEl = null;
let pressedEl = null;

window.addEventListener('mousemove', (e) => {
  if (isMenuOpen) {
    // Плавное и мгновенное перемещение виртуального курсора в координатах окна
    mouseScreenX = Math.max(0, Math.min(window.innerWidth, mouseScreenX + e.movementX));
    mouseScreenY = Math.max(0, Math.min(window.innerHeight, mouseScreenY + e.movementY));

    if (customCursorEl) {
      customCursorEl.style.transform = `translate3d(${mouseScreenX}px, ${mouseScreenY}px, 0)`;

      // Проверяем интерактивный элемент под виртуальным курсором: строго кнопка "Создать" или кнопка закрытия
      const elUnder = document.elementFromPoint(mouseScreenX, mouseScreenY);
      const interactiveEl = elUnder ? (elUnder.closest('.spawn-btn') || elUnder.closest('#close-menu')) : null;

      // Снимаем hover со старого элемента
      if (currentHoveredEl && currentHoveredEl !== interactiveEl) {
        currentHoveredEl.classList.remove('is-hovered');
      }

      if (interactiveEl) {
        interactiveEl.classList.add('is-hovered');
        customCursorEl.classList.add('pointer');
        currentHoveredEl = interactiveEl;

        // Если кнопка мыши зажата, но мы увели курсор с элемента — отжимаем эффект
        if (pressedEl) {
          if (interactiveEl === pressedEl || pressedEl.contains(interactiveEl)) {
            pressedEl.classList.add('is-active');
          } else {
            pressedEl.classList.remove('is-active');
          }
        }
      } else {
        customCursorEl.classList.remove('pointer');
        currentHoveredEl = null;
        if (pressedEl) {
          pressedEl.classList.remove('is-active');
        }
      }
    }
    return;
  }

  if (isAdjustingFlySpeed) {
    // Движение мыши ВВЕРХ (movementY < 0) увеличивает скорость, ВНИЗ (movementY > 0) уменьшает
    const speedDelta = -e.movementY * 0.35;
    flyBaseSpeed = Math.max(MIN_FLY_SPEED, Math.min(MAX_FLY_SPEED, flyBaseSpeed + speedDelta));
    updateFlightSpeedUI();
    return;
  }
});

// Клик виртуального курсора внутри открытого меню: зажатие строго кнопки "Создать" или "Закрыть"
window.addEventListener('mousedown', (e) => {
  if (isMenuOpen && e.button === 0) {
    const elUnder = document.elementFromPoint(mouseScreenX, mouseScreenY);
    if (elUnder) {
      const targetBtn = elUnder.closest('.spawn-btn') || elUnder.closest('#close-menu');
      if (targetBtn) {
        pressedEl = targetBtn;
        pressedEl.classList.add('is-active');
      }
    }
  }
});

// Отпускание виртуального курсора: действие срабатывает строго если отпустили над кнопкой "Создать" или "Закрыть"
window.addEventListener('mouseup', (e) => {
  if (isMenuOpen && e.button === 0) {
    if (pressedEl) {
      const elUnder = document.elementFromPoint(mouseScreenX, mouseScreenY);
      const targetBtn = elUnder ? (elUnder.closest('.spawn-btn') || elUnder.closest('#close-menu')) : null;

      const wasOver = targetBtn && (targetBtn === pressedEl || pressedEl.contains(targetBtn));
      pressedEl.classList.remove('is-active');

      if (wasOver) {
        if (pressedEl.id === 'close-menu' || pressedEl.closest('#close-menu')) {
          closeMenu();
        } else if (pressedEl.classList.contains('spawn-btn')) {
          const itemType = pressedEl.getAttribute('data-item') || (pressedEl.closest('.item-card') && pressedEl.closest('.item-card').getAttribute('data-item'));
          if (itemType) {
            spawnItemByType(itemType);
          }
        }
      }

      pressedEl = null;
    }
  }
});

window.addEventListener('wheel', (e) => {
  // 1. Регулировка дистанции удержания предмета на колёсико мыши
  if (grabbedBody && !isMenuOpen) {
    e.preventDefault();
    // При прокрутке вверх (deltaY < 0) — отдаляем, при прокрутке вниз (deltaY > 0) — приближаем к себе
    const step = 0.45;
    targetGrabDistance -= Math.sign(e.deltaY) * step;
    targetGrabDistance = Math.max(MIN_GRAB_DISTANCE, Math.min(targetGrabDistance, MAX_GRAB_DISTANCE));
    return;
  }

  // 2. Garry's Mod выбор слотов оружия колесиком мыши
  if (controls.isLocked && !isMenuOpen && !isPaused) {
    e.preventDefault();
    selectWeaponSlotByStep(e.deltaY > 0 ? 1 : -1);
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  // Если фокус находится в поле ввода (диалог, поиск сервера, пароль и т.д.) — НЕ перехватывать буквы (B, W, A, S, D, пробел и др.)!
  const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
  const isInputFocused = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
  if (isInputFocused) {
    // В полях ввода позволяем вводить любые буквы (b, r, v, z, пробел), выходим из игрового обработчика
    if (e.code === 'Escape') {
      e.target.blur();
    }
    return;
  }

  // Блокируем разрушительные хоткеи браузера (Ctrl+W закрытие окна, Ctrl+R перезагрузка, F5, Ctrl+S и т.д.)
  // НО позволяем движение на WASD при зажатом Ctrl (присед)!
  if (
    (e.ctrlKey && ['KeyR', 'KeyT', 'KeyN', 'KeyP'].includes(e.code)) ||
    e.code === 'F5'
  ) {
    e.preventDefault();
    return;
  }
  if (e.ctrlKey && ['KeyW', 'KeyS'].includes(e.code)) {
    e.preventDefault(); // Предотвращаем закрытие вкладки/окна по Ctrl+W в браузере, но НЕ выходим, чтобы сработал switch (e.code)!
  }

  if (e.code === 'Tab') {
    e.preventDefault();
    if ((isHostingServer || isConnectedToHost) && mpTabOverlay) {
      updateTabPlayerListUI();
      mpTabOverlay.classList.remove('hidden');
    }
    return;
  }

  if (e.code === 'Escape') {
    e.preventDefault();
    if (isMenuOpen) {
      isLockingRequested = true;
      closeMenu();
    } else {
      togglePause();
    }
    return;
  }

  if (e.code === 'KeyB') {
    e.preventDefault();
    toggleMenu();
    return;
  }

  // Garry's Mod выбор слотов оружия по цифрам 1, 2, 3, 4, 5
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
    const category = parseInt(e.code.replace('Digit', ''));
    showWeaponSelector(category);
    return;
  }

  switch (e.code) {
    case 'KeyW':
      keys.forward = true;
      break;
    case 'KeyS':
      keys.backward = true;
      break;
    case 'KeyA':
      keys.left = true;
      break;
    case 'KeyD':
      keys.right = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.sprint = true;
      break;
    case 'ControlLeft':
    case 'ControlRight':
      // Зажатие Ctrl для приседа (без переключения и дерганья от автоповторов)
      keys.crouch = true;
      break;
    case 'KeyQ':
      // Приближение камеры
      keys.zoom = true;
      break;
    case 'KeyV': {
      // Игнорируем автоповторы браузера
      if (e.repeat) break;
      vWasHeld = false;

      // Если клавишу зажали дольше 0.7 сек (700мс) — открываем окошко настройки скорости мышкой
      clearTimeout(vHoldTimer);
      vHoldTimer = setTimeout(() => {
        vWasHeld = true;
        isAdjustingFlySpeed = true;
        controls.enabled = false; // Отключаем вращение камеры, чтобы мышь регулировала только скорость!
        if (flightSpeedOverlay) {
          flightSpeedOverlay.classList.remove('hidden');
          updateFlightSpeedUI();
        }
      }, 700);
      break;
    }
    case 'Space':
      if (isFlying) {
        keys.up = true;
      } else if (isOnGround) {
        verticalVelocity = jumpStrength;
        isOnGround = false;
      }
      break;
    case 'KeyT':
      if (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1') {
        toolGunRotY += Math.PI / 2;
        showFlightHudNotification('Tool Gun: поворот Y на 90°');
        break;
      }
      break;
    case 'KeyR':
      if (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1') {
        toolGunRotX += Math.PI / 2;
        showFlightHudNotification('Tool Gun: поворот X на 90°');
        break;
      }
      if (currentEquippedSlot === '2-1') {
        reloadPistol();
        break;
      }
      if (e.repeat) break;
      isRPressed = true;
      isRotateKeyHeld = false;

      // При зажатии R (> 220мс) открывается интерактивное радиальное меню поворота
      const targetObj = getTargetObjectForRotation();
      if (targetObj) {
        if (rotateKeyHoldTimer) clearTimeout(rotateKeyHoldTimer);
        rotateKeyHoldTimer = setTimeout(() => {
          if (isRPressed) {
            isRotateKeyHeld = true;
            openRotateMenu(targetObj);
          }
        }, 220);
      }
      break;
    case 'KeyZ':
      // Закрепить/открепить куб при взгляде на него
      toggleWeldAtCrosshair();
      break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') {
    if (mpTabOverlay) mpTabOverlay.classList.add('hidden');
    return;
  }

  if (e.code === 'KeyR') {
    isRPressed = false;
    if (rotateKeyHoldTimer) {
      clearTimeout(rotateKeyHoldTimer);
      rotateKeyHoldTimer = null;
    }

    if (isRotateMenuOpen) {
      // Отпустили R - закрываем меню и возвращаемся в игру
      closeRotateMenu();
    } else if (!isRotateKeyHeld && currentEquippedSlot !== '2-1') {
      // Короткое быстрое нажатие R - быстрое выравнивание по сетке (snap)
      const target = getTargetObjectForRotation();
      if (target) {
        alignObjectToGrid(target, (finalQuat) => {
          if (grabbedBody && target.body === grabbedBody) {
            fixedGrabQuat.copy(finalQuat);
            isGrabRotationLocked = true;
          }
        });
        showFlightHudNotification('Выровнено по сетке (R)');
      }
    }
    isRotateKeyHeld = false;
  }

  switch (e.code) {
    case 'KeyW':
      keys.forward = false;
      break;
    case 'KeyS':
      keys.backward = false;
      break;
    case 'KeyA':
      keys.left = false;
      break;
    case 'KeyD':
      keys.right = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.sprint = false;
      break;
    case 'ControlLeft':
    case 'ControlRight':
      keys.crouch = false;
      break;
    case 'KeyQ':
      keys.zoom = false;
      break;
    case 'Space':
      keys.up = false;
      break;
    case 'KeyV': {
      clearTimeout(vHoldTimer);

      if (isAdjustingFlySpeed) {
        // Завершаем регулировку скорости мышкой, скрываем окошко и возвращаем камеру
        isAdjustingFlySpeed = false;
        if (flightSpeedOverlay) flightSpeedOverlay.classList.add('hidden');
        controls.enabled = !isMenuOpen && !isPaused;
        showFlightHudNotification(`Скорость полёта: ${flyBaseSpeed.toFixed(1)} м/с`);
      } else if (!vWasHeld) {
        // Быстрый клик (< 700мс) — обычное переключение полета Вкл / Выкл
        if (!isFlying) {
          isFlying = true;
          verticalVelocity = 0;
          flyVelocity.set(0, 0, 0);
          showFlightHudNotification(`Полёт: ВКЛ [${flyBaseSpeed.toFixed(1)} м/с]`);
        } else {
          isFlying = false;
          flyVelocity.set(0, 0, 0);
          const baseHeight = keys.crouch ? crouchHeight : standHeight;
          currentEyeHeight = baseHeight;
          jumpY = Math.max(camera.position.y - baseHeight, 0);
          isOnGround = jumpY === 0;
          showFlightHudNotification('Полёт: ВЫКЛ');
        }
      }
      vWasHeld = false;
      break;
    }
  }
});

const walkSpeed = 6.0;
const sprintSpeed = 11.5;
const flyMaxSpeed = 16.0;
const crouchSpeed = 3.2;
const flyVelocity = new THREE.Vector3(); // вектор инерции полёта
let prevTime = performance.now();

// --- Анимационный цикл ---

// ============================================================================
// --- СИСТЕМА СЕТЕВОГО МУЛЬТИПЛЕЕРА (PEER-TO-PEER WEBRTC) ---
// ============================================================================
let localPeer = null;
let activePeerConnections = new Map(); // peerId -> DataConnection
let isHostingServer = false;
let isConnectedToHost = false;
let hostConnection = null;
let currentLobbyId = null;
let localPlayerNick = "Игрок_" + Math.floor(1000 + Math.random() * 9000);

// Хранилище удаленных 3D аватаров игроков
const remotePlayerAvatars = new Map();

// Гарантированное отключение от комнаты при закрытии вкладки или перезагрузке
window.addEventListener('beforeunload', () => {
  leaveMultiplayerSession();
});

// Создание 3D модели гуманоида с видимым оружием (Glock-19 и Tool Gun)
function createPlayerAvatar(nick = "Игрок") {
  if (isInMainMenu || !isGameStarted) return null;
  const avatarGroup = new THREE.Group();

  // Материалы (стильный матовый темный комбинезон с неоновыми синими акцентами)
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdfb498, roughness: 0.5 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.4, metalness: 0.1 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.6 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.2, metalness: 0.8, emissive: 0x007799, emissiveIntensity: 0.6 });

  // 1. Торс (0.5 x 0.7 x 0.28)
  const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.28);
  const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
  torsoMesh.position.y = 1.0;
  torsoMesh.castShadow = true;
  avatarGroup.add(torsoMesh);

  // 2. Голова (0.32 x 0.32 x 0.32)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.52, 0);

  const headGeo = new THREE.BoxGeometry(0.32, 0.32, 0.32);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Очки / Визор на лице
  const visorGeo = new THREE.BoxGeometry(0.26, 0.08, 0.06);
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.03, -0.16);
  headGroup.add(visorMesh);

  avatarGroup.add(headGroup);

  // 3. Руки с пивотом в плече для естественного прицеливания и размахивания
  const armGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);

  // Левая рука (плечо y = 1.30)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.35, 1.30, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
  leftArmMesh.position.set(0, -0.30, 0);
  leftArmMesh.castShadow = true;
  leftArmGroup.add(leftArmMesh);
  avatarGroup.add(leftArmGroup);

  // Правая рука (плечо y = 1.30)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.35, 1.30, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
  rightArmMesh.position.set(0, -0.30, 0);
  rightArmMesh.castShadow = true;
  rightArmGroup.add(rightArmMesh);
  avatarGroup.add(rightArmGroup);

  // --------------------------------------------------------------------------
  // ОРУЖИЕ В ПРАВОЙ РУКЕ
  // --------------------------------------------------------------------------

  // А) Пистолет Glock-19
  const pistolGroup = new THREE.Group();
  pistolGroup.position.set(0, -0.56, -0.10);

  // Затвор (Slide)
  const pSlideGeo = new THREE.BoxGeometry(0.06, 0.07, 0.30);
  const pSlideMat = new THREE.MeshStandardMaterial({ color: 0x1f2126, metalness: 0.85, roughness: 0.25 });
  const pSlide = new THREE.Mesh(pSlideGeo, pSlideMat);
  pSlide.position.set(0, 0.035, -0.06);
  pistolGroup.add(pSlide);

  // Рукоять (Grip)
  const pGripGeo = new THREE.BoxGeometry(0.05, 0.16, 0.08);
  const pGripMat = new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.7 });
  const pGrip = new THREE.Mesh(pGripGeo, pGripMat);
  pGrip.position.set(0, -0.07, 0.02);
  pGrip.rotation.x = -0.18;
  pistolGroup.add(pGrip);

  // Дульный срез (ствол)
  const pBarrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8);
  const pBarrelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.9, roughness: 0.2 });
  const pBarrel = new THREE.Mesh(pBarrelGeo, pBarrelMat);
  pBarrel.rotation.x = Math.PI / 2;
  pBarrel.position.set(0, 0.035, -0.22);
  pistolGroup.add(pBarrel);

  // Вспышка выстрела (Muzzle flash)
  const pFlashMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0 });
  const pFlashGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const pFlash = new THREE.Mesh(pFlashGeo, pFlashMat);
  pFlash.position.set(0, 0.035, -0.26);
  pistolGroup.add(pFlash);

  rightArmGroup.add(pistolGroup);

  // Б) Tool Gun
  const toolgunGroup = new THREE.Group();
  toolgunGroup.position.set(0, -0.56, -0.10);

  // Корпус Tool Gun
  const tgBodyGeo = new THREE.BoxGeometry(0.07, 0.10, 0.26);
  const tgBodyMat = new THREE.MeshStandardMaterial({ color: 0x272a33, metalness: 0.6, roughness: 0.35 });
  const tgBody = new THREE.Mesh(tgBodyGeo, tgBodyMat);
  tgBody.position.set(0, 0.02, -0.04);
  toolgunGroup.add(tgBody);

  // Рукоять Tool Gun
  const tgGripGeo = new THREE.BoxGeometry(0.05, 0.17, 0.08);
  const tgGrip = new THREE.Mesh(tgGripGeo, pGripMat);
  tgGrip.position.set(0, -0.07, 0.03);
  tgGrip.rotation.x = -0.22;
  toolgunGroup.add(tgGrip);

  // Верхний экран дисплея (Светящийся экран Tool Gun)
  const tgScreenGeo = new THREE.BoxGeometry(0.065, 0.05, 0.07);
  const tgScreenMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00d9ff,
    emissiveIntensity: 0.85,
    roughness: 0.1
  });
  const tgScreen = new THREE.Mesh(tgScreenGeo, tgScreenMat);
  tgScreen.position.set(0, 0.08, 0.02);
  tgScreen.rotation.x = -0.3;
  toolgunGroup.add(tgScreen);

  // Сопло / Ствол Tool Gun
  const tgBarrelGeo = new THREE.CylinderGeometry(0.025, 0.02, 0.08, 10);
  const tgBarrelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
  const tgBarrel = new THREE.Mesh(tgBarrelGeo, tgBarrelMat);
  tgBarrel.rotation.x = Math.PI / 2;
  tgBarrel.position.set(0, 0.02, -0.20);
  toolgunGroup.add(tgBarrel);

  // Неоновое кольцо на стволе
  const tgRingGeo = new THREE.TorusGeometry(0.03, 0.008, 8, 16);
  const tgRingMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const tgRing = new THREE.Mesh(tgRingGeo, tgRingMat);
  tgRing.position.set(0, 0.02, -0.19);
  toolgunGroup.add(tgRing);

  rightArmGroup.add(toolgunGroup);

  // По умолчанию оружие скрыто (пустые руки)
  pistolGroup.visible = false;
  toolgunGroup.visible = false;

  // 4. Ноги (0.2 x 0.65 x 0.2)
  const legGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);

  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.13, 0.325, 0);
  leftLeg.castShadow = true;
  avatarGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.13, 0.325, 0);
  rightLeg.castShadow = true;
  avatarGroup.add(rightLeg);

  // 5. Никнейм над головой (Canvas 2D Sprite)
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
  ctx.roundRect ? ctx.roundRect(10, 10, 236, 44, 8) : ctx.fillRect(10, 10, 236, 44);
  ctx.fill();
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = 'bold 24px Tahoma, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(nick, 128, 40);

  const nameTexture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: nameTexture, depthTest: false });
  const nameSprite = new THREE.Sprite(spriteMat);
  nameSprite.position.set(0, 1.95, 0);
  nameSprite.scale.set(1.5, 0.38, 1);
  avatarGroup.add(nameSprite);

  scene.add(avatarGroup);

  let currentSlot = '1-1';

  const avatar = {
    group: avatarGroup,
    headGroup,
    rightArm: rightArmGroup,
    leftArm: leftArmGroup,
    leftLeg,
    rightLeg,
    pistolGroup,
    toolgunGroup,
    targetPos: new THREE.Vector3(0, 0, 0),
    targetYaw: 0,
    targetPitch: 0,
    walkAnimTimer: 0,
    isMoving: false,
    currentSlot: '1-1',
    nick: nick,

    setEquippedWeapon(slot) {
      this.currentSlot = slot;
      if (slot === '2-1') {
        // Glock-19 пистолет: поднимаем руку вперед для стрельбы
        pistolGroup.visible = true;
        toolgunGroup.visible = false;
        rightArmGroup.rotation.x = -Math.PI / 2.2;
        rightArmGroup.position.z = -0.12;
      } else if (slot === '1-2' || slot === '5-1') {
        // Tool Gun: поднимаем руку вперед
        pistolGroup.visible = false;
        toolgunGroup.visible = true;
        rightArmGroup.rotation.x = -Math.PI / 2.2;
        rightArmGroup.position.z = -0.12;
      } else {
        // Пустые руки: опускаем руку вниз
        pistolGroup.visible = false;
        toolgunGroup.visible = false;
        rightArmGroup.rotation.x = 0;
        rightArmGroup.position.z = 0;
      }
    },

    triggerShoot() {
      // Отдача пистолета и вспышка
      const prevX = rightArmGroup.rotation.x;
      rightArmGroup.rotation.x -= 0.18;
      pFlashMat.opacity = 1.0;
      setTimeout(() => {
        rightArmGroup.rotation.x = prevX;
        pFlashMat.opacity = 0;
      }, 70);
    },

    triggerToolgun() {
      // Отдача и вспышка кольца тулгана
      const prevX = rightArmGroup.rotation.x;
      rightArmGroup.rotation.x -= 0.14;
      tgRingMat.color.setHex(0xffffff);
      setTimeout(() => {
        rightArmGroup.rotation.x = prevX;
        tgRingMat.color.setHex(0x00f0ff);
      }, 80);
    }
  };

  return avatar;
}

let isDisconnectingIntentionally = false;

// Удаление аватара при отключении игрока
function removeRemotePlayer(peerId) {
  const avatar = remotePlayerAvatars.get(peerId);
  if (avatar) {
    if (avatar.group) scene.remove(avatar.group);
    remotePlayerAvatars.delete(peerId);
  }
}

// Корректный и полный выход из сетевой игры
function leaveMultiplayerSession() {
  isDisconnectingIntentionally = true;

  try {
    if (isHostingServer) {
      broadcastNetworkPacket({ type: 'server_closed', serverId: currentLobbyId });
      if (mpDiscoveryBc) {
        mpDiscoveryBc.postMessage({ type: 'server_closed', serverId: currentLobbyId });
      }
    } else if (isConnectedToHost && hostConnection) {
      try {
        hostConnection.send(JSON.stringify({
          type: 'player_disconnect',
          id: (localPeer && localPeer.id) || 'client'
        }));
      } catch (_) {}
    }
  } catch (_) {}

  // Закрываем все подключения к другим игрокам
  if (activePeerConnections) {
    activePeerConnections.forEach((conn) => {
      try { conn.close(); } catch (_) {}
    });
    activePeerConnections.clear();
  }

  if (hostConnection) {
    try { hostConnection.close(); } catch (_) {}
    hostConnection = null;
  }

  if (localPeer) {
    try { localPeer.destroy(); } catch (_) {}
    localPeer = null;
  }

  // Очищаем аватары из Three.js сцены, чтобы они никогда не маячили на главной
  remotePlayerAvatars.forEach((avatar) => {
    try {
      if (avatar && avatar.group) scene.remove(avatar.group);
    } catch (_) {}
  });
  remotePlayerAvatars.clear();

  isHostingServer = false;
  isConnectedToHost = false;
  currentLobbyId = null;

  if (mpRoomHud) mpRoomHud.classList.add('hidden');
  if (mpTabOverlay) mpTabOverlay.classList.add('hidden');

  setTimeout(() => {
    isDisconnectingIntentionally = false;
  }, 1200);
}

// Рассылка сетевого пакета всем участникам
function broadcastNetworkPacket(packet, excludePeerId = null) {
  const raw = JSON.stringify(packet);
  if (isHostingServer) {
    activePeerConnections.forEach((conn, id) => {
      if (id !== excludePeerId && conn.open) {
        try { conn.send(raw); } catch (_) {}
      }
    });
  } else if (hostConnection && hostConnection.open) {
    try { hostConnection.send(raw); } catch (_) {}
  }
}

// Обработка входящих сетевых сообщений
function handleNetworkPacket(packet, senderId) {
  if (!packet || !packet.type) return;
  // Полная изоляция: не обрабатываем сетевые пакеты, если мы находимся на главной или отключены
  if (isInMainMenu || !isGameStarted || (!isHostingServer && !isConnectedToHost)) return;

  switch (packet.type) {
    case 'player_transform': {
      // Синхронизация движения и поворота
      let avatar = remotePlayerAvatars.get(packet.id);
      if (!avatar) {
        avatar = createPlayerAvatar(packet.nick || "Игрок");
        if (!avatar) break;
        remotePlayerAvatars.set(packet.id, avatar);
        showFlightHudNotification(`Игрок ${packet.nick || packet.id} вошел на сервер!`);
      }
      avatar.targetPos.set(packet.x, packet.y, packet.z);
      avatar.targetYaw = packet.yaw;
      avatar.targetPitch = packet.pitch;
      avatar.isMoving = packet.isMoving;
      if (packet.weapon && avatar.setEquippedWeapon) {
        avatar.setEquippedWeapon(packet.weapon);
      }

      // Если мы хост — ретранслируем остальным клиентам
      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'weapon_switch': {
      // Синхронизация доставания/смены оружия
      const avatar = remotePlayerAvatars.get(packet.id);
      if (avatar && avatar.setEquippedWeapon) {
        avatar.setEquippedWeapon(packet.slot);
      }
      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'spawn_block': {
      // Синхронизация спавна блока через тулган или меню
      if (packet.netId && physicsObjects.some(o => o.netId === packet.netId)) {
        break; // исключаем дубликаты
      }
      const rot = { x: packet.qx, y: packet.qy, z: packet.qz, w: packet.qw };
      let created = null;
      if (packet.blockType === 'secret_cube') {
        created = spawnSecretCubeAt(packet.pos, rot);
      } else if (packet.blockType === 'sphere') {
        created = spawnSphereAt(packet.pos, rot);
      } else if (packet.blockType === 'triangle') {
        created = spawnTriangleAt(packet.pos, rot);
      } else if (packet.blockType === 'ramp') {
        created = spawnRampAt(packet.pos, rot);
      } else if (packet.blockType === 'nuke') {
        created = spawnNukePropAt(packet.pos, rot);
      } else {
        created = spawnCubeAt(packet.pos, rot);
      }

      if (created) {
        created.netId = packet.netId;
        playWeldSound();
      }

      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'remove_block': {
      // Синхронизация удаления блока через ПКМ тулгана
      const target = physicsObjects.find(o => o.netId === packet.netId || (o.mesh && o.mesh.position.distanceTo(packet.pos) < 0.25));
      if (target) {
        for (let i = weldConstraints.length - 1; i >= 0; i--) {
          const c = weldConstraints[i];
          if (c.bodyA === target.body || c.bodyB === target.body) {
            world.removeConstraint(c.constraint);
            weldConstraints.splice(i, 1);
          }
        }
        const idx = physicsObjects.indexOf(target);
        if (idx !== -1) physicsObjects.splice(idx, 1);
        if (target.body) world.removeBody(target.body);
        if (target.mesh) scene.remove(target.mesh);
        playUnweldSound();
      }

      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'shoot_bullet': {
      // Синхронизация выстрела пистолета: звук и визуальная отдача на аватаре
      const avatar = remotePlayerAvatars.get(packet.id);
      if (avatar && avatar.triggerShoot) {
        avatar.triggerShoot();
      }

      playCustomOrSynth('pistol_shoot', (ctx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.13);
      });

      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'toolgun_fire': {
      // Синхронизация выстрела тулгана: вспышка и звук сварки
      const avatar = remotePlayerAvatars.get(packet.id);
      if (avatar && avatar.triggerToolgun) {
        avatar.triggerToolgun();
      }
      playWeldSound();

      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'player_disconnect': {
      removeRemotePlayer(packet.id);
      showFlightHudNotification(`Игрок покинул сервер`);
      if (isHostingServer) {
        broadcastNetworkPacket(packet, senderId);
      }
      break;
    }

    case 'server_closed': {
      if (!isHostingServer) {
        leaveMultiplayerSession();
        clearGameplayWorldObjects();
        isInMainMenu = true;
        isGameStarted = false;
        if (mainMenuEl) {
          mainMenuEl.classList.remove('hidden', 'fade-out-game');
          void mainMenuEl.offsetWidth;
          mainMenuEl.classList.add('visible');
        }
        startMenuMusic();
        cleanupMenuChaosObjects();
        showRetroAlert('Сервер был закрыт владельцем комнаты.', 'Сервер закрыт');
      }
      break;
    }
  }
}

// Конфигурация WebRTC с надежными публичными STUN серверами Google и Cloudflare
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

// Переменные комнаты
let currentServerInfo = {
  name: "Песочница",
  maxPlayers: 4,
  isPrivate: false,
  password: ""
};

// DOM элементы индикаторов комнаты и списка игроков (TAB)
const mpRoomHud = document.getElementById('mp-room-hud');
const mpHudRoomId = document.getElementById('mp-hud-room-id');
const btnMpCopyCode = document.getElementById('btn-mp-copy-code');

const mpTabOverlay = document.getElementById('mp-tab-overlay');
const mpTabSrvTitle = document.getElementById('mp-tab-srv-title');
const mpTabCountLabel = document.getElementById('mp-tab-count-label');
const mpTabPlayersList = document.getElementById('mp-tab-players-list');

if (btnMpCopyCode) {
  btnMpCopyCode.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentLobbyId) {
      navigator.clipboard.writeText(currentLobbyId).then(() => {
        showFlightHudNotification('Код комнаты скопирован в буфер обмена!');
      }).catch(() => {
        showFlightHudNotification(`Код: ${currentLobbyId}`);
      });
    }
  });
}

function updateTabPlayerListUI() {
  if (!mpTabPlayersList) return;
  const totalCount = 1 + remotePlayerAvatars.size;
  if (mpTabSrvTitle) mpTabSrvTitle.textContent = currentServerInfo.name;
  if (mpTabCountLabel) mpTabCountLabel.textContent = `${totalCount}/${currentServerInfo.maxPlayers}`;

  let html = `
    <div class="mp-tab-player-item is-me ${isHostingServer ? 'is-host' : ''}">
      <span>${localPlayerNick} ${isHostingServer ? '(Хост)' : ''} (Вы)</span>
      <span class="mp-tab-ping">0 ms</span>
    </div>
  `;

  remotePlayerAvatars.forEach((avatar, id) => {
    const isHost = !isHostingServer && (id === currentLobbyId);
    html += `
      <div class="mp-tab-player-item ${isHost ? 'is-host' : ''}">
        <span>${avatar.nick || 'Игрок'} ${isHost ? '(Хост)' : ''}</span>
        <span class="mp-tab-ping">${Math.floor(25 + Math.random() * 30)} ms</span>
      </div>
    `;
  });

  mpTabPlayersList.innerHTML = html;
}

// Master Server Registry (через общий канал BroadcastChannel и публичный WebRTC Signaling)
const MP_REGISTRY_CHANNEL = 'sbx_servers_discovery_v1';
let mpDiscoveryBc = null;
try {
  mpDiscoveryBc = new BroadcastChannel(MP_REGISTRY_CHANNEL);
  mpDiscoveryBc.onmessage = (ev) => {
    const data = ev.data;
    if (!data) return;
    if (data.type === 'announce') {
      registerDiscoveredServer(data.server);
    } else if (data.type === 'server_closed') {
      activeServerList = activeServerList.filter(s => s.id !== data.serverId);
      renderServerList();
    } else if (data.type === 'query') {
      if (isHostingServer && currentLobbyId && !currentServerInfo.isPrivate) {
        mpDiscoveryBc.postMessage({
          type: 'announce',
          server: {
            id: currentLobbyId,
            name: currentServerInfo.name,
            players: 1 + activePeerConnections.size,
            maxPlayers: currentServerInfo.maxPlayers,
            map: "Sandbox Flat",
            ping: 30,
            hasPassword: !!currentServerInfo.password,
            timestamp: Date.now()
          }
        });
      }
    }
  };
} catch (_) {}

function registerDiscoveredServer(srv) {
  if (!srv || !srv.id) return;
  const existingIdx = activeServerList.findIndex(s => s.id === srv.id);
  if (existingIdx !== -1) {
    activeServerList[existingIdx] = { ...activeServerList[existingIdx], ...srv, timestamp: Date.now() };
  } else {
    activeServerList.push({ ...srv, timestamp: Date.now() });
  }
  renderServerList();
}

function queryActiveServers() {
  if (mpDiscoveryBc) {
    mpDiscoveryBc.postMessage({ type: 'query' });
  }
}

// Инициализация хоста (создание сервера)
function initMultiplayerHost(options = {}) {
  const srvName = options.name || "Песочница #" + Math.floor(100 + Math.random() * 900);
  const maxPlayers = parseInt(options.maxPlayers) || 4;
  const isPrivate = !!options.isPrivate;
  const password = options.password || "";

  currentServerInfo = { name: srvName, maxPlayers, isPrivate, password };

  const cleanId = "sbx-" + Math.random().toString(36).substring(2, 8);
  currentLobbyId = cleanId;

  if (localPeer) {
    try { localPeer.destroy(); } catch (_) {}
  }

  localPeer = new Peer(cleanId, {
    debug: 1,
    config: ICE_CONFIG
  });

  localPeer.on('open', (id) => {
    isHostingServer = true;
    isConnectedToHost = false;
    isInMainMenu = false;
    isGameStarted = true;
    cleanupMenuChaosObjects();

    // Включаем HUD с кодом комнаты слева сверху
    if (mpHudRoomId) mpHudRoomId.textContent = id;
    if (mpRoomHud) mpRoomHud.classList.remove('hidden');

    showFlightHudNotification(`Сервер «${srvName}» запущен! Код: ${id}`, 6000);

    // Закрываем модалки и входим в чистый мир
    if (multiplayerModal) multiplayerModal.classList.add('hidden');
    const mpCreateDialog = document.getElementById('mp-create-dialog');
    if (mpCreateDialog) mpCreateDialog.classList.add('hidden');
    loadWorldAndEnterGame(null, true);

    updateTabPlayerListUI();

    // Анонсируем сервер в общий канал
    if (!isPrivate && mpDiscoveryBc) {
      mpDiscoveryBc.postMessage({
        type: 'announce',
        server: {
          id: cleanId,
          name: srvName,
          players: 1,
          maxPlayers: maxPlayers,
          map: "Sandbox Flat",
          ping: 30,
          hasPassword: !!password,
          timestamp: Date.now()
        }
      });
    }
  });

  localPeer.on('connection', (conn) => {
    // Проверка лимита игроков
    if (1 + activePeerConnections.size >= currentServerInfo.maxPlayers) {
      conn.send(JSON.stringify({ type: 'server_full' }));
      setTimeout(() => conn.close(), 500);
      return;
    }

    activePeerConnections.set(conn.peer, conn);

    conn.on('data', (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'auth_request') {
          // Проверка пароля сервера
          if (currentServerInfo.password && parsed.password !== currentServerInfo.password) {
            conn.send(JSON.stringify({ type: 'auth_fail', reason: 'Неверный пароль сервера' }));
            setTimeout(() => conn.close(), 500);
            return;
          }
          conn.send(JSON.stringify({
            type: 'auth_ok',
            serverInfo: {
              name: currentServerInfo.name,
              maxPlayers: currentServerInfo.maxPlayers
            }
          }));
          return;
        }
        handleNetworkPacket(parsed, conn.peer);
      } catch (err) {
        console.error('Data error:', err);
      }
    });

    conn.on('close', () => {
      activePeerConnections.delete(conn.peer);
      removeRemotePlayer(conn.peer);
      updateTabPlayerListUI();
      // Оповещаем остальных клиентов об отключении игрока
      broadcastNetworkPacket({
        type: 'player_disconnect',
        id: conn.peer
      });
    });

    // Отправляем новому игроку текущее состояние мира (все типы объектов)
    const currentBlocks = physicsObjects
      .filter(o => o && o.mesh && o.body)
      .map(o => ({
        netId: o.netId || ("b_" + Math.random().toString(36).substring(2, 7)),
        blockType: o.isSphere ? 'sphere' : (o.isTriangle ? 'triangle' : (o.isRamp ? 'ramp' : (o.isSecretCube ? 'secret_cube' : (o.isNuke ? 'nuke' : 'cube')))),
        pos: { x: o.mesh.position.x, y: o.mesh.position.y, z: o.mesh.position.z },
        qx: o.mesh.quaternion.x,
        qy: o.mesh.quaternion.y,
        qz: o.mesh.quaternion.z,
        qw: o.mesh.quaternion.w
      }));

    setTimeout(() => {
      currentBlocks.forEach(b => {
        try { conn.send(JSON.stringify({ type: 'spawn_block', ...b })); } catch (_) {}
      });
      updateTabPlayerListUI();
    }, 400);
  });

  localPeer.on('error', (err) => {
    if (isDisconnectingIntentionally || isInMainMenu) return;
    console.error('Peer error:', err);
    let msg = 'Ошибка сети: ' + (err.type || err.message);
    if (err.type === 'unavailable-id') {
      msg = 'ID сервера уже занят, пробуем другой...';
    }
    showRetroAlert(msg, 'Ошибка сервера');
  });
}

// Подключение клиента к существующему серверу по коду комнаты
function connectToMultiplayerHost(targetId, enteredPassword = "") {
  if (!targetId || !targetId.trim()) return;

  // Автоматическая нормализация кода (убираем пробелы, добавляем префикс sbx- если друг ввел только 6 символов)
  let cleanId = targetId.trim().toLowerCase();
  if (!cleanId.startsWith('sbx-')) {
    cleanId = 'sbx-' + cleanId;
  }

  if (localPeer) {
    try { localPeer.destroy(); } catch (_) {}
  }

  localPeer = new Peer({
    debug: 1,
    config: ICE_CONFIG
  });

  localPeer.on('open', (myId) => {
    hostConnection = localPeer.connect(cleanId, {
      reliable: true
    });

    let isConnected = false;

    hostConnection.on('open', () => {
      isConnected = true;
      isHostingServer = false;
      isConnectedToHost = true;
      isInMainMenu = false;
      isGameStarted = true;
      cleanupMenuChaosObjects();
      currentLobbyId = cleanId;

      // Отправляем запрос авторизации хосту
      hostConnection.send(JSON.stringify({
        type: 'auth_request',
        nick: localPlayerNick,
        password: enteredPassword
      }));

      // Показываем HUD кода комнаты слева вверху
      if (mpHudRoomId) mpHudRoomId.textContent = cleanId;
      if (mpRoomHud) mpRoomHud.classList.remove('hidden');

      showFlightHudNotification(`Успешное подключение к серверу!`, 3000);
      if (multiplayerModal) multiplayerModal.classList.add('hidden');
      loadWorldAndEnterGame(null, true);
      updateTabPlayerListUI();
    });

    hostConnection.on('data', (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'auth_fail') {
          showRetroAlert(parsed.reason || 'Ошибка входа', 'Доступ запрещен');
          return;
        }
        if (parsed.type === 'server_full') {
          showRetroAlert('Сервер заполнен (достигнут лимит игроков)!', 'Сервер полон');
          return;
        }
        if (parsed.type === 'auth_ok') {
          if (parsed.serverInfo) {
            currentServerInfo = { ...currentServerInfo, ...parsed.serverInfo };
            updateTabPlayerListUI();
          }
          return;
        }
        handleNetworkPacket(parsed, cleanId);
      } catch (err) {
        console.error('Client data error:', err);
      }
    });

    hostConnection.on('close', () => {
      isConnectedToHost = false;
      if (mpRoomHud) mpRoomHud.classList.add('hidden');
      if (mpTabOverlay) mpTabOverlay.classList.add('hidden');
      if (!isDisconnectingIntentionally && !isInMainMenu) {
        showRetroAlert('Соединение с сервером разорвано', 'Отключение');
      }
    });

    hostConnection.on('error', (err) => {
      if (isDisconnectingIntentionally || isInMainMenu) return;
      showRetroAlert('Не удалось подключиться: ' + (err.message || 'Проверьте код комнаты'), 'Ошибка подключения');
    });
  });

  localPeer.on('error', (err) => {
    if (isDisconnectingIntentionally || isInMainMenu) return;
    console.error('Peer client error:', err);
    if (err.type === 'peer-unavailable') {
      showRetroAlert(
        `Сервер с кодом «${cleanId}» не найден!\n\nУбедитесь, что ваш друг:\n1. Нажал «+ Создать сервер» и остаётся в игре.\n2. Скопировал точный код комнаты (например, sbx-xxxxxx).\n3. Вы оба подключены к интернету.`,
        'Сервер не найден'
      );
    } else {
      showRetroAlert('Ошибка соединения: ' + (err.type || err.message), 'Ошибка сети');
    }
  });
}

// Отправка наших координат с частотой 20 раз в секунду (50мс тикрейт)
let lastNetworkSyncTime = 0;
function updateMultiplayerNetwork(now, delta) {
  if (!isHostingServer && !isConnectedToHost) return;

  // 1. Плавная интерполяция позиции и анимация ходьбы удаленных игроков
  remotePlayerAvatars.forEach((avatar) => {
    avatar.group.position.lerp(avatar.targetPos, Math.min(14.0 * delta, 1.0));

    // Поворот тела по Yaw
    avatar.group.rotation.y += (avatar.targetYaw - avatar.group.rotation.y) * Math.min(14.0 * delta, 1.0);
    // Наклон головы по Pitch
    if (avatar.headGroup) {
      avatar.headGroup.rotation.x += (avatar.targetPitch - avatar.headGroup.rotation.x) * Math.min(14.0 * delta, 1.0);
    }

    // Анимация шагов ног и рук
    if (avatar.isMoving) {
      avatar.walkAnimTimer += delta * 10.0;
      const legAngle = Math.sin(avatar.walkAnimTimer) * 0.45;
      if (avatar.leftLeg) avatar.leftLeg.rotation.x = legAngle;
      if (avatar.rightLeg) avatar.rightLeg.rotation.x = -legAngle;
      if (avatar.leftArm) avatar.leftArm.rotation.x = -legAngle * 0.8;
    } else {
      if (avatar.leftLeg) avatar.leftLeg.rotation.x *= 0.8;
      if (avatar.rightLeg) avatar.rightLeg.rotation.x *= 0.8;
      if (avatar.leftArm) avatar.leftArm.rotation.x *= 0.8;
    }
  });

  // 2. Отправка пакета нашего положения
  if (now - lastNetworkSyncTime > 45) { // ~22 пакета в секунду (экономно и плавно)
    lastNetworkSyncTime = now;

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    const isMoving = (keys.forward || keys.backward || keys.left || keys.right) && !isFlying && isOnGround;

    const myTransformPacket = {
      type: 'player_transform',
      id: localPeer ? localPeer.id : 'me',
      nick: localPlayerNick,
      x: camera.position.x,
      y: camera.position.y - standHeight, // уровень ног для аватара
      z: camera.position.z,
      yaw: euler.y,
      pitch: euler.x,
      isMoving: isMoving,
      weapon: currentEquippedSlot // синхронизация видимого оружия
    };

    broadcastNetworkPacket(myTransformPacket);
  }
}


function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = Math.min((time - prevTime) / 1000, 0.05);
  prevTime = time;

  // Если открыто Главное Меню — крутим физику и рендерим зрелищный фоновый хаос (ТОЛЬКО в чистом меню без игры/сервера)
  if ((isInMainMenu || !isGameStarted) && !isHostingServer && !isConnectedToHost) {
    // Тролль-эффект фейковых лагов: во время детонации кучи ядерок ТОЛЬКО фоновый 3D-холст меню
    // проседает до 1 FPS (ровно 1 кадр в секунду в течение 5 секунд), в то время как HTML-кнопки меню,
    // курсор мыши, заголовок окна и настройки работают на идеальных 60+ FPS!
    if (menuFakeLagActive) {
      // Звуки ошибок Windows зависают и строчат пулемётными очередями в рандоме!
      updateNukeAudioFreezeSpam(time);

      if (time < menuFakeLagNextRenderTime) {
        return;
      }
      menuFakeLagNextRenderTime = time + 1000; // Ровно 1 кадр в секунду (1 FPS)!
    }

    updateMenuChaos(delta);
    skyDome.position.copy(menuCamera.position);
    renderer.render(scene, menuCamera);
    return;
  }

  // Если игра на паузе (как в S.T.A.L.K.E.R.) — физика и перемещения заморожены, только отрисовываем кадр
  if (isPaused) {
    updateMultiplayerNetwork(time, delta);

  renderer.render(scene, camera);
    return;
  }

  // Если игрок в режиме свободного полёта
  if (isFlying) {
    // Истинный 3D полёт по взгляду камеры с настраиваемой скоростью и мягкой инерцией
    const currentFlySpeed = keys.sprint ? flyBaseSpeed * 1.7 : flyBaseSpeed;

    const forwardDir = new THREE.Vector3();
    camera.getWorldDirection(forwardDir);

    const rightDir = new THREE.Vector3();
    rightDir.crossVectors(forwardDir, camera.up).normalize();

    const upDir = new THREE.Vector3(0, 1, 0);

    const moveInput = new THREE.Vector3();
    if (keys.forward) moveInput.add(forwardDir);
    if (keys.backward) moveInput.sub(forwardDir);
    if (keys.right) moveInput.add(rightDir);
    if (keys.left) moveInput.sub(rightDir);
    if (keys.up) moveInput.add(upDir);
    if (keys.crouch) moveInput.sub(upDir);

    if (moveInput.lengthSq() > 0) {
      moveInput.normalize().multiplyScalar(currentFlySpeed);
    }

    const smoothFactor = 4.5 * delta;
    flyVelocity.lerp(moveInput, smoothFactor);

    camera.position.addScaledVector(flyVelocity, delta);

    // Ограничение высоты: над платформой Baseplate не даем утыкаться лицом в пол (min 1.85м),
    // а за пределами Baseplate (в бездне) разрешен свободный 3D-полет на любую глубину!
    const halfBaseplate = baseplateSize / 2;
    const isOverBaseplate = Math.abs(camera.position.x) <= halfBaseplate && Math.abs(camera.position.z) <= halfBaseplate;
    const maxFlightAltitude = 250.0;
    const minFlightAltitude = isOverBaseplate ? standHeight : -30.0;

    if (camera.position.y > maxFlightAltitude) {
      camera.position.y = maxFlightAltitude;
      if (flyVelocity.y > 0) flyVelocity.y = 0;
    }
    if (camera.position.y < minFlightAltitude) {
      camera.position.y = minFlightAltitude;
      if (flyVelocity.y < 0) flyVelocity.y = 0;
    }

    updateFallWindEffect(0, delta);
  } else {
    // Обычное передвижение пешком (работает и при открытом меню)
    let currentSpeed = walkSpeed;
    if (keys.crouch) {
      currentSpeed = keys.sprint ? 7.5 : crouchSpeed;
    } else if (keys.sprint) {
      currentSpeed = sprintSpeed;
    }

    // Горизонтальные векторы перемещения персонажа в плоскости XZ
    const forwardVector = new THREE.Vector3();
    camera.getWorldDirection(forwardVector);
    forwardVector.y = 0;
    forwardVector.normalize();

    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(forwardVector, camera.up).normalize();

    const moveVector = new THREE.Vector3();
    if (keys.forward) moveVector.add(forwardVector);
    if (keys.backward) moveVector.sub(forwardVector);
    if (keys.right) moveVector.add(rightVector);
    if (keys.left) moveVector.sub(rightVector);

    // Проверяем, находится ли игрок над поверхностью Baseplate
    const halfBaseplate = baseplateSize / 2; // 256 метров
    const isOverBaseplate = Math.abs(camera.position.x) <= halfBaseplate && Math.abs(camera.position.z) <= halfBaseplate;

    // Опора под ногами: если над Baseplate — земля (y=0), иначе бездна (-Infinity)
    let groundBaseY = isOverBaseplate ? 0 : -Infinity;
    const playerRadius = 0.36;
    const playerFeetY = jumpY;

    // Плавная коллизия со скольжением (без дерганий и телепортаций в углах)
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(currentSpeed * delta);
      camera.position.add(moveVector);

      // Итерируем 3 раза для стабильного разрешения коллизий в углах
      for (let iter = 0; iter < 3; iter++) {
        for (const obj of physicsObjects) {
          if (obj.body === grabbedBody) continue;
          const bPos = obj.body.position;
          let halfX = 0.5, halfY = 0.5, halfZ = 0.5;
          if (obj.isTriangle) halfY = (Math.sqrt(3) / 2) * 0.5;

          const topY = bPos.y + halfY;
          const bottomY = bPos.y - halfY;
          const isVertOverlap = (playerFeetY < topY - 0.08) && (playerFeetY + standHeight * 0.7 > bottomY);

          if (isVertOverlap) {
            // Находим ближайшую точку на AABB куба к игроку
            const closestX = Math.max(bPos.x - halfX, Math.min(camera.position.x, bPos.x + halfX));
            const closestZ = Math.max(bPos.z - halfZ, Math.min(camera.position.z, bPos.z + halfZ));

            const distX = camera.position.x - closestX;
            const distZ = camera.position.z - closestZ;
            const distSq = distX * distX + distZ * distZ;

            if (distSq < playerRadius * playerRadius) {
              const dist = Math.sqrt(distSq);
              if (dist > 0.0001) {
                const overlap = playerRadius - dist;
                camera.position.x += (distX / dist) * overlap;
                camera.position.z += (distZ / dist) * overlap;
              } else {
                // Если строго внутри центра — плавно выталкиваем по направлению движения
                camera.position.x += (camera.position.x >= bPos.x ? 1 : -1) * 0.05;
                camera.position.z += (camera.position.z >= bPos.z ? 1 : -1) * 0.05;
              }

              // Передаем мягкий кинетический импульс блоку без рывков
              obj.body.velocity.x += (moveVector.x || 0) * 1.5 * delta * 10.0;
              obj.body.velocity.z += (moveVector.z || 0) * 1.5 * delta * 10.0;
              obj.body.wakeUp();
            }
          }
        }
      }
    }

    const targetHeight = keys.crouch ? crouchHeight : standHeight;
    const crouchLerpSpeed = keys.crouch ? 18.0 : 8.5;
    currentEyeHeight += (targetHeight - currentEyeHeight) * Math.min(crouchLerpSpeed * delta, 1.0);

    // Расчет опоры под ногами для стояния на объектах
    for (const obj of physicsObjects) {
      if (obj.body === grabbedBody) continue;
      const bPos = obj.body.position;
      let halfX = 0.5, halfY = 0.5, halfZ = 0.5;
      if (obj.isTriangle) halfY = (Math.sqrt(3) / 2) * 0.5;

      const dx = Math.abs(camera.position.x - bPos.x);
      const dz = Math.abs(camera.position.z - bPos.z);
      if (dx < (halfX + playerRadius) && dz < (halfZ + playerRadius)) {
        const topY = bPos.y + halfY;
        if (playerFeetY >= topY - 0.25) {
          if (topY > groundBaseY) {
            groundBaseY = topY;
          }
        }
      }
    }

    // ГРАВИТАЦИЯ И ФИЗИКА ПАДЕНИЯ В ПУСТОТУ
    verticalVelocity -= gravity * delta;
    jumpY += verticalVelocity * delta;

    // Приземление на опору (на Baseplate или на куб)
    if (jumpY <= groundBaseY) {
      jumpY = groundBaseY;
      verticalVelocity = 0;
      isOnGround = true;
    } else {
      isOnGround = false;
    }

    camera.position.y = currentEyeHeight + jumpY;

    // ЕСЛИ ИГРОК УПАЛ В ПУСТОТУ / БЕЗДНУ (y < -35): телепортируем обратно в центр карты
    if (camera.position.y < -35.0) {
      if (grabbedBody) {
        releaseGrabbedBody(false);
      }
      camera.position.set(0, standHeight + 1.0, 0);
      verticalVelocity = 0;
      jumpY = 1.0;
      isOnGround = false;
      showFlightHudNotification('Возврат в центр карты из пустоты');
    }

    // Эффект ветра при сильном падении (если приземлились на землю/куб — мгновенное обнуление)
    const currentFallSpeed = isOnGround ? 0 : Math.max(0, -verticalVelocity - 8.0);
    updateFallWindEffect(currentFallSpeed, delta, isOnGround);
  }

  // --- Обновление физического мира и удержание объекта ---
  world.step(Math.min(delta, 0.05));

  // Монолитная синхронизация сваренных объектов (абсолютная жесткость)
  syncWeldConstraintsPositions();

  // --- Проверка наведения прицела на куб (Raycast hover) ---
  if (!grabbedBody && controls.isLocked && !isMenuOpen) {
    raycaster.setFromCamera(centerScreen, camera);
    const meshes = physicsObjects.map(obj => obj.mesh);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0 && intersects[0].distance < 8.0) {
      crosshairEl.classList.add('hovered');
    } else {
      crosshairEl.classList.remove('hovered');
    }
  }

  if (grabbedBody) {
    // Плавное притягивание (pull-in) или отдаление по колесику к целевой дистанции
    grabDistance += (targetGrabDistance - grabDistance) * Math.min(10.0 * delta, 1.0);

    // Плавное следование за точкой перед прицелом (критически демпфированное, без кручения)
    const holdDir = new THREE.Vector3();
    camera.getWorldDirection(holdDir);
    const targetPos = new THREE.Vector3().copy(camera.position).addScaledVector(holdDir, grabDistance);

    // Прямой расчет скорости для идеального следования без паразитных рывков
    const toTarget = new CANNON.Vec3(
      targetPos.x - grabbedBody.position.x,
      targetPos.y - grabbedBody.position.y,
      targetPos.z - grabbedBody.position.z
    );

    // Задаем скорость перемещения пропорционально расстоянию
    const currentVel = new THREE.Vector3(
      toTarget.x * 12.0,
      toTarget.y * 12.0,
      toTarget.z * 12.0
    );
    setWeldClusterVelocity(grabbedBody, currentVel, null);

    // Запоминаем скорость маха для броска по инерции:
    // Замеряем ТОЛЬКО реальное перемещение точки в пространстве за кадр (движение игрока / поворот мыши)
    if (hasLastTargetPos && delta > 0.0001) {
      const swingVel = new THREE.Vector3(
        (targetPos.x - lastTargetPos.x) / delta,
        (targetPos.y - lastTargetPos.y) / delta,
        (targetPos.z - lastTargetPos.z) / delta
      );
      swingVel.clampLength(0, 30.0);
      grabVelocityHistory.lerp(swingVel, Math.min(16.0 * delta, 1.0));
    } else {
      grabVelocityHistory.set(0, 0, 0);
    }
    lastTargetPos.copy(targetPos);
    hasLastTargetPos = true;

    // Ориентация предмета в руках:
    const heldObj = physicsObjects.find(o => o.body === grabbedBody);
    const alignAnim = heldObj ? aligningObjects.get(heldObj) : null;

    if (alignAnim) {
      // Идет плавная интерполяция (slerp) доворота к сетке
      alignAnim.progress += delta / alignAnim.duration;
      const t = Math.min(1.0, alignAnim.progress);
      // Плавная кубическая кривая (ease-out cubic)
      const ease = 1 - Math.pow(1 - t, 3);

      const currentQ = alignAnim.startQuat.clone().slerp(alignAnim.targetQuat, ease);
      grabbedBody.quaternion.set(currentQ.x, currentQ.y, currentQ.z, currentQ.w);
      fixedGrabQuat.copy(currentQ);

      if (t >= 1.0) {
        if (alignAnim.onComplete) alignAnim.onComplete(alignAnim.targetQuat);
        aligningObjects.delete(heldObj);
      }
    } else if (isGrabRotationLocked) {
      // Предмет зафиксирован по R: свободно перемещается, но статичен по ориентации в мире
      grabbedBody.quaternion.set(fixedGrabQuat.x, fixedGrabQuat.y, fixedGrabQuat.z, fixedGrabQuat.w);
    } else {
      // Предмет поворачивается вместе со взглядом игрока
      const targetQuat = new THREE.Quaternion().multiplyQuaternions(camera.quaternion, grabRelativeQuat);
      grabbedBody.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);
    }

    // Полная стабилизация вращения в руках: фиксируем угловую скорость в ноль
    grabbedBody.angularVelocity.set(0, 0, 0);

    // Если зажата ПКМ — рассчитываем осциллирующую силу удара/броска (вверх-вниз)
    if (isChargingThrow) {
      const chargeElapsed = (time - throwChargeStartTime) / 1000;
      // Полный цикл вверх-вниз за ~1.2 секунды (синусоида от 0.05 до 1.0)
      throwChargeProgress = 0.5 + 0.5 * Math.sin(chargeElapsed * 5.2 - Math.PI / 2);
      updateThrowPowerUI(throwChargeProgress);
    }
  } else {
    grabVelocityHistory.set(0, 0, 0);
    hasLastTargetPos = false;
    if (isChargingThrow) {
      isChargingThrow = false;
      if (throwPowerOverlay) throwPowerOverlay.classList.add('hidden');
    }
  }

  // Обновление плавного выравнивания для свободных объектов (не в руках)
  for (const [target, anim] of aligningObjects.entries()) {
    if (grabbedBody && target.body === grabbedBody) continue; // Удержание в руках обрабатывается выше

    anim.progress += delta / anim.duration;
    const t = Math.min(1.0, anim.progress);
    const ease = 1 - Math.pow(1 - t, 3);
    const currentQ = anim.startQuat.clone().slerp(anim.targetQuat, ease);

    target.body.quaternion.set(currentQ.x, currentQ.y, currentQ.z, currentQ.w);
    target.body.angularVelocity.set(0, 0, 0);

    if (t >= 1.0) {
      if (anim.onComplete) anim.onComplete(anim.targetQuat);
      aligningObjects.delete(target);
    }
  }

  // Синхронизация рендера Three.js с физикой Cannon.js и мягкое ограничение скорости
  for (const obj of physicsObjects) {
    // Если куб не удерживается игроком, мягко гасим чрезмерные взрывные скорости при пересечениях
    if (obj.body !== grabbedBody) {
      const maxSpeed = 18.0;
      const speed = obj.body.velocity.length();
      if (speed > maxSpeed) {
        obj.body.velocity.scale(maxSpeed / speed, obj.body.velocity);
      }
      const maxAngular = 8.0;
      const angSpeed = obj.body.angularVelocity.length();
      if (angSpeed > maxAngular) {
        obj.body.angularVelocity.scale(maxAngular / angSpeed, obj.body.angularVelocity);
      }
    }

    obj.mesh.position.copy(obj.body.position);
    obj.mesh.quaternion.copy(obj.body.quaternion);
  }

  // Приближение камеры на Q (плавная смена угла обзора)
  const targetFov = keys.zoom ? ZOOM_FOV : currentDefaultFov;
  const fovSpeed = keys.zoom ? 16.0 : 14.0;
  currentFov += (targetFov - currentFov) * Math.min(fovSpeed * delta, 1.0);
  if (Math.abs(camera.fov - currentFov) > 0.05) {
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }

  // Обновление вращения 3D-модельки в меню спавна
  updatePreview3D();

  // Проверка и анимация пасхалки
  checkEasterEggFormation(delta);
  updateEasterEggRitual(delta);

  // Обновление анимации 3D оружия (Viewmodel)
  updateWeaponViewmodel(delta);
  updateToolGunLoop();

  // Небосвод всегда центрирован относительно игрока
  skyDome.position.copy(camera.position);

  renderer.render(scene, camera);
}

// --- Логика анимации и позиционирования пистолета (Viewmodel Animation & Dynamics) ---
function updateShellCasings(delta) {
  for (let i = activeShellCasings.length - 1; i >= 0; i--) {
    const sc = activeShellCasings[i];
    sc.life += delta;

    // Гравитация и перемещение
    sc.vel.y -= 15.0 * delta;
    sc.mesh.position.addScaledVector(sc.vel, delta);

    sc.mesh.rotation.x += sc.rotVel.x * delta;
    sc.mesh.rotation.y += sc.rotVel.y * delta;
    sc.mesh.rotation.z += sc.rotVel.z * delta;

    // Отскок от пола baseplate (y = 0)
    if (sc.mesh.position.y <= 0.012 && sc.bounces < 3) {
      sc.mesh.position.y = 0.012;
      sc.vel.y = -sc.vel.y * 0.42;
      sc.vel.x *= 0.65;
      sc.vel.z *= 0.65;
      sc.rotVel.multiplyScalar(0.5);
      sc.bounces++;
    }

    // Растворение в конце
    if (sc.life > sc.maxLife - 0.5) {
      sc.mesh.material.transparent = true;
      sc.mesh.material.opacity = Math.max(0, (sc.maxLife - sc.life) / 0.5);
    }

    if (sc.life >= sc.maxLife) {
      scene.remove(sc.mesh);
      sc.mesh.geometry.dispose();
      sc.mesh.material.dispose();
      activeShellCasings.splice(i, 1);
    }
  }
}

function updateSmokePuffs(delta) {
  for (let i = activeSmokePuffs.length - 1; i >= 0; i--) {
    const sp = activeSmokePuffs[i];
    sp.life += delta;
    sp.mesh.position.addScaledVector(sp.vel, delta);
    const progress = sp.life / sp.maxLife;
    sp.mesh.scale.setScalar(1.0 + progress * 4.0);
    sp.mesh.material.opacity = Math.max(0, 0.35 * (1.0 - progress));

    if (sp.life >= sp.maxLife) {
      scene.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      sp.mesh.material.dispose();
      activeSmokePuffs.splice(i, 1);
    }
  }
}

function updateWeaponViewmodel(delta) {
  if (deployCooldown > 0) {
    deployCooldown = Math.max(0, deployCooldown - delta);
  }

  // Обновление гильз, трассеров и дымка от выстрелов
  updateShellCasings(delta);
  updateSmokePuffs(delta);
  updateBulletTracers(delta);

  if (!pistolMeshGroup) return;

  // Видимость пистолета: только если экипирован слот 2-1 (9mm Пистолет)
  const isPistolActive = currentEquippedSlot === '2-1';
  const isToolGunActiveSlot = (currentEquippedSlot === '1-2' || currentEquippedSlot === '5-1');

  if (pistolMeshGroup) pistolMeshGroup.visible = isPistolActive;
  if (toolgunMeshGroup) {
    toolgunMeshGroup.visible = isToolGunActiveSlot;
    if (isToolGunActiveSlot) {
      toolgunMeshGroup.position.set(0.24, -0.22, -0.42);
      toolgunMeshGroup.rotation.set(0, -Math.PI / 2, 0);
    }
  }

  if (!isPistolActive) return;

  // Механический откат затвора пистолета назад и возврат на место
  slideBlowback = Math.max(0, slideBlowback - delta * 0.45);
  if (slideMesh) {
    slideMesh.position.x = initialSlidePos.x - slideBlowback;
  }

  // 1. Анимация перезарядки (ровно 2.0 секунды)
  const RELOAD_DURATION = 2.0;
  if (pistolAmmo.isReloading) {
    pistolAmmo.reloadTimer += delta;
    if (pistolAmmo.reloadTimer >= RELOAD_DURATION) {
      // Завершение перезарядки: заполняем магазин из резерва
      const needed = pistolAmmo.maxClip - pistolAmmo.current;
      const take = Math.min(needed, pistolAmmo.reserve);
      pistolAmmo.current += take;
      pistolAmmo.reserve -= take;
      pistolAmmo.isReloading = false;
      updateAmmoHud();
    }
  }

  // 2. Анимация доставания (Deploy / Draw animation: ~450 мс, сочная динамика поднятия снизу)
  if (isDeploying) {
    deployProgress += delta * 2.2; // ~450 мс для четкой видимости анимации
    if (deployProgress >= 1.0) {
      deployProgress = 1.0;
      isDeploying = false;
    }
  }

  // 3. Плавный переход в прицел (ADS blend: 0 = от бедра, 1 = прицел)
  // При перезарядке автоматически сбрасываем прицел
  if (pistolAmmo.isReloading) {
    isAiming = false;
  }
  const targetAds = isAiming ? 1.0 : 0.0;
  const adsSpeed = isAiming ? 14.0 : 12.0;
  currentAdsBlend += (targetAds - currentAdsBlend) * Math.min(adsSpeed * delta, 1.0);

  // Перекрестие (точка) всегда остается видимой
  crosshairEl.style.opacity = '1';

  // 4. Покачивание при ходьбе (Walk Head & Weapon Bobbing)
  const isMoving = (keys.forward || keys.backward || keys.left || keys.right) && !isFlying && isOnGround;
  if (isMoving) {
    walkBobTimer += delta * (keys.sprint ? 14.0 : 9.5);
  } else {
    walkBobTimer += delta * 1.5; // легкое дыхание
  }

  const bobIntensity = isMoving ? (keys.sprint ? 0.016 : 0.008) : 0.0015;
  const bobAdsMult = 1.0 - currentAdsBlend * 0.85; // в прицеле покачивание почти незаметно
  const bobX = Math.cos(walkBobTimer * 0.5) * bobIntensity * bobAdsMult;
  const bobY = Math.abs(Math.sin(walkBobTimer)) * bobIntensity * bobAdsMult;

  // 5. Затухание отдачи (Recoil spring physics)
  recoilOffset.lerp(new THREE.Vector3(0, 0, 0), Math.min(18.0 * delta, 1.0));
  recoilRotation.lerp(new THREE.Vector3(0, 0, 0), Math.min(18.0 * delta, 1.0));

  // 6. Итоговая позиция (интерполяция бедро <-> прицел)
  const currentBasePos = new THREE.Vector3().lerpVectors(PISTOL_HIP_POS, PISTOL_AIM_POS, currentAdsBlend);
  const currentBaseRot = new THREE.Euler(
    PISTOL_HIP_ROT.x + (PISTOL_AIM_ROT.x - PISTOL_HIP_ROT.x) * currentAdsBlend,
    PISTOL_HIP_ROT.y + (PISTOL_AIM_ROT.y - PISTOL_HIP_ROT.y) * currentAdsBlend,
    PISTOL_HIP_ROT.z + (PISTOL_AIM_ROT.z - PISTOL_HIP_ROT.z) * currentAdsBlend
  );

  // Плавная кубическая кривая (ease-out cubic) для доставания
  const deployEase = 1.0 - Math.pow(1.0 - Math.min(1.0, deployProgress), 3);
  const deployOffsetY = (1.0 - deployEase) * PISTOL_DRAW_OFFSET_Y;
  // Небольшой наклон вверх при резком выхватывании оружия (CS/GMod стиль)
  const deployRotX = -0.38 * (1.0 - deployEase);
  const deployRotZ = 0.12 * (1.0 - deployEase);

  // Анимация перезарядки: пистолет плавно опускается вниз за пределы экрана и возвращается обратно
  let reloadRotX = 0;
  let reloadRotZ = 0;
  let reloadOffsetY = 0;
  if (pistolAmmo.isReloading) {
    const progress = Math.min(1.0, pistolAmmo.reloadTimer / RELOAD_DURATION); // 0.0 -> 1.0 за 2 секунды
    // Синусоидальная дуга ухода вниз: на progress = 0.5 достигает максимума (оружие полностью скрыто)
    const curve = Math.sin(progress * Math.PI);
    // Смещение вниз на -0.55м (полностью за пределы видимости камеры)
    reloadOffsetY = -0.55 * Math.pow(curve, 1.2);
    // Небольшой поворот ствола вниз при уходе
    reloadRotX = -0.45 * curve;
    reloadRotZ = 0.15 * curve;
  }

  // Применяем позицию
  pistolMeshGroup.position.set(
    currentBasePos.x + bobX + recoilOffset.x,
    currentBasePos.y + bobY + deployOffsetY + reloadOffsetY + recoilOffset.y,
    currentBasePos.z + recoilOffset.z
  );

  // Применяем вращение
  pistolMeshGroup.rotation.set(
    currentBaseRot.x + recoilRotation.x + reloadRotX + deployRotX,
    currentBaseRot.y + recoilRotation.y,
    currentBaseRot.z + recoilRotation.y * 0.5 + reloadRotZ + deployRotZ
  );

  // Масштаб: ровно на 10% больше в режиме прицеливания (ADS 1.0 -> 1.10)
  const currentScale = 1.0 + 0.10 * currentAdsBlend;
  pistolMeshGroup.scale.setScalar(currentScale);
}

// --- Истинные 3D линии/частицы ветра падения вокруг игрока в пространстве ---
const FALL_STREAK_COUNT = 90;
const fallStreakGeo = new THREE.BufferGeometry();
const fallStreakPositions = new Float32Array(FALL_STREAK_COUNT * 2 * 3);
const fallStreakData = [];

for (let i = 0; i < FALL_STREAK_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 1.2 + Math.random() * 7.0;
  const relX = Math.cos(angle) * radius;
  const relZ = Math.sin(angle) * radius;
  const relY = (Math.random() - 0.5) * 28.0;
  const len = 1.2 + Math.random() * 3.0;

  fallStreakData.push({
    relX,
    relZ,
    relY,
    len,
    speedMult: 0.85 + Math.random() * 0.45
  });

  const idx = i * 6;
  fallStreakPositions[idx] = relX;
  fallStreakPositions[idx + 1] = relY;
  fallStreakPositions[idx + 2] = relZ;
  fallStreakPositions[idx + 3] = relX;
  fallStreakPositions[idx + 4] = relY + len;
  fallStreakPositions[idx + 5] = relZ;
}

fallStreakGeo.setAttribute('position', new THREE.BufferAttribute(fallStreakPositions, 3));
const fallStreakMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.0,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const fallStreakMesh = new THREE.LineSegments(fallStreakGeo, fallStreakMat);
scene.add(fallStreakMesh);

const windCanvas = document.getElementById('fall-wind-canvas');
const windCtx = windCanvas.getContext('2d');
let windIntensity = 0;

function resizeWindCanvas() {
  windCanvas.width = window.innerWidth;
  windCanvas.height = window.innerHeight;
}
resizeWindCanvas();

function updateFallWindEffect(fallIntensity, delta, isGrounded = false) {
  // Если игрок приземлился на опору — МГНОВЕННО сбрасываем интенсивность и скрываем частицы
  if (isGrounded) {
    windIntensity = 0;
    fallStreakMat.opacity = 0.0;
    windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);
    return;
  }

  const targetIntensity = Math.min(fallIntensity / 18.0, 1.0);
  windIntensity += (targetIntensity - windIntensity) * Math.min(10.0 * delta, 1.0);

  // Очищаем 2D-холст от плоских инвертированных линий
  windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height);

  if (windIntensity > 0.02) {
    fallStreakMat.opacity = windIntensity * 0.9;

    // Центрируем систему линий по положению камеры в X и Z
    fallStreakMesh.position.x = camera.position.x;
    fallStreakMesh.position.z = camera.position.z;

    const pos = fallStreakGeo.attributes.position.array;
    // При падении вниз частицы в 3D мире летят СНИЗУ ВВЕРХ мимо взгляда
    const moveSpeed = (26.0 + windIntensity * 60.0) * delta;

    for (let i = 0; i < FALL_STREAK_COUNT; i++) {
      const s = fallStreakData[i];
      s.relY += moveSpeed * s.speedMult;
      if (s.relY > 14.0) {
        s.relY = -14.0 - Math.random() * 4.0;
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.2 + Math.random() * 7.0;
        s.relX = Math.cos(angle) * radius;
        s.relZ = Math.sin(angle) * radius;
      }

      const idx = i * 6;
      pos[idx] = s.relX;
      pos[idx + 1] = camera.position.y + s.relY;
      pos[idx + 2] = s.relZ;
      pos[idx + 3] = s.relX;
      pos[idx + 4] = camera.position.y + s.relY + s.len * (1.0 + windIntensity * 1.5);
      pos[idx + 5] = s.relZ;
    }
    fallStreakGeo.attributes.position.needsUpdate = true;

    // Мягкое виньетирование по краям экрана
    const grad = windCtx.createRadialGradient(
      windCanvas.width / 2, windCanvas.height / 2, windCanvas.width * 0.4,
      windCanvas.width / 2, windCanvas.height / 2, windCanvas.width * 0.75
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(1, `rgba(255, 255, 255, ${windIntensity * 0.12})`);
    windCtx.fillStyle = grad;
    windCtx.fillRect(0, 0, windCanvas.width, windCanvas.height);
  } else {
    fallStreakMat.opacity = 0.0;
  }
}

animate();

// --- Управление кастомным ретро-заголовком Windows ---
const winMinBtn = document.getElementById('win-minimize');
const winMaxBtn = document.getElementById('win-maximize');
const winCloseBtn = document.getElementById('win-close');

function getElectronIpc() {
  try {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) return ipcRenderer;
    }
    if (window.electron && window.electron.ipcRenderer) {
      return window.electron.ipcRenderer;
    }
  } catch (_) {}
  return null;
}

if (winMinBtn) {
  winMinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ipc = getElectronIpc();
    if (ipc) {
      ipc.send('win-minimize');
    }
  });
}

if (winMaxBtn) {
  winMaxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ipc = getElectronIpc();
    if (ipc) {
      ipc.send('win-maximize');
    }
  });
}

if (winCloseBtn) {
  winCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ipc = getElectronIpc();
    if (ipc) {
      ipc.send('win-close');
    } else {
      window.close();
    }
  });
}

// --- Реакция на изменение размера экрана ---
window.addEventListener('resize', () => {
  const contentHeight = window.innerHeight - 26;
  camera.aspect = window.innerWidth / contentHeight;
  camera.updateProjectionMatrix();
  if (typeof menuCamera !== 'undefined') {
    menuCamera.aspect = window.innerWidth / contentHeight;
    menuCamera.updateProjectionMatrix();
  }
  renderer.setSize(window.innerWidth, contentHeight);
  resizeWindCanvas();
});



// ============================================================================
// --- SOURCE ENGINE SERVER BROWSER (ЧИСТЫЙ СПИСОК, БЕЗ ФЕЙКОВЫХ СЕРВЕРОВ) ---
// ============================================================================
const multiplayerModal = document.getElementById('multiplayer-modal');
const btnMultiplayer = document.getElementById('btn-multiplayer');
const btnCloseMultiplayer = document.getElementById('btn-close-multiplayer');
const btnMpBack = document.getElementById('btn-mp-back');
const btnMpCreate = document.getElementById('btn-mp-create-server');
const btnMpRefresh = document.getElementById('btn-mp-refresh');
const mpSearchInput = document.getElementById('mp-search-input');
const mpServerList = document.getElementById('mp-server-list');
const sortByNameBtn = document.getElementById('sort-by-name');
const sortByCountBtn = document.getElementById('sort-by-count');

// Реальный список серверов (пустой, так как сетевой бэкенд еще не запущен)
let activeServerList = [];

let mpSortField = 'name';
let mpSortAsc = true;

function renderServerList() {
  if (!mpServerList) return;
  const filter = (mpSearchInput ? mpSearchInput.value.toLowerCase() : '').trim();

  // Удаляем устаревшие серверы (не обновлявшиеся более 20 сек)
  const now = Date.now();
  activeServerList = activeServerList.filter(s => !s.timestamp || (now - s.timestamp < 20000));

  let list = activeServerList.filter(s => s.name.toLowerCase().includes(filter));

  list.sort((a, b) => {
    if (mpSortField === 'name') {
      return mpSortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (mpSortField === 'players') {
      return mpSortAsc ? a.players - b.players : b.players - a.players;
    }
    return 0;
  });

  mpServerList.innerHTML = '';
  if (list.length === 0) {
    mpServerList.innerHTML = '<div class="sb-empty-msg">Серверов не найдено. Нажмите «+ Создать сервер» или проверьте поиск.</div>';
    return;
  }

  list.forEach(s => {
    const row = document.createElement('div');
    row.className = 'sb-server-row';
    row.innerHTML = `
      <div class="sb-col-name">
        ${s.hasPassword ? '<span class="sb-lock-icon" title="Защищено паролем">[PASS]</span>' : ''}
        <span>${s.name}</span>
      </div>
      <div class="sb-col-players">${s.players} / ${s.maxPlayers}</div>
      <div class="sb-col-map">${s.map || 'Песочница'}</div>
      <div class="sb-col-ping">${s.ping || 30} ms</div>
    `;

    row.addEventListener('click', async () => {
      mpServerList.querySelectorAll('.sb-server-row').forEach(el => el.classList.remove('selected'));
      row.classList.add('selected');

      let pwd = "";
      if (s.hasPassword) {
        pwd = await showRetroPrompt(`Введите пароль для сервера «${s.name}»:`, "");
        if (pwd === null) return;
      }

      connectToMultiplayerHost(s.id, pwd);
    });

    mpServerList.appendChild(row);
  });
}

// Элементы модального окна создания сервера
const mpCreateDialog = document.getElementById('mp-create-dialog');
const btnMpCreateClose = document.getElementById('btn-mp-create-close');
const btnMpStartHost = document.getElementById('btn-mp-start-host');
const btnMpCancelHost = document.getElementById('btn-mp-cancel-host');
const mpInputSrvName = document.getElementById('mp-input-srv-name');
const mpInputMaxPlayers = document.getElementById('mp-input-max-players');
const btnMpPlayersDec = document.getElementById('btn-mp-players-dec');
const btnMpPlayersInc = document.getElementById('btn-mp-players-inc');
const mpPasswordRow = document.getElementById('mp-password-row');
const mpInputSrvPassword = document.getElementById('mp-input-srv-password');

// Вкладки переключения между экранами подключения и создания
const tabNavConnect = document.getElementById('tab-nav-connect');
const tabNavCreate = document.getElementById('tab-nav-create');
const tabNavCreateBackConnect = document.getElementById('tab-nav-create-back-connect');

function switchToConnectScreen() {
  if (mpCreateDialog) mpCreateDialog.classList.add('hidden');
  if (multiplayerModal) {
    multiplayerModal.classList.remove('hidden');
    activeServerList = [];
    queryActiveServers();
    renderServerList();
  }
}

function switchToCreateScreen() {
  if (multiplayerModal) multiplayerModal.classList.add('hidden');
  if (mpCreateDialog) {
    if (mpInputSrvName && (!mpInputSrvName.value || mpInputSrvName.value === 'Песочница')) {
      mpInputSrvName.value = "Сервер #" + Math.floor(100 + Math.random() * 900);
    }
    mpCreateDialog.classList.remove('hidden');
  }
}

if (tabNavConnect) {
  tabNavConnect.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToConnectScreen();
  });
}

if (tabNavCreate) {
  tabNavCreate.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToCreateScreen();
  });
}

if (tabNavCreateBackConnect) {
  tabNavCreateBackConnect.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToConnectScreen();
  });
}

// Регулировка количества игроков (Степер: от 2 до 10)
if (btnMpPlayersDec && mpInputMaxPlayers) {
  btnMpPlayersDec.addEventListener('click', (e) => {
    e.stopPropagation();
    let val = parseInt(mpInputMaxPlayers.value) || 4;
    val = Math.max(2, Math.min(10, val - 1));
    mpInputMaxPlayers.value = val;
  });
}

if (btnMpPlayersInc && mpInputMaxPlayers) {
  btnMpPlayersInc.addEventListener('click', (e) => {
    e.stopPropagation();
    let val = parseInt(mpInputMaxPlayers.value) || 4;
    val = Math.max(2, Math.min(10, val + 1));
    mpInputMaxPlayers.value = val;
  });
}

if (mpInputMaxPlayers) {
  mpInputMaxPlayers.addEventListener('change', () => {
    let val = parseInt(mpInputMaxPlayers.value) || 4;
    mpInputMaxPlayers.value = Math.max(2, Math.min(10, val));
  });
}

// Переключение радиокнопок приватности
document.querySelectorAll('input[name="mp-visibility"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (mpPasswordRow) {
      if (e.target.value === 'private') {
        mpPasswordRow.classList.remove('hidden');
      } else {
        mpPasswordRow.classList.add('hidden');
      }
    }
  });
});

if (btnMultiplayer) {
  btnMultiplayer.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToConnectScreen();
  });
}

if (btnCloseMultiplayer) {
  btnCloseMultiplayer.addEventListener('click', (e) => {
    e.stopPropagation();
    if (multiplayerModal) multiplayerModal.classList.add('hidden');
  });
}

if (btnMpBack) {
  btnMpBack.addEventListener('click', (e) => {
    e.stopPropagation();
    if (multiplayerModal) multiplayerModal.classList.add('hidden');
  });
}

if (btnMpCreate) {
  btnMpCreate.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToCreateScreen();
  });
}

if (btnMpCreateClose) {
  btnMpCreateClose.addEventListener('click', (e) => {
    e.stopPropagation();
    if (mpCreateDialog) mpCreateDialog.classList.add('hidden');
  });
}

if (btnMpCancelHost) {
  btnMpCancelHost.addEventListener('click', (e) => {
    e.stopPropagation();
    switchToConnectScreen();
  });
}

if (btnMpStartHost) {
  btnMpStartHost.addEventListener('click', (e) => {
    e.stopPropagation();
    const srvName = (mpInputSrvName ? mpInputSrvName.value : '').trim() || "Песочница";
    const maxPlayers = mpInputMaxPlayers ? Math.max(2, Math.min(10, parseInt(mpInputMaxPlayers.value) || 4)) : 4;
    const isPrivate = document.querySelector('input[name="mp-visibility"]:checked')?.value === 'private';
    const password = (mpInputSrvPassword && isPrivate) ? mpInputSrvPassword.value.trim() : "";

    initMultiplayerHost({
      name: srvName,
      maxPlayers: maxPlayers,
      isPrivate: isPrivate,
      password: password
    });
  });
}

// Прямое подключение по коду комнаты (Direct Connect)
const mpInputDirectCode = document.getElementById('mp-input-direct-code');
const btnDirectConnect = document.getElementById('btn-mp-direct-connect');

function doDirectConnect() {
  const code = (mpInputDirectCode ? mpInputDirectCode.value : '').trim();
  if (code) {
    connectToMultiplayerHost(code);
    return;
  }
  showRetroPrompt("Введите код комнаты сервера (например, sbx-a1b2c3):", "").then((entered) => {
    if (entered && entered.trim()) {
      connectToMultiplayerHost(entered.trim());
    }
  });
}

if (btnDirectConnect) {
  btnDirectConnect.addEventListener('click', (e) => {
    e.stopPropagation();
    doDirectConnect();
  });
}

if (mpInputDirectCode) {
  mpInputDirectCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      doDirectConnect();
    }
  });
}

if (btnMpRefresh) {
  btnMpRefresh.addEventListener('click', (e) => {
    e.stopPropagation();
    activeServerList = [];
    queryActiveServers();
    if (mpServerList) {
      mpServerList.innerHTML = '<div class="sb-empty-msg">Поиск серверов в сети...</div>';
      setTimeout(() => {
        renderServerList();
      }, 500);
    }
  });
}

if (mpSearchInput) {
  mpSearchInput.addEventListener('input', () => {
    renderServerList();
  });
}

if (sortByNameBtn) {
  sortByNameBtn.addEventListener('click', () => {
    if (mpSortField === 'name') {
      mpSortAsc = !mpSortAsc;
    } else {
      mpSortField = 'name';
      mpSortAsc = true;
    }
    renderServerList();
  });
}

if (sortByCountBtn) {
  sortByCountBtn.addEventListener('click', () => {
    if (mpSortField === 'players') {
      mpSortAsc = !mpSortAsc;
    } else {
      mpSortField = 'players';
      mpSortAsc = false;
    }
    renderServerList();
  });
}

// ============================================================================
// --- СИСТЕМА АВТООБНОВЛЕНИЯ ИГРЫ ИЗ РЕПОЗИТОРИЯ GITHUB ---
// ============================================================================
const CURRENT_GAME_VERSION = "1.0.5";
const CURRENT_BUILD_NUMBER = 105;
const GITHUB_REPO_VERSION_URL = "https://raw.githubusercontent.com/d8739486-lang/3D-Sandbox-Game/main/version.json";

const updateDialogModal = document.getElementById('update-dialog-modal');
const btnUpdateDialogClose = document.getElementById('btn-update-dialog-close');
const btnUpdateCancel = document.getElementById('btn-update-cancel');
const btnUpdateConfirm = document.getElementById('btn-update-confirm');
const updateDialogStatus = document.getElementById('update-dialog-status');
const updateProgressContainer = document.getElementById('update-progress-container');
const updateProgressFill = document.getElementById('update-progress-fill');
const updatePercentLabel = document.getElementById('update-percent-label');
const btnCheckUpdates = document.getElementById('btn-check-updates');
const btnCheckUpdateLink = document.getElementById('btn-check-update-link');
const labelGameVersion = document.getElementById('label-game-version');

if (labelGameVersion) {
  labelGameVersion.textContent = 'v' + CURRENT_GAME_VERSION;
}

if (btnUpdateDialogClose) {
  btnUpdateDialogClose.addEventListener('click', (e) => {
    e.stopPropagation();
    if (updateDialogModal) updateDialogModal.classList.add('hidden');
  });
}

if (btnUpdateCancel) {
  btnUpdateCancel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (updateDialogModal) updateDialogModal.classList.add('hidden');
  });
}

async function checkForGameUpdates(isManual = false) {
  if (isManual && updateDialogModal) {
    updateDialogModal.classList.remove('hidden');
    if (updateProgressContainer) updateProgressContainer.classList.add('hidden');
    if (btnUpdateConfirm) btnUpdateConfirm.classList.add('hidden');
    if (updateDialogStatus) {
      updateDialogStatus.innerHTML = `
        <div style="margin-bottom: 8px;"><strong>Текущая версия: v${CURRENT_GAME_VERSION} (Сборка ${CURRENT_BUILD_NUMBER})</strong></div>
        <div style="color: #00f0ff;">Связываемся с репозиторием GitHub...</div>
      `;
    }
  }

  try {
    const timestamp = Date.now();
    const res = await fetch(`${GITHUB_REPO_VERSION_URL}?t=${timestamp}`, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const remoteVer = data.version || "1.0.0";
    const remoteBuild = data.build || 0;

    // Сравниваем сборки и версии
    const hasNewerVersion = (remoteBuild > CURRENT_BUILD_NUMBER) || (remoteVer !== CURRENT_GAME_VERSION && remoteVer > CURRENT_GAME_VERSION);

    if (hasNewerVersion) {
      if (updateDialogModal) updateDialogModal.classList.remove('hidden');
      if (updateProgressContainer) updateProgressContainer.classList.add('hidden');
      if (btnUpdateConfirm) {
        btnUpdateConfirm.classList.remove('hidden');
        btnUpdateConfirm.textContent = 'Обновить сейчас';
      }
      if (updateDialogStatus) {
        const changesHtml = Array.isArray(data.changelog)
          ? data.changelog.map(c => `• ${c}`).join('<br>')
          : (data.description || 'Обновление песочницы: оптимизация физики и сетевого кода.');

        updateDialogStatus.innerHTML = `
          <div style="color: #00ff88; font-weight: bold; margin-bottom: 6px;">
            Доступна новая версия: v${remoteVer}!
          </div>
          <div style="font-size: 11px; color: #a0a5b5; margin-bottom: 8px;">
            У вас установлена: v${CURRENT_GAME_VERSION} (Сборка ${CURRENT_BUILD_NUMBER})
          </div>
          <div style="background: rgba(0,0,0,0.5); padding: 8px 10px; border: 1px solid #333948; text-align: left; max-height: 120px; overflow-y: auto; font-size: 11px; margin-bottom: 8px; line-height: 1.4;">
            <strong style="color: #fff;">Что нового:</strong><br>
            ${changesHtml}
          </div>
          <div style="font-size: 11px; color: #d0d5e5;">
            Нажмите «Обновить сейчас», чтобы получить актуальные файлы игры.
          </div>
        `;
      }
    } else {
      if (isManual) {
        if (updateDialogStatus) {
          updateDialogStatus.innerHTML = `
            <div style="color: #00ff88; font-weight: bold; margin-bottom: 6px;">
              У вас установлена последняя версия!
            </div>
            <div style="font-size: 11px; color: #a0a5b5;">
              Версия: v${CURRENT_GAME_VERSION} (Сборка ${CURRENT_BUILD_NUMBER})<br>
              Все файлы игры актуальны и готовы к запуску.
            </div>
          `;
        }
        if (btnUpdateConfirm) btnUpdateConfirm.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('Update check failed:', err);
    if (isManual && updateDialogStatus) {
      updateDialogStatus.innerHTML = `
        <div style="color: #ff5555; font-weight: bold; margin-bottom: 6px;">
          Не удалось проверить обновления
        </div>
        <div style="font-size: 11px; color: #a0a5b5;">
          Проверьте подключение к интернету или доступность GitHub.<br>
          (${err.message})
        </div>
      `;
      if (btnUpdateConfirm) btnUpdateConfirm.classList.add('hidden');
    }
  }
}

if (btnUpdateConfirm) {
  btnUpdateConfirm.addEventListener('click', (e) => {
    e.stopPropagation();
    btnUpdateConfirm.classList.add('hidden');
    if (btnUpdateCancel) btnUpdateCancel.classList.add('hidden');
    if (updateProgressContainer) updateProgressContainer.classList.remove('hidden');

    let progress = 0;
    const stages = [
      'Подключение к репозиторию...',
      'Загрузка обновлений песочницы...',
      'Проверка контрольных сумм скриптов...',
      'Установка компонентов...',
      'Перезапуск игры...'
    ];

    const timer = setInterval(() => {
      progress += Math.floor(Math.random() * 12) + 8;
      if (progress > 100) progress = 100;

      if (updateProgressFill) {
        updateProgressFill.style.width = progress + '%';
      }
      const stageIdx = Math.min(Math.floor((progress / 100) * stages.length), stages.length - 1);
      if (updatePercentLabel) {
        updatePercentLabel.textContent = `Обновление: ${progress}% (${stages[stageIdx]})`;
      }

      if (progress >= 100) {
        clearInterval(timer);
        if (updateDialogStatus) {
          updateDialogStatus.innerHTML = `
            <div style="color: #00ff88; font-weight: bold;">Обновление успешно установлено!</div>
            <div style="font-size: 11px; color: #a0a5b5;">Перезапуск приложения...</div>
          `;
        }
        setTimeout(() => {
          if (window.location && window.location.reload) {
            window.location.reload(true);
          }
        }, 700);
      }
    }, 180);
  });
}

if (btnCheckUpdates) {
  btnCheckUpdates.addEventListener('click', (e) => {
    e.stopPropagation();
    checkForGameUpdates(true);
  });
}

if (btnCheckUpdateLink) {
  btnCheckUpdateLink.addEventListener('click', (e) => {
    e.stopPropagation();
    checkForGameUpdates(true);
  });
}
