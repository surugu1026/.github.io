
/* ==========================================================
 * ちびジャンプ！（Mario-like）最小追加版
 * ご要望対応：
 *  - ゴール距離を半分に
 *  - 穴を4つ追加
 *  - 敵でやられても「少し前」から再開（チェックポイント）
 *  - ゴール演出：mio.png → mio2.png ＆ メッセージポップ
 * ========================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // ====== Canvas 基本 ======
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;     // 960
  const H = canvas.height;    // 540

  // ====== 物理・プレイヤー設定 ======
  const GRAVITY = 0.6;
  const MOVE_SPEED = 3.2;
  const JUMP_V = -12.8; // やや高め（過去の「ジャンプが低い」への配慮）

  const PLAYER_W = 30;
  const PLAYER_H = 40;

  // ====== レベル長：半分に短縮 ======
  const ORIGINAL_LEVEL_LENGTH = 4000; // 仮の元値（長い前提）
  const LEVEL_LENGTH = Math.floor(ORIGINAL_LEVEL_LENGTH / 2); // → 2000

  const GROUND_Y = H - 90; // 地面ライン

  // ====== ゴール位置 ======
  const goalX = LEVEL_LENGTH - 200; // 終端少し手前

  // ====== 穴4つ（x範囲） ======
  const holes = [];
  addHole(LEVEL_LENGTH * 0.18, 140);
  addHole(LEVEL_LENGTH * 0.33, 160);
  addHole(LEVEL_LENGTH * 0.56, 120);
  addHole(LEVEL_LENGTH * 0.80, 180);
  function addHole(startX, width){ holes.push({start:startX, end:startX+width}); }
  function isHoleAt(x){ return holes.some(h => x >= h.start && x <= h.end); }

  // ====== 敵（簡易：左右往復） ======
  const enemies = [
    spawnEnemy(LEVEL_LENGTH * 0.25, GROUND_Y - 28, 26, 26, 1.2, LEVEL_LENGTH * 0.22, LEVEL_LENGTH * 0.30),
    spawnEnemy(LEVEL_LENGTH * 0.48, GROUND_Y - 28, 26, 26, -1.0, LEVEL_LENGTH * 0.45, LEVEL_LENGTH * 0.52),
    spawnEnemy(LEVEL_LENGTH * 0.70, GROUND_Y - 28, 26, 26, 1.3, LEVEL_LENGTH * 0.68, LEVEL_LENGTH * 0.75),
  ];
  function spawnEnemy(x, y, w, h, vx, left, right){
    return {x, y, w, h, vx, left, right};
  }

  // ====== コイン（軽い収集要素） ======
  const coins = [
    {x: 220, y: GROUND_Y - 120, r: 10, taken:false},
    {x: LEVEL_LENGTH * 0.35, y: GROUND_Y - 140, r: 10, taken:false},
    {x: LEVEL_LENGTH * 0.62, y: GROUND_Y - 160, r: 10, taken:false},
  ];
  let coinCount = 0;

  // ====== プレイヤー・チェックポイント ======
  const player = {
    x: 50, y: GROUND_Y - PLAYER_H,
    vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_H,
    onGround: true,
    invincible: false,
  };
  let lastCheckpointX = 0;
  const CHECKPOINT_SPACING = LEVEL_LENGTH / 6; // 6分割程度で更新

  // ====== カメラ（スクロール） ======
  let camX = 0;

  // ====== 入力 ======
  const keys = { left:false, right:false, jump:false };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  keys.left  = true;
    if (e.key === 'ArrowRight') keys.right = true;
    if (e.key === ' ' || e.key === 'Spacebar') keys.jump = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft')  keys.left  = false;
    if (e.key === 'ArrowRight') keys.right = false;
    if (e.key === ' ' || e.key === 'Spacebar') keys.jump = false;
  });

  // ====== ゲーム状態 ======
  let playing = true;     // ループ実行
  let cleared = false;    // クリア済み
  let frameId = null;

  // ====== ループ開始 ======
  loop();

  // ==========================================================
  //                      メインループ
  // ==========================================================
  function loop(){
    update();
    draw();
    if (playing) frameId = requestAnimationFrame(loop);
  }

  // ==========================================================
  //                         更新
  // ==========================================================
  function update(){
    if (cleared) return;

    // 横移動
    player.vx = 0;
    if (keys.left)  player.vx -= MOVE_SPEED;
    if (keys.right) player.vx += MOVE_SPEED;

    // ジャンプ（接地時のみ）
    if (keys.jump && player.onGround){
      player.vy = JUMP_V;
      player.onGround = false;
    }

    // 重力
    player.vy += GRAVITY;

    // 位置更新
    player.x += player.vx;
    player.y += player.vy;

    // 地面との接触（穴でなければ着地）
    if (player.y + player.h >= GROUND_Y && !isHoleAt(player.x + player.w * 0.5)){
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // 画面外（落下）で死亡
    if (player.y > H + 100){
      onPlayerDeath();
    }

    // 敵移動・接触
    enemies.forEach(en => {
      en.x += en.vx;
      if (en.x < en.left || en.x > en.right) en.vx *= -1;

      if (!player.invincible && rectHit(player, en)){
        onPlayerDeath();
      }
    });

    // コイン取得
    coins.forEach(c => {
      if (!c.taken && circleHitRect(c.x, c.y, c.r, player)){
        c.taken = true; coinCount++;
      }
    });

    // チェックポイント更新
    updateCheckpoint(player.x);

    // ゴール判定
    if (player.x >= goalX){
      cleared = true;
      playing = false;
      playGoalSequence();
    }

    // カメラ追従
    camX = clamp(player.x - W/2, 0, LEVEL_LENGTH - W);
  }

  // ==========================================================
  //                           描画
  // ==========================================================
  function draw(){
    // 背景
    ctx.clearRect(0,0,W,H);

    // スクロール補正
    ctx.save();
    ctx.translate(-camX, 0);

    // 地面
    ctx.fillStyle = '#4a7a2f';
    ctx.fillRect(0, GROUND_Y, LEVEL_LENGTH, H - GROUND_Y);

    // 穴（可視化）
    ctx.fillStyle = '#2b2b2b';
    holes.forEach(h => {
      ctx.fillRect(h.start, GROUND_Y, (h.end - h.start), H - GROUND_Y);
    });

    // ブロック（少しの足場・ジャンプ用）
    drawBrick(280, GROUND_Y - 50, 60, 20);
    drawBrick(360, GROUND_Y - 100, 60, 20);
    drawBrick(goalX - 220, GROUND_Y - 80, 60, 20);
    drawBrick(goalX - 140, GROUND_Y - 130, 60, 20);

    // コイン
    coins.forEach(c => {
      if (!c.taken) {
        ctx.fillStyle = '#ffd84a';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = '#b5951f';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // 敵
    enemies.forEach(en => {
      ctx.fillStyle = '#e63946';
      ctx.fillRect(en.x, en.y, en.w, en.h);
      // 目
      ctx.fillStyle = '#fff';
      ctx.fillRect(en.x+6, en.y+6, 6, 6);
      ctx.fillRect(en.x+en.w-12, en.y+6, 6, 6);
      ctx.fillStyle = '#000';
      ctx.fillRect(en.x+7, en.y+7, 3, 3);
      ctx.fillRect(en.x+en.w-11, en.y+7, 3, 3);
    });

    // ゴール旗
    ctx.fillStyle = '#222';
    ctx.fillRect(goalX, GROUND_Y - 120, 6, 120);
    ctx.fillStyle = '#2f7ac4';
    ctx.beginPath();
    ctx.moveTo(goalX+6, GROUND_Y - 120);
    ctx.lineTo(goalX+100, GROUND_Y - 100);
    ctx.lineTo(goalX+6, GROUND_Y - 80);
    ctx.closePath();
    ctx.fill();

    // プレイヤー
    ctx.fillStyle = '#2f7ac4';
    ctx.fillRect(player.x, player.y, player.w, player.h);
    if (player.invincible){
      // 無敵点滅
      const t = Date.now() / 120;
      if (Math.floor(t)%2===0){
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#fff';
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.globalAlpha = 1;
      }
    }

    // UI（コインカウント）
    ctx.fillStyle = '#000';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`★ ${coinCount}`, camX + 12, 24);

    ctx.restore();
  }

  // ====== ユーティリティ ======
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function rectHit(a, b){
    return (a.x < b.x + b.w) && (a.x + a.w > b.x) &&
           (a.y < b.y + b.h) && (a.y + a.h > b.y);
  }
  function circleHitRect(cx, cy, r, rect){
    const rx = clamp(cx, rect.x, rect.x + rect.w);
    const ry = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - rx;
    const dy = cy - ry;
    return (dx*dx + dy*dy) <= r*r;
  }
  function drawBrick(x, y, w, h){
    ctx.fillStyle = '#c46a2f';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7e3f17';
    ctx.strokeRect(x, y, w, h);
  }

  function updateCheckpoint(px){
    if (px > lastCheckpointX + CHECKPOINT_SPACING){
      lastCheckpointX = px;
    }
  }

  function onPlayerDeath(){
    // 少し前から再開（120px 手前）
    const resumeX = Math.max(lastCheckpointX - 120, 0);
    player.x = resumeX;
    player.y = GROUND_Y - PLAYER_H;
    player.vx = 0; player.vy = 0;
    player.invincible = true;
    setTimeout(() => { player.invincible = false; }, 1200);
  }

  // ====== ゴール演出 ======
  function playGoalSequence(){
    const overlay = document.getElementById('goalOverlay');
    const mio1 = document.getElementById('mio1');
    const mio2 = document.getElementById('mio2');
    const msg  = document.getElementById('goalMsg');

    overlay.hidden = false;

    // 1枚目（mio.png）ズーム
    mio1.hidden = false;
    mio1.classList.remove('flashy'); void mio1.offsetWidth;
    mio1.classList.add('flashy');

    // 1.2s後に2枚目へ切替＋シェイク、さらに0.6s後メッセージポップ
    setTimeout(() => {
      mio1.hidden = true;
      mio2.hidden = false;
      mio2.classList.remove('flashy'); void mio2.offsetWidth;
      mio2.classList.add('flashy');
      mio2.classList.add('shake');

      setTimeout(() => {
        msg.hidden = false;
        msg.classList.add('pop');
      }, 600);
    }, 1200);

    // クリックでオーバーレイを閉じて静止画面維持（再スタートは任意）
    overlay.addEventListener('click', () => {
      overlay.hidden = true;
    }, { once:true });
  }
});
