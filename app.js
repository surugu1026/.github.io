
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ===== 物理・共通設定 =====
  const G = 0.6;
  const MOVE = 2.2;
  const JUMP = 10.5;
  const TILE = 54;
  const WORLD_WIDTH = 200;         // 横タイル数
  const FLOOR_Y = 9;               // 地面タイル行

  // ===== 入力 =====
  const keys = { left: false, right: false, jump: false };
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.jump = true;
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
  });

  document.getElementById('btn-left').addEventListener('pointerdown', () => keys.left = true);
  document.getElementById('btn-left').addEventListener('pointerup',   () => keys.left = false);
  document.getElementById('btn-right').addEventListener('pointerdown', () => keys.right = true);
  document.getElementById('btn-right').addEventListener('pointerup',   () => keys.right = false);
  document.getElementById('btn-jump').addEventListener('pointerdown',  () => keys.jump = true);
  document.getElementById('btn-jump').addEventListener('pointerup',    () => keys.jump = false);

  // ===== 画像ローダ（プレイヤー・敵・勝利演出） =====
  function loadImage(src) {
    const img = new Image();
    img.src = src;
    img.decode?.().catch(()=>{}); // デコード待ち（対応ブラウザのみ）
    return img;
  }

  // プレイヤー画像（以前のご指定：Image.png）
  const playerImg = loadImage('Image.png');

  // 敵画像：順番をこの配列の通りに出す
  const enemyKeys = ['mama', 'kairi', 'pocha', 'papa'];
  const enemySprites = {
    mama: loadImage('mama.png'),
    kairi: loadImage('kairi.png'),
    pocha: loadImage('pocha.png'),
    papa: loadImage('papa.png'),
  };

  // 勝利演出画像（奥→手前へ）
  const mioImg = loadImage('mio.png');

  // ===== ステージ生成 =====
  const platforms = []; // 地面や足場
  for (let i = 0; i < WORLD_WIDTH; i++) {
    platforms.push({ x: i * TILE, y: FLOOR_Y * TILE, w: TILE, h: TILE });
    if (i % 15 === 5) platforms.push({ x: i * TILE, y: (FLOOR_Y - 2) * TILE, w: TILE, h: TILE });
    if (i % 23 === 10) platforms.push({ x: i * TILE, y: (FLOOR_Y - 4) * TILE, w: TILE, h: TILE });
  }

  const coins = [];
  for (let i = 4; i < WORLD_WIDTH; i += 6) {
    coins.push({ x: i * TILE + TILE / 2, y: (FLOOR_Y - 3) * TILE + 10, r: 10, taken: false });
  }

  // ===== プレイヤー =====
  const player = {
    x: 2 * TILE,
    y: (FLOOR_Y - 1) * TILE - 40,
    w: 48, h: 64,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1
  };

  // ===== 敵のスポーン管理（順番：mama → kairi → pocha → papa） =====
  // プレイヤーの進行に合わせて順番に出現させます
  const spawnPoints = [18 * TILE, 45 * TILE, 75 * TILE, 110 * TILE]; // 出現地点（順番対応）
  let nextEnemyIndex = 0;
  const enemies = []; // アクティブ敵

  function spawnNextEnemy() {
    if (nextEnemyIndex >= enemyKeys.length) return;
    const key = enemyKeys[nextEnemyIndex];
    const x = spawnPoints[nextEnemyIndex];
    // 画像サイズ基準に当たり判定を取りやすい値
    const w = 52, h = 52;
    enemies.push({ x, y: (FLOOR_Y - 1) * TILE - h, w, h, vx: 1.1, facing: -1, img: enemySprites[key] });
    nextEnemyIndex++;
  }

  function maybeSpawnByProgress() {
    // プレイヤーがスポーン地点付近まで来たら順番に出す
    if (nextEnemyIndex < spawnPoints.length && player.x > spawnPoints[nextEnemyIndex] - TILE * 2) {
      spawnNextEnemy();
    }
  }

  // ===== ゴール旗 =====
  const goal = { x: (WORLD_WIDTH - 4) * TILE, y: (FLOOR_Y - 5) * TILE, w: 10, h: 200 };

  // ===== カメラ =====
  const camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

  // ===== HUD =====
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');
  let coinCount = 0;

  // ===== 勝利演出 =====
  let finished = false;
  const victory = { active: false, t: 0 }; // t はフレームカウンタ

  // ===== ユーティリティ =====
  const rectIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ===== メインループ =====
  function update() {
    // ゴール後はゲーム進行を止めて演出のみ
    if (finished) {
      victory.t += 1;
      draw(); // 演出も draw 内で描画
      requestAnimationFrame(update);
      return;
    }

    // 入力
    player.vx = 0;
    if (keys.left) { player.vx = -MOVE; player.facing = -1; }
    if (keys.right) { player.vx = MOVE; player.facing = 1; }
    if (keys.jump && player.onGround) { player.vy = -JUMP; player.onGround = false; statusEl.textContent = 'ジャンプ！'; }

    // 物理
    player.vy += G;
    player.x += player.vx;
    player.y += player.vy;

    // 当たり（地面・足場）
    player.onGround = false;
    platforms.forEach(p => {
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, p)) {
        const fromTop = (a.y + a.h) - p.y < 20 && player.vy > 0;
        const fromLeft = (a.x + a.w) - p.x < 20 && player.vx > 0;
        const fromRight = (p.x + p.w) - a.x < 20 && player.vx < 0;

        if (fromTop) { player.y = p.y - player.h; player.vy = 0; player.onGround = true; }
        else if (fromLeft) { player.x = p.x - player.w; }
        else if (fromRight) { player.x = p.x + p.w; }
        else { player.y = p.y + p.h; player.vy = 0; }
      }
    });

    // コイン
    coins.forEach(c => {
      if (!c.taken) {
        const dx = (player.x + player.w / 2) - c.x;
        const dy = (player.y + player.h / 2) - c.y;
        if (Math.hypot(dx, dy) < c.r + Math.min(player.w, player.h) / 2) {
          c.taken = true; coinCount++; coinsEl.textContent = `🪙 ${coinCount}`;
        }
      }
    });

    // 敵のスポーン判定（順番通り）
    maybeSpawnByProgress();

    // 敵の更新＆当たり
    enemies.forEach(e => {
      e.x += e.vx;
      // 簡易な往復移動（一定距離で反転）
      const cycle = TILE * 8;
      const mod = (e.x + 100000) % cycle;
      if (mod < 2 || mod > cycle - 2) { e.vx *= -1; e.facing = e.vx < 0 ? -1 : 1; }

      // 当たり判定
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 18;
        if (stomp) {
          player.vy = -JUMP * 0.6;
          // 退場（画面外へ飛ばす）
          e.x = -9999; e.vx = 0;
          statusEl.textContent = 'やっつけた！';
        } else {
          // ダメージ → スタート付近へ戻す（優しめ）
          player.x = 2 * TILE; player.y = (FLOOR_Y - 1) * TILE - player.h; player.vx = 0; player.vy = 0;
          statusEl.textContent = 'いたっ！もう一度';
        }
      }
    });

    // ゴール判定
    const goalRect = { x: goal.x - 10, y: goal.y, w: goal.w + 20, h: goal.h };
    const a = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectIntersect(a, goalRect)) {
      finished = true;
      victory.active = true;
      victory.t = 0;
      statusEl.textContent = `ゴール！コイン ${coinCount} 枚`;
    }

    // カメラ追従
    camera.x = clamp(player.x - camera.w / 2, 0, (WORLD_WIDTH * TILE) - camera.w);

    draw();
    requestAnimationFrame(update);
  }

  // ===== 描画 =====
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 雲（遠景）
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 8; i++) {
      const x = (i * 220) - (camera.x * 0.2) % (canvas.width + 300);
      const y = 60 + (i % 3) * 35;
      cloud(x, y);
    }

    // 地面・足場
    platforms.forEach(p => {
      if (p.x + p.w < camera.x || p.x > camera.x + camera.w) return;
      ctx.fillStyle = '#3b2f2f';
      ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, p.h);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, 6);
    });

    // コイン
    coins.forEach(c => {
      if (c.taken) return;
      if (c.x + 20 < camera.x || c.x - 20 > camera.x + camera.w) return;
      const t = Date.now() / 200;
      ctx.save();
      ctx.translate(c.x - camera.x, c.y - camera.y);
      ctx.rotate(Math.sin(t) * 0.15);
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -6, 6, 12);
      ctx.restore();
    });

    // 敵（画像）
    enemies.forEach(e => {
      if (e.x + e.w < camera.x || e.x > camera.x + camera.w) return;
      ctx.save();
      if (e.facing === -1) {
        ctx.translate((e.x - camera.x) + e.w, e.y - camera.y);
        ctx.scale(-1, 1);
        ctx.drawImage(e.img, 0, 0, e.w, e.h);
      } else {
        ctx.drawImage(e.img, e.x - camera.x, e.y - camera.y, e.w, e.h);
      }
      ctx.restore();
    });

    // ゴール旗
    if (goal.x + goal.w >= camera.x && goal.x <= camera.x + camera.w) {
      ctx.fillStyle = '#555';
      ctx.fillRect(goal.x - camera.x, goal.y - camera.y, 6, goal.h);
      ctx.fillStyle = '#ff0066';
      ctx.beginPath();
      ctx.moveTo(goal.x - camera.x + 6, goal.y - camera.y + 10);
      ctx.lineTo(goal.x - camera.x + 80, goal.y - camera.y + 40);
      ctx.lineTo(goal.x - camera.x + 6, goal.y - camera.y + 70);
      ctx.closePath();
      ctx.fill();
    }

    // プレイヤー（画像）
    {
      ctx.save();
      if (player.facing === -1) {
        ctx.translate((player.x - camera.x) + player.w, player.y - camera.y);
        ctx.scale(-1, 1);
        ctx.drawImage(playerImg, 0, 0, player.w, player.h);
      } else {
        ctx.drawImage(playerImg, player.x - camera.x, player.y - camera.y, player.w, player.h);
      }
      ctx.restore();
    }

    // 勝利演出：mio.png を奥（小さく・薄く）から前（大きく・濃く）へ
    if (victory.active) {
      const duration = 180; // 約3秒（60fps想定）
      const t = clamp(victory.t / duration, 0, 1);
      const k = easeOutCubic(t);
      const baseScale = 0.25;      // 奥：25%
      const endScale  = 1.4;       // 手前：140%
      const scale = baseScale + (endScale - baseScale) * k;
      const alpha = 0.2 + 0.8 * k; // 透明→不透明へ
      const yLift = (1 - k) * 60;  // 少し上からスッと降りてくる感じ

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(canvas.width / 2, canvas.height / 2 - yLift);
      ctx.scale(scale, scale);
      const w = mioImg.width || 320;
      const h = mioImg.height || 320;
      ctx.drawImage(mioImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  function cloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.arc(x + 26, y + 10, 22, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== スタート =====
  const statusEl = document.getElementById('status');
  statusEl.textContent = '左右キーで移動、スペースでジャンプ！';
  requestAnimationFrame(update);
