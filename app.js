
/* ちびジャンプ！ 完成版
 * ご要望対応：
 * - コース半分（LEVEL_LENGTH）
 * - 穴4つ（HOLES）
 * - 敵でやられたら直前から再開（lastSafeX）
 * - ゴール後：mio.png→mio2.png＋ポップメッセ＆コンフェッティ
 */

(() => {
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');

  // --- DOM: モバイルボタン／ゴール演出 ---
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnJump = document.getElementById('btnJump');
  const celebrate = document.getElementById('celebrate');
  const mio1 = document.getElementById('mio1');
  const mio2 = document.getElementById('mio2');
  const popMsg = document.getElementById('popMsg');
  const fxCanvas = document.getElementById('fx');
  const fx = fxCanvas.getContext('2d');

  // --- 画像ロード（無ければ矩形で代替） ---
  function loadImage(src){
    return new Promise((resolve)=>{
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = ()=>resolve(null); // nullならプレースホルダ
      img.src = src;
    });
  }

  // プレイヤー＆敵画像
  const IMAGES = {
    player: 'Image.png',
    enemies: ['mama.png','kairi.png','pocha.png','papa.png']
  };

  let playerImg = null;
  const enemyImgs = [];

  // --- レベル設定（短縮版） ---
  const LEVEL_LENGTH = 1400;        // 例：以前の ~2800 を半分程度に
  const GROUND_Y = cvs.height - 80; // 地面の高さ
  const GOAL_X = LEVEL_LENGTH - 90; // ゴール位置（旗の手前）
  const CAMERA_MARGIN = 200;        // 画面追従マージン

  // 穴を4つ配置（x位置と幅）。数値は自由に調整可
  const HOLES = [
    { x: 260,  w: 90 },
    { x: 560,  w: 80 },
    { x: 860,  w: 100 },
    { x: 1100, w: 90 },
  ];

  // 敵配置（順番：mama→kairi→pocha→papa）
  const enemies = [
    { x: 370,  y: GROUND_Y - 48, w: 46, h: 46, vx: 0.6, dir: -1, imgIndex: 0 },
    { x: 690,  y: GROUND_Y - 48, w: 46, h: 46, vx: 0.7, dir: 1,  imgIndex: 1 },
    { x: 980,  y: GROUND_Y - 48, w: 52, h: 52, vx: 0.5, dir: -1, imgIndex: 2 },
    { x: 1260, y: GROUND_Y - 56, w: 56, h: 56, vx: 0.45,dir: 1,  imgIndex: 3 },
  ];

  // --- プレイヤー ---
  const player = {
    x: 40, y: GROUND_Y - 44, w: 38, h: 44,
    vx: 0, vy: 0,
    speed: 2.1,
    jump: -8.6,
    onGround: true,
  };

  // 「少し前」から再開するための安全地点
  let lastSafeX = player.x;

  // --- 入力 ---
  const keys = { left:false, right:false, jump:false };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') keys.jump = false;
  });

  // モバイルボタン
  function bindBtn(btn, flag){
    btn.addEventListener('pointerdown', ()=>{ keys[flag] = true; });
    btn.addEventListener('pointerup',   ()=>{ keys[flag] = false; });
    btn.addEventListener('pointerleave',()=>{ keys[flag] = false; });
  }
  bindBtn(btnLeft,'left');
  bindBtn(btnRight,'right');
  bindBtn(btnJump,'jump');

  // --- 物理 ---
  const GRAVITY = 0.45;
  const FRICTION = 0.88;

  // --- カメラ ---
  let camX = 0;

  // --- 状態 ---
  let gameOver = false;
  let goalReached = false;

  // --- ユーティリティ ---
  function rectsOverlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function inHoleAt(x){
    // x座標が地面上の穴範囲に入っているか
    return HOLES.some(h => x + player.w > h.x && x < h.x + h.w);
  }

  // --- ゴール演出（mio1→mio2→メッセ＋コンフェッティ） ---
  function startCelebration(){
    goalReached = true;
    celebrate.classList.remove('hidden');
    celebrate.setAttribute('aria-hidden','false');

    mio1.classList.remove('hidden');
    mio1.classList.add('show-fly');

    setTimeout(()=>{
      mio2.classList.remove('hidden');
      mio2.classList.add('show-spin');
    }, 900);

    setTimeout(()=>{
      popMsg.classList.remove('hidden');
      popMsg.classList.add('show-pop');
    }, 900 + 1000);

    // コンフェッティ開始
    startConfetti();
  }

  // --- コンフェッティ（簡易） ---
  const confetti = [];
  function spawnConfetti(){
    for(let i=0;i<40;i++){
      confetti.push({
        x: Math.random()*cvs.width,
        y: -20*Math.random(),
        vx: (Math.random()-0.5)*1.2,
        vy: 1.2 + Math.random()*1.6,
        size: 6 + Math.random()*8,
        color: `hsl(${Math.floor(Math.random()*360)},90%,60%)`,
        rot: Math.random()*360,
        vr: (Math.random()-0.5)*6
      });
    }
  }
  function updateConfetti(){
    fx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    for(const p of confetti){
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if(p.y > fxCanvas.height + 30) {
        p.y = -20; p.x = Math.random()*fxCanvas.width;
      }
      fx.save();
      fx.translate(p.x, p.y);
      fx.rotate(p.rot * Math.PI/180);
      fx.fillStyle = p.color;
      fx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      fx.restore();
    }
    requestAnimationFrame(updateConfetti);
  }
  function startConfetti(){
    fxCanvas.classList.remove('hidden');
    spawnConfetti();
    updateConfetti();
  }

  // --- ゲーム初期化（画像ロード） ---
  (async function init(){
    playerImg = await loadImage(IMAGES.player);
    for(const src of IMAGES.enemies){
      enemyImgs.push(await loadImage(src));
    }
    requestAnimationFrame(loop);
  })();

  // --- メインループ ---
  function loop(){
    if (gameOver) return;

    // 物理更新（ゴール後は停止）
    if (!goalReached){
      // 横移動
      if (keys.left)  player.vx -= 0.15;
      if (keys.right) player.vx += 0.15;
      player.vx *= FRICTION;
      // ジャンプ
      if (keys.jump && player.onGround){
        player.vy = player.jump;
        player.onGround = false;
      }
      // 重力
      player.vy += GRAVITY;

      // 位置更新
      player.x += player.vx;
      player.y += player.vy;

      // 地面接地＆穴判定
      const onGroundLine = player.y + player.h >= GROUND_Y;
      const isInHole = inHoleAt(player.x);

      if (onGroundLine && !isInHole){
        player.y = GROUND_Y - player.h;
        player.vy = 0;
        player.onGround = true;
        // 安全地点更新（最後に地面にいたX）
        lastSafeX = player.x;
      } else if (player.y > cvs.height + 200) {
        // 穴に落下などで画面外 → デス→直前から再開
        respawnFromCheckpoint();
      } else {
        player.onGround = false;
      }

      // 左右の境界
      if (player.x < 0) player.x = 0;
      if (player.x + player.w > LEVEL_LENGTH) player.x = LEVEL_LENGTH - player.w;

      // 敵更新＆当たり判定
      for(let i=0;i<enemies.length;i++){
        const e = enemies[i];
        // 往復パトロール（穴に落ちない簡易処理）
        e.x += e.vx * e.dir;
        // 端で向き反転
        if (e.x < 40) { e.x = 40; e.dir = 1; }
        if (e.x + e.w > LEVEL_LENGTH-40) { e.x = LEVEL_LENGTH-40-e.w; e.dir = -1; }
        // プレイヤー衝突
        if (rectsOverlap(player,{x:e.x,y:e.y,w:e.w,h:e.h})){
          respawnFromCheckpoint();
          break;
        }
      }

      // ゴール判定
      if (player.x + player.w >= GOAL_X){
        startCelebration();
      }
    }

    // カメラ（追従）
    camX = Math.max(0, Math.min(player.x - CAMERA_MARGIN, LEVEL_LENGTH - cvs.width));

    // 描画
    draw();

    requestAnimationFrame(loop);
  }

  function respawnFromCheckpoint(){
    // 「少し前」から再開
    player.x = Math.max(0, lastSafeX - 60);
    player.y = GROUND_Y - player.h;
    player.vx = 0; player.vy = 0;
    player.onGround = true;
  }

  // --- 描画 ---
  function draw(){
    ctx.clearRect(0,0,cvs.width,cvs.height);

    // 背景
    ctx.fillStyle = '#bde7ff';
    ctx.fillRect(0,0,cvs.width,cvs.height);

    // 地面（スクロール）
    ctx.save();
    ctx.translate(-camX,0);

    // 地面帯
    ctx.fillStyle = '#3a2f1f';
    ctx.fillRect(0,GROUND_Y,cvs.width*3, cvs.height-GROUND_Y); // ざっくり

    // 穴（ギャップ）を切り抜き風に描く
    ctx.fillStyle = '#000';
    for(const h of HOLES){
      ctx.fillRect(h.x, GROUND_Y, h.w, cvs.height-GROUND_Y);
    }

    // 旗（ゴール）
    drawFlag(GOAL_X, GROUND_Y);

    // 敵
    for(let i=0;i<enemies.length;i++){
      const e = enemies[i];
      if (enemyImgs[i]){
        ctx.drawImage(enemyImgs[i], e.x, e.y, e.w, e.h);
      } else {
        ctx.fillStyle = ['#ff6b6b','#ffd93d','#6bcB77','#4d96ff'][i%4];
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.strokeStyle = '#000'; ctx.strokeRect(e.x, e.y, e.w, e.h);
      }
    }

    // プレイヤー
    if (playerImg){
      ctx.drawImage(playerImg, player.x, player.y, player.w, player.h);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(player.x, player.y, player.w, player.h);
      ctx.strokeStyle = '#000'; ctx.strokeRect(player.x, player.y, player.w, player.h);
    }

    ctx.restore();

    // 進捗バー（任意）
    ctx.fillStyle = '#000';
    const barW = cvs.width * ((player.x + player.w) / LEVEL_LENGTH);
    ctx.fillRect(0, 8, barW, 6);
    ctx.strokeStyle = '#000'; ctx.strokeRect(0,8,cvs.width,6);
  }

  function drawFlag(x, groundY){
    const poleH = 120;
    // ポール
    ctx.fillStyle = '#555';
    ctx.fillRect(x, groundY - poleH, 6, poleH);
    // 旗
    ctx.fillStyle = '#ff3e7f';
    ctx.beginPath();
    ctx.moveTo(x+6, groundY - poleH + 12);
    ctx.lineTo(x+76, groundY - poleH + 32);
    ctx.lineTo(x+6, groundY - poleH + 52);
    ctx.closePath();
    ctx.fill();
    // 旗輪郭
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeRect(x, groundY - poleH, 6, poleH);
  }

})();
