import './style.css';
import * as THREE from 'three';
import {
  DEFAULT_ENVIRONMENT,
  STATION_LAYOUT,
  STORAGE_KEY,
  WORLD,
  type BiomeDefinition,
  type EnvironmentState,
} from './config';
import { clamp } from './core/utils';
import { GraphBoard } from './game/GraphBoard';
import { TelemetryInspector, type WandReading } from './game/TelemetryInspector';
import { TimeController, type TimeMode } from './game/TimeController';
import { VectorOverlay } from './game/VectorOverlay';
import { Input } from './player/Input';
import { PlayerController } from './player/PlayerController';
import { Viewmodel, type ToolId } from './player/Viewmodel';
import type { StationTab } from './stations/BaseExperiment';
import { StationRegistry, type Station } from './stations/registry';
import { GameUI, type BadgePayload, type GameUICallbacks, type MapStation } from './ui/GameUI';
import { World } from './world/World';
import { sound } from './audio/SoundEngine';
import { VoxelBuilder } from './game/VoxelBuilder';
import { BLOCK_PALETTE_ORDER, type VoxelBlockType } from './world/textures';

// ---------------------------------------------------------------------------
// Renderer and scene
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The sandbox mount point is missing.');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.domElement.className = 'game-canvas';
renderer.domElement.setAttribute('aria-label', 'The Grand Physics Sandbox first-person world');
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 900);
scene.add(camera);

const env: EnvironmentState = { ...DEFAULT_ENVIRONMENT };
const world = new World(scene);
world.addCollider(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(5.4, 2.4, 5.4));

const registry = new StationRegistry(scene, env);
const input = new Input(renderer.domElement);
const player = new PlayerController(camera, input);
player.setColliders(world.colliders);
player.teleport(world.getSpawnPosition(), 0);
const viewmodel = new Viewmodel(camera);

const time = new TimeController();
const vectors = new VectorOverlay();
const telemetry = new TelemetryInspector(scene, camera);
const graphBoard = new GraphBoard(scene);
const voxelBuilder = new VoxelBuilder(scene, camera);
voxelBuilder.setCollidersRef(world.colliders);
voxelBuilder.setOnBlockChanged(() => {
  ui.setPlacedBlocksCount(voxelBuilder.getAllPlacedBlocks().length);
});
player.setSlimeChecker((pos) => voxelBuilder.isStandingOnSlime(pos));

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

interface SaveData {
  version: number;
  badges: Record<string, number>;
}

interface OrbitRig {
  station: Station;
  theta: number;
  radius: number;
  minRadius: number;
  maxRadius: number;
  height: number;
  targetHeight: number;
  targetX: number;
  blend: number;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  target: THREE.Vector3;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

function readSave(): SaveData {
  const empty: SaveData = { version: 1, badges: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SaveData> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.badges || typeof parsed.badges !== 'object') return empty;
    const badges: Record<string, number> = {};
    for (const [id, when] of Object.entries(parsed.badges)) {
      if (typeof when === 'number' && Number.isFinite(when)) badges[id] = when;
    }
    return { version: 1, badges };
  } catch {
    return empty;
  }
}

function writeSave(badges: Record<string, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, badges } satisfies SaveData));
  } catch {
    // Private-mode storage is optional; badges still live for this session.
  }
}

const save = readSave();
registry.loadBadges(save.badges);

// ---------------------------------------------------------------------------
// UI and mutable session state
// ---------------------------------------------------------------------------

let started = false;
let focusedStation: Station | null = null;
let orbit: OrbitRig | null = null;
let activeTool: ToolId = 'wand';
let gogglesOn = false;
let graphVisible = false;
let wandActive = false;
let wandReading: WandReading | null = null;
let lightTimer = 0;
let welcomeShown = false;
let lastZoneKey = '';
let lastSeenBiome: string | null = null;
let pausedByOverlay = false;
let overlayResumeMode: Exclude<TimeMode, 'paused' | 'rewind'> = 'flow';

function modalOpen(): boolean {
  return ui.isMapOpen || ui.isBookOpen || ui.isHelpOpen || ui.isBadgeOpen || ui.isInventoryOpen || ui.isPioneersOpen;
}

const ui = new GameUI(makeCallbacks(), app);
ui.configureStations(registry.stations.map(toMapStation));
ui.setEnvironment(env);
ui.setToolState({ goggles: gogglesOn, graph: graphVisible });
ui.setTimeStatus(time.getStatus());
ui.setTimeCardVisible(false);
ui.setPausePrompt(false);
ui.setIntroProgress(registry.getProgress().solved, registry.getProgress().total);

function toMapStation(station: Station): MapStation {
  return {
    id: station.id,
    number: station.experiment.meta.number,
    shortTitle: station.experiment.meta.shortTitle,
    biomeId: station.biome.id,
    accent: station.accent,
    x: station.worldPosition.x,
    z: station.worldPosition.z,
    solved: station.solved,
  };
}

let blockPaletteIndex = 0;
function handleBlockSelect(type: VoxelBlockType): void {
  voxelBuilder.setSelectedBlockType(type);
  viewmodel.setHeldBlock(type);
  ui.setActiveVoxelBlock(type);
  blockPaletteIndex = BLOCK_PALETTE_ORDER.indexOf(type);
}

function toggleDayNight(): void {
  const current = world.getTimeOfDay();
  const isDay = current >= 6 && current < 18;
  const target = isDay ? 0 : 12;
  world.setTimeOfDay(target);
  ui.setTimeOfDay(target);
  sound.playClick();
  if (isDay) {
    ui.toast('Night lighting engaged', 'Moonlight and luminous biomes. Press N or use the HUD chip to return to day.', '#7eb9ff', '◐', 3200);
  } else {
    ui.toast('Daylight restored', 'Full-spectrum sun across every biome. Press N to return to night.', '#ffe27a', '◑', 3200);
  }
}

function makeCallbacks(): GameUICallbacks {
  return {
    onStart: beginExpedition,
    onResume: resumeExploring,
    onTabChange: handleTabChange,
    onObserve: startObservation,
    onArm: armChallenge,
    onPrimary: usePrimaryAction,
    onRestart: restartApparatus,
    onParamChange: changeParam,
    onCloseStation: closeFocus,
    onTravel: travelToStation,
    onTravelHub: travelToHub,
    onMapClose: requestControl,
    onEnvironmentChange: applyEnvironment,
    onEnvironmentClose: requestControl,
    onHelpClose: requestControl,
    onTimeTogglePause: togglePause,
    onTimeCycleSlow: cycleSlow,
    onTimeStep: stepFrame,
    onTimeRewind: toggleRewind,
    onToolSelect: selectTool,
    onBlockSelect: handleBlockSelect,
    onGraphToggle: toggleGraphFromKey,
    onOpenBook: openBook,
    onOpenMap: openMap,
    onOpenHelp: openHelp,
    onBadgeContinue: resumeAfterBadge,
    onSetTimeOfDay: (h: number) => {
      world.setTimeOfDay(h);
      ui.setTimeOfDay(h);
    },
    onToggleDayCycle: (active: boolean) => {
      world.setDayCycleActive(active);
      ui.setDayCycleActive(active);
    },
    onToggleDayNight: toggleDayNight,
    onClearBlocks: () => {
      voxelBuilder.clearAll();
      ui.setPlacedBlocksCount(0);
    },
    onInventoryClose: requestControl,
    onToggleBlenderModel: () => {
      const next = !world.isBlenderModelVisible();
      world.setBlenderModelVisible(next);
      ui.setBlenderModelActive(next);
      ui.toast(
        next ? 'Blender 5.2 World Active' : 'Blender Model Hidden (Voxel Mode)',
        next ? 'Full high-fidelity models, armillary & memorials enabled.' : 'Switched to lightweight voxel sandbox.',
        '#f4cf86',
        '🎨'
      );
    },
    onOpenPioneers: () => {
      input.exitPointerLock();
      ui.openPioneers();
    },
    onTravelCoordinates: (x: number, z: number) => {
      player.teleport(new THREE.Vector3(x, 1.68, z), 0);
      viewmodel.triggerSwing();
      sound.playDiscoveryJingle();
    },
  };
}

// ---------------------------------------------------------------------------
// Focus lifecycle and camera rig
// ---------------------------------------------------------------------------

function focusStation(station: Station, tab: StationTab = 'observe'): void {
  if (focusedStation === station && ui.isStationOpen) return;
  if (focusedStation) {
    // Travel-between-stations is handled by closing the old panel first; this
    // guard keeps direct calls from ever stacking two live sessions.
    ui.closeStation();
  }

  focusedStation = station;
  station.experiment.setFocused(true);
  player.enabled = false;
  viewmodel.setVisible(false);
  input.autoLock = false;
  input.exitPointerLock();
  input.consumeMouseDelta();
  ui.setPausePrompt(false);
  ui.setWandReading(null);
  ui.setInteract(null);

  time.beginSession(station.experiment, env);
  orbit = makeOrbitRig(station);
  vectors.setStationRoot(station.experiment.root);
  vectors.setEnabled(gogglesOn);
  ui.openStation(station, tab);
  ui.setTimeCardVisible(true);
  ui.setTimeStatus(time.getStatus());
  refreshStationLive();

  if (station.solved) {
    ui.toast(
      'Badge already claimed',
      `${station.experiment.meta.shortTitle} remains yours to replay.`,
      station.accent,
      station.experiment.meta.badgeGlyph,
      3400,
    );
  }
}

function makeOrbitRig(station: Station): OrbitRig {
  const experiment = station.experiment;
  const layout = STATION_LAYOUT[station.id] ?? { focusDistance: 12, focusHeight: 6, offset: [0, 0] as [number, number] };
  const rig = experiment.getCameraRig();
  const radius = (rig.distance ?? layout.focusDistance) * 1.06;
  const height = rig.height ?? layout.focusHeight;
  const targetHeight = rig.targetHeight ?? Math.max(1.2, height * 0.45);
  const targetX = 1.15 + radius * 0.05;
  return {
    station,
    theta: chooseOrbitTheta(station, radius, height, targetX, targetHeight),
    radius,
    minRadius: Math.max(5, radius * 0.55),
    maxRadius: Math.max(radius * 1.6, radius + 8),
    height,
    targetHeight,
    targetX,
    blend: 0,
    startPosition: camera.position.clone(),
    startQuaternion: camera.quaternion.clone(),
    target: new THREE.Vector3(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
  };
}

// Screen-space framing is chosen once when a station is opened. Bias toward
// the authored front view, but step around any mesa, crystal or pylon that
// would sit between the camera and the apparatus.
const ORBIT_THETAS = [0.06, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3];
const orbitRaycaster = new THREE.Raycaster();
const orbitCam = new THREE.Vector3();
const orbitTargetPoint = new THREE.Vector3();
const orbitSample = new THREE.Vector3();
const orbitDirection = new THREE.Vector3();

function isSolidHit(hit: THREE.Intersection): boolean {
  const mesh = hit.object as THREE.Mesh;
  if (!(mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => Boolean(material) && !material.transparent && material.opacity > 0.5);
}

function orbitClearSamples(station: Station, radius: number, height: number, targetX: number, targetHeight: number, theta: number): number {
  const root = station.experiment.root;
  orbitCam.set(targetX + Math.sin(theta) * radius, height, Math.cos(theta) * radius);
  root.localToWorld(orbitCam);
  let clear = 0;
  for (const offsetX of [-1.2, 0, 1.2]) {
    orbitTargetPoint.set(targetX + offsetX, targetHeight, 0);
    root.localToWorld(orbitTargetPoint);
    orbitDirection.copy(orbitTargetPoint).sub(orbitCam);
    const distance = orbitDirection.length();
    if (distance < 0.001) {
      clear++;
      continue;
    }
    orbitDirection.divideScalar(distance);
    orbitRaycaster.set(orbitCam, orbitDirection);
    orbitRaycaster.camera = camera;
    orbitRaycaster.near = 0.05;
    orbitRaycaster.far = Math.max(0.08, distance - 0.35);
    const hit = orbitRaycaster.intersectObject(world.group, true).find(isSolidHit);
    if (!hit) clear++;
  }
  return clear;
}

function chooseOrbitTheta(station: Station, radius: number, height: number, targetX: number, targetHeight: number): number {
  station.experiment.root.updateWorldMatrix(true, false);
  world.group.updateWorldMatrix(true, true);
  let bestTheta = ORBIT_THETAS[0];
  let bestScore = -Infinity;
  for (const theta of ORBIT_THETAS) {
    const clear = orbitClearSamples(station, radius, height, targetX, targetHeight, theta);
    if (clear === 3) return theta;
    // Prefer the clearest view, then the smallest orbit offset from the
    // authored front view.
    const score = clear * 10 - Math.abs(theta) * 0.2;
    if (score > bestScore) {
      bestScore = score;
      bestTheta = theta;
    }
  }
  return bestTheta;
}

function orbitTarget(rig: OrbitRig): THREE.Vector3 {
  return rig.station.experiment.root.localToWorld(
    rig.target.set(rig.targetX, rig.targetHeight, 0),
  );
}

function orbitPosition(rig: OrbitRig): THREE.Vector3 {
  const local = rig.position.set(
    rig.targetX + Math.sin(rig.theta) * rig.radius,
    rig.height,
    Math.cos(rig.theta) * rig.radius,
  );
  return rig.station.experiment.root.localToWorld(local);
}

function updateOrbit(dt: number): void {
  if (!orbit) return;
  orbit.blend = Math.min(1, orbit.blend + dt / 0.82);
  const target = orbitTarget(orbit);
  const wanted = orbitPosition(orbit);
  const look = new THREE.Matrix4().lookAt(wanted, target, new THREE.Vector3(0, 1, 0));
  orbit.quaternion.setFromRotationMatrix(look);

  const eased = orbit.blend * orbit.blend * (3 - 2 * orbit.blend);
  if (eased < 1) {
    camera.position.lerpVectors(orbit.startPosition, wanted, eased);
    camera.quaternion.slerpQuaternions(orbit.startQuaternion, orbit.quaternion, eased);
  } else {
    camera.position.copy(wanted);
    camera.quaternion.copy(orbit.quaternion);
  }
  camera.fov = THREE.MathUtils.damp(camera.fov, 62, 7, dt);
  camera.updateProjectionMatrix();
}

function closeFocus(): void {
  if (!focusedStation) return;
  const station = focusedStation;
  focusedStation = null;
  orbit = null;
  station.experiment.setFocused(false);
  station.experiment.observationActive = false;
  time.endSession();
  vectors.setStationRoot(null);
  telemetry.setActive(false);
  wandActive = false;
  wandReading = null;
  ui.setWandReading(null);
  player.enabled = true;
  viewmodel.setVisible(true);
  input.autoLock = true;
  camera.fov = 74;
  camera.updateProjectionMatrix();
  camera.position.copy(player.eyePosition);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  ui.setTimeCardVisible(false);
  ui.updateObservationBanner(false, -1, '', 0);
  ui.setTimeStatus(time.getStatus());
  ui.setPausePrompt(false);
  requestControl();
}

// ---------------------------------------------------------------------------
// Expedition start / pointer lock
// ---------------------------------------------------------------------------

function beginExpedition(): void {
  if (started) return;
  started = true;
  player.enabled = true;
  input.autoLock = true;
  ui.setPausePrompt(false);
  window.setTimeout(() => {
    if (!started) return;
    if (!input.pointerLocked && !ui.isStationOpen && !modalOpen()) {
      ui.setPausePrompt(true);
    }
  }, 750);
  window.setTimeout(() => {
    if (!started || welcomeShown || ui.isStationOpen || modalOpen()) return;
    welcomeShown = true;
    ui.toast(
      'Field log initialized',
      'Follow a brass path to any beacon, then press E to inspect the apparatus.',
      '#ffd48b',
      '◈',
      5400,
    );
  }, 1450);
  requestControl();
}

function resumeExploring(): void {
  if (!started || ui.isStationOpen || modalOpen()) return;
  input.autoLock = true;
  ui.setPausePrompt(false);
  requestControl();
}

function requestControl(): void {
  if (!started || ui.isIntroOpen || ui.isStationOpen || modalOpen()) return;
  input.autoLock = true;
  input.requestPointerLock();
}

function updatePausePrompt(): void {
  const visible = started && !input.pointerLocked && !ui.isIntroOpen && !ui.isStationOpen && !modalOpen();
  ui.setPausePrompt(visible);
}

document.addEventListener('pointerlockchange', updatePausePrompt);

// ---------------------------------------------------------------------------
// Station lifecycle actions
// ---------------------------------------------------------------------------

function handleTabChange(tab: StationTab): void {
  if (!focusedStation) return;
  if (tab !== 'observe') focusedStation.experiment.observationActive = false;
  ui.setTimeStatus(time.getStatus());
}

function startObservation(): void {
  const station = focusedStation;
  if (!station) return;
  time.setMode('flow');
  time.runObservation(env);
  ui.syncParams(station.experiment.params);
  ui.setTimeStatus(time.getStatus());
  time.recordEnvironment(env);
}

function armChallenge(): void {
  const station = focusedStation;
  if (!station) return;
  station.experiment.observationActive = false;
  time.setMode('flow');
  time.armChallenge();
  ui.setTimeStatus(time.getStatus());
  ui.toast(
    'Mastery trial armed',
    station.experiment.meta.challenge.brief,
    station.accent,
    station.experiment.meta.badgeGlyph,
    4400,
  );
}

function usePrimaryAction(): void {
  const station = focusedStation;
  if (!station) return;
  if (!station.experiment.canUsePrimaryAction()) return;
  if (time.mode === 'paused' || time.mode === 'rewind' || time.mode === 'slow') time.setMode('flow');
  time.recordEnvironment(env);
  time.usePrimary();
  ui.setTimeStatus(time.getStatus());
}

function restartApparatus(): void {
  if (!focusedStation) return;
  time.restart();
  time.setMode('paused');
  ui.setTimeStatus(time.getStatus());
  ui.toast('Apparatus reset', 'The trial state has been cleared. Tune again.', focusedStation.accent, '↺', 2400);
}

function changeParam(id: string, value: string | number | boolean): void {
  const station = focusedStation;
  if (!station) return;
  station.experiment.setParam(id, value);
  time.recordParam(id, value);
  ui.syncParams(station.experiment.params);
}

function applyEnvironment(next: EnvironmentState): void {
  env.gravity = clamp(Number(next.gravity) || 0, 0, 24.79);
  env.gravityPreset = next.gravityPreset;
  env.air = next.air;
  env.airDensity = clamp(Number(next.airDensity) || 0, 0, 3);
  env.friction = next.friction;
  env.frictionCoefficient = clamp(Number(next.frictionCoefficient) || 0, 0, 1);
  ui.setEnvironment(env);
  if (time.isActive) time.recordEnvironment(env);
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

function travelToStation(id: string): void {
  const station = registry.getById(id);
  if (!station) return;
  if (ui.isStationOpen) ui.closeStation();
  const pose = registry.getTravelPose(station);
  player.teleport(pose.position, pose.yaw);
  camera.position.copy(player.eyePosition);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.fov = 74;
  camera.updateProjectionMatrix();
  ui.setPlayerPose(player.position.x, player.position.z, player.yaw);
  ui.toast(
    'Beacon reached',
    `${station.experiment.meta.number} · ${station.experiment.meta.title}`,
    station.accent,
    station.experiment.meta.badgeGlyph,
    3000,
  );
  requestControl();
}

function travelToHub(): void {
  if (ui.isStationOpen) ui.closeStation();
  player.teleport(new THREE.Vector3(0, 0, 12.5), 0);
  camera.position.copy(player.eyePosition);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.fov = 74;
  camera.updateProjectionMatrix();
  ui.setPlayerPose(player.position.x, player.position.z, player.yaw);
  ui.toast('Hall of Constants', 'Spawn rotunda · every path begins here.', '#ffd48b', '◈', 2800);
  requestControl();
}

function openMap(): void {
  if (modalOpen()) return;
  input.exitPointerLock();
  input.autoLock = false;
  ui.setPausePrompt(false);
  ui.setWandReading(null);
  ui.openMap();
}

function openBook(): void {
  if (ui.isBookOpen) {
    ui.closeBook();
    return;
  }
  if (ui.isMapOpen || ui.isHelpOpen || ui.isBadgeOpen) return;
  input.exitPointerLock();
  input.autoLock = false;
  ui.setPausePrompt(false);
  ui.setWandReading(null);
  ui.openBook(env);
  activateToolOnly('book');
}

function openHelp(): void {
  if (ui.isHelpOpen) {
    ui.closeHelp();
    return;
  }
  if (modalOpen()) return;
  input.exitPointerLock();
  input.autoLock = false;
  ui.setPausePrompt(false);
  ui.setWandReading(null);
  ui.openHelp();
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function activateToolOnly(tool: ToolId): void {
  activeTool = tool;
  viewmodel.setTool(tool);
  ui.setTool(tool);
  updateWandActivity();
}

function selectTool(tool: ToolId): void {
  const repeat = activeTool === tool;
  activateToolOnly(tool);
  if (tool === 'block') {
    voxelBuilder.setEnabled(true);
    viewmodel.setHeldBlock(voxelBuilder.getSelectedBlockType());
    ui.setActiveVoxelBlock(voxelBuilder.getSelectedBlockType());
    ui.setVoxelPaletteVisible(true);
    if (!repeat) {
      ui.toast('Voxel Builder Active', 'L-Click: Mine · R-Click: Place · Scroll: Switch Block', '#7ef9ff', '▧', 2800);
    }
  } else {
    voxelBuilder.setEnabled(false);
    ui.setVoxelPaletteVisible(false);
  }
  if (tool === 'goggles') {
    toggleGoggles();
    if (!repeat) {
      ui.toast(
        gogglesOn ? 'Vector Vision online' : 'Vector Vision offline',
        gogglesOn
          ? 'Aim your attention at an apparatus to reveal its force arrows.'
          : 'Vector arrows retracted.',
        '#72e9ff',
        '⟿',
        2600,
      );
    }
  }
  if (tool === 'book' && !ui.isBookOpen) openBook();
  if (tool === 'graph') toggleGraphBoard();
}

function toggleGoggles(): void {
  gogglesOn = !gogglesOn;
  vectors.setEnabled(gogglesOn);
  ui.setToolState({ goggles: gogglesOn, graph: graphVisible });
}

function toggleGraphFromKey(): void {
  activateToolOnly('graph');
  toggleGraphBoard();
}

function toggleGraphBoard(): void {
  const station = focusedStation ?? registry.getNearest(player.position, 26)?.station ?? null;
  graphBoard.toggle(camera, station);
  graphVisible = graphBoard.visible;
  ui.setToolState({ goggles: gogglesOn, graph: graphVisible });
  if (graphVisible) {
    ui.toast(
      'Oscilloscope deployed',
      station
        ? `Recording ${station.experiment.meta.shortTitle} telemetry.`
        : 'Awaiting a focused apparatus — graphs begin when you inspect a station.',
      station?.accent ?? '#7ef9ff',
      '⊞',
      3000,
    );
  }
}

function updateWandActivity(): void {
  const shouldBeActive = activeTool === 'wand' && !modalOpen();
  if (shouldBeActive !== wandActive) {
    wandActive = shouldBeActive;
    telemetry.setActive(shouldBeActive);
    if (!shouldBeActive) {
      wandReading = null;
      ui.setWandReading(null);
    }
  }
}

// ---------------------------------------------------------------------------
// Time controls
// ---------------------------------------------------------------------------

function togglePause(): void {
  if (!focusedStation) {
    ui.toast('No apparatus in session', 'Press E beside a beacon to take manual control of its clock.', '#7ef9ff', '◷', 3000);
    return;
  }
  time.togglePause();
  ui.setTimeStatus(time.getStatus());
}

function cycleSlow(): void {
  if (!focusedStation) {
    ui.toast('No apparatus in session', 'Slow motion becomes available inside a station.', '#7ef9ff', '◷', 3000);
    return;
  }
  time.toggleSlow();
  const status = time.getStatus();
  ui.setTimeStatus(status);
  if (status.mode === 'slow') {
    ui.toast('Slow motion', 'Apparatus time advances at 0.10× real time. Press T again for deep slow.', '#7ef9ff', '◷', 2600);
  } else if (status.mode === 'very-slow') {
    ui.toast('Deep slow motion', 'Apparatus time advances at 0.04× real time. Press T to return to real time.', '#7ef9ff', '◷', 2600);
  } else if (status.mode === 'flow') {
    ui.toast('Real time restored', 'Apparatus time is running at 1.00×.', '#7ef9ff', '◷', 2000);
  }
}

function stepFrame(): void {
  if (!focusedStation) return;
  time.frameStep(env);
  ui.setTimeStatus(time.getStatus());
}

function toggleRewind(): void {
  if (!focusedStation) {
    ui.toast('No apparatus in session', 'Rewind requires an active apparatus timeline.', '#7ef9ff', '◷', 3000);
    return;
  }
  if (time.mode === 'rewind') time.stopRewind(true);
  else time.startRewind();
  ui.setTimeStatus(time.getStatus());
}

// ---------------------------------------------------------------------------
// Simulation checks and discovery badges
// ---------------------------------------------------------------------------

function updateObservationState(): void {
  const station = focusedStation;
  if (!station) return;
  const experiment = station.experiment;
  if (!experiment.observationActive) return;
  const cues = experiment.meta.observeCues;
  const stopAt = cues.length ? cues[cues.length - 1].at + 5.2 : 24;
  if (experiment.simTime >= stopAt) {
    experiment.observationActive = false;
    experiment.lastObservationTime = experiment.simTime;
    ui.updateObservationBanner(false, -1, '', cues.length);
  }
}

function checkChallenge(): void {
  const station = focusedStation;
  if (!station) return;
  const experiment = station.experiment;
  if (!experiment.challengeArmed || station.solved) return;
  if (!experiment.isSolved()) return;
  sealDiscovery(station);
}

function sealDiscovery(station: Station): void {
  if (station.solved) return;
  const experiment = station.experiment;
  experiment.observationActive = false;
  registry.markSolved(station.id);
  save.badges[station.id] = Date.now();
  writeSave(save.badges);
  const progress = registry.getProgress();
  ui.markStationSolved(station.id);
  ui.updateBadgeProgress();
  ui.setIntroProgress(progress.solved, progress.total);
  const payload: BadgePayload = {
    glyph: experiment.meta.badgeGlyph,
    badgeName: experiment.meta.badgeName,
    trialTitle: experiment.meta.challenge.title,
    number: experiment.meta.number,
    accent: experiment.meta.accent,
    solved: progress.solved,
    total: progress.total,
  };
  input.exitPointerLock();
  ui.showBadge(payload);
  ui.toast(
    'Discovery sealed',
    `${experiment.meta.badgeName} · ${progress.solved} of ${progress.total} complete.`,
    experiment.meta.accent,
    experiment.meta.badgeGlyph,
    4400,
  );
}

function resumeAfterBadge(): void {
  if (focusedStation) {
    ui.setTimeStatus(time.getStatus());
    refreshStationLive();
  }
}

// ---------------------------------------------------------------------------
// Per-frame HUD, wand and vector systems
// ---------------------------------------------------------------------------

function nearestStation(limit: number): { station: Station; distance: number } | null {
  return registry.getNearest(player.position, limit);
}

function refreshHud(): void {
  ui.setPlayerPose(player.position.x, player.position.z, player.yaw);

  const zone = zoneInfo(player.position);
  if (zone.key !== lastZoneKey) {
    lastZoneKey = zone.key;
    ui.setZone(zone.name, zone.overline, zone.accent, zone.glyph);
    if (started && zone.biome && lastSeenBiome !== zone.biome.id) {
      lastSeenBiome = zone.biome.id;
      if (welcomeShown) {
        ui.toast(
          zone.biome.name,
          zone.biome.question,
          zone.biome.accent,
          zone.biome.glyph,
          4400,
        );
      } else {
        lastSeenBiome = zone.biome.id;
      }
    }
  }

  if (focusedStation) return;

  const nearest = nearestStation(72);
  if (nearest && started) {
    const meta = nearest.station.experiment.meta;
    ui.setFieldCard({
      title: `${meta.number} · ${meta.shortTitle}`,
      distance: nearest.distance,
      meta: `${nearest.station.biome.shortName} · ${nearest.station.solved ? 'badge claimed' : 'undiscovered'}`,
      accent: nearest.station.accent,
    });
    if (!modalOpen() && nearest.distance <= 11.8) {
      ui.setInteract({
        title: meta.title,
        meta: `${nearest.station.biome.shortName} · ${nearest.station.solved ? 'DISCOVERED' : 'MASTER TRIAL AVAILABLE'}`,
        accent: nearest.station.accent,
      });
    } else {
      ui.setInteract(null);
    }
  } else {
    ui.setFieldCard(started ? null : { title: 'The Hall of Constants', distance: 0, meta: 'Spawn rotunda', accent: '#ffd48b' });
    ui.setInteract(null);
  }

  ui.setTimeStatus(time.getStatus());
}

function zoneInfo(position: THREE.Vector3): {
  key: string;
  name: string;
  overline: string;
  accent: string;
  glyph: string;
  biome: BiomeDefinition | null;
} {
  if (Math.hypot(position.x, position.z) < WORLD.hubRadius + 3) {
    return {
      key: 'hub',
      name: 'The Hall of Constants',
      overline: 'Sector 00 · Spawn rotunda',
      accent: '#ffd48b',
      glyph: '◈',
      biome: null,
    };
  }
  const biome = world.getBiomeAt(position);
  if (biome) {
    return {
      key: `biome-${biome.id}`,
      name: biome.name,
      overline: `Biome 0${biome.index} · ${biome.discipline}`,
      accent: biome.accent,
      glyph: biome.glyph,
      biome,
    };
  }
  return {
    key: 'wilds',
    name: 'The Constants Wilds',
    overline: 'Open field · follow the brass paths',
    accent: '#a5c7d4',
    glyph: '✧',
    biome: null,
  };
}

function refreshStationLive(): void {
  const station = focusedStation;
  if (!station) return;
  const experiment = station.experiment;
  const cues = experiment.meta.observeCues;
  let cueIndex = -1;
  for (let i = 0; i < cues.length; i++) {
    if (experiment.simTime >= cues[i].at) cueIndex = i;
  }
  ui.updateStationLive({
    metrics: experiment.getMetrics(env),
    challengeStatus: experiment.challengeStatus,
    primaryLabel: experiment.getPrimaryActionLabel(),
    primaryEnabled: experiment.canUsePrimaryAction(),
    primaryHint: experiment.getPrimaryActionHint(),
    armed: experiment.challengeArmed,
    solved: station.solved,
    observationActive: experiment.observationActive,
    observationCue: cueIndex >= 0 ? cues[cueIndex].text : '',
    observationCueIndex: cueIndex,
    observationTime: experiment.simTime,
    hasObserved: experiment.hasObserved,
  });
  ui.setTimeStatus(time.getStatus());
}

function updateWand(dt: number): void {
  const active = activeTool === 'wand' && !modalOpen();
  if (active !== wandActive) {
    wandActive = active;
    telemetry.setActive(active);
    if (!active) {
      wandReading = null;
      ui.setWandReading(null);
    }
  }
  if (!active) return;

  const station = focusedStation ?? nearestStation(24)?.station ?? null;
  if (!station) {
    if (wandReading) {
      wandReading = null;
      ui.setWandReading(null);
    }
    return;
  }
  wandReading = telemetry.update(dt, station, station.experiment, env);
  ui.setWandReading(wandReading);
}

// ---------------------------------------------------------------------------
// Environment overlays pause perception; resume when they close
// ---------------------------------------------------------------------------

function syncOverlayPause(): void {
  const open = modalOpen();
  if (open && !pausedByOverlay && time.isActive && time.mode !== 'paused' && time.mode !== 'rewind') {
    pausedByOverlay = true;
    overlayResumeMode = time.mode;
    time.setMode('paused');
    ui.setTimeStatus(time.getStatus());
  } else if (!open && pausedByOverlay) {
    pausedByOverlay = false;
    if (focusedStation) {
      time.setMode(overlayResumeMode);
      ui.setTimeStatus(time.getStatus());
    }
  }
  if (open) ui.setPausePrompt(false);
  updateWandActivity();
}

// ---------------------------------------------------------------------------
// Input bindings
// ---------------------------------------------------------------------------

input.onAction((action) => {
  if (!started || ui.isIntroOpen) return;

  if (action === 'escape') {
    if (ui.closeTopOverlay()) return;
    if (ui.isStationOpen) {
      ui.closeStation();
      return;
    }
    if (input.pointerLocked) input.exitPointerLock();
    else updatePausePrompt();
    return;
  }

  if (modalOpen()) return;

  switch (action) {
    case 'interact': {
      if (ui.isStationOpen) {
        ui.closeStation();
        return;
      }
      const nearest = nearestStation(11.8);
      if (!nearest) {
        if (activeTool === 'block') {
          ui.openInventory(voxelBuilder.getAllPlacedBlocks().length);
          return;
        }
        ui.toast('No apparatus in reach', 'Walk closer to a beacon, or press I for Creative Inventory.', '#7ef9ff', '◇', 2400);
        return;
      }
      focusStation(nearest.station);
      break;
    }
    case 'inventory':
      if (ui.isInventoryOpen) {
        ui.closeInventory();
      } else {
        ui.openInventory(voxelBuilder.getAllPlacedBlocks().length);
      }
      break;
    case 'map':
      openMap();
      break;
    case 'help':
      openHelp();
      break;
    case 'pioneers':
      if (ui.isPioneersOpen) {
        ui.closePioneers();
      } else {
        input.exitPointerLock();
        ui.openPioneers();
      }
      break;
    case 'book':
      openBook();
      break;
    case 'goggles':
      activateToolOnly('goggles');
      toggleGoggles();
      break;
    case 'time':
      activateToolOnly('time');
      cycleSlow();
      break;
    case 'graph':
      toggleGraphFromKey();
      break;
    case 'frame':
      stepFrame();
      break;
    case 'rewind':
      toggleRewind();
      break;
    case 'pause':
      togglePause();
      break;
    case 'slot1':
      selectTool('goggles');
      break;
    case 'slot2':
      selectTool('time');
      break;
    case 'slot3':
      selectTool('wand');
      break;
    case 'slot4':
      selectTool('book');
      break;
    case 'slot5':
      selectTool('graph');
      break;
    case 'slot6':
      selectTool('block');
      break;
    case 'builder':
      if (activeTool === 'block') selectTool('wand');
      else selectTool('block');
      break;
    case 'daynight':
      toggleDayNight();
      break;
  }
});

input.onWheel((deltaY) => {
  if (activeTool === 'block') {
    if (deltaY > 0) blockPaletteIndex = (blockPaletteIndex + 1) % BLOCK_PALETTE_ORDER.length;
    else blockPaletteIndex = (blockPaletteIndex - 1 + BLOCK_PALETTE_ORDER.length) % BLOCK_PALETTE_ORDER.length;
    const nextType = BLOCK_PALETTE_ORDER[blockPaletteIndex];
    handleBlockSelect(nextType);
  }
});

input.onKeydown((event) => {
  if (!started || ui.isIntroOpen || modalOpen()) return;
  if (event.code === 'Enter' && !ui.isStationOpen) {
    const nearest = nearestStation(11.8);
    if (nearest) focusStation(nearest.station);
  }
});

// Orbit the focused apparatus with a click-drag; the wheel adjusts framing.
let dragging = false;
let dragX = 0;
let dragY = 0;

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!orbit || event.button !== 0 || modalOpen()) return;
  dragging = true;
  dragX = event.clientX;
  dragY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.classList.add('is-orbiting');
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!orbit || !dragging) return;
  const dx = event.clientX - dragX;
  const dy = event.clientY - dragY;
  dragX = event.clientX;
  dragY = event.clientY;
  orbit.theta = clamp(orbit.theta - dx * 0.005, -Math.PI, Math.PI);
  orbit.height = clamp(orbit.height + dy * orbit.radius * 0.006, orbit.targetHeight + 0.35, orbit.radius * 1.55);
});

function endOrbitDrag(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  renderer.domElement.classList.remove('is-orbiting');
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener('pointerup', endOrbitDrag);
renderer.domElement.addEventListener('pointercancel', endOrbitDrag);
renderer.domElement.addEventListener(
  'wheel',
  (event) => {
    if (!orbit || modalOpen()) return;
    event.preventDefault();
    orbit.radius = clamp(orbit.radius * (1 + event.deltaY * 0.0009), orbit.minRadius, orbit.maxRadius);
  },
  { passive: false },
);

// ---------------------------------------------------------------------------
// Resize and boot
// ---------------------------------------------------------------------------

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function removeBootScreen(): void {
  const boot = document.querySelector<HTMLElement>('#boot-screen');
  if (!boot) return;
  boot.style.transition = 'opacity 0.45s ease';
  boot.style.opacity = '0';
  window.setTimeout(() => boot.remove(), 480);
}

void Promise.race([
  document.fonts?.ready ?? Promise.resolve(),
  new Promise((resolve) => window.setTimeout(resolve, 1400)),
]).then(removeBootScreen);

// A tiny pre-roll gives the world one frame to exist before the intro appears.
renderer.compile(scene, camera);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let previous = performance.now();
let elapsed = 0;
let hudClock = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const rawDt = (now - previous) / 1000;
  previous = now;
  const dt = clamp(Number.isFinite(rawDt) ? rawDt : 0, 0, 0.05);
  elapsed += dt;

  if (orbit) {
    updateOrbit(dt);
  } else if (player.enabled && !modalOpen()) {
    player.update(dt, env.gravity);
  }

  // Update first-person viewmodel animations (bobbing, sway, breathing, swings)
  if (!orbit && player.enabled) {
    const moveSpeed = Math.hypot(player.velocity.x, player.velocity.z) / 5.2;
    viewmodel.update(dt, elapsed, THREE.MathUtils.clamp(moveSpeed, 0, 1), player.sprinting);
    viewmodel.setVisible(!modalOpen() && started && !ui.isIntroOpen);
  } else {
    viewmodel.setVisible(false);
  }

  const clicks = input.consumeClicks();
  if (!modalOpen() && !ui.isStationOpen && player.enabled) {
    if (clicks.left && activeTool === 'block') {
      const broke = voxelBuilder.breakBlock((origin, force) => player.applyImpulse(origin, force));
      if (broke) viewmodel.triggerSwing();
    }
    if (clicks.right && activeTool === 'block') {
      const placed = voxelBuilder.placeBlock(player.position);
      if (placed) viewmodel.triggerSwing();
    }
  }

  if (!modalOpen() && !ui.isStationOpen && player.enabled && activeTool === 'block') {
    voxelBuilder.updateTargeting([world.group]);
  } else {
    voxelBuilder.clearTargeting();
  }
  voxelBuilder.update(dt);

  syncOverlayPause();

  if (focusedStation) {
    const overlayPaused = modalOpen();
    if (!overlayPaused) {
      time.update(dt, env);
      updateObservationState();
      checkChallenge();
    }
  }

  world.update(dt, elapsed, player.position);
  if (world.isDayCycleActive()) {
    ui.setTimeOfDay(world.getTimeOfDay());
  }

  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.36;
    registry.update(dt, elapsed, player.position, focusedStation?.id ?? null, 1);
  } else {
    registry.update(dt, elapsed, player.position, focusedStation?.id ?? null, 0);
  }

  vectors.update(dt, focusedStation?.experiment ?? null, env);
  updateWand(dt);
  graphBoard.update(dt, focusedStation, focusedStation?.experiment ?? null, env);
  graphBoard.updateOrientation(camera, dt);

  hudClock += dt;
  if (hudClock >= 0.085) {
    hudClock = 0;
    refreshHud();
    refreshStationLive();
  }

  renderer.render(scene, camera);
}

refreshHud();
refreshStationLive();
requestAnimationFrame(frame);

// Development-only inspection hooks keep manual QA fast without exposing a
// cheat surface in production builds.
if (import.meta.env.DEV) {
  window.__sandbox = {
    focus: (id: string) => {
      const station = registry.getById(id);
      if (!station) return false;
      started = true;
      ui.hideIntro();
      ui.setPausePrompt(false);
      input.exitPointerLock();
      focusStation(station);
      return true;
    },
    close: () => ui.closeStation(),
    travel: (id: string) => travelToStation(id),
    param: (id: string, value: string | number | boolean) => changeParam(id, value),
    usePrimary: usePrimaryAction,
    arm: armChallenge,
    observe: startObservation,
    env: (next: Partial<EnvironmentState>) => applyEnvironment({ ...env, ...next }),
    selectBlock: (type: VoxelBlockType) => handleBlockSelect(type),
    placeBlock: () => voxelBuilder.placeBlock(player.position),
    placeAt: (x: number, y: number, z: number, type?: VoxelBlockType) => voxelBuilder.placeAt(x, y, z, type),
    breakBlock: () => voxelBuilder.breakBlock((origin, force) => player.applyImpulse(origin, force)),
    breakAt: (x: number, y: number, z: number) => voxelBuilder.breakAt(x, y, z, (origin, force) => player.applyImpulse(origin, force)),
    voxelCount: () => voxelBuilder.getAllPlacedBlocks().length,
    clearBlocks: () => voxelBuilder.clearAll(),
    setTime: (hours: number) => { world.setTimeOfDay(hours); ui.setTimeOfDay(hours); },
    getTime: () => world.getTimeOfDay(),
    toggleDayNight: () => toggleDayNight(),
    player: () => ({
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      velocity: { x: player.velocity.x, y: player.velocity.y, z: player.velocity.z },
      grounded: player.grounded,
    }),
    openInventory: () => ui.openInventory(voxelBuilder.getAllPlacedBlocks().length),
    closeInventory: () => ui.closeInventory(),
    state: () => ({
      env: { ...env },
      focused: focusedStation?.id ?? null,
      tool: activeTool,
      goggles: gogglesOn,
      progress: registry.getProgress(),
      time: time.getStatus(),
    }),
    stations: () => registry.stations.map((station) => station.id),
  };
}

declare global {
  interface Window {
    __sandbox?: {
      focus: (id: string) => boolean;
      close: () => void;
      travel: (id: string) => void;
      param: (id: string, value: string | number | boolean) => void;
      usePrimary: () => void;
      arm: () => void;
      observe: () => void;
      env: (next: Partial<EnvironmentState>) => void;
      selectBlock: (type: VoxelBlockType) => void;
      placeBlock: () => boolean;
      placeAt: (x: number, y: number, z: number, type?: VoxelBlockType) => boolean;
      breakBlock: () => boolean;
      breakAt: (x: number, y: number, z: number) => boolean;
      voxelCount: () => number;
      clearBlocks: () => void;
      setTime: (hours: number) => void;
      getTime: () => number;
      toggleDayNight: () => void;
      player: () => {
        position: { x: number; y: number; z: number };
        velocity: { x: number; y: number; z: number };
        grounded: boolean;
      };
      openInventory: () => void;
      closeInventory: () => void;
      state: () => {
        env: EnvironmentState;
        focused: string | null;
        tool: ToolId;
        goggles: boolean;
        progress: { solved: number; total: number };
        time: ReturnType<TimeController['getStatus']>;
      };
      stations: () => string[];
    };
  }
}

// Make disposal possible for hot-reload without leaking listeners.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    input.dispose();
    ui.dispose();
    telemetry.dispose();
    renderer.dispose();
  });
}
