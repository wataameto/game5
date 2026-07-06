// --- game5: Bouncy Ball Catch & Auto-Throw 3D ---

const state = {
  gameState: 'lobby', // 'lobby' | 'playing' | 'gameover'
  score: 0,
  time: 60,
  bestScore: 0,
  muted: false,
  startTime: 0,
  
  // Three.js
  scene: null,
  camera: null,
  renderer: null,
  player: null,
  balls: [],
  monsters: [],
  particles: [],
  
  // Arena Settings (Emerald Theme)
  arenaWidth: 60,
  arenaDepth: 60,
  arenaHeight: 30,
  gravity: -0.015,
  
  // Player Controls (Direct 8-way movement)
  keys: {
    forward: false,
    backward: false,
    left: false,
    right: false
  },
  playerPhysics: {
    x: 0,
    y: 1.0,
    z: 0,
    vx: 0,
    vz: 0,
    angle: 0,
    speed: 0.38, // 直接移動の定速
    radius: 1.2,
    throwCooldown: 0,
    lastWalkTime: 0
  },
  
  // Audio
  audioCtx: null
};

// --- Keyboard input setup ---
function setupControls() {
  window.addEventListener('keydown', e => {
    switch (e.key.toLowerCase()) {
      case 'arrowup':
      case 'w':
        state.keys.forward = true;
        break;
      case 'arrowdown':
      case 's':
        state.keys.backward = true;
        break;
      case 'arrowleft':
      case 'a':
        state.keys.left = true;
        break;
      case 'arrowright':
      case 'd':
        state.keys.right = true;
        break;
    }
  });

  window.addEventListener('keyup', e => {
    switch (e.key.toLowerCase()) {
      case 'arrowup':
      case 'w':
        state.keys.forward = false;
        break;
      case 'arrowdown':
      case 's':
        state.keys.backward = false;
        break;
      case 'arrowleft':
      case 'a':
        state.keys.left = false;
        break;
      case 'arrowright':
      case 'd':
        state.keys.right = false;
        break;
    }
  });
}

// --- Web Audio Synthesizer (SE & BGM) ---
function initAudio() {
  if (state.audioCtx) return;
  state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playSound(type, pitch = 1.0) {
  if (state.muted || !state.audioCtx) return;
  
  const ctx = state.audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  const now = ctx.currentTime;
  
  if (type === 'bounce') {
    // ボヨーンというゴム風の弾む音
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(70 * pitch, now + 0.25);
    
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
    
    osc.start(now);
    osc.stop(now + 0.25);
  } else if (type === 'throw') {
    // 投げまくる「シュバッ！」という超高速音
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(200 * pitch, now + 0.12);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (type === 'hit') {
    // モンスター撃破時の爽快な破壊音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(300 * pitch, now + 0.3);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
    
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'spawn') {
    // ボールが追加された時の「ポヨポヨ」音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
    
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// --- Game Particles ---
class GameParticle extends THREE.Mesh {
  constructor(x, y, z, color = 0xffffff, size = 0.28) {
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.85
    });
    super(geo, mat);
    this.position.set(x, y, z);
    
    this.vx = (Math.random() - 0.5) * 0.25;
    this.vy = Math.random() * 0.2 + 0.05;
    this.vz = (Math.random() - 0.5) * 0.25;
    this.decay = 0.94;
  }
  
  update() {
    this.position.x += this.vx;
    this.position.y += this.vy;
    this.position.z += this.vz;
    this.vy += state.gravity * 0.5;
    
    this.scale.multiplyScalar(this.decay);
    this.material.opacity -= 0.02;
    
    return this.material.opacity > 0 && this.scale.x > 0.02;
  }
}

// --- Bouncy Ball (びよんびよん跳ねて投げまくるでっかいボール) ---
class BouncyBall {
  constructor(x, y, z, radius = 2.0, colorHex = 0xff007f) {
    this.radius = radius;
    this.color = colorHex;
    this.isThrown = false;
    this.throwCooldown = 0; // 投げた直後に再度プレイヤーに吸着するのを防ぐクールダウン
    
    this.mesh = new THREE.Group();
    
    // ボール本体 (光沢マテリアル)
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshPhysicalMaterial({
      color: this.color,
      roughness: 0.12,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });
    this.sphere = new THREE.Mesh(geo, mat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
    this.mesh.add(this.sphere);
    
    // バンド模様
    const ringGeo = new THREE.TorusGeometry(radius * 1.01, radius * 0.08, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    this.mesh.add(ring);
    
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = (Math.random() - 0.5) * 0.8;
    this.vy = Math.random() * 0.3 + 0.1;
    this.vz = (Math.random() - 0.5) * 0.8;
    
    // びよんびよん変形用
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.scaleZ = 1.0;
    
    this.mesh.position.set(x, y, z);
    state.scene.add(this.mesh);
  }
  
  bounce(dir) {
    playSound('bounce', 0.85 + Math.random() * 0.3);
    if (dir === 'y') {
      this.scaleY = 0.45;
      this.scaleX = 1.35;
      this.scaleZ = 1.35;
    } else if (dir === 'x') {
      this.scaleX = 0.45;
      this.scaleY = 1.35;
      this.scaleZ = 1.35;
    } else if (dir === 'z') {
      this.scaleZ = 0.45;
      this.scaleY = 1.35;
      this.scaleX = 1.35;
    }
  }
  
  update() {
    // 物理移動
    this.vy += state.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;
    
    if (this.throwCooldown > 0) this.throwCooldown--;
    
    // アリーナ境界衝突
    const w = state.arenaWidth / 2 - this.radius;
    const d = state.arenaDepth / 2 - this.radius;
    const ceil = state.arenaHeight - this.radius;
    const floor = this.radius;
    
    // 床バウンド
    if (this.y < floor) {
      this.y = floor;
      this.vy = -this.vy * 0.94; // 高反発
      this.vx *= 0.99;
      this.vz *= 0.99;
      if (Math.abs(this.vy) > 0.04) this.bounce('y');
    }
    // 天井
    if (this.y > ceil) {
      this.y = ceil;
      this.vy = -this.vy * 0.94;
      if (Math.abs(this.vy) > 0.04) this.bounce('y');
    }
    // 壁 X
    if (this.x < -w) {
      this.x = -w;
      this.vx = -this.vx * 0.94;
      if (Math.abs(this.vx) > 0.04) this.bounce('x');
    }
    if (this.x > w) {
      this.x = w;
      this.vx = -this.vx * 0.94;
      if (Math.abs(this.vx) > 0.04) this.bounce('x');
    }
    // 壁 Z
    if (this.z < -d) {
      this.z = -d;
      this.vz = -this.vz * 0.94;
      if (Math.abs(this.vz) > 0.04) this.bounce('z');
    }
    if (this.z > d) {
      this.z = d;
      this.vz = -this.vz * 0.94;
      if (Math.abs(this.vz) > 0.04) this.bounce('z');
    }
    
    // 投げられた時の速度減衰チェック
    if (this.isThrown && Math.hypot(this.vx, this.vz) < 0.25) {
      this.isThrown = false;
    }
    
    // スケール復元イージング
    this.scaleX += (1.0 - this.scaleX) * 0.12;
    this.scaleY += (1.0 - this.scaleY) * 0.12;
    this.scaleZ += (1.0 - this.scaleZ) * 0.12;
    
    this.sphere.scale.set(this.scaleX, this.scaleY, this.scaleZ);
    this.mesh.position.set(this.x, this.y, this.z);
    
    // バウンドエフェクト
    if (this.scaleX < 0.75 || this.scaleY < 0.75 || this.scaleZ < 0.75) {
      if (Math.random() < 0.3) {
        const sp = new GameParticle(this.x, this.y - this.radius * 0.8, this.z, this.color, 0.2);
        state.scene.add(sp);
        state.particles.push(sp);
      }
    }
  }
}

// --- Jelly Monster (ぷにぷにゼリーモンスター) ---
class JellyMonster {
  constructor(x, z, size = 1.8) {
    this.size = size;
    this.mesh = new THREE.Group();
    
    // ボディ (お祭り提灯の山吹色)
    const geo = new THREE.CylinderGeometry(size * 0.8, size, size, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85
    });
    this.body = new THREE.Mesh(geo, mat);
    this.body.position.y = size / 2;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.mesh.add(this.body);
    
    // 大きな目
    const eyeGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0b0f19 });
    
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.55, size * 0.7, size * 0.85);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), pupilMat);
    pupilL.position.set(-0.55, size * 0.7, size * 0.85 + 0.24);
    this.mesh.add(eyeL);
    this.mesh.add(pupilL);
    
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.55, size * 0.7, size * 0.85);
    const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), pupilMat);
    pupilR.position.set(0.55, size * 0.7, size * 0.85 + 0.24);
    this.mesh.add(eyeR);
    this.mesh.add(pupilR);
    
    this.x = x;
    this.y = 0;
    this.z = z;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0.05 + Math.random() * 0.03;
    
    this.mesh.position.set(x, this.y, z);
    state.scene.add(this.mesh);
  }
  
  update(px, pz) {
    const dx = px - this.x;
    const dz = pz - this.z;
    const dist = Math.hypot(dx, dz);
    
    if (dist > 1.0) {
      this.angle = Math.atan2(dx, dz);
      this.x += Math.sin(this.angle) * this.speed;
      this.z += Math.cos(this.angle) * this.speed;
    }
    
    // ぷにぷに歩行アニメーション
    this.body.scale.y = 1.0 + Math.sin(performance.now() * 0.02) * 0.12;
    this.body.scale.x = 1.0 - Math.sin(performance.now() * 0.02) * 0.06;
    this.body.scale.z = 1.0 - Math.sin(performance.now() * 0.02) * 0.06;
    
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
  }
}

// --- Player (手足に関節(ひざ・ひじ)がある人間ロボット) ---
function buildPlayer() {
  state.player = new THREE.Group();
  
  // 1. 胴体 (朱赤の法被)
  const bodyGeo = new THREE.BoxGeometry(1.6, 1.8, 1.2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9381e, roughness: 0.35 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.8;
  body.castShadow = true;
  body.receiveShadow = true;
  state.player.add(body);
  
  // 2. 頭 (白木・白)
  const headGeo = new THREE.SphereGeometry(0.7, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 3.0;
  head.castShadow = true;
  state.player.add(head);
  
  // ハチマキ (藍染のハチマキ)
  const bandGeo = new THREE.TorusGeometry(0.72, 0.08, 6, 24);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x1d3557 });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.set(0, 3.1, 0);
  band.rotation.x = Math.PI / 8;
  state.player.add(band);
  
  // 3. 目 (漆黒のゴーグル)
  const goggleGeo = new THREE.BoxGeometry(1.0, 0.3, 0.2);
  const goggleMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const goggles = new THREE.Mesh(goggleGeo, goggleMat);
  goggles.position.set(0, 3.0, 0.6);
  state.player.add(goggles);
  
  // マテリアル & ジオメトリ定義
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.4 }); // 藍色
  const jointMat = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.3 }); // 関節はゴールド山吹色でメカっぽく！
  
  const upperLegGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.6, 8);
  const lowerLegGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.6, 8);
  const jointGeo = new THREE.SphereGeometry(0.18, 8, 8);
  
  const upperArmGeo = new THREE.CylinderGeometry(0.15, 0.14, 0.6, 8);
  const lowerArmGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
  
  // 4. 左脚グループ (左付け根位置: y=1.0)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.45, 1.0, 0);
  
  const leftThigh = new THREE.Mesh(upperLegGeo, limbMat);
  leftThigh.position.y = -0.3;
  leftThigh.castShadow = true;
  leftLeg.add(leftThigh);
  
  const leftKnee = new THREE.Mesh(jointGeo, jointMat);
  leftKnee.position.y = -0.6;
  leftLeg.add(leftKnee);
  
  const leftShinGroup = new THREE.Group();
  leftShinGroup.position.set(0, -0.6, 0);
  const leftShin = new THREE.Mesh(lowerLegGeo, limbMat);
  leftShin.position.y = -0.3;
  leftShin.castShadow = true;
  leftShinGroup.add(leftShin);
  
  // 足先
  const footGeo = new THREE.BoxGeometry(0.24, 0.12, 0.4);
  const leftFoot = new THREE.Mesh(footGeo, limbMat);
  leftFoot.position.set(0, -0.6, 0.1);
  leftShinGroup.add(leftFoot);
  
  leftLeg.add(leftShinGroup);
  state.player.add(leftLeg);
  
  // 5. 右脚グループ (右付け根位置: y=1.0)
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.45, 1.0, 0);
  
  const rightThigh = new THREE.Mesh(upperLegGeo, limbMat);
  rightThigh.position.y = -0.3;
  rightThigh.castShadow = true;
  rightLeg.add(rightThigh);
  
  const rightKnee = new THREE.Mesh(jointGeo, jointMat);
  rightKnee.position.y = -0.6;
  rightLeg.add(rightKnee);
  
  const rightShinGroup = new THREE.Group();
  rightShinGroup.position.set(0, -0.6, 0);
  const rightShin = new THREE.Mesh(lowerLegGeo, limbMat);
  rightShin.position.y = -0.3;
  rightShin.castShadow = true;
  rightShinGroup.add(rightShin);
  
  const rightFoot = new THREE.Mesh(footGeo, limbMat);
  rightFoot.position.set(0, -0.6, 0.1);
  rightShinGroup.add(rightFoot);
  
  rightLeg.add(rightShinGroup);
  state.player.add(rightLeg);
  
  // 6. 左腕グループ (肩位置: y=1.8)
  const leftArm = new THREE.Group();
  leftArm.position.set(-1.0, 1.8, 0);
  
  const leftUpperArm = new THREE.Mesh(upperArmGeo, limbMat);
  leftUpperArm.position.y = -0.3;
  leftUpperArm.castShadow = true;
  leftArm.add(leftUpperArm);
  
  const leftElbow = new THREE.Mesh(jointGeo, jointMat);
  leftElbow.position.y = -0.6;
  leftArm.add(leftElbow);
  
  const leftForeArmGroup = new THREE.Group();
  leftForeArmGroup.position.set(0, -0.6, 0);
  const leftForeArm = new THREE.Mesh(lowerArmGeo, limbMat);
  leftForeArm.position.y = -0.3;
  leftForeArm.castShadow = true;
  leftForeArmGroup.add(leftForeArm);
  
  leftArm.add(leftForeArmGroup);
  state.player.add(leftArm);
  
  // 7. 右腕グループ (肩位置: y=1.8)
  const rightArm = new THREE.Group();
  rightArm.position.set(1.0, 1.8, 0);
  
  const rightUpperArm = new THREE.Mesh(upperArmGeo, limbMat);
  rightUpperArm.position.y = -0.3;
  rightUpperArm.castShadow = true;
  rightArm.add(rightUpperArm);
  
  const rightElbow = new THREE.Mesh(jointGeo, jointMat);
  rightElbow.position.y = -0.6;
  rightArm.add(rightElbow);
  
  const rightForeArmGroup = new THREE.Group();
  rightForeArmGroup.position.set(0, -0.6, 0);
  const rightForeArm = new THREE.Mesh(lowerArmGeo, limbMat);
  rightForeArm.position.y = -0.3;
  rightForeArm.castShadow = true;
  rightForeArmGroup.add(rightForeArm);
  
  rightArm.add(rightForeArmGroup);
  state.player.add(rightArm);
  
  state.scene.add(state.player);
}

// --- Setup Arena ---
function buildArena() {
  const arenaGroup = new THREE.Group();
  
  // 床 (白木・檜のアイボリーベージュ)
  const floorGeo = new THREE.BoxGeometry(state.arenaWidth, 1.0, state.arenaDepth);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xfdf6e2, roughness: 0.7 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  arenaGroup.add(floor);
  
  // 壁 (鳥居の朱赤)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9381e, roughness: 0.55 });
  const w = state.arenaWidth;
  const d = state.arenaDepth;
  const h = state.arenaHeight;
  
  // 壁配置
  const wallB = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.0), wallMat);
  wallB.position.set(0, h / 2, -d / 2 - 1.0);
  arenaGroup.add(wallB);
  
  const wallF = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.0), wallMat);
  wallF.position.set(0, h / 2, d / 2 + 1.0);
  arenaGroup.add(wallF);
  
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(2.0, h, d), wallMat);
  wallL.position.set(-w / 2 - 1.0, h / 2, 0);
  arenaGroup.add(wallL);
  
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(2.0, h, d), wallMat);
  wallR.position.set(w / 2 + 1.0, h / 2, 0);
  arenaGroup.add(wallR);
  
  // グリッド線 (漆黒・墨色の格子)
  const gridHelper = new THREE.GridHelper(w, 20, 0x2c2c2c, 0x2c2c2c);
  gridHelper.position.y = 0.05;
  arenaGroup.add(gridHelper);
  
  state.scene.add(arenaGroup);
}

// --- Initialize 3D Engine ---
function init3D() {
  const container = document.getElementById('canvas-container');
  container.innerHTML = '';
  
  // Scene (日本晴れの瑠璃色の空)
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x8ecae6);
  state.scene.fog = new THREE.FogExp2(0x8ecae6, 0.006);
  
  // Camera (固定俯瞰の三人称視点)
  state.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 500);
  
  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(state.renderer.domElement);
  
  // Lights (からっと晴れた強い陽光)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  state.scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0xfffcf2, 1.1); // 強い日差し
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  state.scene.add(sunLight);
  
  // Arena, Player, Balls
  buildArena();
  buildPlayer();
  
  // 初期ボール3個 (漆朱赤、山吹金、若竹緑)
  state.balls = [
    new BouncyBall(-15, 12, -15, 2.2, 0xd9381e), // 漆の朱赤
    new BouncyBall(15, 15, -15, 2.0, 0xffb703),  // 山吹ゴールド
    new BouncyBall(0, 18, 15, 2.5, 0x1b4332)     // 若竹の深緑
  ];
  
  state.monsters = [];
  state.particles = [];
  
  // カメラ初期位置
  state.camera.position.set(0, 18, 22);
  state.camera.lookAt(new THREE.Vector3(0, 1.0, 0));
  
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (state.camera && state.renderer) {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// --- Spawn Jelly Monsters ---
function spawnMonster() {
  if (state.gameState !== 'playing') return;
  
  const w = state.arenaWidth / 2 - 4.0;
  const d = state.arenaDepth / 2 - 4.0;
  
  let rx = (Math.random() - 0.5) * w * 2;
  let rz = (Math.random() - 0.5) * d * 2;
  
  const p = state.playerPhysics;
  while (Math.hypot(rx - p.x, rz - p.z) < 15.0) {
    rx = (Math.random() - 0.5) * w * 2;
    rz = (Math.random() - 0.5) * d * 2;
  }
  
  const monster = new JellyMonster(rx, rz, 1.8 + Math.random() * 0.5);
  state.monsters.push(monster);
  
  // 出現時エフェクト
  for (let i = 0; i < 5; i++) {
    const sp = new GameParticle(rx, 0.5, rz, 0xffb703, 0.25);
    state.scene.add(sp);
    state.particles.push(sp);
  }
}

// --- Game Engine Physics Updates ---

function updatePlayer() {
  const p = state.playerPhysics;
  const k = state.player;
  if (!k) return;
  
  // 1. 直感的な絶対方向キー移動 (視点固定での8方向移動)
  let dx = 0;
  let dz = 0;
  
  if (state.keys.forward) dz -= 1.0;
  if (state.keys.backward) dz += 1.0;
  if (state.keys.left) dx -= 1.0;
  if (state.keys.right) dx += 1.0;
  
  const len = Math.hypot(dx, dz);
  let isMoving = false;
  
  if (len > 0.01) {
    isMoving = true;
    p.vx = (dx / len) * p.speed;
    p.vz = (dz / len) * p.speed;
    
    // 入力方向へアングルを即座に向ける
    p.angle = Math.atan2(dx, dz);
  } else {
    p.vx *= 0.75;
    p.vz *= 0.75;
    if (Math.hypot(p.vx, p.vz) < 0.01) {
      p.vx = 0;
      p.vz = 0;
    }
  }
  
  p.x += p.vx;
  p.z += p.vz;
  
  // 境界クランプ
  const w = state.arenaWidth / 2 - p.radius;
  const d = state.arenaDepth / 2 - p.radius;
  if (p.x < -w) p.x = -w;
  if (p.x > w) p.x = w;
  if (p.z < -d) p.z = -d;
  if (p.z > d) p.z = d;
  
  k.position.set(p.x, 1.0, p.z);
  k.rotation.y = p.angle;
  
  // 手足のびよんびよんアニメーション (歩行時: 関節をひじ・ひざで曲げる)
  const legL = k.children[4];
  const legR = k.children[5];
  const armL = k.children[6];
  const rightArm = k.children[7];
  
  if (isMoving) {
    const cycle = performance.now() * 0.016; // 小走りテンポ
    
    // 1. 太もも・二の腕のスイング
    legL.rotation.x = Math.sin(cycle) * 0.6;
    legR.rotation.x = -Math.sin(cycle) * 0.6;
    
    armL.rotation.x = -Math.sin(cycle) * 0.55;
    rightArm.rotation.x = Math.sin(cycle) * 0.55;
    
    // 2. ひざ・ひじの屈曲 (グループのインデックス2にある shinGroup / foreArmGroup を曲げる)
    // 脚が後ろにスイングした時にひざが後ろに折れる (膝関節の可動域制限を表現)
    legL.children[2].rotation.x = Math.max(0, -Math.sin(cycle) * 0.7);
    legR.children[2].rotation.x = Math.max(0, Math.sin(cycle) * 0.7);
    
    // 腕が前に振られるときにひじが軽く曲がる
    armL.children[2].rotation.x = -Math.max(0.1, -Math.sin(cycle) * 0.5);
    rightArm.children[2].rotation.x = -Math.max(0.1, Math.sin(cycle) * 0.5);
  } else {
    // 待機状態 (関節を伸ばす)
    legL.rotation.x = 0;
    legR.rotation.x = 0;
    armL.rotation.x = 0;
    rightArm.rotation.x = 0;
    
    legL.children[2].rotation.x = 0;
    legR.children[2].rotation.x = 0;
    armL.children[2].rotation.x = 0;
    rightArm.children[2].rotation.x = 0;
  }
}

function updateCamera() {
  if (!state.player) return;
  const p = state.playerPhysics;
  
  // カメラの高さを 15.0 から 6.5 に下げて、より「横（水平に近い角度）」から並走するアングルにする
  const targetCamPos = new THREE.Vector3(p.x, 6.5, p.z + 18.0);
  state.camera.position.lerp(targetCamPos, 0.1);
  
  // プレイヤーの胸元あたりを見つめる
  const lookTarget = new THREE.Vector3(p.x, 1.6, p.z);
  state.camera.lookAt(lookTarget);
}

function checkCollisions() {
  const p = state.playerPhysics;
  const kp = state.player.position;
  
  // 1. ボールがプレイヤー（人間）に当たったら、自動で近くの敵に投げまくる！
  state.balls.forEach(ball => {
    // 投げられた直後のクールダウン中はキャッチしない
    if (ball.throwCooldown > 0) return;
    
    const bp = ball.mesh.position;
    const dist = kp.distanceTo(bp);
    
    // ボールとプレイヤーが激突したとき
    if (dist < p.radius + ball.radius) {
      playSound('catch', 1.0);
      
      // アリーナ内の「最も近いモンスター」を自動探索
      let targetMonster = null;
      let minMDist = Infinity;
      
      state.monsters.forEach(m => {
        const mDist = Math.hypot(m.x - p.x, m.z - p.z);
        if (mDist < minMDist) {
          minMDist = mDist;
          targetMonster = m;
        }
      });
      
      // 投げつける方向（アングル）の決定
      let throwAngle = p.angle; // デフォルトはプレイヤーの向き
      if (targetMonster) {
        // モンスターがいる方向へエイム
        throwAngle = Math.atan2(targetMonster.x - p.x, targetMonster.z - p.z);
      }
      
      // ボールをその方向に投げつける！
      ball.x = p.x + Math.sin(throwAngle) * (p.radius + ball.radius + 0.2);
      ball.z = p.z + Math.cos(throwAngle) * (p.radius + ball.radius + 0.2);
      ball.y = 2.0; // 手の高さから射出
      
      ball.vx = Math.sin(throwAngle) * 1.65;
      ball.vz = Math.cos(throwAngle) * 1.65;
      ball.vy = 0.25; // やや斜め上
      
      ball.isThrown = true;
      ball.throwCooldown = 18; // 0.3秒間は再キャッチをブロック
      
      playSound('throw', 1.0 + Math.random() * 0.25);
      showFloatMessage("オートスロー！ ⚡☄️", '#d9381e');
      
      // 射出火花 (朱赤)
      for (let i = 0; i < 6; i++) {
        const sp = new GameParticle(ball.x, ball.y, ball.z, 0xd9381e, 0.22);
        state.scene.add(sp);
        state.particles.push(sp);
      }
    }
  });
  
  // 2. 投げられたボール vs モンスターの衝突
  state.balls.forEach(ball => {
    state.monsters = state.monsters.filter(monster => {
      const bp = ball.mesh.position;
      const mp = monster.mesh.position;
      const dist = bp.distanceTo(new THREE.Vector3(mp.x, mp.y + monster.size/2, mp.z));
      
      if (dist < ball.radius + monster.size) {
        // 撃破！
        playSound('hit', 1.0 + Math.random() * 0.2);
        state.scene.remove(monster.mesh);
        
        // 投げられたボールなら高スコア
        const addScore = ball.isThrown ? 120 : 40;
        state.score += addScore;
        showFloatMessage(`モンスター撃破！ +${addScore} pts`, '#d9381e');
        
        // 撃破時の紙吹雪 (朱赤/白/金のおめでたい配色)
        const pColors = [0xd9381e, 0xffffff, 0xffb703];
        for (let i = 0; i < 15; i++) {
          const c = pColors[Math.floor(Math.random() * pColors.length)];
          const sp = new GameParticle(mp.x, mp.y + monster.size/2, mp.z, c, 0.24);
          state.scene.add(sp);
          state.particles.push(sp);
        }
        
        // ★ モンスターを撃破した際、たまに新しいボールがアリーナにポップする！ (ボール上限 6個)
        if (Math.random() < 0.35 && state.balls.length < 6) {
          const newColors = [0xd9381e, 0xffb703, 0x1b4332, 0xffffff];
          const c = newColors[Math.floor(Math.random() * newColors.length)];
          const newBall = new BouncyBall(mp.x, 15, mp.z, 1.8 + Math.random() * 0.6, c);
          state.balls.push(newBall);
          playSound('spawn');
          showFloatMessage("ボールが追加された！ 🥎✨", '#ffb703');
        }
        
        // ボールの反射
        const dx = bp.x - mp.x;
        const dz = bp.z - mp.z;
        const len = Math.hypot(dx, dz) || 1;
        ball.vx = (dx / len) * 0.6;
        ball.vz = (dz / len) * 0.6;
        ball.vy = 0.22;
        ball.bounce('y');
        
        return false;
      }
      return true;
    });
  });
  
  // 3. ボール同士の衝突 (弾き合い)
  for (let i = 0; i < state.balls.length; i++) {
    for (let j = i + 1; j < state.balls.length; j++) {
      const bA = state.balls[i];
      const bB = state.balls[j];
      
      const posA = bA.mesh.position;
      const posB = bB.mesh.position;
      const dist = posA.distanceTo(posB);
      const minDistance = bA.radius + bB.radius;
      
      if (dist < minDistance) {
        const dirX = posA.x - posB.x;
        const dirZ = posA.z - posB.z;
        const len = Math.hypot(dirX, dirZ) || 1;
        const force = 0.25;
        
        bA.vx += (dirX / len) * force;
        bA.vz += (dirZ / len) * force;
        bB.vx -= (dirX / len) * force;
        bB.vz -= (dirZ / len) * force;
        
        bA.bounce('x');
        bB.bounce('z');
      }
    }
  }
}

function updateParticles() {
  state.particles = state.particles.filter(part => {
    const keep = part.update();
    if (!keep) {
      state.scene.remove(part);
    }
    return keep;
  });
}

// --- Float Message Banner ---
function showFloatMessage(text, color) {
  const container = document.getElementById('float-message');
  container.textContent = text;
  container.style.color = color;
  container.classList.add('show');
  
  if (state.msgTimeout) clearTimeout(state.msgTimeout);
  state.msgTimeout = setTimeout(() => {
    container.classList.remove('show');
  }, 1600);
}

// --- Game Control ---

function startGame() {
  initAudio();
  init3D();
  setupControls();
  
  state.gameState = 'playing';
  state.score = 0;
  state.time = 60.0;
  state.startTime = performance.now();
  
  // プレイヤー物理リセット
  const p = state.playerPhysics;
  p.x = 0; p.z = 0; p.vx = 0; p.vz = 0; p.angle = 0;
  
  document.getElementById('lobby-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  
  updateHUD();
  showFloatMessage("投げまくりバトル開始！ ☄️", '#00f5d4');
  
  // モンスター出現ループ
  if (state.spawnInterval) clearInterval(state.spawnInterval);
  state.spawnInterval = setInterval(spawnMonster, 2800); // 2.8秒間隔
  
  animate();
}

function finishGame() {
  state.gameState = 'gameover';
  if (state.spawnInterval) clearInterval(state.spawnInterval);
  
  // ハイスコア更新
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem('game5_best_score', state.bestScore);
    document.getElementById('best-score').textContent = state.bestScore;
  }
  
  document.getElementById('result-score').textContent = state.score;
  const msg = document.getElementById('result-message');
  if (state.score >= 1200) {
    msg.innerHTML = `<span style="color: #00f5d4; font-weight: 900;">👑 投げまくりマスター！ 👑</span><br>驚異の反射スピードです！素晴らしい！`;
  } else if (state.score >= 600) {
    msg.textContent = 'ナイスアタック！ボールに当たりにいってモンスターをたくさん撃破できました！';
  } else {
    msg.textContent = '跳ね回るボールに自らぶつかりにいき、モンスターに自動で投げまくろう！';
  }
  
  document.getElementById('result-dialog').showModal();
}

function quitGame() {
  state.gameState = 'lobby';
  document.getElementById('result-dialog').close();
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('lobby-screen').classList.add('active');
  
  const container = document.getElementById('canvas-container');
  container.innerHTML = '';
}

function toggleMute() {
  state.muted = !state.muted;
  document.getElementById('mute-btn').textContent = state.muted ? '🔇' : '🔊';
}

function updateHUD() {
  document.getElementById('score-val').textContent = state.score;
  document.getElementById('time-val').textContent = state.time.toFixed(2);
  document.getElementById('balls-val').textContent = state.balls.length;
}

// --- Animation Loop ---
function animate() {
  if (state.gameState !== 'playing') return;
  requestAnimationFrame(animate);
  
  // 1. タイマー更新
  const elapsed = (performance.now() - state.startTime) / 1000;
  state.time = Math.max(0, 60.0 - elapsed);
  
  if (state.time <= 0) {
    finishGame();
    return;
  }
  
  // 2. エンティティ物理更新
  updatePlayer();
  updateCamera();
  
  state.balls.forEach(ball => ball.update());
  state.monsters.forEach(m => m.update(state.playerPhysics.x, state.playerPhysics.z));
  
  checkCollisions();
  updateParticles();
  
  // 3. レンダリング
  if (state.renderer && state.scene && state.camera) {
    state.renderer.render(state.scene, state.camera);
  }
  
  updateHUD();
}

// --- Setup Dialog Event listeners ---
document.getElementById('restart-btn').addEventListener('click', () => {
  document.getElementById('result-dialog').close();
  startGame();
});

document.getElementById('quit-btn').addEventListener('click', () => {
  quitGame();
});

// ハイスコア読み込み
const savedBest = localStorage.getItem('game5_best_score');
if (savedBest) {
  state.bestScore = parseInt(savedBest, 10);
  document.getElementById('best-score').textContent = state.bestScore;
}
