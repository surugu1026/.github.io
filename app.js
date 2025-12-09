/* ===== Maze Adventure =====
 * 機能:
 * - 迷路自動生成 (深さ優先探索 / 壁壊し)
 * - プレイヤー移動: 矢印/WASD + タッチジョイスティック
 * - タイマー計測、各レベルのベストタイム localStorage 保存
 * - レベル進行: 8x8 → 12x12 → 16x16 → 20x20 ...
 * - 壁/通路/プレイヤー/ゴールをキャンバス描画
 */

const canvas = document.getElementById('maze');
const ctx = canvas.getContext('2d');
const levelEl = document.getElementById('level');
const timeEl  = document.getElementById('time');
const bestEl  = document.getElementById('best');
const btnStart = document.getElementById('btnStart');
const btnNext  = document.getElementById('btnNext');
const btnReset = document.getElementById('btnReset');
const joystick = document.getElementById('joystick');

let gridSize = 8;       // 初期セル数（偶数推奨）
let cellPx   = Math.floor(canvas.width / gridSize);
let maze, start, goal, player;
let running = false;
let startTime = 0;
let rafId = null;
let level = 1;

// ===== 迷路生成（深さ優先探索）=====
function generateMaze(n) {
  const W = n, H = n;
  // 0: 壁, 1: 通路
  const m = Array.from({ length: H }, () => Array(W).fill(0));

  // 奇数セルを通路候補に
  for (let y = 1; y < H; y += 2) {
    for (let x = 1; x < W; x += 2) m[y][x] = 1;
  }

  const dirs = [[0,-2],[2,0],[0,2],[-2,0]];
  const stack = [[1,1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length-1];
    // 未訪問の隣接候補
    const candidates = dirs
      .map(([dx,dy]) => [cx+dx, cy+dy])
      .filter(([nx,ny]) => nx>0 && ny>0 && nx<W-1 && ny<H-1 && m[ny][nx]===1 && m[ny- (dySign(ny,cy))][nx- (dxSign(nx,cx))]===0);

    // 隣接の通路が未接続なら接続
    const unvisited = dirs
      .map(([dx,dy]) => [cx+dx, cy+dy, dx, dy])
      .filter(([nx,ny]) => nx>0 && ny>0 && nx<W-1 && ny<H-1 && m[ny][nx]===1 && m[(ny+cy)/2][(nx+cx)/2]===0);

    if (unvisited.length === 0) {
      stack.pop();
      continue;
    }
    // ランダムに1つ選択
    const [nx, ny, dx, dy] = unvisited[Math.floor(Math.random()*unvisited.length)];
    // 壁壊し（中間を通路に）
    m[(ny+cy)/2][(nx+cx)/2] = 1;
    stack.push([nx,ny]);
  }

  // スタート/ゴール設定
  const s = { x:1, y:1 };
  const g = { x:W-2, y:H-2 };
  return { m, s, g };
}

// 補助: シグン（中間計算を簡単に）
const dxSign = (nx,cx) => Math.sign(nx-cx);
const dySign = (ny,cy) => Math.sign(ny-cy);

// ===== 描画 =====
function drawMaze() {
  const W = maze.m[0].length;
  const H = maze.m.length;
  cellPx = Math.floor(Math.min(canvas.width / W, canvas.height / H));

  ctx.fillStyle = getCss('--panel');
  ctx.fillRect(0,0,canvas.width,canvas.height);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const val = maze.m[y][x];
      ctx.fillStyle = val ? getCss('--path') : getCss('--wall');
      ctx.fillRect(x*cellPx, y*cellPx, cellPx, cellPx);
    }
  }
  // ゴール
  ctx.fillStyle = getCss('--accent');
  ctx.fillRect(maze.g.x*cellPx, maze.g.y*cellPx, cellPx, cellPx);
  // プレイヤー
  ctx.fillStyle = getCss('--player');
  ctx.beginPath();
  const pad = 4;
  ctx.roundRect(player.x*cellPx+pad, player.y*cellPx+pad, cellPx-2*pad, cellPx-2*pad, 8);
  ctx.fill();
}

function getCss(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ===== ゲーム制御 =====
function startGame(resetLevel=false) {
  if (resetLevel) { level = 1; gridSize = 8; }
  levelEl.textContent = level;
  ({ m: mazeMap, s: start, g: goal } = generateMaze(gridSize));
  maze = { m: mazeMap, s: start, g: goal };
  player = { x: start.x, y: start.y };
  running = true;
  startTime = performance.now();
  btnNext.disabled = true;
  updateBestUI();
  drawMaze();
  runLoop();
}

function nextLevel() {
  level++;
  // 難易度を適度に上げる（最大24〜28推奨）
  gridSize = Math.min(8 + (level-1)*4, 28);
  startGame(false);
}

function runLoop() {
  // タイマー更新
  const elapsed = (performance.now() - startTime)/1000;
  timeEl.textContent = elapsed.toFixed(1);
  drawMaze();
  // ゴール判定
  if (player.x === goal.x && player.y === goal.y) {
    running = false;
    saveBest(level, elapsed);
    btnNext.disabled = false;
  }
  if (running) rafId = requestAnimationFrame(runLoop);
}

// ===== 入力処理 =====
const keyMap = {
  ArrowUp: [0,-1],    KeyW: [0,-1],
  ArrowDown: [0,1],   KeyS: [0,1],
  ArrowLeft: [-1,0],  KeyA: [-1,0],
  ArrowRight: [1,0],  KeyD: [1,0],
};
document.addEventListener('keydown', (e) => {
  const move = keyMap[e.code];
  if (!move) return;
  e.preventDefault();
  tryMove(move[0], move[1]);
});

joystick.addEventListener('click', (e) => {
  const btn = e.target.closest('.joy');
  if (!btn) return;
  const dir = btn.dataset.dir;
  const dirMap = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
  tryMove(...dirMap[dir]);
});

function tryMove(dx, dy) {
  if (!running) return;
  const nx = player.x + dx;
  const ny = player.y + dy;
  if (maze.m[ny]?.[nx] === 1) {
    player.x = nx; player.y = ny;
  }
}

// ===== ベストタイム =====
const BEST_KEY = 'maze_best_times_v1';
function saveBest(lv, t) {
  const db = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  if (!db[lv] || t < db[lv]) db[lv] = Number(t.toFixed(1));
  localStorage.setItem(BEST_KEY, JSON.stringify(db));
  updateBestUI();
}
function updateBestUI() {
  const db = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  const lv = level;
  bestEl.textContent = db[lv] ? db[lv].toFixed(1) : '—';
}
btnReset.addEventListener('click', () => {
  localStorage.removeItem(BEST_KEY);
  updateBestUI();
});

// ===== ボタン =====
btnStart.addEventListener('click', () => startGame(true));
btnNext.addEventListener('click', () => nextLevel());

// 初期描画
(function init() {
  // 端末サイズに応じてキャンバス可変（正方形を維持）
  function resizeCanvas() {
    const size = Math.min(window.innerWidth*0.92, window.innerHeight*0.62);
    canvas.width = canvas.height = Math.max(320, Math.floor(size));
    if (maze) drawMaze();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
})();
