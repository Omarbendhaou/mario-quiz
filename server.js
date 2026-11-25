const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

// Configuration
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST_PIN = process.env.HOST_PIN || '1234';
const QUESTION_TIME = parseInt(process.env.QUESTION_TIME, 10) || 60;
const BASE_POINTS = parseInt(process.env.BASE_POINTS, 10) || 500;
const BONUS_POINTS = parseInt(process.env.BONUS_POINTS, 10) || 500;
const PUBLIC_URL = process.env.PUBLIC_URL || null;

// Load questions
let questions = [];
try {
  const rawQuestions = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  questions = JSON.parse(rawQuestions);
  console.log(`Loaded ${questions.length} questions.`);
} catch (err) {
  console.error('Error loading questions.json:', err);
  process.exit(1);
}

// Helpers
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function sanitizeText(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .replace(/[&<>"']/g, (m) => {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return m;
      }
    });
}

const lanIp = getLanIp();
const playerUrl = PUBLIC_URL || `http://${lanIp}:${PORT}`;

// App & Socket Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get(['/', '/play'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// App Info API
app.get('/api/info', async (req, res) => {
  try {
    let effectivePlayerUrl = null;

    // 1. Explicit PUBLIC_URL or Render auto-assigned external URL
    if (process.env.PUBLIC_URL) {
      effectivePlayerUrl = process.env.PUBLIC_URL;
    } else if (process.env.RENDER_EXTERNAL_URL) {
      effectivePlayerUrl = process.env.RENDER_EXTERNAL_URL;
    }

    // 2. Client query parameter (sent from browser window.location.origin)
    if (!effectivePlayerUrl && req.query.clientOrigin) {
      effectivePlayerUrl = req.query.clientOrigin;
    }

    // 3. Reverse proxy headers (Render, Heroku, ngrok, Cloudflare)
    if (!effectivePlayerUrl) {
      const hostHeader = req.get('x-forwarded-host') || req.get('host');
      const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      if (hostHeader) {
        effectivePlayerUrl = `${proto}://${hostHeader}`;
      }
    }

    // 4. If running locally on localhost, use local LAN IP so phones on same Wi-Fi can join
    if (effectivePlayerUrl && (effectivePlayerUrl.includes('localhost') || effectivePlayerUrl.includes('127.0.0.1'))) {
      const lan = getLanIp();
      if (lan && lan !== '127.0.0.1') {
        effectivePlayerUrl = `http://${lan}:${PORT}`;
      } else {
        effectivePlayerUrl = `http://localhost:${PORT}`;
      }
    }

    // Fallback
    if (!effectivePlayerUrl) {
      effectivePlayerUrl = playerUrl;
    }

    // Clean any trailing slashes or /host paths
    effectivePlayerUrl = effectivePlayerUrl.replace(/\/+$/, '').replace(/\/host$/, '');

    const qrDataUrl = await QRCode.toDataURL(effectivePlayerUrl, {
      margin: 1,
      width: 280,
      color: { dark: '#000000', light: '#ffffff' }
    });

    res.json({
      playerUrl: effectivePlayerUrl,
      qrDataUrl,
      questionCount: questions.length,
      questionTime: QUESTION_TIME
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// --- Game Engine State ---
class GameEngine {
  constructor() {
    this.state = 'LOBBY'; // LOBBY, QUESTION, REVEAL, LEADERBOARD, FINAL
    this.currentQuestionIndex = 0;
    this.timer = QUESTION_TIME;
    this.timerInterval = null;
    this.isPaused = false;
    this.questionStartTime = null;
    this.pausedAt = null;
    this.settings = {
      autoAdvanceAllAnswered: true
    };
    // Map: token -> Team
    // Team: { token, name, score, totalCorrectTime, currentAnswer, answeredAt, currentPoints, isBot, connected, socketId, previousRank }
    this.teams = new Map();
    this.botTimers = [];
  }

  reset(clearTeams = true) {
    this.stopTimer();
    this.clearBotTimers();
    if (this.introTimeout) clearTimeout(this.introTimeout);
    if (this.mapTimeout) clearTimeout(this.mapTimeout);
    this.state = 'LOBBY';
    this.currentQuestionIndex = 0;
    this.timer = QUESTION_TIME;
    this.isPaused = false;
    this.questionStartTime = null;
    this.pausedAt = null;
    if (clearTeams) {
      this.teams.clear();
    } else {
      for (const team of this.teams.values()) {
        team.score = 0;
        team.totalCorrectTime = 0;
        team.currentAnswer = null;
        team.answeredAt = null;
        team.currentPoints = 0;
        team.previousRank = null;
      }
    }
  }

  clearBotTimers() {
    for (const t of this.botTimers) {
      clearTimeout(t);
    }
    this.botTimers = [];
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  startQuestionTimer() {
    this.stopTimer();
    this.timer = QUESTION_TIME;
    this.isPaused = false;
    this.questionStartTime = Date.now();
    this.pausedAt = null;

    this.timerInterval = setInterval(() => {
      if (this.isPaused) return;

      const elapsed = (Date.now() - this.questionStartTime) / 1000;
      this.timer = Math.max(0, Math.ceil(QUESTION_TIME - elapsed));

      io.emit('timer:tick', {
        remaining: this.timer,
        total: QUESTION_TIME,
        isPaused: this.isPaused
      });

      if (this.timer <= 0) {
        this.stopTimer();
        this.revealAnswer('timer_expired');
      }
    }, 500);
  }

  pauseResume() {
    if (this.state !== 'QUESTION') return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.pausedAt = Date.now();
    } else {
      if (this.pausedAt) {
        const pauseDuration = Date.now() - this.pausedAt;
        this.questionStartTime += pauseDuration;
        this.pausedAt = null;
      }
    }
    io.emit('timer:status', {
      isPaused: this.isPaused,
      remaining: this.timer
    });
  }

  startQuiz() {
    if (this.state !== 'LOBBY') return { success: false, error: 'Quiz already started' };
    if (this.teams.size === 0) return { success: false, error: 'At least 1 team needed' };
    this.currentQuestionIndex = 0;
    for (const team of this.teams.values()) {
      team.score = 0;
      team.totalCorrectTime = 0;
      team.previousRank = 1;
    }
    this.startStoryIntro(0);
    return { success: true };
  }

  startStoryIntro(targetIndex = 0) {
    this.state = 'STORY_INTRO';
    this.stopTimer();
    this.clearBotTimers();
    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }
    this.nextTargetIndex = targetIndex;

    const questionNumber = targetIndex + 1;
    const totalQuestions = questions.length;

    const storyMessages = [
      'Answer questions correctly to get coins and save Princess Peach from Bowser!',
      'Question 2 incoming! Answer fast for maximum speed bonus coins!',
      'Question 3 ahead! Keep your streak alive to climb up the rankings!',
      'Question 4! Halfway to Bowser\'s castle, heroes! Rack up those points!',
      'Question 5! Watch out for tricky questions and lock in your answers!',
      'Question 6! The competition is heating up on the leaderboard!',
      'Question 7! Penultimate stage! Every coin counts for the top podium!',
      'FINAL QUESTION! Bowser Boss Stage! Give it everything you\'ve got!'
    ];

    const message = storyMessages[targetIndex] || `Get ready for Question ${questionNumber}!`;

    io.emit('quiz:story-intro', {
      questionIndex: targetIndex,
      questionNumber: questionNumber,
      totalQuestions: totalQuestions,
      message: message
    });
    // No automatic timer! Host clicks button to launch the question when ready.
  }

  skipIntro() {
    if (this.state === 'STORY_INTRO') {
      if (this.introTimeout) {
        clearTimeout(this.introTimeout);
        this.introTimeout = null;
      }
      const target = this.nextTargetIndex !== undefined ? this.nextTargetIndex : 0;
      this.goToQuestion(target);
    }
  }

  startMapTransition(nextIndex) {
    this.state = 'MAP_TRANSITION';
    this.stopTimer();
    this.clearBotTimers();
    this.nextTargetIndex = nextIndex;

    io.emit('quiz:map-transition', {
      nextIndex,
      totalQuestions: questions.length,
      duration: 3.5
    });

    this.mapTimeout = setTimeout(() => {
      if (this.state === 'MAP_TRANSITION') {
        this.goToQuestion(this.nextTargetIndex);
      }
    }, 3800);
  }

  skipMapTransition() {
    if (this.state === 'MAP_TRANSITION') {
      if (this.mapTimeout) clearTimeout(this.mapTimeout);
      this.goToQuestion(this.nextTargetIndex);
    }
  }

  advanceNext() {
    if (this.state === 'REVEAL') {
      this.showLeaderboard();
    } else if (this.state === 'LEADERBOARD') {
      if (this.currentQuestionIndex >= questions.length - 1) {
        this.finishQuiz();
      } else {
        // Play Yoshi's House animation on projector before each question!
        this.startStoryIntro(this.currentQuestionIndex + 1);
      }
    }
  }

  goToQuestion(index) {
    if (index >= questions.length) {
      this.finishQuiz();
      return;
    }

    this.state = 'QUESTION';
    this.currentQuestionIndex = index;
    this.clearBotTimers();

    // Reset team answer states for new question
    for (const team of this.teams.values()) {
      team.currentAnswer = null;
      team.answeredAt = null;
      team.currentPoints = 0;
    }

    const q = questions[this.currentQuestionIndex];

    // Broadcast question to host and players
    io.emit('question:start', {
      questionIndex: this.currentQuestionIndex,
      totalQuestions: questions.length,
      question: q.question,
      options: q.options,
      duration: QUESTION_TIME
    });

    this.startQuestionTimer();
    this.emitProgress();
    this.scheduleBotsForCurrentQuestion();
  }

  scheduleBotsForCurrentQuestion() {
    const q = questions[this.currentQuestionIndex];
    if (!q) return;

    for (const team of this.teams.values()) {
      if (!team.isBot) continue;

      // Realistic bot delay: between 2s and 35s
      const delayMs = Math.floor(Math.random() * 25000) + 2000;
      const botTimer = setTimeout(() => {
        if (this.state !== 'QUESTION' || this.isPaused) return;

        // 80% chance correct answer, 20% random wrong option
        let chosenIndex = q.correctIndex;
        if (Math.random() > 0.8) {
          const wrongIndices = [0, 1, 2, 3].filter((i) => i !== q.correctIndex);
          chosenIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
        }

        this.submitAnswer(team.token, chosenIndex);
      }, delayMs);

      this.botTimers.push(botTimer);
    }
  }

  submitAnswer(token, answerIndex) {
    if (this.state !== 'QUESTION') return { success: false, error: 'Not in question state' };
    if (this.isPaused) return { success: false, error: 'Timer paused' };

    const team = this.teams.get(token);
    if (!team) return { success: false, error: 'Team not found' };
    if (team.currentAnswer !== null) {
      return { success: false, error: 'Answer already submitted' };
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - this.questionStartTime) / 1000);
    const remainingSeconds = Math.max(0, QUESTION_TIME - elapsedSeconds);

    const q = questions[this.currentQuestionIndex];
    const isCorrect = answerIndex === q.correctIndex;

    let pointsEarned = 0;
    if (isCorrect) {
      // Formula: points = BASE + round(BONUS * remainingSeconds / QUESTION_TIME)
      pointsEarned = BASE_POINTS + Math.round(BONUS_POINTS * (remainingSeconds / QUESTION_TIME));
      team.score += pointsEarned;
      team.totalCorrectTime += elapsedSeconds;
    }

    team.currentAnswer = answerIndex;
    team.answeredAt = now;
    team.currentPoints = pointsEarned;

    // Confirm to player
    if (team.socketId) {
      io.to(team.socketId).emit('player:answer-confirmed', {
        answerIndex,
        isLocked: true
      });
    }

    this.emitProgress();

    // Check early completion
    if (this.settings.autoAdvanceAllAnswered) {
      const activeTeams = Array.from(this.teams.values()).filter((t) => t.connected || t.isBot);
      const allAnswered = activeTeams.length > 0 && activeTeams.every((t) => t.currentAnswer !== null);
      if (allAnswered) {
        this.stopTimer();
        // Short breather delay before reveal so players see lock
        setTimeout(() => {
          if (this.state === 'QUESTION') {
            this.revealAnswer('all_answered');
          }
        }, 800);
      }
    }

    return { success: true, pointsEarned };
  }

  emitProgress() {
    const activeTeams = Array.from(this.teams.values()).filter((t) => t.connected || t.isBot);
    const answeredCount = activeTeams.filter((t) => t.currentAnswer !== null).length;

    io.emit('question:progress', {
      answeredCount,
      totalTeams: activeTeams.length
    });
  }

  revealAnswer(reason = '') {
    this.stopTimer();
    this.clearBotTimers();
    this.state = 'REVEAL';

    const q = questions[this.currentQuestionIndex];

    // Calculate answer distribution (A, B, C, D)
    const distribution = [0, 0, 0, 0];
    for (const team of this.teams.values()) {
      if (team.currentAnswer !== null && team.currentAnswer >= 0 && team.currentAnswer < 4) {
        distribution[team.currentAnswer]++;
      }
    }

    // Sort teams to calculate current ranking
    const sorted = this.getSortedTeams();

    // Broadcast reveal to host
    io.emit('question:reveal', {
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      distribution,
      reason
    });

    // Send individual results to each player
    sorted.forEach((team, rankIndex) => {
      const rank = rankIndex + 1;
      const isCorrect = team.currentAnswer === q.correctIndex;
      if (team.socketId) {
        io.to(team.socketId).emit('player:reveal', {
          isCorrect,
          pointsEarned: team.currentPoints,
          totalScore: team.score,
          currentRank: rank,
          correctIndex: q.correctIndex
        });
      }
    });
  }

  showLeaderboard() {
    this.state = 'LEADERBOARD';

    const sorted = this.getSortedTeams();

    const leaderboardData = sorted.map((team, index) => {
      const currentRank = index + 1;
      const prevRank = team.previousRank || currentRank;
      const rankChange = prevRank - currentRank; // positive = went up, negative = fell down
      team.previousRank = currentRank;

      return {
        name: team.name,
        score: team.score,
        rank: currentRank,
        rankChange,
        currentPoints: team.currentPoints,
        isBot: team.isBot
      };
    });

    io.emit('leaderboard:update', {
      questionIndex: this.currentQuestionIndex,
      totalQuestions: questions.length,
      topTeams: leaderboardData.slice(0, 5),
      isLastQuestion: this.currentQuestionIndex >= questions.length - 1
    });

    // Notify all players of their updated rank
    leaderboardData.forEach((item, index) => {
      const team = sorted[index];
      if (team && team.socketId) {
        io.to(team.socketId).emit('player:leaderboard', {
          rank: item.rank,
          score: item.score,
          rankChange: item.rankChange,
          leaderScore: leaderboardData[0] ? leaderboardData[0].score : item.score
        });
      }
    });
  }

  skipQuestion() {
    if (this.state === 'QUESTION') {
      this.revealAnswer('skipped');
    }
  }

  finishQuiz() {
    this.stopTimer();
    this.clearBotTimers();
    this.state = 'FINAL';

    const sorted = this.getSortedTeams();

    const podium = sorted.slice(0, 3).map((team, idx) => ({
      rank: idx + 1,
      name: team.name,
      score: team.score
    }));

    const fullStandings = sorted.map((team, idx) => ({
      rank: idx + 1,
      name: team.name,
      score: team.score
    }));

    io.emit('quiz:final', {
      podium,
      fullStandings
    });

    // Send final result to each player
    sorted.forEach((team, idx) => {
      if (team.socketId) {
        io.to(team.socketId).emit('player:final', {
          rank: idx + 1,
          totalTeams: sorted.length,
          score: team.score,
          isPodium: idx < 3
        });
      }
    });
  }

  getSortedTeams() {
    return Array.from(this.teams.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.totalCorrectTime !== b.totalCorrectTime) return a.totalCorrectTime - b.totalCorrectTime;
      return a.name.localeCompare(b.name);
    });
  }

  addTeam(name, existingToken = null, isBot = false, socketId = null) {
    const cleanName = sanitizeText(name);
    if (!cleanName || cleanName.length < 2 || cleanName.length > 20) {
      return { success: false, error: 'Name must be between 2 and 20 characters.' };
    }

    // Check duplicate name
    for (const [tok, t] of this.teams.entries()) {
      if (existingToken && tok === existingToken) continue;
      if (t.name.toLowerCase() === cleanName.toLowerCase()) {
        return { success: false, error: 'A team with that name already exists!' };
      }
    }

    let token = existingToken || crypto.randomUUID();
    let team = this.teams.get(token);

    if (team) {
      // Re-attaching existing team
      team.connected = true;
      team.socketId = socketId;
      team.name = cleanName;
    } else {
      team = {
        token,
        name: cleanName,
        score: 0,
        totalCorrectTime: 0,
        currentAnswer: null,
        answeredAt: null,
        currentPoints: 0,
        isBot,
        connected: true,
        socketId,
        previousRank: this.teams.size + 1
      };
      this.teams.set(token, team);
    }

    this.broadcastLobby();
    return { success: true, token, team };
  }

  kickTeam(token) {
    const team = this.teams.get(token);
    if (!team) return false;

    if (team.socketId) {
      io.to(team.socketId).emit('team:kicked');
    }
    this.teams.delete(token);
    this.broadcastLobby();
    this.emitProgress();
    return true;
  }

  spawnBots(count = 5) {
    const botNames = ['Mario Bros', 'Yoshi Express', 'Toad Brigade', 'Koopa Troopers', 'Bowser Kings'];
    let spawned = 0;
    for (const name of botNames) {
      if (spawned >= count) break;
      const res = this.addTeam(name, null, true, null);
      if (res.success) spawned++;
    }
    this.broadcastLobby();
    return spawned;
  }

  broadcastLobby() {
    const teamList = Array.from(this.teams.values()).map((t) => ({
      token: t.token,
      name: t.name,
      connected: t.connected,
      isBot: t.isBot
    }));
    io.emit('lobby:update', {
      teams: teamList,
      teamCount: teamList.length
    });
  }

  getStatePayload(isHost = false, teamToken = null) {
    const team = teamToken ? this.teams.get(teamToken) : null;
    const activeTeams = Array.from(this.teams.values()).filter((t) => t.connected || t.isBot);
    const answeredCount = activeTeams.filter((t) => t.currentAnswer !== null).length;
    const q = questions[this.currentQuestionIndex];

    const base = {
      state: this.state,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: questions.length,
      timer: this.timer,
      isPaused: this.isPaused,
      teamCount: this.teams.size,
      settings: this.settings,
      questionTime: QUESTION_TIME
    };

    if (this.state === 'STORY_INTRO') {
      const qNum = (this.nextTargetIndex !== undefined ? this.nextTargetIndex : this.currentQuestionIndex) + 1;
      base.storyIntro = {
        questionIndex: this.nextTargetIndex !== undefined ? this.nextTargetIndex : this.currentQuestionIndex,
        questionNumber: qNum,
        totalQuestions: questions.length
      };
    }

    if (this.state === 'QUESTION' || this.state === 'REVEAL') {
      base.question = q ? q.question : '';
      base.options = q ? q.options : [];
      base.answeredCount = answeredCount;
      base.totalTeams = activeTeams.length;
    }

    if (this.state === 'REVEAL') {
      base.correctIndex = q ? q.correctIndex : null;
      base.explanation = q ? q.explanation : '';
      const distribution = [0, 0, 0, 0];
      for (const t of this.teams.values()) {
        if (t.currentAnswer !== null && t.currentAnswer >= 0 && t.currentAnswer < 4) {
          distribution[t.currentAnswer]++;
        }
      }
      base.distribution = distribution;
    }

    if (this.state === 'LEADERBOARD') {
      const sorted = this.getSortedTeams();
      base.topTeams = sorted.slice(0, 5).map((t, i) => ({
        rank: i + 1,
        name: t.name,
        score: t.score,
        currentPoints: t.currentPoints,
        rankChange: (t.previousRank || i + 1) - (i + 1)
      }));
      base.isLastQuestion = this.currentQuestionIndex >= questions.length - 1;
    }

    if (this.state === 'FINAL') {
      const sorted = this.getSortedTeams();
      base.podium = sorted.slice(0, 3).map((t, i) => ({
        rank: i + 1,
        name: t.name,
        score: t.score
      }));
      base.fullStandings = sorted.map((t, i) => ({
        rank: i + 1,
        name: t.name,
        score: t.score
      }));
    }

    if (!isHost && team) {
      base.player = {
        name: team.name,
        score: team.score,
        currentAnswer: team.currentAnswer,
        hasAnswered: team.currentAnswer !== null,
        currentPoints: team.currentPoints
      };
    }

    return base;
  }
}

const game = new GameEngine();

// --- Socket.IO Handlers ---
io.on('connection', (socket) => {
  let isHostSocket = false;
  let socketTeamToken = null;

  // Host Authentication
  socket.on('host:auth', ({ pin }, callback) => {
    if (pin === HOST_PIN) {
      isHostSocket = true;
      socket.join('host-room');
      if (typeof callback === 'function') {
        callback({ success: true });
      }
      socket.emit('state:sync', game.getStatePayload(true));
      game.broadcastLobby();
    } else {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Invalid Host PIN' });
      }
    }
  });

  // Host Controls
  socket.on('host:start-quiz', () => {
    if (!isHostSocket) return;
    const res = game.startQuiz();
    if (!res.success) {
      socket.emit('host:error', res.error);
    }
  });

  socket.on('host:skip-intro', () => {
    if (!isHostSocket) return;
    game.skipIntro();
  });

  socket.on('host:skip-map', () => {
    if (!isHostSocket) return;
    game.skipMapTransition();
  });

  socket.on('host:next', () => {
    if (!isHostSocket) return;
    game.advanceNext();
  });

  socket.on('host:pause-resume', () => {
    if (!isHostSocket) return;
    game.pauseResume();
  });

  socket.on('host:skip-question', () => {
    if (!isHostSocket) return;
    game.skipQuestion();
  });

  socket.on('host:end-quiz', () => {
    if (!isHostSocket) return;
    game.finishQuiz();
  });

  socket.on('host:reset-quiz', (opts = {}) => {
    if (!isHostSocket) return;
    const clearTeams = opts && opts.clearTeams !== undefined ? Boolean(opts.clearTeams) : true;
    game.reset(clearTeams);
    io.emit('state:sync', game.getStatePayload(false));
    socket.emit('state:sync', game.getStatePayload(true));
    game.broadcastLobby();
  });

  socket.on('host:kick-team', ({ token }) => {
    if (!isHostSocket) return;
    game.kickTeam(token);
  });

  socket.on('host:spawn-bots', ({ count }) => {
    if (!isHostSocket) return;
    game.spawnBots(count || 5);
  });

  socket.on('host:toggle-setting', ({ key, value }) => {
    if (!isHostSocket) return;
    if (key in game.settings) {
      game.settings[key] = Boolean(value);
      io.to('host-room').emit('settings:updated', game.settings);
    }
  });

  // Player Handlers
  socket.on('player:join', ({ name, token }, callback) => {
    const res = game.addTeam(name, token, false, socket.id);
    if (res.success) {
      socketTeamToken = res.token;
      socket.join('players-room');
      if (typeof callback === 'function') {
        callback({ success: true, token: res.token, team: res.team });
      }
      socket.emit('state:sync', game.getStatePayload(false, res.token));
    } else {
      if (typeof callback === 'function') {
        callback({ success: false, error: res.error });
      }
    }
  });

  socket.on('player:reconnect', ({ token }, callback) => {
    if (!token) return callback && callback({ success: false });
    const team = game.teams.get(token);
    if (team) {
      socketTeamToken = token;
      team.connected = true;
      team.socketId = socket.id;
      socket.join('players-room');
      if (typeof callback === 'function') {
        callback({ success: true, team });
      }
      socket.emit('state:sync', game.getStatePayload(false, token));
      game.broadcastLobby();
      game.emitProgress();
    } else {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Team session not found' });
      }
    }
  });

  socket.on('player:submit-answer', ({ answerIndex }, callback) => {
    if (!socketTeamToken) {
      return callback && callback({ success: false, error: 'Not authenticated as a team' });
    }
    const res = game.submitAnswer(socketTeamToken, answerIndex);
    if (typeof callback === 'function') {
      callback(res);
    }
  });

  socket.on('disconnect', () => {
    if (socketTeamToken) {
      const team = game.teams.get(socketTeamToken);
      if (team) {
        team.connected = false;
        game.broadcastLobby();
        game.emitProgress();
      }
    }
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`   🍄 SUPER MARIO QUIZ SERVER RUNNING 🍄`);
  console.log(`=======================================================`);
  console.log(` Local Projector / Host: http://localhost:${PORT}/host`);
  console.log(` Local Player URL:       http://localhost:${PORT}`);
  console.log(` Classroom LAN Host:     http://${lanIp}:${PORT}/host`);
  console.log(` Classroom LAN Players:  ${playerUrl}`);
  console.log(` Host PIN:               ${HOST_PIN}`);
  console.log(` Questions Loaded:       ${questions.length}`);
  console.log(` Question Duration:      ${QUESTION_TIME}s`);
  console.log(`=======================================================`);
});
