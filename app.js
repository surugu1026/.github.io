
(() => {
  'use strict';

  // ===== DOM 取得 =====
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('canvas #game が見つかりません'); return; }
  const ctx = canvas.getContext('2d');
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');

  // ===== 定数 =====
  const G = 0.6;            // 重力
  const MOVE = 2.2;         // 横移動速度
  const JUMP = 16;        // ジャンプ初速
  const TILE = 54;          // タイルサイズ
  const WORLD_WIDTH = 200;  // 横タイル数
  const FLOOR_Y = 9;        // 地面タイル行

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

  // タッチ操作
  const bindTouch = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', () => keys[key] = true);
    el.addEventListener('pointerup',   () => keys[key] = false);
    el.addEventListener('pointerleave',() => keys[key] = false);
  };
  bindTouch('btn-left', 'left');
  bindTouch('btn-right','right');
  bindTouch('btn-jump', 'jump');

  // ===== 画像読み込み =====
  const playerImg = new Image(); playerImg.src = 'Image.png';
  const enemyOrder = ['mama', 'kairi', 'pocha', 'papa']; // 出現順
  const enemySprites = {
    mama:  (() => { const i = new Image(); i.src = 'mama.png';  return i; })(),
    kairi: (() => { const i = new Image(); i.src = 'kairi.png'; return i; })(),
    pocha: (() => { const i = new Image(); i.src = 'pocha.png'; return i; })(),
    papa:  (() => { const i = new Image(); i.src = 'papa.png';  return i; })()
  };
  const mioImg = new Image(); mioImg.src = 'mio.png';

  // ===== ステージ =====
  const platforms = [];
  for (let i = 0; i < WORLD_WIDTH; i++) {
    platforms.push({ x: i * TILE, y: FLOOR_Y * TILE, w: TILE, h: TILE });
    if (i % 15 === 5)  platforms.push({ x: i * TILE, y: (FLOOR_Y - 2) * TILE, w: TILE, h: TILE });
    if (i % 23 === 10) platforms.push({ x: i * TILE, y: (FLOOR_Y - 4) * TILE, w: TILE, h: TILE });
  }

  const coins = [];
  for (let i = 4; i < WORLD_WIDTH; i += 6) {
    coins.push({ x: i * TILE + TILE / 2, y: (FLOOR_Y - 3) * TILE + 10, r: 10, taken: false });
  }

  // ===== プレイヤー =====
  const player = {
    x: 2 * TILE,
    y: (FLOOR_Y - 1) * TILE - 64,
    w: 48, h: 64,
    vx: 0, vy: 0,
    onGround: false,
    facing: 1
  };

  // ===== 敵（順番固定：mama→kairi→pocha→papa） =====
  const spawnX = [18 * TILE, 45 * TILE, 75 * TILE, 110 * TILE];
  let nextEnemyIdx = 0;
  const enemies = []; // {x,y,w,h,vx,facing,img}


function spawnNextEnemy() {
  if (nextEnemyIndex >= enemyOrder.length) return;
  const key = enemyOrder[nextEnemyIndex];
  const x = spawnX[nextEnemyIndex];
- const w = 52, h = 52;
+ const w = 52 * 2, h = 52 * 2; // ★ 2倍

  enemies.push({
    x,
-   y: (FLOOR_Y - 1) * TILE - h,
+   y: (FLOOR_Y - 1) * TILE - h, // 2倍にしてもこの式で地面に揃います
    w, h, vx: 1.1, facing: -1, img: enemySprites[key],
    slotIndex: nextEnemyIndex
  });
  nextEnemyIndex++;
}

  
  function maybeSpawnByProgress() {
    if (nextEnemyIdx < spawnX.length && player.x > spawnX[nextEnemyIdx] - TILE * 2) {
      spawnNextEnemy();
    }
  }

  // ===== ゴール旗 =====
  const goal = { x: (WORLD_WIDTH - 4) * TILE, y: (FLOOR_Y - 5) * TILE, w: 10, h: 200 };

  // ===== カメラ =====
  const camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

  // ===== 状態 =====
  let coinCount = 0;
  let finished = false;
  const victory = { active: false, t: 0 }; // 演出カウンタ

  // ===== ユーティリティ =====
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rectIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ===== メインループ =====
  function update() {
    if (finished) {
      victory.t += 1;       // 演出のみ進める
      draw();
      requestAnimationFrame(update);
      return;
    }

    // 入力 → 速度
    player.vx = 0;
    if (keys.left)  { player.vx = -MOVE; player.facing = -1; }
    if (keys.right) { player.vx =  MOVE; player.facing =  1; }
    if (keys.jump && player.onGround) {
      player.vy = -JUMP; player.onGround = false;
      statusEl.textContent = 'ジャンプ！';
    }

    // 物理
    player.vy += G;
    player.x += player.vx;
    player.y += player.vy;

    // 当たり（地面・足場）
    player.onGround = false;
    platforms.forEach(p => {
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, p)) {
        const fromTop   = (a.y + a.h) - p.y < 20 && player.vy > 0;
        const fromLeft  = (a.x + a.w) - p.x < 20 && player.vx > 0;
        const fromRight = (p.x + p.w) - a.x < 20 && player.vx < 0;

        if (fromTop)       { player.y = p.y - player.h; player.vy = 0; player.onGround = true; }
        else if (fromLeft) { player.x = p.x - player.w; }
        else if (fromRight){ player.x = p.x + p.w; }
        else               { player.y = p.y + p.h; player.vy = 0; }
      }
    });

    // コイン
    coins.forEach(c => {
      if (c.taken) return;
      const dx = (player.x + player.w / 2) - c.x;
      const dy = (player.y + player.h / 2) - c.y;
      if (Math.hypot(dx, dy) < c.r + Math.min(player.w, player.h) / 2) {
        c.taken = true; coinCount++; coinsEl.textContent = `🪙 ${coinCount}`;
      }
    });

    // 敵スポーン（順番に）
    maybeSpawnByProgress();

    // 敵更新・当たり
    enemies.forEach(e => {
      e.x += e.vx;
      // 簡易往復（一定距離で反転）
      const cycle = TILE * 8;
      const mod = (e.x + 100000) % cycle;
      if (mod < 2 || mod > cycle - 2) { e.vx *= -1; e.facing = e.vx < 0 ? -1 : 1; }

      // 当たり判定
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 18;
        if (stomp) {
          player.vy = -JUMP * 0.6;
          e.x = -99999; e.vx = 0;           // 退場
          statusEl.textContent = 'やっつけた！';
        } else {
          // 優しめ：スタート付近へ戻す
          player.x = 2 * TILE;
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
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
      setTimeout(() => alert(`ゴール！がんばったね！\nコイン ${coinCount} 枚`), 100);
    }

    // カメラ
    camera.x = clamp(player.x - camera.w / 2, 0, (WORLD_WIDTH * TILE) - camera.w);

    draw();
    requestAnimationFrame(update);
  }

  // ===== 描画 =====
  function draw() {
    // 背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 雲
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
    ctx.save();
    if (player.facing === -1) {
      ctx.translate((player.x - camera.x) + player.w, player.y - camera.y);
      ctx.scale(-1, 1);
      ctx.drawImage(playerImg, 0, 0, player.w, player.h);
    } else {
      ctx.drawImage(playerImg, player.x - camera.x, player.y - camera.y, player.w, player.h);
    }
    ctx.restore();

    // 勝利演出：mio.png を奥（小・薄）→手前（大・濃）へ
    if (victory.active) {
      const duration = 180; // 約3秒
      const t = clamp(victory.t / duration, 0, 1);
      const k = easeOutCubic(t);
      const baseScale = 0.25;   // 奥
      const endScale  = 1.4;    // 手前
      const scale = baseScale + (endScale - baseScale) * k;
      const alpha = 0.2 + 0.8 * k;
      const yLift = (1 - k) * 60;

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

  // 雲
  function cloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.arc(x + 26, y + 10, 22, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // スタート
  statusEl.textContent = '左右キーで移動、スペースでジャンプ！';
  requestAnimationFrame(update);
  })();
