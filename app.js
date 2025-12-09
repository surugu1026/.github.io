
// app.js - iPhone対応＆完全版

// -----------------------------
// 初期設定・キャッシュ
// -----------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// レイアウト上はCSSで拡縮するが、内部解像度固定
canvas.width = 800;
canvas.height = 400;

// スタートオーバーレイ
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");

// タッチボタン
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");

// iOS 音声関連：AudioElement + WebAudio の併用
let audioUnlocked = false;
let audioCtx = null;
const bgm = new Audio("bgm.mp3");
bgm.loop = true;
bgm.preload = "auto"; // 可能なら先読み

// iOSの厳しい制限に備え、最初のタップで両方を解禁
function unlockAudioOnce() {
  if (audioUnlocked) return;

  try {
    // WebAudioの解禁
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const srcNode = audioCtx.createMediaElementSource(bgm);
    srcNode.connect(audioCtx.destination);
  } catch (e) {
    console.log("WebAudio初期化に失敗:", e);
  }

  // HTMLAudioの再生（ユーザー操作イベント内）
  bgm.play().then(() => {
    audioUnlocked = true;
    console.log("BGM再生開始（iOS解禁済み）");
  }).catch(err => {
    console.log("BGM再生失敗:", err);
  });

  // オーバーレイ非表示
  startOverlay.style.display = "none";
}

// 可視状態に応じたBGM制御（バックグラウンド安定化）
document.addEventListener("visibilitychange", () => {
  if (!audioUnlocked) return;
  if (document.hidden) {
    try { bgm.pause(); } catch {}
    try { audioCtx && audioCtx.suspend(); } catch {}
  } else {
    // 再度可視になったら再生を試みる（ユーザー操作不要でもiOSでは一部成功）
    try { audioCtx && audioCtx.resume(); } catch {}
    bgm.play().catch(() => {
      // iOSで失敗しても、次のタッチで再開される
    });
  }
});

// スタートボタン：最初のタップで音解禁＋ゲーム開始
startBtn.addEventListener("click", unlockAudioOnce, { passive: true });
startBtn.addEventListener("touchstart", unlockAudioOnce, { passive: true });

// -----------------------------
// 画像アセットの読み込み
// -----------------------------
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const playerImg = loadImage("Image.png");
const enemyImgs = ["mama.png", "kairi.png", "pocha.png", "papa.png"].map(loadImage);
const bossImg = loadImage("boss.png");
const goalImg = loadImage("mio.png");

// -----------------------------
// ゲームオブジェクト
// -----------------------------
const GROUND_Y = 300; // 800x400 キャンバスでの地面の高さ

const player = {
  x: 50,
  y: GROUND_Y,
  width: 50,
  height: 50,
  speed: 5,
  vy: 0,
  gravity: 0.8,
  jumpPower: -14, // 少し高め（要望対応）
  onGround: true,
};

let enemies = [];
let enemyIndex = 0;
const ENEMY_SPAWN_MS = 1800; // 少し速く（ご要望）
const ENEMY_SPEED = 3.6;     // 速度アップ（ご要望）

let goalReached = false;
let goalZoom = 0; // ゴール時のmio拡大演出用

// ボス
let boss = null;
let bossFalling = false;
let bossDirection = -1; // 左へ移動開始
const BOSS_GROUND_Y = 250; // ボスの着地ライン
const BOSS_JUMP_POWER = -15;
const BOSS_GRAVITY = 0.8;
const BOSS_HOP_SPEED_X = 2.2; // ぴょん移動速度

// 入力状態
const keys = { left: false, right: false, up: false };

// -----------------------------
// 入力（キーボード）
// -----------------------------
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") keys.left = true;
  if (e.key === "ArrowRight") keys.right = true;
  if (e.key === "ArrowUp" && player.onGround) {
    player.vy = player.jumpPower;
    player.onGround = false;
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft") keys.left = false;
  if (e.key === "ArrowRight") keys.right = false;
});

// -----------------------------
// 入力（タッチ） - iPhone対応
// スクロール誤作動防止のため、touchstart/touchendでpreventDefault
// -----------------------------
function pressLeft(e) { e.preventDefault(); keys.left = true; }
function releaseLeft(e) { e.preventDefault(); keys.left = false; }

function pressRight(e) { e.preventDefault(); keys.right = true; }
function releaseRight(e) { e.preventDefault(); keys.right = false; }

function pressJump(e) {
  e.preventDefault();
  if (player.onGround) {
    player.vy = player.jumpPower;
    player.onGround = false;
  }
}

leftBtn.addEventListener("touchstart", pressLeft, { passive: false });
leftBtn.addEventListener("touchend", releaseLeft, { passive: false });
leftBtn.addEventListener("mousedown", () => (keys.left = true));
leftBtn.addEventListener("mouseup", () => (keys.left = false));
leftBtn.addEventListener("mouseleave", () => (keys.left = false));

rightBtn.addEventListener("touchstart", pressRight, { passive: false });
rightBtn.addEventListener("touchend", releaseRight, { passive: false });
rightBtn.addEventListener("mousedown", () => (keys.right = true));
rightBtn.addEventListener("mouseup", () => (keys.right = false));
rightBtn.addEventListener("mouseleave", () => (keys.right = false));

jumpBtn.addEventListener("touchstart", pressJump, { passive: false });
jumpBtn.addEventListener("mousedown", pressJump);

// キャンバスでのジェスチャ誤検出防止
["touchstart", "touchmove"].forEach((type) => {
  canvas.addEventListener(type, (e) => e.preventDefault(), { passive: false });
});

// -----------------------------
// 敵生成
// -----------------------------
function spawnEnemy() {
  if (enemyIndex < enemyImgs.length) {
    enemies.push({
      img: enemyImgs[enemyIndex],
      x: canvas.width,
      y: GROUND_Y,
      width: 100,  // 2倍サイズ（以前の要望）
      height: 100, // 2倍サイズ
      speed: ENEMY_SPEED,
    });
    enemyIndex++;

    // 最後の敵が出たあと、しばらくしてボス準備（ゴール直前）
    if (enemyIndex === enemyImgs.length) {
      setTimeout(spawnBoss, 2200);
    }
  }
}

function spawnBoss() {
  if (boss) return;
  boss = {
    img: bossImg,
    x: canvas.width - 150,
    y: -220,               // 空から
    width: 150,
    height: 150,
    vy: 5,
  };
  bossFalling = true;
}

// -----------------------------
// 更新処理
// -----------------------------
function update() {
  // プレイヤー移動
  if (keys.left) player.x -= player.speed;
  if (keys.right) player.x += player.speed;

  // 画面外へ出すぎないよう制限
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  // ジャンプ・重力
  player.y += player.vy;
  player.vy += player.gravity;
  if (player.y >= GROUND_Y) {
    player.y = GROUND_Y;
    player.vy = 0;
    player.onGround = true;
  }

  // 敵移動
  enemies.forEach((e) => (e.x -= e.speed));
  enemies = enemies.filter((e) => e.x + e.width > 0); // 画面外で削除

  // ボス挙動
  if (boss) {
    if (bossFalling) {
      boss.y += boss.vy;
      if (boss.y >= BOSS_GROUND_Y) {
        boss.y = BOSS_GROUND_Y;
        bossFalling = false;
        boss.vy = BOSS_JUMP_POWER; // 着地後にジャンプ開始
      }
    } else {
      // ぴょんぴょんジャンプ
      boss.y += boss.vy;
      boss.vy += BOSS_GRAVITY;
      if (boss.y >= BOSS_GROUND_Y) {
        boss.y = BOSS_GROUND_Y;
        boss.vy = BOSS_JUMP_POWER; // 再ジャンプ
        // 地面に着くたびに左右へ少しずつ進む
        boss.x += BOSS_HOP_SPEED_X * bossDirection;
        // 端で方向反転
        if (boss.x < canvas.width * 0.55) bossDirection = 1;     // 左へ行き過ぎたら右へ
        if (boss.x > canvas.width - boss.width - 10) bossDirection = -1; // 右端近くで左へ
      }
    }
  }

  // ゴール判定（右端付近）
  if (!goalReached && player.x > canvas.width - 120) {
    goalReached = true;
    goalZoom = 0;
  }

  // ゴール演出（mioが奥から近づく）
  if (goalReached) {
    goalZoom = Math.min(1, goalZoom + 0.01); // 0→1へじわっと
  }
}

// -----------------------------
// 描画処理
// -----------------------------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // プレイヤー
  ctx.drawImage(playerImg, player.x, player.y - player.height, player.width, player.height);

  // 敵
  enemies.forEach((e) => {
    ctx.drawImage(e.img, e.x, e.y - e.height, e.width, e.height);
  });

  // ボス
  if (boss) {
    ctx.drawImage(boss.img, boss.x, boss.y - boss.height, boss.width, boss.height);
  }

  // ゴール演出（奥から手前へズームイン）
  if (goalReached) {
    const baseSize = 80;
    const size = baseSize + goalZoom * 220; // 80→300くらいに拡大
    const x = canvas.width / 2 - size / 2;
    const y = 70;
    ctx.save();
    // 少し透明→手前で不透明
    ctx.globalAlpha = Math.min(1, 0.4 + goalZoom * 0.6);
    ctx.drawImage(goalImg, x, y, size, size);
    ctx.restore();
  }
}

// -----------------------------
// メインループ
// -----------------------------
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// 敵の定期出現
let enemyTimer = null;
function startEnemyTimer() {
  if (enemyTimer) clearInterval(enemyTimer);
  enemyTimer = setInterval(spawnEnemy, ENEMY_SPAWN_MS);
}

// スタート後にゲーム開始
function startGame() {
  startEnemyTimer();
  gameLoop();
}

// オーバーレイが消えた後に開始（タップで音解禁→開始）
function startAfterUnlock() {
  unlockAudioOnce();
  startGame();
}

// 念のため、オーバーレイの外側タップでも開始できるように
startOverlay.addEventListener("click", startAfterUnlock);
startOverlay.addEventListener("touchstart", startAfterUnlock, { passive: true });

// キャンバスクリックでも開始できるように（保険）
canvas.addEventListener("click", () => {
  if (!audioUnlocked) unlockAudioOnce();
});
canvas.addEventListener("touchstart", () => {
  if (!audioUnlocked) unlockAudioOnce();
}, { passive: true });

// -----------------------------
// 画像のプリロード（任意）
// -----------------------------
[playerImg, bossImg, goalImg, ...enemyImgs].forEach((img) => {
  img.addEventListener("error", () => {
    console.warn("画像読み込みに失敗:", img.src);
  });
});
