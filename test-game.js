// Automated Multiplayer Test Script for Super Mario Quiz
// Simulates 1 Host and 3 Player Teams
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectSocket() {
  const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    forceNew: true
  });
  if (socket.connected) return socket;
  await new Promise((resolve) => socket.once('connect', resolve));
  return socket;
}

async function runTests() {
  console.log('🎮 STARTING MULTIPLAYER QUIZ SIMULATION TEST...\n');

  let passed = 0;
  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Connect Host
  console.log('--- TEST 1: Host Connection & Authentication ---');
  const hostSocket = await connectSocket();
  assert(hostSocket.connected, 'Host socket connected to server');

  const authRes = await new Promise((resolve) => {
    hostSocket.emit('host:auth', { pin: '1234' }, resolve);
  });
  assert(authRes && authRes.success === true, 'Host successfully authenticated with PIN 1234');

  // Reset any previous game state
  hostSocket.emit('host:reset-quiz');
  await sleep(300);

  const wrongAuthSocket = await connectSocket();
  const wrongAuthRes = await new Promise((resolve) => {
    wrongAuthSocket.emit('host:auth', { pin: '9999' }, resolve);
  });
  assert(wrongAuthRes && wrongAuthRes.success === false, 'Invalid PIN correctly rejected');
  wrongAuthSocket.disconnect();

  // 2. Connect 3 Simulated Teams
  console.log('\n--- TEST 2: Team Registration & Unique Name Check ---');
  let lobbyCount = 0;
  hostSocket.on('lobby:update', ({ teamCount }) => {
    lobbyCount = teamCount;
  });

  const teamNames = ['Mario Strikers', 'Luigi Racers', 'Yoshi Champions'];
  const teams = [];

  for (const name of teamNames) {
    const s = await connectSocket();
    const joinRes = await new Promise((resolve) => {
      s.emit('player:join', { name }, resolve);
    });
    assert(joinRes && joinRes.success, `Team "${name}" registered successfully`);
    assert(typeof joinRes.token === 'string' && joinRes.token.length > 10, `Received valid token for ${name}`);
    teams.push({ name, socket: s, token: joinRes.token, score: 0 });
  }

  // Test duplicate name rejection
  const dupSocket = await connectSocket();
  const dupRes = await new Promise((resolve) => {
    dupSocket.emit('player:join', { name: 'mario strikers' }, resolve);
  });
  assert(dupRes && dupRes.success === false, 'Duplicate team name correctly rejected (case-insensitive)');
  dupSocket.disconnect();

  // 3. Lobby Verification
  console.log('\n--- TEST 3: Lobby State Verification ---');
  await sleep(200);
  assert(lobbyCount === 3, `Host received lobby update with 3 connected teams (got ${lobbyCount})`);

  // 4. Start Quiz
  console.log('\n--- TEST 4: Quiz Start & Question 1 Delivery ---');
  const qStartPromise = new Promise((resolve) => {
    teams[0].socket.once('question:start', resolve);
  });

  hostSocket.emit('host:start-quiz');
  hostSocket.emit('host:skip-intro'); // Fast-forward intro for automated tests
  const q1Data = await qStartPromise;

  assert(q1Data.questionIndex === 0, 'Question 1 index is 0');
  assert(q1Data.options.length === 4, 'Question 1 has 4 options');
  assert(q1Data.duration === 60, 'Question duration is configured to 60 seconds');

  // 5. Test Timer Tick
  console.log('\n--- TEST 5: Server-side Countdown Timer ---');
  const timerTick = await new Promise((resolve) => {
    teams[0].socket.once('timer:tick', resolve);
  });
  assert(typeof timerTick.remaining === 'number' && timerTick.total === 60, `Server timer tick: ${timerTick.remaining}s / ${timerTick.total}s`);

  // 6. Test Speed-based Scoring & Answers
  console.log('\n--- TEST 6: Speed-Based Scoring & Answer Submission ---');
  // Question 1 correct answer is index 2 ("What will we do differently next time?")
  // Team 0 answers immediately (remaining ~59s) -> high points (~990)
  // Team 1 answers after delay -> lower points (~950)
  // Team 2 answers wrong option (index 0) -> 0 points
  const p0Ans = await new Promise((resolve) => {
    teams[0].socket.emit('player:submit-answer', { answerIndex: 2 }, resolve);
  });
  assert(p0Ans.success && p0Ans.pointsEarned > 900, `Team 1 answered fast: earned ${p0Ans.pointsEarned} pts (>900)`);

  await sleep(1500);

  const p1Ans = await new Promise((resolve) => {
    teams[1].socket.emit('player:submit-answer', { answerIndex: 2 }, resolve);
  });
  assert(p1Ans.success && p1Ans.pointsEarned > 500, `Team 2 answered after 1.5s delay: earned ${p1Ans.pointsEarned} pts`);
  assert(p0Ans.pointsEarned > p1Ans.pointsEarned, `Fast answer (${p0Ans.pointsEarned} pts) > Slower answer (${p1Ans.pointsEarned} pts)`);

  // Team 0 duplicate answer lockout test
  const dupAns = await new Promise((resolve) => {
    teams[0].socket.emit('player:submit-answer', { answerIndex: 2 }, resolve);
  });
  assert(dupAns.success === false, 'Duplicate answer rejected (one answer per question)');

  // Team 2 wrong answer
  const p2Ans = await new Promise((resolve) => {
    teams[2].socket.emit('player:submit-answer', { answerIndex: 0 }, resolve);
  });
  assert(p2Ans.success && p2Ans.pointsEarned === 0, 'Team 3 wrong answer earned 0 points');

  // 7. Test Early End on All Answered
  console.log('\n--- TEST 7: Early-End Transition & Reveal ---');
  const revealData = await new Promise((resolve) => {
    hostSocket.once('question:reveal', resolve);
  });
  assert(revealData.reason === 'all_answered', 'Question ended early because all 3 teams answered');
  assert(revealData.correctIndex === 2, 'Correct answer index is 2 (C)');
  assert(revealData.distribution[2] === 2 && revealData.distribution[0] === 1, 'Distribution correct: 2 votes for C, 1 vote for A');
  assert(typeof revealData.explanation === 'string' && revealData.explanation.length > 10, 'Explanation text delivered');

  // 8. Test Leaderboard
  console.log('\n--- TEST 8: Leaderboard Rankings ---');
  const lbPromise = new Promise((resolve) => {
    hostSocket.once('leaderboard:update', resolve);
  });
  hostSocket.emit('host:next');
  const lbData = await lbPromise;

  assert(lbData.topTeams.length === 3, 'Leaderboard contains all 3 teams');
  assert(lbData.topTeams[0].name === 'Mario Strikers', `Rank #1: Mario Strikers (${lbData.topTeams[0].score} pts)`);
  assert(lbData.topTeams[1].name === 'Luigi Racers', `Rank #2: Luigi Racers (${lbData.topTeams[1].score} pts)`);
  assert(lbData.topTeams[2].name === 'Yoshi Champions', `Rank #3: Yoshi Champions (${lbData.topTeams[2].score} pts)`);

  // 8.5. Test Yoshi's House Animation Transition Before Question 2
  console.log('\n--- TEST 8.5: Yoshi\'s House Intro Animation Before Question 2 ---');
  const introPromise = new Promise((resolve) => {
    hostSocket.once('quiz:story-intro', resolve);
  });
  const playerIntroPromise = new Promise((resolve) => {
    teams[0].socket.once('quiz:story-intro', resolve);
  });
  hostSocket.emit('host:next'); // Advance from Leaderboard
  const introData = await introPromise;
  const pIntroData = await playerIntroPromise;

  assert(introData.questionNumber === 2, 'Yoshi\'s House intro triggered for Question 2');
  assert(introData.questionIndex === 1, 'Target index is 1 (Question 2)');
  assert(typeof introData.message === 'string' && introData.message.length > 5, 'Intro message delivered for Question 2');
  assert(pIntroData.questionNumber === 2, 'Player received question number 2 notification for mobile "Get Ready!" without video');

  // Fast forward into Question 2
  const q2StartPromise = new Promise((resolve) => {
    hostSocket.once('question:start', resolve);
  });
  hostSocket.emit('host:skip-intro');
  const q2Data = await q2StartPromise;
  assert(q2Data.questionIndex === 1, 'Question 2 started after Yoshi\'s House intro');

  // 9. Test Reconnection via Token
  console.log('\n--- TEST 9: Player Reconnection after Refresh / Drop ---');
  const oldTeam1Token = teams[1].token;
  teams[1].socket.disconnect(); // Disconnect Luigi Racers
  await sleep(300);

  // Reconnecting socket with the same token
  const refreshedSocket = await connectSocket();
  const reconnectRes = await new Promise((resolve) => {
    refreshedSocket.emit('player:reconnect', { token: oldTeam1Token }, resolve);
  });
  assert(reconnectRes.success === true, 'Player successfully reconnected using stored token');
  assert(reconnectRes.team.name === 'Luigi Racers', 'Player restored correct team name');
  assert(reconnectRes.team.score === p1Ans.pointsEarned, `Player score persisted across reconnect (${reconnectRes.team.score} pts)`);
  teams[1].socket = refreshedSocket;

  // 10. Advance to Final Podium
  console.log('\n--- TEST 10: Advancing to Final Podium ---');
  const finalPromise = new Promise((resolve) => {
    hostSocket.once('quiz:final', resolve);
  });
  hostSocket.emit('host:end-quiz');
  const finalData = await finalPromise;

  assert(finalData.podium.length === 3, 'Final podium has top 3 teams');
  assert(finalData.podium[0].name === 'Mario Strikers' && finalData.podium[0].rank === 1, 'Podium 1st Place: Mario Strikers');
  assert(finalData.podium[1].name === 'Luigi Racers' && finalData.podium[1].rank === 2, 'Podium 2nd Place: Luigi Racers');
  assert(finalData.podium[2].name === 'Yoshi Champions' && finalData.podium[2].rank === 3, 'Podium 3rd Place: Yoshi Champions');

  // Clean up
  hostSocket.disconnect();
  teams.forEach((t) => t.socket.disconnect());

  console.log('\n=======================================================');
  console.log(`🎉 ALL MULTIPLAYER SIMULATION TESTS PASSED! (${passed} checks passed)`);
  console.log('=======================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUNNER ERROR:', err);
  process.exit(1);
});
