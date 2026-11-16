// The map: "Freight Yard 9", a dusk industrial yard, 40 x 56 m, three lanes. West is a
// crate alley, east a container lane, mid a raised loading platform with steps both sides.
// Two bomb sites sit at the north end (A west, B east); Amber spawns south, Rust north.
// Plain geometry only, no models and no textures. Every box is a collider for bodies and
// a surface a bullet stops on; the waypoint graph is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints: [x, z, groundY]. Edges join neighbours a bot may walk between.
const WAYPOINTS = [
  [0, 24, 0], [-5, 24, 0], [5, 24, 0], // 0-2 Amber spawn
  [-14, 14, 0], [0, 14, 0], [14, 14, 0], // 3-5 south lane
  [-14, 2, 0], [0, 8, 0], [14, 2, 0], // 6-8 mid-south
  [-14, -10, 0], [0, -12, 0], [14, -10, 0], // 9-11 mid-north
  [-14, -20, 0], [14, -20, 0], // 12-13 sites A, B
  [0, -24, 0], [-7, -24, 0], [7, -24, 0], // 14-16 Rust spawn
  [-7, 8, 0], [7, 8, 0], // 17-18 lane shoulders
  [0, -2, 0.9], [-4, -2, 0.9], [4, -2, 0.9], // 19-21 platform top
  [0, 4, 0], [0, -8, 0], // 22-23 platform steps
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 5], [0, 4], [3, 6], [5, 8], [4, 7], [4, 22],
  [6, 9], [8, 11], [7, 22], [7, 17], [7, 18], [17, 3], [18, 5], [17, 6], [18, 8],
  [9, 12], [11, 13], [9, 10], [11, 10], [10, 23], [10, 14], [12, 14], [13, 14],
  [14, 15], [14, 16], [15, 12], [16, 13], [6, 17], [8, 18], [9, 17], [11, 18],
  [22, 19], [23, 19], [19, 20], [19, 21], [20, 22], [21, 23], [20, 7], [21, 7],
  [22, 7], [23, 10], [3, 4], [4, 5], [12, 9], [13, 11],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'surface' ? 0.25 : 0.03,
    });
  }
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#241a12'), roughness: 0.95 });
  const rustMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6e3a28'), roughness: 0.85, metalness: 0.2 });
  const amberGlow = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 1.6 });
  const redGlow = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), emissive: new THREE.Color(PALETTE.danger), emissiveIntensity: 1.2 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat = 'hairline', collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat] ?? mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function rawBox(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground and the yard walls.
  box(40.4, 0.4, 56.4, 0, -0.2, 0, 'canvas');
  box(0.6, 5.2, 56.4, -20.3, 2.6, 0, 'surface');
  box(0.6, 5.2, 56.4, 20.3, 2.6, 0, 'surface');
  box(40.4, 5.2, 0.6, 0, 2.6, -28.3, 'surface');
  box(40.4, 5.2, 0.6, 0, 2.6, 28.3, 'surface');

  // Mid: the loading platform (top y = 0.9) with a step on each side, walkable via step-up.
  box(10, 0.9, 8, 0, 0.45, -2, 'surface');
  box(10, 0.45, 1.4, 0, 0.225, 2.7, 'hairline');
  box(10, 0.45, 1.4, 0, 0.225, -6.7, 'hairline');
  // Platform pillars and a low rail on the platform edge.
  box(0.8, 2.6, 0.8, -4.6, 1.3, -5.6, 'hairline');
  box(0.8, 2.6, 0.8, 4.6, 1.3, -5.6, 'hairline');
  box(0.8, 2.6, 0.8, -4.6, 1.3, 1.6, 'hairline');
  box(0.8, 2.6, 0.8, 4.6, 1.3, 1.6, 'hairline');

  // West lane: crate alley.
  box(2.2, 1.2, 1.4, -14, 0.6, 14, 'hairline');
  box(1.4, 1.2, 2.2, -16.5, 0.6, 6, 'hairline');
  box(1.4, 2.4, 1.4, -12.5, 1.2, -2, 'hairline');
  box(2.2, 1.2, 1.4, -15, 0.6, -8, 'hairline');
  box(1.4, 1.2, 1.4, -17.5, 0.6, -14, 'hairline');
  box(2.4, 1.8, 1.2, -12, 0.9, -16, 'hairline');
  // East lane: containers.
  rawBox(6.4, 2.6, 2.6, 14, 1.3, 8, rustMat);
  rawBox(6.4, 2.6, 2.6, 14, 1.3, -12, rustMat);
  box(1.6, 1.2, 1.6, 16.5, 0.6, -2, 'hairline');
  box(1.6, 1.2, 1.6, 11.5, 0.6, 16, 'hairline');
  box(1.6, 2.2, 1.6, 12, 1.1, -18, 'hairline');

  // Mid shoulders: sandbag rows and a fuel drum cluster.
  box(3.2, 1.0, 1.0, -7.5, 0.5, 8, 'hairline');
  box(3.2, 1.0, 1.0, 7.5, 0.5, 8, 'hairline');
  box(1.0, 1.0, 3.2, -8, 0.5, -12, 'hairline');
  box(1.0, 1.0, 3.2, 8, 0.5, -12, 'hairline');

  // Bomb sites: a painted floor plate, drums and a lamp post each.
  function site(x, z, glow) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 6), glow === 'A' ? amberGlow : redGlow);
    plate.position.set(x, 0.04, z);
    plate.receiveShadow = true;
    group.add(plate);
    box(1.1, 1.1, 1.1, x - 2.2, 0.55, z - 2.2, 'hairline');
    box(1.1, 1.1, 1.1, x + 2.2, 0.55, z + 2.2, 'hairline');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.4, 8), materials.hairline);
    pole.position.set(x + 3.4, 2.7, z - 3.4);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), glow === 'A' ? amberGlow : redGlow);
    lamp.position.set(x + 3.4, 5.4, z - 3.4);
    group.add(lamp);
  }
  site(-14, -20, 'A');
  site(14, -20, 'B');

  // Corner silos (visual bulk + cover) and the gantry crane over mid.
  for (const [x, z] of [[-17, -25], [17, -25], [-17, 25], [17, 25]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 7, 14), darkMat);
    silo.position.set(x, 3.5, z);
    silo.castShadow = true;
    silo.receiveShadow = true;
    group.add(silo);
    colliders.push(new THREE.Box3().setFromObject(silo));
    shootables.push(silo);
  }
  box(1.0, 1.0, 40, -8, 9.5, -2, 'hairline', false);
  box(0.8, 3.4, 0.8, -8, 7.8, -20, 'hairline', false);
  box(0.8, 3.4, 0.8, -8, 7.8, 16, 'hairline', false);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), materials.muted);
  hook.position.set(-8, 8.2, -2);
  group.add(hook);

  // Distant skyline silhouettes outside the walls, for depth at dusk.
  const skyline = [[-32, -20, 10, 14], [-30, 8, 8, 20], [32, -14, 12, 12], [30, 14, 9, 18], [0, -38, 16, 10], [-14, 38, 12, 9]];
  for (const [x, z, w, h] of skyline) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), darkMat);
    m.position.set(x, h / 2 - 0.5, z);
    group.add(m);
  }

  // Light: a low amber sun from the west, a cool dusk fill, and the yard's own lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color('#241a12'), 1.05);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb347'), 3.0);
  sun.position.set(-26, 12, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 0.5);
  fill.position.set(18, 16, -18);
  scene.add(fill);
  const lampA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16);
  lampA.position.set(-10.6, 5.2, -23.4);
  scene.add(lampA);
  const lampB = new THREE.PointLight(new THREE.Color(PALETTE.danger), 12, 16);
  lampB.position.set(17.4, 5.2, -23.4);
  scene.add(lampB);

  // The bomb itself: a small charge with a blinking light, hidden until planted.
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), darkMat);
  bombBody.castShadow = true;
  const bombLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  bombLight.position.set(0, 0.16, 0);
  bombGroup.add(bombBody, bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);

  const sites = [
    { id: 'A', center: new THREE.Vector3(-14, 0, -20), radius: 3.2 },
    { id: 'B', center: new THREE.Vector3(14, 0, -20), radius: 3.2 },
  ];
  const spawns = {
    amber: [new THREE.Vector3(0, 0, 24), new THREE.Vector3(-4, 0, 24), new THREE.Vector3(4, 0, 24)],
    rust: [
      new THREE.Vector3(-7, 0, -24), new THREE.Vector3(0, 0, -24), new THREE.Vector3(7, 0, -24),
      new THREE.Vector3(-11, 0, -22), new THREE.Vector3(11, 0, -22),
    ],
  };
  const nodes = WAYPOINTS.map(([x, z, y]) => ({ x, z, y }));
  const adjacency = nodes.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return { colliders, shootables, sites, spawns, nodes, adjacency, bombGroup, bombLight, group };
}
