import { BIOMES, GRAVITY_PRESETS, biomePathPoints, type BiomeId, type EnvironmentState, type GravityPreset } from '../config';
import { PIONEERS, type Pioneer } from '../data/pioneers';
import { getExperimentSpotlight } from '../data/experimentSummaries';
import type { StationTab } from '../stations/BaseExperiment';
import type { Station } from '../stations/registry';
import type { ControlDef, ParamValue, Readout } from '../stations/types';
import type { TimeMode, TimeStatus } from '../game/TimeController';
import type { WandReading } from '../game/TelemetryInspector';
import type { ToolId } from '../player/Viewmodel';
import { ICONS } from './icons';
import { sound } from '../audio/SoundEngine';
import { type VoxelBlockType, VOXEL_BLOCKS, BLOCK_PALETTE_ORDER } from '../world/textures';
import { INTUITION_BY_ID } from '../stations/intuition';
import type { ScholarDialogue } from '../game/SeatingManager';
import type { TheodoliteStation } from '../world/World';

export interface MapStation {
  id: string;
  number: string;
  shortTitle: string;
  biomeId: BiomeId;
  accent: string;
  x: number;
  z: number;
  solved: boolean;
}

export interface StationLive {
  metrics: Readout[];
  challengeStatus: string;
  primaryLabel: string | null;
  primaryEnabled: boolean;
  primaryHint: string;
  armed: boolean;
  solved: boolean;
  observationActive: boolean;
  observationCue: string;
  observationCueIndex: number;
  observationTime: number;
  hasObserved: boolean;
}

export interface BadgePayload {
  glyph: string;
  badgeName: string;
  trialTitle: string;
  number: string;
  accent: string;
  solved: number;
  total: number;
}

export interface GameUICallbacks {
  onStart(): void;
  onResume(): void;
  onTabChange(tab: StationTab): void;
  onObserve(): void;
  onArm(): void;
  onPrimary(): void;
  onRestart(): void;
  onParamChange(id: string, value: ParamValue): void;
  onCloseStation(): void;
  onTravel(id: string): void;
  onTravelHub(): void;
  onMapClose(): void;
  onEnvironmentChange(env: EnvironmentState): void;
  onEnvironmentClose(): void;
  onHelpClose(): void;
  onTimeTogglePause(): void;
  onTimeCycleSlow(): void;
  onTimeStep(): void;
  onTimeRewind(): void;
  onToolSelect(tool: ToolId): void;
  onBlockSelect?(type: VoxelBlockType): void;
  onGraphToggle(): void;
  onOpenBook(): void;
  onToggleLantern?(): void;
  onExitTheodolite?(): void;
  onOpenMap(): void;
  onOpenHelp(): void;
  onBadgeContinue(): void;
  onSetTimeOfDay?(hours: number): void;
  onToggleDayCycle?(active: boolean): void;
  onToggleDayNight?(): void;
  onClearBlocks?(): void;
  onInventoryClose?(): void;
  onToggleBlenderModel?(): void;
  onStationMinimizeChange?(minimized: boolean): void;
  onOpenPioneers?(): void;
  onTravelCoordinates?(x: number, z: number, stationId?: string): void;
}

interface ToolSpec {
  kicker: string;
  name: string;
  short: string;
  description: string;
  key: string;
  icon: string;
}

const PALETTE_LABELS: Record<VoxelBlockType, string> = {
  grass: 'Grass',
  dirt: 'Dirt',
  stone: 'Stone',
  cobblestone: 'Cobble',
  planks: 'Planks',
  brick: 'Bricks',
  glass: 'Glass',
  glowstone: 'Glowstone',
  redstone: 'Redstone',
  slime: 'Slime',
  iron: 'Iron',
  gold: 'Gold',
  diamond: 'Diamond',
  obsidian: 'Obsidian',
  tnt: 'TNT',
};

const TOOLS: Record<ToolId, ToolSpec> = {
  goggles: {
    kicker: 'INSTRUMENT 01',
    name: 'Vector Vision Goggles',
    short: 'Goggles',
    description: 'Velocity · acceleration · gravity · normal · friction',
    key: 'V',
    icon: ICONS.goggles,
  },
  time: {
    kicker: 'INSTRUMENT 02',
    name: 'Time-Dilation Controller',
    short: 'Time',
    description: 'Freeze, slow, frame-step or rewind the apparatus',
    key: 'T',
    icon: ICONS.time,
  },
  wand: {
    kicker: 'INSTRUMENT 03',
    name: 'Telemetry Inspector Wand',
    short: 'Wand',
    description: 'Aim at any tracked body to read its live state',
    key: '3',
    icon: ICONS.wand,
  },
  book: {
    kicker: 'INSTRUMENT 04',
    name: 'Environment Manipulator',
    short: 'Env',
    description: 'Rewrite gravity, air density and friction',
    key: 'K',
    icon: ICONS.book,
  },
  graph: {
    kicker: 'INSTRUMENT 05',
    name: 'Graph Spawner Block',
    short: 'Graph',
    description: 'Deploy a floating oscilloscope in the world',
    key: 'G',
    icon: ICONS.graph,
  },
  block: {
    kicker: 'INSTRUMENT 06',
    name: 'Voxel Builder',
    short: 'Builder',
    description: 'Mine, place and test 14 material blocks',
    key: 'B',
    icon: ICONS.block,
  },
};

const TOOL_ORDER: ToolId[] = ['goggles', 'time', 'wand', 'book', 'graph', 'block'];

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatControlValue(control: ControlDef, value: ParamValue): string {
  if (control.kind === 'toggle') return value ? 'ENGAGED' : 'OFF';
  if (control.kind === 'select') {
    return control.options?.find((option) => String(option.value) === String(value))?.label ?? String(value);
  }
  const numeric = Number(value);
  const text = control.format ? control.format(numeric) : Number.isFinite(numeric) ? String(Number(numeric.toFixed(2))) : '—';
  return `${text}${control.unit ? ` ${control.unit}` : ''}`;
}

function toneClass(tone: Readout['tone']): string {
  return tone ? `tone-${tone}` : '';
}

function metricMarkup(metric: Readout): string {
  return `<div class="metric ${toneClass(metric.tone)}"><span>${esc(metric.label)}</span><b>${esc(metric.value)}${
    metric.unit ? `<small>&#8202;${esc(metric.unit)}</small>` : ''
  }</b></div>`;
}

function cueAtTime(cues: Array<{ at: number; text: string }>, time: number): { index: number; text: string } {
  let index = -1;
  for (let i = 0; i < cues.length; i++) {
    if (time >= cues[i].at) index = i;
  }
  return { index, text: index >= 0 ? cues[index].text : '' };
}

export class GameUI {
  private root: HTMLElement;
  private hud!: HTMLElement;
  private intro!: HTMLElement;
  private stationPanel!: HTMLElement;
  private mapOverlay!: HTMLElement;
  private bookOverlay!: HTMLElement;
  private bookPanel!: HTMLElement;
  private helpOverlay!: HTMLElement;
  private badgeOverlay!: HTMLElement;
  private pausePrompt!: HTMLElement;
  private toastStack!: HTMLElement;
  private mapSvg!: SVGSVGElement;
  private mapPlayer: SVGGElement | null = null;
  private mapPlayerHead: SVGPathElement | null = null;

  private minimapSvg!: SVGSVGElement;
  private minimapPlayer: SVGGElement | null = null;
  private minimapPlayerHead: SVGPathElement | null = null;
  private minimapPlayerCone: SVGPathElement | null = null;
  private minimapWaypointLine: SVGLineElement | null = null;
  private minimapZoom: 1 | 2.5 = 1;
  private selectedWaypointId: string | null = null;
  private nearestStation: MapStation | null = null;
  private compassRibbon!: HTMLElement;
  private compassPins!: HTMLElement;
  private compassBearingLabel!: HTMLElement;
  private guideOverlay!: HTMLElement;
  private guideOpen = false;

  private activeStation: Station | null = null;
  private currentTab: StationTab = 'observe';
  private stations: MapStation[] = [];
  private tool: ToolId = 'wand';
  private gogglesEnabled = false;
  private graphSpawned = false;
  private timeStatus: TimeStatus | null = null;
  private bookEnv: EnvironmentState | null = null;
  private introOpen = true;
  private mapOpen = false;
  private helpOpen = false;
  private bookOpen = false;
  private badgeOpen = false;
  private stationOpen = false;
  private inventoryOverlay!: HTMLElement;
  private inventoryOpen = false;
  private pioneersOverlay!: HTMLElement;
  private pioneersOpen = false;
  private pioneersCategory = 'all';
  private scholarOverlay!: HTMLElement;
  private scholarName!: HTMLElement;
  private scholarMeta!: HTMLElement;
  private scholarPortraitImg!: HTMLImageElement;
  private scholarTreatiseTitle!: HTMLElement;
  private scholarTreatiseYear!: HTMLElement;
  private scholarQuote!: HTMLElement;
  private scholarEquation!: HTMLElement;
  private scholarSubFormula!: HTMLElement;
  private scholarNarrativeText!: HTMLElement;
  private scholarWarpBtn!: HTMLButtonElement;
  private scholarWarpLabel!: HTMLElement;
  private scholarOpen = false;
  private activeScholarDialogue: ScholarDialogue | null = null;
  private theodoliteReticleOverlay!: HTMLElement;
  private theodoliteTitle!: HTMLElement;
  private theodoliteAzimuth!: HTMLElement;
  private theodoliteElevation!: HTMLElement;
  private lanternChip!: HTMLElement;
  private lanternLabel!: HTMLElement;
  private theodoliteActive = false;
  private blenderModelActive = true;
  private stationMinimized = false;
  private selectedCategory = 'all';
  private inspectedBlockType: VoxelBlockType = 'grass';
  private placedBlocksCount = 0;
  private currentTimeOfDay = 12.0;
  private dayCycleActive = false;
  private lastMetricKey = '';
  private lastCueIndex = -2;
  private playerPosition = { x: 0, z: 14, yaw: 0 };

  constructor(
    private readonly callbacks: GameUICallbacks,
    container: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'ui-root';
    this.root.className = 'ui-root';
    this.root.innerHTML = this.markup();
    container.append(this.root);
    this.cacheElements();
    this.bindEvents();
    this.renderIntroBiomes();
    this.setTool('wand');
  }

  // ---------------------------------------------------------------------------
  // Markup
  // ---------------------------------------------------------------------------

  private markup(): string {
    const biomeChips = BIOMES.map(
      (biome) =>
        `<span class="intro-biome" style="--biome:${biome.accent}"><i>${biome.glyph}</i>${esc(biome.shortName)}</span>`,
    ).join('');
    const hotbar = TOOL_ORDER.map((id, index) => {
      const tool = TOOLS[id];
      return `<button class="hotbar-slot" data-tool="${id}" title="${esc(tool.name)}" aria-label="${esc(tool.name)}">
        <span class="slot-key">${index + 1}</span>
        <span class="slot-icon">${tool.icon}</span>
        <span class="slot-name">${esc(tool.short)}</span>
        <span class="slot-state"></span>
      </button>`;
    }).join('');
    return `
      <div class="hud" id="hud" aria-hidden="true">
        <div class="hud-scanlines"></div>
        <header class="hud-top">
          <div class="brand-lockup">
            <span class="brand-mark">◈</span>
            <div class="brand-words"><b>THE GRAND</b><span>PHYSICS SANDBOX</span></div>
          </div>
          <div class="zone-chip" id="zone-chip">
            <span class="zone-glyph" id="zone-glyph">◈</span>
            <div><small id="zone-sub">SECTOR 00 · SPAWN</small><b id="zone-name">THE HALL OF CONSTANTS</b></div>
          </div>
          <div class="hud-top-actions">
            <button class="chip-button" id="tour-chip" data-ui="tour" title="Expedition Starter Tour & Recommendations"><span>🧭</span><span>TOUR GUIDE</span></button>
            <button class="chip-button" id="pioneers-chip" data-ui="pioneers" title="Hall of Pioneers & Laws (L)"><span class="pioneers-icon">🏛️</span><span>PIONEERS</span><kbd>L</kbd></button>
            <button class="chip-button" id="model-chip" data-ui="model-toggle" title="Toggle Blender 3D view (Shift+B)"><span>🎨</span><span id="model-toggle-label">VOXEL MODE</span><kbd>⇧B</kbd></button>
            <button class="chip-button daynight-chip" id="daynight-chip" data-ui="daynight" title="Toggle day / night lighting (N)"><span id="daynight-icon" class="daynight-icon" aria-hidden="true">${ICONS.sun}</span><span id="daynight-label">DAY</span><kbd>N</kbd></button>
            <button class="chip-button" id="lantern-chip" data-ui="lantern" title="Toggle surveyor carbide lantern (X)"><span>🔦</span><span id="lantern-label">LANTERN</span><kbd>X</kbd></button>
            <button class="chip-button" data-ui="atlas" title="Open the world atlas (M)">${ICONS.map}<span>ATLAS</span><kbd>M</kbd></button>
            <button class="chip-button" data-ui="manual" title="Open the field manual (H)">${ICONS.help}<span>MANUAL</span><kbd>H</kbd></button>
          </div>
        </header>

        <!-- Top-Center In-World Heading Compass Ribbon -->
        <div class="compass-ribbon hud-panel" id="compass-ribbon">
          <div class="compass-needle">▼</div>
          <div class="compass-tape-window">
            <div class="compass-pins" id="compass-pins"></div>
          </div>
          <div class="compass-bearing-label" id="compass-bearing-label">000° N</div>
        </div>

        <!-- Top-Left Navigation Radar Minimap -->
        <div class="minimap-deck hud-panel" id="minimap-deck">
          <div class="minimap-head">
            <div class="minimap-head-left">
              <span class="minimap-ping"></span>
              <span class="minimap-title">RADAR NAVIGATION</span>
            </div>
            <div class="minimap-head-right">
              <span class="minimap-coords" id="minimap-coords">X 0 · Z 14</span>
              <button class="minimap-ctrl-btn" id="minimap-zoom-btn" title="Toggle Zoom: 1× Full Island / 2.5× Local Tactical">1×</button>
              <button class="minimap-ctrl-btn" id="minimap-tour-btn" title="Open Expedition Starter Tour">★ TOUR</button>
              <button class="minimap-ctrl-btn" id="minimap-expand-btn" title="Open Full World Atlas (M)">[M]</button>
            </div>
          </div>
          <div class="minimap-scope-container">
            <svg id="minimap-svg" class="minimap-svg" viewBox="-124 -124 248 248" role="img" aria-label="Island Minimap Radar"></svg>
            <div class="minimap-cardinals">
              <span class="mc-cardinal mc-n">N</span>
              <span class="mc-cardinal mc-e">E</span>
              <span class="mc-cardinal mc-s">S</span>
              <span class="mc-cardinal mc-w">W</span>
            </div>
            <div class="minimap-sweep"></div>
          </div>
          <div class="minimap-target-bar" id="minimap-target-bar">
            <div class="target-left">
              <span class="target-bearing-arrow" id="minimap-bearing-arrow">▲</span>
              <div class="target-text">
                <span class="target-label" id="minimap-target-label">NEAREST EXPERIMENT</span>
                <b class="target-title" id="minimap-target-name">Scanning...</b>
              </div>
            </div>
            <div class="target-right">
              <span class="target-dist-val" id="minimap-target-dist">-- m</span>
              <button class="minimap-warp-btn" id="minimap-warp-btn" title="Warp directly to this apparatus">WARP</button>
            </div>
          </div>
        </div>

        <div class="discoveries hud-panel" id="discoveries">
          <div class="discoveries-head"><span>DISCOVERY LOG</span><b id="badge-count">00 / 17</b></div>
          <div class="badge-segments" id="badge-segments"></div>
        </div>

        <div class="field-card hud-panel" id="field-card">
          <span class="card-kicker">NEAREST SIGNAL</span>
          <b id="field-name">Scanning the island…</b>
          <span id="field-distance">Walk the brass paths</span>
        </div>

        <div class="hud-right">
          <button class="env-chip hud-panel" id="env-chip" data-ui="env" title="Open the Environment Manipulator (K)">
            <span class="env-item"><small>GRAVITY</small><b id="env-gravity">9.81</b><em>m/s²</em></span>
            <span class="env-item"><small>AIR</small><b id="env-air">ATMOS</b><em id="env-air-density">1.225</em></span>
            <span class="env-item"><small>FRICTION</small><b id="env-friction">ROUGH</b><em id="env-friction-coefficient">0.55</em></span>
            <span class="env-edit">${ICONS.book}</span>
          </button>
          <div class="wand-card hud-panel" id="wand-card" hidden>
            <div class="wand-head"><span class="live-dot"></span><span>LIVE INSPECTION</span><kbd>3</kbd></div>
            <div class="wand-target"><b id="wand-label">—</b><span id="wand-extra"></span></div>
            <div class="wand-grid">
              <div><small>SPEED</small><b id="wand-speed">0.00</b><em>m/s</em></div>
              <div><small>ACCEL</small><b id="wand-accel">0.00</b><em>m/s²</em></div>
              <div><small>MASS</small><b id="wand-mass">0.00</b><em>kg</em></div>
              <div><small>MOMENTUM</small><b id="wand-momentum">0.00</b><em>kg·m/s</em></div>
            </div>
            <div class="wand-energy">
              <span><i>KE</i><b id="wand-ke">0.00</b> J</span>
              <span><i>PE</i><b id="wand-pe">0.00</b> J</span>
              <span><i>Σ</i><b id="wand-total">0.00</b> J</span>
            </div>
            <div class="wand-energy-bar-wrap" title="Live Kinetic vs Potential Energy Partition">
              <div class="wand-energy-bar">
                <div class="wand-energy-fill-ke" id="wand-ke-bar" style="width: 50%"></div>
                <div class="wand-energy-fill-pe" id="wand-pe-bar" style="width: 50%"></div>
              </div>
              <div class="wand-energy-labels"><small>KE (½mv²)</small><small>PE (mgh)</small></div>
            </div>
            <div class="wand-position" id="wand-position">x 0.00 · y 0.00 · z 0.00</div>
          </div>
          <div class="vector-legend hud-panel" id="vector-legend" hidden>
            <span class="card-kicker">VECTOR VISION GOGGLES</span>
            <span><i style="--c:#22c55e"></i>Velocity (v)</span>
            <span><i style="--c:#3b82f6"></i>Acceleration (a)</span>
            <span><i style="--c:#eab308"></i>Normal Force (N)</span>
            <span><i style="--c:#ef4444"></i>Friction/Drag (f)</span>
            <span><i style="--c:#a855f7"></i>Gravity (Fg)</span>
          </div>
        </div>

        <div class="reticle" id="reticle" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>

        <div class="interact-prompt" id="interact-prompt" hidden>
          <kbd>E</kbd>
          <div><small>INSPECT EXPERIMENT</small><b id="interact-name">—</b></div>
          <span id="interact-meta"></span>
        </div>

        <div class="bottom-center">
          <div class="seated-banner" id="seated-banner" hidden>
            <span class="seated-glyph">🧘</span>
            <div><small id="seated-title">CONTEMPLATING THE LAWS OF NATURE</small><p id="seated-desc">Seated at Study Table · Press <kbd>C</kbd> or <kbd>WASD</kbd> to stand</p></div>
          </div>
          <div class="observation-banner" id="observation-banner" hidden>
            <span class="obs-pulse"></span>
            <div><small id="observation-label">GUIDED OBSERVATION · 01</small><p id="observation-text">—</p></div>
          </div>
          <div class="voxel-palette-hud" id="voxel-palette-hud" hidden>
            <div class="voxel-palette-bar" id="voxel-palette-bar">
              ${BLOCK_PALETTE_ORDER.map((blockType, idx) => {
                const meta = VOXEL_BLOCKS[blockType];
                return `<button class="voxel-slot ${idx === 0 ? 'active' : ''}" data-voxel-block="${blockType}" title="${meta.name}">
                  <span class="voxel-slot-swatch" style="background-color: #${meta.color.toString(16).padStart(6, '0')}"></span>
                  <span class="voxel-slot-name">${PALETTE_LABELS[blockType] ?? meta.name}</span>
                </button>`;
              }).join('')}
            </div>
            <div class="voxel-palette-tips">
              <span><b>L-CLICK</b> Mine</span>
              <span><b>R-CLICK</b> Place</span>
              <span><b>SCROLL</b> Select</span>
              <span><b>CLICK SLOT</b> Equip</span>
              <span><b>E / I</b> Inventory</span>
              <span><b>B</b> Exit</span>
              <button class="palette-inv-toggle-btn" id="btn-open-creative-inv" title="Open the creative materials inventory (E / I)">${ICONS.crate} Materials</button>
            </div>
          </div>
          <div class="tool-caption" id="tool-caption"><small id="tool-kicker">INSTRUMENT 03</small><b id="tool-name">Telemetry Inspector Wand</b><span id="tool-desc"></span></div>
          <nav class="hotbar" id="hotbar" aria-label="Instruments">${hotbar}</nav>
        </div>

        <div class="key-hints hud-panel" id="key-hints">
          <div class="hints-row">
            <span><kbd>WASD</kbd> Move</span>
            <span><kbd>⇧</kbd> Sprint</span>
            <span><kbd>SPACE</kbd> Jump</span>
            <span><kbd>E</kbd> Inspect</span>
          </div>
          <div class="hints-row">
            <button class="hint-click-btn" data-ui-hint="atlas" title="Open World Atlas (M)"><kbd>M</kbd> Atlas</button>
            <button class="hint-click-btn" data-ui-hint="model" title="Toggle Blender 3D View (Shift+B)"><kbd>⇧B</kbd> 3D</button>
            <button class="hint-click-btn" data-ui-hint="pioneers" title="Hall of Pioneers (L)"><kbd>L</kbd> Pioneers</button>
            <button class="hint-click-btn" data-ui-hint="guide" title="Expedition Starter Tour"><kbd>★</kbd> Tour</button>
          </div>
        </div>

        <div class="time-card hud-panel" id="time-card" data-mode="flow">
          <div class="time-head"><span class="time-mode" id="time-mode">REAL TIME</span><b id="time-clock">T + 0.0s</b></div>
          <div class="time-track"><div class="time-fill" id="time-fill"></div><span class="time-dot" id="time-dot"></span></div>
          <div class="time-buttons">
            <button data-time="pause" title="Pause / resume apparatus time (P)">${ICONS.pause}<span>PAUSE</span></button>
            <button data-time="slow" title="Cycle slow motion: 0.10× then 0.04× (T)">${ICONS.slow}<span>SLOW</span></button>
            <button data-time="step" title="Advance one frame (F)">${ICONS.step}<span>STEP</span></button>
            <button data-time="rewind" title="Rewind the apparatus (R)">${ICONS.rewind}<span>REWIND</span></button>
          </div>
          <div class="time-foot"><span>P pause · T slow · F frame · R rewind</span><span id="time-rate">1.00×</span></div>
        </div>

        <div class="pause-prompt" id="pause-prompt" hidden>
          <div class="pause-glyph">${ICONS.joystick}</div>
          <small>FIELD CONTROLS RELEASED</small>
          <b>Click to resume exploring</b>
          <span>Press E near any apparatus to inspect it.</span>
        </div>

        <div class="toast-stack" id="toast-stack" aria-live="polite"></div>

        <aside class="station-panel" id="station-panel" aria-hidden="true">
          <div id="station-content"></div>
        </aside>
      </div>

      <section class="intro" id="intro">
        <div class="intro-backdrop"></div>
        <div class="intro-grid"></div>
        <div class="intro-orbit" aria-hidden="true">
          <span class="orbit orbit-a"></span><span class="orbit orbit-b"></span><span class="orbit orbit-c"></span>
          <i class="orbit-dot dot-a"></i><i class="orbit-dot dot-b"></i><i class="orbit-dot dot-c"></i>
          <span class="orbit-core">◈</span>
        </div>
        <div class="intro-content">
          <div class="intro-eyebrow"><span></span>AN INTERACTIVE FIELD LABORATORY<span></span></div>
          <h1>THE GRAND<br /><em>PHYSICS</em><br />SANDBOX</h1>
          <p class="intro-lede">Six biomes. Seventeen working experiments. A small universe with rules you can test. Observe closely, adjust the apparatus, and prove what you understand.</p>
          <div class="intro-stats">
            <span><b>17</b>experiments</span><span><b>06</b>biomes</span><span><b>06</b>instruments</span><span><b>17</b>discovery badges</span>
          </div>
          <div class="intro-actions">
            <button class="enter-button" id="enter-button"><span>ENTER THE SANDBOX</span>${ICONS.arrow}</button>
            <span class="intro-hint">WASD + mouse to explore · E inspect · M atlas · H manual<br />Click to capture the mouse · Esc releases it</span>
          </div>
          <div class="intro-biomes">${biomeChips}</div>
          <div class="intro-progress" id="intro-progress">EXPEDITION 00 / 17 · NEW FIELD LOG</div>
        </div>
        <div class="intro-footer">
          <span>HALL OF CONSTANTS · FLOATING ISLAND 117</span>
          <span>c 299,792,458 m/s · g 9.81 m/s² · h 6.626 × 10⁻³⁴ J·s</span>
        </div>
      </section>

      <section class="overlay map-overlay" id="map-overlay" hidden>
        <div class="modal map-shell">
          <header class="modal-head">
            <div><small>WORLD ATLAS · DISCOVERY NETWORK</small><h2>The Grand Physics Sandbox</h2></div>
            <div class="map-progress" id="map-progress"></div>
            <button class="icon-close" data-map-close title="Close atlas">${ICONS.close}</button>
          </header>
          <div class="map-layout">
            <div class="map-stage">
              <svg id="map-svg" viewBox="-124 -124 248 248" role="img" aria-label="Map of the floating physics island"></svg>
              <div class="map-legend"><span><i class="legend-you"></i>YOU</span><span><i class="legend-open"></i>STATION</span><span><i class="legend-solved"></i>DISCOVERED</span><span class="map-tip">CLICK ANY BEACON TO TRAVEL</span></div>
            </div>
            <aside class="map-side">
              <div class="map-side-head"><span>STATION DIRECTORY</span><b id="map-total">0 / 17</b></div>
              <div id="map-directory"></div>
              <button class="btn ghost wide" data-hub>${ICONS.map}<span>RETURN TO THE HALL OF CONSTANTS</span></button>
            </aside>
          </div>
        </div>
      </section>

      <section class="overlay book-overlay" id="book-overlay" hidden>
        <aside class="book-panel" id="book-panel">
          <header class="book-head">
            <div><small>INSTRUMENT 04 · WORLD ENVIRONMENT</small><h2>Environment Manipulator</h2></div>
            <button class="icon-close" data-book-close title="Close book">${ICONS.close}</button>
          </header>
          <div class="book-body">
            <p class="book-lede">The sandbox's six law-books all read from these three global fields. Change them and every apparatus must reconsider its answer.</p>
            <div class="gravity-display">
              <span class="gravity-ring"><i></i><i></i><i></i></span>
              <div><small>LOCAL GRAVITY</small><b id="book-gravity">9.81 <em>m/s²</em></b><span id="book-gravity-preset">TERRESTRIAL</span></div>
              <span class="gravity-arrow">↓</span>
            </div>
            <section class="book-section">
              <div class="book-section-head"><h3>Gravity</h3><output id="book-gravity-value">9.81 m/s²</output></div>
              <div class="preset-grid" id="gravity-presets">
                ${(['zero', 'moon', 'earth', 'jupiter'] as GravityPreset[])
                  .map(
                    (preset) =>
                      `<button data-gravity="${preset}"><b>${GRAVITY_PRESETS[preset].short}</b><span>${GRAVITY_PRESETS[preset].value.toFixed(2)}</span></button>`,
                  )
                  .join('')}
              </div>
              <label class="range-row"><span>Fine field</span><input type="range" id="book-gravity-slider" min="0" max="24.79" step="0.01" /><output id="book-gravity-slider-value">9.81</output></label>
              <p class="section-note">Weight changes; inertia does not. A feather and an anvil still agree in vacuum.</p>
            </section>
            <section class="book-section">
              <div class="book-section-head"><h3>Atmosphere</h3><output id="book-air-value">ATMOSPHERE</output></div>
              <div class="segmented" id="air-presets">
                <button data-air="atmosphere">ATMOSPHERE</button><button data-air="vacuum">VACUUM</button>
              </div>
              <label class="range-row"><span>Air density ρ</span><input type="range" id="book-air-slider" min="0" max="3" step="0.005" /><output id="book-air-slider-value">1.225</output></label>
              <p class="section-note">Drag grows with ρ and with the square of speed. Bowls, pendulums and vacuum towers notice immediately.</p>
            </section>
            <section class="book-section">
              <div class="book-section-head"><h3>Friction</h3><output id="book-friction-value">ROUGH</output></div>
              <div class="segmented" id="friction-presets">
                <button data-friction="frictionless">FRICTIONLESS</button><button data-friction="rough">ROUGH</button>
              </div>
              <label class="range-row"><span>Surface μ</span><input type="range" id="book-friction-slider" min="0" max="1" step="0.01" /><output id="book-friction-slider-value">0.55</output></label>
              <p class="section-note">Friction converts ordered motion into thermal energy. Watch collision carts and inclined tracks reveal it.</p>
            </section>
            <section class="book-section">
              <div class="book-section-head"><h3>World Time & Sky</h3><output id="book-time-value">12:00 (Day Mode - Default)</output></div>
              <div class="preset-grid time-preset-grid" id="sky-time-presets">
                <button data-sky-time="dawn"><b>DAWN</b><span>06:00</span></button>
                <button data-sky-time="noon" class="active"><b>NOON (DAY)</b><span>12:00</span></button>
                <button data-sky-time="sunset"><b>DUSK</b><span>18:00</span></button>
                <button data-sky-time="midnight"><b>NIGHT</b><span>00:00</span></button>
              </div>
              <label class="range-row"><span>Time of Day</span><input type="range" id="book-time-slider" min="0" max="24" step="0.25" value="12.0" /><output id="book-time-slider-value">12:00</output></label>
              <label class="toggle-row">
                <span>Realtime Day/Night Cycle (8-min cycle)</span>
                <input type="checkbox" id="book-time-cycle-toggle" />
              </label>
              <p class="section-note">Controls the Sun and Moon celestial orbits, atmospheric scattering, starry twilight, and shadows.</p>
            </section>
            <div class="book-readout">
              <span>ACTIVE FIELD</span>
              <code id="book-summary">g 9.81 · ρ 1.225 · μ 0.55</code>
            </div>
          </div>
          <footer class="book-foot">
            <button class="btn ghost" id="book-reset">RESET TO EARTH</button>
            <button class="btn primary" data-book-close>RETURN TO FIELD</button>
          </footer>
        </aside>
      </section>

      <section class="overlay help-overlay" id="help-overlay" hidden>
        <div class="modal manual-shell">
          <header class="modal-head">
            <div><small>FIELD MANUAL · REV 1.0</small><h2>How to study a universe</h2></div>
            <button class="icon-close" data-help-close title="Close manual">${ICONS.close}</button>
          </header>
          <div class="manual-body">
            <div class="manual-hero">
              <span class="manual-glyph">◈</span>
              <p>Every station is a loop: <b>OBSERVE</b> the guided demonstration, <b>TINKER</b> with the variables, then <b>SOLVE</b> a mastery trial to seal a discovery badge. The laws are honest; the apparatus is yours to break.</p>
            </div>
            <div class="manual-grid">
              <section>
                <h3>Six field instruments</h3>
                <ol class="manual-tools">
                  <li><b>Vector Vision Goggles</b><span>Reveal velocity, acceleration, gravity, normal and friction arrows. Toggle with V.</span></li>
                  <li><b>Time-Dilation Controller</b><span>Pause, slow to 0.10× or 0.04×, frame-step, or rewind. P pauses, T cycles slow motion, F advances a frame, R rewinds.</span></li>
                  <li><b>Telemetry Inspector Wand</b><span>Aim at a moving body to read speed, acceleration, mass, momentum, kinetic and potential energy.</span></li>
                  <li><b>Environment Manipulator</b><span>Override gravity, atmosphere, surface friction and sky time for the entire island. Press K.</span></li>
                  <li><b>Graph Spawner Block</b><span>Deploy a physical chart board that records position, speed and energy in real time. Press G.</span></li>
                  <li><b>Voxel Builder</b><span>Mine and place material blocks with live physics. Press B; left-click mines, right-click places, scroll selects, I opens the inventory.</span></li>
                </ol>
              </section>
              <section>
                <h3>Field controls</h3>
                <dl class="key-table">
                  <div><dt><kbd>WASD</kbd></dt><dd>Walk beneath the apparatus</dd></div>
                  <div><dt><kbd>SHIFT</kbd></dt><dd>Sprint the brass paths</dd></div>
                  <div><dt><kbd>SPACE</kbd></dt><dd>Jump — try it under lunar gravity</dd></div>
                  <div><dt><kbd>E</kbd></dt><dd>Inspect the nearest experiment</dd></div>
                  <div><dt><kbd>ESC</kbd></dt><dd>Release controls / close a panel</dd></div>
                  <div><dt><kbd>M</kbd></dt><dd>World atlas and fast travel</dd></div>
                  <div><dt><kbd>H</kbd></dt><dd>This manual</dd></div>
                  <div><dt><kbd>K</kbd></dt><dd>Environment Manipulator</dd></div>
                  <div><dt><kbd>B</kbd></dt><dd>Toggle the Creative Voxel Builder</dd></div>
                  <div><dt><kbd>⇧B</kbd></dt><dd>Toggle Blender 3D view / Voxel mode</dd></div>
                  <div><dt><kbd>TAB</kbd></dt><dd>Minimize / expand experiment panel</dd></div>
                  <div><dt><kbd>I</kbd></dt><dd>Creative materials inventory</dd></div>
                  <div><dt><kbd>N</kbd></dt><dd>Toggle day / night lighting</dd></div>
                  <div><dt><kbd>G</kbd></dt><dd>Spawn or retract graph board</dd></div>
                  <div><dt><kbd>V</kbd></dt><dd>Toggle vector goggles</dd></div>
                  <div><dt><kbd>P</kbd></dt><dd>Pause / resume apparatus time</dd></div>
                  <div><dt><kbd>T</kbd></dt><dd>Cycle 0.10× / 0.04× slow motion</dd></div>
                  <div><dt><kbd>F</kbd> <kbd>R</kbd></dt><dd>Step one frame / rewind</dd></div>
                  <div><dt><kbd>1–6</kbd></dt><dd>Select an instrument</dd></div>
                  <div><dt><kbd>DRAG</kbd></dt><dd>Orbit the focused apparatus</dd></div>
                  <div><dt><kbd>WHEEL</kbd></dt><dd>Adjust inspection distance</dd></div>
                </dl>
              </section>
            </div>
            <div class="manual-route">
              <span class="card-kicker">RECOMMENDED ROUTE</span>
              <div class="route-steps">
                <span><b>01</b>Mechanics · motion</span><span><b>02</b>Fluids · pressure</span><span><b>03</b>Charge · fields</span>
                <span><b>04</b>Waves · light</span><span><b>05</b>Spacetime · clocks</span><span><b>06</b>Quanta · probability</span>
              </div>
            </div>
            <div class="manual-note">The Atlas can teleport you to any beacon. Discovery badges persist in this browser. Nothing here is graded; curiosity is the only prerequisite.</div>
          </div>
          <footer class="modal-foot"><button class="btn primary" data-help-close>RETURN TO THE FIELD</button></footer>
        </div>
      </section>

      <section class="overlay badge-overlay" id="badge-overlay" hidden>
        <div class="badge-aura"></div>
        <div class="confetti" id="confetti"></div>
        <div class="badge-card" id="badge-card">
          <span class="badge-kicker">DISCOVERY SEALED</span>
          <div class="badge-emblem" id="badge-emblem">◈</div>
          <h2 id="badge-name">Badge Name</h2>
          <p id="badge-trial">Trial complete</p>
          <div class="badge-meta"><span id="badge-number">EXPERIMENT 0.0</span><span id="badge-progress">01 / 17 DISCOVERIES</span></div>
          <button class="btn primary wide" id="badge-continue">RETURN TO THE APPARATUS</button>
        </div>
      </section>

      <section class="overlay inventory-overlay" id="inventory-overlay" hidden>
        <div class="modal inventory-modal">
          <header class="modal-head">
            <div class="inv-head-left">
              <span class="inv-icon">${ICONS.crate}</span>
              <div>
                <small>CREATIVE MATERIALS · VOXEL WORKBENCH</small>
                <h2>Voxel Blocks & Physics Materials</h2>
              </div>
            </div>
            <button class="icon-close" data-inv-close title="Close inventory (Esc / E / I)">${ICONS.close}</button>
          </header>

          <div class="inventory-categories" id="inv-categories">
            <button class="inv-cat active" data-cat="all">ALL (14)</button>
            <button class="inv-cat" data-cat="natural">NATURAL</button>
            <button class="inv-cat" data-cat="mineral">MINERALS</button>
            <button class="inv-cat" data-cat="special">PHYSICS</button>
          </div>

          <div class="inventory-layout">
            <div class="inventory-grid" id="inv-grid"></div>

            <aside class="inventory-inspector" id="inv-inspector">
              <div class="inspector-card">
                <div class="inspector-preview" id="inv-inspect-preview"></div>
                <h3 id="inv-inspect-title">Grass Block</h3>
                <span class="inv-inspect-id" id="inv-inspect-id">physicraft:grass</span>
                <p class="inv-inspect-desc" id="inv-inspect-desc">Lush organic surface layer with soft soil foundation.</p>
                <div class="inv-props" id="inv-inspect-props"></div>
                <button class="btn primary" id="inv-select-btn">EQUIP IN HAND</button>
              </div>
            </aside>
          </div>

          <footer class="inventory-foot">
            <div class="inv-stats" id="inv-stats">
              <span>Placed: <b id="inv-placed-count">0</b> blocks</span>
            </div>
            <div class="inv-actions">
              <button class="btn ghost danger" id="inv-clear-blocks">CLEAR ALL PLACED BLOCKS</button>
              <button class="btn primary" data-inv-close>CLOSE INVENTORY</button>
            </div>
          </footer>
        </div>
      </section>

      <section class="overlay pioneers-overlay" id="pioneers-overlay" hidden>
        <div class="modal pioneers-modal">
          <header class="modal-head">
            <div class="pioneers-head-left">
              <span class="pioneers-icon">🏛️</span>
              <div>
                <small>HALL OF PIONEERS · HISTORICAL ARCHIVE</small>
                <h2>The Founders & Master Laws of Physics</h2>
              </div>
            </div>
            <button class="icon-close" data-pioneers-close title="Close archive (Esc / L)">${ICONS.close}</button>
          </header>

          <div class="pioneers-categories" id="pioneers-categories">
            <button class="pioneers-cat active" data-cat="all">ALL (28)</button>
            <button class="pioneers-cat" data-cat="classical">MECHANICS (6)</button>
            <button class="pioneers-cat" data-cat="thermo">THERMODYNAMICS (4)</button>
            <button class="pioneers-cat" data-cat="electro">ELECTROMAGNETISM (5)</button>
            <button class="pioneers-cat" data-cat="optics">OPTICS & WAVES (4)</button>
            <button class="pioneers-cat" data-cat="relativity">RELATIVITY & GRAVITY (4)</button>
            <button class="pioneers-cat" data-cat="quantum">QUANTUM & MODERN (5)</button>
          </div>

          <div class="pioneers-body">
            <div class="pioneers-grid" id="pioneers-grid"></div>
          </div>
        </div>
      </section>

      <section class="overlay guide-overlay" id="guide-overlay" hidden>
        <div class="modal guide-modal">
          <header class="modal-head">
            <div class="guide-head-left">
              <span class="guide-icon">🧭</span>
              <div>
                <small>EXPEDITION STARTER CURRICULUM & ROADMAP</small>
                <h2>The 6 Realms of Physics · Field Guide</h2>
              </div>
            </div>
            <button class="icon-close" data-guide-close title="Close guide (Esc)">${ICONS.close}</button>
          </header>
          <div class="guide-intro-banner">
            <p>Welcome, Explorer. Follow this curated path across the 6 realms of physics. Click <b>WARP</b> to teleport instantly to any apparatus, or click <b>TRACK</b> to lock it onto your Top-Left Radar and Compass.</p>
          </div>
          <div class="guide-body">
            <div class="guide-grid" id="guide-grid"></div>
          </div>
        </div>
      </section>

      <section class="overlay scholar-overlay" id="scholar-overlay" hidden>
        <div class="modal scholar-modal">
          <header class="modal-head scholar-head">
            <div class="scholar-head-left">
              <span class="scholar-badge">📜 HISTORICAL TREATISE & THEORIST DISCOURSE</span>
              <h2 id="scholar-name">Sir Isaac Newton</h2>
              <span class="scholar-meta" id="scholar-meta">1643 – 1727 · Classical Dynamics & Universal Gravitation</span>
            </div>
            <button class="icon-close" data-scholar-close title="Close dialogue (Esc)">${ICONS.close}</button>
          </header>

          <div class="scholar-body">
            <div class="scholar-sidebar">
              <div class="scholar-portrait-frame">
                <img id="scholar-portrait-img" src="/portraits/newton_raw.jpg" alt="Scholar Portrait" />
              </div>
              <div class="scholar-citation">
                <small>HISTORIC TREATISE</small>
                <strong id="scholar-treatise-title">Philosophiæ Naturalis Principia Mathematica</strong>
                <span id="scholar-treatise-year">London, 1687 (Royal Society)</span>
              </div>
            </div>

            <div class="scholar-content">
              <blockquote class="scholar-quote" id="scholar-quote">
                "If I have seen further, it is by standing on the shoulders of Giants."
              </blockquote>

              <div class="scholar-law-card">
                <small>GOVERNING MATHEMATICAL FORMULATION</small>
                <div class="scholar-equation-wrap">
                  <code class="scholar-equation" id="scholar-equation">F = dp/dt = m·a</code>
                </div>
                <p class="scholar-subformula" id="scholar-subformula">In an isolated system, total linear momentum Σ p is strictly conserved across all collisions.</p>
              </div>

              <div class="scholar-narrative">
                <h4>Authentic Theoretical Discourse</h4>
                <p id="scholar-narrative-text">
                  Welcome, scholar. Here in Sector 01, we study how motion persists unchanged unless compelled by an impressed force.
                </p>
              </div>

              <div class="scholar-footer">
                <button class="btn primary scholar-warp-btn" id="scholar-warp-btn">
                  <span>🔬</span> <span id="scholar-warp-label">Examine Momentum Collision Laboratory</span>
                </button>
                <button class="btn ghost" data-scholar-close>Return to Rotunda</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Interactive Surveyor's Theodolite Optical Sighting Reticle -->
      <div class="theodolite-reticle-overlay" id="theodolite-reticle-overlay" hidden>
        <div class="theodolite-vignette"></div>
        <div class="theodolite-scope">
          <div class="theodolite-lens-border"></div>
          <svg class="theodolite-crosshair-svg" viewBox="-200 -200 400 400">
            <!-- Ballistic Stadia Crosshairs & Mil-dots -->
            <line x1="-190" y1="0" x2="190" y2="0" stroke="rgba(212, 175, 55, 0.75)" stroke-width="1.5" />
            <line x1="0" y1="-190" x2="0" y2="190" stroke="rgba(212, 175, 55, 0.75)" stroke-width="1.5" />
            <circle cx="0" cy="0" r="18" fill="none" stroke="rgba(212, 175, 55, 0.9)" stroke-width="1.2" />
            <circle cx="0" cy="0" r="2.5" fill="rgba(212, 175, 55, 0.95)" />
            <!-- Horizontal Mil-dot Graduation Ticks -->
            <line x1="-40" y1="-4" x2="-40" y2="4" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-80" y1="-7" x2="-80" y2="7" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-120" y1="-4" x2="-120" y2="4" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-160" y1="-10" x2="-160" y2="10" stroke="rgba(212, 175, 55, 0.85)" stroke-width="1.4" />
            <line x1="40" y1="-4" x2="40" y2="4" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="80" y1="-7" x2="80" y2="7" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="120" y1="-4" x2="120" y2="4" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="160" y1="-10" x2="160" y2="10" stroke="rgba(212, 175, 55, 0.85)" stroke-width="1.4" />
            <!-- Vertical Mil-dot Graduation Ticks -->
            <line x1="-4" y1="40" x2="4" y2="40" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-7" y1="80" x2="7" y2="80" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-4" y1="120" x2="4" y2="120" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-10" y1="160" x2="10" y2="160" stroke="rgba(212, 175, 55, 0.85)" stroke-width="1.4" />
            <line x1="-4" y1="-40" x2="4" y2="-40" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-7" y1="-80" x2="7" y2="-80" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-4" y1="-120" x2="4" y2="-120" stroke="rgba(212, 175, 55, 0.7)" stroke-width="1.2" />
            <line x1="-10" y1="-160" x2="10" y2="-160" stroke="rgba(212, 175, 55, 0.85)" stroke-width="1.4" />
          </svg>

          <!-- Top Header: Sighting Station Name & Magnification -->
          <div class="theodolite-header">
            <span class="theodolite-badge">OPTICAL GEODETIC TRANSIT · 4× MAGNIFICATION</span>
            <h3 id="theodolite-title">Mechanics Canyon Theodolite</h3>
          </div>

          <!-- Bottom Telemetry HUD -->
          <div class="theodolite-telemetry">
            <div class="theodolite-metric">
              <small>AZIMUTH BEARING</small>
              <span id="theodolite-azimuth">210.4° SSW</span>
            </div>
            <div class="theodolite-metric">
              <small>ALTITUDE ELEVATION</small>
              <span id="theodolite-elevation">-08.6° EL</span>
            </div>
            <div class="theodolite-metric prompt" id="theodolite-exit-prompt">
              <small>TRANSIT CONTROLS</small>
              <span>[E] / [Esc] STEP BACK</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private cacheElements(): void {
    const q = <T extends HTMLElement>(selector: string): T => this.root.querySelector<T>(selector)!;
    this.hud = q('#hud');
    this.intro = q('#intro');
    this.stationPanel = q('#station-panel');
    this.mapOverlay = q('#map-overlay');
    this.bookOverlay = q('#book-overlay');
    this.bookPanel = q('#book-panel');
    this.helpOverlay = q('#help-overlay');
    this.badgeOverlay = q('#badge-overlay');
    this.inventoryOverlay = q('#inventory-overlay');
    this.pioneersOverlay = q('#pioneers-overlay');
    this.guideOverlay = q('#guide-overlay');
    this.scholarOverlay = q('#scholar-overlay');
    this.scholarName = q('#scholar-name');
    this.scholarMeta = q('#scholar-meta');
    this.scholarPortraitImg = q('#scholar-portrait-img');
    this.scholarTreatiseTitle = q('#scholar-treatise-title');
    this.scholarTreatiseYear = q('#scholar-treatise-year');
    this.scholarQuote = q('#scholar-quote');
    this.scholarEquation = q('#scholar-equation');
    this.scholarSubFormula = q('#scholar-subformula');
    this.scholarNarrativeText = q('#scholar-narrative-text');
    this.scholarWarpBtn = q('#scholar-warp-btn');
    this.scholarWarpLabel = q('#scholar-warp-label');
    this.theodoliteReticleOverlay = q('#theodolite-reticle-overlay');
    this.theodoliteTitle = q('#theodolite-title');
    this.theodoliteAzimuth = q('#theodolite-azimuth');
    this.theodoliteElevation = q('#theodolite-elevation');
    this.lanternChip = q('#lantern-chip');
    this.lanternLabel = q('#lantern-label');
    this.pausePrompt = q('#pause-prompt');
    this.toastStack = q('#toast-stack');
    this.mapSvg = this.root.querySelector<SVGSVGElement>('#map-svg')!;
    this.minimapSvg = this.root.querySelector<SVGSVGElement>('#minimap-svg')!;
    this.compassRibbon = q('#compass-ribbon');
    this.compassPins = q('#compass-pins');
    this.compassBearingLabel = q('#compass-bearing-label');
  }

  private bindEvents(): void {
    this.root.querySelector('#enter-button')?.addEventListener('click', () => {
      this.introOpen = false;
      this.intro.classList.add('is-hidden');
      document.body.classList.add('started');
      this.hud.setAttribute('aria-hidden', 'false');
      this.callbacks.onStart();
    });
    this.root.querySelector('#pause-prompt')?.addEventListener('click', () => this.callbacks.onResume());
    this.root.querySelector('#tour-chip')?.addEventListener('click', () => this.openGuide());
    this.root.querySelector('#minimap-tour-btn')?.addEventListener('click', () => this.openGuide());
    this.root.querySelector('#minimap-expand-btn')?.addEventListener('click', () => this.callbacks.onOpenMap());
    this.root.querySelector('#minimap-zoom-btn')?.addEventListener('click', () => {
      this.minimapZoom = this.minimapZoom === 1 ? 2.5 : 1;
      const btn = this.root.querySelector<HTMLButtonElement>('#minimap-zoom-btn');
      if (btn) btn.textContent = this.minimapZoom === 1 ? '1×' : '2.5×';
      this.updateMinimap(this.playerPosition.x, this.playerPosition.z, this.playerPosition.yaw);
    });
    this.root.querySelector('#minimap-warp-btn')?.addEventListener('click', () => {
      const targetId = this.selectedWaypointId ?? this.nearestStation?.id;
      if (targetId) this.travel(targetId);
    });
    this.minimapSvg.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<Element>('[data-station-id]');
      if (target) {
        const stId = target.getAttribute('data-station-id');
        if (stId) this.setWaypoint(stId);
        return;
      }
      const hub = (event.target as HTMLElement).closest<Element>('[data-hub]');
      if (hub) this.travel('hub');
    });
    this.minimapSvg.addEventListener('dblclick', (event) => {
      const target = (event.target as HTMLElement).closest<Element>('[data-station-id]');
      if (target) {
        const stId = target.getAttribute('data-station-id');
        if (stId) this.travel(stId);
      }
    });
    this.root.querySelectorAll('[data-guide-close]').forEach((btn) =>
      btn.addEventListener('click', () => this.closeGuide()),
    );
    this.guideOverlay.addEventListener('click', (event) => {
      if (event.target === this.guideOverlay) this.closeGuide();
    });
    this.root.querySelectorAll<HTMLElement>('[data-ui-hint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hint = btn.dataset.uiHint;
        if (hint === 'atlas') this.callbacks.onOpenMap();
        else if (hint === 'model') this.callbacks.onToggleBlenderModel?.();
        else if (hint === 'pioneers') this.openPioneers();
        else if (hint === 'guide') this.openGuide();
      });
    });
    this.root.querySelector('#daynight-chip')?.addEventListener('click', () => this.callbacks.onToggleDayNight?.());
    this.root.querySelector('#pioneers-chip')?.addEventListener('click', () => this.openPioneers());
    this.root.querySelector('#model-chip')?.addEventListener('click', () => this.callbacks.onToggleBlenderModel?.());
    this.root.querySelector('#env-chip')?.addEventListener('click', () => this.callbacks.onOpenBook());
    this.root.querySelector('[data-ui="atlas"]')?.addEventListener('click', () => this.callbacks.onOpenMap());
    this.root.querySelector('[data-ui="manual"]')?.addEventListener('click', () => this.callbacks.onOpenHelp());
    this.root.querySelector('#book-reset')?.addEventListener('click', () => {
      const env: EnvironmentState = {
        gravity: 9.81,
        gravityPreset: 'earth',
        air: 'atmosphere',
        friction: 'rough',
        airDensity: 1.225,
        frictionCoefficient: 0.55,
      };
      this.bookEnv = env;
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...env });
    });

    this.root.querySelectorAll<HTMLElement>('[data-map-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeMap()),
    );
    this.root.querySelectorAll<HTMLElement>('[data-help-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeHelp()),
    );
    this.root.querySelectorAll<HTMLElement>('[data-book-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeBook()),
    );
    this.root.querySelector('[data-hub]')?.addEventListener('click', () => this.travel('hub'));
    this.root.querySelector('#badge-continue')?.addEventListener('click', () => {
      this.badgeOverlay.hidden = true;
      this.badgeOpen = false;
      this.syncBodyClasses();
      this.callbacks.onBadgeContinue();
    });

    this.mapOverlay.addEventListener('click', (event) => {
      if (event.target === this.mapOverlay) this.closeMap();
    });
    this.helpOverlay.addEventListener('click', (event) => {
      if (event.target === this.helpOverlay) this.closeHelp();
    });
    this.bookOverlay.addEventListener('click', (event) => {
      if (event.target === this.bookOverlay) this.closeBook();
    });

    this.root.querySelector('#book-overlay')?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-book-close]')) return;
    });

    this.root.querySelectorAll<HTMLElement>('[data-inv-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeInventory()),
    );
    this.root.querySelector('#btn-open-creative-inv')?.addEventListener('click', () => this.openInventory());
    this.inventoryOverlay.addEventListener('click', (event) => {
      if (event.target === this.inventoryOverlay) this.closeInventory();
    });

    this.root.querySelectorAll<HTMLElement>('[data-pioneers-close]').forEach((button) =>
      button.addEventListener('click', () => this.closePioneers()),
    );
    this.pioneersOverlay.addEventListener('click', (event) => {
      if (event.target === this.pioneersOverlay) this.closePioneers();
    });

    this.root.querySelectorAll<HTMLElement>('[data-scholar-close]').forEach((button) =>
      button.addEventListener('click', () => this.closeScholar()),
    );
    this.scholarOverlay.addEventListener('click', (event) => {
      if (event.target === this.scholarOverlay) this.closeScholar();
    });
    this.scholarWarpBtn.addEventListener('click', () => {
      if (this.activeScholarDialogue) {
        const stationId = this.activeScholarDialogue.stationId;
        this.closeScholar();
        this.callbacks.onTravel(stationId);
      }
    });

    this.lanternChip.addEventListener('click', () => {
      this.callbacks.onToggleLantern?.();
    });

    this.root.querySelector('#theodolite-exit-prompt')?.addEventListener('click', () => {
      this.callbacks.onExitTheodolite?.();
    });
    this.root.querySelectorAll<HTMLButtonElement>('#pioneers-categories button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.root.querySelectorAll('#pioneers-categories button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.pioneersCategory = btn.dataset.cat || 'all';
        this.renderPioneers();
      });
    });

    this.bindBookControls();
    this.bindTimeControls();
    this.bindHotbar();
    this.bindVoxelPalette();
    this.bindInventory();
    this.bindMapDelegation();
    this.bindBadgeTilt();
  }

  private bindBookControls(): void {
    this.root.querySelector('#gravity-presets')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-gravity]');
      if (!button || !this.bookEnv) return;
      const preset = button.dataset.gravity as GravityPreset;
      this.bookEnv.gravity = GRAVITY_PRESETS[preset].value;
      this.bookEnv.gravityPreset = preset;
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });
    this.root.querySelector('#book-gravity-slider')?.addEventListener('input', (event) => {
      if (!this.bookEnv) return;
      const value = Number((event.target as HTMLInputElement).value);
      this.bookEnv.gravity = value;
      this.bookEnv.gravityPreset = 'custom';
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });
    this.root.querySelector('#air-presets')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-air]');
      if (!button || !this.bookEnv) return;
      this.bookEnv.air = button.dataset.air as 'atmosphere' | 'vacuum';
      this.bookEnv.airDensity = this.bookEnv.air === 'vacuum' ? 0 : Math.max(0.2, this.bookEnv.airDensity || 1.225);
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });
    this.root.querySelector('#book-air-slider')?.addEventListener('input', (event) => {
      if (!this.bookEnv) return;
      const value = Number((event.target as HTMLInputElement).value);
      this.bookEnv.airDensity = value;
      this.bookEnv.air = value <= 0.001 ? 'vacuum' : 'atmosphere';
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });
    this.root.querySelector('#friction-presets')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-friction]');
      if (!button || !this.bookEnv) return;
      this.bookEnv.friction = button.dataset.friction as 'frictionless' | 'rough';
      this.bookEnv.frictionCoefficient = this.bookEnv.friction === 'frictionless' ? 0 : Math.max(0.1, this.bookEnv.frictionCoefficient || 0.55);
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });
    this.root.querySelector('#book-friction-slider')?.addEventListener('input', (event) => {
      if (!this.bookEnv) return;
      const value = Number((event.target as HTMLInputElement).value);
      this.bookEnv.frictionCoefficient = value;
      this.bookEnv.friction = value <= 0.001 ? 'frictionless' : 'rough';
      this.renderBook();
      this.callbacks.onEnvironmentChange({ ...this.bookEnv });
    });

    this.root.querySelector('#sky-time-presets')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-sky-time]');
      if (!button) return;
      const preset = button.dataset.skyTime;
      let h = 12;
      if (preset === 'dawn') h = 6;
      else if (preset === 'noon') h = 12;
      else if (preset === 'sunset') h = 18;
      else if (preset === 'midnight') h = 0;
      this.currentTimeOfDay = h;
      this.renderBook();
      this.callbacks.onSetTimeOfDay?.(h);
    });

    this.root.querySelector('#book-time-slider')?.addEventListener('input', (event) => {
      const h = Number((event.target as HTMLInputElement).value);
      this.currentTimeOfDay = h;
      this.renderBook();
      this.callbacks.onSetTimeOfDay?.(h);
    });

    this.root.querySelector('#book-time-cycle-toggle')?.addEventListener('change', (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      this.dayCycleActive = checked;
      this.callbacks.onToggleDayCycle?.(checked);
    });
  }

  private bindTimeControls(): void {
    this.root.querySelector('.time-buttons')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-time]');
      if (!button) return;
      switch (button.dataset.time) {
        case 'pause':
          this.callbacks.onTimeTogglePause();
          break;
        case 'slow':
          this.callbacks.onTimeCycleSlow();
          break;
        case 'step':
          this.callbacks.onTimeStep();
          break;
        case 'rewind':
          this.callbacks.onTimeRewind();
          break;
      }
    });
  }

  private bindHotbar(): void {
    this.root.querySelector('#hotbar')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool]');
      if (!button) return;
      const tool = button.dataset.tool as ToolId;
      this.setTool(tool);
      this.callbacks.onToolSelect(tool);
    });
  }

  private bindVoxelPalette(): void {
    this.root.querySelector('#voxel-palette-bar')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-voxel-block]');
      if (!button) return;
      const block = button.dataset.voxelBlock as VoxelBlockType;
      this.setActiveVoxelBlock(block);
      this.callbacks.onBlockSelect?.(block);
    });
  }

  private bindMapDelegation(): void {
    const handler = (event: Event) => {
      const target = event.target as Element;
      const stationNode = target.closest<SVGElement | HTMLElement>('[data-station]');
      if (stationNode) {
        this.travel(stationNode.getAttribute('data-station') ?? '');
        return;
      }
      const hub = target.closest<Element>('[data-hub]');
      if (hub) this.travel('hub');
    };
    this.mapSvg.addEventListener('click', handler);
    this.mapSvg.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handler(event);
      }
    });
    this.root.querySelector('#map-directory')?.addEventListener('click', handler);
  }

  private bindBadgeTilt(): void {
    const card = this.root.querySelector('#badge-card');
    if (!card) return;
    this.badgeOverlay.addEventListener('pointermove', (event) => {
      if (!this.badgeOpen) return;
      const rect = this.badgeOverlay.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      (card as HTMLElement).style.setProperty('--ry', `${x * 9}deg`);
      (card as HTMLElement).style.setProperty('--rx', `${-y * 7}deg`);
    });
  }

  private travel(id: string): void {
    this.hideMap(false);
    if (id === 'hub') this.callbacks.onTravelHub();
    else this.callbacks.onTravel(id);
  }

  // ---------------------------------------------------------------------------
  // Intro and HUD
  // ---------------------------------------------------------------------------

  private renderIntroBiomes(): void {
    void BIOMES;
  }

  setIntroProgress(solved: number, total: number): void {
    const node = this.root.querySelector('#intro-progress');
    if (!node) return;
    node.textContent =
      solved > 0
        ? `EXPEDITION RESUMED · ${String(solved).padStart(2, '0')} / ${String(total).padStart(2, '0')} DISCOVERIES`
        : `EXPEDITION 00 / ${String(total).padStart(2, '0')} · NEW FIELD LOG`;
    const button = this.root.querySelector('#enter-button span');
    if (button) button.textContent = solved > 0 ? 'CONTINUE THE EXPEDITION' : 'ENTER THE SANDBOX';
  }

  hideIntro(): void {
    this.introOpen = false;
    this.intro.classList.add('is-hidden');
    document.body.classList.add('started');
    this.hud.setAttribute('aria-hidden', 'false');
  }

  get isIntroOpen(): boolean {
    return this.introOpen;
  }

  setZone(name: string, overline: string, accent: string, glyph = '◈'): void {
    const zone = this.root.querySelector<HTMLElement>('#zone-chip');
    const zoneName = this.root.querySelector<HTMLElement>('#zone-name');
    const zoneSub = this.root.querySelector<HTMLElement>('#zone-sub');
    const zoneGlyph = this.root.querySelector<HTMLElement>('#zone-glyph');
    if (zone) zone.style.setProperty('--accent', accent);
    if (zoneName) zoneName.textContent = name.toUpperCase();
    if (zoneSub) zoneSub.textContent = overline.toUpperCase();
    if (zoneGlyph) zoneGlyph.textContent = glyph;
  }

  configureStations(stations: MapStation[]): void {
    this.stations = stations;
    this.renderBadgeSegments();
    this.updateBadgeProgress();
    this.renderMinimap();
  }

  private renderBadgeSegments(): void {
    const container = this.root.querySelector('#badge-segments');
    if (!container) return;
    container.innerHTML = this.stations
      .map(
        (station) =>
          `<span class="badge-segment${station.solved ? ' solved' : ''}" style="--seg:${station.accent}" title="${esc(
            `${station.number} · ${station.shortTitle}${station.solved ? ' — discovered' : ''}`,
          )}"></span>`,
      )
      .join('');
  }

  updateBadgeProgress(): void {
    const solved = this.stations.filter((station) => station.solved).length;
    const total = this.stations.length || 17;
    const count = this.root.querySelector('#badge-count');
    if (count) count.textContent = `${String(solved).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    const segments = this.root.querySelectorAll('.badge-segment');
    this.stations.forEach((station, index) => segments[index]?.classList.toggle('solved', station.solved));
    const progress = this.root.querySelector('#map-progress');
    if (progress) progress.innerHTML = this.mapProgressMarkup(solved, total);
    const mapTotal = this.root.querySelector('#map-total');
    if (mapTotal) mapTotal.textContent = `${solved} / ${total}`;
    this.setIntroProgress(solved, total);
  }

  private mapProgressMarkup(solved: number, total: number): string {
    const percent = total > 0 ? (solved / total) * 100 : 0;
    return `<span><b>${String(solved).padStart(2, '0')}</b> / ${String(total).padStart(2, '0')} SEALED</span><div class="progress-bar"><i style="width:${percent}%"></i></div>`;
  }

  markStationSolved(id: string): void {
    const station = this.stations.find((item) => item.id === id);
    if (station) station.solved = true;
    this.renderBadgeSegments();
    this.updateBadgeProgress();
    if (this.mapOpen) this.renderMap();
    this.renderMinimap();
    if (this.guideOpen) this.renderGuide();
  }

  setFieldCard(data: { title: string; distance: number; meta: string; accent: string } | null): void {
    if (data) {
      this.nearestStation = this.stations.find((s) => data.title.includes(s.number)) ?? null;
    } else {
      this.nearestStation = null;
    }
    this.updateMinimap(this.playerPosition.x, this.playerPosition.z, this.playerPosition.yaw);

    const card = this.root.querySelector<HTMLElement>('#field-card');
    const name = this.root.querySelector<HTMLElement>('#field-name');
    const distance = this.root.querySelector<HTMLElement>('#field-distance');
    if (!card || !name || !distance) return;
    if (!data) {
      name.textContent = 'Between beacons';
      distance.textContent = 'Follow a brass path · M opens the atlas';
      return;
    }
    card.style.setProperty('--accent', data.accent);
    name.textContent = data.title;
    distance.textContent = `${data.meta} · ${data.distance.toFixed(0)} m`;
  }

  setInteract(
    data: {
      title: string;
      meta: string;
      accent: string;
      key?: string;
      eyebrow?: string;
    } | null,
  ): void {
    const prompt = this.root.querySelector<HTMLElement>('#interact-prompt');
    const name = this.root.querySelector<HTMLElement>('#interact-name');
    const meta = this.root.querySelector<HTMLElement>('#interact-meta');
    const kbd = prompt?.querySelector('kbd');
    const eyebrow = prompt?.querySelector('small');
    if (!prompt || !name || !meta) return;
    prompt.hidden = !data;
    if (!data) return;
    prompt.style.setProperty('--accent', data.accent);
    name.textContent = data.title;
    meta.textContent = data.meta;
    if (kbd) kbd.textContent = data.key ?? 'E';
    if (eyebrow) eyebrow.textContent = data.eyebrow ?? 'INSPECT EXPERIMENT';
  }

  setSeated(seated: boolean, seatName = 'Study Desk'): void {
    const banner = this.root.querySelector<HTMLElement>('#seated-banner');
    const title = this.root.querySelector<HTMLElement>('#seated-title');
    const desc = this.root.querySelector<HTMLElement>('#seated-desc');
    if (!banner) return;
    banner.hidden = !seated;
    if (seated) {
      if (title) title.textContent = `CONTEMPLATING · ${seatName.toUpperCase()}`;
      if (desc) desc.innerHTML = `Resting at study bench · Press <kbd>C</kbd> or <kbd>WASD</kbd> to stand`;
    }
  }

  setEnvironment(env: EnvironmentState): void {
    const gravity = this.root.querySelector('#env-gravity');
    const air = this.root.querySelector('#env-air');
    const density = this.root.querySelector('#env-air-density');
    const friction = this.root.querySelector('#env-friction');
    const coefficient = this.root.querySelector('#env-friction-coefficient');
    if (gravity) gravity.textContent = env.gravity.toFixed(2);
    if (air) air.textContent = env.air === 'vacuum' ? 'VACUUM' : 'ATMOS';
    if (density) density.textContent = env.airDensity.toFixed(3);
    if (friction) friction.textContent = env.friction === 'frictionless' ? 'SMOOTH' : 'ROUGH';
    if (coefficient) coefficient.textContent = env.frictionCoefficient.toFixed(2);
    if (this.bookOpen) {
      this.bookEnv = { ...env };
      this.renderBook();
    }
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.root.querySelectorAll<HTMLElement>('.hotbar-slot').forEach((slot) => {
      slot.classList.toggle('active', slot.dataset.tool === tool);
    });
    const spec = TOOLS[tool];
    const kicker = this.root.querySelector('#tool-kicker');
    const name = this.root.querySelector('#tool-name');
    const desc = this.root.querySelector('#tool-desc');
    if (kicker && spec) kicker.textContent = spec.kicker;
    if (name && spec) name.textContent = spec.name;
    if (desc && spec) desc.textContent = spec.description;
    document.body.dataset.tool = tool;
    const palette = this.root.querySelector<HTMLElement>('#voxel-palette-hud');
    if (palette) palette.hidden = tool !== 'block';
  }

  setActiveVoxelBlock(blockType: VoxelBlockType): void {
    this.root.querySelectorAll<HTMLElement>('.voxel-slot').forEach((slot) => {
      slot.classList.toggle('active', slot.dataset.voxelBlock === blockType);
    });
    const meta = VOXEL_BLOCKS[blockType];
    const desc = this.root.querySelector('#tool-desc');
    if (this.tool === 'block' && desc && meta) {
      desc.textContent = `Holding ${meta.name} · Left-Click to mine, Right-Click to place`;
    }
  }

  setVoxelPaletteVisible(visible: boolean): void {
    const palette = this.root.querySelector<HTMLElement>('#voxel-palette-hud');
    if (palette) palette.hidden = !visible;
  }

  setToolState(state: { goggles: boolean; graph: boolean }): void {
    this.gogglesEnabled = state.goggles;
    this.graphSpawned = state.graph;
    const gogglesSlot = this.root.querySelector<HTMLElement>('[data-tool="goggles"]');
    const graphSlot = this.root.querySelector<HTMLElement>('[data-tool="graph"]');
    gogglesSlot?.classList.toggle('engaged', state.goggles);
    graphSlot?.classList.toggle('engaged', state.graph);
    const gogglesState = gogglesSlot?.querySelector<HTMLElement>('.slot-state');
    if (gogglesState) gogglesState.textContent = state.goggles ? 'ON' : '';
    const graphState = graphSlot?.querySelector<HTMLElement>('.slot-state');
    if (graphState) graphState.textContent = state.graph ? 'OUT' : '';
    const legend = this.root.querySelector<HTMLElement>('#vector-legend');
    if (legend) legend.hidden = !state.goggles;
  }

  setWandReading(reading: WandReading | null): void {
    const card = this.root.querySelector<HTMLElement>('#wand-card');
    const reticle = this.root.querySelector<HTMLElement>('#reticle');
    if (!card || !reticle) return;
    card.hidden = !reading;
    reticle.classList.toggle('is-targeting', Boolean(reading));
    if (!reading) return;
    const set = (selector: string, value: string) => {
      const node = this.root.querySelector(selector);
      if (node) node.textContent = value;
    };
    set('#wand-label', reading.label);
    set('#wand-extra', reading.extra.map((entry) => `${entry.label} ${entry.value}`).join(' · '));
    set('#wand-speed', reading.speed.toFixed(2));
    set('#wand-accel', reading.acceleration.toFixed(2));
    set('#wand-mass', reading.mass < 0.1 ? reading.mass.toFixed(3) : reading.mass.toFixed(2));
    set('#wand-momentum', reading.momentum.toFixed(2));
    set('#wand-ke', reading.kinetic.toFixed(2));
    set('#wand-pe', reading.potential.toFixed(2));
    const totalE = reading.kinetic + reading.potential;
    set('#wand-total', totalE.toFixed(2));
    const keBar = this.root.querySelector<HTMLElement>('#wand-ke-bar');
    const peBar = this.root.querySelector<HTMLElement>('#wand-pe-bar');
    if (keBar && peBar) {
      const kePct = totalE > 1e-4 ? Math.max(0, Math.min(100, (reading.kinetic / totalE) * 100)) : 50;
      const pePct = totalE > 1e-4 ? Math.max(0, Math.min(100, (reading.potential / totalE) * 100)) : 50;
      keBar.style.width = `${kePct.toFixed(1)}%`;
      peBar.style.width = `${pePct.toFixed(1)}%`;
    }
    set(
      '#wand-position',
      `x ${reading.position.x.toFixed(2)} · y ${reading.position.y.toFixed(2)} · z ${reading.position.z.toFixed(2)}`,
    );
  }

  setTimeStatus(status: TimeStatus): void {
    this.timeStatus = status;
    const mode = this.root.querySelector<HTMLElement>('#time-mode');
    const clock = this.root.querySelector<HTMLElement>('#time-clock');
    const card = this.root.querySelector<HTMLElement>('#time-card');
    const fill = this.root.querySelector<HTMLElement>('#time-fill');
    const dot = this.root.querySelector<HTMLElement>('#time-dot');
    const rate = this.root.querySelector<HTMLElement>('#time-rate');
    if (!mode || !clock || !card || !fill || !dot || !rate) return;
    const labels: Record<TimeMode, string> = {
      flow: 'REAL TIME',
      slow: 'SLOW MOTION',
      'very-slow': 'DEEP SLOW',
      paused: 'FROZEN',
      rewind: 'REWINDING',
    };
    mode.textContent = labels[status.mode];
    card.dataset.mode = status.mode;
    clock.textContent = `T + ${status.sessionTime.toFixed(1)}s`;
    const max = Math.max(status.maxSessionTime, 0.001);
    const percent = clamp((status.sessionTime / max) * 100, 0, 100);
    fill.style.width = `${percent}%`;
    dot.style.left = `${percent}%`;
    rate.textContent = status.mode === 'flow' ? '1.00×' : status.mode === 'slow' ? '0.10×' : status.mode === 'very-slow' ? '0.04×' : status.mode === 'rewind' ? '−2.4×' : '0.00×';
    this.root.querySelectorAll<HTMLElement>('[data-time]').forEach((button) => {
      const name = button.dataset.time;
      button.classList.toggle(
        'active',
        (name === 'pause' && status.mode === 'paused') ||
          (name === 'slow' && (status.mode === 'slow' || status.mode === 'very-slow')) ||
          (name === 'rewind' && status.mode === 'rewind'),
      );
    });
  }

  setTimeCardVisible(visible: boolean): void {
    const card = this.root.querySelector<HTMLElement>('#time-card');
    if (!card) return;
    card.classList.toggle('is-idle', !visible);
    card.setAttribute('aria-hidden', String(!visible));
  }

  setPausePrompt(visible: boolean): void {
    this.pausePrompt.hidden = !visible;
  }

  toast(title: string, body: string, accent = '#7ef9ff', glyph = '◇', duration = 4200): void {
    const node = document.createElement('div');
    node.className = 'toast';
    node.style.setProperty('--accent', accent);
    node.innerHTML = `<span class="toast-glyph">${glyph}</span><div><b>${esc(title)}</b><p>${esc(body)}</p></div>`;
    this.toastStack.append(node);
    requestAnimationFrame(() => node.classList.add('show'));
    window.setTimeout(() => {
      node.classList.remove('show');
      window.setTimeout(() => node.remove(), 350);
    }, duration);
  }

  // ---------------------------------------------------------------------------
  // Station panel
  // ---------------------------------------------------------------------------

  openStation(station: Station, tab: StationTab = 'observe'): void {
    this.activeStation = station;
    this.stationOpen = true;
    this.stationMinimized = false;
    this.currentTab = tab;
    this.lastMetricKey = '';
    this.lastCueIndex = -2;
    this.stationPanel.classList.remove('minimized');
    this.stationPanel.classList.add('open');
    this.stationPanel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('station-open');
    this.renderStation();
    this.setTab(tab, false);
    this.syncBodyClasses();
  }

  closeStation(): void {
    if (!this.stationOpen) return;
    this.stationOpen = false;
    this.stationMinimized = false;
    this.stationPanel.classList.remove('open', 'minimized');
    this.stationPanel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('station-open');
    const station = this.activeStation;
    this.activeStation = null;
    this.syncBodyClasses();
    void station;
    this.callbacks.onCloseStation();
  }

  toggleStationMinimize(): void {
    if (!this.stationOpen) return;
    this.setStationMinimized(!this.stationMinimized);
  }

  setStationMinimized(minimized: boolean): void {
    if (!this.stationOpen) return;
    this.stationMinimized = minimized;
    this.stationPanel.classList.toggle('minimized', minimized);
    const minimizeBtn = this.stationPanel.querySelector('#station-minimize-toggle');
    if (minimizeBtn) {
      minimizeBtn.setAttribute('title', minimized ? 'Expand experiment info (Tab)' : 'Minimize experiment info (Tab)');
    }
    this.callbacks.onStationMinimizeChange?.(minimized);
  }

  get isStationMinimized(): boolean {
    return this.stationMinimized;
  }

  get isStationOpen(): boolean {
    return this.stationOpen;
  }

  get station(): Station | null {
    return this.activeStation;
  }

  private renderStation(): void {
    const station = this.activeStation;
    if (!station) return;
    const meta = station.experiment.meta;
    this.stationPanel.style.setProperty('--accent', meta.accent);
    this.stationPanel.style.setProperty('--accent-soft', `${meta.accent}22`);
    const controls = meta.controls.length
      ? `<div class="control-list">${meta.controls
          .map((control) => this.controlMarkup(control, station.experiment.params[control.id]))
          .join('')}</div>`
      : `<div class="empty-note">This apparatus has no tunable parameters. Its behaviour is entirely emergent — use time controls and the environment book to vary the conditions.</div>`;
    const cues = meta.observeCues.length
      ? `<ol class="cue-list">${meta.observeCues
          .map(
            (cue, index) =>
              `<li data-cue="${index}"><span>${String(index + 1).padStart(2, '0')}</span><div><p>${esc(cue.text)}</p><time>${cue.at.toFixed(1)} s</time></div></li>`,
          )
          .join('')}</ol>`
      : `<div class="empty-note">No scripted cues. Explore freely.</div>`;
    const solved = station.solved || station.experiment.solved;
    const content = `
      <div class="station-minimized-bar" id="station-minimized-bar">
        <div class="mini-info">
          <span class="station-index" style="--accent:${meta.accent}">${meta.number}</span>
          <span class="mini-title">${esc(meta.shortTitle || meta.title)}</span>
          <span class="mini-tab-badge" id="mini-tab-badge">${this.currentTab.toUpperCase()}</span>
        </div>
        <div class="mini-actions">
          <button class="btn tiny ghost" id="mini-restart" title="Reset apparatus">${ICONS.rewind}<span>RESET</span></button>
          <button class="btn tiny primary" id="mini-primary" title="Trigger primary action" hidden><span>RUN</span></button>
          <button class="btn tiny ghost expand-btn" id="station-expand-btn" data-expand-station title="Expand experiment info (Tab)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <span>EXPAND</span>
            <kbd>Tab</kbd>
          </button>
          <button class="icon-close tiny" data-close-station title="Close apparatus (Esc)">${ICONS.close}</button>
        </div>
      </div>
      <div class="station-head">
        <div class="station-overline"><span class="station-index" style="--accent:${meta.accent}">${meta.number}</span><span>${esc(
          station.biome.name,
        )}</span><span class="station-status ${solved ? 'solved' : ''}" id="station-solved-flag">${solved ? 'BADGE CLAIMED' : 'UNSEALED'}</span></div>
        <div class="station-head-actions">
          <button class="icon-btn icon-minimize" id="station-minimize-toggle" data-minimize-station title="Minimize experiment info (Tab)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button class="icon-close" data-close-station title="Close apparatus (Esc)">${ICONS.close}</button>
        </div>
        <h2>${esc(meta.title)}</h2>
        <p class="station-subtitle">${esc(meta.subtitle)}</p>
        <div class="station-concept">${esc(meta.concept)}</div>
        <p class="station-orbit-hint">Drag the field to orbit · scroll to adjust framing · Tab minimizes · E or Esc returns</p>
      </div>
      <div class="station-tabs" role="tablist">
        <button data-station-tab="observe" role="tab"><span>01</span>OBSERVE</button>
        <button data-station-tab="tinker" role="tab"><span>02</span>TINKER</button>
        <button data-station-tab="intuition" role="tab"><span>03</span>INTUITION</button>
        <button data-station-tab="solve" role="tab"><span>04</span>SOLVE</button>
      </div>
      <div class="station-body">
        <section data-pane="observe" class="station-pane">
          ${(() => {
            const spotlight = getExperimentSpotlight(meta.id);
            const p = spotlight.pioneer;
            return `
              ${
                p
                  ? `
              <div class="pioneer-spotlight-card">
                <div class="pioneer-avatar-frame">
                  <img src="${p.portrait}" alt="${esc(p.name)}" class="pioneer-avatar" onerror="this.src='/portraits/galileo_raw.jpg'" />
                  <span class="pioneer-year-tag">${esc(p.year)}</span>
                </div>
                <div class="pioneer-info">
                  <div class="pioneer-kicker">
                    <span class="kicker-tag">HISTORICAL PIONEER</span>
                    <span class="kicker-year">${esc(p.year)}</span>
                  </div>
                  <h3 class="pioneer-name">${esc(p.name)} <small>${esc(p.lifespan)}</small></h3>
                  <p class="pioneer-discovery">${esc(p.discovery)}</p>
                  <p class="pioneer-significance">“${esc(p.significance)}”</p>
                  <button class="pioneer-hall-btn" data-open-pioneer="${esc(p.id)}">
                    <span>HALL OF PIONEERS</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
              </div>`
                  : ''
              }

              <div class="simple-overview-card">
                <div class="overview-item goal">
                  <div class="overview-head"><span class="overview-icon">🎯</span><b>WHAT THIS EXPERIMENT TESTS</b></div>
                  <p>${esc(spotlight.whatIsIt)}</p>
                </div>
                <div class="overview-item watch">
                  <div class="overview-head"><span class="overview-icon">👁️</span><b>WHAT TO WATCH FOR</b></div>
                  <p>${esc(spotlight.whatToWatch)}</p>
                </div>
                <div class="overview-item takeaway">
                  <div class="overview-head"><span class="overview-icon">⚡</span><b>KEY PRINCIPLE</b></div>
                  <p>${esc(spotlight.keyTakeaway)}</p>
                </div>
              </div>

              <div class="spec-card">
                <span class="card-kicker">THE MATHEMATICS</span>
                <code>${esc(meta.formula)}</code>
                <p>${esc(meta.formulaNote)}</p>
              </div>

              <div class="spec-card warm">
                <span class="card-kicker">WHERE IT LIVES IN THE MODERN WORLD</span>
                <p>${esc(meta.realWorld)}</p>
              </div>

              <div class="observation-launch">
                <div><span class="card-kicker">GUIDED OBSERVATION</span><p>A step-by-step demonstration walks through key phenomena cue-by-cue.</p></div>
                <button class="btn primary" id="observe-button">${ICONS.play}<span>RUN OBSERVATION</span></button>
              </div>
              <div class="cue-wrap"><span class="card-kicker">OBSERVATION CUES</span>${cues}</div>
            `;
          })()}
        </section>
        <section data-pane="tinker" class="station-pane">
          <div class="pane-head"><div><span class="card-kicker">VARIABLES</span><h3>Turn the apparatus</h3></div><button class="btn tiny ghost" id="station-restart-top">${ICONS.rewind}<span>RESTART</span></button></div>
          ${controls}
          <div class="spec-card">
            <span class="card-kicker">THE LIVE EQUATION</span>
            <code>${esc(meta.formula)}</code>
            <p>${esc(meta.formulaNote)}</p>
          </div>
          <div class="tinker-tip">${ICONS.spark}<p>Change a variable and watch the live readouts at the bottom of this panel. The apparatus responds immediately; check <b>INTUITION</b> to understand the core paradox or arm a trial in <b>SOLVE</b> when you are ready.</p></div>
        </section>
        <section data-pane="intuition" class="station-pane">
          ${(() => {
            const intuition = INTUITION_BY_ID[meta.id];
            if (!intuition) return `<div class="empty-note">Detailed intuition guide active in Observation mode.</div>`;
            return `
              <div class="intuition-card hero">
                <div class="intuition-badge"><span>THE BIG QUESTION</span></div>
                <h3 class="intuition-q">${esc(intuition.bigQuestion)}</h3>
              </div>

              <div class="intuition-card analogy">
                <div class="intuition-kicker"><span>EVERYDAY ANALOGY</span><b>${esc(intuition.analogyTitle)}</b></div>
                <p class="analogy-body">${esc(intuition.analogyStory)}</p>
              </div>

              <div class="intuition-card science">
                <div class="intuition-kicker"><span>THE PHYSICAL MECHANISM</span><b>How It Actually Works</b></div>
                <p class="mechanism-body">${esc(intuition.physicalMechanism)}</p>
              </div>

              <div class="intuition-card formula-breakdown">
                <div class="intuition-kicker"><span>EQUATION DECODED</span><code>${esc(meta.formula)}</code></div>
                <div class="symbol-grid">
                  ${intuition.equationBreakdown
                    .map(
                      (eq) => `
                      <div class="symbol-row">
                        <span class="symbol-tag"><b>${esc(eq.symbol)}</b></span>
                        <div>
                          <strong>${esc(eq.meaning)}</strong>
                          <p>${esc(eq.intuition)}</p>
                        </div>
                      </div>`,
                    )
                    .join('')}
                </div>
              </div>

              <div class="intuition-card sandbox-challenges">
                <div class="intuition-kicker"><span>HANDS-ON EXPERIMENTS</span><b>Try these in Tinker mode</b></div>
                <div class="challenge-steps">
                  ${intuition.interactiveThingsToTry
                    .map(
                      (t, idx) => `
                      <div class="try-step">
                        <span class="step-num">${idx + 1}</span>
                        <div>
                          <b>${esc(t.action)}</b>
                          <p class="try-outcome">→ <em>Result:</em> ${esc(t.whatHappens)}</p>
                          <p class="try-why"><em>Why:</em> ${esc(t.why)}</p>
                        </div>
                      </div>`,
                    )
                    .join('')}
                </div>
              </div>

              <div class="intuition-card myths">
                <div class="intuition-kicker"><span>COMMON MISCONCEPTIONS</span><b>Physics Reality Check</b></div>
                ${intuition.misconceptions
                  .map(
                    (m) => `
                    <div class="myth-row">
                      <div class="myth-label"><span>Myth:</span> ${esc(m.myth)}</div>
                      <div class="reality-label"><span>Reality:</span> ${esc(m.reality)}</div>
                    </div>`,
                  )
                  .join('')}
              </div>
            `;
          })()}
        </section>
        <section data-pane="solve" class="station-pane">
          <div class="challenge-card">
            <div class="challenge-head"><span class="card-kicker">MASTERY TRIAL</span><span class="challenge-target">${esc(
              meta.challenge.targetLabel,
            )}</span></div>
            <h3>${esc(meta.challenge.title)}</h3>
            <p>${esc(meta.challenge.brief)}</p>
            <div class="challenge-status" id="challenge-status"><span class="status-dot"></span><b>${esc(
              station.experiment.challengeStatus,
            )}</b></div>
            <details class="hint"><summary>Open a hint</summary><p>${esc(meta.challenge.hint)}</p></details>
            <div class="challenge-actions"><button class="btn primary" id="arm-button">${ICONS.badge}<span>ARM MASTERY TRIAL</span></button></div>
          </div>
          <div class="badge-preview" id="badge-preview">
            <div class="badge-preview-glyph">${meta.badgeGlyph}</div>
            <div><span class="card-kicker">DISCOVERY BADGE</span><b>${esc(meta.badgeName)}</b><p id="badge-preview-note">${
              solved ? 'Sealed in your field log.' : 'Complete the mastery trial to seal this badge.'
            }</p></div>
            <span class="badge-preview-state">${solved ? '◆' : '◇'}</span>
          </div>
          <div class="spec-card danger">
            <span class="card-kicker">WHY THIS TRIAL</span>
            <p>${esc(meta.challenge.success)}</p>
          </div>
        </section>
      </div>
      <footer class="station-foot">
        <div class="metric-grid" id="station-metrics"><div class="metric placeholder"><span>READOUT</span><b>—</b></div><div class="metric placeholder"><span>READOUT</span><b>—</b></div><div class="metric placeholder"><span>READOUT</span><b>—</b></div></div>
        <div class="station-actions">
          <button class="btn ghost" id="station-restart">${ICONS.rewind}<span>RESET</span></button>
          <button class="btn primary" id="primary-action" hidden><span>RUN</span></button>
        </div>
        <div class="station-foot-hint" id="primary-hint"></div>
      </footer>
    `;
    const contentRoot = this.stationPanel.querySelector<HTMLElement>('#station-content')!;
    contentRoot.innerHTML = content;
    this.bindStationEvents();
    this.updateStationSolvedState(solved);
    this.updateBadgeProgress();
  }

  private controlMarkup(control: ControlDef, value: ParamValue | undefined): string {
    const current = value ?? (control.kind === 'toggle' ? false : control.kind === 'range' ? control.min ?? 0 : control.options?.[0]?.value ?? '');
    const output = formatControlValue(control, current);
    let input = '';
    if (control.kind === 'range') {
      const min = control.min ?? 0;
      const max = control.max ?? 1;
      const step = control.step ?? 0.1;
      const percent = clamp(((Number(current) - min) / (max - min || 1)) * 100, 0, 100);
      input = `<input type="range" data-control-input="${control.id}" min="${min}" max="${max}" step="${step}" value="${Number(
        current,
      )}" style="--fill:${percent}%"/>`;
    } else if (control.kind === 'select') {
      input = `<select data-control-input="${control.id}">${(control.options ?? [])
        .map(
          (option) =>
            `<option value="${esc(String(option.value))}" ${String(option.value) === String(current) ? 'selected' : ''}>${esc(
              option.label,
            )}</option>`,
        )
        .join('')}</select>`;
    } else {
      input = `<button class="switch ${current ? 'on' : ''}" data-control-toggle="${control.id}" role="switch" aria-checked="${
        current ? 'true' : 'false'
      }"><span></span><b>${current ? 'ENGAGED' : 'OFF'}</b></button>`;
    }
    return `<div class="control-row" data-control="${control.id}">
      <div class="control-label"><label>${esc(control.label)}</label><output data-control-output="${control.id}">${esc(output)}</output></div>
      ${input}
      ${control.hint ? `<p class="control-hint">${esc(control.hint)}</p>` : ''}
    </div>`;
  }

  private bindStationEvents(): void {
    this.stationPanel.querySelectorAll<HTMLElement>('[data-close-station]').forEach((button) => {
      button.addEventListener('click', () => this.closeStation());
    });
    this.stationPanel.querySelector('#station-minimize-toggle')?.addEventListener('click', () => {
      this.toggleStationMinimize();
    });
    this.stationPanel.querySelector('#station-expand-btn')?.addEventListener('click', () => {
      this.setStationMinimized(false);
    });
    this.stationPanel.querySelector('#mini-restart')?.addEventListener('click', () => this.callbacks.onRestart());
    this.stationPanel.querySelector('#mini-primary')?.addEventListener('click', () => this.callbacks.onPrimary());
    this.stationPanel.querySelectorAll<HTMLElement>('[data-open-pioneer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openPioneer;
        this.openPioneers(id);
      });
    });
    this.stationPanel.querySelectorAll<HTMLElement>('[data-station-tab]').forEach((button) => {
      button.addEventListener('click', () => this.setTab(button.dataset.stationTab as StationTab, true));
    });
    this.stationPanel.querySelector('#observe-button')?.addEventListener('click', () => this.callbacks.onObserve());
    this.stationPanel.querySelector('#arm-button')?.addEventListener('click', () => this.callbacks.onArm());
    this.stationPanel.querySelector('#primary-action')?.addEventListener('click', () => this.callbacks.onPrimary());
    this.stationPanel.querySelectorAll<HTMLElement>('#station-restart, #station-restart-top').forEach((button) =>
      button.addEventListener('click', () => this.callbacks.onRestart()),
    );
    this.stationPanel.querySelectorAll<HTMLInputElement>('input[type="range"][data-control-input]').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.controlInput!;
        const station = this.activeStation;
        const control = station?.experiment.meta.controls.find((c) => c.id === id);
        if (!control) return;
        const value = Number(input.value);
        const output = this.stationPanel.querySelector<HTMLElement>(`[data-control-output="${id}"]`);
        if (output) output.textContent = formatControlValue(control, value);
        const min = control.min ?? 0;
        const max = control.max ?? 1;
        input.style.setProperty('--fill', `${clamp(((value - min) / (max - min || 1)) * 100, 0, 100)}%`);
        this.callbacks.onParamChange(id, value);
      });
    });
    this.stationPanel.querySelectorAll<HTMLSelectElement>('select[data-control-input]').forEach((select) => {
      select.addEventListener('change', () => {
        const id = select.dataset.controlInput!;
        const station = this.activeStation;
        const control = station?.experiment.meta.controls.find((c) => c.id === id);
        if (!control) return;
        const option = control.options?.find((candidate) => String(candidate.value) === select.value);
        const value = option?.value ?? select.value;
        const output = this.stationPanel.querySelector<HTMLElement>(`[data-control-output="${id}"]`);
        if (output) output.textContent = formatControlValue(control, value);
        this.callbacks.onParamChange(id, value);
      });
    });
    this.stationPanel.querySelectorAll<HTMLButtonElement>('[data-control-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.controlToggle!;
        const station = this.activeStation;
        const control = station?.experiment.meta.controls.find((c) => c.id === id);
        if (!control) return;
        const next = !button.classList.contains('on');
        button.classList.toggle('on', next);
        button.setAttribute('aria-checked', next ? 'true' : 'false');
        const label = button.querySelector('b');
        if (label) label.textContent = next ? 'ENGAGED' : 'OFF';
        const output = this.stationPanel.querySelector<HTMLElement>(`[data-control-output="${id}"]`);
        if (output) output.textContent = formatControlValue(control, next);
        this.callbacks.onParamChange(id, next);
      });
    });
  }

  private setTab(tab: StationTab, notify: boolean): void {
    this.currentTab = tab;
    this.stationPanel.querySelectorAll<HTMLElement>('[data-station-tab]').forEach((button) => {
      const active = button.dataset.stationTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    this.stationPanel.querySelectorAll<HTMLElement>('[data-pane]').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.pane === tab);
    });
    const miniBadge = this.stationPanel.querySelector('#mini-tab-badge');
    if (miniBadge) miniBadge.textContent = tab.toUpperCase();
    if (notify) this.callbacks.onTabChange(tab);
  }

  syncParams(params: Record<string, ParamValue>): void {
    const station = this.activeStation;
    if (!station) return;
    for (const control of station.experiment.meta.controls) {
      const value = params[control.id];
      if (value === undefined) continue;
      const output = this.stationPanel.querySelector<HTMLElement>(`[data-control-output="${control.id}"]`);
      if (output) output.textContent = formatControlValue(control, value);
      const input = this.stationPanel.querySelector<HTMLInputElement>(`[data-control-input="${control.id}"]`);
      if (input && control.kind === 'range') {
        input.value = String(Number(value));
        const min = control.min ?? 0;
        const max = control.max ?? 1;
        input.style.setProperty('--fill', `${clamp(((Number(value) - min) / (max - min || 1)) * 100, 0, 100)}%`);
      } else if (input && control.kind === 'select') {
        input.value = String(value);
      }
      const toggle = this.stationPanel.querySelector<HTMLButtonElement>(`[data-control-toggle="${control.id}"]`);
      if (toggle) {
        toggle.classList.toggle('on', Boolean(value));
        toggle.setAttribute('aria-checked', value ? 'true' : 'false');
        const label = toggle.querySelector('b');
        if (label) label.textContent = value ? 'ENGAGED' : 'OFF';
      }
    }
  }

  updateStationLive(live: StationLive): void {
    const station = this.activeStation;
    if (!station) return;
    const solved = live.solved || station.solved;
    const metricKey = live.metrics.map((metric) => `${metric.label}:${metric.value}:${metric.unit ?? ''}:${metric.tone ?? ''}`).join('|');
    const metrics = this.stationPanel.querySelector('#station-metrics');
    if (metrics && metricKey !== this.lastMetricKey) {
      this.lastMetricKey = metricKey;
      metrics.innerHTML = live.metrics.slice(0, 6).map(metricMarkup).join('');
    }
    const primary = this.stationPanel.querySelector<HTMLButtonElement>('#primary-action');
    if (primary) {
      primary.hidden = !live.primaryLabel;
      if (live.primaryLabel) primary.innerHTML = `<span>${esc(live.primaryLabel)}</span>${ICONS.arrow}`;
      primary.disabled = !live.primaryEnabled;
      primary.classList.toggle('running', !live.primaryEnabled && Boolean(live.primaryLabel));
    }
    const miniPrimary = this.stationPanel.querySelector<HTMLButtonElement>('#mini-primary');
    if (miniPrimary) {
      miniPrimary.hidden = !live.primaryLabel;
      if (live.primaryLabel) miniPrimary.innerHTML = `<span>${esc(live.primaryLabel)}</span>`;
      miniPrimary.disabled = !live.primaryEnabled;
      miniPrimary.classList.toggle('running', !live.primaryEnabled && Boolean(live.primaryLabel));
    }
    const hint = this.stationPanel.querySelector('#primary-hint');
    if (hint) hint.textContent = live.primaryHint;
    const status = this.stationPanel.querySelector('#challenge-status');
    if (status) {
      status.classList.toggle('armed', live.armed);
      status.classList.toggle('solved', solved);
      status.querySelector('b')!.textContent = solved ? this.metaSuccess(station) : live.challengeStatus;
    }
    const armButton = this.stationPanel.querySelector<HTMLButtonElement>('#arm-button');
    if (armButton) {
      armButton.classList.toggle('armed', live.armed);
      armButton.classList.toggle('solved', solved);
      armButton.innerHTML = solved
        ? `${ICONS.check}<span>TRIAL SEALED</span>`
        : live.armed
          ? `${ICONS.badge}<span>RE-ARM TRIAL</span>`
          : `${ICONS.badge}<span>ARM MASTERY TRIAL</span>`;
      armButton.disabled = solved;
    }
    const observeButton = this.stationPanel.querySelector<HTMLButtonElement>('#observe-button');
    if (observeButton) {
      observeButton.classList.toggle('running', live.observationActive);
      observeButton.innerHTML = live.observationActive
        ? `${ICONS.pause}<span>OBSERVING · ${live.observationTime.toFixed(1)}s</span>`
        : `${ICONS.play}<span>${live.hasObserved ? 'REPLAY OBSERVATION' : 'RUN OBSERVATION'}</span>`;
    }
    const cueIndex = live.observationCueIndex;
    if (cueIndex !== this.lastCueIndex) {
      this.lastCueIndex = cueIndex;
      this.stationPanel.querySelectorAll<HTMLElement>('.cue-list li').forEach((item, index) => {
        item.classList.toggle('active', index === cueIndex);
        item.classList.toggle('passed', index < cueIndex);
      });
    }
    if (live.observationActive) {
      const current = cueAtTime(station.experiment.meta.observeCues, live.observationTime);
      this.updateObservationBanner(live.observationActive, current.index, current.text, station.experiment.meta.observeCues.length);
    } else {
      this.updateObservationBanner(false, -1, '', station.experiment.meta.observeCues.length);
    }
    const previewNote = this.stationPanel.querySelector('#badge-preview-note');
    if (previewNote && solved) previewNote.textContent = 'Sealed in your field log.';
    this.updateStationSolvedState(solved);
  }

  private metaSuccess(station: Station): string {
    return station.experiment.meta.challenge.success;
  }

  private updateStationSolvedState(solved: boolean): void {
    const flag = this.stationPanel.querySelector('#station-solved-flag');
    if (flag) {
      flag.textContent = solved ? 'BADGE CLAIMED' : 'UNSEALED';
      flag.classList.toggle('solved', solved);
    }
    const preview = this.stationPanel.querySelector('#badge-preview');
    preview?.classList.toggle('solved', solved);
    const previewState = this.stationPanel.querySelector('.badge-preview-state');
    if (previewState) previewState.textContent = solved ? '◆' : '◇';
  }

  updateObservationBanner(active: boolean, cueIndex: number, text: string, total: number): void {
    const banner = this.root.querySelector<HTMLElement>('#observation-banner');
    const label = this.root.querySelector<HTMLElement>('#observation-label');
    const body = this.root.querySelector<HTMLElement>('#observation-text');
    if (!banner || !label || !body) return;
    banner.hidden = !active;
    if (!active) return;
    label.textContent = `GUIDED OBSERVATION · ${String(Math.max(0, cueIndex) + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    body.textContent = text || 'Watching the apparatus…';
  }

  // ---------------------------------------------------------------------------
  // Map / atlas
  // ---------------------------------------------------------------------------

  setPlayerPose(x: number, z: number, yaw: number): void {
    this.playerPosition = { x, z, yaw };
    this.updateMapPlayer(x, z, yaw);
    this.updateMinimap(x, z, yaw);
    this.updateCompass(yaw);
  }

  openMap(): void {
    this.renderMap();
    this.mapOverlay.hidden = false;
    this.mapOpen = true;
    this.syncBodyClasses();
    this.updateMapPlayer(this.playerPosition.x, this.playerPosition.z, this.playerPosition.yaw);
  }

  private renderMap(): void {
    const solved = this.stations.filter((station) => station.solved).length;
    const total = this.stations.length || 17;
    const progress = this.root.querySelector('#map-progress');
    if (progress) progress.innerHTML = this.mapProgressMarkup(solved, total);
    const totalLabel = this.root.querySelector('#map-total');
    if (totalLabel) totalLabel.textContent = `${solved} / ${total}`;

    const defs = BIOMES.map(
      (biome) =>
        `<radialGradient id="biome-glow-${biome.id}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${biome.accent}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${biome.accent}" stop-opacity="0"/>
        </radialGradient>`,
    ).join('');
    const pathMarkup = BIOMES.map((biome) => {
      const points = biomePathPoints(biome, 16);
      const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.z.toFixed(2)}`).join(' ');
      return `<path d="${d}" class="map-path" style="stroke:${biome.accent}"/>`;
    }).join('');
    const biomeMarkup = BIOMES.map((biome) => {
      const count = this.stations.filter((station) => station.biomeId === biome.id && station.solved).length;
      const totalBiome = this.stations.filter((station) => station.biomeId === biome.id).length;
      return `<g class="map-biome" transform="translate(${biome.center.x} ${biome.center.y})">
        <circle r="29" fill="url(#biome-glow-${biome.id})"/>
        <circle r="18.5" class="map-biome-ring" style="stroke:${biome.accent}"/>
        <text class="map-biome-index" y="-31" style="fill:${biome.accent}">0${biome.index}</text>
        <text class="map-biome-name" y="-23">${esc(biome.shortName.toUpperCase())}</text>
        <text class="map-biome-count" y="-15.5">${count}/${totalBiome} SEALED</text>
      </g>`;
    }).join('');
    const stationMarkup = this.stations
      .map(
        (station) => `<g class="map-station ${station.solved ? 'solved' : ''}" data-station="${station.id}" transform="translate(${station.x} ${station.z})" tabindex="0" role="button" aria-label="${esc(
          `${station.number} ${station.shortTitle}${station.solved ? ', discovered' : ', undiscovered'}`,
        )}" style="--accent:${station.accent}">
          <title>${esc(`${station.number} · ${station.shortTitle}`)}</title>
          <circle r="12.5" class="map-station-halo"/>
          <circle r="5.2" class="map-station-dot"/>
          <text y="2.1">${esc(station.number)}</text>
        </g>`,
      )
      .join('');
    const islands = `
      <defs>
        ${defs}
        <radialGradient id="island-fill" cx="42%" cy="36%" r="62%">
          <stop offset="0%" stop-color="#233a42" stop-opacity="0.9"/>
          <stop offset="72%" stop-color="#122028" stop-opacity="0.96"/>
          <stop offset="100%" stop-color="#080f15" stop-opacity="1"/>
        </radialGradient>
        <pattern id="map-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(127,220,235,0.07)" stroke-width="0.4"/>
        </pattern>
        <filter id="map-glow"><feGaussianBlur stdDeviation="1.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle r="118" fill="url(#map-grid)" opacity="0.9"/>
      <circle r="116" fill="url(#island-fill)" stroke="rgba(246,207,133,0.34)" stroke-width="0.8"/>
      <circle r="116" fill="none" stroke="rgba(126,239,255,0.12)" stroke-width="0.35" stroke-dasharray="1.2 3.4"/>
      <circle r="82" fill="none" stroke="rgba(139,190,205,0.12)" stroke-width="0.45" stroke-dasharray="0.8 4"/>
      <circle r="25" fill="rgba(246,207,133,0.035)" stroke="rgba(246,207,133,0.22)" stroke-width="0.45"/>
      ${pathMarkup}
      ${biomeMarkup}
      <g class="map-hub" data-hub tabindex="0" role="button" aria-label="Hall of Constants">
        <circle r="11" class="map-hub-ring"/>
        <circle r="3.2" class="map-hub-core"/>
        <text y="-15" class="map-hub-label">HALL OF CONSTANTS</text>
        <text y="19" class="map-hub-sub">SPAWN · 0, 0</text>
      </g>
      ${stationMarkup}
      <g id="map-player" class="map-player">
        <circle r="3" class="map-player-ring"/>
        <circle r="1.4" class="map-player-dot"/>
        <path id="map-player-head" d="M0 -6.4 L3.4 2.8 L0 1.3 L-3.4 2.8 Z" class="map-player-head"/>
      </g>
      <text x="0" y="-110" class="map-north">N</text>
      <path d="M0 -104 l-2.2 -4 h4.4 Z" class="map-north-arrow"/>
    `;
    this.mapSvg.innerHTML = islands;
    this.mapPlayer = this.mapSvg.querySelector<SVGGElement>('#map-player')!;
    this.mapPlayerHead = this.mapSvg.querySelector<SVGPathElement>('#map-player-head')!;

    const directory = this.root.querySelector('#map-directory');
    if (!directory) return;
    directory.innerHTML = BIOMES.map((biome) => {
      const stations = this.stations.filter((station) => station.biomeId === biome.id);
      const solvedBiome = stations.filter((station) => station.solved).length;
      return `<div class="directory-group" style="--biome:${biome.accent}">
        <div class="directory-head"><span>0${biome.index} · ${esc(biome.shortName.toUpperCase())}</span><b>${solvedBiome}/${stations.length}</b></div>
        ${stations
          .map(
            (station) => `<button class="directory-row ${station.solved ? 'solved' : ''}" data-station="${station.id}">
              <span class="dir-num">${esc(station.number)}</span>
              <span class="dir-name">${esc(station.shortTitle)}</span>
              <span class="dir-go">${station.solved ? '◆' : 'TRAVEL'}</span>
            </button>`,
          )
          .join('')}
      </div>`;
    }).join('');
  }

  private updateMapPlayer(x: number, z: number, yaw: number): void {
    if (!this.mapPlayer) return;
    this.mapPlayer.setAttribute('transform', `translate(${x.toFixed(2)} ${z.toFixed(2)})`);
    if (this.mapPlayerHead) this.mapPlayerHead.setAttribute('transform', `rotate(${(-yaw * 180) / Math.PI})`);
  }

  setWaypoint(stationId: string): void {
    if (this.selectedWaypointId === stationId) {
      this.selectedWaypointId = null;
      this.toast('Waypoint Cleared', 'Now tracking nearest station.', '#7ef9ff', '⌖', 2200);
    } else {
      this.selectedWaypointId = stationId;
      const st = this.stations.find((s) => s.id === stationId);
      if (st) {
        this.toast('Waypoint Locked', `Targeting ${st.number} · ${st.shortTitle}. Click WARP on minimap to jump directly.`, st.accent, '🎯', 3200);
      }
    }
    this.root.querySelectorAll('.mm-station').forEach((el) => {
      el.classList.toggle('targeted', el.getAttribute('data-station-id') === this.selectedWaypointId);
    });
    this.updateMinimap(this.playerPosition.x, this.playerPosition.z, this.playerPosition.yaw);
  }

  private renderMinimap(): void {
    if (!this.minimapSvg) return;

    const pathMarkup = BIOMES.map((biome) => {
      const points = biomePathPoints(biome, 12);
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.z.toFixed(1)}`).join(' ');
      return `<path d="${d}" class="mm-path" style="stroke:${biome.accent}"/>`;
    }).join('');

    const biomeMarkup = BIOMES.map((biome) => {
      return `
        <g class="mm-biome" transform="translate(${biome.center.x} ${biome.center.y})">
          <circle r="22" fill="${biome.accent}" opacity="0.10"/>
          <circle r="15" fill="none" stroke="${biome.accent}" stroke-width="0.7" opacity="0.32"/>
          <text class="mm-biome-label" y="-17" fill="${biome.accent}">0${biome.index} · ${esc(biome.shortName.toUpperCase())}</text>
        </g>
      `;
    }).join('');

    const stationMarkup = this.stations
      .map(
        (st) => `
        <g class="mm-station ${st.solved ? 'solved' : ''} ${st.id === this.selectedWaypointId ? 'targeted' : ''}"
           data-station-id="${st.id}"
           transform="translate(${st.x.toFixed(1)} ${st.z.toFixed(1)})"
           tabindex="0" role="button" aria-label="${esc(`${st.number} ${st.shortTitle}`)}"
           style="--accent:${st.accent}">
          <title>${esc(`${st.number} · ${st.shortTitle} (${st.solved ? 'Claimed' : 'Unsealed'})`)}</title>
          <circle r="9.5" class="mm-station-halo"/>
          <circle r="5.6" class="mm-station-dot"/>
          <text y="2.2" class="mm-station-num">${esc(st.number)}</text>
        </g>`,
      )
      .join('');

    this.minimapSvg.innerHTML = `
      <defs>
        <radialGradient id="mm-island-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#142832" stop-opacity="0.95"/>
          <stop offset="75%" stop-color="#0a1720" stop-opacity="0.98"/>
          <stop offset="100%" stop-color="#050c12" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <!-- Island boundary -->
      <circle r="116" fill="url(#mm-island-grad)" stroke="rgba(246, 207, 133, 0.45)" stroke-width="0.8"/>
      <circle r="116" fill="none" stroke="rgba(126, 249, 255, 0.15)" stroke-width="0.4" stroke-dasharray="1.5 3"/>
      <!-- Concentric distance rings -->
      <circle r="25" fill="rgba(246, 207, 133, 0.04)" stroke="rgba(246, 207, 133, 0.3)" stroke-width="0.5"/>
      <circle r="55" fill="none" stroke="rgba(126, 249, 255, 0.1)" stroke-width="0.4" stroke-dasharray="1 3"/>
      <circle r="85" fill="none" stroke="rgba(126, 249, 255, 0.12)" stroke-width="0.4" stroke-dasharray="1 3"/>
      <!-- Grid cross -->
      <line x1="-116" y1="0" x2="116" y2="0" stroke="rgba(126, 249, 255, 0.08)" stroke-width="0.5"/>
      <line x1="0" y1="-116" x2="0" y2="116" stroke="rgba(126, 249, 255, 0.08)" stroke-width="0.5"/>
      ${pathMarkup}
      ${biomeMarkup}
      <!-- Central Hub -->
      <g class="mm-hub" data-hub tabindex="0" role="button" aria-label="Spawn Rotunda">
        <circle r="8" fill="rgba(244, 207, 134, 0.2)" stroke="#f4cf86" stroke-width="0.8"/>
        <circle r="2.5" fill="#f4cf86"/>
        <text y="2" class="mm-hub-label">HUB</text>
      </g>
      <!-- Waypoint line -->
      <line id="mm-waypoint-line" class="mm-waypoint-line" x1="0" y1="0" x2="0" y2="0"/>
      <!-- Stations -->
      ${stationMarkup}
      <!-- Live Player Marker -->
      <g id="mm-player" class="mm-player" transform="translate(0 14)">
        <path id="mm-player-cone" d="M0 0 L-18 -42 A46 46 0 0 1 18 -42 Z" class="mm-vision-cone"/>
        <circle r="4.2" class="mm-player-ring"/>
        <circle r="1.8" class="mm-player-dot"/>
        <path id="mm-player-head" d="M0 -9 L4 3 L0 1.2 L-4 3 Z" class="mm-player-head"/>
      </g>
      <!-- North Indicator -->
      <text x="0" y="-106" class="mm-north">N</text>
      <path d="M0 -101 l-2 -3.5 h4 Z" fill="#7ef9ff"/>
    `;

    this.minimapPlayer = this.minimapSvg.querySelector<SVGGElement>('#mm-player');
    this.minimapPlayerHead = this.minimapSvg.querySelector<SVGPathElement>('#mm-player-head');
    this.minimapPlayerCone = this.minimapSvg.querySelector<SVGPathElement>('#mm-player-cone');
    this.minimapWaypointLine = this.minimapSvg.querySelector<SVGLineElement>('#mm-waypoint-line');
  }

  private updateMinimap(x: number, z: number, yaw: number): void {
    if (!this.minimapPlayer) return;

    this.minimapPlayer.setAttribute('transform', `translate(${x.toFixed(2)} ${z.toFixed(2)})`);
    const angleDeg = (-yaw * 180) / Math.PI;
    if (this.minimapPlayerHead) {
      this.minimapPlayerHead.setAttribute('transform', `rotate(${angleDeg.toFixed(1)})`);
    }
    if (this.minimapPlayerCone) {
      this.minimapPlayerCone.setAttribute('transform', `rotate(${angleDeg.toFixed(1)})`);
    }

    const coords = this.root.querySelector('#minimap-coords');
    if (coords) {
      const signX = x >= 0 ? '+' : '';
      const signZ = z >= 0 ? '+' : '';
      coords.textContent = `X ${signX}${x.toFixed(0)} · Z ${signZ}${z.toFixed(0)}`;
    }

    if (this.minimapZoom === 2.5) {
      const r = 48;
      this.minimapSvg.setAttribute('viewBox', `${(x - r).toFixed(1)} ${(z - r).toFixed(1)} ${2 * r} ${2 * r}`);
    } else {
      this.minimapSvg.setAttribute('viewBox', '-124 -124 248 248');
    }

    const targetStation = this.selectedWaypointId
      ? this.stations.find((s) => s.id === this.selectedWaypointId) ?? this.nearestStation
      : this.nearestStation;

    if (targetStation) {
      if (this.minimapWaypointLine) {
        this.minimapWaypointLine.setAttribute('x1', x.toFixed(1));
        this.minimapWaypointLine.setAttribute('y1', z.toFixed(1));
        this.minimapWaypointLine.setAttribute('x2', targetStation.x.toFixed(1));
        this.minimapWaypointLine.setAttribute('y2', targetStation.z.toFixed(1));
        this.minimapWaypointLine.style.stroke = targetStation.accent;
        this.minimapWaypointLine.style.display = 'block';
      }

      const dx = targetStation.x - x;
      const dz = targetStation.z - z;
      const dist = Math.hypot(dx, dz);

      const worldBearing = Math.atan2(dx, -dz);
      let relBearing = worldBearing - yaw;
      while (relBearing > Math.PI) relBearing -= Math.PI * 2;
      while (relBearing < -Math.PI) relBearing += Math.PI * 2;
      const relDeg = (relBearing * 180) / Math.PI;

      const arrow = this.root.querySelector<HTMLElement>('#minimap-bearing-arrow');
      if (arrow) {
        arrow.style.transform = `rotate(${relDeg.toFixed(0)}deg)`;
        arrow.style.color = targetStation.accent;
      }

      const nameEl = this.root.querySelector('#minimap-target-name');
      if (nameEl) nameEl.textContent = `${targetStation.number} · ${targetStation.shortTitle}`;
      const distEl = this.root.querySelector('#minimap-target-dist');
      if (distEl) distEl.textContent = `${dist.toFixed(0)} m`;
      const metaEl = this.root.querySelector('#minimap-target-label');
      if (metaEl) {
        metaEl.textContent = this.selectedWaypointId ? 'TRACKED WAYPOINT' : 'NEAREST EXPERIMENT';
      }
      const banner = this.root.querySelector<HTMLElement>('#minimap-target-bar');
      if (banner) banner.style.setProperty('--accent', targetStation.accent);
    } else {
      if (this.minimapWaypointLine) this.minimapWaypointLine.style.display = 'none';
      const nameEl = this.root.querySelector('#minimap-target-name');
      if (nameEl) nameEl.textContent = 'Scanning island…';
      const distEl = this.root.querySelector('#minimap-target-dist');
      if (distEl) distEl.textContent = '-- m';
    }
  }

  private lastCompassPinsHtml = '';

  private updateCompass(yaw: number): void {
    if (!this.compassBearingLabel) return;

    let headingDeg = Math.round((-yaw * 180) / Math.PI) % 360;
    if (headingDeg < 0) headingDeg += 360;

    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardIdx = Math.round(headingDeg / 45) % 8;
    const bearingText = `${headingDeg.toString().padStart(3, '0')}° ${cardinals[cardIdx]}`;
    if (this.compassBearingLabel.textContent !== bearingText) {
      this.compassBearingLabel.textContent = bearingText;
    }

    if (this.compassPins && this.stations.length > 0) {
      const px = this.playerPosition.x;
      const pz = this.playerPosition.z;
      const fovRad = Math.PI * 0.38;

      let pinsHtml = '';
      for (const st of this.stations) {
        const dx = st.x - px;
        const dz = st.z - pz;
        const dist = Math.hypot(dx, dz);
        if (dist < 3) continue;

        const worldAngle = Math.atan2(dx, -dz);
        let diff = worldAngle - yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) < fovRad) {
          const pct = (50 + (diff / fovRad) * 46).toFixed(1);
          pinsHtml += `
            <div class="compass-pin ${st.id === this.selectedWaypointId ? 'targeted' : ''}"
                 style="left:${pct}%; --c:${st.accent}"
                 title="${esc(`${st.number} · ${st.shortTitle} (${dist.toFixed(0)}m)`)}"
                 data-compass-st="${st.id}">
              <span class="compass-pin-dot"></span>
              <span class="compass-pin-num">${esc(st.number)}</span>
            </div>
          `;
        }
      }
      if (pinsHtml !== this.lastCompassPinsHtml) {
        this.compassPins.innerHTML = pinsHtml;
        this.lastCompassPinsHtml = pinsHtml;
      }
    }
  }

  openGuide(): void {
    this.closeTopOverlay();
    this.guideOverlay.hidden = false;
    this.guideOpen = true;
    this.renderGuide();
    this.syncBodyClasses();
  }

  closeGuide(): void {
    if (!this.guideOpen) return;
    this.guideOpen = false;
    this.guideOverlay.hidden = true;
    this.syncBodyClasses();
    this.callbacks.onHelpClose?.();
  }

  get isGuideOpen(): boolean {
    return this.guideOpen;
  }

  private renderGuide(): void {
    const grid = this.root.querySelector('#guide-grid');
    if (!grid) return;

    grid.innerHTML = BIOMES.map((biome) => {
      const biomeStations = this.stations.filter((s) => s.biomeId === biome.id);
      const solvedCount = biomeStations.filter((s) => s.solved).length;
      return `
        <div class="guide-realm-card" style="--biome:${biome.accent}">
          <div class="guide-realm-head">
            <div class="realm-title-group">
              <span class="realm-badge">REALM 0${biome.index}</span>
              <h3 class="realm-name">${esc(biome.name)}</h3>
              <span class="realm-discipline">${esc(biome.discipline)} · Mentors: ${esc(biome.mentors)}</span>
            </div>
            <span class="realm-progress-badge">${solvedCount} / ${biomeStations.length} DISCOVERIES</span>
          </div>
          <div class="guide-station-list">
            ${biomeStations
              .map((st) => {
                const spotlight = getExperimentSpotlight(st.id);
                const isTarget = st.id === this.selectedWaypointId;
                return `
                  <div class="guide-station-item ${st.solved ? 'solved' : ''}">
                    <div class="station-meta-col">
                      <span class="st-num" style="color:${st.accent}">${esc(st.number)}</span>
                      <div class="st-texts">
                        <b>${esc(st.shortTitle)}</b>
                        <p>${esc(spotlight.whatIsIt)}</p>
                      </div>
                    </div>
                    <div class="station-actions-col">
                      <span class="st-status-tag ${st.solved ? 'claimed' : 'open'}">
                        ${st.solved ? '★ SEALED' : 'UNSEALED'}
                      </span>
                      <button class="guide-btn guide-btn-track ${isTarget ? 'active' : ''}" data-guide-track="${st.id}" title="Track on Radar">
                        ${isTarget ? 'TRACKING' : 'TRACK'}
                      </button>
                      <button class="guide-btn guide-btn-warp" data-guide-warp="${st.id}" title="Warp directly to apparatus">
                        WARP
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll<HTMLButtonElement>('[data-guide-warp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stId = btn.dataset.guideWarp;
        if (stId) {
          this.closeGuide();
          this.travel(stId);
        }
      });
    });

    grid.querySelectorAll<HTMLButtonElement>('[data-guide-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stId = btn.dataset.guideTrack;
        if (stId) {
          this.setWaypoint(stId);
          this.renderGuide();
        }
      });
    });
  }

  closeMap(): void {
    this.hideMap(true);
  }

  private hideMap(notify: boolean): void {
    if (!this.mapOpen) return;
    this.mapOpen = false;
    this.mapOverlay.hidden = true;
    this.syncBodyClasses();
    if (notify) this.callbacks.onMapClose();
  }

  get isMapOpen(): boolean {
    return this.mapOpen;
  }

  // ---------------------------------------------------------------------------
  // Environment book
  // ---------------------------------------------------------------------------

  openBook(env: EnvironmentState): void {
    this.bookEnv = { ...env };
    this.renderBook();
    this.bookOverlay.hidden = false;
    this.bookPanel.classList.add('open');
    this.bookOpen = true;
    this.syncBodyClasses();
  }

  closeBook(): void {
    if (!this.bookOpen) return;
    this.bookOpen = false;
    this.bookOverlay.hidden = true;
    this.bookPanel.classList.remove('open');
    this.syncBodyClasses();
    this.callbacks.onEnvironmentClose();
  }

  get isBookOpen(): boolean {
    return this.bookOpen;
  }

  private renderBook(): void {
    const env = this.bookEnv;
    if (!env) return;
    const setText = (selector: string, value: string) => {
      const node = this.root.querySelector(selector);
      if (node) node.textContent = value;
    };
    setText('#book-gravity', env.gravity.toFixed(2));
    setText('#book-gravity-preset', (GRAVITY_PRESETS[env.gravityPreset]?.label ?? 'CUSTOM FIELD').toUpperCase());
    setText('#book-gravity-value', `${env.gravity.toFixed(2)} m/s²`);
    setText('#book-gravity-slider-value', env.gravity.toFixed(2));
    setText('#book-air-value', env.air === 'vacuum' ? 'VACUUM' : 'ATMOSPHERE');
    setText('#book-air-slider-value', env.airDensity.toFixed(3));
    setText('#book-friction-value', env.friction === 'frictionless' ? 'FRICTIONLESS' : 'ROUGH');
    setText('#book-friction-slider-value', env.frictionCoefficient.toFixed(2));
    setText('#book-time-value', this.formatTimeOfDay(this.currentTimeOfDay));
    setText('#book-time-slider-value', this.formatTimeOfDay(this.currentTimeOfDay));
    setText('#book-summary', `g ${env.gravity.toFixed(2)} · ρ ${env.airDensity.toFixed(3)} · μ ${env.frictionCoefficient.toFixed(2)} · ${this.formatTimeOfDay(this.currentTimeOfDay)}`);

    const gravitySlider = this.root.querySelector<HTMLInputElement>('#book-gravity-slider');
    if (gravitySlider) gravitySlider.value = String(env.gravity);
    const airSlider = this.root.querySelector<HTMLInputElement>('#book-air-slider');
    if (airSlider) {
      airSlider.value = String(env.airDensity);
      airSlider.disabled = env.air === 'vacuum';
    }
    const frictionSlider = this.root.querySelector<HTMLInputElement>('#book-friction-slider');
    if (frictionSlider) {
      frictionSlider.value = String(env.frictionCoefficient);
      frictionSlider.disabled = env.friction === 'frictionless';
    }
    const timeSlider = this.root.querySelector<HTMLInputElement>('#book-time-slider');
    if (timeSlider) timeSlider.value = String(this.currentTimeOfDay);
    const cycleToggle = this.root.querySelector<HTMLInputElement>('#book-time-cycle-toggle');
    if (cycleToggle) cycleToggle.checked = this.dayCycleActive;

    this.root.querySelectorAll<HTMLElement>('[data-gravity]').forEach((button) => {
      button.classList.toggle('active', button.dataset.gravity === env.gravityPreset);
    });
    this.root.querySelectorAll<HTMLElement>('[data-air]').forEach((button) => {
      button.classList.toggle('active', button.dataset.air === env.air);
    });
    this.root.querySelectorAll<HTMLElement>('[data-friction]').forEach((button) => {
      button.classList.toggle('active', button.dataset.friction === env.friction);
    });
    this.root.querySelectorAll<HTMLElement>('[data-sky-time]').forEach((button) => {
      const p = button.dataset.skyTime;
      const h = this.currentTimeOfDay;
      const active =
        (p === 'dawn' && h >= 4.5 && h < 8) ||
        (p === 'noon' && h >= 8 && h < 16) ||
        (p === 'sunset' && h >= 16 && h < 20) ||
        (p === 'midnight' && (h >= 20 || h < 4.5));
      button.classList.toggle('active', !!active);
    });
    const ring = this.root.querySelector<HTMLElement>('.gravity-ring');
    ring?.style.setProperty('--gravity', String(clamp(env.gravity / 24.79, 0.04, 1)));
  }

  private formatTimeOfDay(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const phase =
      hours >= 5 && hours < 8
        ? 'Dawn'
        : hours >= 8 && hours < 17
        ? 'Day'
        : hours >= 17 && hours < 20
        ? 'Dusk'
        : 'Night';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (${phase})`;
  }

  setTimeOfDay(hours: number): void {
    this.currentTimeOfDay = hours;
    const isDay = hours >= 6 && hours < 18;
    const iconEl = this.root.querySelector('#daynight-icon');
    const labelEl = this.root.querySelector('#daynight-label');
    const chipEl = this.root.querySelector('#daynight-chip');
    if (iconEl) iconEl.innerHTML = isDay ? ICONS.sun : ICONS.moon;
    if (labelEl) labelEl.textContent = isDay ? 'DAY' : 'NIGHT';
    if (chipEl) {
      chipEl.classList.toggle('is-night', !isDay);
      chipEl.setAttribute('title', isDay ? 'Day Mode Active (Sunlight). Click or press N to toggle Night.' : 'Night Mode Active (Moonlight). Click or press N to toggle Day.');
    }
    if (this.bookOpen) this.renderBook();
  }

  setDayCycleActive(active: boolean): void {
    this.dayCycleActive = active;
    if (this.bookOpen) this.renderBook();
  }

  // ---------------------------------------------------------------------------
  // Creative materials inventory & material inspector
  // ---------------------------------------------------------------------------

  openInventory(placedCount = 0): void {
    this.placedBlocksCount = placedCount;
    this.inventoryOpen = true;
    this.inventoryOverlay.hidden = false;
    this.syncBodyClasses();
    this.renderInventory();
  }

  closeInventory(notify = true): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventoryOverlay.hidden = true;
    this.syncBodyClasses();
    if (notify) this.callbacks.onInventoryClose?.();
  }

  get isInventoryOpen(): boolean {
    return this.inventoryOpen;
  }

  setPlacedBlocksCount(count: number): void {
    this.placedBlocksCount = count;
    this.updateInventoryCount();
  }

  private updateInventoryCount(): void {
    const el = this.root.querySelector('#inv-placed-count');
    if (el) el.textContent = String(this.placedBlocksCount);
  }

  private bindInventory(): void {
    this.root.querySelector('#inv-categories')?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.inv-cat');
      if (!button) return;
      this.selectedCategory = button.dataset.cat || 'all';
      this.root.querySelectorAll<HTMLElement>('.inv-cat').forEach((b) => {
        b.classList.toggle('active', b === button);
      });
      this.renderInventoryGrid();
    });

    this.root.querySelector('#inv-grid')?.addEventListener('click', (event) => {
      const slot = (event.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (!slot) return;
      const type = slot.dataset.block as VoxelBlockType;
      this.inspectBlock(type);
    });

    this.root.querySelector('#inv-grid')?.addEventListener('dblclick', (event) => {
      const slot = (event.target as HTMLElement).closest<HTMLElement>('.inv-slot');
      if (!slot) return;
      const type = slot.dataset.block as VoxelBlockType;
      this.equipInspectedBlock(type);
    });

    this.root.querySelector('#inv-select-btn')?.addEventListener('click', () => {
      this.equipInspectedBlock(this.inspectedBlockType);
    });

    this.root.querySelector('#inv-clear-blocks')?.addEventListener('click', () => {
      this.callbacks.onClearBlocks?.();
      this.placedBlocksCount = 0;
      this.updateInventoryCount();
      this.toast('World Cleared', 'All placed voxel blocks and lights have been removed.', '#ffd7a1', '✦', 2200);
    });
  }

  private equipInspectedBlock(type: VoxelBlockType): void {
    this.setActiveVoxelBlock(type);
    this.callbacks.onBlockSelect?.(type);
    sound.playToolSwitch();
    this.closeInventory();
    this.toast('Block Equipped', `Equipped ${VOXEL_BLOCKS[type].name} in hand.`, '#7ef9ff', '▣', 2000);
  }

  private renderInventory(): void {
    this.renderInventoryGrid();
    this.inspectBlock(this.inspectedBlockType);
    this.updateInventoryCount();
  }

  private renderInventoryGrid(): void {
    const grid = this.root.querySelector('#inv-grid');
    if (!grid) return;
    const cat = this.selectedCategory;
    const blocks = BLOCK_PALETTE_ORDER.filter((type) => {
      if (cat === 'all') return true;
      const meta = VOXEL_BLOCKS[type];
      return meta.category === cat;
    });

    grid.innerHTML = blocks
      .map((type) => {
        const meta = VOXEL_BLOCKS[type];
        const isSelected = type === this.inspectedBlockType;
        const colorHex = '#' + meta.color.toString(16).padStart(6, '0');
        return `
          <div class="inv-slot ${isSelected ? 'selected' : ''}" data-block="${type}" title="${meta.name}">
            <div class="inv-slot-cube" style="--block-color: ${colorHex}"></div>
            <span class="inv-slot-label">${meta.name}</span>
          </div>
        `;
      })
      .join('');
  }

  private inspectBlock(type: VoxelBlockType): void {
    this.inspectedBlockType = type;
    const meta = VOXEL_BLOCKS[type];
    const preview = this.root.querySelector('#inv-inspect-preview');
    const title = this.root.querySelector('#inv-inspect-title');
    const id = this.root.querySelector('#inv-inspect-id');
    const desc = this.root.querySelector('#inv-inspect-desc');
    const props = this.root.querySelector('#inv-inspect-props');

    if (title) title.textContent = meta.name;
    if (id) id.textContent = `physicraft:${meta.id}`;
    if (desc) desc.textContent = meta.description;

    const colorHex = '#' + meta.color.toString(16).padStart(6, '0');
    if (preview) {
      preview.innerHTML = `<div class="cube-iso" style="--block-color: ${colorHex}"></div>`;
    }

    if (props) {
      props.innerHTML = `
        <div class="prop-row"><span>Category</span><b>${meta.category.toUpperCase()}</b></div>
        <div class="prop-row"><span>Density ρ</span><b>${meta.density} kg/m³</b></div>
        <div class="prop-row"><span>Hardness</span><b>${meta.hardness.toFixed(1)}</b></div>
        <div class="prop-row"><span>Blast Resistance</span><b>${meta.blastResistance.toFixed(1)}</b></div>
        ${meta.lightLevel ? `<div class="prop-row light"><span>Luminance</span><b>Level ${meta.lightLevel}</b></div>` : ''}
        ${meta.bouncy ? `<div class="prop-row bounce"><span>Restitution e</span><b>0.85 (Slime)</b></div>` : ''}
        ${meta.explosive ? `<div class="prop-row blast"><span>Detonation</span><b>Chain primed</b></div>` : ''}
        <div class="features-list">
          <small>PHYSICAL CAPABILITIES</small>
          <ul>${meta.physicsFeatures.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        </div>
      `;
    }

    this.root.querySelectorAll<HTMLElement>('.inv-slot').forEach((slot) => {
      slot.classList.toggle('selected', slot.dataset.block === type);
    });
  }

  // ---------------------------------------------------------------------------
  // Manual
  // ---------------------------------------------------------------------------

  openHelp(): void {
    this.helpOverlay.hidden = false;
    this.helpOpen = true;
    this.syncBodyClasses();
  }

  closeHelp(): void {
    if (!this.helpOpen) return;
    this.helpOpen = false;
    this.helpOverlay.hidden = true;
    this.syncBodyClasses();
    this.callbacks.onHelpClose();
  }

  get isHelpOpen(): boolean {
    return this.helpOpen;
  }

  // ---------------------------------------------------------------------------
  // Badge celebration
  // ---------------------------------------------------------------------------

  showBadge(payload: BadgePayload): void {
    sound.playDiscoveryJingle();
    this.badgeOverlay.hidden = false;
    this.badgeOverlay.style.setProperty('--accent', payload.accent);
    this.badgeOpen = true;
    const emblem = this.root.querySelector('#badge-emblem');
    const name = this.root.querySelector('#badge-name');
    const trial = this.root.querySelector('#badge-trial');
    const number = this.root.querySelector('#badge-number');
    const progress = this.root.querySelector('#badge-progress');
    if (emblem) emblem.textContent = payload.glyph;
    if (name) name.textContent = payload.badgeName;
    if (trial) trial.textContent = payload.trialTitle;
    if (number) number.textContent = `EXPERIMENT ${payload.number}`;
    if (progress) progress.textContent = `${String(payload.solved).padStart(2, '0')} / ${String(payload.total).padStart(2, '0')} DISCOVERIES`;
    const confetti = this.root.querySelector('#confetti');
    if (confetti) {
      confetti.innerHTML = Array.from({ length: 26 }, (_, index) => {
        const x = Math.random() * 100;
        const delay = Math.random() * 0.7;
        const duration = 2.2 + Math.random() * 1.8;
        const rotate = Math.random() * 720 - 360;
        const color = index % 4 === 0 ? '#ffd98f' : index % 4 === 1 ? payload.accent : index % 4 === 2 ? '#7ef9ff' : '#f4fbff';
        return `<i style="--x:${x}%;--delay:${delay}s;--duration:${duration}s;--rotate:${rotate}deg;--color:${color}"></i>`;
      }).join('');
    }
    this.syncBodyClasses();
  }

  get isBadgeOpen(): boolean {
    return this.badgeOpen;
  }

  closeBadge(): void {
    if (!this.badgeOpen) return;
    this.badgeOpen = false;
    this.badgeOverlay.hidden = true;
    this.syncBodyClasses();
    this.callbacks.onBadgeContinue();
  }

  // ---------------------------------------------------------------------------
  // General overlay helpers
  // ---------------------------------------------------------------------------

  closeTopOverlay(): boolean {
    if (this.theodoliteActive) {
      this.callbacks.onExitTheodolite?.();
      return true;
    }
    if (this.scholarOpen) {
      this.closeScholar();
      return true;
    }
    if (this.guideOpen) {
      this.closeGuide();
      return true;
    }
    if (this.pioneersOpen) {
      this.closePioneers();
      return true;
    }
    if (this.inventoryOpen) {
      this.closeInventory();
      return true;
    }
    if (this.badgeOpen) {
      this.closeBadge();
      return true;
    }
    if (this.mapOpen) {
      this.closeMap();
      return true;
    }
    if (this.bookOpen) {
      this.closeBook();
      return true;
    }
    if (this.helpOpen) {
      this.closeHelp();
      return true;
    }
    return false;
  }

  get hasOverlayOpen(): boolean {
    return (
      this.mapOpen ||
      this.bookOpen ||
      this.helpOpen ||
      this.badgeOpen ||
      this.stationOpen ||
      this.inventoryOpen ||
      this.pioneersOpen ||
      this.guideOpen ||
      this.scholarOpen ||
      this.theodoliteActive
    );
  }

  openPioneers(pioneerId?: string): void {
    if (this.pioneersOpen) {
      if (pioneerId) this.scrollToPioneer(pioneerId);
      return;
    }
    this.closeTopOverlay();
    this.pioneersOverlay.hidden = false;
    this.pioneersOpen = true;
    if (pioneerId) {
      this.pioneersCategory = 'all';
    }
    this.renderPioneers();
    this.syncBodyClasses();
    if (pioneerId) {
      setTimeout(() => this.scrollToPioneer(pioneerId), 80);
    }
  }

  private scrollToPioneer(pioneerId: string): void {
    const card = this.root.querySelector<HTMLElement>(`[data-pioneer="${pioneerId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid var(--accent, #f4cf86)';
      card.style.boxShadow = '0 0 30px var(--accent, #f4cf86)';
      setTimeout(() => {
        card.style.outline = '';
        card.style.boxShadow = '';
      }, 2500);
    }
  }

  closePioneers(): void {
    if (!this.pioneersOpen) return;
    this.pioneersOpen = false;
    this.pioneersOverlay.hidden = true;
    this.syncBodyClasses();
  }

  get isPioneersOpen(): boolean {
    return this.pioneersOpen;
  }

  openScholar(dialogue: ScholarDialogue): void {
    if (this.scholarOpen && this.activeScholarDialogue?.scholarId === dialogue.scholarId) {
      return;
    }
    this.closeTopOverlay();
    this.activeScholarDialogue = dialogue;
    this.scholarName.textContent = dialogue.name;
    this.scholarMeta.textContent = `${dialogue.lifespan} · ${dialogue.discipline}`;
    this.scholarPortraitImg.src = dialogue.portrait;
    this.scholarPortraitImg.alt = dialogue.name;
    this.scholarTreatiseTitle.textContent = dialogue.treatiseTitle;
    this.scholarTreatiseYear.textContent = dialogue.treatiseYear;
    this.scholarQuote.textContent = `"${dialogue.quote}"`;
    this.scholarEquation.textContent = dialogue.keyEquation;
    this.scholarSubFormula.textContent = dialogue.subFormula;
    this.scholarNarrativeText.textContent = dialogue.discourse;
    this.scholarWarpLabel.textContent = `Travel to ${dialogue.stationTitle}`;

    this.scholarOverlay.hidden = false;
    this.scholarOpen = true;
    sound.playClick();
    this.syncBodyClasses();
  }

  closeScholar(): void {
    if (!this.scholarOpen) return;
    this.scholarOpen = false;
    this.scholarOverlay.hidden = true;
    this.activeScholarDialogue = null;
    sound.playClick();
    this.syncBodyClasses();
  }

  get isScholarOpen(): boolean {
    return this.scholarOpen;
  }

  setTheodoliteActive(active: boolean, theodolite?: TheodoliteStation): void {
    this.theodoliteActive = active;
    this.theodoliteReticleOverlay.hidden = !active;
    if (active && theodolite) {
      this.theodoliteTitle.textContent = theodolite.name;
      this.updateTheodoliteReadout(theodolite.lookYaw, theodolite.lookPitch);
    }
    this.syncBodyClasses();
  }

  updateTheodoliteReadout(yaw: number, pitch: number): void {
    if (!this.theodoliteActive) return;
    const degYaw = (((yaw * 180 / Math.PI) % 360) + 360) % 360;
    const degPitch = pitch * 180 / Math.PI;

    const cardinals = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const cardIdx = Math.round(degYaw / 22.5) % 16;
    const cardinal = cardinals[cardIdx];

    this.theodoliteAzimuth.textContent = `${degYaw.toFixed(1).padStart(5, '0')}° ${cardinal}`;
    this.theodoliteElevation.textContent = `${degPitch >= 0 ? '+' : ''}${degPitch.toFixed(1)}° EL`;
  }

  get isTheodoliteActive(): boolean {
    return this.theodoliteActive;
  }

  setLanternActive(active: boolean): void {
    this.lanternChip.classList.toggle('active', active);
    this.lanternLabel.textContent = active ? 'LANTERN ON' : 'LANTERN';
  }

  setBlenderModelActive(active: boolean): void {
    this.blenderModelActive = active;
    const label = this.root.querySelector('#model-toggle-label');
    if (label) {
      label.textContent = active ? 'BLENDER 3D' : 'VOXEL MODE';
    }
    const btn = this.root.querySelector<HTMLElement>('#model-chip');
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('title', active ? 'Toggle Voxel mode (Shift+B)' : 'Toggle Blender 3D view (Shift+B)');
    }
  }

  private renderPioneers(): void {
    const grid = this.root.querySelector('#pioneers-grid');
    if (!grid) return;

    const filtered =
      this.pioneersCategory === 'all'
        ? PIONEERS
        : PIONEERS.filter((p) => p.biome === this.pioneersCategory);

    const biomeColors: Record<string, string> = {
      classical: '#ffc26b',
      thermo: '#72ffe5',
      electro: '#a5b9ff',
      optics: '#f0b7ff',
      relativity: '#ffc2a5',
      quantum: '#a4ffd1',
    };

    const registeredIds = new Set(this.stations.map((s) => s.id));

    grid.innerHTML = filtered
      .map((p) => {
        const color = biomeColors[p.biome] || '#7ef9ff';
        const isInteractive = registeredIds.has(p.stationId);
        return `
        <article class="pioneer-card" data-pioneer="${p.id}" style="--accent:${color}">
          <div class="pioneer-img-wrap">
            <div class="pioneer-img-backdrop" style="background-image: url('${p.portrait}')"></div>
            <img class="pioneer-img" src="${p.portrait}" alt="${p.name}" loading="lazy" onerror="this.src='/portraits/galileo_raw.jpg'" />
            <span class="pioneer-biome-badge" style="color:${color}">${p.biome}</span>
          </div>
          <div class="pioneer-info">
            <div class="pioneer-name-row">
              <h3 class="pioneer-name">${p.name}</h3>
              <span class="pioneer-lifespan">${p.lifespan} · ${p.year}</span>
            </div>
            <div class="pioneer-discovery">${p.discovery}</div>
            <div class="pioneer-formula-box">
              <span class="pioneer-formula">${p.formula}</span>
              ${p.subFormula ? `<span class="pioneer-subformula">${p.subFormula}</span>` : ''}
            </div>
            <p class="pioneer-desc">${p.significance}</p>
            <div class="pioneer-actions">
              <button class="pioneer-btn pioneer-btn-warp" data-warp-x="${p.position[0]}" data-warp-z="${p.position[1]}" data-p-name="${esc(p.name)}" title="Warp to apparatus viewing position">
                <span>⚡</span><span>WARP</span>
              </button>
              <button class="pioneer-btn pioneer-btn-inspect" data-inspect-station="${p.stationId}" title="Inspect interactive apparatus simulation">
                <span>🔬</span><span>INSPECT</span>
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    // Bind warp buttons
    grid.querySelectorAll<HTMLButtonElement>('.pioneer-btn-warp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const x = parseFloat(btn.dataset.warpX || '0');
        const z = parseFloat(btn.dataset.warpZ || '0');
        const name = btn.dataset.pName || 'Station';
        this.closePioneers();
        if (this.callbacks.onTravelCoordinates) {
          this.callbacks.onTravelCoordinates(x, z);
        }
        this.toast(`Warped to ${name}'s Apparatus`, 'Observation pose engaged', '#f4cf86', '🏛️');
      });
    });

    // Bind inspect buttons
    grid.querySelectorAll<HTMLButtonElement>('.pioneer-btn-inspect').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stId = btn.dataset.inspectStation;
        this.closePioneers();
        if (stId) {
          this.callbacks.onTravel(stId);
        }
      });
    });
  }

  private syncBodyClasses(): void {
    const anyOverlay =
      this.mapOpen ||
      this.bookOpen ||
      this.helpOpen ||
      this.badgeOpen ||
      this.inventoryOpen ||
      this.pioneersOpen ||
      this.guideOpen ||
      this.scholarOpen;
    document.body.classList.toggle('overlay-open', anyOverlay);
    document.body.classList.toggle('theodolite-active', this.theodoliteActive);
  }

  dispose(): void {
    this.root.remove();
  }
}
