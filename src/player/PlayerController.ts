import * as THREE from 'three';
import { WORLD } from '../config';
import { clamp, damp } from '../core/utils';
import type { Input } from './Input';
import { sound } from '../audio/SoundEngine';

const PLAYER_RADIUS = 0.34;
const PLAYER_HEIGHT = 1.78;
const MAX_WALK_SPEED = 6.0;
const SPRINT_SPEED = 9.2;
const JUMP_VELOCITY = 6.4;

export class PlayerController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0.025;
  grounded = true;
  enabled = true;
  sprinting = false;
  moving = false;
  private bobTime = 0;
  private stepDistance = 0;
  private landingKick = 0;
  private lastGrounded = true;
  private colliders: THREE.Box3[] = [];
  private onFootstep: ((position: THREE.Vector3, intensity: number) => void) | null = null;
  private onLand: ((impact: number) => void) | null = null;
  private fovBase = 74;
  private targetFov = 74;
  private slimeChecker: ((position: THREE.Vector3) => boolean) | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private input: Input,
  ) {
    this.position.set(0, 0, 14);
    this.camera.fov = this.fovBase;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.eyePosition);
  }

  setColliders(colliders: THREE.Box3[]): void {
    this.colliders = colliders;
  }

  setSlimeChecker(checker: (position: THREE.Vector3) => boolean): void {
    this.slimeChecker = checker;
  }

  applyImpulse(origin: THREE.Vector3, force: number): void {
    const dir = this.position.clone().sub(origin);
    const dist = Math.max(1.0, dir.length());
    dir.normalize();
    const factor = Math.max(0, 1 - dist / 8.0) * force;
    this.velocity.x += dir.x * factor;
    this.velocity.z += dir.z * factor;
    this.velocity.y = Math.max(this.velocity.y, 4.0 + factor * 0.5);
    this.grounded = false;
  }

  setCallbacks(callbacks: {
    onFootstep?: (position: THREE.Vector3, intensity: number) => void;
    onLand?: (impact: number) => void;
  }): void {
    this.onFootstep = callbacks.onFootstep ?? null;
    this.onLand = callbacks.onLand ?? null;
  }

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + WORLD.eyeHeight, this.position.z);
  }

  getLookDirection(target = new THREE.Vector3()): THREE.Vector3 {
    return target
      .set(0, 0, -1)
      .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
      .normalize();
  }

  getPlanarForward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  getPlanarRight(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  applyLookDelta(x: number, y: number, sensitivity = 0.0019): void {
    this.yaw -= x * sensitivity;
    this.pitch = clamp(this.pitch - y * sensitivity, -1.48, 1.48);
  }

  teleport(position: THREE.Vector3, faceYaw?: number): void {
    this.position.copy(position);
    this.position.y = 0;
    this.velocity.set(0, 0, 0);
    if (faceYaw !== undefined) this.yaw = faceYaw;
    this.grounded = true;
    this.updateCamera(0);
  }

  setFovTarget(fov: number): void {
    this.targetFov = fov;
  }

  update(dt: number, gravity: number): void {
    if (!this.enabled) return;
    dt = Math.min(dt, 1 / 30);
    const look = this.input.consumeMouseDelta();
    this.applyLookDelta(look.x, look.y);

    const keys = this.input.keys;
    const forward = this.getPlanarForward();
    const right = this.getPlanarRight();
    const wish = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) wish.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) wish.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) wish.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    this.sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && wish.lengthSq() > 0;
    this.moving = wish.lengthSq() > 0;

    const maxSpeed = this.sprinting ? SPRINT_SPEED : MAX_WALK_SPEED;
    const acceleration = this.grounded ? 34 : 10;
    const targetX = wish.x * maxSpeed;
    const targetZ = wish.z * maxSpeed;
    this.velocity.x = damp(this.velocity.x, targetX, acceleration, dt);
    this.velocity.z = damp(this.velocity.z, targetZ, acceleration, dt);
    if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;

    if (keys.has('Space') && this.grounded) {
      this.velocity.y = gravity > 0 ? Math.sqrt(JUMP_VELOCITY * JUMP_VELOCITY + gravity * 0.15) : 3.4;
      this.grounded = false;
      this.lastGrounded = false;
      sound.playJump();
    }

    this.velocity.y -= gravity * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    const oldY = this.position.y;
    const desired = this.position.clone().addScaledVector(this.velocity, dt);

    // Resolve horizontal movement first so ledges feel predictable.
    this.tryMoveAxis('x', desired.x);
    this.tryMoveAxis('z', desired.z);
    this.tryMoveAxis('y', desired.y);

    this.resolveDepenetration();

    if (this.position.y <= 0) {
      const impactVelocity = Math.abs(this.velocity.y);
      if (!this.lastGrounded && impactVelocity > 1.0) {
        if (this.slimeChecker?.(this.position)) {
          this.velocity.y = Math.min(22, Math.max(7.5, impactVelocity * 0.82));
          this.grounded = false;
          sound.playSlimeBounce();
        } else {
          this.landingKick = clamp(impactVelocity / 22, 0.04, 0.2);
          this.onLand?.(impactVelocity);
          sound.playLand(clamp(impactVelocity / 10, 0.2, 1.0));
          this.velocity.y = 0;
          this.grounded = true;
        }
      } else {
        this.velocity.y = 0;
        this.grounded = true;
      }
      this.position.y = 0;
      this.lastGrounded = this.grounded;
    } else {
      if (!this.lastGrounded && this.grounded) {
        // Landed on a block!
        if (this.slimeChecker?.(this.position)) {
          this.velocity.y = 7.5;
          this.grounded = false;
          sound.playSlimeBounce();
        } else {
          sound.playLand(0.8);
        }
      }
      if (this.grounded && !this.checkBlockBeneath()) {
        this.grounded = false;
      }
      this.lastGrounded = this.grounded;
    }

    // Keep the explorer on the island and away from the void.
    const radial = Math.hypot(this.position.x, this.position.z);
    const maxRadius = WORLD.radius - 8;
    if (radial > maxRadius) {
      const scale = maxRadius / radial;
      this.position.x *= scale;
      this.position.z *= scale;
      this.velocity.x *= 0.2;
      this.velocity.z *= 0.2;
    }

    if (this.position.y < -8) {
      this.teleport(new THREE.Vector3(0, 0, 14), 0);
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && horizontalSpeed > 0.5) {
      this.bobTime += dt * horizontalSpeed * 1.55;
      this.stepDistance += horizontalSpeed * dt;
      if (this.stepDistance > (this.sprinting ? 2.4 : 1.9)) {
        this.stepDistance = 0;
        this.onFootstep?.(this.position, this.sprinting ? 1 : 0.62);
        sound.playFootstep();
      }
    }
    this.landingKick = damp(this.landingKick, 0, 8, dt);
    this.updateCamera(dt, horizontalSpeed, oldY);
  }

  private tryMoveAxis(axis: 'x' | 'y' | 'z', targetValue: number): void {
    if (!Number.isFinite(targetValue)) return;
    const previous = this.position[axis];
    this.position[axis] = targetValue;

    // Bedrock ground floor boundary: Island bedrock surface is at y = 0
    if (axis === 'y' && targetValue <= 0) {
      this.position.y = 0;
      if (this.velocity.y <= 0) {
        if (this.slimeChecker?.(this.position)) {
          const bounce = Math.abs(this.velocity.y) * 0.85;
          this.velocity.y = Math.min(22, Math.max(7.5, bounce));
          this.grounded = false;
          sound.playSlimeBounce();
        } else {
          this.grounded = true;
          this.velocity.y = 0;
        }
      }
      return;
    }

    if (this.collides()) {
      // Step-assist: Allow stepping up over small curbs/stairs up to 0.38m high
      if ((axis === 'x' || axis === 'z') && this.grounded) {
        const originalY = this.position.y;
        let stepped = false;
        for (const step of [0.15, 0.28, 0.38]) {
          this.position.y = originalY + step;
          if (!this.collides()) {
            stepped = true;
            break;
          }
        }
        if (stepped) {
          return;
        }
        this.position.y = originalY;
      }

      this.position[axis] = previous;
      if (axis === 'y') {
        if (this.velocity.y <= 0) {
          if (this.slimeChecker?.(this.position)) {
            const bounce = Math.abs(this.velocity.y) * 0.85;
            this.velocity.y = Math.min(22, Math.max(7.5, bounce));
            this.grounded = false;
            sound.playSlimeBounce();
          } else {
            this.grounded = true;
            this.velocity.y = 0;
          }
        } else {
          this.velocity.y = 0;
        }
      } else {
        this.velocity[axis] = 0;
      }
    }
  }

  private checkBlockBeneath(): boolean {
    if (this.position.y <= 0.001) return true;
    const minX = this.position.x - PLAYER_RADIUS;
    const maxX = this.position.x + PLAYER_RADIUS;
    const minZ = this.position.z - PLAYER_RADIUS;
    const maxZ = this.position.z + PLAYER_RADIUS;
    const footY = this.position.y;
    for (const collider of this.colliders) {
      if (
        maxX > collider.min.x &&
        minX < collider.max.x &&
        maxZ > collider.min.z &&
        minZ < collider.max.z
      ) {
        if (footY >= collider.max.y - 0.12 && footY <= collider.max.y + 0.08) {
          return true;
        }
      }
    }
    return false;
  }

  private resolveDepenetration(): void {
    const minX = this.position.x - PLAYER_RADIUS;
    const maxX = this.position.x + PLAYER_RADIUS;
    const minZ = this.position.z - PLAYER_RADIUS;
    const maxZ = this.position.z + PLAYER_RADIUS;
    const minY = this.position.y + 0.05;
    const maxY = this.position.y + PLAYER_HEIGHT;

    for (const collider of this.colliders) {
      if (
        maxX > collider.min.x &&
        minX < collider.max.x &&
        maxY > collider.min.y &&
        minY < collider.max.y &&
        maxZ > collider.min.z &&
        minZ < collider.max.z
      ) {
        const pushLeft = collider.min.x - maxX;
        const pushRight = collider.max.x - minX;
        const pushBack = collider.min.z - maxZ;
        const pushFront = collider.max.z - minZ;

        const pushX = Math.abs(pushLeft) < Math.abs(pushRight) ? pushLeft : pushRight;
        const pushZ = Math.abs(pushBack) < Math.abs(pushFront) ? pushBack : pushFront;

        if (Math.abs(pushX) < Math.abs(pushZ)) {
          this.position.x += pushX;
          this.velocity.x = 0;
        } else {
          this.position.z += pushZ;
          this.velocity.z = 0;
        }
      }
    }
  }

  private collides(): boolean {
    const minX = this.position.x - PLAYER_RADIUS;
    const maxX = this.position.x + PLAYER_RADIUS;
    const minZ = this.position.z - PLAYER_RADIUS;
    const maxZ = this.position.z + PLAYER_RADIUS;
    const minY = this.position.y + 0.05;
    const maxY = this.position.y + PLAYER_HEIGHT;
    for (const collider of this.colliders) {
      if (
        maxX > collider.min.x &&
        minX < collider.max.x &&
        maxY > collider.min.y &&
        minY < collider.max.y &&
        maxZ > collider.min.z &&
        minZ < collider.max.z
      ) {
        return true;
      }
    }
    return false;
  }

  private updateCamera(dt: number, speed = 0, oldY = this.position.y): void {
    const bobStrength = this.grounded ? clamp(speed / SPRINT_SPEED, 0, 1) : 0;
    const bobY = Math.sin(this.bobTime * 2) * 0.035 * bobStrength;
    const bobX = Math.cos(this.bobTime) * 0.02 * bobStrength;
    const roll = Math.sin(this.bobTime) * 0.004 * bobStrength;
    const fovTarget = this.targetFov + (this.sprinting ? 4 : 0);
    this.camera.fov = damp(this.camera.fov, fovTarget, 4, dt || 1);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + WORLD.eyeHeight + bobY - this.landingKick,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
    void oldY;
  }
}
