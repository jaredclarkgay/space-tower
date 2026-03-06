'use strict';
import * as THREE from 'three';

/**
 * ThirdPersonCamera — refined version of the original exterior camera.
 *
 * Same feel as before: click-drag to orbit, tight lerp follow, auto-trail
 * behind velocity. Adds: pitch control (drag Y), scroll wheel zoom.
 * No spring dampers, no collision raycasting — just fast, responsive lerps.
 */

const DEFAULT_DISTANCE = 8;
const MIN_DISTANCE = 3;
const MAX_DISTANCE = 30;

const MIN_PITCH = -0.25;  // ~-15° (don't go under ground)
const MAX_PITCH =  1.0;   // ~57° (don't flip over)

const DRAG_SENSITIVITY_X = 0.005;
const DRAG_SENSITIVITY_Y = 0.004;

// Position follow — higher = snappier (old code used 0.12)
const POS_LERP = 0.14;
// Look target follow (old code used 0.15)
const LOOK_LERP = 0.18;
// Auto-trail speed (old code used 0.014 fixed; this scales with speed)
const TRAIL_FACTOR = 0.016;

const _lookTarget = new THREE.Vector3();

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;

    this.yaw = 0;
    this.pitch = 0.15;  // slight downward look
    this.distance = DEFAULT_DISTANCE;

    // Smoothed look target
    this._lookX = 0;
    this._lookY = 0;
    this._lookZ = 0;

    // Drag state
    this._isDragging = false;
    this._dragActive = false;  // true once drag exceeds threshold

    this._activated = false;
  }

  activate(playerPos) {
    const cam = this.camera;
    const dx = cam.position.x - playerPos.x;
    const dy = cam.position.y - playerPos.y;
    const dz = cam.position.z - playerPos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.clamp ? Math.atan2(dy, horizDist) : Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.atan2(dy, horizDist)));

    this._lookX = playerPos.x;
    this._lookY = playerPos.y + this.distance * 0.2;
    this._lookZ = playerPos.z;

    this._activated = true;
  }

  /** Call on mousedown/touchstart in exterior. */
  onMouseDown() {
    this._isDragging = true;
    this._dragActive = false;
  }

  /** Call on mouseup/touchend. */
  onMouseUp() {
    this._isDragging = false;
    this._dragActive = false;
  }

  /** Call on mousemove/touchmove with pixel deltas. Only orbits when dragging. */
  onDrag(dx, dy) {
    if (!this._isDragging) return false;
    // Small threshold before activating drag (prevents accidental orbit on click)
    if (!this._dragActive && Math.abs(dx) < 2 && Math.abs(dy) < 2) return false;
    this._dragActive = true;

    this.yaw += dx * DRAG_SENSITIVITY_X;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + dy * DRAG_SENSITIVITY_Y));
    return true;
  }

  /** Scroll wheel zoom. */
  onWheel(deltaY) {
    this.distance += deltaY * 0.01;
    this.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, this.distance));
  }

  /**
   * Main update — call once per frame.
   */
  update(dt, playerPos, playerVel, isBackward) {
    if (!this._activated) return;

    const dist = this.distance;
    const camHeight = dist * 0.15;
    const lookAbove = dist * 0.2;

    // Auto-trail behind velocity (only when not dragging)
    if (!this._isDragging) {
      const speed = Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z);
      if (speed > 0.01) {
        const bk = isBackward;
        const targetYaw = Math.atan2(bk ? playerVel.x : -playerVel.x, bk ? playerVel.z : -playerVel.z);
        let delta = targetYaw - this.yaw;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        this.yaw += delta * TRAIL_FACTOR * (bk ? -1 : 1);
      }
    }

    // Camera position from yaw/pitch/distance
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const targetX = playerPos.x + Math.sin(this.yaw) * cosP * dist;
    const targetY = playerPos.y + sinP * dist + camHeight;
    const targetZ = playerPos.z + Math.cos(this.yaw) * cosP * dist;

    // Tight lerp follow
    const cam = this.camera;
    cam.position.x += (targetX - cam.position.x) * POS_LERP;
    cam.position.y += (targetY - cam.position.y) * POS_LERP;
    cam.position.z += (targetZ - cam.position.z) * POS_LERP;

    // Look target — slightly above player
    this._lookX += (playerPos.x - this._lookX) * LOOK_LERP;
    this._lookY += ((playerPos.y + lookAbove) - this._lookY) * LOOK_LERP;
    this._lookZ += (playerPos.z - this._lookZ) * LOOK_LERP;

    _lookTarget.set(this._lookX, this._lookY, this._lookZ);
    cam.lookAt(_lookTarget);
  }

  /**
   * Camera forward on XZ plane (for camera-relative movement).
   */
  getCameraForward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0.15;
    this.distance = DEFAULT_DISTANCE;
    this._lookX = this._lookY = this._lookZ = 0;
    this._isDragging = false;
    this._dragActive = false;
    this._activated = false;
  }
}
