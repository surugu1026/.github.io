
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // 物理・ゲーム設定
  const G = 0.6;                  // 重力
  const MOVE = 2.2;               // 移動速度
  const JUMP = 10.5;              // ジャンプ初速
  const TILE = 54;                // タイルサイズ（540px高さに合わせやすい）
  const WORLD_WIDTH = 200;        // タイル数（横）
  const FLOOR_Y = 9;              // 地面(タイル行)

  // プレイヤー
  const player = { x: 2 * TILE, y: (FLOOR_Y - 1) * TILE - 40, w: 34, h: 44, vx: 0, vy: 0, onGround: false, facing: 1 };

  // 入力
  const keys = { left: false, right: false, jump: false };

  // ステージ生成（簡易：台・コイン・敵）
  const platforms = []; // {x,y,w,h}
  const coins = [];     // {x,y,r,taken}
  const enemies = [];   // {x,y,w,h,vx}

  // 地面と段差
  for (let i = 0; i < WORLD_WIDTH; i++) {
    platforms.push({ x: i * TILE, y: FLOOR_Y * TILE, w: TILE, h: TILE }); // 地面
    if (i % 15 === 5) platforms.push({ x: i * TILE, y: (FLOOR_Y - 2) * TILE, w: TILE, h: TILE }); // 小段差
    if (i % 23 === 10) platforms.push({ x: i * TILE, y: (FLOOR_Y - 4) * TILE, w: TILE, h: TILE }); // 高段差
  }

  // コイン配置
  for (let i = 4; i < WORLD_WIDTH; i += 6) {
    coins.push({ x: i * TILE + TILE / 2, y: (FLOOR_Y - 3) * TILE + 10, r: 10, taken: false });
  }

  // 敵配置（左右に歩く）
  for (let i = 18; i < WORLD_WIDTH; i += 25) {
    enemies.push({ x: i * TILE, y: (FLOOR_Y - 1) * TILE - 30, w: 38, h: 30, vx: 1.2 });
  }

  // ゴール旗
  const goal = { x: (WORLD_WIDTH - 4) * TILE, y: (FLOOR_Y - 5) * TILE, w: 10, h: 200 };

  // カメラ
  const camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

  // HUD
  const coinsEl = document.getElementById('coins');
  const statusEl = document.getElementById('status');
  let coinCount = 0;
  let finished = false;

  // ユーティリティ
  const rectIntersect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // 入力イベント（キーボード）
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'Space') keys.jump = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'Space') keys.jump = false;
  });

  // モバイルのタッチボタン
  document.getElementById('btn-left').addEventListener('pointerdown', () => keys.left = true);
  document.getElementById('btn-left').addEventListener('pointerup', () => keys.left = false);
  document.getElementById('btn-right').addEventListener('pointerdown', () => keys.right = true);
  document.getElementById('btn-right').addEventListener('pointerup', () => keys.right = false);
  document.getElementById('btn-jump').addEventListener('pointerdown', () => keys.jump = true);
  document.getElementById('btn-jump').addEventListener('pointerup', () => keys.jump = false);

  // メインループ
  function update() {
    if (finished) return;

    // 入力による速度
    player.vx = 0;
    if (keys.left) { player.vx = -MOVE; player.facing = -1; }
    if (keys.right) { player.vx = MOVE; player.facing = 1; }

    // ジャンプ
    if (keys.jump && player.onGround) { player.vy = -JUMP; player.onGround = false; statusEl.textContent = 'ジャンプ！'; }

    // 物理更新
    player.vy += G;
    player.x += player.vx;
    player.y += player.vy;

    // 当たり判定（プラットフォーム）
    player.onGround = false;
    platforms.forEach(p => {
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, p)) {
        // どこから衝突したか簡易判定
        const fromTop = (a.y + a.h) - p.y < 20 && player.vy > 0;
        const fromLeft = (a.x + a.w) - p.x < 20 && player.vx > 0;
        const fromRight = (p.x + p.w) - a.x < 20 && player.vx < 0;

        if (fromTop) { player.y = p.y - player.h; player.vy = 0; player.onGround = true; }
        else if (fromLeft) { player.x = p.x - player.w; }
        else if (fromRight) { player.x = p.x + p.w; }
        else { player.y = p.y + p.h; player.vy = 0; } // 下から当たった場合
      }
    });

    // コイン取得
    coins.forEach(c => {
      if (!c.taken) {
        const dx = (player.x + player.w / 2) - c.x;
        const dy = (player.y + player.h / 2) - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < c.r + Math.min(player.w, player.h) / 2) {
          c.taken = true; coinCount++; coinsEl.textContent = `🪙 ${coinCount}`;
        }
      }
    });

    // 敵の更新＆当たり
    enemies.forEach(e => {
      e.x += e.vx;
      // 端で反転
      if (e.x % (TILE * 8) < 2 || e.x % (TILE * 8) > (TILE * 8 - 2)) e.vx *= -1;

      // 当たり（上から踏んだら消える）
      const a = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectIntersect(a, e)) {
        const stomp = player.vy > 0 && (player.y + player.h) - e.y < 18;
        if (stomp) { player.vy = -JUMP * 0.6; e.x = -9999; statusEl.textContent = 'やっつけた！'; }
        else {
          // ダメージ → スタート付近へ戻す（優しめ）
          player.x = 2 * TILE; player.y = (FLOOR_Y - 1) * TILE - 40; player.vx = 0; player.vy = 0; statusEl.textContent = 'いたっ！もう一度';
        }
      }
    });

    // ゴール判定
    const goalRect = { x: goal.x - 10, y: goal.y, w: goal.w + 20, h: goal.h };
    const a = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectIntersect(a, goalRect)) {
      finished = true;
      statusEl.textContent = `ゴール！コイン ${coinCount} 枚`;
      setTimeout(() => alert(`ゴール！がんばったね！\nコイン ${coinCount} 枚`), 100);
    }

    // カメラ追従（中央に保つ、左右制限）
    camera.x = Math.max(0, Math.min(player.x - camera.w / 2, (WORLD_WIDTH * TILE) - camera.w));

    draw();
    requestAnimationFrame(update);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景（空）
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 遠景の雲
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
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
      // 芝生
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

    // 敵
    enemies.forEach(e => {
      if (e.x + e.w < camera.x || e.x > camera.x + camera.w) return;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(e.x - camera.x, e.y - camera.y, e.w, e.h);
      // 目
      ctx.fillStyle = '#fff';
      ctx.fillRect(e.x - camera.x + 6, e.y - camera.y + 6, 8, 8);
      ctx.fillRect(e.x - camera.x + e.w - 14, e.y - camera.y + 6, 8, 8);
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

    // プレイヤー（丸＋帽子風）
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(player.x - camera.x, player.y - camera.y, player.w, player.h);
    ctx.fillStyle = '#1e8449';
    ctx.fillRect((player.x - camera.x) + (player.facing === 1 ? 10 : 0), player.y - camera.y - 8, 24, 8);
  }

  function cloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.arc(x + 26, y + 10, 22, 0, Math.PI * 2);
    ctx.arc(x - 26, y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // 開始
  statusEl.textContent = '左右移動・スペースでジャンプ！';
  update();
})();
