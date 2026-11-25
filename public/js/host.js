// Super Mario Quiz - Projector Host Client
(function() {
  const socket = io();
  const urlParams = new URLSearchParams(window.location.search);
  let currentPin = urlParams.get('pin') || sessionStorage.getItem('host_pin') || '';
  let isAuthenticated = false;
  let totalQuizQuestions = 8;

  // DOM Elements
  const pinModal = document.getElementById('pin-modal');
  const inputPin = document.getElementById('input-pin');
  const pinError = document.getElementById('pin-error');
  const btnSubmitPin = document.getElementById('btn-submit-pin');

  const screenLobby = document.getElementById('screen-lobby');
  const screenStoryIntro = document.getElementById('screen-story-intro');
  const screenMapTransition = document.getElementById('screen-map-transition');
  const screenQuestion = document.getElementById('screen-question');
  const screenLeaderboard = document.getElementById('screen-leaderboard');
  const screenPodium = document.getElementById('screen-podium');

  const introVideo = document.getElementById('intro-video');
  const mapVideo = document.getElementById('map-video');
  const btnSkipIntro = document.getElementById('btn-skip-intro');
  const btnSkipMap = document.getElementById('btn-skip-map');
  const storyCountdownText = document.getElementById('story-countdown-text');
  const mapWorldTitle = document.getElementById('map-world-title');
  const mapStageName = document.getElementById('map-stage-name');

  const lobbyQrCode = document.getElementById('lobby-qr-code');
  const lobbyUrlDisplay = document.getElementById('lobby-url-display');
  const lobbyTeamCounter = document.getElementById('lobby-team-counter');
  const lobbyTeamsList = document.getElementById('lobby-teams-list');
  const checkAutoAdvance = document.getElementById('check-auto-advance');
  const btnStartQuiz = document.getElementById('btn-start-quiz');

  const hudMarioLives = document.getElementById('hud-mario-lives');
  const hudTimerNum = document.getElementById('hud-timer-num');
  const hudCoinsCount = document.getElementById('hud-coins-count');
  const hudQNumber = document.getElementById('hud-q-number');
  const btnMute = document.getElementById('btn-mute');
  const muteIcon = document.getElementById('mute-icon');

  const hostQHeaderTitle = document.getElementById('host-q-header-title');
  const hostQText = document.getElementById('host-q-text');
  const hostAnsweredCount = document.getElementById('host-answered-count');
  const hostTotalTeams = document.getElementById('host-total-teams');
  const hostExplanationCard = document.getElementById('host-explanation-card');
  const hostExplanationText = document.getElementById('host-explanation-text');
  const hostRevealControls = document.getElementById('host-reveal-controls');
  const btnRevealNext = document.getElementById('btn-reveal-next');
  const btnPauseResume = document.getElementById('btn-pause-resume');
  const btnSkip = document.getElementById('btn-skip');
  const btnEndQuiz = document.getElementById('btn-end-quiz');

  const hostLeaderboardList = document.getElementById('host-leaderboard-list');
  const btnLeaderboardNext = document.getElementById('btn-leaderboard-next');
  const btnResetQuiz = document.getElementById('btn-reset-quiz');
  const btnRevealPodium = document.getElementById('btn-reveal-podium');

  let podiumDataCache = null;
  let isPodiumRevealed = false;

  // Mute Button Toggle
  btnMute.addEventListener('click', () => {
    const isMuted = window.retroAudio.toggleMute();
    muteIcon.textContent = isMuted ? '🔇' : '🔊';
  });

  // Screen Switching Helper
  function showScreen(name) {
    screenLobby.style.display = name === 'LOBBY' ? 'flex' : 'none';
    screenStoryIntro.style.display = name === 'STORY_INTRO' ? 'flex' : 'none';
    screenMapTransition.style.display = name === 'MAP_TRANSITION' ? 'flex' : 'none';
    screenQuestion.style.display = (name === 'QUESTION' || name === 'REVEAL') ? 'flex' : 'none';
    screenLeaderboard.style.display = name === 'LEADERBOARD' ? 'flex' : 'none';
    screenPodium.style.display = name === 'FINAL' ? 'flex' : 'none';

    if (name !== 'STORY_INTRO' && introVideo) introVideo.pause();
    if (name !== 'MAP_TRANSITION' && mapVideo) mapVideo.pause();
  }

  // Skip / Launch buttons
  btnSkipIntro.addEventListener('click', () => {
    window.retroAudio.playCoin();
    socket.emit('host:skip-intro');
  });

  btnSkipMap.addEventListener('click', () => {
    socket.emit('host:skip-map');
  });

  // Load Host Info (QR code and URLs)
  async function loadHostInfo() {
    try {
      const clientOrigin = window.location.origin;
      const res = await fetch(`/api/info?clientOrigin=${encodeURIComponent(clientOrigin)}`);
      const data = await res.json();
      lobbyQrCode.src = data.qrDataUrl;
      lobbyUrlDisplay.textContent = data.playerUrl;
      totalQuizQuestions = data.questionCount;
    } catch (e) {
      console.error('Error fetching host info:', e);
    }
  }

  let cachedState = null;

  // Authentication Flow
  function authenticate(pin) {
    socket.emit('host:auth', { pin }, (res) => {
      if (res && res.success) {
        isAuthenticated = true;
        sessionStorage.setItem('host_pin', pin);
        pinModal.style.display = 'none';
        pinError.style.display = 'none';
        loadHostInfo();
        if (cachedState) renderState(cachedState);
      } else {
        pinModal.style.display = 'block';
        pinError.textContent = res ? res.error : 'Incorrect PIN';
        pinError.style.display = 'block';
      }
    });
  }

  btnSubmitPin.addEventListener('click', () => {
    const pin = inputPin.value.trim();
    if (pin) authenticate(pin);
  });

  inputPin.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const pin = inputPin.value.trim();
      if (pin) authenticate(pin);
    }
  });

  socket.on('connect', () => {
    if (currentPin) {
      authenticate(currentPin);
    } else {
      pinModal.style.display = 'block';
    }
  });

  // State Sync
  socket.on('state:sync', (state) => {
    cachedState = state;
    if (!isAuthenticated) return;
    renderState(state);
  });

  function renderState(state) {
    if (state.settings && state.settings.autoAdvanceAllAnswered !== undefined) {
      checkAutoAdvance.checked = state.settings.autoAdvanceAllAnswered;
    }

    if (state.totalQuestions) totalQuizQuestions = state.totalQuestions;
    const qNum = (state.currentQuestionIndex || 0) + 1;
    hudQNumber.textContent = qNum;
    hudCoinsCount.textContent = qNum < 10 ? '0' + qNum : qNum;

    // Apply castle theme for question 8 (final boss question) or podium
    if (state.currentQuestionIndex === totalQuizQuestions - 1 || state.state === 'FINAL') {
      document.body.classList.add('castle-theme');
    } else {
      document.body.classList.remove('castle-theme');
    }

    showScreen(state.state);

    if (state.state === 'QUESTION') {
      renderQuestionView(state, false);
    } else if (state.state === 'REVEAL') {
      renderQuestionView(state, true);
    } else if (state.state === 'LEADERBOARD') {
      renderLeaderboardView(state);
    } else if (state.state === 'FINAL') {
      renderPodiumView(state);
    }
  }

  // Lobby Updates
  socket.on('lobby:update', ({ teams, teamCount }) => {
    if (!isAuthenticated) return;
    lobbyTeamCounter.textContent = teamCount;
    hudMarioLives.textContent = teamCount;
    btnStartQuiz.disabled = teamCount === 0;

    lobbyTeamsList.innerHTML = '';
    teams.forEach((t) => {
      const chip = document.createElement('div');
      chip.className = 'team-chip';
      chip.innerHTML = `
        <span>🍄</span>
        <span>${t.name}</span>
        <span class="chip-kick" title="Kick Team" data-token="${t.token}">✕</span>
      `;
      chip.querySelector('.chip-kick').addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('host:kick-team', { token: t.token });
      });
      lobbyTeamsList.appendChild(chip);
    });
  });

  // Host Controls Events
  btnStartQuiz.addEventListener('click', () => {
    window.retroAudio.playCoin();
    socket.emit('host:start-quiz');
  });

  checkAutoAdvance.addEventListener('change', () => {
    socket.emit('host:toggle-setting', {
      key: 'autoAdvanceAllAnswered',
      value: checkAutoAdvance.checked
    });
  });

  btnPauseResume.addEventListener('click', () => {
    socket.emit('host:pause-resume');
  });

  btnSkip.addEventListener('click', () => {
    socket.emit('host:skip-question');
  });

  btnEndQuiz.addEventListener('click', () => {
    if (confirm('End quiz now and reveal final podium?')) {
      socket.emit('host:end-quiz');
    }
  });

  btnRevealNext.addEventListener('click', () => {
    window.retroAudio.playCoin();
    socket.emit('host:next');
  });

  btnLeaderboardNext.addEventListener('click', () => {
    window.retroAudio.playCoin();
    socket.emit('host:next');
  });

  btnResetQuiz.addEventListener('click', () => {
    window.retroAudio.playCoin();
    isPodiumRevealed = false;
    socket.emit('host:reset-quiz');
  });

  if (btnRevealPodium) {
    btnRevealPodium.addEventListener('click', () => {
      triggerPodiumReveal();
    });
  }

  function triggerPodiumReveal() {
    if (isPodiumRevealed) return;
    isPodiumRevealed = true;
    if (btnRevealPodium) btnRevealPodium.style.display = 'none';

    const p1 = document.getElementById('pillar-1');
    const p2 = document.getElementById('pillar-2');
    const p3 = document.getElementById('pillar-3');

    // Dramatic Staggered Reveal: 3rd -> 2nd -> 1st
    setTimeout(() => {
      p3.classList.add('revealed');
      window.retroAudio.playCoin();
    }, 600);

    setTimeout(() => {
      p2.classList.add('revealed');
      window.retroAudio.playCoin();
    }, 2000);

    setTimeout(() => {
      p1.classList.add('revealed');
      window.retroAudio.playFanfare();
      window.pixelConfetti.start(8000);
    }, 3500);

    // Show replay / return to lobby button after all are revealed
    setTimeout(() => {
      if (btnResetQuiz) btnResetQuiz.style.display = 'inline-block';
    }, 4800);
  }

  // Story Intro Event (Yoshi's House before each question)
  socket.on('quiz:story-intro', (data) => {
    if (!isAuthenticated) return;
    showScreen('STORY_INTRO');
    window.retroAudio.playStageClear();
    if (introVideo) {
      introVideo.currentTime = 0;
      introVideo.play().catch(() => {});
    }

    const qNum = data.questionNumber || ((data.questionIndex || 0) + 1);
    const totalQ = data.totalQuestions || 8;

    const storyHeader = document.getElementById('story-header-title');
    if (storyHeader) {
      storyHeader.textContent = `STAGE ${qNum} / ${totalQ} • YOSHI'S HOUSE`;
    }

    const storyMsg = document.getElementById('story-message-text');
    if (storyMsg && data.message) {
      storyMsg.textContent = data.message;
    }

    if (btnSkipIntro) {
      btnSkipIntro.textContent = `START QUESTION ${qNum} ⏩`;
    }
  });

  // Map Transition Event (Overworld Island)
  socket.on('quiz:map-transition', (data) => {
    if (!isAuthenticated) return;
    showScreen('MAP_TRANSITION');
    window.retroAudio.playCoin();

    const stageNum = (data.nextIndex || 0) + 1;
    mapWorldTitle.textContent = `WORLD 8-${stageNum}`;
    mapStageName.textContent = `YOSHI'S ISLAND ${stageNum}`;

    if (mapVideo) {
      mapVideo.currentTime = 0;
      mapVideo.play().catch(() => {});
    }
  });

  // Question Start Event
  socket.on('question:start', (data) => {
    if (!isAuthenticated) return;
    showScreen('QUESTION');
    window.retroAudio.playStageClear();

    const qNum = data.questionIndex + 1;
    hudQNumber.textContent = qNum;
    hudCoinsCount.textContent = qNum < 10 ? '0' + qNum : qNum;

    // Apply castle theme for final question
    if (data.questionIndex >= data.totalQuestions - 1) {
      document.body.classList.add('castle-theme');
    } else {
      document.body.classList.remove('castle-theme');
    }

    hostQHeaderTitle.textContent = `Question ${qNum}:`;
    hostQText.textContent = data.question;

    // Reset option cards
    data.options.forEach((optText, i) => {
      const card = document.getElementById(`host-opt-${i}`);
      const textElem = document.getElementById(`host-opt-text-${i}`);
      const statVotes = document.getElementById(`host-stat-votes-${i}`);

      if (card && textElem) {
        card.classList.remove('dimmed', 'correct-answer');
        textElem.textContent = optText;
        if (statVotes) statVotes.style.display = 'none';
      }
    });

    hostExplanationCard.style.display = 'none';
    hostRevealControls.style.display = 'none';
    btnPauseResume.textContent = 'PAUSE ⏸';

    updateTimer(data.duration, false);
  });

  function updateTimer(remaining, isPaused) {
    hudTimerNum.textContent = remaining;

    if (remaining <= 10 && remaining > 0) {
      hudTimerNum.classList.add('urgent');
      window.retroAudio.playTick(true);
    } else {
      hudTimerNum.classList.remove('urgent');
    }

    btnPauseResume.textContent = isPaused ? 'RESUME ▶' : 'PAUSE ⏸';
  }

  socket.on('timer:tick', (data) => {
    if (!isAuthenticated) return;
    updateTimer(data.remaining, data.isPaused);
  });

  socket.on('timer:status', (data) => {
    if (!isAuthenticated) return;
    btnPauseResume.textContent = data.isPaused ? 'RESUME ▶' : 'PAUSE ⏸';
  });

  socket.on('question:progress', ({ answeredCount, totalTeams }) => {
    if (!isAuthenticated) return;
    hostAnsweredCount.textContent = answeredCount;
    hostTotalTeams.textContent = totalTeams;
  });

  // Reveal Event
  socket.on('question:reveal', (data) => {
    if (!isAuthenticated) return;
    showScreen('QUESTION');
    window.retroAudio.playCorrect();

    const { correctIndex, explanation, distribution } = data;
    const totalVotes = distribution.reduce((a, b) => a + b, 0);

    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`host-opt-${i}`);
      const statVotes = document.getElementById(`host-stat-votes-${i}`);

      if (i === correctIndex) {
        card.classList.add('correct-answer');
        card.classList.remove('dimmed');
      } else {
        card.classList.add('dimmed');
        card.classList.remove('correct-answer');
      }

      if (statVotes) {
        const votes = distribution[i] || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        statVotes.style.display = 'block';
        statVotes.textContent = `${votes} vote${votes === 1 ? '' : 's'} (${pct}%)`;
      }
    }

    if (explanation) {
      hostExplanationCard.style.display = 'block';
      hostExplanationText.textContent = explanation;
    }

    hostRevealControls.style.display = 'block';
  });

  function renderQuestionView(state, isReveal) {
    const qNum = (state.currentQuestionIndex || 0) + 1;
    hostQHeaderTitle.textContent = `Question ${qNum}:`;
    hostQText.textContent = state.question || '';

    if (state.options) {
      state.options.forEach((optText, i) => {
        const textElem = document.getElementById(`host-opt-text-${i}`);
        if (textElem) textElem.textContent = optText;
      });
    }

    if (isReveal && state.correctIndex !== undefined) {
      for (let i = 0; i < 4; i++) {
        const card = document.getElementById(`host-opt-${i}`);
        if (i === state.correctIndex) {
          card.classList.add('correct-answer');
        } else {
          card.classList.add('dimmed');
        }
      }
      if (state.explanation) {
        hostExplanationCard.style.display = 'block';
        hostExplanationText.textContent = state.explanation;
      }
      hostRevealControls.style.display = 'block';
    }
  }

  // Leaderboard Event
  socket.on('leaderboard:update', (data) => {
    if (!isAuthenticated) return;
    showScreen('LEADERBOARD');
    window.retroAudio.playCoin();

    btnLeaderboardNext.textContent = data.isLastQuestion ? 'VIEW FINAL PODIUM 👑' : 'NEXT QUESTION ⏩';

    hostLeaderboardList.innerHTML = '';
    data.topTeams.forEach((t) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${t.rank === 1 ? 'rank-1' : ''}`;
      row.innerHTML = `
        <span class="leaderboard-rank">#${t.rank}</span>
        <span class="leaderboard-name">${t.name}</span>
        <span class="leaderboard-score">${t.score.toLocaleString()} pts</span>
      `;
      hostLeaderboardList.appendChild(row);
    });
  });

  function renderLeaderboardView(state) {
    if (!state.topTeams) return;
    btnLeaderboardNext.textContent = state.isLastQuestion ? 'VIEW FINAL PODIUM 👑' : 'NEXT QUESTION ⏩';
    hostLeaderboardList.innerHTML = '';
    state.topTeams.forEach((t) => {
      const row = document.createElement('div');
      row.className = `leaderboard-row ${t.rank === 1 ? 'rank-1' : ''}`;
      row.innerHTML = `
        <span class="leaderboard-rank">#${t.rank}</span>
        <span class="leaderboard-name">${t.name}</span>
        <span class="leaderboard-score">${t.score.toLocaleString()} pts</span>
      `;
      hostLeaderboardList.appendChild(row);
    });
  }

  // Final Podium Event
  socket.on('quiz:final', (data) => {
    if (!isAuthenticated) return;
    document.body.classList.add('castle-theme');
    showScreen('FINAL');
    preparePodium(data.podium);
  });

  function preparePodium(podium) {
    podiumDataCache = podium || [];
    isPodiumRevealed = false;

    const p1 = document.getElementById('pillar-1');
    const p2 = document.getElementById('pillar-2');
    const p3 = document.getElementById('pillar-3');

    const team1 = podiumDataCache[0] || { name: '---', score: 0 };
    const team2 = podiumDataCache[1] || { name: '---', score: 0 };
    const team3 = podiumDataCache[2] || { name: '---', score: 0 };

    document.getElementById('podium-name-1').textContent = team1.name;
    document.getElementById('podium-score-1').textContent = `${team1.score.toLocaleString()} pts`;
    document.getElementById('podium-name-2').textContent = team2.name;
    document.getElementById('podium-score-2').textContent = `${team2.score.toLocaleString()} pts`;
    document.getElementById('podium-name-3').textContent = team3.name;
    document.getElementById('podium-score-3').textContent = `${team3.score.toLocaleString()} pts`;

    // Keep pillars hidden until host clicks Reveal
    [p1, p2, p3].forEach((p) => p.classList.remove('revealed'));

    // Show Reveal button, hide Play Again button
    if (btnRevealPodium) btnRevealPodium.style.display = 'inline-block';
    if (btnResetQuiz) btnResetQuiz.style.display = 'none';
  }

  function renderPodiumView(state) {
    if (state.podium) {
      if (isPodiumRevealed) {
        const p1 = document.getElementById('pillar-1');
        const p2 = document.getElementById('pillar-2');
        const p3 = document.getElementById('pillar-3');
        [p1, p2, p3].forEach((p) => p.classList.add('revealed'));
        if (btnRevealPodium) btnRevealPodium.style.display = 'none';
        if (btnResetQuiz) btnResetQuiz.style.display = 'inline-block';
      } else {
        preparePodium(state.podium);
      }
    }
  }
})();
