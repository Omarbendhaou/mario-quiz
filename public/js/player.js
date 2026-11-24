// Player Client Logic
(function() {
  const socket = io();
  let teamToken = localStorage.getItem('mario_quiz_token') || null;
  let teamName = localStorage.getItem('mario_quiz_team_name') || '';
  let currentScore = 0;
  let hasLockedAnswer = false;

  // DOM Elements
  const playerScoreHud = document.getElementById('player-score-hud');
  const playerNameHud = document.getElementById('player-name-hud');
  const btnPlayerMute = document.getElementById('btn-player-mute');
  const playerMuteIcon = document.getElementById('player-mute-icon');

  const screenJoin = document.getElementById('player-screen-join');
  const screenWaiting = document.getElementById('player-screen-waiting');
  const screenGetReady = document.getElementById('player-screen-get-ready');
  const playerReadyStage = document.getElementById('player-ready-stage');
  const screenQuestion = document.getElementById('player-screen-question');
  const screenReveal = document.getElementById('player-screen-reveal');
  const screenLeaderboard = document.getElementById('player-screen-leaderboard');
  const screenFinal = document.getElementById('player-screen-final');
  const screenKicked = document.getElementById('player-screen-kicked');

  const playerNameInput = document.getElementById('player-name-input');
  const playerJoinError = document.getElementById('player-join-error');
  const btnPlayerJoin = document.getElementById('btn-player-join');
  const playerWaitingTeamName = document.getElementById('player-waiting-team-name');

  const playerQNum = document.getElementById('player-q-num');
  const playerTimerDisplay = document.getElementById('player-timer-display');
  const playerTimerFill = document.getElementById('player-timer-fill');
  const playerQText = document.getElementById('player-q-text');
  const playerButtonsContainer = document.getElementById('player-buttons-container');
  const playerLockedBox = document.getElementById('player-locked-box');

  const revealIcon = document.getElementById('reveal-icon');
  const revealTitle = document.getElementById('reveal-title');
  const revealPoints = document.getElementById('reveal-points');
  const revealRank = document.getElementById('reveal-rank');

  const playerLbRank = document.getElementById('player-lb-rank');
  const playerLbScore = document.getElementById('player-lb-score');

  const playerFinalIcon = document.getElementById('player-final-icon');
  const playerFinalPlacement = document.getElementById('player-final-placement');
  const playerFinalScore = document.getElementById('player-final-score');
  const btnRejoinFresh = document.getElementById('btn-rejoin-fresh');

  // Mute toggle
  btnPlayerMute.addEventListener('click', () => {
    const isMuted = window.retroAudio.toggleMute();
    playerMuteIcon.textContent = isMuted ? '🔇' : '🔊';
  });

  function showScreen(screen) {
    screenJoin.style.display = screen === 'JOIN' ? 'block' : 'none';
    screenWaiting.style.display = screen === 'WAITING' ? 'block' : 'none';
    if (screenGetReady) screenGetReady.style.display = screen === 'GET_READY' ? 'block' : 'none';
    screenQuestion.style.display = screen === 'QUESTION' ? 'flex' : 'none';
    screenReveal.style.display = screen === 'REVEAL' ? 'block' : 'none';
    screenLeaderboard.style.display = screen === 'LEADERBOARD' ? 'block' : 'none';
    screenFinal.style.display = screen === 'FINAL' ? 'block' : 'none';
    screenKicked.style.display = screen === 'KICKED' ? 'block' : 'none';
  }

  function updateHud(name, score) {
    if (name) playerNameHud.textContent = name.toUpperCase();
    if (score !== undefined) {
      currentScore = score;
      playerScoreHud.textContent = score < 1000 ? (score < 100 ? (score < 10 ? '000' + score : '00' + score) : '0' + score) : score;
    }
  }

  // Join Action
  function attemptJoin() {
    const rawName = playerNameInput.value.trim();
    if (!rawName || rawName.length < 2 || rawName.length > 20) {
      playerJoinError.textContent = 'Team name must be 2 to 20 characters.';
      playerJoinError.style.display = 'block';
      return;
    }

    btnPlayerJoin.disabled = true;
    playerJoinError.style.display = 'none';

    socket.emit('player:join', { name: rawName, token: teamToken }, (res) => {
      btnPlayerJoin.disabled = false;
      if (res && res.success) {
        teamToken = res.token;
        teamName = res.team.name;
        localStorage.setItem('mario_quiz_token', teamToken);
        localStorage.setItem('mario_quiz_team_name', teamName);
        window.retroAudio.playCoin();
        playerWaitingTeamName.textContent = teamName;
        updateHud(teamName, res.team.score);
        showScreen('WAITING');
      } else {
        playerJoinError.textContent = res ? res.error : 'Failed to join game';
        playerJoinError.style.display = 'block';
      }
    });
  }

  btnPlayerJoin.addEventListener('click', attemptJoin);
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptJoin();
  });

  // Reconnection Attempt
  socket.on('connect', () => {
    if (teamToken) {
      socket.emit('player:reconnect', { token: teamToken }, (res) => {
        if (res && res.success) {
          teamName = res.team.name;
          updateHud(teamName, res.team.score);
          playerWaitingTeamName.textContent = teamName;
        } else {
          // Token invalid or reset
          localStorage.removeItem('mario_quiz_token');
          teamToken = null;
          showScreen('JOIN');
        }
      });
    } else {
      showScreen('JOIN');
    }
  });

  // State Sync
  socket.on('state:sync', (state) => {
    if (!teamToken) {
      showScreen('JOIN');
      return;
    }

    if (state.player) {
      updateHud(state.player.name, state.player.score);
      hasLockedAnswer = state.player.hasAnswered;
    }

    if (state.state === 'LOBBY') {
      showScreen('WAITING');
    } else if (state.state === 'STORY_INTRO') {
      const qNum = (state.storyIntro && state.storyIntro.questionNumber) || ((state.currentQuestionIndex || 0) + 1);
      const totalQ = (state.storyIntro && state.storyIntro.totalQuestions) || state.totalQuestions || 8;
      if (playerReadyStage) {
        playerReadyStage.textContent = `QUESTION ${qNum} / ${totalQ} COMING UP!`;
      }
      showScreen('GET_READY');
    } else if (state.state === 'QUESTION') {
      renderQuestion(state);
    } else if (state.state === 'REVEAL') {
      // Waiting on player:reveal event
    } else if (state.state === 'LEADERBOARD') {
      showScreen('LEADERBOARD');
    } else if (state.state === 'FINAL') {
      showScreen('FINAL');
    }
  });

  // Story Intro Event (Projector plays Yoshi's House video - Mobile/Laptop shows clean "Get Ready!" screen without video)
  socket.on('quiz:story-intro', (data) => {
    if (!teamToken) return;
    const qNum = data.questionNumber || ((data.questionIndex || 0) + 1);
    const totalQ = data.totalQuestions || 8;
    if (playerReadyStage) {
      playerReadyStage.textContent = `QUESTION ${qNum} / ${totalQ} COMING UP!`;
    }
    showScreen('GET_READY');
  });

  // Question Start Event
  socket.on('question:start', (data) => {
    if (!teamToken) return;
    renderQuestion(data);
  });

  function renderQuestion(data) {
    showScreen('QUESTION');
    hasLockedAnswer = false;
    window.retroAudio.playStageClear();

    playerQNum.textContent = `QUESTION ${(data.questionIndex || 0) + 1}/${data.totalQuestions || 8}`;
    playerQText.textContent = data.question || '';

    // Render 4 answer buttons
    const options = data.options || [];
    for (let i = 0; i < 4; i++) {
      const textSpan = document.getElementById(`ans-text-${i}`);
      const btn = document.getElementById(`btn-ans-${i}`);
      if (textSpan && options[i]) {
        textSpan.textContent = options[i];
      }
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }

    playerButtonsContainer.style.display = 'grid';
    playerLockedBox.style.display = 'none';
    updateTimer(data.duration || 60, data.duration || 60);
  }

  // Answer Submission
  document.querySelectorAll('.player-mario-btn, .player-answer-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (hasLockedAnswer) return;

      const answerIndex = parseInt(btn.getAttribute('data-index'), 10);
      hasLockedAnswer = true;
      window.retroAudio.playLock();

      // Lock buttons
      playerButtonsContainer.style.display = 'none';
      playerLockedBox.style.display = 'block';

      socket.emit('player:submit-answer', { answerIndex }, (res) => {
        if (!res || !res.success) {
          console.warn('Submission issue:', res);
        }
      });
    });
  });

  socket.on('player:answer-confirmed', () => {
    hasLockedAnswer = true;
    playerButtonsContainer.style.display = 'none';
    playerLockedBox.style.display = 'block';
  });

  // Timer Tick
  socket.on('timer:tick', (data) => {
    updateTimer(data.remaining, data.total);
  });

  function updateTimer(remaining, total) {
    playerTimerDisplay.textContent = `⏱ ${remaining}s`;
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    playerTimerFill.style.width = `${pct}%`;

    if (remaining <= 10 && remaining > 0) {
      window.retroAudio.playTick(true);
    }
  }

  // Reveal Event
  socket.on('player:reveal', (data) => {
    if (!teamToken) return;
    showScreen('REVEAL');
    updateHud(teamName, data.totalScore);

    if (data.isCorrect) {
      window.retroAudio.playCorrect();
      screenReveal.className = 'player-result-card correct';
      revealIcon.textContent = '🌟';
      revealTitle.textContent = 'CORRECT!';
      revealPoints.textContent = `+${data.pointsEarned.toLocaleString()} PTS`;
    } else {
      window.retroAudio.playWrong();
      screenReveal.className = 'player-result-card wrong';
      revealIcon.textContent = '💀';
      revealTitle.textContent = 'INCORRECT!';
      revealPoints.textContent = '+0 PTS';
    }

    revealRank.textContent = `You are currently in #${data.currentRank} place`;
  });

  // Leaderboard Event
  socket.on('player:leaderboard', (data) => {
    if (!teamToken) return;
    showScreen('LEADERBOARD');
    updateHud(teamName, data.score);

    playerLbRank.textContent = `#${data.rank}`;
    playerLbScore.textContent = `Score: ${data.score.toLocaleString()} pts`;
  });

  // Final Event
  socket.on('player:final', (data) => {
    if (!teamToken) return;
    showScreen('FINAL');
    updateHud(teamName, data.score);

    if (data.rank === 1) {
      playerFinalIcon.textContent = '👑';
      playerFinalPlacement.textContent = '1ST PLACE CHAMPION!';
      window.retroAudio.playFanfare();
    } else if (data.rank === 2) {
      playerFinalIcon.textContent = '🥈';
      playerFinalPlacement.textContent = '2ND PLACE RUNNER-UP!';
      window.retroAudio.playStageClear();
    } else if (data.rank === 3) {
      playerFinalIcon.textContent = '🥉';
      playerFinalPlacement.textContent = '3RD PLACE PODIUM!';
      window.retroAudio.playStageClear();
    } else {
      playerFinalIcon.textContent = '🍄';
      playerFinalPlacement.textContent = `FINISHED #${data.rank} of ${data.totalTeams}`;
    }

    playerFinalScore.textContent = `Final Score: ${data.score.toLocaleString()} pts`;
  });

  // Kicked by Host
  socket.on('team:kicked', () => {
    localStorage.removeItem('mario_quiz_token');
    localStorage.removeItem('mario_quiz_team_name');
    teamToken = null;
    showScreen('KICKED');
  });

  btnRejoinFresh.addEventListener('click', () => {
    showScreen('JOIN');
  });
})();
