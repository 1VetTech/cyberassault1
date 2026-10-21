/*
 * 1VETTECH Cyber Tower — Facility Alpha MVP
 *
 * Core code is kept in this file with named sections so operators, weapons,
 * enemies, and objectives can be extended without rewriting the renderer.
 * Three.js (when available) renders the true 3D scene; the game rules are
 * renderer-independent and have a playable isometric canvas fallback.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const rand = (a, b) => a + Math.random() * (b - a);
  const FIELD_ART_URL = 'assets/1vettech 3d world.jpg';
  const WORLD = { minX: -22, maxX: 22, minZ: -19, maxZ: 18 };
  const PLAYER_HP = 600, ENEMY_HP = 800, BOSS_HP = 1000;
  const ENEMY_DAMAGE_PER_STRIKE = PLAYER_HP / 22;
  const VEHICLE_DAMAGE_PER_SHOT = 200;
  const hasThree = typeof window.THREE !== 'undefined';
  let renderer3D = null, scene3D = null, camera3D = null, previewRenderer = null, previewScene = null, previewCamera = null;
  let can3D = false, previewActor = null, previewRing = null, previewClock = 0, previewWorldActor = null;
  let fallbackCanvas = $('fallbackCanvas'), fallbackCtx = fallbackCanvas.getContext('2d');
  let mainCanvas = null, toastTimer = 0, lastFrame = 0, lastTime = 0;
  let cameraTarget = { x: 0, y: 0, z: 0 }, staticMeshes = [], beams = [], particles = [], projectiles = [], platforms = [], ladders = [], coverObjects = [];
  let buggyMesh = null, buggyWheelMeshes = [], buggyMuzzleFlash = null;
  let actors = [], enemies = [], collectibles = [], currentWeapon = 0, selectedId = 'operator';
  let includeGideon = true, missionRunning = false, missionEnded = false;
  const fieldArt = new Image();
  fieldArt.src = FIELD_ART_URL;
  let terminalActive = false, terminalFound = false, sectorExplored = false, lostTechFound = false, facilityCleared = false;
  let objectiveMeshes = {}, interactText = '', empCooldown = 0, dashCooldown = 0, repairCooldown = 0;
  let lastToast = '', lastToastAt = 0, worldTime = 0;

  // CHARACTER GRAPHICS QUICK EDIT MAP: Ctrl+F "CHARACTER GRAPHICS:" to find face crops,
  // low-resolution fabric, soft squad glow, and the 3D render/fog quality settings.

  const OPERATOR_INFO = {
    operator: { name: 'OPERATOR', display: 'JJ', role: 'TACTICAL TEAM LEADER', klass: 'BALANCED', quote: '“Protect the team. Protect the network.”', bio: 'JJ leads the squad through Facility Alpha, balancing mobility, accurate fire, and tactical awareness.', abilities: ['TACTICAL AWARENESS', 'WEAPON FLEXIBILITY', 'TEAM COMMAND'], portrait: 'assets/operator.webp', color: 0xb0a17b },
    bubba: { name: 'BUBBA', display: '', role: 'HEAVY ASSAULT', klass: 'HEAVY SUPPORT', quote: '“Straight to the point. Bigger boom.”', bio: 'Bubba takes the direct route, uses heavy rocket fire to clear threats, and draws hostile attention away from Lil Bit.', abilities: ['ROCKET LAUNCHER', 'HEAVY FIRE SUPPORT', 'DIRECT ASSAULT'], portrait: 'assets/bubba.webp', color: 0xa9824e },
    lilbit: { name: 'LIL BIT', display: '', role: 'TACTICAL SPECIALIST', klass: 'HIGH MOBILITY', quote: '“Small package. Big impact.”', bio: 'Lil Bit prefers high ground, moves through the facility with fast climbs, and provides precision cover fire with her compact SMG.', abilities: ['HIGH-GROUND PATHING', 'PRECISION SUPPORT', 'FIELD TECH EXPERTISE'], portrait: 'assets/lilbit.webp', color: 0xd0b174 },
    gideon: { name: 'GIDEON', display: '', role: 'HELMETED OPERATOR', klass: 'SQUAD SUPPORT', quote: '“Eyes up. Sector covered.”', bio: 'Gideon is an optional AI support operator who shadows the squad and adds extra covering fire.', abilities: ['SQUAD SUPPORT', 'COVERING FIRE', 'TACTICAL AWARENESS'], portrait: 'assets/gideon.webp', color: 0x7a9aa4 }
  };

  // CHARACTER GRAPHICS: these rectangles crop the user's original operator portraits
  // to the face area; edit these values when replacing or reframing a portrait.
  const OPERATOR_FACE_FRAMES = {
    operator: { x: .275, y: .035, w: .455, h: .545 },
    bubba:    { x: .285, y: .035, w: .445, h: .545 },
    lilbit:   { x: .345, y: .31,  w: .34,  h: .39  },
    gideon:   { x: .30,  y: .30,  w: .40,  h: .40  }
  };
  const operatorFaceTextures = new Map();
  const tacticalFabricMaterials = new Map();
  let operatorGlowTexture = null;

  function operatorFaceTexture(kind) {
    if (operatorFaceTextures.has(kind)) return operatorFaceTextures.get(kind);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = kind === 'lilbit' ? '#805d49' : kind === 'bubba' ? '#765540' : '#805f4a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    operatorFaceTextures.set(kind, texture);

    const image = new Image();
    image.onload = () => {
      const frame = OPERATOR_FACE_FRAMES[kind] || OPERATOR_FACE_FRAMES.operator;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image,
        frame.x * image.naturalWidth, frame.y * image.naturalHeight,
        frame.w * image.naturalWidth, frame.h * image.naturalHeight,
        0, 0, canvas.width, canvas.height);
      texture.needsUpdate = true;
    };
    image.src = (OPERATOR_INFO[kind] || OPERATOR_INFO.operator).portrait;
    return texture;
  }

  // CHARACTER GRAPHICS: tiny deterministic fabric maps add soft tactical camo without
  // heavy downloads or high-resolution texture memory; palette and scale are editable here.
  function tacticalFabricMaterial(kind) {
    if (tacticalFabricMaterials.has(kind)) return tacticalFabricMaterials.get(kind);
    const palettes = {
      operator: ['#514b3b', '#766449', '#343b31', '#95805b'],
      bubba: ['#51432f', '#80633e', '#39382c', '#9b7b4d'],
      lilbit: ['#695637', '#96794b', '#3f4534', '#b0945f'],
      gideon: ['#3e4c4b', '#5a6860', '#303f3c', '#827b61']
    };
    let seed = Array.from(kind).reduce((sum, char) => sum + char.charCodeAt(0), 17);
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const colors = palettes[kind] || palettes.operator;
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 58; i++) {
      ctx.save();
      ctx.translate(random() * 96, random() * 96);
      ctx.rotate(random() * Math.PI);
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.beginPath();
      ctx.ellipse(0, 0, 3 + random() * 8, 2 + random() * 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    texture.anisotropy = 2;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .92, metalness: .04 });
    tacticalFabricMaterials.set(kind, material);
    return material;
  }

  // CHARACTER GRAPHICS: one shared radial canvas makes the light fog edge intentional
  // while keeping the halo soft, small, and cheap to draw behind each deployed operator.
  function addOperatorEdgeGlow(view, kind) {
    if (!operatorGlowTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const glow = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      glow.addColorStop(0, 'rgba(70, 215, 255, .20)');
      glow.addColorStop(.55, 'rgba(45, 170, 220, .10)');
      glow.addColorStop(1, 'rgba(30, 130, 190, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 128, 128);
      operatorGlowTexture = new THREE.CanvasTexture(canvas);
      operatorGlowTexture.colorSpace = THREE.SRGBColorSpace;
    }
    const tint = kind === 'lilbit' || kind === 'bubba' ? 0xe5b25e : 0x69ddff;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: operatorGlowTexture, color: tint, transparent: true, opacity: .46,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.position.set(0, 1.18, -.48);
    halo.scale.set(1.12, 2.48, 1);
    halo.renderOrder = -1;
    view.add(halo);
  }

  // Weapon values are tuned for the MVP. Ammo is tracked per squad member so swapping operators does not reset a magazine.
  const WEAPONS = [
    { id: 'pistol', name: 'LASER', short: 'LASER', hint: '2 DAMAGE PER HIT · FAST', damage: 2, rate: .28, range: 20, color: 0x63e8ff, ammoKey: null, icon: '⌁' },
    { id: 'spread', name: 'SPREAD SHOT', short: 'SPREAD', hint: '4 DAMAGE PER HIT · WIDE BURST', damage: 4, rate: .58, range: 14, color: 0xffc45e, ammoKey: 'spread', clip: 8, reserve: 48, icon: '╱╲' },
    { id: 'launcher', name: 'ROCKET LAUNCHER', short: 'ROCKET', hint: '8 DAMAGE PER HIT · SPLASH', damage: 8, rate: .9, range: 22, color: 0xff8d45, ammoKey: 'launcher', clip: 4, reserve: 24, splash: 4.3, icon: '⬡' }
  ];

  const TEAM_DEFS = [
    { id: 'operator', type: 'operator', name: 'JJ', x: -15.5, z: 13.5, hp: PLAYER_HP, speed: 5.25, color: 0x9e8766, role: 'leader' },
    { id: 'bubba', type: 'bubba', name: 'BUBBA', x: -13.2, z: 15.6, hp: PLAYER_HP, speed: 4.1, color: 0xab7d4b, role: 'assault' },
    { id: 'lilbit', type: 'lilbit', name: 'LIL BIT', x: -17.7, z: 15.8, hp: PLAYER_HP, speed: 5.9, color: 0xd3b176, role: 'highground' },
    { id: 'gideon', type: 'gideon', name: 'GIDEON', x: -11.2, z: 14.3, hp: PLAYER_HP, speed: 4.7, color: 0x7899a5, role: 'support' }
  ];

  // Distinct original enemy roles share combat rules but carry different silhouettes, armor,
  // helmet treatments and weapon outlines in both renderers.
  const ENEMY_DEFS = [
    { id: 'red-01', type: 'soldier', variant: 'raider', x: -9.5, z: 6.2, hp: ENEMY_HP, speed: 2.3 },
    { id: 'red-02', type: 'soldier', variant: 'recon', x: -3.0, z: 1.8, hp: ENEMY_HP, speed: 2.4 },
    { id: 'red-03', type: 'soldier', variant: 'breacher', x: 4.7, z: 0.3, hp: ENEMY_HP, speed: 2.35 },
    { id: 'red-04', type: 'soldier', variant: 'heavy', x: 12.0, z: -3.2, hp: ENEMY_HP, speed: 2.35 },
    { id: 'red-05', type: 'soldier', variant: 'marksman', x: 8.6, z: -10.0, hp: ENEMY_HP, speed: 2.35 },
    { id: 'drone-01', type: 'drone', variant: 'sentinel', x: -1.7, z: -7.3, hp: ENEMY_HP, speed: 2.6 },
    { id: 'drone-02', type: 'drone', variant: 'sentinel', x: 10.0, z: 2.6, hp: ENEMY_HP, speed: 2.6 },
    { id: 'mech-01', type: 'mech', variant: 'siege', boss: true, name: 'ARMORED MECH', x: 14.3, z: -7.9, hp: BOSS_HP, speed: 1.35 }
  ];

  // SIX-MISSION CAMPAIGN: these are separate operations linked by the active exit gate.
  // Edit titles, briefings, and gate locations here without changing the Home screen layout.
  const MISSION_CAMPAIGN = [
    { code:'01', title:'VEHICLE BAY BREACH', brief:'Clear the vehicle bay and recover the access route.', exit:{x:20.3,z:-10.7,yaw:-Math.PI/2,name:'EAST TRANSFER GATE'}, reinforcements:[] },
    { code:'02', title:'RECLAIM THE CATWALKS', brief:'Push through the upper relay and reopen the service exit.', exit:{x:1.2,z:17.1,yaw:Math.PI,name:'SOUTH SERVICE GATE'}, reinforcements:[{id:'reinforce-02',type:'soldier',variant:'breacher',x:2,z:5.4,hp:64,speed:2.45}] },
    { code:'03', title:'WEST SERVER VAULT', brief:'Break the west-side defense and restore the vault link.', exit:{x:-20.3,z:2.8,yaw:Math.PI/2,name:'WEST VAULT GATE'}, reinforcements:[{id:'reinforce-03',type:'drone',variant:'sentinel',x:-4,z:-4.5,hp:48,speed:2.7},{id:'reinforce-03b',type:'soldier',variant:'marksman',x:6,z:5.8,hp:64,speed:2.4}] },
    { code:'04', title:'DRONE RELAY SHUTDOWN', brief:'Disable the relay defenders and secure the north passage.', exit:{x:1.5,z:-17.1,yaw:0,name:'NORTH CONTROL GATE'}, reinforcements:[{id:'reinforce-04',type:'soldier',variant:'heavy',x:5.5,z:4.5,hp:68,speed:2.3},{id:'reinforce-04b',type:'drone',variant:'sentinel',x:-5.5,z:-5.4,hp:50,speed:2.7}] },
    { code:'05', title:'CYBER TOWER SIEGE', brief:'Clear the east command lane and open vehicle extraction.', exit:{x:20.3,z:8.6,yaw:-Math.PI/2,name:'VEHICLE BAY GATE'}, reinforcements:[{id:'reinforce-05',type:'soldier',variant:'breacher',x:7,z:4.8,hp:68,speed:2.4},{id:'reinforce-05b',type:'drone',variant:'sentinel',x:-5,z:-5.5,hp:52,speed:2.7},{id:'reinforce-05c',type:'soldier',variant:'recon',x:-3,z:4.5,hp:66,speed:2.5}] },
    { code:'06', title:'NETWORK CORE EXTRACTION', brief:'Restore the core and reach the final extraction gate.', exit:{x:-20.3,z:-8.4,yaw:Math.PI/2,name:'FINAL EXTRACTION GATE'}, reinforcements:[{id:'reinforce-06',type:'mech',variant:'siege',name:'ARMORED MECH',x:-2,z:-4.8,hp:280,speed:1.4},{id:'reinforce-06b',type:'drone',variant:'sentinel',x:5,z:-5.5,hp:52,speed:2.7},{id:'reinforce-06c',type:'soldier',variant:'heavy',x:7,z:4.7,hp:70,speed:2.35}] }
  ];
  let missionIndex = 0, campaignScore = 0, campaignKills = 0;

  // INDUSTRIAL FLOOR PALETTE: grey square deck plates, tan walk routes, and colored cargo cubes.
  const WALKWAY_PATHS = [
    {points:[[-19,14],[-11,14],[-5,8],[0,2],[8,-7],[14,-13],[18,-15]],width:3.1},
    {points:[[-20,2],[-10,2],[0,2],[10,2],[20,2]],width:2.5},
    {points:[[1,17],[1,9],[0,2],[1,-7],[1,-17]],width:2.5},
    {points:[[-18,-12],[-10,-12],[-2,-12],[6,-12],[14,-12]],width:2.35}
  ];
  const CRATE_PALETTE = [0x315fba, 0xb5414a, 0xc8c9c3];
  const CRATE_LAYOUT = [
    [-9.2,10.0,2.2],[-3.8,7.2,2.0],[3.1,7.4,2.25],[8.5,7.1,2.15],
    [12.6,2.2,2.35],[17.5,1.6,2.05],[-8.6,-2.6,1.9],[.8,-3.2,2.0],
    [7.7,-12.0,1.9],[19.7,-4.6,2.3],[-18.0,-11.2,2.15],[3.8,14.4,2.0]
  ].map(([x,z,size],i)=>({x,z,w:size,h:size,d:size,color:CRATE_PALETTE[i%CRATE_PALETTE.length],label:['BLUE','RED','WHITE'][i%3]}));

  const game = {
    selected: 'operator', actors: [], enemies: [], shots: [],
    score: 0, kills: 0, hitCount: 0, lastFire: 0, time: 0,
    keys: new Set(), playerActor: null, started: false, won: false,
    vehicle: { x: -15, z: 9.6, angle: .32, speed: 0, driverId: null, lastShot: -1, firingUntil: 0 },
    terminal: { x: 13.3, z: -12.4, y: 0 }, core: { x: 18.4, z: -15.6, y: 0 },
    exit: { ...MISSION_CAMPAIGN[0].exit }, coreRestored: false,
    lostTech: { x: -15.6, z: 1.5, taken: false }, g4: { x: 13.0, z: -3.8 }
  };

  // ---------- Shared actor and weapon state ----------
  function freshActor(def, isEnemy = false) {
    const actor = {
      ...def, isEnemy, y: def.type === 'drone' ? 2.4 : 0, vy: 0, vx: 0, vz: 0,
      maxHp: def.hp, alive: true, down: false, dirX: 0, dirZ: -1,
      speed: def.speed || 4.5, attackClock: rand(.2, 1.2), lastShot: -1, lastShotByWeapon: Object.create(null), flash: 0,
      climbLadder: null, climbing: false, empUntil: 0, repairClock: 0, reviveProgress: 0,
      strafeSign: Math.random() < .5 ? -1 : 1, nextStrafeAt: rand(0, 2), coverUntil: 0,
      // Combat state drives enemy telegraphs and the animated world-only character rigs.
      combatState: 'idle', aimUntil: 0, aimTargetId: null, hitReactUntil: 0, nextAimFx: 0,
      anim: rand(0, 6), role: def.role || 'enemy', view: null, mesh: null,
      spreadAmmo: 8, spreadReserve: 48, launcherAmmo: 4, launcherReserve: 24, isControlled: false, inVehicle: false
    };
    return actor;
  }
  const teamById = (id) => actors.find(a => a.id === id);
  const livingTeam = () => actors.filter(a => a.alive && !a.down);
  const livingEnemies = () => enemies.filter(e => e.alive && !e.down);
  const controlled = () => teamById(game.selected) || teamById('operator');
  function near(a, b, radius) { return dist2(a, b) <= radius; }
  function getWeapon(actor) {
    const base = WEAPONS[currentWeapon];
    if (!actor) return base;
    if (base.ammoKey === 'spread') return { ...base, ammo: actor.spreadAmmo, reserve: actor.spreadReserve };
    if (base.ammoKey === 'launcher') return { ...base, ammo: actor.launcherAmmo, reserve: actor.launcherReserve };
    return { ...base, ammo: Infinity, reserve: Infinity };
  }
  function consumeAmmo(actor, weapon) {
    if (!weapon.ammoKey) return true;
    const clipKey = weapon.ammoKey === 'spread' ? 'spreadAmmo' : 'launcherAmmo';
    const reserveKey = weapon.ammoKey === 'spread' ? 'spreadReserve' : 'launcherReserve';
    if (actor[clipKey] <= 0) {
      if (actor[reserveKey] > 0) {
        const cap = weapon.clip, load = Math.min(cap, actor[reserveKey]);
        actor[clipKey] = load; actor[reserveKey] -= load; showToast(`${weapon.name} RELOADED`); return false;
      }
      showToast('AMMO DEPLETED · SWITCH WEAPON'); return false;
    }
    actor[clipKey]--;
    return true;
  }

  // ---------- Three.js render scene and original placeholder geometry ----------
  const matCache = new Map();
  function mat(color, roughness = .72, metalness = .2, emissive = 0x000000, emissiveIntensity = 0) {
    const key = `${color}-${roughness}-${metalness}-${emissive}-${emissiveIntensity}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }));
    return matCache.get(key);
  }
  function boxMesh(w, h, d, material, x = 0, y = 0, z = 0, cast = true, receive = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
  function addWorldBox(x, y, z, w, h, d, color, emissive = 0x000000, intensity = 0, metal = .25, rough = .65) {
    const mesh = boxMesh(w, h, d, mat(color, rough, metal, emissive, intensity), x, y, z);
    scene3D.add(mesh); staticMeshes.push(mesh); return mesh;
  }
  function addPointLight(color, intensity, distance, x, y, z) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z); light.castShadow = false; scene3D.add(light); staticMeshes.push(light); return light;
  }
  function addRing(x, y, z, radius, color, thickness = .045, group = scene3D) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 56), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .88 }));
    mesh.rotation.x = Math.PI / 2; mesh.position.set(x, y, z); group.add(mesh); return mesh;
  }
  function addTextPanel(text, subtitle, color = '#35dfff', bg = '#061725') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320;
    const c = canvas.getContext('2d');
    const grad = c.createLinearGradient(0, 0, 1024, 320); grad.addColorStop(0, bg); grad.addColorStop(1, '#0a2031');
    c.fillStyle = grad; c.fillRect(0, 0, 1024, 320);
    c.strokeStyle = color; c.lineWidth = 8; c.strokeRect(8, 8, 1008, 304);
    c.fillStyle = color; c.font = '900 92px Segoe UI, Arial'; c.textAlign = 'center'; c.fillText(text, 512, 145);
    c.fillStyle = '#eafaff'; c.font = '700 32px Segoe UI, Arial'; c.fillText(subtitle, 512, 215);
    c.fillStyle = '#6b94a7'; c.font = '700 18px Segoe UI, Arial'; c.fillText('PROTECTING DATA. EMPOWERING VETERANS.', 512, 270);
    return new THREE.CanvasTexture(canvas);
  }
  function addFacilitySign() {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.65), new THREE.MeshBasicMaterial({ map: addTextPanel('1VETTECH', 'CYBER TOWER'), side: THREE.DoubleSide }));
    plane.position.set(-.6, 5.25, -20.15); scene3D.add(plane); staticMeshes.push(plane);
    addWorldBox(-.6, 3.9, -20.08, 9.2, .11, .13, 0x0b7eac, 0x0ba6ff, 1.8);
  }
  function createCityBackdrop() {
    // City towers and window strips are original geometric placeholders outside the rear windows.
    for (let i = 0; i < 17; i++) {
      const x = -23 + i * 2.85 + rand(-.45, .45), h = rand(5, 18), w = rand(1.4, 2.7), d = rand(1.2, 2.5);
      addWorldBox(x, h / 2 + .2, -28.8 - rand(0, 3), w, h, d, i % 3 === 0 ? 0x102c49 : 0x091a2d, 0x07213d, .3, .45, .6);
      for (let j = 0; j < Math.floor(h / 1.4); j++) {
        addWorldBox(x - w * .22, 1 + j * 1.35, -27.48, .08, .38, .06, 0x1684b9, 0x087dff, 1.2, .05, .3);
        if (i % 2 === 0) addWorldBox(x + w * .18, 1.1 + j * 1.35, -27.48, .07, .35, .06, 0xe6a34e, 0x8a3c12, .45, .05, .3);
      }
    }
    addWorldBox(0, 9.8, -31, 50, .15, .15, 0x0e688b, 0x075b9d, .7);
  }
  function createLadderMesh(ladder) {
    const railMat = mat(0x778a96, .42, .72, 0x123344, .15);
    const rungMat = mat(0x21c9f2, .42, .5, 0x0c78a0, .65);
    const group = new THREE.Group();
    group.position.set(ladder.x, ladder.bottom, ladder.z);
    for (const dx of [-.42, .42]) group.add(boxMesh(.08, ladder.top - ladder.bottom + .15, .1, railMat, dx, (ladder.top - ladder.bottom) / 2, 0));
    for (let y = .22; y < ladder.top - ladder.bottom; y += .34) group.add(boxMesh(.86, .065, .1, rungMat, 0, y, .01));
    scene3D.add(group); ladder.mesh = group;
  }
  function createPlatform(p) {
    const metal = mat(0x233847, .55, .65, 0x061c2e, .2);
    const deck = boxMesh(p.w, .36, p.d, metal, p.x, p.topY - .18, p.z);
    scene3D.add(deck); p.mesh = deck;
    // Bright hazard strip around the leading lip makes the platform edges readable.
    const edgeZ = p.z + p.d / 2 - .09;
    addWorldBox(p.x, p.topY + .008, edgeZ, p.w, .035, .18, 0xd1a23a, 0x5a3600, .15, .25, .55);
    for (let x = p.x - p.w / 2 + .35; x < p.x + p.w / 2; x += .75) {
      const stripe = boxMesh(.24, .018, .19, mat(0x07121a, .62, .2), x, p.topY + .032, edgeZ, false, false); scene3D.add(stripe);
    }
    // Catwalk supports and rails.
    for (const sx of [p.x - p.w / 2 + .3, p.x + p.w / 2 - .3]) {
      addWorldBox(sx, p.topY / 2, p.z, .17, p.topY, .17, 0x253b47, 0x06121b, .08, .65, .6);
      for (const sz of [p.z - p.d / 2 + .12, p.z + p.d / 2 - .12]) addWorldBox(sx, p.topY + .45, sz, .08, .8, .08, 0x607887, 0x0a2939, .1, .7, .45);
    }
    for (const sz of [p.z - p.d / 2 + .12, p.z + p.d / 2 - .12]) addWorldBox(p.x, p.topY + .83, sz, p.w, .075, .075, 0x627b86, 0x0b3346, .18, .7, .45);
  }
  function createCoverCrate(o) {
    const group = new THREE.Group();
    group.position.set(o.x, o.h / 2, o.z); o.mesh = group;
    const color = o.color || 0x253b49;
    const steel = mat(0x363d40,.56,.55), dark = mat(0x202628,.78,.24), mark = mat(0xd6c8a6,.64,.14);
    group.add(boxMesh(o.w, o.h, o.d, mat(color, .83, .18)));
    // Square cargo cases have visible lid seams, corner guards, and a small tan ID plate.
    group.add(boxMesh(o.w + .035, .09, o.d + .035, steel, 0, o.h / 2 - .07, 0));
    group.add(boxMesh(o.w * .76, .035, o.d * .76, mat(color,.72,.14), 0, o.h / 2 - .005, 0));
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      group.add(boxMesh(.105,o.h*.9,.105,steel,sx*(o.w/2-.09),0,sz*(o.d/2-.09)));
    }
    group.add(boxMesh(o.w*.38,.18,.045,mark,0,.05,o.d/2+.025));
    group.add(boxMesh(o.w*.72,.045,.045,dark,0,-o.h*.24,o.d/2+.025));
    scene3D.add(group);
    coverObjects.push(o);
  }
  // TAN WALKWAYS: low, segmented plates over the grey deck create clear routes through each mission.
  function createTanWalkways() {
    const tan = mat(0xb9a77f,.9,.08), seam = mat(0x4b4941,.85,.08);
    for (const route of WALKWAY_PATHS) for (let i=1;i<route.points.length;i++) {
      const [ax,az]=route.points[i-1],[bx,bz]=route.points[i],dx=bx-ax,dz=bz-az;
      const length=Math.hypot(dx,dz),yaw=-Math.atan2(dz,dx),cx=(ax+bx)/2,cz=(az+bz)/2;
      const slab=boxMesh(length,.04,route.width,tan,cx,.006,cz,false,true);slab.rotation.y=yaw;scene3D.add(slab);staticMeshes.push(slab);
      for(let at=1.7;at<length-0.4;at+=2.1){
        const seamMesh=boxMesh(.055,.014,route.width*.96,seam,ax+(dx/length)*at,.031,az+(dz/length)*at,false,false);
        seamMesh.rotation.y=yaw;scene3D.add(seamMesh);staticMeshes.push(seamMesh);
      }
    }
  }
  // MISSION EXIT DOOR: the sliding panels stay red until the Network Core is restored.
  function createExitDoor() {
    const gate = new THREE.Group(), frame = mat(0x737b79,.56,.55), panel = mat(0x384448,.7,.35), stripe = mat(0x811e2a,.42,.25,0xff283e,.65);
    gate.add(boxMesh(.28,4.35,.34,frame,-1.67,2.17,0)); gate.add(boxMesh(.28,4.35,.34,frame,1.67,2.17,0));
    gate.add(boxMesh(3.62,.28,.34,frame,0,4.2,0));
    const left=boxMesh(1.48,3.78,.18,panel,-.76,1.91,0),right=boxMesh(1.48,3.78,.18,panel,.76,1.91,0);
    gate.add(left);gate.add(right);
    for(const x of [-.76,.76]){
      gate.add(boxMesh(1.18,.12,.035,stripe,x,3.16,.115));
      gate.add(boxMesh(.16,2.75,.035,mat(0x838a83,.8,.12),x,1.8,.115));
    }
    const signal=boxMesh(.24,.22,.08,mat(0xff4658,.35,.2,0xff152c,1.3),0,4.2,.16);gate.add(signal);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.2,.74),new THREE.MeshBasicMaterial({map:addTextPanel('EXIT GATE','MISSION TRANSFER','#ffca66','#1b2021'),side:THREE.DoubleSide}));
    sign.position.set(0,4.82,.22);gate.add(sign);
    gate.userData={left,right,signal};scene3D.add(gate);staticMeshes.push(gate);objectiveMeshes.exit=gate;
    updateMissionStageScene();
  }
  function createBuggyProp() {
    const g = new THREE.Group(); g.position.set(game.vehicle.x, 0, game.vehicle.z); g.rotation.y = game.vehicle.angle;
    const frame = mat(0x62563e, .48, .7, 0x101b1e, .2), rubber = mat(0x0b1116, .9, .05), glow = mat(0x53e5ff, .3, .2, 0x17a9ff, 1.3);
    g.add(boxMesh(3.5, .6, 1.75, frame, 0, .78, 0)); g.add(boxMesh(2.1, .64, 1.25, mat(0x172934, .4, .55), -.15, 1.23, -.12));
    g.add(boxMesh(1.9, .16, .5, mat(0x253d4b, .42, .6), .42, 1.64, -.3));
    buggyWheelMeshes=[];
    for (const x of [-1.15, 1.15]) for (const z of [-.83, .83]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.48, .48, .28, 16), rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .47, z); wheel.castShadow = true; g.add(wheel); buggyWheelMeshes.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .29, 12), mat(0x697d87, .34, .78)); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); g.add(hub);
    }
    g.add(boxMesh(1.05, .14, .25, frame, .25, 1.9, -.25));
    g.add(boxMesh(1.1, .22, .22, frame, 1.08, 1.91, -.25));
    buggyMuzzleFlash=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),new THREE.MeshBasicMaterial({color:0xffe6a0,transparent:true,opacity:.95}));buggyMuzzleFlash.position.set(1.73,1.91,-.25);buggyMuzzleFlash.visible=false;g.add(buggyMuzzleFlash);
    g.add(boxMesh(.16, .17, .16, glow, .25, 2.06, -.25));
    for (const z of [-.65,.65]) g.add(boxMesh(.24, .15, .12, glow, 1.73, .95, z));
    scene3D.add(g); buggyMesh=g;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.1,.45), new THREE.MeshBasicMaterial({map:addTextPanel('VEHICLE BAY','ARMORED SUPPORT TANK'),transparent:false,side:THREE.DoubleSide}));
    label.scale.set(.43,.43,1); label.position.set(-15,2.6,7.55); scene3D.add(label); staticMeshes.push(label);
  }
  function makeScene() {
    // CHARACTER GRAPHICS: edit fog distances here for the soft atmospheric edge in the 3D world.
    scene3D = new THREE.Scene(); scene3D.background = new THREE.Color(0x061321); scene3D.fog = new THREE.Fog(0x061321, 31, 65);
    camera3D = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, .1, 140);
    // CHARACTER GRAPHICS: capped resolution and low-power hint keep the detailed models light to render.
    renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer3D.setSize(innerWidth, innerHeight);
    renderer3D.shadowMap.enabled = true; renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer3D.outputColorSpace = THREE.SRGBColorSpace;
    renderer3D.toneMapping = THREE.ACESFilmicToneMapping; renderer3D.toneMappingExposure = 1.08;
    $('renderHost').appendChild(renderer3D.domElement); mainCanvas = renderer3D.domElement;

    scene3D.add(new THREE.HemisphereLight(0xa8e6ff, 0x111b25, 1.35));
    const keyLight = new THREE.DirectionalLight(0xffd6a2, 2.1); keyLight.position.set(-11, 20, 9); keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024); keyLight.shadow.camera.left = -30; keyLight.shadow.camera.right = 30; keyLight.shadow.camera.top = 28; keyLight.shadow.camera.bottom = -28; keyLight.shadow.bias = -.00025; scene3D.add(keyLight);
    addPointLight(0x16bdff, 2.5, 20, -12, 4.5, -6); addPointLight(0x1ccfff, 2.0, 18, 0, 4.2, -12); addPointLight(0xff365c, 2.2, 17, 13, 3.3, 1); addPointLight(0xffad4b, 1.15, 12, -14, 2.7, 10);

    const fieldTexture = new THREE.TextureLoader().load(FIELD_ART_URL);
    fieldTexture.colorSpace = THREE.SRGBColorSpace;
    const fieldBackdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(58, 31.7),
      new THREE.MeshBasicMaterial({ map: fieldTexture, side: THREE.DoubleSide, fog: false })
    );
    fieldBackdrop.position.set(0, 13.8, -34);
    fieldBackdrop.renderOrder = -1;
    scene3D.add(fieldBackdrop);
    staticMeshes.push(fieldBackdrop);

    // INDUSTRIAL FLOOR PALETTE: neutral steel grey keeps the HUD colors and character art untouched.
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x777b79, roughness: .88, metalness: .2 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(46, .55, 42), floorMat); floor.position.set(0, -.29, 0); floor.receiveShadow = true; scene3D.add(floor); staticMeshes.push(floor);
    // Subtle floor grid and route lines help orient movement without hiding the industrial deck.
    const gridMat = new THREE.LineBasicMaterial({ color: 0x303636, transparent: true, opacity: .82 });
    const gridPoints = [];
    for (let x = -22; x <= 22; x += 2) { gridPoints.push(new THREE.Vector3(x, .005, -20), new THREE.Vector3(x, .005, 20)); }
    for (let z = -20; z <= 20; z += 2) { gridPoints.push(new THREE.Vector3(-22, .005, z), new THREE.Vector3(22, .005, z)); }
    const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPoints); const grid = new THREE.LineSegments(gridGeo, gridMat); scene3D.add(grid); staticMeshes.push(grid);
    createTanWalkways();
    createCityBackdrop();
    // Facility boundaries, pipes, beams, and windows.
    addWorldBox(-23, 4.3, 0, .9, 8.8, 42, 0x132a3a, 0x061d2d, .25, .7);
    addWorldBox(23, 4.3, 0, .9, 8.8, 42, 0x132a3a, 0x061d2d, .25, .7);
    for (const x of [-20,-16,-12,-8,-4,0,4,8,12,16,20]) addWorldBox(x, 8.2, -20.2, .17, .17, 41, 0x344957, 0x071a2b, .15, .75);
    for (const z of [-17,-13,-5,3,11,17]) addWorldBox(0, 8.2, z, 46, .18, .18, 0x304653, 0x081927, .12, .7);
    // Upper catwalk spine and lower cross-platforms.
    platforms = [
      { id: 'catwalk-west', x: -13.0, z: -8.1, w: 10.5, d: 3.15, topY: 3.15 },
      { id: 'catwalk-center', x: -1.0, z: -8.1, w: 12.5, d: 3.15, topY: 3.15 },
      { id: 'catwalk-east', x: 11.9, z: -8.1, w: 12.0, d: 3.15, topY: 3.15 },
      { id: 'side-west', x: -15.4, z: 1.2, w: 7.2, d: 3.6, topY: 1.8 },
      { id: 'side-center', x: 2.8, z: 2.1, w: 7.6, d: 3.4, topY: 2.0 },
      { id: 'core-dais', x: 17.0, z: -14.7, w: 9.0, d: 5.8, topY: 1.45 }
    ];
    platforms.forEach(createPlatform);
    ladders = [
      { id:'ladder-west', x:-13.0, z:-7.4, bottom:0, top:3.15 },
      { id:'ladder-east', x:10.0, z:-7.4, bottom:0, top:3.15 },
      { id:'ladder-core', x:16.1, z:-12.7, bottom:0, top:1.45 }
    ];
    ladders.forEach(createLadderMesh);
    // Railings are intentionally low enough to read as traversable catwalks in the isometric camera.
    for (const p of platforms.slice(0,3)) {
      for (const edgeZ of [p.z - p.d / 2, p.z + p.d / 2]) {
        addWorldBox(p.x, p.topY + .42, edgeZ, p.w, .66, .07, 0x253d4a, 0x092435, .1, .7, .5);
        for (let x = p.x-p.w/2+.4; x < p.x+p.w/2; x += 1.8) addWorldBox(x, p.topY+.42, edgeZ, .09, .75, .09, 0x75939e, 0x0a4056, .1, .7, .48);
      }
    }
    coverObjects = [];
    CRATE_LAYOUT.forEach(o => createCoverCrate({...o}));
    createBuggyProp(); addFacilitySign();

    // Low-profile red lane strips show active hostile sectors without obscuring navigation.
    for (const [sx,sz,sw] of [[-7.1,4.7,2.3],[1.1,.1,2.6],[10.9,-2.4,2.4],[9.2,-9.1,2.8]]) {
      addWorldBox(sx,.035,sz,sw,.035,.12,0x7e1b2c,0xff2e50,1.15,.35,.42);
      addWorldBox(sx,.055,sz+.22,sw*.7,.018,.045,0x261722,0x5c1727,.4,.2,.5);
    }

    // Red high-voltage danger panel / hazard area.
    addWorldBox(20.95, 2.4, 2.3, .15, 4.9, 5.7, 0x30151d, 0x650a20, .5, .5, .65);
    addWorldBox(20.84, 2.35, 2.3, .12, 4.4, 5.0, 0x5a1523, 0xff133e, 1.7, .4, .5);
    addWorldBox(20.73, 2.3, 2.3, .13, .09, 4.5, 0xff334e, 0xff1538, 2.2, .2, .4);
    for (let z = 5.2; z <= 7.8; z += .65) addWorldBox(18.2, .04, z, 5.4, .03, .12, 0xd8a83f, 0x5b3900, .3, .3, .5);
    const dangerText = new THREE.Mesh(new THREE.PlaneGeometry(2.7,.75), new THREE.MeshBasicMaterial({map:addTextPanel('DANGER','HIGH VOLTAGE','#ff4b69','#260710'),side:THREE.DoubleSide}));
    dangerText.scale.set(.6,.6,1); dangerText.position.set(20.55,3.9,2.3); dangerText.rotation.y = -Math.PI/2; scene3D.add(dangerText); staticMeshes.push(dangerText);

    // Access terminal and Network Core are objective markers with readable glow rings.
    const termGroup = new THREE.Group(); termGroup.position.set(game.terminal.x, 0, game.terminal.z);
    termGroup.add(boxMesh(1.0, 1.6, .65, mat(0x183849,.35,.6,0x0a74a5,.4),0,.8,0));
    termGroup.add(boxMesh(.72,.88,.1,mat(0x092a3a,.2,.2,0x09bafa,1.8),0,1.04,.36));
    termGroup.add(boxMesh(.5,.07,.05,mat(0x80f6ff,.2,.2,0x22deff,2.0),0,1.23,.43));
    scene3D.add(termGroup); objectiveMeshes.terminal = termGroup;
    objectiveMeshes.termRing = addRing(game.terminal.x,.04,game.terminal.z,1.35,0x20dfff,.055);
    const core = new THREE.Group(); core.position.set(game.core.x,0,game.core.z);
    core.add(boxMesh(2.6,.7,2.2,mat(0x102d41,.42,.7,0x075c87,.8),0,.4,0));
    core.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.05,1),mat(0x2ad6ff,.2,.3,0x00b8ff,2.2))); core.children[1].position.y=1.85;
    core.add(new THREE.Mesh(new THREE.TorusGeometry(1.45,.065,10,56),new THREE.MeshBasicMaterial({color:0x5deaff,transparent:true,opacity:.9}))); core.children[2].position.y=1.7; core.children[2].rotation.x=Math.PI/2;
    scene3D.add(core); objectiveMeshes.core = core; objectiveMeshes.coreRing = addRing(game.core.x,.05,game.core.z,2.2,0x47e6ff,.07);
    // Sector and lost-tech markers.
    objectiveMeshes.g4 = addRing(game.g4.x,.04,game.g4.z,1.35,0xf5bd4a,.055);
    const lost = new THREE.Group(); lost.position.set(game.lostTech.x, .5, game.lostTech.z);
    const lostShard = new THREE.Mesh(new THREE.OctahedronGeometry(.42,0),mat(0xa977ff,.22,.4,0x8c40ff,2)); lost.add(lostShard);
    lost.add(new THREE.Mesh(new THREE.TorusGeometry(.62,.035,8,32),new THREE.MeshBasicMaterial({color:0xc1a2ff}))); lost.children[1].rotation.x=Math.PI/2;
    scene3D.add(lost); objectiveMeshes.lostTech = lost;
    createExitDoor();

    // Ceiling cable bundles add density but stay clear of movement routes.
    for (let i=0;i<9;i++) {
      const x=-17+i*4.1;
      const cable = new THREE.Mesh(new THREE.TorusGeometry(1.3,.045,6,24,Math.PI),mat(i%2?0x168eb4:0x253b48,.5,.55,0x04344b,.3));
      cable.rotation.z=Math.PI/2; cable.position.set(x,7.1,-4.7); cable.scale.set(1,.7,1); scene3D.add(cable); staticMeshes.push(cable);
    }
    addPointLight(0x5deaff, .75, 11, 16, 2.8, -14); addPointLight(0xffb24f, .5, 8, -15, 1.9, 3);
    can3D = true;
  }

  function buildHumanoid(kind, isEnemy = false, variant = 'raider') {
    const group = new THREE.Group();
    const friendly = !isEnemy;
    const info = OPERATOR_INFO[kind] || OPERATOR_INFO.operator;
    let primary = info.color || 0x9e8766, armorColor = 0x273947, dark = 0x101923, glow = friendly ? 0x24dfff : 0xff3656;
    const enemyStyle = {
      raider:   { cloth: 0x792536, armor: 0x252832, accent: 0xff405d },
      recon:    { cloth: 0x3e505b, armor: 0x1d2a34, accent: 0xbaff55 },
      breacher: { cloth: 0x69232f, armor: 0x302630, accent: 0xff794f },
      heavy:    { cloth: 0x67303a, armor: 0x3c3035, accent: 0xffc24d },
      marksman: { cloth: 0x3d4b61, armor: 0x1a2532, accent: 0x78e7ff }
    }[variant] || { cloth: 0x792536, armor: 0x252832, accent: 0xff405d };
    if (isEnemy) {
      primary = kind === 'mech' ? 0x57564e : kind === 'drone' ? 0x3a4b55 : enemyStyle.cloth;
      armorColor = kind === 'mech' ? 0x343d43 : kind === 'drone' ? 0x202f3b : enemyStyle.armor;
      glow = kind === 'mech' || kind === 'drone' ? 0x67ffab : enemyStyle.accent;
    }
    if (kind === 'bubba') { primary=0xa77c49; armorColor=0x4b3d2c; }
    if (kind === 'lilbit') { primary=0xc8a566; armorColor=0x65553e; }
    if (kind === 'gideon') { primary=0x6e8e9c; armorColor=0x2c3e4a; }
    const metal = mat(armorColor,.47,.62,0x091923,.08), cloth = mat(primary,.75,.15), bootMat=mat(dark,.85,.1), edge = mat(friendly?0x1bcdf2:0xff334f,.32,.35,friendly?0x096f91:0x710a25,.65), skin=mat(kind==='lilbit'?0x714b3b:kind==='bubba'?0x704c3a:0x875b42,.9,.05), visor=mat(isEnemy?0xff5268:0x152e3c,.25,.65,isEnemy?0xff1235:0x0a2331,.8);
    const add=(w,h,d,m,x,y,z)=>{const mesh=boxMesh(w,h,d,m,x,y,z);group.add(mesh);return mesh;};
    const sphere=(r,m,x,y,z,scale={x:1,y:1,z:1})=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m);mesh.position.set(x,y,z);mesh.scale.set(scale.x,scale.y,scale.z);mesh.castShadow=true;group.add(mesh);return mesh;};
    const cylinder=(rt,rb,h,m,x,y,z,rotationZ=0,rotationX=0)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,10),m);mesh.position.set(x,y,z);mesh.rotation.z=rotationZ;mesh.rotation.x=rotationX;mesh.castShadow=true;group.add(mesh);return mesh;};

    if (kind === 'drone') {
      // Sentinel drone: armored faceted hull, twin caged rotors, green optical sensor,
      // and a small downward search lamp. Rotor motion is driven in updateVisuals().
      const droneShell = mat(0x263844, .38, .78, 0x061a24, .22);
      const droneDark = mat(0x111d27, .48, .65, 0x06121b, .14);
      const droneEdge = mat(0x6c8790, .34, .7, 0x183a43, .2);
      const sensorMat = mat(0x59ff9e, .16, .22, 0x17ff76, 2.15);
      const sensorCore = mat(0xc8ffdf, .18, .12, 0x62ffac, 1.2);
      const hull = new THREE.Mesh(new THREE.OctahedronGeometry(.61, 1), droneShell);
      hull.scale.set(1.28, .73, 1.02); hull.castShadow = true; group.add(hull);
      add(.72, .16, .48, droneDark, 0, -.22, -.02);
      add(.48, .075, .5, droneEdge, 0, .28, -.025);
      // Forward eye pod and glint.
      sphere(.205, droneDark, 0, .035, .53, {x:1.18,y:.9,z:.58});
      const eye = sphere(.145, sensorMat, 0, .035, .635, {x:1.12,y:.9,z:.52});
      sphere(.052, sensorCore, -.035, .075, .692, {x:1,y:1,z:.45});
      // Reinforced outriggers.
      const rotors = [];
      for (const side of [-1, 1]) {
        add(.56, .12, .15, droneDark, side*.55, .03, -.02, side*.08);
        add(.1, .21, .12, droneEdge, side*.77, -.04, -.02, side*.1);
        const rotor = new THREE.Group(); rotor.position.set(side*.92, .11, -.05); group.add(rotor);
        const cage = new THREE.Mesh(new THREE.TorusGeometry(.31, .035, 7, 22), droneEdge);
        cage.rotation.x = Math.PI/2; rotor.add(cage);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.09,10), droneDark);
        hub.position.y = .015; rotor.add(hub);
        for (let blade=0; blade<3; blade++) {
          const angle = blade*Math.PI*2/3;
          const prop = boxMesh(.31,.025,.055, sensorMat, Math.cos(angle)*.12, .055, Math.sin(angle)*.12, false, false);
          prop.rotation.y = angle; rotor.add(prop);
        }
        rotors.push(rotor);
        sphere(.065, sensorMat, side*.75, -.12, .035, {x:1,y:1,z:1});
      }
      // Gimbal, range finder and green floor-scan cone.
      const gimbal = new THREE.Group(); gimbal.position.set(0,-.3,.12); group.add(gimbal);
      const cam = new THREE.Mesh(new THREE.SphereGeometry(.13,10,8), droneDark); gimbal.add(cam);
      const rangeEye = new THREE.Mesh(new THREE.SphereGeometry(.065,10,8), sensorMat); rangeEye.position.set(0,-.01,.1); gimbal.add(rangeEye);
      const search = new THREE.Mesh(new THREE.ConeGeometry(.2,.68,12,1), new THREE.MeshBasicMaterial({color:0x54ff9b,transparent:true,opacity:.12,depthWrite:false}));
      search.position.set(0,-.55,.1); search.rotation.x = Math.PI; group.add(search);
      const rotorGlow = new THREE.Mesh(new THREE.TorusGeometry(1.02,.028,5,32), new THREE.MeshBasicMaterial({color:0x55ffa0,transparent:true,opacity:.42}));
      rotorGlow.rotation.x = Math.PI/2; group.add(rotorGlow);
      const pulseEmitter = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), new THREE.MeshBasicMaterial({color:0xff4a62, transparent:true, opacity:.96}));
      pulseEmitter.position.set(0, .03, .76); pulseEmitter.visible = false; group.add(pulseEmitter);
      group.userData = { eye, rotors, legs:[], arms:[], animOffset: rand(0,8), searchLight:search, gimbal, muzzleFlash:pulseEmitter };
      return group;
    }
    if (kind === 'mech') {
      // Siege mech: broad armored torso, exposed hydraulic joints, chunky feet,
      // shoulder cannon and bright green optical core. All shapes are original geometry.
      const mechArmor = mat(0x38464d, .38, .78, 0x0b1a22, .24);
      const mechLight = mat(0x66736f, .42, .7, 0x172a2e, .16);
      const mechDark = mat(0x171f27, .48, .72, 0x081018, .12);
      const mechHazard = mat(0xe0ae43, .36, .58, 0x65400d, .2);
      const mechSensor = mat(0x68ffab, .16, .22, 0x23ff85, 2.4);
      const mechCore = mat(0xd6ffe5, .14, .12, 0x65ff9c, 1.7);
      add(1.72,1.18,1.08,mechArmor,0,2.22,0);
      add(1.36,.63,.18,mechLight,0,2.24,.565);
      add(1.04,.42,.11,mechDark,0,2.28,.68);
      // Chest reactor with framed hazard bars.
      add(.82,.6,.12,mechDark,0,2.19,.72);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(.26,1),mechSensor); core.position.set(0,2.21,.81); group.add(core);
      sphere(.095,mechCore,0,2.22,.96,{x:1,y:1,z:.45});
      add(.11,.45,.045,mechHazard,-.38,2.2,.78,-.32); add(.11,.45,.045,mechHazard,.38,2.2,.78,.32);
      // Compact sensor head, armored brow and green range-finding eye.
      add(.92,.42,.73,mechDark,0,3.03,.04);
      add(1.02,.14,.79,mechLight,0,3.22,.015);
      const eye = sphere(.205,mechSensor,0,3.02,.43,{x:1.22,y:.82,z:.55});
      sphere(.065,mechCore,0,3.035,.535,{x:1,y:1,z:.55});
      add(.3,.09,.1,mechHazard,0,2.83,.405);
      // Layered shoulders and articulated arms.
      const arms=[], legs=[];
      for (const side of [-1,1]) {
        add(.72,.43,.79,mechLight,side*.98,2.56,0,side*.06);
        add(.77,.12,.78,mechHazard,side*.98,2.73,.02,side*.06);
        const arm = new THREE.Group(); arm.position.set(side*1.02,2.35,.02); group.add(arm);
        arm.add(boxMesh(.48,.66,.52,mechArmor,side*.04,-.36,.015));
        const elbow = new THREE.Mesh(new THREE.CylinderGeometry(.18,.2,.22,10),mechDark); elbow.rotation.z=Math.PI/2; elbow.position.set(side*.08,-.73,.06);arm.add(elbow);
        arm.add(boxMesh(.42,.47,.48,mechLight,side*.1,-.99,.12));
        arm.add(boxMesh(.48,.16,.58,mechDark,side*.1,-1.28,.19));
        arms.push(arm);
        // Thick hips, hydraulic thigh, knee joint, shin and wide foot.
        const leg = new THREE.Group(); leg.position.set(side*.55,1.12,0); group.add(leg);
        leg.add(boxMesh(.47,.68,.49,mechArmor,side*.025,-.34,0));
        const knee = new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),mechDark); knee.position.set(side*.025,-.72,.04); leg.add(knee);
        leg.add(boxMesh(.42,.62,.46,mechLight,side*.025,-1.02,.015));
        leg.add(boxMesh(.58,.2,.72,mechDark,side*.025,-1.38,.12));
        leg.add(boxMesh(.29,.08,.5,mechHazard,side*.025,-1.27,.45));
        legs.push(leg);
      }
      // Shoulder-mounted cannon is clearly different from the soldiers' rifles.
      add(.34,.34,.48,mechDark,.99,2.32,.36);
      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(.19,.24,.84,12),mechDark);
      cannon.rotation.x=Math.PI/2; cannon.position.set(1.0,2.29,.72); cannon.castShadow=true;group.add(cannon);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(.19,.035,8,18),mechHazard);muzzle.rotation.x=Math.PI/2;muzzle.position.set(1.0,2.29,1.14);group.add(muzzle);
      add(.54,.11,.12,mechHazard,0,1.56,.56);
      // Rear cooling pack and vertical exhaust vents.
      add(1.02,.72,.32,mechDark,0,2.42,-.62);
      for(let i=-1;i<=1;i++) add(.1,.46,.06,mechHazard,i*.24,2.46,-.805);
      const flash = new THREE.Mesh(new THREE.SphereGeometry(.15,10,8),new THREE.MeshBasicMaterial({color:0xff8d49,transparent:true,opacity:.95}));
      flash.position.set(1.0,2.29,1.22);flash.visible=false;group.add(flash);
      group.userData = { legs, arms, eye, animOffset:rand(0,8), muzzleFlash:flash, cannonMuzzle:muzzle };
      return group;
    }
    // Low-poly tactical body with articulating limbs; assets remain original and non-gory.
    add(.66,.8,.4,cloth,0,1.25,0); add(.7,.52,.44,metal,0,1.3,.04); add(.12,.52,.08,edge,-.23,1.28,.27); add(.12,.52,.08,edge,.23,1.28,.27);
    add(.21,.26,.23,metal,-.43,1.55,0); add(.21,.26,.23,metal,.43,1.55,0);
    sphere(.26,skin,0,1.89,.02,{x:.9,y:1.1,z:.9});
    add(.5,.12,.46,kind==='lilbit'?cloth:metal,0,2.08,.02);
    if(kind==='lilbit'){
      add(.44,.10,.62,cloth,0,2.13,-.04); add(.44,.055,.22,cloth,0,2.05,.21);
      // Braided ponytail, headset, and cyan sleeve insignia echo the supplied operator art.
      cylinder(.09,.08,.68,skin,.19,1.86,-.34,.18,0); sphere(.075,skin,.24,1.56,-.36); sphere(.075,skin,.28,1.42,-.39);
      sphere(.09,edge,-.245,1.9,.04,{x:.45,y:1,z:.6});
    } else if(kind==='gideon') {
      add(.54,.22,.53,metal,0,2.13,0); add(.31,.14,.42,visor,0,1.98,.17); add(.09,.08,.08,edge,0,1.91,.37);
    } else if(isEnemy) {
      if (variant === 'recon') {
        add(.58,.23,.5,metal,0,2.1,.01); add(.4,.12,.24,visor,0,1.96,.22);
        add(.09,.18,.09,metal,0,2.24,-.02);
      } else if (variant === 'heavy') {
        add(.64,.26,.55,metal,0,2.1,.01); add(.43,.15,.27,visor,0,1.94,.22);
        add(.22,.12,.22,metal,-.28,2.02,0); add(.22,.12,.22,metal,.28,2.02,0);
      } else if (variant === 'marksman') {
        add(.54,.14,.48,metal,0,2.12,0); add(.4,.09,.25,visor,0,1.97,.22);
        add(.34,.11,.1,metal,0,2.2,-.02);
      } else {
        add(.56,.19,.46,metal,0,2.1,.01); add(.42,.18,.24,visor,0,1.94,.21);
      }
    } else if(kind==='operator') {
      add(.53,.14,.5,metal,0,2.12,.02); add(.32,.1,.19,visor,0,1.94,.22);
    } else {
      add(.51,.15,.5,metal,0,2.1,.02); add(.31,.08,.2,visor,0,1.94,.22);
    }
    // Legs and boots animate through their own pivots.
    const legs=[], arms=[];
    for(const side of [-1,1]){
      const legPivot = new THREE.Group(); legPivot.position.set(side*.19,.88,0); group.add(legPivot);
      const leg=boxMesh(.23,.73,.27,metal,0,-.27,0); legPivot.add(leg);
      legPivot.add(boxMesh(.27,.18,.38,bootMat,0,-.64,.07));
      legPivot.add(boxMesh(.29,.23,.3,cloth,0,-.08,0)); legs.push(legPivot);
      const armPivot = new THREE.Group(); armPivot.position.set(side*.43,1.54,.02); group.add(armPivot);
      armPivot.add(boxMesh(.2,.54,.22,metal,0,-.24,.05));
      armPivot.add(boxMesh(.24,.24,.25,cloth,0,-.09,.05));
      armPivot.add(boxMesh(.18,.19,.23,skin,0,-.48,.12));
      arms.push(armPivot);
    }
    // Weapon held forward; capture it in its own pivot so each shot can kick the weapon back.
    const weaponStart = group.children.length;
    if(kind==='bubba'){
      cylinder(.16,.19,.95,metal,-.22,1.8,.48,Math.PI/2,0); cylinder(.09,.09,.18,edge,-.22,1.8,.95,Math.PI/2,0);
      add(.35,.25,.68,metal,.26,1.1,.37);
    } else if(kind==='lilbit') {
      add(.18,.17,.9,metal,.24,1.16,.52); add(.08,.09,.22,edge,.24,1.16,.96); add(.1,.09,.26,edge,.24,1.16,.31);
    } else if(isEnemy && variant==='marksman') {
      // Long-barrel precision rifle with a raised optic and a front stabilizer.
      add(.17,.17,1.22,metal,.24,1.19,.63); add(.07,.08,.28,edge,.24,1.19,1.28);
      add(.19,.1,.24,metal,.2,1.37,.42); add(.12,.08,.14,edge,.2,1.43,.42);
    } else if(isEnemy && variant==='breacher') {
      // Compact heavy breaching carbine, thick muzzle and underslung module.
      add(.24,.22,.68,metal,.24,1.19,.48); add(.12,.12,.24,edge,.24,1.19,.89);
      add(.16,.13,.22,metal,.26,1.03,.56);
    } else {
      add(.2,.2,.78,metal,.24,1.19,.48); add(.08,.1,.2,edge,.24,1.19,.9);
    }
    // Parent the just-created weapon meshes to a pivot while preserving their world-local positions.
    const weaponRig = new THREE.Group();
    weaponRig.position.set(0, 1.18, .52);
    for (const piece of group.children.slice(weaponStart)) {
      group.remove(piece); piece.position.x -= weaponRig.position.x; piece.position.y -= weaponRig.position.y; piece.position.z -= weaponRig.position.z; weaponRig.add(piece);
    }
    group.add(weaponRig);

    // Shoulders, pouches, radio, and utility belt.
    add(.8,.13,.42,metal,0,.98,.02); add(.22,.25,.16,cloth,.36,.93,.22); add(.18,.28,.14,metal,-.36,1.0,.2);
    const eye = sphere(.065,edge,0,1.78,.265,{x:1.1,y:.8,z:.45});
    group.userData = { legs, arms, eye, kind, animOffset: rand(0, 8), weaponRig, weaponHome: { x: weaponRig.position.x, y: weaponRig.position.y, z: weaponRig.position.z }, baseArmPose: arms.map(arm => ({ x: arm.rotation.x, y: arm.rotation.y, z: arm.rotation.z })) };
    return group;
  }
  function buildEnemyView(enemy) {
    const group = buildHumanoid(enemy.type, true, enemy.variant || 'raider');
    if (enemy.type === 'drone') group.scale.set(.85,.85,.85);
    if (enemy.type === 'mech') group.scale.set(1.25,1.25,1.25);
    group.userData.enemyVariant = enemy.variant || 'raider';
    return group;
  }
  function buildHealthBar(actor) {
    const bar = new THREE.Group();
    const bg = boxMesh(actor.type==='mech'?1.9:actor.type==='drone'?1.0:1.05,.075,.045,mat(0x210e18,.6,.1),0,actor.type==='mech'?3.95:actor.type==='drone'?1.4:2.55,0,false,false);
    const fill = boxMesh(actor.type==='mech'?1.86:actor.type==='drone'?.96:.99,.055,.055,mat(actor.isEnemy?0xff3657:0x36f0a2,.4,.1,actor.isEnemy?0xa00027:0x076a43,.7),0,actor.type==='mech'?3.96:actor.type==='drone'?1.41:2.56,.025,false,false);
    bar.add(bg); bar.add(fill); bar.userData.fill=fill; bar.userData.width=fill.geometry.parameters.width; return bar;
  }
  function decorateCombatActor(actor, view) {
    // CHARACTER GRAPHICS: deployed-world models only. The Home/operator preview stays unchanged.
    if (actor.isEnemy && (actor.type === 'drone' || actor.type === 'mech')) return;
    const kind = actor.type;
    const friendly = !actor.isEnemy;
    const enemyStyle = {
      raider:   {accent:0xff405d, armor:0x641b2b, cloth:0x221c28, light:0x9b3748},
      recon:    {accent:0xbaff55, armor:0x344953, cloth:0x182630, light:0x7f9898},
      breacher: {accent:0xff794f, armor:0x6b2630, cloth:0x271c23, light:0xa54f40},
      heavy:    {accent:0xffc24d, armor:0x4a343a, cloth:0x28262c, light:0x997552},
      marksman: {accent:0x78e7ff, armor:0x34455a, cloth:0x182330, light:0x8195a7}
    }[actor.variant] || {accent:0xff405d, armor:0x641b2b, cloth:0x221c28, light:0x9b3748};
    const accent = friendly ? (kind === 'lilbit' ? 0x28e5ff : kind === 'bubba' ? 0xffb653 : 0x24cfff) : enemyStyle.accent;
    const armor = mat(kind === 'lilbit' ? 0xb79a60 : kind === 'bubba' ? 0x8b693d : kind === 'gideon' ? 0x4b6470 : actor.isEnemy ? enemyStyle.armor : 0x354550, .42, .5, friendly ? 0x071d2b : 0x240812, .12);
    const edgeMat = mat(accent, .28, .42, accent, .38);
    const clothMat = friendly ? tacticalFabricMaterial(kind) : mat(kind === 'lilbit' ? 0x6f6248 : kind === 'bubba' ? 0x4f422f : enemyStyle.cloth, .76, .13);
    const add = (w,h,d,m,x,y,z,rz=0) => { const mesh=boxMesh(w,h,d,m,x,y,z); mesh.rotation.z=rz; view.add(mesh); return mesh; };
    const orb = (r,m,x,y,z,sx=1,sy=1,sz=1) => { const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),m); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=true; view.add(mesh); return mesh; };
    if (friendly) {
      // CHARACTER GRAPHICS: the cropped source portrait follows the same head motion as the 3D rig.
      const face = new THREE.Mesh(
        new THREE.SphereGeometry(.261, 32, 24, 0, Math.PI, 0, Math.PI),
        new THREE.MeshStandardMaterial({ map: operatorFaceTexture(kind), roughness: .82, metalness: 0, side: THREE.DoubleSide })
      );
      face.position.set(0, 1.89, .028); face.scale.set(.91, 1.11, .925); face.castShadow = true; face.receiveShadow = true;
      view.add(face);
      addOperatorEdgeGlow(view, kind);
    }
    // Raised chest shell, shoulder armor, utility pouches and a compact field pack.
    add(.48,.46,.18,armor,0,1.34,.255);
    add(.09,.62,.055,edgeMat,-.16,1.33,.355,-.22);
    add(.09,.62,.055,edgeMat,.16,1.33,.355,.22);
    for (const side of [-1,1]) {
      orb(.22,armor,side*.43,1.63,.015,1.16,.72,1.1);
      add(.18,.22,.11,edgeMat,side*.31,.91,.245);
      add(.27,.19,.22,clothMat,side*.24,.68,.025);
      add(.24,.21,.2,armor,side*.19,.26,.035);
    }
    add(.39,.5,.22,armor,0,1.25,-.285);
    add(.28,.32,.12,clothMat,0,1.25,-.42);
    add(.68,.12,.2,armor,0,.93,.015);
    if (kind === 'lilbit') {
      // Tan cap brim, headset cup, segmented braid and climbing harness.
      const capMat=mat(0xd0b27a,.82,.08);
      add(.5,.075,.49,capMat,0,2.16,.015);
      add(.38,.06,.3,capMat,0,2.12,.19);
      orb(.055,capMat,.205,1.86,-.23,.9,1,.9);
      for (let i=0;i<5;i++) orb(.052,mat(i%2?0x242b2c:0x171c20,.85,.05),.22+i*.035,1.65-i*.105,-.28-i*.018,1.05,1.25,1.05);
      add(.09,.42,.045,edgeMat,-.27,1.34,.355,.18);
      add(.09,.42,.045,edgeMat,.27,1.34,.355,-.18);
      add(.22,.16,.18,mat(0x111d26,.45,.35),-.35,1.08,.22);
      add(.18,.15,.16,mat(0x111d26,.45,.35),.36,1.08,.22);
    } else if (kind === 'bubba') {
      // Heavy-assault ammo belt and distinct rocket-tube rails.
      add(.72,.12,.26,mat(0x372d22,.7,.2),0,.9,.06);
      for (let i=0;i<4;i++) add(.105,.15,.08,mat(i%2?0xe0a34b:0x5b4d36,.5,.42),-.27+i*.18,.87,.22);
      add(.2,.12,.78,edgeMat,-.24,1.96,-.03,Math.PI/2);
      add(.1,.1,.16,mat(0xffa34a,.3,.25,0xff5e21,.8),-.24,1.96,.39,Math.PI/2);
    } else if (kind === 'operator') {
      add(.19,.22,.13,edgeMat,-.34,1.15,.19); add(.19,.22,.13,edgeMat,.34,1.15,.19);
    }

    // Deployed-only silhouette pass: layered plating, boots, knee guards and role-specific field gear.
    // This deliberately lives in the world actor decorator; operator-select layout/model stays as-is.
    const darkSteel = mat(0x101c26,.52,.56,0x071522,.08);
    const lightArmor = mat(actor.isEnemy ? enemyStyle.light : kind==='lilbit'?0xe0c58b:kind==='bubba'?0xb18a54:kind==='gideon'?0x839ba5:0x9ba6aa,.43,.48);
    const seam = mat(0x172a35,.62,.36);
    // Collar, chest panels and a small cyan squad-ID plate.
    add(.3,.13,.28,darkSteel,0,1.78,.12);
    add(.2,.25,.045,edgeMat,0,1.47,.415);
    add(.12,.035,.025,lightArmor,0,1.51,.443);
    add(.44,.08,.12,seam,0,1.05,.27);
    add(.15,.18,.13,lightArmor,-.36,1.02,.255);
    add(.15,.18,.13,lightArmor,.36,1.02,.255);
    // Stacked shoulder caps and forearm shells make the combat silhouette read at a distance.
    for (const side of [-1,1]) {
      orb(.205,lightArmor,side*.43,1.64,.035,1.14,.68,1.02);
      add(.19,.3,.22,armor,side*.45,1.38,.05,side*.08);
      add(.21,.12,.24,edgeMat,side*.44,1.23,.15,side*.08);
      add(.2,.16,.15,darkSteel,side*.44,.99,.09);
      // Knees and shin plates follow the existing leg pivots visually without changing collision.
      add(.23,.18,.13,lightArmor,side*.19,.49,.17);
      add(.17,.3,.11,armor,side*.19,.29,.16);
      add(.22,.08,.24,darkSteel,side*.19,.105,.11);
    }
    // Compact rear comms pack, antenna and two cyan status lights.
    add(.39,.48,.2,darkSteel,0,1.31,-.39);
    add(.31,.26,.065,armor,0,1.38,-.51);
    add(.08,.35,.08,edgeMat,.19,1.55,-.49,.08);
    orb(.045,edgeMat,-.09,1.42,-.515,1,1,.7);
    orb(.045,edgeMat,.09,1.42,-.515,1,1,.7);

    if (kind === 'lilbit') {
      // Rounded cap crown, curved bill, dark hairline and segmented rear braid.
      const capMat = mat(0xd8ba80,.83,.06);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.25,14,10),capMat);
      cap.position.set(0,2.15,-.005); cap.scale.set(1.02,.55,1.0); cap.castShadow=true; view.add(cap);
      add(.38,.045,.25,capMat,0,2.105,.19,-.025);
      const hairMat=mat(0x171c20,.91,.02), braidMat=mat(0x24292a,.86,.03);
      orb(.19,hairMat,0,1.91,-.17,1.05,1.08,.9);
      for(let i=0;i<6;i++) orb(.064,i%2?hairMat:braidMat,.18+i*.024,1.74-i*.105,-.28-i*.023,1,1.2,1);
      // Grapple spool and slim utility tools at the hips.
      const spool = new THREE.Mesh(new THREE.TorusGeometry(.105,.035,7,16),edgeMat);spool.position.set(-.36,1.04,-.03);spool.rotation.y=Math.PI/2;view.add(spool);
      add(.11,.2,.12,mat(0x202c32,.55,.35),.37,.92,.21);
    } else if (kind === 'bubba') {
      // Shoulder-mounted launcher: tube points forward along the operator's local +Z axis.
      const tubeMat=mat(0x303b3c,.38,.72), tubeAccent=mat(0xffa447,.3,.38,0xff6727,.8);
      const tube=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.94,12),tubeMat);
      tube.rotation.x=Math.PI/2;tube.position.set(-.34,2.005,-.16);tube.castShadow=true;view.add(tube); view.userData.rocketTube=tube; view.userData.rocketTubeHome=tube.position.clone();
      for(const z of [-.58,.23]) {const ring=new THREE.Mesh(new THREE.TorusGeometry(.145,.022,7,16),tubeAccent);ring.position.set(-.34,2.005,z);ring.rotation.x=Math.PI/2;view.add(ring);}
      add(.24,.16,.23,lightArmor,.39,1.62,.12);
      add(.35,.13,.08,tubeAccent,-.34,2.14,-.17);
      const rocketFlash = new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),new THREE.MeshBasicMaterial({color:0xffad55,transparent:true,opacity:.98}));
      rocketFlash.position.set(-.34,2.005,.36); rocketFlash.visible=false; view.add(rocketFlash); view.userData.rocketFlash=rocketFlash;
    } else if (kind === 'gideon') {
      // Closed tactical helmet and bright visor slit for the optional support operator.
      const helm=mat(0x526772,.34,.65,0x0e3544,.12);
      const dome=new THREE.Mesh(new THREE.SphereGeometry(.27,14,12),helm);dome.position.set(0,2.0,0);dome.scale.set(1.02,.88,.98);dome.castShadow=true;view.add(dome);
      add(.39,.1,.08,edgeMat,0,1.98,.235);
      add(.12,.14,.1,darkSteel,0,1.8,.12);
    } else if (actor.isEnemy) {
      // Original enemy role silhouettes; accent colors stay hostile, but each role is
      // readable at a glance: recon goggles, breacher respirator, heavy shoulder shell,
      // or marksman optic. These are world-only details; the Home preview stays untouched.
      const hostile=mat(enemyStyle.armor,.43,.58,0x320912,.26);
      const visorMat=mat(enemyStyle.accent,.2,.55,enemyStyle.accent,1.15);
      const helmMat=mat(actor.variant==='recon'?0x253841:actor.variant==='marksman'?0x202b38:0x242630,.42,.65,0x090f17,.12);
      const helm=new THREE.Mesh(new THREE.SphereGeometry(.255,14,12),helmMat);
      helm.position.set(0,1.99,0);helm.scale.set(actor.variant==='heavy'?1.22:1.12,actor.variant==='marksman'?.72:.87,1);helm.castShadow=true;view.add(helm);
      if(actor.variant==='recon') {
        // Dual night-vision lenses and a short sensor antenna.
        add(.43,.085,.075,mat(0x16252d,.25,.5),0,1.99,.242);
        for(const side of [-1,1]) {
          orb(.075,visorMat,side*.105,1.99,.286,1.05,.92,.55);
          add(.12,.08,.09,hostile,side*.19,1.99,.235);
        }
        add(.045,.24,.045,visorMat,.17,2.25,-.04,.05);
        add(.38,.08,.06,mat(0xc5ff62,.28,.2,0xa8ff39,.6),0,1.42,.45);
      } else if(actor.variant==='breacher') {
        // Sealed faceplate with paired respirator filters and reinforced brow.
        add(.45,.13,.08,hostile,0,2.0,.25);
        add(.36,.18,.1,mat(0x101a21,.38,.65),0,1.86,.25);
        for(const side of [-1,1]) {
          const filter=mat(0x414d50,.3,.8,0x44151a,.15);
          const can=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.08,10),filter);can.rotation.x=Math.PI/2;can.position.set(side*.13,1.86,.315);view.add(can);
          orb(.022,visorMat,side*.13,1.86,.36,1,1,.5);
        }
        add(.54,.14,.1,hostile,0,2.13,.02);
        add(.4,.07,.05,visorMat,0,1.64,.39);
      } else if(actor.variant==='heavy') {
        // Broad shoulder shells and yellow rank bars make the heavy unit larger.
        add(.62,.18,.12,hostile,0,2.12,.03);
        for(const side of [-1,1]) {
          add(.34,.27,.25,hostile,side*.5,1.65,.04,side*.04);
          add(.19,.08,.045,visorMat,side*.48,1.67,.19,side*.03);
        }
        add(.52,.22,.08,hostile,0,1.4,.43);
        for(let i=0;i<3;i++) add(.055,.16,.025,visorMat,-.1+i*.1,1.4,.48);
      } else if(actor.variant==='marksman') {
        // Low-profile helmet, cyan rangefinder and a raised rifle optic.
        add(.42,.075,.28,mat(0x243442,.34,.6),0,2.11,-.015);
        add(.22,.08,.14,visorMat,0,2.05,.25);
        add(.24,.1,.09,mat(0x17242b,.32,.65),.2,1.4,.49);
        orb(.045,visorMat,.2,1.41,.55,1.25,.8,.5);
        add(.07,.24,.06,hostile,-.37,1.38,.06,-.18);
      } else {
        add(.39,.1,.075,visorMat,0,1.98,.238);
        add(.38,.31,.06,hostile,0,1.43,.42);
        add(.12,.12,.04,visorMat,0,1.43,.462);
        for(const side of [-1,1]) add(.23,.18,.14,hostile,side*.45,1.63,.04,side*.06);
      }
    } else {
      // JJ's earpiece and comms boom keep his own silhouette distinct from the allies.
      const headset=mat(0x172b36,.45,.52,0x092e3b,.25);
      orb(.07,headset,-.24,1.91,.035,1,1,.7);
      add(.045,.16,.045,edgeMat,-.25,1.83,.12,-.18);
      add(.14,.08,.09,lightArmor,0,1.75,.2);
    }

    // Weapon flash is an in-world light/mesh, enabled only for a few frames after firing.
    const flashColor=kind==='bubba'?0xffa64a:kind==='lilbit'?0x48e6ff:0x55dfff;
    const muzzle=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:flashColor,transparent:true,opacity:.95}));
    muzzle.position.set(kind==='bubba'?-.34:.25,kind==='bubba'?2.0:1.18,kind==='bubba'?.46:1.02);
    muzzle.visible=false;view.add(muzzle);view.userData.muzzleFlash=muzzle;
    const flashLight = new THREE.PointLight(flashColor, 0, 2.7, 2); flashLight.position.copy(muzzle.position); view.add(flashLight); view.userData.muzzleLight=flashLight;
    view.userData.worldArmor = true;
  }
  function addActorView(actor) {
    const view = actor.isEnemy ? buildEnemyView(actor) : buildHumanoid(actor.type, false);
    decorateCombatActor(actor, view);
    actor.view = view; actor.mesh = view; actor.baseScale = { x:view.scale.x, y:view.scale.y, z:view.scale.z }; actor.healthBar = buildHealthBar(actor); view.add(actor.healthBar);
    scene3D.add(view);
  }
  function setupPreview() {
    try {
      const canvas = $('previewCanvas');
      previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); previewRenderer.setSize(canvas.clientWidth || 480, canvas.clientHeight || 300, false); previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
      previewRenderer.toneMapping=THREE.ACESFilmicToneMapping; previewRenderer.toneMappingExposure=1.15;
      previewScene = new THREE.Scene(); previewScene.background = new THREE.Color(0x071522);
      previewScene.fog = new THREE.Fog(0x071522,10,23);
      previewCamera = new THREE.PerspectiveCamera(36,Math.max(1,canvas.clientWidth)/Math.max(1,canvas.clientHeight),.1,60);
      previewCamera.position.set(-3.3,3.25,6.4); previewCamera.lookAt(0,1.28,0);
      previewScene.add(new THREE.HemisphereLight(0xb9efff,0x11141b,1.9));
      const key=new THREE.DirectionalLight(0xffd8a0,2.4); key.position.set(-3,7,4); previewScene.add(key);
      const blue=new THREE.PointLight(0x0dc7ff,3,14); blue.position.set(-3,2,1); previewScene.add(blue);
      const floor=new THREE.Mesh(new THREE.CylinderGeometry(2.25,2.25,.18,64),mat(0x152a39,.3,.8,0x073751,.4)); floor.position.y=-.13; previewScene.add(floor);
      previewRing=new THREE.Mesh(new THREE.TorusGeometry(2.0,.045,8,70),new THREE.MeshBasicMaterial({color:0x22d8ff,transparent:true,opacity:.9})); previewRing.rotation.x=Math.PI/2; previewRing.position.y=-.02; previewScene.add(previewRing);
      const innerRing=new THREE.Mesh(new THREE.TorusGeometry(1.55,.025,8,70),new THREE.MeshBasicMaterial({color:0xc18f39,transparent:true,opacity:.65})); innerRing.rotation.x=Math.PI/2; innerRing.position.y=-.01; previewScene.add(innerRing);
      previewActor=buildHumanoid('operator',false); previewActor.position.y=0; previewActor.scale.set(1.28,1.28,1.28); previewScene.add(previewActor);
      $('previewFallback').style.display='none'; $('previewCanvas').style.display='block';
    } catch (err) {
      console.warn('3D preview unavailable; using supplied character portrait.', err);
      previewRenderer=null; previewScene=null; $('previewCanvas').style.display='none'; $('previewFallback').style.display='flex';
    }
  }
  function setPreview(kind) {
    const info=OPERATOR_INFO[kind] || OPERATOR_INFO.operator;
    $('previewName').innerHTML = `${info.name} ${info.display ? `<span>${info.display}</span>` : ''}`;
    $('previewRole').textContent=info.role; $('previewQuote').textContent=info.quote; $('previewBio').textContent=info.bio; $('previewClass').textContent=info.klass;
    $('previewAbilities').replaceChildren(...info.abilities.map(t=>{const s=document.createElement('span');s.textContent=t;return s;}));
    $('previewPortrait').src=info.portrait;
    if (previewScene && previewActor) {
      previewScene.remove(previewActor); previewActor=buildHumanoid(kind,false); previewActor.scale.set(1.28,1.28,1.28); previewScene.add(previewActor);
      previewActor.rotation.y=-.15;
    }
    if(kind==='lilbit') {
      $('abilityTitle').textContent='LIL BIT · ABILITIES'; $('abilityOneTitle').textContent='TACTICAL DASH'; $('abilityOneDesc').textContent='Q · Quick burst of speed.'; $('abilityTwoTitle').textContent='FIELD REPAIR'; $('abilityTwoDesc').textContent='E · Restore a teammate near you.'; $('abilityThreeTitle').textContent='EMP GRENADE'; $('abilityThreeDesc').textContent='G · Disable drones and shields.';
    } else if(kind==='bubba') {
      $('abilityTitle').textContent='BUBBA · HEAVY ASSAULT'; $('abilityOneTitle').textContent='ROCKET LAUNCHER'; $('abilityOneDesc').textContent='Splash damage against heavy threats.'; $('abilityTwoTitle').textContent='DIRECT APPROACH'; $('abilityTwoDesc').textContent='Pushes hostiles and holds the line.'; $('abilityThreeTitle').textContent='TEAM COVER'; $('abilityThreeDesc').textContent='Draws attention away from Lil Bit.';
    } else {
      $('abilityTitle').textContent='TEAM CAPABILITIES'; $('abilityOneTitle').textContent='TACTICAL AWARENESS'; $('abilityOneDesc').textContent='Scan threats and keep the squad moving.'; $('abilityTwoTitle').textContent='FIELD REPAIR'; $('abilityTwoDesc').textContent='E · Restore a teammate near you.'; $('abilityThreeTitle').textContent='EMP GRENADE'; $('abilityThreeDesc').textContent='G · Disable drones and shields.';
    }
  }

  // ---------- Facility build data for physics / fallback renderer ----------
  function buildLayoutData() {
    platforms = [
      {id:'catwalk-west',x:-13,z:-8.1,w:10.5,d:3.15,topY:3.15},
      {id:'catwalk-center',x:-1,z:-8.1,w:12.5,d:3.15,topY:3.15},
      {id:'catwalk-east',x:11.9,z:-8.1,w:12,d:3.15,topY:3.15},
      {id:'side-west',x:-15.4,z:1.2,w:7.2,d:3.6,topY:1.8},
      {id:'side-center',x:2.8,z:2.1,w:7.6,d:3.4,topY:2.0},
      {id:'core-dais',x:17,z:-14.7,w:9,d:5.8,topY:1.45}
    ];
    ladders = [ {id:'ladder-west',x:-13,z:-7.4,bottom:0,top:3.15},{id:'ladder-east',x:10,z:-7.4,bottom:0,top:3.15},{id:'ladder-core',x:16.1,z:-12.7,bottom:0,top:1.45} ];
    coverObjects = CRATE_LAYOUT.map(o=>({...o}));
  }

  // SIX-MISSION CAMPAIGN: apply the current briefing and place its exit gate in the world.
  function updateMissionStageScene() {
    const stage=MISSION_CAMPAIGN[missionIndex]||MISSION_CAMPAIGN[0];
    game.exit={...stage.exit};
    const heading=document.querySelector('.objective-stack .objectives:not(.secondary) > strong');
    if(heading)heading.textContent=`MISSION ${stage.code} / 06 · ${stage.title}`;
    const levelLabel=$('missionLevelLabel');if(levelLabel)levelLabel.textContent=`LEVEL ${stage.code} / 06`;
    const missionBrief=$('missionBrief');if(missionBrief)missionBrief.textContent=stage.brief;
    document.querySelectorAll('#missionProgress i').forEach((segment,i)=>{segment.classList.toggle('complete',i<missionIndex);segment.classList.toggle('active',i===missionIndex);});
    const coreLabel=$('objCore');
    if(coreLabel){const text=Array.from(coreLabel.childNodes).find(n=>n.nodeType===Node.TEXT_NODE);if(text)text.nodeValue=` ${game.coreRestored?(missionIndex===5?'Exit for final extraction':`Exit to mission ${MISSION_CAMPAIGN[missionIndex+1].code}`):'Reach the Network Core'}`;coreLabel.title=stage.brief;}
    if(objectiveMeshes.exit){
      objectiveMeshes.exit.position.set(game.exit.x,0,game.exit.z);objectiveMeshes.exit.rotation.y=game.exit.yaw;
      if(objectiveMeshes.exit.userData.left)objectiveMeshes.exit.userData.left.position.x=-.76;
      if(objectiveMeshes.exit.userData.right)objectiveMeshes.exit.userData.right.position.x=.76;
    }
  }
  function missionEnemyDefs() {
    const transforms=[
      (x,z)=>[x,z], (x,z)=>[-x,z], (x,z)=>[x,-z], (x,z)=>[-x,-z],
      (x,z)=>[clamp(x*.78+2,-17,17),clamp(z*.8-1,-16,16)],
      (x,z)=>[clamp(x*.76-2,-17,17),clamp(z*.78+1,-16,16)]
    ];
    const transform=transforms[missionIndex]||transforms[0];
    const patrol=ENEMY_DEFS.map(def=>{const [x,z]=transform(def.x,def.z);return {...def,x,z};});
    return patrol.concat((MISSION_CAMPAIGN[missionIndex]?.reinforcements||[]).map(def=>({...def})))
      .map(def=>({...def,boss:def.type==='mech',hp:def.type==='mech'?BOSS_HP:ENEMY_HP}));
  }

  // ---------- Mission reset and actor spawning ----------
  function remove3DActor(actor) {
    if (actor.view && scene3D) { scene3D.remove(actor.view); disposeGroup(actor.view); }
  }
  function disposeGroup(group) {
    group.traverse?.(obj=>{ if(obj.geometry) obj.geometry.dispose(); /* shared cached materials are retained */ });
  }
  function clearTransientVisuals() {
    if (scene3D) {
      for(const b of beams){ if(b.object) scene3D.remove(b.object); }
      for(const p of particles){if(p.object)scene3D.remove(p.object);}
      for(const p of projectiles){if(p.object){scene3D.remove(p.object);p.object.traverse?.(o=>{o.geometry?.dispose();if(o.material&&!Array.from(matCache.values()).includes(o.material))o.material.dispose();});}}
    }
    beams=[]; particles=[]; projectiles=[];
  }
  function resetMission() {
    const oldDriver=game.vehicle.driverId?teamById(game.vehicle.driverId):null;
    if(oldDriver)oldDriver.inVehicle=false;
    Object.assign(game.vehicle,{x:-15,z:9.6,angle:.32,speed:0,driverId:null,lastShot:-1,firingUntil:0});
    clearTransientVisuals(); actors.forEach(remove3DActor); enemies.forEach(remove3DActor);
    actors=[]; enemies=[]; currentWeapon=0; game.time=0; game.score=0; game.kills=0; game.hitCount=0; game.lastFire=0; game.won=false;
    terminalActive=false; terminalFound=false; sectorExplored=false; lostTechFound=false; facilityCleared=false; game.coreRestored=false; dashCooldown=0;empCooldown=0;repairCooldown=0;
    updateMissionStageScene();
    game.lostTech.taken=false; game.selected=selectedId; missionEnded=false;
    for(const def of TEAM_DEFS) {
      if(def.id==='gideon'&&!includeGideon) continue;
      const a=freshActor({...def}); actors.push(a); if(can3D)addActorView(a);
    }
    for(const def of missionEnemyDefs()) {
      const e=freshActor({...def,hp:def.hp,maxHp:def.hp},true); enemies.push(e); if(can3D)addActorView(e);
    }
    game.actors=actors;game.enemies=enemies;game.playerActor=controlled(); actors.forEach(a=>a.isControlled=a.id===game.selected);
    // Highlight critical route markers when the game is restarted.
    if(objectiveMeshes.termRing) objectiveMeshes.termRing.material.color.setHex(0x20dfff);
    if(objectiveMeshes.coreRing) objectiveMeshes.coreRing.material.color.setHex(0x47e6ff);
    if(objectiveMeshes.exit?.userData?.signal?.material) objectiveMeshes.exit.userData.signal.material=mat(0xff4658,.35,.2,0xff152c,1.3);
    if(objectiveMeshes.lostTech)objectiveMeshes.lostTech.visible=true;
    $('resultOverlay').classList.add('hidden'); $('toast').classList.add('hidden'); $('gameHUD').classList.remove('hidden'); $('selectScreen').classList.add('hidden');
    missionRunning=true; missionEnded=false; game.started=true;
    buildHud(); updateHud(); showToast(`${OPERATOR_INFO[game.selected].name} DEPLOYED · FACILITY ALPHA`);
    cameraTarget={x:controlled().x,y:controlled().y,z:controlled().z};
  }
  function startMission() {
    selectedId = document.querySelector('.operator-option.selected[data-operator]')?.dataset.operator || selectedId;
    missionIndex=0;campaignScore=0;campaignKills=0;game.selected=selectedId; buildLayoutData();
    if(can3D && !scene3D) makeScene();
    if(previewWorldActor&&scene3D){scene3D.remove(previewWorldActor);disposeGroup(previewWorldActor);previewWorldActor=null;}
    resetMission();
  }
  function returnToSelect() {
    missionRunning=false; missionEnded=false; $('gameHUD').classList.add('hidden'); $('selectScreen').classList.remove('hidden');
    setPreview(selectedId); cameraTarget={x:0,y:0,z:0};
  }

  // ---------- HUD ----------
  function buildHud() {
    const host=$('squadCards'); host.innerHTML='';
    const order=['operator','bubba','lilbit'];
    for(const id of order) {
      const actor=teamById(id); const info=OPERATOR_INFO[id];
      const card=document.createElement('div');card.className='squad-card';card.id=`card-${id}`;
      card.innerHTML=`<img src="${info.portrait}" alt="${info.name}"><div class="squad-card-copy"><b>${info.name==='OPERATOR'?'JJ':info.name}</b><small id="health-${id}">${actor.maxHp} / ${actor.maxHp}</small><div class="health-track"><div class="health-fill" id="bar-${id}"></div></div></div>`;
      host.appendChild(card);
    }
    const w=$('weaponButtons');w.innerHTML='';
    WEAPONS.forEach((weapon,i)=>{const btn=document.createElement('button');btn.className='weapon-button';btn.dataset.weapon=String(i);btn.innerHTML=`<b>${i+1}</b><strong style="font-size:19px;line-height:1">${weapon.icon}</strong><span>${weapon.short}</span>`;btn.addEventListener('click',()=>{currentWeapon=i;updateHud();});w.appendChild(btn);});
  }
  function labelObjective(id, done) {const el=$(id);if(!el)return;el.classList.toggle('done',!!done);const icon=el.querySelector('i');if(icon)icon.textContent=done?'✓':'○';}
  function updateHud() {
    for(const id of ['operator','bubba','lilbit']) {
      const a=teamById(id);const card=$(`card-${id}`);if(!card||!a)continue;
      card.classList.toggle('controlled',game.selected===id);card.classList.toggle('down',!a.alive||a.down);
      $(`health-${id}`).textContent=`${Math.max(0,Math.round(a.hp))} / ${a.maxHp}`;
      $(`bar-${id}`).style.width=`${clamp(a.hp/a.maxHp,0,1)*100}%`;
    }
    document.querySelectorAll('.weapon-button').forEach((btn,i)=>btn.classList.toggle('active',i===currentWeapon));
    const actor=controlled(),weapon=getWeapon(actor),driving=game.vehicle.driverId===actor?.id;
    $('ammoWeapon').textContent=driving?'TANK CANNON':weapon.name;$('ammoSymbol').textContent=driving?'▰':weapon.icon;$('ammoCount').textContent=driving?'∞ · 200':Number.isFinite(weapon.ammo)?`${weapon.ammo}/${weapon.reserve}`:'∞';$('ammoHint').textContent=driving?'200 DAMAGE PER SHELL · WASD DRIVE':weapon.hint;
    $('splashIcon').style.opacity=!driving&&weapon.splash?1:.25;
    const coreLabel=$('objCore');
    if(coreLabel){const text=Array.from(coreLabel.childNodes).find(n=>n.nodeType===3);if(text)text.nodeValue=` ${game.coreRestored?(missionIndex===5?'Exit for final extraction':`Exit to mission ${MISSION_CAMPAIGN[missionIndex+1].code}`):'Reach the Network Core'}`;}
    labelObjective('objClear',facilityCleared);labelObjective('objTerminal',terminalActive);labelObjective('objCore',game.coreRestored);labelObjective('objSector',sectorExplored);labelObjective('objLostTech',lostTechFound);
  }
  function showToast(message) {
    if (message===lastToast && performance.now()-lastToastAt<1100) return;
    lastToast=message;lastToastAt=performance.now();const toast=$('toast');toast.textContent=message;toast.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.add('hidden'),1900);
  }

  // ---------- World movement, climbing, cover, and objective interaction ----------
  function surfaceAt(x,z,currentY=0) {
    let surface=0;
    for(const p of platforms) {
      if(x>=p.x-p.w/2+.06&&x<=p.x+p.w/2-.06&&z>=p.z-p.d/2+.06&&z<=p.z+p.d/2-.06&&p.topY<=currentY+.22) surface=Math.max(surface,p.topY);
    }
    return surface;
  }
  function nearestLadder(a) {let best=null,bestD=Infinity;for(const l of ladders){const d=Math.hypot(a.x-l.x,a.z-l.z);if(d<bestD){bestD=d;best=l;}}return {ladder:best,distance:bestD};}
  function closestEnemy(a,max=Infinity) {let best=null,bd=max;for(const e of livingEnemies()){const d=Math.hypot(e.x-a.x,e.z-a.z)+(Math.abs((e.y||0)-(a.y||0))*.45);if(d<bd){bd=d;best=e;}}return best;}
  function closestTeammate(a, filter = null) {let best=null,bd=Infinity;for(const t of actors){if(t===a||!t.alive)continue;if(filter&&!filter(t))continue;const d=dist2(a,t)+Math.abs(a.y-t.y)*.45;if(d<bd){bd=d;best=t;}}return best;}
  function collidesCover(x,z,r=.5) {
    for(const o of coverObjects){const nx=clamp(x,o.x-o.w/2-r,o.x+o.w/2+r),nz=clamp(z,o.z-o.d/2-r,o.z+o.d/2+r);if(Math.hypot(x-nx,z-nz)<r*.68)return true;}
    return false;
  }
  function findBlockingCover(from, to) {
    const dx=to.x-from.x, dz=to.z-from.z, steps=24;
    for(let i=2;i<steps-1;i++) {
      const t=i/steps, x=from.x+dx*t, z=from.z+dz*t, y=(from.y||0)+((to.y||0)-(from.y||0))*t;
      for(const o of coverObjects) {
        if(y < o.h-.12 && x >= o.x-o.w/2-.06 && x <= o.x+o.w/2+.06 && z >= o.z-o.d/2-.06 && z <= o.z+o.d/2+.06) return {x,y,z,cover:o};
      }
    }
    return null;
  }
  function visibleFrom(a, target) {
    const from={x:a.x,y:a.y+1.18,z:a.z},to={x:target.x,y:target.y+(target.type==='mech'?2.0:target.type==='drone'?.2:1.05),z:target.z};
    return !findBlockingCover(from,to);
  }
  function closestVisibleEnemy(a, max=Infinity) {
    let best=null,bd=max;
    for(const e of livingEnemies()) { const d=Math.hypot(e.x-a.x,e.z-a.z)+Math.abs((e.y||0)-(a.y||0))*.45; if(d<bd&&visibleFrom(a,e)){bd=d;best=e;} }
    return best;
  }
  function moveActor(a,dx,dz,dt,allowCover=true) {
    const length=Math.hypot(dx,dz)||1;dx/=length;dz/=length;
    const speed=a.speed*(a.dashUntil&&a.dashUntil>game.time?1.85:1);
    let nx=clamp(a.x+dx*speed*dt,WORLD.minX+1,WORLD.maxX-1),nz=clamp(a.z+dz*speed*dt,WORLD.minZ+1,WORLD.maxZ-1);
    if(allowCover&&collidesCover(nx,a.z,.48))nx=a.x;
    if(allowCover&&collidesCover(a.x,nz,.48))nz=a.z;
    a.vx=(nx-a.x)/Math.max(dt,.001);a.vz=(nz-a.z)/Math.max(dt,.001);a.x=nx;a.z=nz;
    if(Math.abs(dx)+Math.abs(dz)>.01){a.dirX=dx;a.dirZ=dz;}
    a.anim+=dt*(Math.abs(a.vx)+Math.abs(a.vz))*.55;
  }
  function jumpActor(a) {const floor=surfaceAt(a.x,a.z,a.y);if(a.y<=floor+.08&&!a.climbing){a.vy=7.6;a.y+=.02;showToast('JUMP · CLEAR THE GAP');}}
  function startClimb(a,l) {a.climbing=true;a.climbLadder=l;a.vy=0;showToast('CLIMBING LADDER');}
  function updateClimb(a,dt,up,down) {
    const l=a.climbLadder;if(!l){a.climbing=false;return;}
    if(up)a.y=Math.min(l.top,a.y+4.1*dt);else if(down)a.y=Math.max(l.bottom,a.y-4.1*dt);
    a.x += (l.x-a.x)*Math.min(1,dt*9);a.z += (l.z-a.z)*Math.min(1,dt*9);
    if(a.y>=l.top-.02){a.y=l.top;a.climbing=false;a.climbLadder=null;showToast('UPPER CATWALK REACHED');}
    if(a.y<=l.bottom+.02&&down){a.y=l.bottom;a.climbing=false;a.climbLadder=null;}
  }
  function updateVertical(a,dt) {
    if(a.climbing)return;
    const floor=surfaceAt(a.x,a.z,a.y);
    if(a.y>floor+.005||a.vy>0){a.vy-=18*dt;a.y+=a.vy*dt;if(a.y<=floor){a.y=floor;a.vy=0;}}
    else {a.y=floor;a.vy=0;}
  }
  function handlePlayerInput(a,dt) {
    if(game.vehicle.driverId===a.id){handleVehicleInput(a,dt);return;}
    const k=game.keys;let dx=0,dz=0;
    if(k.has('KeyA')||k.has('ArrowLeft'))dx-=1;if(k.has('KeyD')||k.has('ArrowRight'))dx+=1;
    if(k.has('KeyW')||k.has('ArrowUp'))dz-=1;if(k.has('KeyS')||k.has('ArrowDown'))dz+=1;
    const ladderInfo=nearestLadder(a);
    if(a.climbing){updateClimb(a,dt,dz<0, dz>0);}
    else if(dz<0&&ladderInfo.distance<1.18&&a.y<ladderInfo.ladder.top-.2){startClimb(a,ladderInfo.ladder);updateClimb(a,dt,true,false);}
    else if(dx||dz)moveActor(a,dx,dz,dt,true);
    if(k.has('Space')&&!a.spaceWasDown){jumpActor(a);}a.spaceWasDown=k.has('Space');
    updateVertical(a,dt);
    if(a.y>0&&a.y<.12)a.y=0;
    if(k.has('KeyF')||k.has('KeyJ')) {
      const weapon=WEAPONS[currentWeapon],last=a.lastShotByWeapon[weapon.id]??-1;
      if(game.time-last>=weapon.rate){fireWeapon(a,weapon,true);a.lastShotByWeapon[weapon.id]=game.time;a.lastShot=game.time;}
    }
  }
  function enterBuggy(a) {
    const v=game.vehicle;if(v.driverId&&v.driverId!==a.id)return;
    v.driverId=a.id;v.speed=0;a.inVehicle=true;a.x=v.x;a.z=v.z;a.y=0;a.vx=0;a.vz=0;
    a.dirX=Math.cos(v.angle);a.dirZ=-Math.sin(v.angle);
    if(a.view)a.view.visible=false;
    showToast('TANK READY · WASD DRIVE · F/J FIRE · E EXIT');updateHud();updatePrompt();
  }
  function exitBuggy(a) {
    const v=game.vehicle;if(v.driverId!==a.id)return;
    const fx=Math.cos(v.angle),fz=-Math.sin(v.angle);
    v.driverId=null;v.speed=0;a.inVehicle=false;
    a.x=clamp(v.x-fx*1.9,WORLD.minX+1,WORLD.maxX-1);a.z=clamp(v.z-fz*1.9,WORLD.minZ+1,WORLD.maxZ-1);
    if(collidesCover(a.x,a.z,.48)){a.x=clamp(v.x+fz*1.9,WORLD.minX+1,WORLD.maxX-1);a.z=clamp(v.z-fx*1.9,WORLD.minZ+1,WORLD.maxZ-1);}
    a.dirX=fx;a.dirZ=fz;a.y=surfaceAt(a.x,a.z,0);a.vy=0;
    if(a.view)a.view.visible=a.alive||a.down;
    showToast('TANK EXITED');updateHud();updatePrompt();
  }
  function fireVehicleWeapon(a) {
    const v=game.vehicle,fx=Math.cos(v.angle),fz=-Math.sin(v.angle);
    const origin={x:v.x+fx*1.65,y:1.16,z:v.z+fz*1.65};
    const target=getTargetInFront({x:v.x,y:0,z:v.z,dirX:fx,dirZ:fz},28);
    let end=target?{x:target.x,y:target.y+(target.type==='mech'?2:target.type==='drone'?.25:.95),z:target.z}:{x:v.x+fx*24,y:origin.y,z:v.z+fz*24};
    const blocker=target?findBlockingCover(origin,end):null;
    if(blocker){end={x:blocker.x,y:Math.min(blocker.y+.45,blocker.cover.h-.08),z:blocker.z};impactSpark(end.x,end.y,end.z,0xffc45e,.9);}
    v.firingUntil=game.time+.2;addBeam(origin,end,0xffb34b,.28,.12);impactSpark(origin.x,origin.y,origin.z,0xffd078,1.35);
    const shell={id:'tankShell',name:'TANK CANNON',damage:VEHICLE_DAMAGE_PER_SHOT,rate:.56,range:28,color:0xffb34b,splash:1.1};
    spawnProjectile(origin,end,shell,'player');
    v.lastShot=game.time;game.lastFire=game.time;
    showToast('TANK CANNON FIRED · 200 DAMAGE');
  }
  function handleVehicleInput(a,dt) {
    const v=game.vehicle,k=game.keys;
    const throttle=(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0);
    const steering=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0);
    if(throttle)v.speed=clamp(v.speed+throttle*9.5*dt,-4.6,10.5);
    else v.speed*=Math.max(0,1-1.5*dt);
    if(steering)v.angle+=steering*1.55*dt*(v.speed<-.1?-1:1);
    const fx=Math.cos(v.angle),fz=-Math.sin(v.angle),oldX=v.x,oldZ=v.z;
    const nx=clamp(v.x+fx*v.speed*dt,WORLD.minX+1.5,WORLD.maxX-1.5);
    const nz=clamp(v.z+fz*v.speed*dt,WORLD.minZ+1.5,WORLD.maxZ-1.5);
    if(collidesCover(nx,nz,1.05)){v.speed=0;impactSpark(v.x,.55,v.z,0xffbd62,.7);}
    else {v.x=nx;v.z=nz;}
    a.x=v.x;a.y=0;a.z=v.z;a.vx=(v.x-oldX)/Math.max(dt,.001);a.vz=(v.z-oldZ)/Math.max(dt,.001);a.dirX=fx;a.dirZ=fz;
    if((k.has('KeyF')||k.has('KeyJ'))&&game.time-v.lastShot>=.56)fireVehicleWeapon(a);
    if(buggyWheelMeshes.length&&Math.abs(v.speed)>.05)for(const wheel of buggyWheelMeshes)wheel.rotation.x+=v.speed*dt*1.9;
  }
  function inputInteract() {
    const a=controlled();if(!a)return;
    if(game.vehicle.driverId===a.id){exitBuggy(a);return;}
    if(dist2(a,game.vehicle)<2.8){enterBuggy(a);return;}
    const downed=actors.find(t=>t!==a&&t.down&&dist2(a,t)<2.35);
    if(downed){downed.down=false;downed.alive=true;downed.hp=Math.min(downed.maxHp,Math.max(35,downed.hp));downed.repairClock=game.time+3;showToast(`${downed.name} FIELD REPAIRED · ${Math.round(downed.hp)} HP`);updateHud();return;}
    if(near(a,game.exit,2.35)){
      if(!game.coreRestored){showToast('EXIT LOCKED · RESTORE THE NETWORK CORE FIRST');return;}
      winMission();return;
    }
    if(near(a,game.terminal,2.5)){
      terminalFound=true;
      if(!facilityCleared){showToast(`ACCESS DENIED · ${livingEnemies().length} HOSTILES REMAIN`);return;}
      if(!terminalActive){terminalActive=true;showToast('ACCESS TERMINAL SECURED · NETWORK CORE UNLOCKED');if(objectiveMeshes.termRing)objectiveMeshes.termRing.material.color.setHex(0x3dffad);updateHud();}
      else showToast('TERMINAL SECURE · PROCEED TO NETWORK CORE');
      return;
    }
    if(near(a,game.core,3.0)){
      if(!terminalActive){showToast('NETWORK CORE LOCKED · ACTIVATE THE TERMINAL');return;}
      if(!facilityCleared){showToast('CLEAR THE FACILITY BEFORE EXTRACTING');return;}
      if(!game.coreRestored){restoreNetworkCore();return;}
      showToast('NETWORK CORE RESTORED · PROCEED TO THE EXIT GATE');return;
    }
    if(near(a,game.g4,2.2)){if(!sectorExplored){sectorExplored=true;showToast('SECTOR G4 EXPLORED · SECONDARY OBJECTIVE COMPLETE');updateHud();}return;}
    if(a.type==='lilbit'&&repairCooldown<=game.time){const ally=closestTeammate(a,t=>t.hp<t.maxHp-1);if(ally&&dist2(a,ally)<4){ally.hp=Math.min(ally.maxHp,ally.hp+35);ally.down=false;ally.alive=true;repairCooldown=game.time+4;showToast(`FIELD REPAIR · ${ally.name} +35 HP`);updateHud();return;}}
    showToast('NO INTERACTION IN RANGE');
  }
  function updatePrompt() {
    const a=controlled();if(!a||!missionRunning)return;
    let text='';
    if(game.vehicle.driverId===a.id)text='E · EXIT TANK · W/A/S/D DRIVE · F/J FIRE';
    else if(dist2(a,game.vehicle)<3.1)text='E · ENTER ARMED TANK · W/A/S/D DRIVE';
    else if(actors.some(t=>t!==a&&t.down&&dist2(a,t)<2.35))text='E · FIELD REPAIR TEAMMATE';
    else if(near(a,game.exit,2.35))text=game.coreRestored?(missionIndex===5?'E · COMPLETE CAMPAIGN / EXTRACT':'E · EXIT TO MISSION '+MISSION_CAMPAIGN[missionIndex+1].code):'EXIT GATE LOCKED · RESTORE THE NETWORK CORE';
    else if(near(a,game.terminal,2.5))text=facilityCleared?'E · ACTIVATE ACCESS TERMINAL':'ACCESS TERMINAL · CLEAR FACILITY';
    else if(near(a,game.core,3))text=game.coreRestored?'NETWORK CORE RESTORED · REACH THE EXIT GATE':terminalActive?'E · ENTER NETWORK CORE':'NETWORK CORE LOCKED · ACTIVATE TERMINAL';
    else if(near(a,game.g4,2.2)&&!sectorExplored)text='E · SCAN SECTOR G4';
    else if(!lostTechFound&&near(a,game.lostTech,2.1))text='LOST TECH IN RANGE · WALK OVER TO COLLECT';
    else if(nearestLadder(a).distance<1.35)text='W / ↑ · CLIMB CATWALK';
    $('interactionPrompt').textContent=text;$('interactionPrompt').classList.toggle('hidden',!text);
  }

  // ---------- Combat: hitscan, splash, EMP, and simple enemy cover behavior ----------
  function getTargetInFront(a,range) {
    const candidates=livingEnemies().map(e=>({e,d:Math.hypot(e.x-a.x,e.z-a.z)+Math.abs((e.y||0)-(a.y||0))*.35})).filter(o=>o.d<=range);
    if(!candidates.length)return null;
    const front=candidates.filter(o=>{const dx=o.e.x-a.x,dz=o.e.z-a.z,mag=Math.hypot(dx,dz)||1;return (dx*a.dirX+dz*a.dirZ)/mag > -.18;});
    front.sort((u,v)=>u.d-v.d);return front[0]?.e||candidates.sort((u,v)=>u.d-v.d)[0].e;
  }
  function addBeam(from,to,color,life=.12,width=.035) {
    const beam={from:{x:from.x,y:from.y,z:from.z},to:{x:to.x,y:to.y,z:to.z},color,life,maxLife:life,width,object:null};
    if(can3D){const geom=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x,from.y,from.z),new THREE.Vector3(to.x,to.y,to.z)]);const line=new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:true,opacity:.95}));scene3D.add(line);beam.object=line;}
    beams.push(beam);
  }
  function impactSpark(x,y,z,color=0x52e8ff,scale=1) {
    const p={x,y,z,life:.34,maxLife:.34,color,scale,object:null};
    if(can3D){const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.16*scale,0),new THREE.MeshBasicMaterial({color,transparent:true,opacity:1}));mesh.position.set(x,y,z);scene3D.add(mesh);p.object=mesh;}
    particles.push(p);
  }
  function damageAlly(a, amount, source=0xff425d) {
    if(!a || !a.alive || a.down) return;
    amount=ENEMY_DAMAGE_PER_STRIKE;
    a.hp=Math.max(0,a.hp-amount);a.flash=.16;a.hitReactUntil=game.time+.18;a.recoil=Math.max(a.recoil||0,.18);
    impactSpark(a.x,a.y+1.05,a.z,source,Math.min(1.8,.8+amount*.025));
    if(a.hp<=0) {
      if(game.vehicle.driverId===a.id)exitBuggy(a);
      a.down=true;a.downAt=game.time;a.reviveProgress=0;a.vx=0;a.vz=0;
      showToast(`${a.name} DOWN · TEAMMATE REVIVE AVAILABLE`);
    }
    updateHud();
  }
  function damageEnemy(e,amount,source) {
    if(!e.alive || amount<=0) return;
    e.hp-=amount;e.flash=.16;e.hitReactUntil=game.time+(e.type==='mech'?.22:.15);e.recoil=Math.max(e.recoil||0,e.type==='mech'?.34:.22);game.hitCount++;
    if(e.combatState==='aim'&&e.variant!=='heavy'&&e.type!=='mech'&&Math.random()<.35){e.aimUntil=0;e.combatState='staggered';e.attackClock=Math.max(e.attackClock,game.time+.18);}
    impactSpark(e.x,e.y+(e.type==='mech'?2.1:e.type==='drone'?.05:.8),e.z,source||0x48e5ff,1.1);
    if(e.hp<=0){e.hp=0;e.alive=false;game.kills++;game.score+=e.type==='mech'?500:e.type==='drone'?140:100;
      // Non-gory cybernetic shutdown: a cluster of sparks and a short expanding pulse.
      const shutColor=e.type==='drone'?0x5dffaf:0xff536c;for(let i=0;i<4;i++)impactSpark(e.x+rand(-.34,.34),e.y+rand(.2,e.type==='mech'?2.9:1.9),e.z+rand(-.34,.34),shutColor,.68+Math.random()*.4);
      if(can3D){const ring=new THREE.Mesh(new THREE.TorusGeometry(e.type==='mech'?1.25:.48,.06,7,28),new THREE.MeshBasicMaterial({color:shutColor,transparent:true,opacity:.85}));ring.rotation.x=Math.PI/2;ring.position.set(e.x,.12,e.z);scene3D.add(ring);particles.push({object:ring,life:.42,maxLife:.42,expanding:true,color:shutColor});}
      showToast(`${e.type==='mech'?'ARMORED MECH':e.type==='drone'?'SURVEILLANCE DRONE':'ELITE SOLDIER'} DISABLED`);if(e.view)e.view.visible=false;
    }
  }
  function explodeAt(x,y,z,weapon,team='player') {
    const radius=weapon.splash||4;
    if(can3D){const burst=new THREE.Mesh(new THREE.SphereGeometry(radius,18,12),new THREE.MeshBasicMaterial({color:team==='enemy'?0xff405c:0xff8b39,transparent:true,opacity:.22,wireframe:true}));burst.position.set(x,y,z);scene3D.add(burst);particles.push({life:.35,maxLife:.35,object:burst,explosion:true,color:team==='enemy'?0xff405c:0xff8b39});}
    const damageAt=(d)=>team==='enemy'?Math.max(10,weapon.damage*(1-d/(radius+1.5))):weapon.damage;
    if(team!=='enemy') for(const e of livingEnemies()){const d=Math.hypot(e.x-x,e.z-z)+Math.abs((e.y||0)-y)*.35;if(d<=radius+1.2)damageEnemy(e,damageAt(d),0xffb452);}
    else for(const a of livingTeam()){const d=Math.hypot(a.x-x,a.z-z)+Math.abs((a.y||0)-y)*.25;if(d<radius+1)damageAlly(a,damageAt(d),0xff405c);}
    impactSpark(x,y,z,team==='enemy'?0xff405c:0xff9a48,2.6);
  }
  function spawnProjectile(from,to,weapon,team='player',targetActor=null,directDamage=0) {
    const distance=Math.hypot(to.x-from.x,to.z-from.z);
    const projectile={from:{...from},to:{...to},x:from.x,y:from.y,z:from.z,elapsed:0,duration:clamp(distance/(weapon.id==='enemyBolt'?22:18),.22,.95),arcHeight:weapon.id==='launcher'?Math.min(1.8,distance*.075):weapon.id==='enemyBolt'?.02:.24,weapon,team,targetActor,directDamage,object:null};
    if(can3D) {
      const color=team==='enemy'?0xff415c:weapon.id==='launcher'?0xffa64d:weapon.color||0x38dcff;
      const core=new THREE.Mesh(new THREE.SphereGeometry(weapon.id==='tankShell'?.22:weapon.id==='launcher'?.17:.075,10,8),mat(color,.35,.15,color,1.4));
      core.position.set(from.x,from.y,from.z);scene3D.add(core);projectile.object=core;
      if(weapon.id==='launcher'||weapon.id==='tankShell'){const halo=new THREE.Mesh(new THREE.TorusGeometry(weapon.id==='tankShell'?.3:.22,.028,6,16),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85}));halo.rotation.x=Math.PI/2;core.add(halo);}
    }
    projectiles.push(projectile);
  }
  function updateProjectiles(dt) {
    for(let i=projectiles.length-1;i>=0;i--) {
      const p=projectiles[i],previous={x:p.x,y:p.y,z:p.z};p.elapsed+=dt;const t=clamp(p.elapsed/p.duration,0,1);
      p.x=p.from.x+(p.to.x-p.from.x)*t;p.z=p.from.z+(p.to.z-p.from.z)*t;p.y=p.from.y+(p.to.y-p.from.y)*t+Math.sin(t*Math.PI)*p.arcHeight;
      if(can3D&&Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z)>.025)addBeam(previous,{x:p.x,y:p.y,z:p.z},p.team==='enemy'?0xff405c:p.weapon.id==='launcher'?0xffa64d:(p.weapon.color||0x38e5ff),.085,p.weapon.id==='tankShell'?.14:p.weapon.id==='launcher'?.04:.022);
      if(p.object)p.object.position.set(p.x,p.y,p.z);
      if(t>=1) {
        if(p.targetActor){
          if(p.targetActor.alive&&!p.targetActor.down)damageAlly(p.targetActor,p.directDamage||6,0xff526b);
          impactSpark(p.to.x,p.to.y,p.to.z,0xff526b,.72);
        } else explodeAt(p.to.x,p.to.y,p.to.z,p.weapon,p.team);
        if(p.object){scene3D.remove(p.object);p.object.traverse?.(o=>{o.geometry?.dispose();o.material?.dispose();});}projectiles.splice(i,1);
      }
    }
  }
  function fireWeapon(a,weapon,fromPlayer=false) {
    if(!a||!a.alive||a.down)return;
    if(!fromPlayer&&a.attackClock>game.time)return;
    if(!consumeAmmo(a,weapon)) { if(fromPlayer)a.lastShot=game.time+.25;return; }
    let target=fromPlayer?getTargetInFront(a,weapon.range):closestVisibleEnemy(a,weapon.range);
    const origin={x:a.x+(a.dirX||0)*.42,y:a.y+(a.type==='drone'?.2:1.28),z:a.z+(a.dirZ||0)*.42};
    let end=target?{x:target.x,y:target.y+(target.type==='mech'?2:target.type==='drone'?.25:.95),z:target.z}:{x:a.x+(a.dirX||0)*weapon.range*.72,y:origin.y,z:a.z+(a.dirZ||-1)*weapon.range*.72};
    const blocker=target?findBlockingCover(origin,end):null;
    if(blocker){end={x:blocker.x,y:Math.min(blocker.y+.45,blocker.cover.h-.08),z:blocker.z};target=null;impactSpark(end.x,end.y,end.z,0xffbd67,.8);}
    // Short muzzle flash and weapon kick make shots readable in the world without touching the HUD.
    a.firingUntil = game.time + (weapon.id === 'launcher' ? .22 : weapon.id === 'spread' ? .14 : .095);
    a.aimUntil = game.time + .16; a.combatState = 'fire';
    a.recoil = Math.max(a.recoil || 0, weapon.id === 'launcher' ? .82 : weapon.id === 'spread' ? .29 : .22);
    impactSpark(origin.x+(a.dirX||0)*.46,origin.y,origin.z+(a.dirZ||0)*.46,weapon.id==='launcher'?0xffa64d:(weapon.color||0x38e5ff),.42);
    if(weapon.id==='launcher') {
      spawnProjectile(origin,end,weapon,a.isEnemy?'enemy':'player');
    } else if(weapon.id==='spread') {
      const dx=a.dirX||0,dz=a.dirZ||-1;
      const hits=livingEnemies().map(e=>({e,d:Math.hypot(e.x-a.x,e.z-a.z)}))
        .filter(o=>o.d<=weapon.range&&o.d>0&&((o.e.x-a.x)*dx+(o.e.z-a.z)*dz)/o.d>.72&&visibleFrom(a,o.e))
        .sort((u,v)=>u.d-v.d).slice(0,3);
      if(hits.length){
        for(const {e} of hits){const hit={x:e.x,y:e.y+(e.type==='mech'?2:e.type==='drone'?.25:.95),z:e.z};addBeam(origin,hit,weapon.color,.16,.045);damageEnemy(e,weapon.damage,weapon.color);}
      }else addBeam(origin,end,weapon.color,.16,.045);
    } else {
      addBeam(origin,end,weapon.color,.1,.028);
      if(target)damageEnemy(target,weapon.damage,weapon.color);
      else if(blocker) impactSpark(end.x,end.y,end.z,weapon.color,.5);
    }
    if(fromPlayer){game.lastFire=game.time;}
    else a.attackClock=game.time+(a.type==='bubba'?1.4:a.type==='mech'?1.8:a.type==='drone'?1.45:1.15)+Math.random()*.25;
  }
  function useEmp(a) {
    if(empCooldown>game.time){showToast(`EMP RECHARGING · ${Math.ceil(empCooldown-game.time)}s`);return;}
    const center={x:a.x+a.dirX*4,y:a.y+1,z:a.z+a.dirZ*4};
    for(const e of livingEnemies()){if(e.type==='drone'&&Math.hypot(e.x-center.x,e.z-center.z)<9)e.empUntil=game.time+6;}
    if(can3D){const pulse=new THREE.Mesh(new THREE.TorusGeometry(.8,.075,8,48),new THREE.MeshBasicMaterial({color:0x5df8ff,transparent:true,opacity:.9}));pulse.rotation.x=Math.PI/2;pulse.position.set(center.x,.1,center.z);scene3D.add(pulse);particles.push({object:pulse,life:.55,maxLife:.55,expanding:true,color:0x5df8ff});}
    for(const e of livingEnemies()){if(e.type!=='drone'&&Math.hypot(e.x-center.x,e.z-center.z)<5.5)e.empUntil=game.time+2.4;}
    empCooldown=game.time+7;showToast('EMP PULSE · DRONES / SHIELDS DISABLED');
  }
  function useDash(a) {
    if(dashCooldown>game.time){showToast(`TACTICAL DASH · ${Math.ceil(dashCooldown-game.time)}s`);return;}
    a.dashUntil=game.time+.45;dashCooldown=game.time+2.8;impactSpark(a.x,a.y+1,a.z,0x44dfff,1.5);showToast('TACTICAL DASH');
  }
  function hostileTarget(e) {
    // The mech pressures JJ; soldiers and drones prefer a reachable, living squadmate.
    if(e.type==='mech'){const lead=teamById('operator');if(lead&&lead.alive&&!lead.down)return lead;}
    let best=null,bd=Infinity;
    for(const a of livingTeam()){const d=Math.hypot(a.x-e.x,a.z-e.z)+Math.abs((a.y||0)-(e.y||0))*.35;if(d<bd){bd=d;best=a;}}
    return best;
  }
  function enemyUpdate(e,dt) {
    if(!e.alive||e.down)return;
    if(e.flash>0)e.flash=Math.max(0,e.flash-dt);
    e.anim=(e.anim||0)+dt*(.75+Math.hypot(e.vx||0,e.vz||0)*.62);
    if(e.empUntil>game.time){
      e.combatState='emp';e.aimUntil=0;e.aimTargetId=null;
      if(e.type==='drone')e.y=2.15+Math.sin(game.time*4+e.x)*.045;
      e.vx=0;e.vz=0;return;
    }
    const t=hostileTarget(e);if(!t){e.combatState='idle';e.aimUntil=0;return;}
    const dx=t.x-e.x,dz=t.z-e.z,d=Math.hypot(dx,dz),mag=d||1;
    e.dirX=dx/mag;e.dirZ=dz/mag;
    const origin={x:e.x+e.dirX*(e.type==='mech'?.86:.35),y:e.y+(e.type==='mech'?2.35:e.type==='drone'?.04:1.16),z:e.z+e.dirZ*(e.type==='mech'?.86:.35)};
    const aim={x:t.x,y:t.y+1.03,z:t.z};
    const blocker=findBlockingCover(origin,aim),hasLOS=!blocker;
    const variant=e.variant||'raider';
    let preferred=variant==='recon'?11.5:variant==='marksman'?13.6:variant==='breacher'?4.7:variant==='heavy'?9.4:8.0;
    if(e.type==='drone')preferred=8.2;
    if(e.type==='mech')preferred=9.8;

    // Each class has a distinct movement loop instead of sharing one generic chase.
    if(e.type==='drone') {
      const orbitSign=e.strafeSign||1;
      if(d>preferred+2.1)moveActor(e,dx,dz,dt*.9,true);
      else if(d<preferred-1.7)moveActor(e,-dx,-dz,dt*.62,true);
      else moveActor(e,-dz*orbitSign,dx*orbitSign,dt*.56,true);
      e.y=2.22+Math.sin(game.time*2.5+(e.x||0))*.42;
      if(game.time>=(e.nextStrafeAt||0)){e.strafeSign=-orbitSign;e.nextStrafeAt=game.time+rand(1.8,2.8);}
    } else if(e.type==='mech') {
      if(d>preferred+2.4)moveActor(e,dx,dz,dt*.64,true);
      else if(d<7.4)moveActor(e,-dx,-dz,dt*.36,true);
      // Heavy chassis has a slow lateral adjustment, not a soldier-like sidestep.
      if(game.time>=(e.nextStrafeAt||0)){e.strafeSign=Math.random()<.5?-1:1;e.nextStrafeAt=game.time+rand(2.7,4.1);}
      if(d>7&&d<preferred+2.3&&hasLOS)moveActor(e,-dz*(e.strafeSign||1),dx*(e.strafeSign||1),dt*.18,true);
    } else if(variant==='breacher') {
      // Breachers commit to a fast close-range push and keep pressure through cover gaps.
      if(!hasLOS){moveActor(e,dx/mag*.52-dz/mag*(e.strafeSign||1),dz/mag*.52+dx/mag*(e.strafeSign||1),dt*1.35,true);e.combatState='flank';e.aimUntil=0;}
      else if(d>5.4){moveActor(e,dx,dz,dt*1.25,true);e.combatState='charge';e.aimUntil=0;}
      else if(d<3.2)moveActor(e,-dx,-dz,dt*.3,true);
    } else if(variant==='recon') {
      // Recon keeps distance, makes short lateral relocations, then tags exposed targets.
      if(d>preferred+2.0)moveActor(e,dx,dz,dt*.78,true);
      else if(d<8.8)moveActor(e,-dx,-dz,dt*.66,true);
      if(game.time>=(e.nextStrafeAt||0)){e.strafeSign=Math.random()<.5?-1:1;e.nextStrafeAt=game.time+rand(1.2,2.0);}
      if(d<preferred+1.8)moveActor(e,-dz*(e.strafeSign||1),dx*(e.strafeSign||1),dt*.46,true);
    } else if(variant==='marksman') {
      // Marksman backs off when pressured and repositions laterally if cover blocks its lane.
      if(d<9.5)moveActor(e,-dx,-dz,dt*.78,true);
      else if(d>15.5)moveActor(e,dx,dz,dt*.55,true);
      if(!hasLOS||d<preferred-1.8){
        const sign=e.strafeSign||1;moveActor(e,-dz*sign,dx*sign,dt*.74,true);
        if(game.time>=(e.nextStrafeAt||0)){e.strafeSign=-sign;e.nextStrafeAt=game.time+rand(1.8,2.7);}
      }
    } else if(variant==='heavy') {
      // Heavy advances deliberately; close to the target it braces for an explosive shot.
      if(!hasLOS){const sign=e.strafeSign||1;moveActor(e,dx/mag*.25-dz/mag*sign,dz/mag*.25+dx/mag*sign,dt*.72,true);e.combatState='flank';e.aimUntil=0;}
      else if(d>preferred+1.5)moveActor(e,dx,dz,dt*.62,true);
      else if(d<6.7)moveActor(e,-dx,-dz,dt*.3,true);
    } else {
      // Standard raiders push, strafe, and use a small flank when the shot lane is blocked.
      if(!hasLOS){const sign=e.strafeSign||1;moveActor(e,dx/mag*.3-dz/mag*sign,dz/mag*.3+dx/mag*sign,dt*.95,true);e.combatState='flank';e.aimUntil=0;}
      else if(d>preferred+2.1)moveActor(e,dx,dz,dt*.88,true);
      else if(d<preferred-1.4)moveActor(e,-dx,-dz,dt*.34,true);
      else {
        if(game.time>=(e.nextStrafeAt||0)){e.strafeSign=Math.random()<.5?-1:1;e.nextStrafeAt=game.time+rand(1.4,2.5);}
        moveActor(e,-dz*(e.strafeSign||1),dx*(e.strafeSign||1),dt*.3,true);
      }
    }

    const maxRange=e.type==='mech'?16:e.type==='drone'?12:variant==='breacher'?7.4:variant==='marksman'?21:variant==='heavy'?15:16;
    const canAttack=d<maxRange;
    if(!canAttack||!hasLOS){
      if(!(e.combatState==='charge'||e.combatState==='flank'))e.combatState='advance';
      e.aimUntil=0;e.aimTargetId=null;
      if(blocker&&e.type!=='drone'&&e.type!=='mech'){
        // Brief hostile tracers striking the crate communicate why the target is protected.
        if(d<15&&game.time>=(e.nextCoverShot||0)){addBeam(origin,{x:blocker.x,y:Math.max(.45,blocker.y-.12),z:blocker.z},0xff5268,.09,.02);impactSpark(blocker.x,Math.max(.5,blocker.y-.08),blocker.z,0xff795d,.45);e.nextCoverShot=game.time+.8;}
      }
      if(e.type!=='drone')updateVertical(e,dt);return;
    }

    if(e.aimUntil>0&&game.time>=e.aimUntil) {
      // Resolve the shot after the wind-up so players can read and react to attacks.
      e.aimUntil=0;e.aimTargetId=null;e.combatState='fire';e.firingUntil=game.time+(e.type==='mech'?.28:variant==='heavy'?.22:.12);
      e.recoil=e.type==='mech'?.8:variant==='heavy'?.48:variant==='breacher'?.28:.18;
      if(e.type==='mech'||variant==='heavy') {
        const weapon=e.type==='mech'
          ? {id:'launcher',name:'MECH CANNON',damage:ENEMY_DAMAGE_PER_STRIKE,rate:2.3,range:18,splash:3.25,color:0xff6b4d}
          : {id:'launcher',name:'HEAVY ROCKET',damage:ENEMY_DAMAGE_PER_STRIKE,rate:2.0,range:16,splash:2.5,color:0xffb84d};
        const cannonOrigin={x:e.x+e.dirX*(e.type==='mech'?1.05:.48),y:e.y+(e.type==='mech'?2.35:1.62),z:e.z+e.dirZ*(e.type==='mech'?1.05:.48)};
        spawnProjectile(cannonOrigin,{x:t.x,y:t.y+1.0,z:t.z},weapon,'enemy');
        impactSpark(cannonOrigin.x,cannonOrigin.y,cannonOrigin.z,weapon.color,1.15);
        e.attackClock=game.time+(e.type==='mech'?2.2:2.45)+rand(0,.3);
      } else if(e.type==='drone') {
        const bolt={id:'enemyBolt',name:'SENTINEL PULSE',damage:ENEMY_DAMAGE_PER_STRIKE,rate:1.2,range:12,splash:0,color:0xff526b};
        spawnProjectile(origin,{x:t.x,y:t.y+1.04,z:t.z},bolt,'enemy',t,ENEMY_DAMAGE_PER_STRIKE);
        e.attackClock=game.time+1.25+rand(0,.24);
      } else {
        const accuracy=variant==='marksman'?.84:variant==='recon'?.7:variant==='breacher'?.54:variant==='heavy'?.62:.57;
        const damage=ENEMY_DAMAGE_PER_STRIKE;
        const nearCover=coverObjects.some(o=>{const nx=clamp(t.x,o.x-o.w/2,o.x+o.w/2),nz=clamp(t.z,o.z-o.d/2,o.z+o.d/2);return Math.hypot(t.x-nx,t.z-nz)<1.05;});
        const coverBonus=nearCover?.26:0;
        addBeam(origin,aim,variant==='marksman'?0x84edff:variant==='recon'?0xc5ff62:variant==='breacher'?0xff7653:0xff405c,.14,variant==='marksman'?.026:.035);
        if(Math.random()<accuracy-coverBonus){
          damageAlly(t,damage,variant==='heavy'?0xffc24d:variant==='breacher'?0xff7653:0xff405c);
        } else impactSpark(t.x,t.y+1,t.z,variant==='recon'?0xc5ff62:0xff405c,.62);
        e.attackClock=game.time+(variant==='marksman'?1.85:variant==='recon'?1.05:variant==='breacher'?.92:1.28)+rand(0,.28);
      }
      if(e.type!=='drone')updateVertical(e,dt);return;
    }
    if(e.aimUntil>game.time) {
      e.combatState=(e.type==='mech'||variant==='heavy')?'windup':'aim';
      // Marksman laser/designator and cannon charge glow provide fair attack telegraphs.
      if(variant==='marksman'&&game.time>=(e.nextAimFx||0)){
        addBeam({x:e.x,y:e.y+1.35,z:e.z},aim,0x75e8ff,.12,.012);e.nextAimFx=game.time+.11;
      }
      if((e.type==='mech'||variant==='heavy')&&game.time>=(e.nextAimFx||0)){
        impactSpark(origin.x,origin.y,origin.z,e.type==='mech'?0xff6e48:0xffc24d,.45);e.nextAimFx=game.time+.22;
      }
      if(e.type!=='drone')updateVertical(e,dt);return;
    }
    if(game.time>=e.attackClock) {
      // Wind-up length communicates threat class. Breachers are fast; heavy units telegraph more.
      const windup=e.type==='mech'?.92:variant==='heavy'?.72:variant==='marksman'?.63:variant==='recon'?.24:variant==='breacher'?.14:.34;
      e.aimUntil=game.time+windup;e.aimTargetId=t.id;e.combatState=(e.type==='mech'||variant==='heavy')?'windup':'aim';
    } else if(!['charge','flank'].includes(e.combatState)) e.combatState='advance';
    if(e.type!=='drone')updateVertical(e,dt);
  }
  function chooseLilBitGoal(a) {
    const ladder=nearestLadder(a);
    if(a.y<2.65) return {x:ladder.ladder.x,z:ladder.ladder.z,y:ladder.ladder.top,ladder:ladder.ladder};
    const target=closestEnemy(a,17);
    if(target){let x=clamp(target.x-3,-17,17);return {x,z:-8.1,y:3.15};}
    const p=controlled();if(p&&dist2(a,p)>11)return {x:p.x,z:-8.1,y:3.15};
    return {x:-5.4,z:-8.1,y:3.15};
  }
  function allyUpdate(a,dt) {
    if(!a.alive||a.down)return;
    if(a.flash>0)a.flash-=dt;
    const isControlled=a.id===game.selected;
    if(isControlled){handlePlayerInput(a,dt);return;}

    // Rescue the nearest downed teammate before returning to each ally's combat role.
    const downed=actors.filter(t=>t!==a&&t.alive&&t.down).sort((u,v)=>dist2(a,u)-dist2(a,v))[0];
    if(downed) {
      // Automatic revive is assigned to the nearest AI teammate; the player can still press E directly.
      const helper=actors.filter(t=>t!==downed&&t.alive&&!t.down&&t.id!==game.selected).sort((u,v)=>dist2(u,downed)-dist2(v,downed))[0]||null;
      if(helper===a) {
        const d=dist2(a,downed);
        if(d>1.85) { moveActor(a,downed.x-a.x,downed.z-a.z,dt*1.12,true);updateVertical(a,dt);return; }
        downed.reviveProgress=(downed.reviveProgress||0)+dt;
        if(downed.reviveProgress>=1.05) {downed.down=false;downed.alive=true;downed.hp=Math.max(38,Math.round(downed.maxHp*.38));downed.reviveProgress=0;downed.repairClock=game.time+5;showToast(`${a.name} REVIVED ${downed.name}`);updateHud();}
        updateVertical(a,dt);return;
      }
    }

    const target=closestVisibleEnemy(a,a.type==='bubba'?19:a.type==='lilbit'?19:16);
    if(a.type==='lilbit') {
      // Once on a ladder, finish the climb before evaluating a new tactical waypoint.
      // This prevents the high-ground goal from changing mid-climb and leaving her suspended.
      if(a.climbing&&a.climbLadder) {
        updateClimb(a,dt,true,false);
      } else {
        const goal=chooseLilBitGoal(a);
        if(a.y<goal.y-.15) {
          const dx=goal.x-a.x,dz=goal.z-a.z;
          if(Math.hypot(dx,dz)>1.1)moveActor(a,dx,dz,dt*.92,true);
          else if(goal.ladder&&Math.hypot(a.x-goal.ladder.x,a.z-goal.ladder.z)<1.2){startClimb(a,goal.ladder);updateClimb(a,dt,true,false);}
        } else {
          a.y=goal.y;
          if(Math.hypot(a.x-goal.x,a.z-goal.z)>1.7)moveActor(a,goal.x-a.x,goal.z-a.z,dt*.78,true);
          else if(!target){const lead=controlled();if(dist2(a,lead)>17)moveActor(a,lead.x-a.x,lead.z-a.z,dt*.85,true);}
        }
      }
      if(target&&Math.hypot(a.x-target.x,a.z-target.z)<19) {
        const dx=target.x-a.x,dz=target.z-a.z,m=Math.hypot(dx,dz)||1;a.dirX=dx/m;a.dirZ=dz/m;
        if(game.time>=a.attackClock)fireWeapon(a,WEAPONS[1],false);
      }
    } else if(a.type==='bubba') {
      if(target) {
        const d=dist2(a,target),dx=target.x-a.x,dz=target.z-a.z,m=Math.hypot(dx,dz)||1;
        if(d>7.4)moveActor(a,dx,dz,dt*1.08,true);
        else if(d<5.4)moveActor(a,-dx,-dz,dt*.5,true); // step back to give the rocket blast room
        a.dirX=dx/m;a.dirZ=dz/m;
        if(d<19&&game.time>=a.attackClock)fireWeapon(a,{...WEAPONS[2],ammoKey:'launcher',clip:4,reserve:24},false);
      } else {const p=controlled();if(p&&dist2(a,p)>4.3)moveActor(a,p.x-a.x,p.z-a.z,dt,true);}
    } else {
      const p=controlled();
      if(target) {
        const dx=target.x-a.x,dz=target.z-a.z,m=Math.hypot(dx,dz)||1,d=dist2(a,target);
        a.dirX=dx/m;a.dirZ=dz/m;
        if(d>8.4)moveActor(a,dx,dz,dt*.6,true);
        else if(d<6.0)moveActor(a,-dx,-dz,dt*.42,true);
        if(game.time>=a.attackClock)fireWeapon(a,WEAPONS[1],false);
      }
      if(p&&dist2(a,p)>5.8)moveActor(a,p.x-a.x,p.z-a.z,dt,true);
    }
    updateVertical(a,dt);
    // Lil Bit's EMP specialist support: suppress nearby drones automatically when she is AI-controlled.
    if(a.type==='lilbit'&&target&&target.type==='drone'&&dist2(a,target)<6&&game.time>(a.empAiCooldown||0)) {
      target.empUntil=game.time+3.6;a.empAiCooldown=game.time+10;showToast('LIL BIT · DRONE EMP SUPPRESSED');
      if(can3D){const pulse=new THREE.Mesh(new THREE.TorusGeometry(.55,.045,7,28),new THREE.MeshBasicMaterial({color:0x53efff,transparent:true,opacity:.8}));pulse.rotation.x=Math.PI/2;pulse.position.set(target.x,.12,target.z);scene3D.add(pulse);particles.push({object:pulse,life:.45,maxLife:.45,expanding:true,color:0x53efff});}
    }
  }
  function updateFacilityState() {
    if(!facilityCleared&&livingEnemies().length===0){facilityCleared=true;showToast('FACILITY CLEARED · ACCESS TERMINAL AVAILABLE');}
    if(!terminalActive&&near(controlled(),game.terminal,2.5))terminalFound=true;
    if(!sectorExplored&&near(controlled(),game.g4,2.0))sectorExplored=true;
    if(!lostTechFound&&near(controlled(),game.lostTech,1.65)) {lostTechFound=true;game.lostTech.taken=true;game.score+=250;showToast('LOST TECH RECOVERED · +250 SCORE');if(objectiveMeshes.lostTech)objectiveMeshes.lostTech.visible=false;}
    const player=controlled();if(player&&player.hp<=0&&!player.down){player.hp=0;player.down=true;showToast(`${player.name} DOWN · SQUAD REVIVE INCOMING`);player.downAt=game.time;}
    // A squadmate has a short window to reach a downed lead and revive them.
    const p=controlled();if(p&&p.down){const reviver=actors.find(a=>a!==p&&a.alive&&!a.down&&dist2(a,p)<2.0);if(reviver&&game.time-p.downAt>1.2){p.down=false;p.alive=true;p.hp=32;showToast(`${p.name} REVIVED BY ${reviver.name}`);}}
    if(actors.filter(a=>a.alive&&!a.down).length===0)endMission(false);
    updateHud();updatePrompt();
  }

  // ---------- 3D visual sync and isometric fallback renderer ----------
  function updateVisuals(dt) {
    if(can3D){
      for(const a of actors){
        if(!a.view)continue;
        const view=a.view, detail=view.userData||{};
        const velocity=Math.hypot(a.vx||0,a.vz||0), moving=Math.min(1,velocity/(a.type==='bubba'?3.7:3.0));
        const gaitRate=a.type==='lilbit'?3.35:a.type==='bubba'?1.72:2.55;
        const phase=(game.time*gaitRate)+(detail.animOffset||0)+(a.anim||0)*.22;
        const airborne=!a.climbing&&a.y>surfaceAt(a.x,a.z,a.y)+.22;
        const firing=!!(a.firingUntil&&a.firingUntil>game.time), aiming=firing||!!(a.aimUntil&&a.aimUntil>game.time);
        const hitReact=!!(a.hitReactUntil&&a.hitReactUntil>game.time);
        if(!aiming&&a.combatState==='fire')a.combatState=velocity>.35?'move':'idle';
        view.visible=(a.alive||a.down)&&!a.inVehicle;
        // Distinct gait: Lil Bit is light and quick, Bubba carries momentum, JJ stays balanced.
        const bob=airborne?0:Math.abs(Math.sin(phase))*(a.type==='bubba'?.022:.042)*moving;
        const idleBreath=Math.sin(game.time*1.8+(detail.animOffset||0))*.012*(1-moving);
        view.position.set(a.x,a.y+(a.down?-.2:bob+idleBreath),a.z);
        view.rotation.y=Math.atan2(a.dirX,a.dirZ);
        view.rotation.x=a.down?0:a.climbing?-.2:airborne?(a.type==='lilbit'?.14:-.09):aiming?(a.type==='bubba'?.035:-.035)+((a.recoil||0)*.018):Math.sin(phase)*.025*moving;
        const lateral=(a.vx||0)*(a.dirZ||1)-(a.vz||0)*(a.dirX||0);
        view.rotation.z=a.down?.9:clamp(-lateral*(a.type==='lilbit'?.018:.012),-.14,.14)+(a.dashUntil>game.time?-.075:0)+(hitReact?Math.sin(game.time*48)*.035:0);
        const base=a.baseScale||{x:1,y:1,z:1},pulse=a.flash>0?1.035:1;
        view.scale.set(base.x*pulse,base.y*pulse,base.z*pulse);
        if(detail.legs)detail.legs.forEach((leg,i)=>{
          const swing=Math.sin(phase+(i*Math.PI));
          const gait=a.type==='bubba'?.46:a.type==='lilbit'?.82:.64;
          leg.rotation.x=a.down?1.05:a.climbing?swing*.58:airborne?(i===0?-.43:.48):swing*gait*moving;
          if(a.type==='bubba'&&!airborne&&!a.climbing)leg.rotation.z=(i===0?-.025:.025)*moving;
        });
        if(detail.arms)detail.arms.forEach((arm,i)=>{
          const swing=Math.sin(phase+(i*Math.PI));
          if(a.down){arm.rotation.x=-.52;arm.rotation.z=i===0?-.22:.2;}
          else if(a.climbing){arm.rotation.x=-.26+swing*.56;arm.rotation.z=i===0?-.34:.32;}
          else if(airborne){arm.rotation.x=-.58+(i===0?-.12:.1);arm.rotation.z=i===0?-.12:.12;}
          else if(aiming){
            const brace=a.type==='bubba'?.42:a.type==='lilbit'?.36:.31;
            arm.rotation.x=-brace-(firing?(a.recoil||0)*.18:0)+(hitReact?.08:0);
            arm.rotation.z=(i===0?-.08:.075)+(firing?(i===0?-.035:.035):0);
          } else {
            arm.rotation.x=-.08+swing*.2*moving;
            arm.rotation.z=swing*.11*moving*(i===0?-1:1);
          }
        });
        if(detail.weaponRig&&detail.weaponHome){
          const home=detail.weaponHome;
          const kick=firing?(a.recoil||.18):Math.max(0,(a.recoil||0)*.72);
          detail.weaponRig.position.set(home.x,home.y,home.z-kick*(a.type==='bubba'?.19:.31));
          detail.weaponRig.rotation.x=(firing?-kick*(a.type==='bubba'?.12:.075):0);
        }
        a.recoil=Math.max(0,(a.recoil||0)-dt*(firing?1.8:2.7));
        if(detail.muzzleFlash){detail.muzzleFlash.visible=firing;if(firing&&detail.muzzleFlash.scale)detail.muzzleFlash.scale.setScalar(.8+Math.random()*.65);}
        if(detail.muzzleLight)detail.muzzleLight.intensity=firing?(a.type==='bubba'?3.8:2.0):0;
        if(detail.rocketTube&&detail.rocketTubeHome){detail.rocketTube.position.z=detail.rocketTubeHome.z-(firing?(a.recoil||.6)*.12:0);}
        if(detail.rocketFlash)detail.rocketFlash.visible=firing;
        if(detail.eye&&detail.eye.material&&detail.eye.material.emissive)detail.eye.material.emissiveIntensity=.4+Math.sin(game.time*4+a.x)*.25;
        if(a.healthBar){a.healthBar.visible=a.hp<a.maxHp||a.down;const fill=a.healthBar.userData.fill;fill.scale.x=clamp(a.hp/a.maxHp,0,1);fill.position.x=-(a.healthBar.userData.width*(1-clamp(a.hp/a.maxHp,0,1)))/2;}
      }
      for(const e of enemies){
        if(!e.view)continue;
        const view=e.view, detail=view.userData||{};
        const velocity=Math.hypot(e.vx||0,e.vz||0),moving=Math.min(1,velocity/(e.variant==='breacher'?3.4:e.type==='mech'?2.0:2.75));
        e.anim=(e.anim||0)+dt*(.65+velocity*.46);
        const gaitRate=e.variant==='breacher'?3.2:e.variant==='recon'?2.6:e.variant==='heavy'?1.55:e.variant==='marksman'?1.7:2.35;
        const phase=game.time*gaitRate+(detail.animOffset||0)+(e.anim||0)*.2;
        const aiming=['aim','windup','fire'].includes(e.combatState),firing=!!(e.firingUntil&&e.firingUntil>game.time),charging=e.combatState==='windup';
        const hitReact=!!(e.hitReactUntil&&e.hitReactUntil>game.time);
        view.visible=e.alive;
        const hover=e.type==='drone'?Math.sin(game.time*3.7+(detail.animOffset||0))*(e.combatState==='fire'?.1:.065):0;
        const crouch=e.variant==='recon'&&aiming?-.12:e.variant==='marksman'&&aiming?-.08:e.variant==='breacher'&&e.combatState==='charge'?.04:0;
        view.position.set(e.x,e.y+hover+crouch+(e.type==='mech'?Math.abs(Math.sin(phase))*.025*moving:0),e.z);
        view.rotation.y=Math.atan2(e.dirX,e.dirZ);
        view.rotation.x=e.type==='mech'?(charging?-.025:Math.sin(phase)*.018*moving):charging?-.07:e.variant==='breacher'&&e.combatState==='charge'?-.11:aiming?-.025:Math.sin(phase)*.018*moving;
        view.rotation.z=e.type==='mech'?Math.sin(phase*.5)*.018*moving:clamp(-(e.vx||0)*.009,-.1,.1)+(hitReact?Math.sin(game.time*52)*.055:0);
        if(detail.rotors)detail.rotors.forEach((rotor,i)=>{rotor.rotation.y+=dt*(i%2?-23:23)*(e.empUntil>game.time?.15:1);});
        if(detail.legs)detail.legs.forEach((leg,i)=>{
          const amp=e.type==='mech'?.42:e.variant==='breacher'?.7:e.variant==='heavy'?.35:e.variant==='marksman'?.32:.54;
          leg.rotation.x=aiming&&!moving?(i===0?.04:-.04):Math.sin(phase+i*Math.PI)*amp*moving;
        });
        if(detail.arms)detail.arms.forEach((arm,i)=>{
          if(e.type==='mech'){
            arm.rotation.x=charging?-.18:firing?-.32:Math.sin(phase+i*Math.PI)*.07*moving;
            arm.rotation.z=(i===0?-.03:.03)+(firing?(i===0?-.1:.08):0);
          } else if(aiming){arm.rotation.x=-.3-(firing?(e.recoil||0)*.17:0);arm.rotation.z=i===0?-.06:.06;}
          else {arm.rotation.x=Math.sin(phase+i*Math.PI)*(.05+moving*(e.variant==='breacher'?.26:.14));arm.rotation.z=Math.sin(phase+i*Math.PI)*.06*moving;}
        });
        if(detail.weaponRig&&detail.weaponHome){const home=detail.weaponHome;const kick=firing?(e.recoil||.18):Math.max(0,(e.recoil||0)*.7);detail.weaponRig.position.set(home.x,home.y,home.z-kick*(e.variant==='heavy'?.23:.28));detail.weaponRig.rotation.x=charging?-.055:firing?-kick*.06:0;}
        if(detail.rocketTube&&detail.rocketTubeHome)detail.rocketTube.position.z=detail.rocketTubeHome.z-(firing?(e.recoil||.55)*.1:0);
        if(detail.eye&&detail.eye.material&&detail.eye.material.emissive)detail.eye.material.emissiveIntensity=(e.combatState==='windup'?1.8:.72)+Math.sin(game.time*5.2+(e.x||0))*.35;
        if(detail.searchLight)detail.searchLight.visible=e.type==='drone'&&e.empUntil<=game.time;
        if(detail.muzzleFlash){detail.muzzleFlash.visible=firing;if(firing&&detail.muzzleFlash.scale)detail.muzzleFlash.scale.setScalar(.8+Math.random()*.55);}
        if(detail.muzzleLight)detail.muzzleLight.intensity=firing?2.1:0;
        if(detail.cannonMuzzle){detail.cannonMuzzle.material.emissiveIntensity=charging?1.6:firing?2.8:.2;}
        if(e.healthBar){e.healthBar.visible=e.alive;const fill=e.healthBar.userData.fill;fill.scale.x=clamp(e.hp/e.maxHp,0,1);fill.position.x=-(e.healthBar.userData.width*(1-clamp(e.hp/e.maxHp,0,1)))/2;}
      }
      if(objectiveMeshes.termRing)objectiveMeshes.termRing.rotation.z+=dt*.18;
      if(objectiveMeshes.core)objectiveMeshes.core.rotation.y+=dt*.65;
      if(objectiveMeshes.coreRing)objectiveMeshes.coreRing.rotation.z-=dt*.24;
      if(objectiveMeshes.g4)objectiveMeshes.g4.rotation.z+=dt*.15;
      if(objectiveMeshes.lostTech&&objectiveMeshes.lostTech.visible)objectiveMeshes.lostTech.rotation.y+=dt*1.4;
      if(objectiveMeshes.exit?.userData){
        const gate=objectiveMeshes.exit,open=game.coreRestored?1:0;
        if(gate.userData.left)gate.userData.left.position.x+=( -.76-open*.72-gate.userData.left.position.x)*Math.min(1,dt*3.2);
        if(gate.userData.right)gate.userData.right.position.x+=( .76+open*.72-gate.userData.right.position.x)*Math.min(1,dt*3.2);
        const signal=gate.userData.signal?.material;
        if(signal){const color=game.coreRestored?0x43f0a7:0xff4658;signal.color.setHex(color);signal.emissive.setHex(game.coreRestored?0x0bbd75:0xff152c);}
      }
      if(buggyMesh){buggyMesh.position.set(game.vehicle.x,0,game.vehicle.z);buggyMesh.rotation.y=game.vehicle.angle;}
      if(buggyMuzzleFlash)buggyMuzzleFlash.visible=game.vehicle.firingUntil>game.time;
    }
    beams=beams.filter(b=>{b.life-=dt;if(b.object){b.object.material.opacity=clamp(b.life/b.maxLife,0,1);if(b.life<=0){scene3D.remove(b.object);b.object.geometry.dispose();b.object.material.dispose();}}return b.life>0;});
    particles=particles.filter(p=>{p.life-=dt;if(p.object){const f=clamp(p.life/p.maxLife,0,1);p.object.material.opacity=f;if(p.expanding){p.object.scale.setScalar(1+(1-f)*7);}else if(p.explosion){p.object.scale.setScalar(1+(1-f)*.9);}else p.object.scale.setScalar(f+.2);if(p.life<=0){scene3D.remove(p.object);p.object.geometry.dispose();p.object.material.dispose();}}return p.life>0;});
  }
  function render3D(dt) {
    const target=controlled()||{x:0,y:0,z:0};
    const desired={x:target.x-10.5,y:target.y+15.2,z:target.z+14.8};
    camera3D.position.lerp(new THREE.Vector3(desired.x,desired.y,desired.z),1-Math.exp(-dt*3.2));
    const look=new THREE.Vector3(target.x,target.y+1.05,target.z-1.1);camera3D.lookAt(look);
    renderer3D.render(scene3D,camera3D);
    if(previewRenderer&&previewScene&&previewCamera){const canvas=$('previewCanvas');const w=canvas.clientWidth||480,h=canvas.clientHeight||300;const size=previewRenderer.getSize(new THREE.Vector2());if(Math.abs(size.x-w)>2||Math.abs(size.y-h)>2){previewRenderer.setSize(w,h,false);previewCamera.aspect=w/h;previewCamera.updateProjectionMatrix();}previewClock+=dt;if(previewActor){previewActor.rotation.y=Math.sin(previewClock*.45)*.24-.12;previewActor.userData.legs?.forEach((l,i)=>l.rotation.x=Math.sin(previewClock*1.5+i*Math.PI)*.035);}if(previewRing)previewRing.rotation.z+=dt*.2;previewRenderer.render(previewScene,previewCamera);}
  }
  function projectIso(x,y,z,w,h,camX,camZ) {
    const scale=Math.min(w/47,h/29);
    return {x:w*.5+(x-camX)*scale*.9+(z-camZ)*scale*.57,y:h*.52+(z-camZ)*scale*.34-(x-camX)*scale*.23-y*scale*.75,scale};
  }
  function fallbackPoly(points,fill,stroke) {const c=fallbackCtx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}}
  function renderFallback() {
    const c=fallbackCtx,w=innerWidth,h=innerHeight;
    const p=controlled()||{x:0,z:0};const cx=missionRunning?p.x:0,cz=missionRunning?p.z:0;
    c.clearRect(0,0,w,h);
    if(fieldArt.complete&&fieldArt.naturalWidth){
      const scale=Math.max(w/fieldArt.naturalWidth,h/fieldArt.naturalHeight);
      const imageWidth=fieldArt.naturalWidth*scale,imageHeight=fieldArt.naturalHeight*scale;
      c.drawImage(fieldArt,(w-imageWidth)/2,(h-imageHeight)/2,imageWidth,imageHeight);
      const tint=c.createLinearGradient(0,0,0,h);
      tint.addColorStop(0,'rgba(3,10,18,.42)');tint.addColorStop(.58,'rgba(3,10,18,.56)');tint.addColorStop(1,'rgba(3,10,18,.88)');
      c.fillStyle=tint;c.fillRect(0,0,w,h);
    }else{
      const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#061525');sky.addColorStop(.48,'#0b2436');sky.addColorStop(1,'#030a12');c.fillStyle=sky;c.fillRect(0,0,w,h);
    }
    // Distant skyline silhouette outside the facility windows.
    for(let i=0;i<18;i++){const x=(i/18)*w,hh=(i%5+2)*h*.025;c.fillStyle=i%3?'#10283a':'#16344a';c.fillRect(x,h*.2-hh,Math.max(8,w/28),hh+h*.2);for(let j=0;j<4;j++){c.fillStyle=j%2?'#1da5d5':'#ebac52';c.fillRect(x+3,h*.21-hh+j*8,3,3);}}
    // GREY SQUARE DECK: visible dark joints make the floor read as large industrial tiles.
    const corners=[projectIso(-23,0,-20,w,h,cx,cz),projectIso(23,0,-20,w,h,cx,cz),projectIso(23,0,20,w,h,cx,cz),projectIso(-23,0,20,w,h,cx,cz)];fallbackPoly(corners,'#747775','#a2a39d');
    for(let x=-22;x<=22;x+=2){const a=projectIso(x,.02,-20,w,h,cx,cz),b=projectIso(x,.02,20,w,h,cx,cz);c.strokeStyle='rgba(28,33,33,.66)';c.lineWidth=1.25;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    for(let z=-20;z<=20;z+=2){const a=projectIso(-22,.02,z,w,h,cx,cz),b=projectIso(22,.02,z,w,h,cx,cz);c.strokeStyle='rgba(28,33,33,.66)';c.lineWidth=1.25;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    // TAN WALKWAYS: projected panel strips and cross seams mirror the 3D route plates.
    for(const route of WALKWAY_PATHS)for(let i=1;i<route.points.length;i++){
      const [ax,az]=route.points[i-1],[bx,bz]=route.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      const half=route.width/2,quad=[projectIso(ax+nx*half,0.04,az+nz*half,w,h,cx,cz),projectIso(bx+nx*half,0.04,bz+nz*half,w,h,cx,cz),projectIso(bx-nx*half,0.04,bz-nz*half,w,h,cx,cz),projectIso(ax-nx*half,0.04,az-nz*half,w,h,cx,cz)];
      fallbackPoly(quad,'#b5a37b','#615947');
      c.strokeStyle='rgba(68,61,48,.8)';c.lineWidth=1;
      for(let at=1.8;at<len-.25;at+=2.1){const px=ax+dx/len*at,pz=az+dz/len*at,a=projectIso(px+nx*half,0.06,pz+nz*half,w,h,cx,cz),b=projectIso(px-nx*half,0.06,pz-nz*half,w,h,cx,cz);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}
    }
    for(const p of platforms){const a=projectIso(p.x-p.w/2,p.topY,p.z-p.d/2,w,h,cx,cz),b=projectIso(p.x+p.w/2,p.topY,p.z-p.d/2,w,h,cx,cz),d=projectIso(p.x+p.w/2,p.topY,p.z+p.d/2,w,h,cx,cz),e=projectIso(p.x-p.w/2,p.topY,p.z+p.d/2,w,h,cx,cz);fallbackPoly([a,b,d,e],'#233e4d','#20b9e7');}
    for(const o of coverObjects){const q=projectIso(o.x,o.h,o.z,w,h,cx,cz),size=o.w*q.scale*.55;c.fillStyle='#'+Number(o.color).toString(16).padStart(6,'0');c.fillRect(q.x-size/2,q.y-size*.38,size,size*.38);c.strokeStyle='#292d2b';c.lineWidth=1.4;c.strokeRect(q.x-size/2,q.y-size*.38,size,size*.38);c.fillStyle='rgba(28,31,30,.6)';c.fillRect(q.x-size*.32,q.y-size*.23,size*.64,Math.max(2,size*.045));}
    // Active mission exit. The square gate changes from red/locked to green/open after core recovery.
    const gate=projectIso(game.exit.x,0,game.exit.z,w,h,cx,cz),gateW=gate.scale*2.8,gateH=gate.scale*4.0,gateColor=game.coreRestored?'#49f0a7':'#ec4656';
    c.fillStyle='#282d2d';c.fillRect(gate.x-gateW/2,gate.y-gateH,gateW,gateH);c.strokeStyle=gateColor;c.lineWidth=3;c.strokeRect(gate.x-gateW/2,gate.y-gateH,gateW,gateH);
    c.fillStyle='#4d5451';c.fillRect(gate.x-gateW*.43,gate.y-gateH*.9,gateW*.40,gateH*.88);c.fillRect(gate.x+gateW*.03,gate.y-gateH*.9,gateW*.40,gateH*.88);
    c.fillStyle=gateColor;c.fillRect(gate.x-gateW*.4,gate.y-gateH*.78,gateW*.8,Math.max(2,gateH*.045));
    c.font='bold 8px Segoe UI,Arial';c.textAlign='center';c.fillStyle='#fff';c.fillText(missionIndex===5?'EXIT 06':'EXIT '+MISSION_CAMPAIGN[missionIndex].code+' → '+MISSION_CAMPAIGN[missionIndex+1].code,gate.x,gate.y-gateH-4);c.textAlign='left';
    for(const l of ladders){const q=projectIso(l.x,l.top,l.z,w,h,cx,cz),r=projectIso(l.x,l.bottom,l.z,w,h,cx,cz);c.strokeStyle='#63dfff';c.lineWidth=2;c.beginPath();c.moveTo(q.x-5,q.y);c.lineTo(r.x-5,r.y);c.moveTo(q.x+5,q.y);c.lineTo(r.x+5,r.y);for(let i=1;i<7;i++){const t=i/7;c.moveTo(q.x-5+(r.x-q.x)*t,q.y+(r.y-q.y)*t);c.lineTo(q.x+5+(r.x-q.x)*t,q.y+(r.y-q.y)*t);}c.stroke();}
    const paintActor=(a)=>{
      if(!a.alive&&!a.down)return;
      const q=projectIso(a.x,a.y,a.z,w,h,cx,cz),sc=q.scale;
      const width=(a.type==='mech'?2.35:a.type==='drone'?.92:.9)*sc;
      const height=(a.type==='mech'?4.0:a.type==='drone'?1.0:2.2)*sc;
      c.save();c.translate(q.x,q.y);if(a.down)c.globalAlpha=.48;
      const friendly=!a.isEnemy;
      const combatAiming=['aim','windup','fire'].includes(a.combatState)||!!(a.firingUntil&&a.firingUntil>game.time);
      if(a.isEnemy&&(a.combatState==='aim'||a.combatState==='windup')){
        const warn=a.combatState==='windup'?'#ffb54e':a.variant==='marksman'?'#7de9ff':'#ff4c65';
        c.strokeStyle=warn;c.globalAlpha=.68;c.lineWidth=1.5;c.beginPath();c.ellipse(0,-2,width*(a.combatState==='windup'?.72:.52),Math.max(2,sc*.12),0,0,Math.PI*2);c.stroke();c.globalAlpha=a.down?.48:1;
        if(a.combatState==='windup'){c.fillStyle=warn;c.shadowColor=warn;c.shadowBlur=8;c.beginPath();c.arc(0,-height*.56,Math.max(2,sc*.075),0,Math.PI*2);c.fill();c.shadowBlur=0;}
      }
      const enemyLook = a.isEnemy ? ({
        raider:   {suit:'#762337',armor:'#242833',trim:'#ff4c65'},
        recon:    {suit:'#435660',armor:'#202d37',trim:'#c5ff62'},
        breacher: {suit:'#722b35',armor:'#2c242b',trim:'#ff7653'},
        heavy:    {suit:'#70323c',armor:'#3d3035',trim:'#ffc24d'},
        marksman: {suit:'#40516a',armor:'#1a2533',trim:'#7de9ff'}
      }[a.variant] || {suit:'#762337',armor:'#242833',trim:'#ff4c65'}) : null;
      const suit=enemyLook?enemyLook.suit:a.type==='lilbit'?'#c8a567':a.type==='bubba'?'#937044':a.type==='gideon'?'#6d8d9b':'#8e978e';
      const armor=enemyLook?enemyLook.armor:a.type==='lilbit'?'#68573b':a.type==='bubba'?'#4a4030':a.type==='gideon'?'#2a3c48':'#263846';
      const trim=enemyLook?enemyLook.trim:a.type==='bubba'?'#ffb352':'#43e6ff';
      const skin=a.type==='lilbit'?'#704b3e':a.type==='bubba'?'#654637':'#875d47';
      const rr=(x,y,rw,rh,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,rw,rh,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=Math.max(1,sc*.025);c.stroke();}};
      if(a.type==='drone'){
        // Faceted sentinel hull, rotor cages, sensor lens and scan lamp.
        c.fillStyle='rgba(0,0,0,.38)';c.beginPath();c.ellipse(0,-1,width*.68,Math.max(2,sc*.16),0,0,Math.PI*2);c.fill();
        c.shadowColor='#4effa3';c.shadowBlur=9;c.fillStyle='#24343f';c.beginPath();c.moveTo(-width*.45,-height*.42);c.lineTo(-width*.28,-height*.72);c.lineTo(width*.24,-height*.72);c.lineTo(width*.47,-height*.44);c.lineTo(width*.28,-height*.18);c.lineTo(-width*.3,-height*.18);c.closePath();c.fill();c.shadowBlur=0;
        c.strokeStyle='#95a9a9';c.lineWidth=Math.max(1,sc*.055);
        for(const side of [-1,1]){
          c.beginPath();c.moveTo(side*width*.29,-height*.45);c.lineTo(side*width*.62,-height*.55);c.stroke();
          c.beginPath();c.ellipse(side*width*.68,-height*.51,width*.22,height*.1,0,0,Math.PI*2);c.stroke();
          c.beginPath();c.moveTo(side*width*.68,-height*.61);c.lineTo(side*width*.68,-height*.41);c.stroke();
          c.fillStyle=side<0?'#c5ff62':'#35e6ff';c.shadowColor=c.fillStyle;c.shadowBlur=6;c.beginPath();c.arc(side*width*.68,-height*.51,Math.max(1.5,sc*.055),0,Math.PI*2);c.fill();c.shadowBlur=0;
        }
        c.fillStyle='#12252d';rr(-width*.2,-height*.58,width*.4,height*.3,Math.max(2,sc*.04),'#162b35','#667b83');
        c.fillStyle='#43ffad';c.shadowColor='#43ffad';c.shadowBlur=12;c.beginPath();c.ellipse(0,-height*.43,Math.max(2,sc*.17),Math.max(2,sc*.105),0,0,Math.PI*2);c.fill();c.shadowBlur=0;
        c.fillStyle='#d7ffe8';c.beginPath();c.arc(-width*.035,-height*.435,Math.max(1,sc*.045),0,Math.PI*2);c.fill();
        c.strokeStyle=a.combatState==='fire'?'#ff526b':'rgba(82,255,158,.42)';c.lineWidth=Math.max(1,sc*.035);c.beginPath();c.arc(0,-height*.43,width*.24+Math.sin(game.time*5)*sc*.025,0,Math.PI*2);c.stroke();
        c.strokeStyle='rgba(82,255,158,.42)';c.lineWidth=Math.max(1,sc*.03);c.beginPath();c.moveTo(0,-height*.26);c.lineTo(0,-height*.04);c.stroke();
        c.fillStyle='rgba(68,255,152,.10)';c.beginPath();c.moveTo(-width*.18,-height*.05);c.lineTo(width*.18,-height*.05);c.lineTo(width*.4,height*.65);c.lineTo(-width*.4,height*.65);c.closePath();c.fill();
        c.fillStyle='#111820';c.fillRect(-width*.48,-height*1.02,width*.96,Math.max(2,sc*.075));c.fillStyle='#ff435e';c.fillRect(-width*.48,-height*1.02,width*.96*clamp(a.hp/a.maxHp,0,1),Math.max(2,sc*.075));c.restore();return;
      }
      if(a.type==='mech'){
        // Layered siege chassis, core reactor, broad shoulders, cannon and articulated legs.
        c.fillStyle='rgba(0,0,0,.44)';c.beginPath();c.ellipse(0,-1,width*.72,Math.max(3,sc*.28),0,0,Math.PI*2);c.fill();
        const g=c.createLinearGradient(-width*.55,-height, width*.48,-height*.4);g.addColorStop(0,'#77786c');g.addColorStop(.36,'#465158');g.addColorStop(.75,'#2b343a');g.addColorStop(1,'#151d25');
        // Legs and wide grounded feet.
        for(const side of [-1,1]){
          rr(side*width*.19-width*.12,-height*.36,width*.24,height*.31,sc*.045,'#232d34','#7a8583');
          rr(side*width*.19-width*.16,-height*.16,width*.32,height*.18,sc*.035,'#19242b','#8c9996');
          rr(side*width*.19-width*.2,-height*.08,width*.4,height*.1,sc*.025,'#101820','#9a9b87');
          rr(side*width*.42-width*.19,-height*.75,width*.38,height*.36,sc*.08,'#39454a','#9b895c');
          rr(side*width*.42-width*.15,-height*.72,width*.3,height*.07,sc*.02,'#e0ae43','#f9d16b');
        }
        rr(-width*.42,-height*.76,width*.84,height*.43,sc*.11,g,'#85928f');
        rr(-width*.34,-height*.68,width*.68,height*.27,sc*.055,'#202d34','#687a80');
        // Reactor core, glowing seams and warning bars.
        rr(-width*.16,-height*.66,width*.32,height*.23,sc*.035,'#111f27','#596970');
        c.fillStyle='#50ff9f';c.shadowColor='#50ff9f';c.shadowBlur=12;c.beginPath();c.arc(0,-height*.55,Math.max(3,sc*.16),0,Math.PI*2);c.fill();c.shadowBlur=0;
        c.fillStyle='#d5ffe6';c.beginPath();c.arc(-width*.025,-height*.56,Math.max(1.5,sc*.055),0,Math.PI*2);c.fill();
        for(let i=-1;i<=1;i++){rr(i*width*.11-width*.025,-height*.72,width*.05,height*.13,sc*.01,'#dcae45','#f8d06c');}
        // Sensor brow and bright green eye.
        rr(-width*.26,-height*.91,width*.52,height*.2,sc*.07,'#19252c','#8d9c99');
        rr(-width*.21,-height*.87,width*.42,height*.07,sc*.025,'#07161e','#738a8e');
        c.fillStyle='#47ff9b';c.shadowColor='#47ff9b';c.shadowBlur=14;c.beginPath();c.ellipse(0,-height*.865,Math.max(3,sc*.2),Math.max(2,sc*.095),0,0,Math.PI*2);c.fill();c.shadowBlur=0;
        // Cannon barrel on the right shoulder and glowing muzzle ring.
        rr(width*.28,-height*.7,width*.3,height*.13,sc*.035,'#151f26','#95a09b');
        rr(width*.49,-height*.725,width*.13,height*.18,sc*.025,'#333e43','#ffb34e');
        c.fillStyle=a.combatState==='windup'?'#ffe18b':'#ff9a43';c.shadowColor=a.combatState==='windup'?'#ffc24d':'#ff7c36';c.shadowBlur=a.firingUntil&&a.firingUntil>game.time?18:a.combatState==='windup'?14:3;c.beginPath();c.arc(width*.61,-height*.635,Math.max(2,sc*(a.combatState==='windup'?.105:.075)),0,Math.PI*2);c.fill();c.shadowBlur=0;
        c.fillStyle='#111820';c.fillRect(-width*.48,-height*1.04,width*.96,Math.max(3,sc*.09));c.fillStyle='#fa425e';c.fillRect(-width*.48,-height*1.04,width*.96*clamp(a.hp/a.maxHp,0,1),Math.max(3,sc*.09));c.restore();return;
      }
      // Soft floor shadow and boots.
      c.fillStyle='rgba(0,0,0,.42)';c.beginPath();c.ellipse(0,-1,width*.55,Math.max(2,sc*.16),0,0,Math.PI*2);c.fill();
      const moving=Math.min(1,Math.hypot(a.vx||0,a.vz||0)/(a.type==='bubba'?3.7:3.0)),phase=game.time*(a.type==='lilbit'?3.2:a.type==='bubba'?1.7:2.5)+(a.id==='lilbit'?1.2:0)+(a.anim||0)*.22;
      const stride=Math.sin(phase)*width*(a.type==='bubba'?.075:.115)*moving;
      // Rear equipment silhouette gives each operator depth, not a flat rectangular body.
      rr(-width*.36,-height*.75,width*.72,height*.37,Math.max(2,sc*.06),'#101d27','#364d59');
      rr(-width*.2,-height*.7,width*.4,height*.28,Math.max(2,sc*.04),armor,'#627681');
      // Legs are articulated and outlined with a separate shin plate and boot.
      c.lineCap='round';c.lineJoin='round';
      for(const side of [-1,1]){
        const hipX=side*width*.17, kneeX=hipX+(side===-1?stride:-stride), hipY=-height*.35, kneeY=-height*.19, footY=-height*.055;
        c.strokeStyle='#101821';c.lineWidth=Math.max(3,width*.2);c.beginPath();c.moveTo(hipX,hipY);c.lineTo(kneeX,kneeY);c.lineTo(kneeX+side*width*.035,footY);c.stroke();
        c.strokeStyle=suit;c.lineWidth=Math.max(2,width*.12);c.beginPath();c.moveTo(hipX,hipY);c.lineTo(kneeX,kneeY);c.stroke();
        rr(kneeX-width*.105,kneeY-width*.025,width*.21,width*.14,Math.max(2,sc*.035),a.type==='lilbit'?'#d7bb7c':a.type==='bubba'?'#b18a4e':armor,trim);
        rr(kneeX-width*.105, kneeY+width*.1,width*.21,Math.max(3,height*.12),Math.max(2,sc*.03),armor,'#536673');
        rr(kneeX-width*.11+side*width*.045,footY-width*.035,width*.25,height*.07,Math.max(2,sc*.035),'#111b23','#75848c');
        c.fillStyle=trim;c.fillRect(kneeX-width*.035,kneeY+height*.04,Math.max(1,sc*.035),height*.06);
      }
      // Tactical vest silhouette with layered plates and narrow cyan seams.
      const torsoGrad=c.createLinearGradient(-width*.4,-height*.78,width*.35,-height*.38);torsoGrad.addColorStop(0,suit);torsoGrad.addColorStop(.46,armor);torsoGrad.addColorStop(1,'#101a22');
      c.beginPath();c.moveTo(-width*.31,-height*.76);c.lineTo(-width*.43,-height*.65);c.lineTo(-width*.33,-height*.39);c.quadraticCurveTo(0,-height*.3,width*.33,-height*.39);c.lineTo(width*.43,-height*.65);c.lineTo(width*.29,-height*.77);c.closePath();c.fillStyle=torsoGrad;c.fill();c.strokeStyle='#738591';c.lineWidth=Math.max(1,sc*.035);c.stroke();
      rr(-width*.27,-height*.71,width*.54,height*.25,Math.max(2,sc*.06),a.type==='lilbit'?'#d3b578':a.type==='bubba'?'#6e5633':a.isEnemy?'#4d1b29':'#1b303e',trim);
      if(a.isEnemy&&a.variant==='heavy'){
        rr(-width*.5,-height*.74,width*.28,height*.22,Math.max(2,sc*.05),'#4a3037','#ffc24d');
        rr(width*.22,-height*.74,width*.28,height*.22,Math.max(2,sc*.05),'#4a3037','#ffc24d');
        for(let i=0;i<3;i++)rr(-width*.16+i*width*.1,-height*.69,width*.045,height*.13,1,'#ffc24d','#f9df8a');
      } else if(a.isEnemy&&a.variant==='recon'){
        rr(-width*.42,-height*.73,width*.18,height*.09,2,'#162730','#c5ff62');
        rr(width*.24,-height*.73,width*.18,height*.09,2,'#162730','#c5ff62');
      }
      // Chest bands, mission patch, and utility pouches.
      c.strokeStyle=trim;c.lineWidth=Math.max(1,sc*.04);c.beginPath();c.moveTo(-width*.18,-height*.68);c.lineTo(width*.12,-height*.44);c.moveTo(width*.17,-height*.68);c.lineTo(-width*.1,-height*.44);c.stroke();
      rr(-width*.085,-height*.63,width*.17,height*.12,Math.max(1,sc*.025),a.isEnemy?'#ff405d':'#0e2635',trim);
      rr(-width*.31,-height*.42,width*.2,height*.13,Math.max(1,sc*.025),'#273540','#6d7d81');rr(width*.11,-height*.42,width*.2,height*.13,Math.max(1,sc*.025),'#273540','#6d7d81');
      // Arms brace toward the weapon, using the character's aim direction.
      const ax=a.dirX||0,az=a.dirZ||-1,aimX=ax*.9+az*.57,aimY=az*.34-ax*.23,amag=Math.hypot(aimX,aimY)||1,ux=aimX/amag,uy=aimY/amag;
      const recoil=(a.firingUntil&&a.firingUntil>game.time)?(a.recoil||.25):0;
      const gunX=width*.08-recoil*width*.025,gunY=-height*.59+Math.sin(phase)*height*.012*moving,handX=gunX+ux*width*.22,handY=gunY+uy*width*.22;
      for(const side of [-1,1]){
        const sx=side*width*.3,sy=-height*.68;
        c.strokeStyle='#101923';c.lineWidth=Math.max(3,width*.17);c.beginPath();c.moveTo(sx,sy);c.lineTo(sx*.6+handX*.4,sy*.55+handY*.45);c.lineTo(handX,handY);c.stroke();
        c.strokeStyle=a.type==='lilbit'?'#b99a61':a.type==='bubba'?'#82653b':a.isEnemy?'#62202f':'#596b75';c.lineWidth=Math.max(2,width*.105);c.beginPath();c.moveTo(sx,sy);c.lineTo(sx*.6+handX*.4,sy*.55+handY*.45);c.lineTo(handX,handY);c.stroke();
        c.fillStyle='#17252f';c.beginPath();c.arc(handX,handY,Math.max(1.5,width*.055),0,Math.PI*2);c.fill();
      }
      // Weapon render uses a bright barrel edge and role-specific launcher silhouette.
      c.save();c.translate(gunX,gunY);c.rotate(Math.atan2(uy,ux));
      if(a.type==='bubba'){
        rr(-width*.14,-width*.12,width*.64,width*.23,Math.max(2,sc*.04),'#252e32','#8c9a99');
        rr(width*.37,-width*.16,width*.17,width*.31,Math.max(2,sc*.035),'#323b3b','#ffab4d');
        c.fillStyle='#ff8f37';c.fillRect(width*.48,-width*.07,width*.14,width*.13);
      }else if(a.isEnemy&&a.variant==='marksman'){
        rr(-width*.18,-width*.1,width*.82,width*.2,Math.max(2,sc*.035),'#17232f','#8c9eab');
        rr(width*.48,-width*.13,width*.18,width*.26,Math.max(2,sc*.03),'#222c32','#7de9ff');
        rr(width*.03,-width*.19,width*.19,width*.1,Math.max(1,sc*.02),'#111920','#7de9ff');
        c.fillStyle='#7de9ff';c.fillRect(width*.05,-width*.16,width*.14,Math.max(1,sc*.03));
      }else if(a.isEnemy&&a.variant==='breacher'){
        rr(-width*.13,-width*.115,width*.53,width*.23,Math.max(2,sc*.04),'#24262c','#ff7653');
        rr(width*.31,-width*.17,width*.19,width*.33,Math.max(2,sc*.035),'#3b3132','#ff7653');
        rr(width*.12,width*.1,width*.17,width*.12,Math.max(1,sc*.02),'#131a20','#a6afb0');
      }else{
        rr(-width*.12,-width*.095,width*(a.type==='lilbit'?.72:.61),width*.19,Math.max(2,sc*.035),'#151e27','#70828b');
        rr(width*.28,-width*.065,width*.2,width*.12,Math.max(1,sc*.02),a.type==='lilbit'?'#163946':'#213844',trim);
        c.fillStyle=trim;c.fillRect(width*.48,-width*.025,width*.15,Math.max(1.5,sc*.055));
        rr(-width*.07,width*.07,width*.13,width*.12,Math.max(1,sc*.02),'#334047','#94a2a6');
      }
      const muzzleX=width*(a.type==='bubba'?.63:.64);
      if(a.firingUntil&&a.firingUntil>game.time){c.shadowColor=trim;c.shadowBlur=a.type==='bubba'?18:12;c.fillStyle='#fff2c0';c.beginPath();c.moveTo(muzzleX,-width*.12);c.lineTo(muzzleX+width*.23,0);c.lineTo(muzzleX,width*.12);c.lineTo(muzzleX+width*.08,0);c.closePath();c.fill();c.shadowBlur=0;}
      c.restore();
      // Head, face, and operator-specific silhouettes.
      c.fillStyle=skin;c.beginPath();c.ellipse(0,-height*.88,width*.19,height*.085,0,0,Math.PI*2);c.fill();
      c.fillStyle='#1a2025';c.fillRect(-width*.16,-height*.9,width*.32,Math.max(1,sc*.035));
      if(a.type==='lilbit'){
        // Long braid over the back shoulder and tan baseball cap with a visible bill.
        c.strokeStyle='#181d21';c.lineWidth=Math.max(2,width*.12);c.lineCap='round';c.beginPath();c.moveTo(width*.13,-height*.88);c.quadraticCurveTo(width*.27,-height*.8,width*.22,-height*.68);c.lineTo(width*.27,-height*.58);c.stroke();
        c.strokeStyle='#35302a';c.lineWidth=Math.max(1,width*.045);c.beginPath();c.moveTo(width*.21,-height*.78);c.lineTo(width*.27,-height*.72);c.lineTo(width*.22,-height*.66);c.stroke();
        rr(-width*.24,-height*.99,width*.48,height*.1,Math.max(2,sc*.04),'#c7a96f','#eed69c');
        c.beginPath();c.ellipse(0,-height*.985,width*.23,height*.07,0,Math.PI,Math.PI*2);c.fillStyle='#e2c489';c.fill();
        c.fillStyle='#f0d7a1';c.beginPath();c.moveTo(width*.02,-height*.95);c.lineTo(width*.3,-height*.94);c.lineTo(width*.22,-height*.915);c.lineTo(width*.02,-height*.92);c.closePath();c.fill();
        rr(-width*.2,-height*.88,width*.4,height*.025,1,'#25343b','#25343b');
      }else if(a.type==='bubba'){
        // Heavy assault headgear/communications set.
        rr(-width*.23,-height*.97,width*.46,height*.07,Math.max(2,sc*.04),'#2b3134','#806743');
        c.fillStyle='#c38e49';c.fillRect(-width*.2,-height*.945,width*.4,Math.max(1.5,sc*.025));
        c.fillStyle='#1a242b';c.fillRect(-width*.24,-height*.88,width*.08,height*.07);c.fillRect(width*.16,-height*.88,width*.08,height*.07);
      }else if(a.type==='gideon'){
        rr(-width*.235,-height*.98,width*.47,height*.13,Math.max(2,sc*.045),'#40535e','#829ba5');rr(-width*.19,-height*.91,width*.38,height*.035,1,'#49def1','#7bfcff');
      }else if(a.isEnemy){
        if(a.variant==='recon'){
          rr(-width*.27,-height*.99,width*.54,height*.13,Math.max(2,sc*.045),'#23333c','#7d9595');
          rr(-width*.22,-height*.935,width*.44,height*.045,2,'#111d25','#9ab0b1');
          c.fillStyle='#c5ff62';c.shadowColor='#b5ff3c';c.shadowBlur=7;for(const side of [-1,1]){c.beginPath();c.arc(side*width*.105,-height*.91,Math.max(1.5,sc*.04),0,Math.PI*2);c.fill();}c.shadowBlur=0;
          c.strokeStyle='#c5ff62';c.lineWidth=Math.max(1,sc*.025);c.beginPath();c.moveTo(width*.16,-height*.99);c.lineTo(width*.2,-height*1.08);c.stroke();
        }else if(a.variant==='breacher'){
          rr(-width*.27,-height*.99,width*.54,height*.12,Math.max(2,sc*.045),'#2a252e','#a65047');
          rr(-width*.22,-height*.92,width*.44,height*.13,Math.max(2,sc*.035),'#111b22','#ff7653');
          for(const side of [-1,1]){c.fillStyle='#626b6c';c.beginPath();c.arc(side*width*.105,-height*.865,Math.max(1.7,sc*.045),0,Math.PI*2);c.fill();c.strokeStyle='#ff7653';c.lineWidth=1;c.stroke();}
        }else if(a.variant==='heavy'){
          rr(-width*.3,-height*.99,width*.6,height*.13,Math.max(2,sc*.05),'#29282f','#ffc24d');
          rr(-width*.22,-height*.92,width*.44,height*.05,1,'#151c22','#ffc24d');
          rr(-width*.31,-height*.84,width*.62,height*.08,1,'#4a3037','#ffce5d');
        }else if(a.variant==='marksman'){
          rr(-width*.27,-height*.975,width*.54,height*.08,Math.max(2,sc*.04),'#202b38','#7de9ff');
          rr(-width*.2,-height*.92,width*.4,height*.045,1,'#09151e','#7de9ff');
          c.fillStyle='#7de9ff';c.shadowColor='#7de9ff';c.shadowBlur=6;c.beginPath();c.arc(width*.17,-height*.92,Math.max(1.5,sc*.035),0,Math.PI*2);c.fill();c.shadowBlur=0;
        }else{
          rr(-width*.25,-height*.98,width*.5,height*.12,Math.max(2,sc*.04),'#29232c','#81404c');rr(-width*.2,-height*.91,width*.4,height*.035,1,'#ff3e5c','#ff7b8d');
        }
      }else{
        rr(-width*.23,-height*.97,width*.46,height*.07,Math.max(2,sc*.035),'#1f303d','#536b78');
        c.fillStyle='#3bcdf1';c.fillRect(-width*.19,-height*.945,width*.38,Math.max(1,sc*.02));
      }
      if(a.type==='bubba'){
        // Shoulder-mounted tube has a visibly heavier profile than the primary weapon.
        c.save();c.translate(-width*.29,-height*.81);c.rotate(-.12);
        rr(-width*.08,-height*.075,width*.65,width*.15,Math.max(2,sc*.035),'#333b3e','#a08a62');
        c.fillStyle='#ff9e45';c.fillRect(width*.46,-width*.04,width*.12,width*.08);c.restore();
      }
      // Small friendly/enemy status plate floats above the head.
      c.fillStyle='rgba(3,10,17,.84)';c.fillRect(-width*.7,-height*1.16,width*1.4,Math.max(3,sc*.085));
      c.fillStyle=a.isEnemy?'#ff425e':'#53ffba';c.fillRect(-width*.7,-height*1.16,width*1.4*clamp(a.hp/a.maxHp,0,1),Math.max(3,sc*.085));
      if(a.down){c.fillStyle='#ffbf63';c.font=`bold ${Math.max(7,sc*.28)}px Segoe UI,Arial`;c.textAlign='center';c.fillText('DOWN',0,-height*1.22);c.textAlign='left';}
      c.restore();
    };
    const buggy=game.vehicle,bq=projectIso(buggy.x,.2,buggy.z,w,h,cx,cz);
    c.save();c.translate(bq.x,bq.y);c.rotate(-buggy.angle*.72);const bs=bq.scale;
    c.fillStyle='rgba(0,0,0,.55)';c.beginPath();c.ellipse(0,2*bs,1.35*bs,.48*bs,0,0,Math.PI*2);c.fill();
    c.fillStyle='#10191d';for(const wx of [-.78,.78])for(const wz of [-.68,.68])c.fillRect((wx-.2)*bs,(wz-.2)*bs,.4*bs,.4*bs);
    c.fillStyle='#62563e';c.strokeStyle='#53e5ff';c.lineWidth=Math.max(1,bs*.055);c.beginPath();c.roundRect(-1.15*bs,-.58*bs,2.3*bs,1.16*bs,.2*bs);c.fill();c.stroke();
    c.fillStyle='#203844';c.fillRect(-.52*bs,-.38*bs,1.02*bs,.76*bs);c.strokeStyle='#ffcf72';c.lineWidth=Math.max(1,bs*.08);c.beginPath();c.moveTo(0,-.05*bs);c.lineTo(1.05*bs,-.05*bs);c.stroke();
    c.fillStyle='#fff0b8';c.font=`bold ${Math.max(8,bs*.34)}px Segoe UI,Arial`;c.textAlign='center';c.fillText('200',0,-.8*bs);c.restore();c.textAlign='left';
    // Important objective markers.
    for(const [q,color,label] of [[game.terminal,'#37e1ff','ACCESS TERMINAL'],[game.core,'#65ffd0','NETWORK CORE'],[game.g4,'#ffca62','SECTOR G4'],[game.lostTech,'#c091ff','LOST TECH']]){if(q.taken)continue;const v=projectIso(q.x,q.y||0,q.z,w,h,cx,cz);c.fillStyle=color;c.shadowColor=color;c.shadowBlur=12;c.beginPath();c.arc(v.x,v.y,5,0,Math.PI*2);c.fill();c.shadowBlur=0;c.font='9px Segoe UI,Arial';c.fillStyle='#eaffff';c.fillText(label,v.x+7,v.y-4);}
    // Static facility sign.
    const sign=projectIso(-.5,5.2,-19.9,w,h,cx,cz);c.fillStyle='rgba(2,17,29,.9)';c.fillRect(sign.x-95,sign.y-25,190,50);c.strokeStyle='#22d8ff';c.strokeRect(sign.x-95,sign.y-25,190,50);c.font='bold 21px Segoe UI,Arial';c.textAlign='center';c.fillStyle='#22d8ff';c.fillText('1VETTECH',sign.x,sign.y+1);c.font='bold 8px Segoe UI,Arial';c.fillStyle='#fff';c.fillText('CYBER TOWER',sign.x,sign.y+15);c.textAlign='left';
    for(const e of enemies)paintActor(e);for(const a of actors)paintActor(a);
    for(const b of beams){const p1=projectIso(b.from.x,b.from.y,b.from.z,w,h,cx,cz),p2=projectIso(b.to.x,b.to.y,b.to.z,w,h,cx,cz);c.globalAlpha=clamp(b.life/b.maxLife,0,1);c.strokeStyle='#'+Number(b.color).toString(16).padStart(6,'0');c.lineWidth=Math.max(1,b.width*24);c.beginPath();c.moveTo(p1.x,p1.y);c.lineTo(p2.x,p2.y);c.stroke();c.globalAlpha=1;}
    for(const p of projectiles){const q=projectIso(p.x,p.y,p.z,w,h,cx,cz);c.fillStyle=p.team==='enemy'?'#ff405c':'#ffad4f';c.shadowColor=c.fillStyle;c.shadowBlur=12;c.beginPath();c.arc(q.x,q.y,p.weapon.id==='tankShell'?7:p.weapon.id==='launcher'?5:3,0,Math.PI*2);c.fill();c.shadowBlur=0;}
  }
  function drawMinimap() {
    const canvas=$('minimap');if(!canvas)return;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.fillStyle='#061a2b';c.fillRect(0,0,w,h);
    c.strokeStyle='rgba(46,198,235,.18)';c.lineWidth=1;for(let x=10;x<w;x+=20){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=10;y<h;y+=20){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    const map=(x,z)=>({x:8+(x-WORLD.minX)/(WORLD.maxX-WORLD.minX)*(w-16),y:8+(z-WORLD.minZ)/(WORLD.maxZ-WORLD.minZ)*(h-16)});
    c.strokeStyle='#1c5b72';c.lineWidth=3;for(const p of platforms){const a=map(p.x-p.w/2,p.z-p.d/2),b=map(p.x+p.w/2,p.z+p.d/2);c.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}
    for(const o of coverObjects){const p=map(o.x,o.z);c.fillStyle='#385567';c.fillRect(p.x-2,p.y-2,4,4);}
    for(const e of livingEnemies()){const p=map(e.x,e.z);c.fillStyle=e.type==='mech'?'#ff9d42':'#ff3f61';c.beginPath();c.arc(p.x,p.y,e.type==='mech'?4:2.8,0,Math.PI*2);c.fill();}
    for(const a of livingTeam()){const p=map(a.x,a.z);c.fillStyle=a.id===game.selected?'#ffd052':a.id==='lilbit'?'#25f3ff':'#5bff9b';c.beginPath();c.arc(p.x,p.y,3.4,0,Math.PI*2);c.fill();}
    const buggy=map(game.vehicle.x,game.vehicle.z);c.fillStyle='#ffbd5b';c.save();c.translate(buggy.x,buggy.y);c.rotate(-game.vehicle.angle);c.fillRect(-4,-3,8,6);c.strokeStyle='#fff0b8';c.strokeRect(-4,-3,8,6);c.restore();
    for(const [q,col] of [[game.terminal,'#38e6ff'],[game.core,'#65ffd0'],[game.g4,'#ffca62'],[game.exit,game.coreRestored?'#43f0a7':'#ff4658']]){const p=map(q.x,q.z);c.strokeStyle=col;c.lineWidth=2;c.strokeRect(p.x-3,p.y-3,6,6);}
    c.fillStyle='#dffbff';c.font='bold 9px Segoe UI,Arial';c.fillText('N',w-14,12);
  }

  // ---------- Main update loop / mission success ----------
  function restoreNetworkCore() {
    game.coreRestored=true;
    if(objectiveMeshes.coreRing)objectiveMeshes.coreRing.material.color.setHex(0x43f0a7);
    showToast('NETWORK CORE RESTORED · EXIT GATE UNLOCKED');updateHud();
  }
  function winMission() {
    if(!game.coreRestored)return;
    const cleared=MISSION_CAMPAIGN[missionIndex];campaignScore+=game.score;campaignKills+=game.kills;
    if(missionIndex<MISSION_CAMPAIGN.length-1){
      missionIndex++;resetMission();showToast(`${cleared.title} COMPLETE · ${MISSION_CAMPAIGN[missionIndex].title} STARTING`);return;
    }
    missionEnded=true;missionRunning=false;game.won=true;showResult(true);
  }
  function endMission(won) {missionEnded=true;missionRunning=false;game.won=won;showResult(won);}
  function showResult(won) {
    $('resultTitle').textContent=won?'SIX-MISSION CAMPAIGN COMPLETE':'SQUAD DOWN · MISSION '+MISSION_CAMPAIGN[missionIndex].code;
    $('resultText').textContent=won?'All six Facility Alpha operations are complete. The squad restored the Network Core and reached final extraction.':'The squad lost operational integrity during '+MISSION_CAMPAIGN[missionIndex].title+'. Replay this operation, use cover, and keep your teammates close.';
    $('resultStats').innerHTML=`<span>HOSTILES ${campaignKills+game.kills}</span><span>SCORE ${campaignScore+game.score}</span><span>MISSION ${won?'06 / 06':MISSION_CAMPAIGN[missionIndex].code+' / 06'}</span>`;
    $('replayBtn').textContent=won?'REPLAY SIX-MISSION CAMPAIGN ↻':'REPLAY MISSION '+MISSION_CAMPAIGN[missionIndex].code+' ↻';
    $('resultOverlay').classList.remove('hidden');
  }
  function replayMissionOrCampaign() {
    $('resultOverlay').classList.add('hidden');
    if(game.won){missionIndex=0;campaignScore=0;campaignKills=0;}
    resetMission();
  }
  function update(dt) {
    worldTime+=dt;game.time+=dt;dashCooldown=Math.max(0,dashCooldown);empCooldown=Math.max(0,empCooldown);repairCooldown=Math.max(0,repairCooldown);
    updateProjectiles(dt);
    for(const a of actors)allyUpdate(a,dt);
    for(const e of enemies)enemyUpdate(e,dt);
    updateFacilityState();updateVisuals(dt);drawMinimap();
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt=lastFrame?Math.min((ts-lastFrame)/1000,.035):0;lastFrame=ts;
    if(missionRunning)update(dt);else if(can3D)updateVisuals(dt);
    if(can3D)render3D(dt);else renderFallback();
  }

  // ---------- UI events and keyboard controls ----------
  function chooseOperator(id) {
    if(!OPERATOR_INFO[id]||id==='gideon')return;selectedId=id;
    document.querySelectorAll('.operator-option[data-operator]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.operator===id));
    setPreview(id);
  }
  function switchOperator() {
    const current=controlled();if(current&&game.vehicle.driverId===current.id)exitBuggy(current);
    const ids=['operator','bubba','lilbit'];const index=ids.indexOf(game.selected);game.selected=ids[(index+1)%ids.length];selectedId=game.selected;
    actors.forEach(a=>a.isControlled=a.id===game.selected);game.playerActor=controlled();currentWeapon=0;updateHud();showToast(`OPERATOR SWITCH · ${OPERATOR_INFO[game.selected].name}`);
  }
  function keyDown(e) {
    const code=e.code;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(code))e.preventDefault();
    if(code==='Tab'&&!missionRunning){return;}
    if(!missionRunning)return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyF','KeyJ'].includes(code))game.keys.add(code);
    if(code==='Digit1')currentWeapon=0;if(code==='Digit2')currentWeapon=1;if(code==='Digit3')currentWeapon=2;
    if(code==='Tab'){switchOperator();return;}
    if(code==='KeyE'){inputInteract();return;}
    if(code==='KeyQ'){useDash(controlled());return;}
    if(code==='KeyG'){useEmp(controlled());return;}
    if(code==='KeyR'){const a=controlled();const w=getWeapon(a);if(w.ammoKey){const clipKey=w.ammoKey==='spread'?'spreadAmmo':'launcherAmmo',resKey=w.ammoKey==='spread'?'spreadReserve':'launcherReserve',cap=w.clip;const load=Math.min(cap-a[clipKey],a[resKey]);a[clipKey]+=load;a[resKey]-=load;showToast(`${w.name} RELOADED`);}return;}
    updateHud();
  }
  function keyUp(e) {game.keys.delete(e.code);}
  function resized() {
    if(renderer3D&&camera3D){camera3D.aspect=innerWidth/innerHeight;camera3D.updateProjectionMatrix();renderer3D.setSize(innerWidth,innerHeight);}
    fallbackCanvas.width=Math.max(1,innerWidth*devicePixelRatio);fallbackCanvas.height=Math.max(1,innerHeight*devicePixelRatio);fallbackCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    if(previewRenderer&&previewCamera){const c=$('previewCanvas');previewRenderer.setSize(c.clientWidth||480,c.clientHeight||300,false);previewCamera.aspect=(c.clientWidth||480)/(c.clientHeight||300);previewCamera.updateProjectionMatrix();}
  }

  // ---------- Startup ----------
  function init() {
    buildLayoutData();
    if(hasThree){
      try {makeScene();setupPreview();$('renderHost').style.display='block';fallbackCanvas.style.display='none';}
      catch(err){console.warn('Three.js renderer did not initialize; using the isometric fallback.',err);can3D=false;renderer3D=null;previewRenderer=null;$('renderHost').style.display='none';fallbackCanvas.style.display='block';}
    } else {
      can3D=false;$('renderHost').style.display='none';fallbackCanvas.style.display='block';$('previewCanvas').style.display='none';$('previewFallback').style.display='flex';
    }
    fallbackCanvas.width=Math.max(1,innerWidth*devicePixelRatio);fallbackCanvas.height=Math.max(1,innerHeight*devicePixelRatio);fallbackCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    document.querySelectorAll('.operator-option[data-operator]').forEach(btn=>btn.addEventListener('click',()=>chooseOperator(btn.dataset.operator)));
    $('gideonToggle').addEventListener('click',()=>{includeGideon=!includeGideon;$('gideonToggle').classList.toggle('off',!includeGideon);$('gideonToggle').setAttribute('aria-pressed',String(includeGideon));$('gideonToggleLabel').textContent=includeGideon?'ON':'OFF';showToast(includeGideon?'GIDEON ADDED TO AI SQUAD':'GIDEON HELD IN RESERVE');});
    $('deployBtn').addEventListener('click',startMission);$('replayBtn').addEventListener('click',replayMissionOrCampaign);$('returnSelectBtn').addEventListener('click',returnToSelect);
    window.addEventListener('keydown',keyDown,{passive:false});window.addEventListener('keyup',keyUp);window.addEventListener('resize',resized);window.addEventListener('blur',()=>game.keys.clear());
    // Show original 3D/canvas facility while the operator-select overlay is open.
    if(can3D){
      // An idle procedural operator sits in the background until deployment.
      const dummy=freshActor({id:'preview-dummy',type:'operator',name:'JJ',x:0,z:4,hp:100,maxHp:100,role:'leader'});addActorView(dummy);dummy.view.position.set(0,0,4);previewWorldActor=dummy.view;
    }
    setPreview('operator');resized();
    if(new URLSearchParams(location.search).has('debug')){window.__cyberTowerDebug=()=>({can3D,missionRunning,missionEnded,mission:missionIndex+1,missionCount:MISSION_CAMPAIGN.length,missionTitle:MISSION_CAMPAIGN[missionIndex].title,exit:game.exit,coreRestored:game.coreRestored,selected:game.selected,weapon:WEAPONS[currentWeapon].id,facilityCleared,terminalActive,sectorExplored,lostTechFound,score:game.score,kills:game.kills,campaignScore,campaignKills,team:actors.map(a=>({id:a.id,type:a.type,x:+a.x.toFixed(2),y:+a.y.toFixed(2),z:+a.z.toFixed(2),vx:+(a.vx||0).toFixed(2),vz:+(a.vz||0).toFixed(2),hp:Math.round(a.hp),alive:a.alive,down:a.down,climbing:a.climbing,combatState:a.combatState||'idle',aiming:!!(a.aimUntil&&a.aimUntil>game.time),firing:!!(a.firingUntil&&a.firingUntil>game.time),recoil:+(a.recoil||0).toFixed(2)})),enemies:enemies.map(e=>({id:e.id,type:e.type,variant:e.variant||'',x:+e.x.toFixed(2),y:+e.y.toFixed(2),z:+e.z.toFixed(2),vx:+(e.vx||0).toFixed(2),vz:+(e.vz||0).toFixed(2),hp:Math.round(e.hp),alive:e.alive,emp:e.empUntil>game.time,combatState:e.combatState||'idle',aiming:!!(e.aimUntil&&e.aimUntil>game.time),firing:!!(e.firingUntil&&e.firingUntil>game.time),recoil:+(e.recoil||0).toFixed(2)})),projectiles:projectiles.length,hostiles:livingEnemies().length,controlled:controlled()?{x:controlled().x,y:controlled().y,z:controlled().z,hp:controlled().hp,down:controlled().down}:null});}
    requestAnimationFrame(frame);
  }
  init();
})();
