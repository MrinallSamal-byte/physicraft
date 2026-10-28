/**
 * Realistic Seating & Scholar Theorist System
 * Manages study tables, benches, and living theorist scholars across Physicraft.
 * Allows the player to sit down at study desks and overlook benches with smooth camera
 * transitions and contemplation HUD, and populates study desks with animated scholar NPCs.
 */

import * as THREE from 'three';
import { damp } from '../core/utils';
import type { PlayerController } from '../player/PlayerController';
import { sound } from '../audio/SoundEngine';

export interface SeatDefinition {
  id: string;
  name: string;
  locationName: string;
  benchPosition: THREE.Vector3;
  sitPosition: THREE.Vector3;
  sitYaw: number;
  occupied: boolean;
  occupantName?: string;
  mesh?: THREE.Object3D;
}

export interface SeatedScholar {
  id: string;
  name: string;
  discipline: string;
  seatId: string;
  group: THREE.Group;
  headPivot: THREE.Group;
  torsoMesh: THREE.Mesh;
  gyroscopeRings?: THREE.Mesh[];
  lanternLight?: THREE.PointLight;
  breathePhase: number;
  glanceTimer: number;
  targetHeadPitch: number;
  targetHeadYaw: number;
  currentHeadPitch: number;
  currentHeadYaw: number;
}

export interface ScholarDialogue {
  scholarId: string;
  name: string;
  discipline: string;
  lifespan: string;
  portrait: string;
  treatiseTitle: string;
  treatiseYear: string;
  quote: string;
  keyEquation: string;
  subFormula: string;
  discourse: string;
  stationId: string;
  stationTitle: string;
}

export const SCHOLAR_DIALOGUES: Record<string, ScholarDialogue> = {
  scholar_sir_isaac_newton: {
    scholarId: 'scholar_sir_isaac_newton',
    name: 'Sir Isaac Newton',
    discipline: 'Classical Dynamics & Universal Gravitation',
    lifespan: '1643 – 1727',
    portrait: '/portraits/newton_raw.jpg',
    treatiseTitle: 'Philosophiæ Naturalis Principia Mathematica',
    treatiseYear: 'London, 1687 (Royal Society)',
    quote: 'If I have seen further, it is by standing on the shoulders of Giants.',
    keyEquation: 'F = dp/dt = m·a  |  F = G (m₁ m₂) / r²',
    subFormula: 'In an isolated system, total linear momentum Σ p is strictly conserved across all collisions.',
    discourse:
      'Welcome, scholar. Here in Sector 01, we study how motion persists unchanged unless compelled by an impressed force. Down the canyon corridor stands our elastic collision bench: watch two colliding masses exchange velocity vectors while their center-of-mass momentum remains inviolable. Step to the apparatus and test the conservation laws yourself.',
    stationId: 'collision',
    stationTitle: 'Momentum Collision Laboratory',
  },
  scholar_michael_faraday: {
    scholarId: 'scholar_michael_faraday',
    name: 'Michael Faraday',
    discipline: 'Electromagnetism & Field Dynamics',
    lifespan: '1791 – 1867',
    portrait: '/portraits/faraday_raw.jpg',
    treatiseTitle: 'Experimental Researches in Electricity',
    treatiseYear: 'London, 1831 (Royal Institution)',
    quote: 'Nothing is too wonderful to be true, if it be consistent with the laws of nature.',
    keyEquation: 'ℰ = -dΦ_B / dt = -N · Δ(B · A) / Δt',
    subFormula: 'A time-varying magnetic flux through a conducting loop induces an electromotive force proportional to its rate of change.',
    discourse:
      'Greetings, seeker of fields. Space is not void; it is woven with invisible lines of magnetic tension. When you move a permanent magnetic dipole through a stationary copper coil, the variation of flux gives birth to electric current. Observe the galvanometer needle leap as you plunge the magnet down the core at our Induction bench.',
    stationId: 'faraday',
    stationTitle: 'Electromagnetic Induction Station',
  },
  scholar_albert_einstein: {
    scholarId: 'scholar_albert_einstein',
    name: 'Albert Einstein',
    discipline: 'Special & General Relativity',
    lifespan: '1879 – 1955',
    portrait: '/portraits/einstein_raw.jpg',
    treatiseTitle: 'Die Grundlage der allgemeinen Relativitätstheorie',
    treatiseYear: 'Berlin, 1916 (Annalen der Physik)',
    quote: 'The most incomprehensible thing about the world is that it is comprehensible.',
    keyEquation: 'G_μν + Λ g_μν = (8πG / c⁴) T_μν  |  E = m·c²',
    subFormula: 'Mass-energy curves the four-dimensional metric of spacetime; free particles traverse geodesics through that curvature.',
    discourse:
      'Ah, fellow traveler. Space and time cannot be separated into rigid Aristotelian containers; they form a dynamic four-dimensional fabric deformed by mass and energy. In Sector 05, you will find our Spacetime Curvature apparatus: drop dense stellar cores onto the rubber sheet metric and watch light rays and test masses bend into orbital ellipses.',
    stationId: 'spacetime',
    stationTitle: 'Spacetime Curvature Laboratory',
  },
};

/**
 * Creates high-resolution manuscript texture with authentic handwritten equations and diagrams
 */
function createManuscriptTexture(
  title: string,
  equations: string[],
  diagramType: 'orbit' | 'induction' | 'relativity',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // Aged parchment paper background
  ctx.fillStyle = '#f3e8cf';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle paper grain noise & margins
  ctx.strokeStyle = '#d9c6a5';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, 472, 472);
  ctx.strokeRect(24, 24, 464, 464);

  // Folio crease down the center
  const grad = ctx.createLinearGradient(250, 0, 262, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.5, 'rgba(80,60,30,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(248, 0, 16, 512);

  // Left Page: Title & Handwritten Physics Derivations
  ctx.fillStyle = '#2b1c10';
  ctx.font = 'bold 22px serif';
  ctx.fillText(title, 36, 62);

  ctx.strokeStyle = '#8a5a36';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(36, 72);
  ctx.lineTo(235, 72);
  ctx.stroke();

  ctx.fillStyle = '#3a2718';
  ctx.font = 'italic 16px "Times New Roman", serif';
  let y = 110;
  for (const eq of equations) {
    ctx.fillText(eq, 42, y);
    y += 36;
  }

  // Faint Latin / English scholarly margin notes
  ctx.fillStyle = '#7a6048';
  ctx.font = '11px serif';
  ctx.fillText('Liber primus: De motu corporum', 42, 340);
  ctx.fillText('Observationes accurate collatae anno 1687', 42, 360);
  ctx.fillText('Quod erat demonstrandum. ∴', 42, 440);

  // Right Page: Physics Vector & Geometric Diagram
  ctx.strokeStyle = '#1d3345';
  ctx.lineWidth = 2.0;

  if (diagramType === 'orbit') {
    // Elliptical Keplerian orbit with focus and radius vector
    ctx.beginPath();
    ctx.ellipse(375, 230, 95, 62, 0.2, 0, Math.PI * 2);
    ctx.stroke();

    // Central Sun focus
    ctx.fillStyle = '#d48806';
    ctx.beginPath();
    ctx.arc(335, 222, 9, 0, Math.PI * 2);
    ctx.fill();

    // Planet
    ctx.fillStyle = '#1890ff';
    ctx.beginPath();
    ctx.arc(445, 195, 5, 0, Math.PI * 2);
    ctx.fill();

    // Radius vector line
    ctx.strokeStyle = '#cf1322';
    ctx.beginPath();
    ctx.moveTo(335, 222);
    ctx.lineTo(445, 195);
    ctx.stroke();

    ctx.fillStyle = '#2b1c10';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Sun (F₁)', 310, 248);
    ctx.fillText('r(θ)', 390, 202);
    ctx.fillText('Aphelion', 420, 310);
  } else if (diagramType === 'induction') {
    // Magnetic Induction Loops & Flux Lines
    ctx.beginPath();
    for (let r = 25; r <= 85; r += 18) {
      ctx.arc(375, 220, r, 0, Math.PI * 2);
    }
    ctx.stroke();

    // Field Arrow
    ctx.strokeStyle = '#389e0d';
    ctx.beginPath();
    ctx.moveTo(375, 330);
    ctx.lineTo(375, 110);
    ctx.stroke();

    ctx.fillStyle = '#2b1c10';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('B-Field (Flux Φ)', 320, 95);
    ctx.fillText('Induced EMF: -dΦ/dt', 305, 370);
  } else {
    // Spacetime Minkowski Light Cone
    ctx.beginPath();
    ctx.moveTo(315, 320);
    ctx.lineTo(435, 120);
    ctx.moveTo(435, 320);
    ctx.lineTo(315, 120);
    ctx.stroke();

    ctx.fillStyle = '#2b1c10';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('Future Light Cone', 320, 105);
    ctx.fillText('Worldline ct', 345, 215);
    ctx.fillText('Past Light Cone', 325, 345);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

export class SeatingManager {
  readonly group = new THREE.Group();
  private seats: SeatDefinition[] = [];
  private scholars: SeatedScholar[] = [];
  private currentSeat: SeatDefinition | null = null;
  private playerRef: PlayerController | null = null;
  private onSeatedChange: ((seated: boolean, seatName?: string) => void) | null = null;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'SeatingManager';
    this.scene.add(this.group);
    this.initSeatsAndScholars();
  }

  setOnSeatedChange(callback: (seated: boolean, seatName?: string) => void): void {
    this.onSeatedChange = callback;
  }

  setPlayerRef(player: PlayerController): void {
    this.playerRef = player;
    player.setOnStandUp(() => {
      this.stand();
    });
  }

  getCurrentSeat(): SeatDefinition | null {
    return this.currentSeat;
  }

  isPlayerSeated(): boolean {
    return this.currentSeat !== null;
  }

  getAllSeats(): SeatDefinition[] {
    return [...this.seats];
  }

  getScholars(): SeatedScholar[] {
    return [...this.scholars];
  }

  private initSeatsAndScholars(): void {
    // -------------------------------------------------------------------------
    // 1. The Hall of Constants — 6 Grand Study Consoles at r = 20m
    // -------------------------------------------------------------------------
    const hallTheorists: Array<{
      deskIndex: number;
      name: string;
      discipline: string;
      robeColor: number;
      goggleGlow: number;
      equations: string[];
      diagramType: 'orbit' | 'induction' | 'relativity';
    }> = [
      {
        deskIndex: 1, // Desk 1: Isaac Newton
        name: 'Sir Isaac Newton',
        discipline: 'Classical Gravitation & Motion',
        robeColor: 0x1f2e3d, // Slate scholar cassock
        goggleGlow: 0xffb74d, // Warm amber optics
        equations: ['F = G · (m₁ · m₂) / r²', 'a = F / m', 'p = m · v', 'v(t) = v₀ + a · t'],
        diagramType: 'orbit',
      },
      {
        deskIndex: 3, // Desk 3: Michael Faraday
        name: 'Michael Faraday',
        discipline: 'Electromagnetic Fields & Induction',
        robeColor: 0x1c382b, // Dark spruce coat
        goggleGlow: 0x4dd0e1, // Cyan field glow
        equations: ['ℰ = -dΦ_B / dt', '∮ B · dl = μ₀ · I', 'F = q · (E + v × B)', 'Φ_B = ∫ B · dA'],
        diagramType: 'induction',
      },
      {
        deskIndex: 5, // Desk 5: Albert Einstein
        name: 'Albert Einstein',
        discipline: 'General Relativity & Quantum Photons',
        robeColor: 0x3d3024, // Tweed scholar coat
        goggleGlow: 0x69f0ae, // Mint quantum glow
        equations: ['E = m · c²', 'R_μν - ½ R g_μν = 8πG/c⁴ T_μν', 'E = h · ν', 'Δt = γ · Δt₀'],
        diagramType: 'relativity',
      },
    ];

    const theoristMap = new Map(hallTheorists.map((t) => [t.deskIndex, t]));

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      // Table center at r = 20m
      const tx = Math.cos(a) * 20;
      const tz = Math.sin(a) * 20;

      // Bench positioned at r = 21.35m facing the table and center (0, 0)
      const bx = Math.cos(a) * 21.35;
      const bz = Math.sin(a) * 21.35;
      const sitYaw = a + Math.PI; // Face inward toward (0, 0)

      const theorist = theoristMap.get(i);
      const isOccupied = theorist !== undefined;

      const seat: SeatDefinition = {
        id: `hall_desk_${i}`,
        name: theorist ? `${theorist.name}'s Desk` : `Study Console ${i + 1}`,
        locationName: 'The Hall of Constants',
        benchPosition: new THREE.Vector3(bx, 0.45, bz),
        sitPosition: new THREE.Vector3(bx, 0, bz),
        sitYaw,
        occupied: isOccupied,
        occupantName: theorist?.name,
      };

      // Build 3D wooden bench
      const benchGroup = this.createBenchMesh(bx, bz, sitYaw);
      seat.mesh = benchGroup;
      this.group.add(benchGroup);

      // Build rich props on the study table (manuscript, brass gyroscope, lantern)
      const propsGroup = this.createTableProps(tx, tz, sitYaw, theorist);
      this.group.add(propsGroup);

      if (theorist) {
        // Build living seated theorist scholar NPC
        const scholar = this.createScholarNpc(
          theorist.name,
          theorist.discipline,
          seat.id,
          bx,
          bz,
          sitYaw,
          theorist.robeColor,
          theorist.goggleGlow,
          propsGroup,
        );
        this.scholars.push(scholar);
      }

      this.seats.push(seat);
    }

    // -------------------------------------------------------------------------
    // 2. Biome Overlook Benches — Beautiful viewpoints across the island
    // -------------------------------------------------------------------------
    const biomeOverlooks = [
      {
        id: 'overlook_mechanics',
        name: 'Mechanics Canyon Overlook',
        locationName: 'Classical Mechanics Canyon',
        x: 62,
        z: 32,
        yaw: 2.2,
      },
      {
        id: 'overlook_quantum',
        name: 'Quantum Sanctuary Bench',
        locationName: 'Quantum Domain',
        x: -36,
        z: 58,
        yaw: -0.85,
      },
      {
        id: 'overlook_electromagnetism',
        name: 'Faraday Terrace Bench',
        locationName: 'Electromagnetism',
        x: -60,
        z: -28,
        yaw: 0.95,
      },
    ];

    for (const b of biomeOverlooks) {
      const benchGroup = this.createBenchMesh(b.x, b.z, b.yaw);
      this.group.add(benchGroup);

      this.seats.push({
        id: b.id,
        name: b.name,
        locationName: b.locationName,
        benchPosition: new THREE.Vector3(b.x, 0.45, b.z),
        sitPosition: new THREE.Vector3(b.x, 0, b.z),
        sitYaw: b.yaw,
        occupied: false,
        mesh: benchGroup,
      });
    }
  }

  /**
   * Creates a solid mahogany & wrought-iron study bench
   */
  private createBenchMesh(x: number, z: number, yaw: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x7a4b2a,
      roughness: 0.65,
      metalness: 0.08,
    });

    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x1f272e,
      roughness: 0.85,
      metalness: 0.75,
    });

    // Seat plank (length 2.2m, depth 0.42m, thickness 0.08m at y = 0.48m)
    const seatGeo = new THREE.BoxGeometry(2.2, 0.08, 0.44);
    const seatMesh = new THREE.Mesh(seatGeo, woodMat);
    seatMesh.position.set(0, 0.48, 0);
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    group.add(seatMesh);

    // Bench backrest
    const backGeo = new THREE.BoxGeometry(2.2, 0.26, 0.06);
    const backMesh = new THREE.Mesh(backGeo, woodMat);
    backMesh.position.set(0, 0.78, 0.2);
    backMesh.castShadow = true;
    group.add(backMesh);

    // Wrought iron legs (left & right frames)
    const legGeo = new THREE.BoxGeometry(0.08, 0.5, 0.4);
    const leftLeg = new THREE.Mesh(legGeo, ironMat);
    leftLeg.position.set(-0.95, 0.25, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, ironMat);
    rightLeg.position.set(0.95, 0.25, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    return group;
  }

  /**
   * Creates rich 3D props on the study tables (manuscripts, calipers, gyroscopes, scholar lanterns)
   */
  private createTableProps(
    tableX: number,
    tableZ: number,
    tableYaw: number,
    theorist?: {
      name: string;
      discipline: string;
      equations: string[];
      diagramType: 'orbit' | 'induction' | 'relativity';
    },
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.set(tableX, 0.85, tableZ);
    group.rotation.y = tableYaw;

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.32,
      metalness: 0.88,
    });

    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x2b1c14,
      roughness: 0.75,
    });

    // 1. Open Folio Manuscript
    const manuscriptTex = createManuscriptTexture(
      theorist ? theorist.name : 'Philosophiae Naturalis',
      theorist ? theorist.equations : ['d²x/dt² = F/m', 'E = mc²', 'S = k ln Ω'],
      theorist ? theorist.diagramType : 'orbit',
    );
    const manuscriptMat = new THREE.MeshStandardMaterial({
      map: manuscriptTex,
      roughness: 0.85,
    });
    const manuscriptGeo = new THREE.PlaneGeometry(0.85, 0.58);
    const manuscriptMesh = new THREE.Mesh(manuscriptGeo, manuscriptMat);
    manuscriptMesh.rotation.x = -Math.PI / 2;
    manuscriptMesh.position.set(0, 0.015, -0.05);
    manuscriptMesh.receiveShadow = true;
    group.add(manuscriptMesh);

    // 2. Scholar Amber Lantern
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(0.95, 0, 0.12);

    const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.05, 8);
    const baseMesh = new THREE.Mesh(baseGeo, brassMat);
    lanternGroup.add(baseMesh);

    const glassGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.18, 8);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffd485,
      emissive: 0xffaa33,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.y = 0.11;
    lanternGroup.add(glassMesh);

    const capGeo = new THREE.ConeGeometry(0.09, 0.07, 8);
    const capMesh = new THREE.Mesh(capGeo, brassMat);
    capMesh.position.y = 0.23;
    lanternGroup.add(capMesh);

    const lanternLight = new THREE.PointLight(0xffb74d, 1.8, 5.5, 1.6);
    lanternLight.position.y = 0.14;
    lanternGroup.add(lanternLight);
    group.userData.lanternLight = lanternLight;
    group.add(lanternGroup);

    // 3. Brass Scientific Instrument: Spinning Gyroscope or Drafting Caliper
    if (theorist?.diagramType === 'relativity' || !theorist) {
      // 3D Concentric Brass Gyroscope with Gimbal Rings
      const gyroGroup = new THREE.Group();
      gyroGroup.position.set(-0.85, 0.14, 0.05);

      const standGeo = new THREE.CylinderGeometry(0.015, 0.06, 0.14, 8);
      const standMesh = new THREE.Mesh(standGeo, brassMat);
      gyroGroup.add(standMesh);

      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 24), brassMat);
      ring1.position.y = 0.12;
      gyroGroup.add(ring1);

      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.088, 0.01, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0x4dd0e1, emissive: 0x00bcd4, emissiveIntensity: 0.4 }),
      );
      ring2.position.y = 0.12;
      gyroGroup.add(ring2);

      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 16), brassMat);
      rotor.position.y = 0.12;
      gyroGroup.add(rotor);

      group.userData.gyroRings = [ring1, ring2, rotor];
      group.add(gyroGroup);
    } else {
      // Brass Caliper & Leather Field Journal
      const journalMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.38), darkWoodMat);
      journalMesh.position.set(-0.88, 0.02, 0.08);
      group.add(journalMesh);

      const caliperMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.24), brassMat);
      caliperMesh.position.set(-0.62, 0.01, -0.05);
      caliperMesh.rotation.y = 0.45;
      group.add(caliperMesh);
    }

    return group;
  }

  /**
   * Creates a living seated Theorist Scholar figure (Newton, Faraday, Einstein)
   */
  private createScholarNpc(
    name: string,
    discipline: string,
    seatId: string,
    benchX: number,
    benchZ: number,
    benchYaw: number,
    robeColor: number,
    goggleGlow: number,
    propsGroup: THREE.Group,
  ): SeatedScholar {
    const group = new THREE.Group();
    group.name = `Scholar_${name.replace(/\s+/g, '_')}`;
    group.position.set(benchX, 0, benchZ);
    group.rotation.y = benchYaw;

    const clothMat = new THREE.MeshStandardMaterial({
      color: robeColor,
      roughness: 0.8,
    });

    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x181512,
      roughness: 0.7,
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xdeb887,
      roughness: 0.6,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.85,
    });

    const goggleGlowMat = new THREE.MeshStandardMaterial({
      color: goggleGlow,
      emissive: goggleGlow,
      emissiveIntensity: 1.25,
      roughness: 0.15,
    });

    // 1. Seated Legs & Boots
    // Thighs extending forward horizontally towards table (depth 0.48m at height y = 0.48m)
    const thighGeo = new THREE.BoxGeometry(0.36, 0.18, 0.46);
    const thighs = new THREE.Mesh(thighGeo, clothMat);
    thighs.position.set(0, 0.46, -0.22);
    thighs.castShadow = true;
    group.add(thighs);

    // Calves extending vertically downward to floor
    const calfGeo = new THREE.BoxGeometry(0.34, 0.42, 0.16);
    const calves = new THREE.Mesh(calfGeo, clothMat);
    calves.position.set(0, 0.22, -0.42);
    calves.castShadow = true;
    group.add(calves);

    // Leather Boots on floor
    const bootGeo = new THREE.BoxGeometry(0.36, 0.1, 0.26);
    const boots = new THREE.Mesh(bootGeo, bootMat);
    boots.position.set(0, 0.05, -0.46);
    boots.castShadow = true;
    group.add(boots);

    // 2. Torso with breathing motion
    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.58, 8);
    const torsoMesh = new THREE.Mesh(torsoGeo, clothMat);
    torsoMesh.position.set(0, 0.82, 0.02);
    torsoMesh.castShadow = true;
    group.add(torsoMesh);

    // Shoulder cowl cape draped over back
    const cowlGeo = new THREE.BoxGeometry(0.54, 0.38, 0.22);
    const cowlMesh = new THREE.Mesh(cowlGeo, clothMat);
    cowlMesh.position.set(0, 0.94, 0.06);
    group.add(cowlMesh);

    // Gold cowl clasps
    const claspL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), brassMat);
    claspL.position.set(-0.16, 1.02, -0.08);
    group.add(claspL);
    const claspR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), brassMat);
    claspR.position.set(0.16, 1.02, -0.08);
    group.add(claspR);

    // 3. Arms & Hands resting on table
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.48, 6), clothMat);
    armL.position.set(-0.28, 0.82, -0.28);
    armL.rotation.x = -Math.PI / 3.2;
    armL.rotation.z = Math.PI / 12;
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.48, 6), clothMat);
    armR.position.set(0.28, 0.82, -0.28);
    armR.rotation.x = -Math.PI / 3.2;
    armR.rotation.z = -Math.PI / 12;
    group.add(armR);

    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
    handL.position.set(-0.24, 0.86, -0.52);
    group.add(handL);

    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), skinMat);
    handR.position.set(0.24, 0.86, -0.52);
    group.add(handR);

    // 4. Head & Vector Goggles (mounted on headPivot for living glances)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.18, 0);

    const headGeo = new THREE.SphereGeometry(0.14, 12, 10);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headPivot.add(headMesh);

    // Scholar hair / cowl hood top
    const hairGeo = new THREE.SphereGeometry(0.146, 10, 8);
    const hairMesh = new THREE.Mesh(hairGeo, clothMat);
    hairMesh.scale.set(1.02, 1.08, 1.02);
    hairMesh.position.set(0, 0.02, 0.02);
    headPivot.add(hairMesh);

    // Brass Vector Goggles
    const goggleFrameGeo = new THREE.BoxGeometry(0.24, 0.07, 0.08);
    const goggleFrame = new THREE.Mesh(goggleFrameGeo, brassMat);
    goggleFrame.position.set(0, 0.03, -0.12);
    headPivot.add(goggleFrame);

    // Dual Glowing Optical Lenses
    const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12), goggleGlowMat);
    lensL.rotation.x = Math.PI / 2;
    lensL.position.set(-0.065, 0.03, -0.16);
    headPivot.add(lensL);

    const lensR = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12), goggleGlowMat);
    lensR.rotation.x = Math.PI / 2;
    lensR.position.set(0.065, 0.03, -0.16);
    headPivot.add(lensR);

    // Default tilt: looking down reading manuscript
    headPivot.rotation.x = 0.32;
    group.add(headPivot);

    this.group.add(group);

    return {
      id: `scholar_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      name,
      discipline,
      seatId,
      group,
      headPivot,
      torsoMesh,
      gyroscopeRings: propsGroup.userData.gyroRings,
      lanternLight: propsGroup.userData.lanternLight,
      breathePhase: Math.random() * Math.PI * 2,
      glanceTimer: 2.0 + Math.random() * 3.0,
      targetHeadPitch: 0.32,
      targetHeadYaw: 0,
      currentHeadPitch: 0.32,
      currentHeadYaw: 0,
    };
  }

  /**
   * Finds the nearest empty seat within maxDistance of player position
   */
  getNearestAvailableSeat(pos: THREE.Vector3, maxDist = 2.4): SeatDefinition | null {
    let nearest: SeatDefinition | null = null;
    let minDist = maxDist;

    for (const seat of this.seats) {
      if (seat.occupied && seat !== this.currentSeat) continue;
      const d = pos.distanceTo(seat.benchPosition);
      if (d < minDist) {
        minDist = d;
        nearest = seat;
      }
    }

    return nearest;
  }

  /**
   * Finds the nearest seated historical scholar within maxDistance
   */
  getNearestScholar(pos: THREE.Vector3, maxDist = 3.8): SeatedScholar | null {
    let nearest: SeatedScholar | null = null;
    let minDist = maxDist;

    for (const scholar of this.scholars) {
      const d = pos.distanceTo(scholar.group.position);
      if (d < minDist) {
        minDist = d;
        nearest = scholar;
      }
    }

    return nearest;
  }

  /**
   * Retrieves authentic historical dialogue and treatise citations for a scholar
   */
  getScholarDialogue(scholarId: string): ScholarDialogue | null {
    return SCHOLAR_DIALOGUES[scholarId] ?? null;
  }

  /**
   * Sits the player down at the specified seat
   */
  sit(seat: SeatDefinition): boolean {
    if (seat.occupied && seat !== this.currentSeat) return false;
    if (!this.playerRef) return false;

    this.currentSeat = seat;
    seat.occupied = true;
    seat.occupantName = 'Observer';

    this.playerRef.setSeated(true, seat.sitPosition, seat.sitYaw);
    sound.playSit();
    this.onSeatedChange?.(true, seat.name);
    return true;
  }

  /**
   * Stands the player up
   */
  stand(): void {
    if (!this.currentSeat) return;
    this.currentSeat.occupied = false;
    this.currentSeat.occupantName = undefined;
    this.currentSeat = null;

    if (this.playerRef) {
      this.playerRef.setSeated(false);
      sound.playStand();
    }
    this.onSeatedChange?.(false);
  }

  /**
   * Toggles sitting down at nearest available seat or standing up
   */
  toggleSit(playerPos: THREE.Vector3): boolean {
    if (this.currentSeat) {
      this.stand();
      return true;
    }

    const nearest = this.getNearestAvailableSeat(playerPos, 2.4);
    if (nearest) {
      return this.sit(nearest);
    }
    return false;
  }

  /**
   * Updates living idle animations for scholars, precessing gyroscopes, and ambient lanterns
   */
  update(dt: number, timeOfDay = 12.0): void {
    for (const scholar of this.scholars) {
      // 1. Subtle breathing motion (chest rising & falling)
      scholar.breathePhase += dt * 1.8;
      const breatheY = Math.sin(scholar.breathePhase) * 0.012;
      scholar.torsoMesh.position.y = 0.82 + breatheY;

      // 2. Head glancing behavior (studying manuscript -> glancing up at rotunda -> back to notes)
      scholar.glanceTimer -= dt;
      if (scholar.glanceTimer <= 0) {
        scholar.glanceTimer = 3.5 + Math.random() * 4.5;
        // 60% chance to glance down at manuscript, 40% chance to look up at apparatus/player
        if (Math.random() < 0.6) {
          scholar.targetHeadPitch = 0.28 + Math.random() * 0.12; // Looking down at notes
          scholar.targetHeadYaw = (Math.random() - 0.5) * 0.25;
        } else {
          scholar.targetHeadPitch = -0.05 + Math.random() * 0.15; // Glancing up across the hall
          scholar.targetHeadYaw = (Math.random() - 0.5) * 0.55;
        }
      }

      scholar.currentHeadPitch = damp(scholar.currentHeadPitch, scholar.targetHeadPitch, 3.2, dt);
      scholar.currentHeadYaw = damp(scholar.currentHeadYaw, scholar.targetHeadYaw, 3.2, dt);
      scholar.headPivot.rotation.x = scholar.currentHeadPitch;
      scholar.headPivot.rotation.y = scholar.currentHeadYaw;

      // 3. Precessing Gyroscope Rings
      if (scholar.gyroscopeRings && scholar.gyroscopeRings.length >= 3) {
        scholar.gyroscopeRings[0].rotation.y += dt * 1.8;
        scholar.gyroscopeRings[1].rotation.x += dt * 2.6;
        scholar.gyroscopeRings[2].rotation.z += dt * 4.2;
      }

      // 4. Lantern flicker & Day/Night intensity modulation
      if (scholar.lanternLight) {
        const isNight = timeOfDay < 6.0 || timeOfDay > 18.5;
        const baseIntensity = isNight ? 2.4 : 1.4;
        const flicker = Math.sin(scholar.breathePhase * 3.4) * 0.15;
        scholar.lanternLight.intensity = baseIntensity + flicker;
      }
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.clear();
    this.seats = [];
    this.scholars = [];
    this.currentSeat = null;
  }
}
