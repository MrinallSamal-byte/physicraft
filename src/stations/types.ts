import * as THREE from 'three';
import type { BiomeId, EnvironmentState } from '../config';

export type ParamValue = number | string | boolean;

export interface ControlOption {
  value: string | number;
  label: string;
}

export interface ControlDef {
  id: string;
  label: string;
  kind: 'range' | 'select' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: ControlOption[];
  hint?: string;
  format?: (value: number) => string;
}

export interface NarrationCue {
  at: number;
  text: string;
}

export interface ChallengeConfig {
  title: string;
  brief: string;
  hint: string;
  success: string;
  targetLabel: string;
}

export interface ExperimentMeta {
  id: string;
  biome: BiomeId;
  number: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  concept: string;
  realWorld: string;
  formula: string;
  formulaNote: string;
  badgeName: string;
  accent: string;
  accentNumber: number;
  badgeGlyph: string;
  controls: ControlDef[];
  defaults: Record<string, ParamValue>;
  observeParams?: Record<string, ParamValue>;
  observeCues: NarrationCue[];
  challenge: ChallengeConfig;
  chart: {
    title: string;
    positionLabel: string;
    velocityLabel: string;
    energyLabel: string;
  };
}

export interface Readout {
  label: string;
  value: string;
  unit?: string;
  tone?: 'accent' | 'warm' | 'cool' | 'danger' | 'muted';
}

export interface TelemetryTarget {
  id: string;
  object: THREE.Object3D;
  label: string;
  mass: number;
  getState: () => {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    acceleration?: THREE.Vector3;
    mass?: number;
    potentialReference?: number;
    extra?: Array<{ label: string; value: string }>;
  };
}

export interface VectorProbe {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration?: THREE.Vector3;
  normal?: THREE.Vector3;
  friction?: THREE.Vector3;
  gravity?: THREE.Vector3;
  scale?: number;
}

export interface GraphSample {
  t: number;
  position: number;
  velocity: number;
  ke: number;
  pe: number;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export interface StationVisualContext {
  env: EnvironmentState;
  accent: string;
  accentNumber: number;
  biomeName: string;
}

export interface ObservationState {
  active: boolean;
  startedAt: number;
  cueIndex: number;
  duration: number;
}

export interface SolvedPayload {
  id: string;
  badgeName: string;
  title: string;
  accent: string;
  glyph: string;
}

export interface StationFocusTransform {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}
