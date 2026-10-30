import * as THREE from './vendor/three.module.js';
import { createStickman } from './enemy.js';
import { createPlayerController, PLAYER } from './physics.js';

// Sweep a small camera volume, including the near plane, against actual solids.
// This keeps the death view inside rooms and above the floor / gallery deck.
export function clipDeathCamera(focus, desired, colliders, margin = .18) {
  const direction = desired.clone().sub(focus), length = direction.length();
  if (length < .001) return focus.clone();
  const ray = new THREE.Ray(focus, direction.normalize()), box = new THREE.Box3(), hit = new THREE.Vector3();
  let distance = length;
  for (const collider of colliders) {
    box.copy(collider).expandByScalar(margin);
    if (box.containsPoint(focus)) continue;
    if (ray.intersectBox(box, hit)) distance = Math.min(distance, Math.max(.01, focus.distanceTo(hit) - .02));
  }
  return ray.at(distance, new THREE.Vector3());
}

export class DeathView {
  constructor(scene, world) { this.scene = scene; this.world = world; this.active = false; this.elapsed = 0; }
  begin({ position, yaw, weapon = 0, speed = 0, source, team = null, index = 0, poseSeed }, camera) {
    this.reset(); this.active = true; this.elapsed = 0;
    this.eye = position.clone(); this.motion = createPlayerController(this.eye, this.world);
    this.startPosition = camera.position.clone(); this.startRotation = camera.quaternion.clone();
    this.direction = source ? position.clone().sub(new THREE.Vector3().fromArray(source)).setY(0) : new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (this.direction.lengthSq() < .001) this.direction.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.direction.normalize();
    this.rig = createStickman({ weapon, team, index, poseSeed }); this.rig.group.rotation.y = yaw + Math.PI;
    this.rig.animate(0, { speed, aim: 1 }); this.rig.healthBar.visible = false;
    this.scene.add(this.rig.group); this.rig.group.visible = false;
    const focus = this.focus();
    let best = -Infinity;
    for (const [index, offset] of [.2, -.8, 1.4, -1.4, Math.PI].entries()) {
      const angle = yaw + offset, target = this.destination(focus, angle);
      const score = clipDeathCamera(focus, target, this.world.colliders).distanceTo(focus) - index * .08;
      if (score > best) { best = score; this.angle = angle; }
    }
  }
  focus() { return new THREE.Vector3(this.eye.x, this.eye.y - PLAYER.eye + .5, this.eye.z); }
  destination(focus, angle) { return focus.clone().add(new THREE.Vector3(Math.sin(angle) * 3.2, 2.15, Math.cos(angle) * 3.2)); }
  update(dt, camera) {
    if (!this.active) return;
    this.elapsed += dt;
    // Cosmetic death time follows real time, so even a slow client finishes
    // falling before the host's three-second respawn. Physics / IK use substeps.
    for (let remaining = dt; remaining > .000001;) {
      const step = Math.min(remaining, .04); remaining -= step;
      this.motion.update(step, {}); this.rig.fall(step, { direction: this.direction });
    }
    this.rig.group.position.copy(this.eye); this.rig.group.position.y -= PLAYER.eye;
    const focus = this.focus(), target = clipDeathCamera(focus, this.destination(focus, this.angle), this.world.colliders);
    const progress = Math.min(1, this.elapsed / .9), ease = 1 - (1 - progress) ** 3;
    camera.position.copy(clipDeathCamera(focus, this.startPosition.clone().lerp(target, ease), this.world.colliders));
    // Frame the body above center, leaving the lower part clear for the countdown.
    const look = focus.clone().addScaledVector(this.direction, .25); look.y -= .8;
    camera.lookAt(look); camera.rotateZ(.10);
    camera.quaternion.slerpQuaternions(this.startRotation, camera.quaternion.clone(), ease);
    // Hide the local mesh until the camera has left its head and shoulders.
    this.rig.group.visible = camera.position.distanceTo(this.eye) > .8;
    camera.updateMatrixWorld(true);
  }
  reset() { this.rig?.dispose(); this.rig = null; this.active = false; this.elapsed = 0; }
}
