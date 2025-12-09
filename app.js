
(() => {
  'use strict';

  // ===== DOM 取得 =====
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('canvas #game が見つかりません'); return; }
  const ctx = canvas.getContext('2d');
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');

  // ===== 定数（ジャンプを高めに） =====
  const G = 0.6;            // 重力
  const MOVE = 2.2;         // 横移動速度
  const JUMP = 16;          // ジャンプ初速（高めに調整）
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
  // タッチ操作（モバイル）
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

  // ===== 画像ロード（404でも落ちない安全ローダ） =====
  const ASSET_BASE = './'; // index.html と同じフォルダに置いた場合

  function loadImageSafe(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve({ img, ok: true, file });
      img.onerror = () => {
        console.warn(`画像の読み込みに失敗: ${ASSET_BASE + file}`);
        resolve({ img, ok: false, file });
      };
      img.src = ASSET_BASE + file;
    });
  }

  // スプライト格納
  let sprites = {
    player: { img: null, ok: false },
    enemies: [],   // [{img, ok, file}, ...]
    mio:    { img: null, ok: false }
  };

  // ===== ステージ生成 =====
  const platforms = [];
  for (let i = 0; i < WORLD_WIDTH; i++) {
    platforms.push({ x: i * TILE, y: FLOOR_Y * TILE, w: TILE, h: TILE });                // 地面
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
    w: 48,
    h: 64,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1
  };

  // ===== 敵（順番：mama → kairi → pocha → papa、サイズ2倍） =====
  const enemyOrderFiles = ['mama.png', 'kairi.png', 'pocha.png', 'papa.png'];
  const spawnX = [18 * TILE, 45 * TILE, 75 * TILE, 110 * TILE];
  let nextEnemyIndex = 0;          // ★ 必ず宣言を関数より前に
  const enemies = [];              // アクティブな敵

  function spawnNextEnemy() {
    if (nextEnemyIndex >= enemyOrderFiles.length) return;

    const x = spawnX[nextEnemyIndex];
    const w = 52 * 2;             // ★ 2倍
    const h = 52 * 2;             // ★ 2倍

    enemies.push({
      x,
      y: (FLOOR_Y - 1) * TILE - h, // 地面接地
      w, h,
      vx: 2,
      facing: -1,
      slotIndex: nextEnemyIndex    // スプライト選択用インデックス
    });

    nextEnemyIndex++;
  }

  function maybeSpawnByProgress() {
    if (nextEnemyIndex < spawnX.length && player.x > spawnX[nextEnemyIndex] - TILE * 2) {
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
  const victory = { active: false, t: 0 }; // 勝利演出フレーム

  // ===== ユーティリティ =====
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rectIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ===== 安全描画ユーティリティ =====
  function drawPlayerSafe(x, y, w, h, facing) {
    const res = sprites.player;
    if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
      ctx.save();
      if (facing === -1) {
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(res.img, 0, 0, w, h);
      } else {
        ctx.drawImage(res.img, x, y, w, h);
      }
      ctx.restore();
    } else {
      // 画像が無い／読み込み失敗時の代替
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawEnemySafe(e) {
    const res = sprites.enemies[e.slotIndex];
    const screenX = e.x - camera.x;
    const screenY = e.y - camera.y;

    if (res && res.ok && res.img.complete && res.img.naturalWidth > 0) {
      ctx.save();
      if (e.facing === -1) {
        ctx.translate(screenX + e.w, screenY);
        ctx.scale(-1, 1);
        ctx.drawImage(res.img, 0, 0, e.w, e.h);
      } else {
        ctx.drawImage(res.img, screenX, screenY, e.w, e.h);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(screenX, screenY, e.w, e.h);
    }
  }

  function drawMioVictorySafe(k) {
    const res = sprites.mio;
    const baseScale = 0.25, endScale = 1.4;
    const scale = baseScale + (endScale - baseScale) * k;
    const alpha = 0.2 + 0.8 * k;
    const yLift = (1 - k) * 60;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(canvas.width / 2, canvas.height / 2 - yLift);
    ctx.scale(scale, scale);
    if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
      const w = res.img.naturalWidth, h = res.img.naturalHeight;
      ctx.drawImage(res.img, -w / 2, -h / 2, w, h);
    } else {
      // 画像無しでも演出だけ成立させる（丸で代用）
      const r = 160;
      ctx.fillStyle = '#ff66aa';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== メインループ =====
  function update() {
    if (finished) {
      victory.t += 1; // 演出のみ進める
      draw();
      requestAnimationFrame(update);
      return;
    }

    // 入力 → 速度
    player.vx = 0;
    if (keys.left)  { player.vx = -MOVE; player.facing = -1; }
    if (keys.right) { player.vx =  MOVE; player.facing =  1; }
    if (keys.jump && player.onGround) {
      player.vy = -JUMP;
      player.onGround = false;
      statusEl && (statusEl.textContent = 'ジャンプ！');
    }

    // 物理
    player.vy += G;
    player.x  += player.vx;
    player.y  += player.vy;

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
        c.taken = true; coinCount++; coinsEl && (coinsEl.textContent = `🪙 ${coinCount}`);
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

      // 当たり判定（踏みつけを少し緩める：閾値24）
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 24;
        if (stomp) {
          player.vy = -JUMP * 0.6;
          e.x = -99999; e.vx = 0; // 退場
          statusEl && (statusEl.textContent = 'やっつけた！');
        } else {
          // 優しめ：スタート付近へ戻す
          player.x = 2 * TILE;
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
          statusEl && (statusEl.textContent = 'いたっ！もう一度');
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
      statusEl && (statusEl.textContent = `ゴール！コイン ${coinCount} 枚`);
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

    // 敵（安全描画）
    enemies.forEach(e => {
      if (e.x + e.w < camera.x || e.x > camera.x + camera.w) return;
      drawEnemySafe(e);
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

    // プレイヤー（安全描画）
    drawPlayerSafe(player.x - camera.x, player.y - camera.y, player.w, player.h, player.facing);

    // 勝利演出：mio.png 奥→手前
    if (victory.active) {
      const duration = 180; // 約3秒
      const t = clamp(victory.t / duration, 0, 1);
      const k = easeOutCubic(t);
      drawMioVictorySafe(k);
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

  // ===== 画像ロード完了後に開始 =====
  (async () => {
    const playerRes  = await loadImageSafe('Image.png');
    const enemiesRes = await Promise.all(enemyOrderFiles.map(f => loadImageSafe(f)));
    const mioRes     = await loadImageSafe('mio.png');

    sprites = {
      player:  playerRes,
      enemies: enemiesRes,
      mio:     mioRes
    };

    statusEl && (statusEl.textContent = '左右キーで移動、スペースでジャンプ！');
    requestAnimationFrame(update);
  })();

})();
