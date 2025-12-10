
(() => {
  'use strict';

  // ===== DOM =====
  const canvas = document.getElementById('game');
  if (!canvas) { console.error('canvas #game が見つかりません'); return; }
  const ctx = canvas.getContext('2d');
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');

  // ===== 基本定数 =====
  const G = 0.6;        // 重力
  const MOVE = 2.2;     // プレイヤー横速度
  const JUMP = 16;      // ジャンプ初速（高め）
  const TILE = 54;      // タイルサイズ
  const WORLD_WIDTH = 200; // 横タイル数（= 10,800 px）
  const FLOOR_Y = 9;       // 地面のタイル行

  // ===== BGM（ユーザー操作で開始・iPhone対応） =====
  let bgm, bgmReady = false, bgmStarted = false;
  function initBGM() {
    bgm = new Audio();
    bgm.loop = true;
    bgm.volume = 0.35;
  }
  async function tryStartBGMOnce() {
    if (bgmStarted) return;
    try {
      if (!bgm.src) { bgm.src = './bgm.mp3'; bgm.load(); }
      await bgm.play();
      bgmReady = true; bgmStarted = true;
      document.removeEventListener('pointerdown', tryStartBGMOnce, { once: true });
      document.removeEventListener('touchstart',  tryStartBGMOnce, { once: true });
    } catch (err) { console.warn('BGM再生に失敗:', err); }
  }

  // ===== 入力 =====
  const keys = { left: false, right: false, jump: false };
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft')  keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space')      keys.jump = true;
    tryStartBGMOnce();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft')  keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space')      keys.jump = false;
  });

  // タブレット操作（長押し対応）
  function bindTouchHold(btnId, keyName) {
    const el = document.getElementById(btnId);
    if (!el) return;
    const down = ev => { ev.preventDefault(); tryStartBGMOnce(); keys[keyName] = true; el.classList.add('active'); };
    const up   = ev => { ev.preventDefault(); keys[keyName] = false; el.classList.remove('active'); };

    el.addEventListener('pointerdown',  down, { passive: false });
    el.addEventListener('pointerup',    up,   { passive: false });
    el.addEventListener('pointerleave', up,   { passive: false });
    el.addEventListener('pointercancel',up,   { passive: false });

    el.addEventListener('touchstart',   down, { passive: false });
    el.addEventListener('touchend',     up,   { passive: false });
    el.addEventListener('touchcancel',  up,   { passive: false });
  }
  bindTouchHold('btn-left',  'left');
  bindTouchHold('btn-right', 'right');
  bindTouchHold('btn-jump',  'jump');

  canvas.addEventListener('touchstart', ev => ev.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove',  ev => ev.preventDefault(), { passive: false });
  canvas.addEventListener('touchend',   ev => ev.preventDefault(), { passive: false });

  // 初回ジェスチャでBGM開始
  document.addEventListener('pointerdown', tryStartBGMOnce, { once: true });
  document.addEventListener('touchstart',  tryStartBGMOnce, { once: true });

  // ===== 安全画像ローダ =====
  const ASSET_BASE = './';
  function loadImageSafe(file) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ img, ok: true, file });
      img.onerror = () => { console.warn('画像読込失敗:', ASSET_BASE + file); resolve({ img, ok: false, file }); };
      img.src = ASSET_BASE + file;
    });
  }

  let sprites = {
    player: { img: null, ok: false },
    enemies: [], // [{img, ok, file}, ...]
    boss:   { img: null, ok: false },
    mio:    { img: null, ok: false },
    mio2:   { img: null, ok: false } // ★ 追加
  };

  // ===== ステージ（穴の追加あり） =====
  const platforms = [];
  const holes = [
    { start: 28,  len: 2 },  // 小穴1
    { start: 56,  len: 2 },  // 小穴2
    { start: 84,  len: 3 },  // 小穴3（やや広い）
    { start: 112, len: 2 },  // 小穴4
  ];
  const isHole = (i) => holes.some(h => i >= h.start && i < h.start + h.len);

  for (let i = 0; i < WORLD_WIDTH; i++) {
    platforms.push({ x: i * TILE, y: FLOOR_Y * TILE, w: TILE, h: TILE });
    if (i % 15 === 5 && !isHole(i))  platforms.push({ x: i * TILE, y: (FLOOR_Y - 2) * TILE, w: TILE, h: TILE });
    if (i % 23 === 10)               platforms.push({ x: i * TILE, y: (FLOOR_Y - 4) * TILE, w: TILE, h: TILE });
  }

  const coins = [];
  for (let i = 4; i < WORLD_WIDTH; i += 6) {
    coins.push({ x: i * TILE + TILE / 2, y: (FLOOR_Y - 3) * TILE + 10, r: 10, taken: false });
  }

  // ===== プレイヤー =====
  const player = {
    x: 2 * TILE, y: (FLOOR_Y - 1) * TILE - 64,
    w: 48, h: 64, vx: 0, vy: 0, onGround: false, facing: 1
  };

  // ===== 通常敵（2倍表示・後半ほど速く） =====
  const enemyOrderFiles = ['mama.png', 'kairi.png', 'pocha.png', 'papa.png'];

  // ===== ゴール旗（距離半分）＆カメラ =====
  const goal = { x: (Math.floor(WORLD_WIDTH / 2) - 4) * TILE, y: (FLOOR_Y - 5) * TILE, w: 10, h: 200 };
  const goalTileX = Math.floor(goal.x / TILE); // ≈ 96
  const camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

  // 敵の出現位置（papa をゴール前に配置）
  const spawnX = [
    18 * TILE,               // mama
    45 * TILE,               // kairi
    75 * TILE,               // pocha
    (goalTileX - 8) * TILE   // papa（ゴールの少し手前）
  ];

  let nextEnemyIndex = 0;
  const enemies = [];
  function spawnNextEnemy() {
    if (nextEnemyIndex >= enemyOrderFiles.length) return;
    const x = spawnX[nextEnemyIndex];
    const w = 52 * 2, h = 52 * 2;
    const vx = 1.8 + 0.2 * nextEnemyIndex;
    enemies.push({ x, y: (FLOOR_Y - 1) * TILE - h, w, h, vx, facing: -1, slotIndex: nextEnemyIndex });
    nextEnemyIndex++;
  }
  function maybeSpawnByProgress() {
    if (nextEnemyIndex < spawnX.length && player.x > spawnX[nextEnemyIndex] - TILE * 2) spawnNextEnemy();
  }

  // ===== 状態 =====
  let coinCount = 0;
  let finished = false;
  const victory = { active: false, t: 0 };

  // ===== ボス（落下→ぴょんぴょんジャンプ） =====
  const BOSS_SPEED = 2.4;
  const BOSS_JUMP = 14;
  const BOSS_HOP_COOLDOWN = 45;
  let boss = {
    spawned: false, state: 'sleep', x: 0, y: 0,
    w: 96, h: 96, vx: 0, vy: 0, speed: BOSS_SPEED,
    hp: 3, inv: 0, facing: -1, onGround: false, hopCD: 0
  };
  function spawnBossIfNearGoal() {
    if (!boss.spawned && player.x > goal.x - TILE * 12) {
      boss.spawned = true; boss.state = 'drop';
      boss.x = goal.x - TILE * 6; boss.y = (FLOOR_Y - 6) * TILE - 400;
      boss.vx = 0; boss.vy = 2; boss.hp = 3; boss.inv = 0; boss.onGround = false; boss.hopCD = 0; boss.facing = -1;
      statusEl && (statusEl.textContent = 'ボス出現！');
    }
  }
  function updateBoss() {
    if (!boss.spawned || boss.state === 'dead') return;
    boss.inv = Math.max(0, boss.inv - 1);

    if (boss.state === 'drop') {
      boss.vy += G; boss.y += boss.vy;
      const a = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
      for (const p of platforms) {
        if (rectIntersect(a, p)) {
          const fromTop = (a.y + a.h) - p.y < 28 && boss.vy > 0;
          if (fromTop) { boss.y = p.y - boss.h; boss.vy = 0; boss.onGround = true; boss.state = 'hop'; boss.hopCD = 0; break; }
        }
      }
    } else if (boss.state === 'hop') {
      boss.vy += G; boss.y += boss.vy;
      boss.hopCD = Math.max(0, boss.hopCD - 1);
      boss.facing = (player.x < boss.x) ? -1 : 1;
      boss.vx = boss.facing === -1 ? -boss.speed : boss.speed;
      boss.x += boss.vx;
      boss.onGround = false;

      const a = { x: boss.x, y: boss.y, w: boss.w, h: boss.h };
      for (const p of platforms) {
        if (rectIntersect(a, p)) {
          const fromTop   = (a.y + a.h) - p.y < 28 && boss.vy > 0;
          const fromLeft  = (a.x + a.w) - p.x < 20 && boss.vx > 0;
          const fromRight = (p.x + p.w) - a.x < 20 && boss.vx < 0;
          if (fromTop) {
            boss.y = p.y - boss.h; boss.vy = 0; boss.onGround = true;
            if (boss.hopCD === 0) { boss.vy = -BOSS_JUMP; boss.hopCD = BOSS_HOP_COOLDOWN; }
          } else if (fromLeft) { boss.x = p.x - boss.w; boss.facing = -1; }
          else if (fromRight)  { boss.x = p.x + p.w; boss.facing = 1; }
        }
      }

      // プレイヤー当たり
      const pb = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(pb, a)) {
        const stomp = player.vy > 0 && (player.y + player.h) - boss.y < 28 && boss.inv === 0;
        if (stomp) {
          player.vy = -JUMP * 0.65; boss.hp -= 1; boss.inv = 40; boss.x += (player.x < boss.x ? TILE : -TILE);
          statusEl && (statusEl.textContent = `ボスにダメージ！残り ${boss.hp}`);
          if (boss.hp <= 0) { boss.state = 'dead'; boss.y = -99999; statusEl && (statusEl.textContent = 'ボス撃破！'); }
        } else {
          const rewindTiles = 4;
          player.x = clamp(player.x - rewindTiles * TILE, 0, WORLD_WIDTH * TILE - player.w);
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
          statusEl && (statusEl.textContent = 'ボスに当たった！少し戻ったよ');
        }
      }
    }
  }

  // ===== ユーティリティ =====
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const rectIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // ===== 安全描画 =====
  function drawPlayerSafe(x, y, w, h, facing) {
    const res = sprites.player;
    if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
      ctx.save();
      if (facing === -1) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(res.img, 0, 0, w, h); }
      else { ctx.drawImage(res.img, x, y, w, h); }
      ctx.restore();
    } else { ctx.fillStyle = '#2ecc71'; ctx.fillRect(x, y, w, h); }
  }
  function drawEnemySafe(e) {
    const res = sprites.enemies[e.slotIndex]; const x = e.x - camera.x; const y = e.y - camera.y;
    if (res && res.ok && res.img.complete && res.img.naturalWidth > 0) {
      ctx.save();
      if (e.facing === -1) { ctx.translate(x + e.w, y); ctx.scale(-1, 1); ctx.drawImage(res.img, 0, 0, e.w, e.h); }
      else { ctx.drawImage(res.img, x, y, e.w, e.h); }
      ctx.restore();
    } else { ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, e.w, e.h); }
  }
  function drawBossSafe() {
    if (!boss.spawned || boss.state === 'dead') return;
    const res = sprites.boss; const x = boss.x - camera.x; const y = boss.y - camera.y;

    if (boss.state === 'drop') { // 影
      const groundY = FLOOR_Y * TILE - camera.y + 4;
      const height = (groundY - y - boss.h);
      const r = clamp(20 + (height > 0 ? Math.min(60, height / 6) : 0), 20, 80);
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x + boss.w / 2, groundY, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const flashing = boss.inv > 0 && (boss.inv % 8 < 4);
    ctx.save(); if (flashing) ctx.globalAlpha = 0.5;
    if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
      if (boss.facing === -1) { ctx.translate(x + boss.w, y); ctx.scale(-1, 1); ctx.drawImage(res.img, 0, 0, boss.w, boss.h); }
      else { ctx.drawImage(res.img, x, y, boss.w, boss.h); }
    } else { ctx.fillStyle = '#6c3483'; ctx.fillRect(x, y, boss.w, boss.h); }
    ctx.restore();
  }

  // ===== 勝利演出：mio + mio2 を派手に動かす =====
  function drawVictoryPair(k) {
    // k: 0..1（easeOutCubicで滑らかに増加）
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - (1 - k) * 60; // 既存の持ち上げ効果を継続

    const t = victory.t; // フレーム（updateで加算）
    // 回転（逆回転）、拡大縮小の脈動、周回軌道
    const spin1 = t * 0.06;
    const spin2 = -t * 0.08;

    const pulsate1 = 0.25 + 0.15 * Math.sin(t * 0.12);
    const pulsate2 = 0.28 + 0.18 * Math.sin(t * 0.15 + Math.PI / 3);

    const orbit1 = 40 + 60 * k;  // k に応じて軌道半径拡大
    const orbit2 = 60 + 80 * k;

    const ox1 = Math.cos(t * 0.05) * orbit1;
    const oy1 = Math.sin(t * 0.07) * orbit1;

    const ox2 = Math.cos(t * 0.04 + Math.PI) * orbit2;
    const oy2 = Math.sin(t * 0.06 + Math.PI) * orbit2;

    function drawOne(res, x, y, scale, angle, tint) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(scale, scale);

      // 軽いグロー（薄い塗り）
      ctx.globalAlpha = 0.85;
      if (res.ok && res.img.complete && res.img.naturalWidth > 0) {
        const w = res.img.naturalWidth, h = res.img.naturalHeight;
        // 下地の光
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(w, h) * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 本体
        ctx.drawImage(res.img, -w / 2, -h / 2, w, h);
      } else {
        // フォールバック（円）
        const r = 160;
        ctx.fillStyle = tint;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // 本体2枚を描画（色味を分けて華やかさアップ）
    drawOne(sprites.mio,  cx + ox1, cy + oy1, 1.0 + pulsate1 * (k * 1.2), spin1, '#ff66aa');
    drawOne(sprites.mio2, cx + ox2, cy + oy2, 1.0 + pulsate2 * (k * 1.2), spin2, '#66b3ff');

    // スター光線（放射状ライン）
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd700';
    for (let i = 0; i < 12; i++) {
      const ang = t * 0.02 + i * (Math.PI * 2 / 12);
      const r0 = 40;
      const r1 = 120 + 40 * Math.sin(t * 0.10 + i);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ===== メインループ =====
  function update() {
    if (finished) { victory.t += 1; draw(); requestAnimationFrame(update); return; }

    // 入力→速度
    player.vx = 0;
    if (keys.left)  { player.vx = -MOVE; player.facing = -1; }
    if (keys.right) { player.vx =  MOVE; player.facing =  1; }
    if (keys.jump && player.onGround) {
      player.vy = -JUMP; player.onGround = false; if (statusEl) statusEl.textContent = 'ジャンプ！';
      keys.jump = false; // 長押し連続ジャンプ抑制
    }

    // 物理
    player.vy += G; player.x += player.vx; player.y += player.vy;

    // 当たり（地面・足場）
    player.onGround = false;
    platforms.forEach(p => {
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, p)) {
        const fromTop   = (a.y + a.h) - p.y < 20 && player.vy > 0;
        const fromLeft  = (a.x + a.w) - p.x < 20 && player.vx > 0;
        const fromRight = (p.x + p.w) - a.x < 20 && player.vx < 0;
        if (fromTop)      { player.y = p.y - player.h; player.vy = 0; player.onGround = true; }
        else if (fromLeft){ player.x = p.x - player.w; }
        else if (fromRight){ player.x = p.x + p.w; }
        else              { player.y = p.y + p.h; player.vy = 0; }
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

    // 敵スポーン＆更新
    maybeSpawnByProgress();
    enemies.forEach(e => {
      e.x += e.vx;
      const cycle = TILE * 10; const mod = (e.x + 100000) % cycle;
      if (mod < 2 || mod > cycle - 2) { e.vx *= -1; e.facing = e.vx < 0 ? -1 : 1; }
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 24;
        if (stomp) { player.vy = -JUMP * 0.6; e.x = -99999; e.vx = 0; if (statusEl) statusEl.textContent = 'やっつけた！'; }
        else {
          const rewindTiles = 4;
          player.x = clamp(player.x - rewindTiles * TILE, 0, WORLD_WIDTH * TILE - player.w);
          player.y = (FLOOR_Y - 1) * TILE - player.h;
          player.vx = 0; player.vy = 0;
          if (statusEl) statusEl.textContent = 'いたっ！少し戻ったよ';
        }
      }
    });

    // ボス出現＆更新
    spawnBossIfNearGoal();
    updateBoss();

    // ゴール判定
    const goalRect = { x: goal.x - 10, y: goal.y, w: goal.w + 20, h: goal.h };
    const a = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectIntersect(a, goalRect)) {
      finished = true; victory.active = true; victory.t = 0;
      if (statusEl) statusEl.textContent = `ゴール！コイン ${coinCount} 枚`;
      setTimeout(() => alert(`ゴール！がんばったね！\nコイン ${coinCount} 枚`), 100);

      // BGM フェードアウト
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 雲（パララックス）
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 8; i++) {
      const x = (i * 220) - (camera.x * 0.2) % (canvas.width + 300);
      const y = 60 + (i % 3) * 35; cloud(x, y);
    }

    // 地面・足場
    platforms.forEach(p => {
      if (p.x + p.w < camera.x || p.x > camera.x + camera.w) return;
      ctx.fillStyle = '#3b2f2f'; ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, p.h);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(p.x - camera.x, p.y - camera.y, p.w, 6);
    });

    // コイン
    coins.forEach(c => {
      if (c.taken) return;
      if (c.x + 20 < camera.x || c.x - 20 > camera.x + camera.w) return;
      const t = Date.now() / 200;
      ctx.save(); ctx.translate(c.x - camera.x, c.y - camera.y); ctx.rotate(Math.sin(t) * 0.15);
      ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -6, 6, 12); ctx.restore();
    });

    // 敵
    enemies.forEach(e => { if (e.x + e.w < camera.x || e.x > camera.x + camera.w) return; drawEnemySafe(e); });

    // ボス
    drawBossSafe();

    // ゴール旗
    if (goal.x + goal.w >= camera.x && goal.x <= camera.x + camera.w) {
      ctx.fillStyle = '#555'; ctx.fillRect(goal.x - camera.x, goal.y - camera.y, 6, goal.h);
      ctx.fillStyle = '#ff0066';
      ctx.beginPath();
      ctx.moveTo(goal.x - camera.x + 6,  goal.y - camera.y + 10);
      ctx.lineTo(goal.x - camera.x + 80, goal.y - camera.y + 40);
      ctx.lineTo(goal.x - camera.x + 6,  goal.y - camera.y + 70);
      ctx.closePath(); ctx.fill();
    }

    // プレイヤー
    drawPlayerSafe(player.x - camera.x, player.y - camera.y, player.w, player.h, player.facing);

    // 勝利演出（mio + mio2）＋ メッセージ同時表示
    if (victory.active) {
      const duration = 180; const t = clamp(victory.t / duration, 0, 1); const k = easeOutCubic(t);
      drawVictoryPair(k);

      // 既存メッセージ（同時表示）
      ctx.save();
      ctx.fillStyle = '#111';
      ctx.font = '24px "Noto Sans JP", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('安心して下さい！はいてますよ！', canvas.width / 2, 24);
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

  // ===== 起動 =====
  (async () => {
    initBGM();
    const playerRes  = await loadImageSafe('Image.png');
    const enemiesRes = await Promise.all(enemyOrderFiles.map(f => loadImageSafe(f)));
    const bossRes    = await loadImageSafe('boss.png');
    const mioRes     = await loadImageSafe('mio.png');
    const mio2Res    = await loadImageSafe('mio2.png'); // ★ 追加
    sprites = { player: playerRes, enemies: enemiesRes, boss: bossRes, mio: mioRes, mio2: mio2Res };
    if (statusEl) statusEl.textContent = '左右キーで移動、スペースでジャンプ！';
    requestAnimationFrame(update);
  })();
})();
