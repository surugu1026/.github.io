
(() => {
  'use strict';

  // ===== DOM 取得 =====
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('canvas #game が見つかりません'); return; }
  const ctx = canvas.getContext('2d');
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');

  // ===== 定数（ジャンプ高め／基礎設定） =====
  const G = 0.6;            // 重力
  const MOVE = 2.2;         // 横移動速度（プレイヤー）
  const JUMP = 16;          // ジャンプ初速（高め）
  const TILE = 54;          // タイルサイズ
  const WORLD_WIDTH = 200;  // 横タイル数
  const FLOOR_Y = 9;        // 地面タイル行

  // ===== BGM 制御（autoplay対策：ユーザー操作で開始） =====
  let bgm, bgmReady = false, bgmStarted = false;
  function initBGM() {
    bgm = new Audio('./bgm.mp3'); // 同じフォルダに置く
    bgm.loop = true;
    bgm.volume = 0.35;
    bgm.addEventListener('canplaythrough', () => { bgmReady = true; });
  }
  function tryStartBGMOnce() {
    if (bgmReady && !bgmStarted) {
      bgm.play().then(() => { bgmStarted = true; })
                .catch(err => console.warn('BGM再生に失敗:', err));
    }
  }

  // ===== 入力（キーボード） =====
  const keys = { left: false, right: false, jump: false };
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.jump = true;
    tryStartBGMOnce(); // 最初の打鍵でBGM開始
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
  });

  // ===== タブレット操作（長押し対応・誤スクロール防止） =====
  function bindTouchHold(btnId, keyName) {
    const el = document.getElementById(btnId);
    if (!el) return;

    const down = (ev) => {
      ev.preventDefault();
      tryStartBGMOnce();
      keys[keyName] = true;
      el.classList.add('active');
    };
    const up = (ev) => {
      ev.preventDefault();
      keys[keyName] = false;
      el.classList.remove('active');
    };

    el.addEventListener('pointerdown', down,  { passive: false });
    el.addEventListener('pointerup',   up,    { passive: false });
    el.addEventListener('pointerleave',up,    { passive: false });
    el.addEventListener('pointercancel',up,   { passive: false });

    el.addEventListener('touchstart',  down,  { passive: false });
    el.addEventListener('touchend',    up,    { passive: false });
    el.addEventListener('touchcancel', up,    { passive: false });
  }
  bindTouchHold('btn-left', 'left');
  bindTouchHold('btn-right','right');
  bindTouchHold('btn-jump', 'jump');

  // キャンバス上のタッチはスクロールさせない
  canvas.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove',  (ev) => ev.preventDefault(), { passive: false });
  canvas.addEventListener('touchend',   (ev) => ev.preventDefault(), { passive: false });

  // 画面タップでも1度だけBGM開始
  document.addEventListener('pointerdown', tryStartBGMOnce, { once: true });
  document.addEventListener('touchstart',  tryStartBGMOnce, { once: true });

  // ===== 画像ロード（404でも落ちない安全ローダ） =====
  const ASSET_BASE = './'; // index.html と同階層

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
    boss:   { img: null, ok: false },
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

  // ===== 敵（順番：mama → kairi → pocha → papa、サイズ2倍、後半ほど速く） =====
  const enemyOrderFiles = ['mama.png', 'kairi.png', 'pocha.png', 'papa.png'];
  const spawnX = [18 * TILE, 45 * TILE, 75 * TILE, 110 * TILE];
  let nextEnemyIndex = 0;
  const enemies = [];

  function spawnNextEnemy() {
    if (nextEnemyIndex >= enemyOrderFiles.length) return;

    const x = spawnX[nextEnemyIndex];
    const w = 52 * 2; // 2倍
    const h = 52 * 2; // 2倍

    const baseSpeed = 1.8;                 // ベース速度（速め）
    const accel     = 0.2 * nextEnemyIndex; // 後半ほど速い
    const vx        = baseSpeed + accel;

    enemies.push({
      x,
      y: (FLOOR_Y - 1) * TILE - h, // 地面接地
      w, h,
      vx,
      facing: -1,
      slotIndex: nextEnemyIndex
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
  const victory = { active: false, t: 0 };

  // ===== ボス（落下→ぴょんぴょんジャンプ→撃破） =====
  const BOSS_SPEED = 2.4;         // 水平移動速度
  const BOSS_JUMP  = 14;          // ジャンプ初速
  const BOSS_HOP_COOLDOWN = 45;   // 次ジャンプまでの待ちフレーム（約0.75秒@60fps）

  let boss = {
    spawned: false,
    state: 'sleep',         // 'sleep' | 'drop' | 'hop' | 'dead'
    x: 0, y: 0,
    w: 96, h: 96,
    vx: 0, vy: 0,
    speed: BOSS_SPEED,
    hp: 3,
    inv: 0,                 // 無敵フレーム（点滅）
    facing: -1,
    onGround: false,
    hopCD: 0
  };

  function spawnBossIfNearGoal() {
    if (!boss.spawned && player.x > goal.x - TILE * 12) {
      boss.spawned = true;
      boss.state = 'drop';
      boss.x = goal.x - TILE * 6;           // ゴール手前の上空
      boss.y = (FLOOR_Y - 6) * TILE - 400;  // 高くから落とす
      boss.vx = 0;
      boss.vy = 2;
      boss.hp = 3;
      boss.inv = 0;
      boss.onGround = false;
      boss.hopCD = 0;
      boss.facing = -1;
      statusEl && (statusEl.textContent = 'ボス出現！');
    }
  }

  function updateBoss() {
    if (!boss.spawned || boss.state === 'dead') return;

    boss.inv = Math.max(0, boss.inv - 1);

    if (boss.state === 'drop') {
      // 落下
      boss.vy += G;
      boss.y  += boss.vy;

      // 地面着地判定
      const a = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
      for (const p of platforms) {
        if (rectIntersect(a, p)) {
          const fromTop = (a.y + a.h) - p.y < 28 && boss.vy > 0;
          if (fromTop) {
            boss.y = p.y - boss.h;
            boss.vy = 0;
            boss.onGround = true;
            boss.state = 'hop';     // 歩行ではなくジャンプモードへ
            boss.hopCD = 0;         // すぐ初回ジャンプ可
            break;
          }
        }
      }
    } else if (boss.state === 'hop') {
      // ジャンプ・移動更新
      boss.vy += G;                 // 空中時の重力
      boss.y  += boss.vy;

      boss.hopCD = Math.max(0, boss.hopCD - 1);

      // プレイヤー方向へ向き
      boss.facing = (player.x < boss.x) ? -1 : 1;

      // 水平移動（空中でも前進）
      boss.vx = boss.facing === -1 ? -boss.speed : boss.speed;
      boss.x += boss.vx;

      // 地面との当たり
      boss.onGround = false;
      const a = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
      for (const p of platforms) {
        if (rectIntersect(a, p)) {
          const fromTop   = (a.y + a.h) - p.y < 28 && boss.vy > 0;
          const fromLeft  = (a.x + a.w) - p.x < 20 && boss.vx > 0;
          const fromRight = (p.x + p.w) - a.x < 20 && boss.vx < 0;

          if (fromTop) { // 接地
            boss.y = p.y - boss.h;
            boss.vy = 0;
            boss.onGround = true;

            // クールダウンが切れていれば再ジャンプ
            if (boss.hopCD === 0) {
              boss.vy = -BOSS_JUMP;
              boss.hopCD = BOSS_HOP_COOLDOWN;
            }
          } else if (fromLeft) {   // 壁で反転
            boss.x = p.x - boss.w; boss.facing = -1;
          } else if (fromRight) {
            boss.x = p.x + p.w;    boss.facing =  1;
          }
        }
      }

      // プレイヤーとの当たり
      const pb = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(pb, a)) {
        const stomp = player.vy > 0 && (player.y + player.h) - boss.y < 28 && boss.inv === 0;
        if (stomp) {
          // 踏みつけダメージ
          player.vy = -JUMP * 0.65;
          boss.hp -= 1;
          boss.inv = 40; // 短い無敵
          boss.x += (player.x < boss.x ? TILE : -TILE); // ノックバック
          statusEl && (statusEl.textContent = `ボスにダメージ！残り ${boss.hp}`);
          if (boss.hp <= 0) {
            boss.state = 'dead';
            boss.y = -99999; // 退場
            statusEl && (statusEl.textContent = 'ボス撃破！');
          }
        } else {
          // プレイヤー被弾（優しめリセット）
          player.x = 2 * TILE;
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
          statusEl && (statusEl.textContent = 'ボスに当たった！もう一度');
        }
      }
    }
  }

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

  function drawBossSafe() {
    if (!boss.spawned || boss.state === 'dead') return;

    const res = sprites.boss;
    const x = boss.x - camera.x;
    const y = boss.y - camera.y;

    // 落下中の影（地面に近いほど大きく・濃く）
    if (boss.state === 'drop') {
      const groundY = FLOOR_Y * TILE - camera.y + 4;
      const height   = (groundY - y - boss.h);
      const r        = clamp(20 + (height > 0 ? Math.min(60, height / 6) : 0), 20, 80);

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x + boss.w / 2, groundY, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ダメージ中の点滅
    const flashing = boss.inv > 0 && (boss.inv % 8 < 4);
    ctx.save();
    if (flashing) ctx.globalAlpha = 0.5;

    if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
      if (boss.facing === -1) {
        ctx.translate(x + boss.w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(res.img, 0, 0, boss.w, boss.h);
      } else {
        ctx.drawImage(res.img, x, y, boss.w, boss.h);
      }
    } else {
      // 画像が無い場合の代替
      ctx.fillStyle = '#6c3483';
      ctx.fillRect(x, y, boss.w, boss.h);
    }
    ctx.restore();
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
      if (statusEl) statusEl.textContent = 'ジャンプ！';
      // 長押し連続ジャンプ防止（任意）
      keys.jump = false;
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
        c.taken = true; coinCount++; if (coinsEl) coinsEl.textContent = `🪙 ${coinCount}`;
      }
    });

    // 敵スポーン（順番に）
    maybeSpawnByProgress();

    // 敵更新・当たり
    enemies.forEach(e => {
      e.x += e.vx;
      // 簡易往復（一定距離で反転：少し長め）
      const cycle = TILE * 10;
      const mod = (e.x + 100000) % cycle;
      if (mod < 2 || mod > cycle - 2) { e.vx *= -1; e.facing = e.vx < 0 ? -1 : 1; }

      // 当たり判定（踏みつけを少し緩める：閾値24）
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 24;
        if (stomp) {
          player.vy = -JUMP * 0.6;
          e.x = -99999; e.vx = 0; // 退場
          if (statusEl) statusEl.textContent = 'やっつけた！';
        } else {
          // 優しめ：スタート付近へ戻す
          player.x = 2 * TILE;
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
          if (statusEl) statusEl.textContent = 'いたっ！もう一度';
        }
      }
    });

    // ゴール直前のボス出現＆更新
    spawnBossIfNearGoal();
    updateBoss();

    // ゴール判定（ボス撃破後でも到達可）
    const goalRect = { x: goal.x - 10, y: goal.y, w: goal.w + 20, h: goal.h };
    const a = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectIntersect(a, goalRect)) {
      finished = true;
      victory.active = true;
      victory.t = 0;
      if (statusEl) statusEl.textContent = `ゴール！コイン ${coinCount} 枚`;
      setTimeout(() => alert(`ゴール！がんばったね！\nコイン ${coinCount} 枚`), 100);

      // BGMフェードアウト（任意）
      if (bgmStarted) {
        const fade = setInterval(() => {
          bgm.volume = Math.max(0, bgm.volume - 0.05);
          if (bgm.volume <= 0) { clearInterval(fade); bgm.pause(); }
        }, 100);
      }
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

    // ボス（影＋本体描画）
    drawBossSafe();

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

  // ===== スタート（画像ロード→BGM初期化→ゲーム開始） =====
  (async () => {
    initBGM();

    const playerRes  = await loadImageSafe('Image.png');
    const enemiesRes = await Promise.all(enemyOrderFiles.map(f => loadImageSafe(f)));
    const bossRes    = await loadImageSafe('boss.png');
    const mioRes     = await loadImageSafe('mio.png');

    sprites = {
      player:  playerRes,
      enemies: enemiesRes,
      boss:    bossRes,
      mio:     mioRes
    };

    if (statusEl) statusEl.textContent = '左右キーで移動、スペースでジャンプ！';
    requestAnimationFrame(update);
  })();

