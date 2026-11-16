// Bodies: one shared mover for the player and the bots. A box resolved one axis at a
// time against the world's colliders, with a small step-up so stairs and the platform
// edge are walkable, plus gravity, jump and crouch. Bots get a visible humanoid built
// from boxes; the player is a camera and uses the same mover.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.5;
const BOT_SPEED = 4.1;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.4;
const STEP_UP = 0.55;

export function createMover(colliders, start, isBot = false) {
  const body = {
    position: start.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const speed = isBot ? BOT_SPEED : WALK_SPEED;

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // If a low collider blocks a horizontal step, climb onto it instead of stopping.
  function tryStepUp(x, y, z) {
    const hit = overlaps(x, y, z, body.height, 0.04);
    if (!hit) return null;
    const top = hit.max.y;
    if (top - y > STEP_UP || top - y < 0.02) return hit;
    if (overlaps(x, top, z, body.height, 0.02)) return hit;
    return { step: top };
  }

  function moveAxis(dx, dz) {
    if (dx) {
      const nextX = body.position.x + dx;
      const stepped = tryStepUp(nextX, body.position.y, body.position.z);
      if (!stepped) body.position.x = nextX;
      else if (stepped.step !== undefined) { body.position.x = nextX; body.position.y = stepped.step; body.velocity.y = 0; body.onGround = true; }
      else body.velocity.x = 0;
    }
    if (dz) {
      const nextZ = body.position.z + dz;
      const stepped = tryStepUp(body.position.x, body.position.y, nextZ);
      if (!stepped) body.position.z = nextZ;
      else if (stepped.step !== undefined) { body.position.z = nextZ; body.position.y = stepped.step; body.velocity.y = 0; body.onGround = true; }
      else body.velocity.z = 0;
    }
  }

  function step(dt, wishX, wishZ, jump, crouch) {
    if (crouch && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const len = Math.hypot(wishX, wishZ) || 1;
    const wx = wishX / len;
    const wz = wishZ / len;
    const targetSpeed = body.crouching ? CROUCH_SPEED : speed;
    const blend = Math.min(1, (body.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / targetSpeed);
    body.velocity.x += (wx * targetSpeed * (wishX || wishZ ? 1 : 0) - body.velocity.x) * blend;
    body.velocity.z += (wz * targetSpeed * (wishX || wishZ ? 1 : 0) - body.velocity.z) * blend;
    if (body.onGround && !wishX && !wishZ) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (jump && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    moveAxis(body.velocity.x * dt, 0);
    moveAxis(0, body.velocity.z * dt);

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    body,
    step,
    look(dx, dy, sensitivity = 0.0022) {
      body.yaw -= dx * sensitivity;
      body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
    },
    recoil(pitchKick, yawKick) {
      body.pitch = Math.min(1.45, body.pitch + pitchKick);
      body.yaw += yawKick;
    },
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}

// A bot's visible body: torso and head are the hitboxes the player's ray tests.
export function createBotMesh(scene, team) {
  const teamColor = team === 'amber' ? PALETTE.accent : PALETTE.danger;
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.7, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241a12'), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a582'), roughness: 0.7 });
  const group = new THREE.Group();

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.22), dark);
  legs.position.y = 0.36;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
  torso.position.y = 1.08;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
  head.position.y = 1.58;
  head.userData.part = 'head';
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.6;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.18, -0.28);
  group.add(legs, torso, head, helmet, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head };
}
