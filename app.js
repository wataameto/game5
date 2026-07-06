// --- game5: Bouncy Ball Catch & Auto-Throw 3D (Shinto Shrine Vivid Theme) ---

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
  player: null, // 多関節プレイヤーのGroup
  balls: [],
  monsters: [],
  particles: [],
  
  // Arena Settings (Shinto Vermilion & Ivory Theme)
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
    speed: 0.38,
    radius: 1.4,
    throwCooldown: 0
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
    // ふんわり巨大ボールに合わせた、低めで豊かな「ポワ〜ン」音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(50 * pitch, now + 0.35);
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
    
    osc.start(now);
    osc.stop(now + 0.35);
  } else if (type === 'throw') {
    // 投げまくる「シュバッ！」という超高速音
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(150 * pitch, now + 0.12);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
    
    osc.start(now);
    osc.stop(now + 0.12);
  } else if (type === 'hit') {
    // モンスター撃破時の爽快な破裂音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(250 * pitch, now + 0.3);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
    
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === 'spawn') {
    // ボールが追加された時の「ポワポワ」音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(550, now + 0.22);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
    
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

// --- Game Particles ---
class GameParticle extends THREE.Mesh {
  constructor(x, y, z, color = 0xffffff, size = 0.35) {
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.95 // よりくっきりした不透明度
    });
    super(geo, mat);
    this.position.set(x, y, z);
    
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = Math.random() * 0.25 + 0.05;
    this.vz = (Math.random() - 0.5) * 0.3;
    this.decay = 0.95;
  }
  
  update() {
    this.position.x += this.vx;
    this.position.y += this.vy;
    this.position.z += this.vz;
    this.vy += state.gravity * 0.4; // 軽めの落下
    
    this.scale.multiplyScalar(this.decay);
    this.material.opacity -= 0.022; // 少し早めに消して軽快に
    
    return this.material.opacity > 0 && this.scale.x > 0.02;
  }
}

// --- Bouncy Ball (大きくてふんわり弾む大量のボール) ---
class BouncyBall {
  constructor(x, y, z, radius = 4.0, colorHex = 0xd9381e) {
    this.radius = radius;
    this.color = colorHex;
    this.isThrown = false;
    this.throwCooldown = 0;
    
    this.mesh = new THREE.Group();
    
    // 巨大な球体 (漆器や金箔のようなビビッドで光沢のある質感)
    const geo = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshPhysicalMaterial({
      color: this.color,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05
    });
    this.sphere = new THREE.Mesh(geo, mat);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
    this.mesh.add(this.sphere);
    
    // 手まりの帯のような白いリング模様 (くっきり太め)
    const ringGeo = new THREE.TorusGeometry(radius * 1.01, radius * 0.08, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    this.mesh.add(ring);
    
    this.x = x;
    this.y = y;
    this.z = z;
    
    // ふんわりとした初速
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = Math.random() * 0.2 + 0.1;
    this.vz = (Math.random() - 0.5) * 0.5;
    
    // びよんびよん変形係数
    this.scaleX = 1.0;
    this.scaleY = 1.0;
    this.scaleZ = 1.0;
    
    this.mesh.position.set(x, y, z);
    state.scene.add(this.mesh);
  }
  
  bounce(dir) {
    playSound('bounce', 0.8 + Math.random() * 0.3);
    
    // 大きなボールなので、よりダイナミックに「むにゅっ」と歪ませる
    if (dir === 'y') {
      this.scaleY = 0.35;
      this.scaleX = 1.45;
      this.scaleZ = 1.45;
    } else if (dir === 'x') {
      this.scaleX = 0.35;
      this.scaleY = 1.45;
      this.scaleZ = 1.45;
    } else if (dir === 'z') {
      this.scaleZ = 0.35;
      this.scaleY = 1.45;
      this.scaleX = 1.45;
    }
  }
  
  update() {
    // ボールは重力を弱め (0.4倍) にして、ふんわり落下させる
    this.vy += state.gravity * 0.4;
    
    // 空気抵抗を適用してふんわり動く
    this.vx *= 0.994;
    this.vz *= 0.994;
    
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;
    
    if (this.throwCooldown > 0) this.throwCooldown--;
    
    // アリーナ境界衝突判定
    const w = state.arenaWidth / 2 - this.radius;
    const d = state.arenaDepth / 2 - this.radius;
    const ceil = state.arenaHeight - this.radius;
    const floor = this.radius;
    
    // 床バウンド (ふんわりバウンドするように高めの反発 0.96)
    if (this.y < floor) {
      this.y = floor;
      this.vy = -this.vy * 0.96;
      if (Math.abs(this.vy) > 0.03) this.bounce('y');
    }
    // 天井
    if (this.y > ceil) {
      this.y = ceil;
      this.vy = -this.vy * 0.96;
      if (Math.abs(this.vy) > 0.03) this.bounce('y');
    }
    // 壁 X
    if (this.x < -w) {
      this.x = -w;
      this.vx = -this.vx * 0.96;
      if (Math.abs(this.vx) > 0.03) this.bounce('x');
    }
    if (this.x > w) {
      this.x = w;
      this.vx = -this.vx * 0.96;
      if (Math.abs(this.vx) > 0.03) this.bounce('x');
    }
    // 壁 Z
    if (this.z < -d) {
      this.z = -d;
      this.vz = -this.vz * 0.96;
      if (Math.abs(this.vz) > 0.03) this.bounce('z');
    }
    if (this.z > d) {
      this.z = d;
      this.vz = -this.vz * 0.96;
      if (Math.abs(this.vz) > 0.03) this.bounce('z');
    }
    
    // 投げられた時の速度減衰チェック
    if (this.isThrown && Math.hypot(this.vx, this.vz) < 0.2) {
      this.isThrown = false;
    }
    
    // びよんびよん変形からの復元イージングを遅く (0.07) し、むにゅ〜っとゆっくり戻るように
    this.scaleX += (1.0 - this.scaleX) * 0.07;
    this.scaleY += (1.0 - this.scaleY) * 0.07;
    this.scaleZ += (1.0 - this.scaleZ) * 0.07;
    
    this.sphere.scale.set(this.scaleX, this.scaleY, this.scaleZ);
    this.mesh.position.set(this.x, this.y, this.z);
    
    // バウンドエフェクト紙吹雪
    if (this.scaleX < 0.7 || this.scaleY < 0.7 || this.scaleZ < 0.7) {
      if (Math.random() < 0.4) {
        const sp = new GameParticle(this.x, this.y - this.radius * 0.8, this.z, this.color, 0.3);
        state.scene.add(sp);
        state.particles.push(sp);
      }
    }
  }
}

// --- Jelly Monster (提灯型モンスター) ---
class JellyMonster {
  constructor(x, z, size = 1.8) {
    this.size = size;
    this.mesh = new THREE.Group();
    
    // 提灯ボディ (はっきりした山吹ゴールド)
    const geo = new THREE.CylinderGeometry(size * 0.8, size, size, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88
    });
    this.body = new THREE.Mesh(geo, mat);
    this.body.position.y = size / 2;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.mesh.add(this.body);
    
    // 提灯の上下の黒いふち
    const rimGeo = new THREE.CylinderGeometry(size * 0.85, size * 0.85, size * 0.12, 16);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
    
    const rimTop = new THREE.Mesh(rimGeo, rimMat);
    rimTop.position.y = size;
    this.mesh.add(rimTop);
    
    const rimBottom = new THREE.Mesh(rimGeo, rimMat);
    rimBottom.position.y = 0;
    this.mesh.add(rimBottom);
    
    // 大きな目
    const eyeGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.55, size * 0.6, size * 0.85);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), pupilMat);
    pupilL.position.set(-0.55, size * 0.6, size * 0.85 + 0.24);
    this.mesh.add(eyeL);
    this.mesh.add(pupilL);
    
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.55, size * 0.6, size * 0.85);
    const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), pupilMat);
    pupilR.position.set(0.55, size * 0.6, size * 0.85 + 0.24);
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

// --- Player (多関節お祭りロボット人間 - 11箇所可動関節) ---
function buildPlayer() {
  state.player = new THREE.Group();
  
  // 基幹マテリアル (朱赤・深い藍色・純白・山吹金の高コントラスト配色)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9381e, roughness: 0.35 }); // 法被の朱赤
  const innerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }); // 純白
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x1d3557, roughness: 0.4 }); // 藍色
  const jointMat = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.3 }); // 金色関節
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a }); // 墨黒
  
  // 1. 腰 (Pelvis) - キャラクターの起点
  const pelvisGeo = new THREE.BoxGeometry(1.6, 0.5, 1.1);
  const pelvis = new THREE.Mesh(pelvisGeo, limbMat);
  pelvis.position.y = 1.0;
  pelvis.castShadow = true;
  state.player.add(pelvis);
  
  // 2. 胸部 (Chest / Upper Body) - 腰の上の背骨関節を介して接続
  const chestGroup = new THREE.Group();
  chestGroup.position.set(0, 1.15, 0); // 背骨関節の位置
  
  // 背骨関節球体
  const spineJoint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), jointMat);
  chestGroup.add(spineJoint);
  
  const chestGeo = new THREE.BoxGeometry(1.6, 1.2, 1.2);
  const chest = new THREE.Mesh(chestGeo, bodyMat);
  chest.position.y = 0.6; // 関節の少し上にメッシュの中心
  chest.castShadow = true;
  chestGroup.add(chest);
  
  // 3. 首関節 ＆ 頭
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 1.2, 0); // 胸の上端
  
  // 首関節球体
  const neckJoint = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), jointMat);
  neckGroup.add(neckJoint);
  
  const headGeo = new THREE.SphereGeometry(0.65, 16, 16);
  const head = new THREE.Mesh(headGeo, innerMat);
  head.position.y = 0.5;
  head.castShadow = true;
  neckGroup.add(head);
  
  // ハチマキ (藍染)
  const bandGeo = new THREE.TorusGeometry(0.67, 0.08, 6, 24);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0x1d3557 });
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.set(0, 0.6, 0);
  band.rotation.x = Math.PI / 8;
  neckGroup.add(band);
  
  // 目 (ゴーグル)
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 0.2), eyeMat);
  goggles.position.set(0, 0.5, 0.55);
  neckGroup.add(goggles);
  
  chestGroup.add(neckGroup);
  
  // 4. 左腕 (肩関節を胸の左に接続)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.95, 1.0, 0); // 胸の上側左
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), jointMat);
  leftArm.add(lShoulder);
  
  const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.5, 8), limbMat);
  lUpperArm.position.y = -0.25;
  lUpperArm.castShadow = true;
  leftArm.add(lUpperArm);
  
  const lElbow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), jointMat);
  lElbow.position.y = -0.5;
  leftArm.add(lElbow);
  
  const lForeArmGroup = new THREE.Group();
  lForeArmGroup.position.set(0, -0.5, 0);
  const lForeArm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), limbMat);
  lForeArm.position.y = -0.25;
  lForeArm.castShadow = true;
  lForeArmGroup.add(lForeArm);
  
  leftArm.add(lForeArmGroup);
  chestGroup.add(leftArm);
  
  // 5. 右腕 (肩関節を胸の右に接続)
  const rightArm = new THREE.Group();
  rightArm.position.set(0.95, 1.0, 0);
  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), jointMat);
  rightArm.add(rShoulder);
  
  const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.5, 8), limbMat);
  rUpperArm.position.y = -0.25;
  rUpperArm.castShadow = true;
  rightArm.add(rUpperArm);
  
  const rElbow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), jointMat);
  rElbow.position.y = -0.5;
  rightArm.add(rElbow);
  
  const rForeArmGroup = new THREE.Group();
  rForeArmGroup.position.set(0, -0.5, 0);
  const rForeArm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), limbMat);
  rForeArm.position.y = -0.25;
  rForeArm.castShadow = true;
  rForeArmGroup.add(rForeArm);
  
  rightArm.add(rForeArmGroup);
  chestGroup.add(rightArm);
  
  state.player.add(chestGroup);
  
  // 脚部のジオメトリ
  const upperLegGeo = new THREE.CylinderGeometry(0.16, 0.15, 0.5, 8);
  const lowerLegGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.5, 8);
  const footGeo = new THREE.BoxGeometry(0.22, 0.1, 0.35);
  const legJointGeo = new THREE.SphereGeometry(0.16, 8, 8);
  
  // 6. 左脚 (股関節を腰の下に接続)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.45, 0.9, 0); // 腰の下
  const lHip = new THREE.Mesh(legJointGeo, jointMat);
  leftLeg.add(lHip);
  
  const lThigh = new THREE.Mesh(upperLegGeo, limbMat);
  lThigh.position.y = -0.25;
  lThigh.castShadow = true;
  leftLeg.add(lThigh);
  
  const lKnee = new THREE.Mesh(legJointGeo, jointMat);
  lKnee.position.y = -0.5;
  leftLeg.add(lKnee);
  
  const lShinGroup = new THREE.Group();
  lShinGroup.position.set(0, -0.5, 0);
  const lShin = new THREE.Mesh(lowerLegGeo, limbMat);
  lShin.position.y = -0.25;
  lShin.castShadow = true;
  lShinGroup.add(lShin);
  
  // 足首関節 ＋ 足先
  const lAnkle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), jointMat);
  lAnkle.position.y = -0.5;
  lShinGroup.add(lAnkle);
  
  const lFoot = new THREE.Mesh(footGeo, limbMat);
  lFoot.position.set(0, -0.55, 0.08);
  lShinGroup.add(lFoot);
  
  leftLeg.add(lShinGroup);
  state.player.add(leftLeg);
  
  // 7. 右脚
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.45, 0.9, 0);
  const rHip = new THREE.Mesh(legJointGeo, jointMat);
  rightLeg.add(rHip);
  
  const rThigh = new THREE.Mesh(upperLegGeo, limbMat);
  rThigh.position.y = -0.25;
  rThigh.castShadow = true;
  rightLeg.add(rThigh);
  
  const rKnee = new THREE.Mesh(legJointGeo, jointMat);
  rKnee.position.y = -0.5;
  rightLeg.add(rKnee);
  
  const rShinGroup = new THREE.Group();
  rShinGroup.position.set(0, -0.5, 0);
  const rShin = new THREE.Mesh(lowerLegGeo, limbMat);
  rShin.position.y = -0.25;
  rShin.castShadow = true;
  rShinGroup.add(rShin);
  
  const rAnkle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), jointMat);
  rAnkle.position.y = -0.5;
  rShinGroup.add(rAnkle);
  
  const rFoot = new THREE.Mesh(footGeo, limbMat);
  rFoot.position.set(0, -0.55, 0.08);
  rShinGroup.add(rFoot);
  
  rightLeg.add(rShinGroup);
  state.player.add(rightLeg);
  
  state.scene.add(state.player);
}

// --- Setup Arena ---
function buildArena() {
  const arenaGroup = new THREE.Group();
  
  // 床 (くっきりした純白)
  const floorGeo = new THREE.BoxGeometry(state.arenaWidth, 1.0, state.arenaDepth);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  arenaGroup.add(floor);
  
  // 壁 (鮮烈な鳥居の朱赤)
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
  
  // グリッド線 (引き締まった漆黒・墨色の格子)
  const gridHelper = new THREE.GridHelper(w, 20, 0x000000, 0x000000);
  gridHelper.position.y = 0.05;
  arenaGroup.add(gridHelper);
  
  state.scene.add(arenaGroup);
}

// --- Initialize 3D Engine ---
function init3D() {
  const container = document.getElementById('canvas-container');
  container.innerHTML = '';
  
  // Scene (はっきりとした日本晴れの青空)
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x00bbf9); // ビビッドなコバルトブルー
  // ★ パステル感をなくすため、もや(フォグ)を完全無効化してくっきり化！
  state.scene.fog = null;
  
  // Camera (固定俯瞰の三人称視点)
  state.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 500);
  
  // Renderer
  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(state.renderer.domElement);
  
  // Lights (からっと晴れた強い影を出す陽光)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  state.scene.add(ambientLight);
  
  const sunLight = new THREE.DirectionalLight(0xfffcf2, 1.2); // より強い日差し
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  state.scene.add(sunLight);
  
  // Arena, Player, Balls
  buildArena();
  buildPlayer();
  
  // ★ ボールは大きくて大量！(漆器朱赤、山吹金、お祭り紺)
  state.balls = [
    new BouncyBall(-16, 15, -16, 4.4, 0xd9381e), // 漆の朱赤
    new BouncyBall(16, 18, -16, 3.8, 0xffb703), // 山吹ゴールド
    new BouncyBall(0, 20, 16, 4.6, 0x1d3557),  // お祭りネイビー
    new BouncyBall(-18, 12, 18, 3.5, 0xd9381e),
    new BouncyBall(18, 16, 18, 4.2, 0xffb703),
    new BouncyBall(-5, 22, -10, 3.9, 0x1d3557),
    new BouncyBall(10, 14, 0, 4.5, 0xd9381e)
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
  while (Math.hypot(rx - p.x, rz - p.z) < 18.0) {
    rx = (Math.random() - 0.5) * w * 2;
    rz = (Math.random() - 0.5) * d * 2;
  }
  
  const monster = new JellyMonster(rx, rz, 1.8 + Math.random() * 0.5);
  state.monsters.push(monster);
  
  // 出現時エフェクト (山吹ゴールド)
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
  
  // 多関節キャラクターパーツのアニメーション
  const chestGroup = k.children[1];
  const neckGroup = chestGroup.children[2];
  const armL = chestGroup.children[3];
  const armR = chestGroup.children[4];
  
  const legL = k.children[2];
  const legR = k.children[3];
  
  if (isMoving) {
    const cycle = performance.now() * 0.018; // 小走り
    
    // 1. 腰/胸の関節: 走るときに前傾姿勢になり、お尻がクネクネ左右に揺れる
    chestGroup.rotation.x = 0.2; // 前傾
    chestGroup.rotation.y = Math.sin(cycle) * 0.15; // 左右ねじれ
    
    // 2. 首/頭の関節: 走るリズムに合わせて「コクコクとうなずく」ように前後に揺れる！
    neckGroup.rotation.x = Math.max(-0.1, Math.sin(cycle * 2.0) * 0.15);
    
    // 3. 太もも ＆ 二の腕の振り
    legL.rotation.x = Math.sin(cycle) * 0.65;
    legR.rotation.x = -Math.sin(cycle) * 0.65;
    
    armL.rotation.x = -Math.sin(cycle) * 0.6;
    armR.rotation.x = Math.sin(cycle) * 0.6;
    
    // 4. ひざ・ひじの関節屈曲
    legL.children[3].rotation.x = Math.max(0, -Math.sin(cycle) * 0.85); // 後ろ脚のひざが曲がる
    legR.children[3].rotation.x = Math.max(0, Math.sin(cycle) * 0.85);
    
    armL.children[3].rotation.x = -Math.max(0.15, -Math.sin(cycle) * 0.65); // ひじ
    armR.children[3].rotation.x = -Math.max(0.15, Math.sin(cycle) * 0.65);
  } else {
    // 待機状態 (関節をニュートラルに伸ばす)
    chestGroup.rotation.x = 0;
    chestGroup.rotation.y = 0;
    neckGroup.rotation.x = 0;
    
    legL.rotation.x = 0;
    legR.rotation.x = 0;
    armL.rotation.x = 0;
    armR.rotation.x = 0;
    
    legL.children[3].rotation.x = 0;
    legR.children[3].rotation.x = 0;
    armL.children[3].rotation.x = 0;
    armR.children[3].rotation.x = 0;
    
    const breath = Math.sin(performance.now() * 0.003) * 0.04;
    chestGroup.rotation.x = breath;
    neckGroup.rotation.x = -breath;
  }
}

// 🎥 視点固定（ぐるぐるしない）の三人称平行追従カメラ
function updateCamera() {
  if (!state.player) return;
  const p = state.playerPhysics;
  
  // カメラは回転せず、常にプレイヤーの手前上空 (0, 6.5, 18.0) から並走する
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
    if (ball.throwCooldown > 0) return;
    
    const bp = ball.mesh.position;
    const dist = kp.distanceTo(bp);
    
    if (dist < p.radius + ball.radius * 0.95) {
      playSound('catch', 1.0);
      
      // 最も近いモンスターを自動エイム
      let targetMonster = null;
      let minMDist = Infinity;
      
      state.monsters.forEach(m => {
        const mDist = Math.hypot(m.x - p.x, m.z - p.z);
        if (mDist < minMDist) {
          minMDist = mDist;
          targetMonster = m;
        }
      });
      
      let throwAngle = p.angle;
      if (targetMonster) {
        throwAngle = Math.atan2(targetMonster.x - p.x, targetMonster.z - p.z);
      }
      
      // ボールをその方向に投げつける！
      ball.x = p.x + Math.sin(throwAngle) * (p.radius + ball.radius + 0.5);
      ball.z = p.z + Math.cos(throwAngle) * (p.radius + ball.radius + 0.5);
      ball.y = 2.0;
      
      // 高速で投げ出し、その後空気抵抗でフワッと減速させる
      ball.vx = Math.sin(throwAngle) * 1.8;
      ball.vz = Math.cos(throwAngle) * 1.8;
      ball.vy = 0.28;
      
      ball.isThrown = true;
      ball.throwCooldown = 22;
      
      playSound('throw', 0.9 + Math.random() * 0.2);
      showFloatMessage("オートスロー！ ⚡☄️", '#d9381e');
      
      // 射出火花 (朱赤)
      for (let i = 0; i < 8; i++) {
        const sp = new GameParticle(ball.x, ball.y, ball.z, 0xd9381e, 0.3);
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
        playSound('hit', 0.95 + Math.random() * 0.15);
        state.scene.remove(monster.mesh);
        
        const addScore = ball.isThrown ? 120 : 40;
        state.score += addScore;
        showFloatMessage(`モンスター撃破！ +${addScore} pts`, '#d9381e');
        
        // 撃破時の紙吹雪 (紅白金のおめでたい配色)
        const pColors = [0xd9381e, 0xffffff, 0xffb703];
        for (let i = 0; i < 20; i++) {
          const c = pColors[Math.floor(Math.random() * pColors.length)];
          const sp = new GameParticle(mp.x, mp.y + monster.size/2, mp.z, c, 0.28);
          state.scene.add(sp);
          state.particles.push(sp);
        }
        
        // ★ モンスターを撃破した際、50%の確率で新しい巨大ボールがアリーナにポップする！ (ボール上限 15個)
        if (Math.random() < 0.5 && state.balls.length < 15) {
          const newColors = [0xd9381e, 0xffb703, 0x1d3557, 0xffffff];
          const c = newColors[Math.floor(Math.random() * newColors.length)];
          const r = 3.2 + Math.random() * 1.3;
          const newBall = new BouncyBall(mp.x, 15, mp.z, r, c);
          state.balls.push(newBall);
          playSound('spawn');
          showFloatMessage("巨大ボール追加！ 🥎✨", '#ffb703');
        }
        
        // ボールの反射
        const dx = bp.x - mp.x;
        const dz = bp.z - mp.z;
        const len = Math.hypot(dx, dz) || 1;
        ball.vx = (dx / len) * 0.5;
        ball.vz = (dz / len) * 0.5;
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
        const force = 0.2;
        
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
  showFloatMessage("投げまくりバトル開始！ ☄️", '#d9381e');
  
  // モンスター出現ループ
  if (state.spawnInterval) clearInterval(state.spawnInterval);
  state.spawnInterval = setInterval(spawnMonster, 2500); // 2.5秒間隔
  
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
  if (state.score >= 1500) {
    msg.innerHTML = `<span style="color: #d9381e; font-weight: 900;">👑 伝説のお祭りマスター！ 👑</span><br>驚異のボールコントロールと反射！神業です！`;
  } else if (state.score >= 700) {
    msg.textContent = 'ナイスアタック！巨大ボールを大量に跳ね返してモンスターをなぎ倒しました！';
  } else {
    msg.textContent = '巨大ボールがふんわり跳ねるアリーナ！体当たりでオートスローを連鎖させよう！';
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
