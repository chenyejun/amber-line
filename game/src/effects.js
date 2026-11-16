// Tracers, impacts and explosions. One small pool of reusable meshes, nothing allocated
// in the hot loop: a tracer is a stretched box that fades, an impact is a burst of points,
// an explosion is a flash sphere and a light that dies fast.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_POOL = 10;

export function createEffects(scene) {
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(12 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const mat = new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0 });
    const points = new THREE.Points(sparkGeo.clone(), mat);
    points.visible = false;
    scene.add(points);
    sparks.push({ points, life: 0, vel: new Float32Array(12 * 3) });
  }
  let sparkIndex = 0;

  const flashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  flashMesh.visible = false;
  scene.add(flashMesh);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 22);
  scene.add(flashLight);
  let flashLife = 0;

  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    tracer(from, to, team) {
      const slot = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % TRACER_POOL;
      slot.mesh.material.color.set(team === 'rust' ? PALETTE.danger : PALETTE.accent);
      dir.copy(to).sub(from);
      const len = dir.length();
      if (len < 0.1) return;
      mid.copy(from).add(to).multiplyScalar(0.5);
      slot.mesh.position.copy(mid);
      slot.mesh.lookAt(to);
      slot.mesh.scale.set(1, 1, len);
      slot.mesh.visible = true;
      slot.mesh.material.opacity = 0.85;
      slot.life = 0.09;
    },
    impact(point, normal) {
      const slot = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % SPARK_POOL;
      const attr = slot.points.geometry.getAttribute('position');
      for (let i = 0; i < 12; i += 1) {
        attr.setXYZ(i, point.x, point.y, point.z);
        slot.vel[i * 3] = (Math.random() - 0.5) * 4 + normal.x * 2;
        slot.vel[i * 3 + 1] = Math.random() * 3 + 1;
        slot.vel[i * 3 + 2] = (Math.random() - 0.5) * 4 + normal.z * 2;
      }
      attr.needsUpdate = true;
      slot.points.visible = true;
      slot.points.material.opacity = 1;
      slot.life = 0.35;
    },
    explosion(point, radius) {
      flashMesh.position.copy(point);
      flashMesh.scale.setScalar(radius * 0.6);
      flashMesh.visible = true;
      flashMesh.material.opacity = 0.9;
      flashLight.position.copy(point);
      flashLight.position.y += 1;
      flashLight.intensity = 90;
      flashLife = 0.5;
    },
    step(dt) {
      for (const slot of tracers) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) { slot.mesh.visible = false; continue; }
        slot.mesh.material.opacity = slot.life / 0.09 * 0.85;
      }
      for (const slot of sparks) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) { slot.points.visible = false; continue; }
        const attr = slot.points.geometry.getAttribute('position');
        for (let i = 0; i < 12; i += 1) {
          attr.setXYZ(i,
            attr.getX(i) + slot.vel[i * 3] * dt,
            Math.max(0.02, attr.getY(i) + slot.vel[i * 3 + 1] * dt),
            attr.getZ(i) + slot.vel[i * 3 + 2] * dt);
          slot.vel[i * 3 + 1] -= 12 * dt;
        }
        attr.needsUpdate = true;
        slot.points.material.opacity = slot.life / 0.35;
      }
      if (flashLife > 0) {
        flashLife -= dt;
        const t = Math.max(0, flashLife / 0.5);
        flashMesh.material.opacity = t * 0.9;
        flashMesh.scale.setScalar(flashMesh.scale.x * (1 + dt * 2));
        flashLight.intensity = t * 90;
        if (flashLife <= 0) { flashMesh.visible = false; flashLight.intensity = 0; }
      }
    },
  };
}
