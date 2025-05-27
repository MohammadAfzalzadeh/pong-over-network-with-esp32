import net from 'node:net';

/* ────────────────  Game constants ──────────────── */
const GAME_WIDTH        = 128;
const GAME_HEIGHT       = 64;
const PADDLE_HEIGHT     = 16;
const PADDLE_WIDTH      = 2;
const BALL_SIZE         = 2;
const BALL_SPEED        = 5;
const WINNING_SCORE     = 10;
const FRAME_DURATION    = 1000 / 2;   // ≈10 fps
const PADDLE_PADDING    = 5;

/* ────────────────  Server-side state ──────────────── */
const players = new Map();   // name ➜ { name, inGame }
const sockets = [];          // connected net.Socket objects
let game = null;             // current match (or null)

/* ────────────────  Message handlers ──────────────── */
const socketHandlers = {
  'player:join'   : joinPlayer,
  'game:spectate' : () => {console.log('fuck YOU')},
  'game:paddle'   : movePaddle,
};

/* ────────────────  TCP server ──────────────── */
const server = net.createServer(socket => {
  console.log('Client connected');
  sockets.push(socket);

  socket.on('data', raw => {
    try {
      const { event, data } = JSON.parse(raw.toString());
      const handler = socketHandlers[event];
      if (handler) handler(socket, data);
    } catch (err) {
      console.error('Bad message:', raw.toString());
    }
  });

  socket.on('end', () => {
    const i = sockets.indexOf(socket);
    if (i !== -1) sockets.splice(i, 1);
  });

  socket.on('error', (err) => {
    if (err.code === 'ECONNRESET') {
      console.warn('Client disconnected unexpectedly (ECONNRESET)');
    } else {
      console.error('Socket error:', err);
    }
    const i = sockets.indexOf(socket);
    if (i !== -1) sockets.splice(i, 1);
  });
});


/* ────────────────  Handlers ──────────────── */
function joinPlayer(socket, data = {}) {
  const name = data.name || `Player ${sockets.indexOf(socket) + 1}`;
  if (players.has(name)) return;        // avoid duplicates
  players.set(name, { name, inGame: false });

  if (players.size === 2 && !game) createGame([...players.keys()]);
}

function movePaddle(_socket, data = {}) {
  if (!game) return;
  const { y, playerName } = data;
  if (typeof y !== 'number' || !playerName) return;

  const idx = game.players.indexOf(playerName);
  const clampedY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, y));
  if (idx === 0) game.leftPaddle.y  = clampedY;
  if (idx === 1) game.rightPaddle.y = clampedY;
}

/* ────────────────  Game helpers ──────────────── */
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  sockets.forEach(s => s.write(msg));
}

function createGame([p1, p2]) {
  game = {
    players      : [p1, p2],
    leftPaddle   : { x: PADDLE_PADDING,             y: GAME_HEIGHT/2 },
    rightPaddle  : { x: GAME_WIDTH - PADDLE_PADDING, y: GAME_HEIGHT/2  },
    ball         : {
      x : GAME_WIDTH  / 2,
      y : GAME_HEIGHT / 2,
      dx: Math.random() > 0.5 ?  BALL_SPEED : -BALL_SPEED,
      dy: Math.random() > 0.5 ?  BALL_SPEED : -BALL_SPEED,
    },
    leftScore    : 0,
    rightScore   : 0,
    interval     : null,
    lastUpdate   : Date.now(),
  };

  game.interval = setInterval(updateGame, FRAME_DURATION);
  broadcast({ status: 'game is ready' });
}


function updateGame() {
  if (!game) return;

  const now = Date.now();
  const deltaTime = (now - game.lastUpdate) / FRAME_DURATION;
  game.lastUpdate = now;
  if (!Number.isFinite(deltaTime)) return;

  const b = game.ball;

  // Move ball
  b.x += b.dx * deltaTime;
  b.y += b.dy * deltaTime;

  // Bounce off top and bottom
  if (b.y <= 0 || b.y + BALL_SIZE >= GAME_HEIGHT) {
    b.y = Math.max(0, Math.min(GAME_HEIGHT - BALL_SIZE, b.y));
    b.dy *= -1;
  }

  // Left paddle collision
  const left = game.leftPaddle;
  if (
    b.dx < 0 &&
    b.x <= left.x + PADDLE_WIDTH &&
    b.x + BALL_SIZE >= left.x &&
    b.y + BALL_SIZE >= left.y &&
    b.y <= left.y + PADDLE_HEIGHT
  ) {
    const hitRatio = (b.y + BALL_SIZE / 2 - left.y) / PADDLE_HEIGHT;
    const angle = (hitRatio - 0.5) * Math.PI / 2;
    b.dx = Math.abs(b.dx) * 1.05;
    b.dy = BALL_SPEED * Math.sin(angle);
  }

  // Right paddle collision
  const right = game.rightPaddle;
  if (
    b.dx > 0 &&
    b.x + BALL_SIZE >= right.x &&
    b.x <= right.x + PADDLE_WIDTH &&
    b.y + BALL_SIZE >= right.y &&
    b.y <= right.y + PADDLE_HEIGHT
  ) {
    const hitRatio = (b.y + BALL_SIZE / 2 - right.y) / PADDLE_HEIGHT;
    const angle = (hitRatio - 0.5) * Math.PI / 2;
    b.dx = -Math.abs(b.dx) * 1.05;
    b.dy = BALL_SPEED * Math.sin(angle);
  }

  // Check for scoring
  if (b.x + BALL_SIZE < 0) {
    game.rightScore++;
    if (game.rightScore >= WINNING_SCORE) return endGame(game.players[1]);
    resetBall(-1);
  } else if (b.x > GAME_WIDTH) {
    game.leftScore++;
    if (game.leftScore >= WINNING_SCORE) return endGame(game.players[0]);
    resetBall(1);
  }

  // Broadcast state
  broadcast({
    leftPaddle: Math.round(left.y),
    rightPaddle: Math.round(right.y),
    ball: {
      x: Math.round(b.x),
      y: Math.round(b.y),
    },
    leftScore: game.leftScore,
    rightScore: game.rightScore,
  });
}


function resetBall(dir) {
  if (!game) return;
  game.ball = {
    x : GAME_WIDTH  / 2,
    y : GAME_HEIGHT / 2,
    dx: BALL_SPEED * dir,
    dy: Math.random() > 0.5 ?  BALL_SPEED : -BALL_SPEED,
  };
}

function endGame(winnerId) {
  const left = game.leftPaddle;
  const right = game.rightPaddle;
  const b = game.ball;

  broadcast({
    leftPaddle: Math.round(left.y),
    rightPaddle: Math.round(right.y),
    ball: {
      x: Math.round(b.x),
      y: Math.round(b.y),
    },
    leftScore: game.leftScore,
    rightScore: game.rightScore,
  });

  clearInterval(game?.interval);
  const winnerName = players.get(winnerId)?.name || 'Unknown';
  broadcast({ winner: winnerId, winnerName });

  sockets.forEach(s => s.end());
  players.clear();
  game = null;
}

/* ────────────────  Start server ──────────────── */
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Pong server running on port ${PORT}`)
);
