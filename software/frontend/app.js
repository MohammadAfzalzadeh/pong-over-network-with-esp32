const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreDiv = document.getElementById('score');
const statusDiv = document.getElementById('status');
const winMessage = document.getElementById('winMessage');
const winnerText = document.getElementById('winnerText');

const barLeft = document.getElementById('bar-left');
const barRight = document.getElementById('bar-right');

const socket = new WebSocket('ws://172.21.51.84:4000');

// Show connection status
socket.addEventListener('open', () => {
  statusDiv.textContent = "🟢 Connected";
  socket.send(JSON.stringify({ type: 'spectate' }));
});

socket.addEventListener('close', () => {
  statusDiv.textContent = "🔴 Disconnected";
});

// Handle incoming game data
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  const { leftPaddle, rightPaddle, ball, leftScore, rightScore } = data;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw paddles and ball
  ctx.fillStyle = "white";
  ctx.fillRect(2, leftPaddle, 2, 16);   // Left paddle
  ctx.fillRect(124, rightPaddle, 2, 16); // Right paddle
  ctx.fillRect(ball.x, ball.y, 2, 2);   // Ball

  // Update scoreboard
  scoreDiv.textContent = `P1: ${leftScore} | P2: ${rightScore}`;

  // Update energy bars based on score (max 10)
  barLeft.style.width = `${(leftScore / 10) * 100}%`;
  barRight.style.width = `${(rightScore / 10) * 100}%`;

  // Display win message if someone reaches 10
  if (leftScore === 10 || rightScore === 10) {
    winnerText.textContent = leftScore === 10 ? '🏆 Player 1 Wins!' : '🏆 Player 2 Wins!';
    winMessage.classList.remove('hidden');

    // Optionally stop receiving updates
    socket.close();
  }
});