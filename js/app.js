(function () {
  const storageKey = "hpbb-state-v1";
  const config = {
    timerSeconds: 24,
    ai: {
      successByLevel: { 1: 0.78, 2: 0.6, 3: 0.45 },
      thinkMs: [900, 1600]
    },
    tileValues: [200, 400, 600],
    audioFiles: {
      select: "assets/audio/select.mp3",
      correct: "assets/audio/correct.mp3",
      incorrect: "assets/audio/incorrect.mp3",
      end: "assets/audio/end.mp3",
      ui: "assets/audio/ui.mp3"
    },
    version: "1.0.0"
  };

  // Hoisted + safe everywhere: always call this instead of referencing a const template.
  function getCityStatsTemplate() {
    return { correct: 0, incorrect: 0, money: 0 };
  }

  let questionData = null;
  let state = loadState();
  let activeQuestion = null;
  let timerInterval = null;
  let practicePool = [];
  let aiRng = seededRandom(state.aiSeed || Date.now());
  let audioBank = {};
  let audioPrimed = false;
  const onboardingKey = "hpbb-onboarding-v1";

  const ui = {
    screens: {
      start: document.getElementById("start-screen"),
      intro: document.getElementById("intro-screen"),
      map: document.getElementById("map-screen"),
      board: document.getElementById("board-screen"),
      end: document.getElementById("end-screen")
    },
    hud: {
      player: document.getElementById("hud-player"),
      playerMoney: document.getElementById("hud-player-money"),
      aiMoney: document.getElementById("hud-ai-money"),
      level: document.getElementById("hud-level"),
      back: document.getElementById("back-to-map"),
      aiConfidence: document.getElementById("ai-confidence")
    },
    startForm: document.getElementById("start-form"),
    nickname: document.getElementById("nickname"),
    toggles: {
      sfx: document.getElementById("sfx-toggle"),
      music: document.getElementById("music-toggle"),
      theme: document.getElementById("theme-toggle"),
      contrast: document.getElementById("contrast-toggle"),
      motion: document.getElementById("motion-toggle")
    },
    playBtn: document.getElementById("play-btn"),
    clearBtn: document.getElementById("clear-progress"),
    showTour: document.getElementById("show-tour"),
    intro: {
      cards: Array.from(document.querySelectorAll(".intro-card")),
      progress: document.getElementById("intro-progress"),
      next: document.getElementById("next-intro"),
      practiceQuestion: document.getElementById("practice-question"),
      practiceButtons: Array.from(document.querySelectorAll("[data-practice]")),
      practiceFeedback: document.getElementById("practice-feedback")
    },
    map: {
      nodes: {
        1: document.getElementById("city-1"),
        2: document.getElementById("city-2"),
        3: document.getElementById("city-3")
      },
      lines: {
        "1-2": document.getElementById("line-1-2"),
        "2-3": document.getElementById("line-2-3")
      }
    },
    board: {
      grid: document.getElementById("board-grid"),
      title: document.getElementById("board-title"),
      timer: document.getElementById("timer-value"),
      note: document.getElementById("mode-note")
    },
    modal: {
      wrapper: document.getElementById("question-modal"),
      close: document.getElementById("close-question"),
      title: document.getElementById("question-title"),
      text: document.getElementById("question-text"),
      feedback: document.getElementById("question-feedback"),
      modes: Array.from(document.querySelectorAll(".answer-modes .chip")),
      textField: document.getElementById("text-answer"),
      choiceContainer: document.getElementById("choice-container"),
      submit: document.getElementById("submit-answer"),
      giveUp: document.getElementById("give-up")
    },
    feedbackBar: document.getElementById("feedback-bar"),
    toast: document.getElementById("toast"),
    end: {
      player: document.getElementById("final-player"),
      ai: document.getElementById("final-ai"),
      correct: document.getElementById("final-correct"),
      wrong: document.getElementById("final-wrong"),
      best: document.getElementById("final-best"),
      fastest: document.getElementById("final-fastest"),
      time: document.getElementById("final-time"),
      accuracy: document.getElementById("final-accuracy"),
      streak: document.getElementById("final-streak"),
      replay: document.getElementById("replay"),
      replayEasy: document.getElementById("replay-easy"),
      replayHard: document.getElementById("replay-hard"),
      restartMap: document.getElementById("restart-map"),
      share: document.getElementById("share"),
      download: document.getElementById("download-json")
    }
  };

  init();

  async function init() {
    applySettingsToUI();
    wireEvents();
    updateHud();
    setScreen("start");
    if (localStorage.getItem(storageKey)) {
      showToast("Progress restored");
    }
    if (!localStorage.getItem(onboardingKey)) {
      document.getElementById("onboarding").classList.add("show");
    }
    try {
      questionData = await fetchQuestions();
      practicePool = questionData.questions.filter(q => q.level === 1 && q.value === 400);
      buildPractice();
      renderMap();
    } catch (err) {
      ui.board.grid.innerHTML = "<p>Question data missing or invalid. Please refresh.</p>";
      showToast("Could not load the question bank. Check data/questions.json");
      console.error(err);
    }
  }

  function fetchQuestions() {
    return fetch("data/questions.json")
      .then(r => {
        if (!r.ok) throw new Error("Error loading questions");
        return r.json();
      })
      .catch(err => {
        console.warn("Question data failed to load", err);
        ui.board.grid.innerHTML = "<p>Question data missing or invalid. Please refresh.</p>";
        showToast("Question data missing or invalid");
        return { categories: [], questions: [], levels: [] };
      });
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return normalizeState(parsed);
      }
    } catch (err) {
      console.warn("State load failed, resetting to defaults", err);
      localStorage.removeItem(storageKey);
    }
    return createDefaultState();
  }

  function createDefaultState() {
    return {
      nickname: "",
      settings: {
        sfx: true,
        music: true,
        theme: "dark",
        contrast: false,
        reduceMotion: false
      },
      scores: { player: 0, ai: 0 },
      unlocked: { 1: true, 2: false, 3: false },
      completed: { 1: false, 2: false, 3: false },
      currentLevel: 1,
      tiles: { 1: {}, 2: {}, 3: {} },
      stats: {
        correct: 0,
        incorrect: 0,
        fastestMs: null,
        bestValue: 0,
        start: Date.now(),
        streak: 0,
        bestStreak: 0,
        city: {
          1: getCityStatsTemplate(),
          2: getCityStatsTemplate(),
          3: getCityStatsTemplate()
        }
      },
      aiSeed: Date.now(),
      sessionId: cryptoRandom()
    };
  }

  function normalizeState(s) {
    s.stats = Object.assign({
      correct: 0,
      incorrect: 0,
      fastestMs: null,
      bestValue: 0,
      start: Date.now(),
      streak: 0,
      bestStreak: 0,
      city: {
        1: getCityStatsTemplate(),
        2: getCityStatsTemplate(),
        3: getCityStatsTemplate()
      }
    }, s.stats || {});

    s.stats.city = s.stats.city || {};
    [1, 2, 3].forEach(lvl => {
      s.stats.city[lvl] = Object.assign(getCityStatsTemplate(), s.stats.city[lvl] || {});
    });

    s.scores = Object.assign({ player: 0, ai: 0 }, s.scores || {});
    s.unlocked = Object.assign({ 1: true, 2: false, 3: false }, s.unlocked || {});
    s.completed = Object.assign({ 1: false, 2: false, 3: false }, s.completed || {});
    s.tiles = Object.assign({ 1: {}, 2: {}, 3: {} }, s.tiles || {});
    return s;
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
    const now = Date.now();
    if (now - (saveState.lastToast || 0) > 8000) {
      showToast("Progress saved");
      saveState.lastToast = now;
    }
  }

  function wireEvents() {
    ui.startForm.addEventListener("submit", onStart);
    ui.playBtn.addEventListener("click", onStart);
    ui.clearBtn.addEventListener("click", clearProgress);
    ui.showTour.addEventListener("click", () => {
      localStorage.removeItem(onboardingKey);
      document.getElementById("onboarding").classList.add("show");
    });
    Object.entries(ui.toggles).forEach(([key, el]) => {
      el.addEventListener("change", () => updateSettingFromToggle(key, el));
    });
    ui.intro.next.addEventListener("click", advanceIntro);
    ui.intro.practiceButtons.forEach(btn => btn.addEventListener("click", onPractice));
    Object.values(ui.map.nodes).forEach((node, idx) => {
      const level = idx + 1;
      node.addEventListener("click", () => tryEnterLevel(level));
      node.addEventListener("keydown", (e) => {
        if (e.key === "Enter") tryEnterLevel(level);
      });
    });
    ui.hud.back.addEventListener("click", () => setScreen("map"));
    document.getElementById("onboarding-skip").addEventListener("click", () => closeOnboarding(true));
    document.getElementById("onboarding-next").addEventListener("click", () => closeOnboarding(true));
    ui.modal.close.addEventListener("click", closeQuestion);
    ui.modal.submit.addEventListener("click", submitAnswer);
    ui.modal.giveUp.addEventListener("click", () => concludeAnswer(false, "You passed"));
    ui.modal.modes.forEach(btn => btn.addEventListener("click", () => switchMode(btn.dataset.mode)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeQuestion();
      if (e.key === "Enter" && ui.modal.wrapper.classList.contains("show")) submitAnswer();
    });
    ui.end.replay.addEventListener("click", replay);
    ui.end.replayEasy.addEventListener("click", () => replay("easy"));
    ui.end.replayHard.addEventListener("click", () => replay("hard"));
    ui.end.restartMap.addEventListener("click", () => setScreen("map"));
    ui.end.share.addEventListener("click", shareResult);
    ui.end.download.addEventListener("click", downloadSummary);
  }

  function onStart(e) {
    e.preventDefault();
    const name = ui.nickname.value.trim();
    if (!name) {
      showToast("Enter a nickname to start");
      return;
    }
    state.nickname = name;
    state.aiSeed = hashString(name || state.sessionId || Date.now());
    aiRng = seededRandom(state.aiSeed);
    primeAudio();
    ui.hud.player.textContent = name;
    saveState();
    setScreen("intro");
    playSound("ui");
    startIntroProgress();
  }

  function updateSettingFromToggle(key, el) {
    const checked = el.checked;
    switch (key) {
      case "sfx":
      case "music":
        state.settings[key] = checked;
        break;
      case "theme":
        state.settings.theme = checked ? "dark" : "light";
        break;
      case "contrast":
        state.settings.contrast = checked;
        document.body.classList.toggle("high-contrast", checked);
        break;
      case "motion":
        state.settings.reduceMotion = checked;
        document.body.classList.toggle("reduced-motion", checked);
        break;
    }
    applyTheme();
    saveState();
  }

  function applySettingsToUI() {
    ui.nickname.value = state.nickname || "";
    ui.toggles.sfx.checked = state.settings.sfx;
    ui.toggles.music.checked = state.settings.music;
    ui.toggles.theme.checked = state.settings.theme === "dark";
    ui.toggles.contrast.checked = state.settings.contrast;
    ui.toggles.motion.checked = state.settings.reduceMotion;
    applyTheme();
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.theme === "dark" ? "dark" : "light");
    if (state.settings.contrast) {
      document.body.style.filter = "contrast(1.05)";
    } else {
      document.body.style.filter = "none";
    }
  }

  function setScreen(name) {
    Object.entries(ui.screens).forEach(([key, el]) => {
      el.classList.toggle("active", key === name);
    });
    if (name !== "board") {
      clearInterval(timerInterval);
      ui.board.timer.textContent = "--";
    }
    if (name === "map") renderMap();
    if (name === "board") renderBoard(state.currentLevel);
    if (name === "end") finalizeStats();
  }

  function startIntroProgress() {
    ui.intro.cards.forEach((card, idx) => card.classList.toggle("active", idx === 0));
    updateIntroProgress(0);
  }

  function advanceIntro() {
    const activeIdx = ui.intro.cards.findIndex(c => c.classList.contains("active"));
    if (activeIdx === -1) return;
    if (activeIdx >= ui.intro.cards.length - 1) {
      setScreen("map");
      return;
    }
    ui.intro.cards[activeIdx].classList.remove("active");
    ui.intro.cards[activeIdx + 1].classList.add("active");
    updateIntroProgress(activeIdx + 1);
    if (activeIdx + 1 === ui.intro.cards.length - 1) {
      ui.intro.next.textContent = "Go to map";
      setTimeout(() => setScreen("map"), 1200);
    }
  }

  function updateIntroProgress(stepIdx) {
    const pct = ((stepIdx + 1) / ui.intro.cards.length) * 100;
    ui.intro.progress.style.background = `linear-gradient(90deg, var(--accent) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`;
  }

  function buildPractice() {
    if (!practicePool.length) return;
    const practiceQ = practicePool[0];
    ui.intro.practiceQuestion.textContent = practiceQ.question;
    const distractors = questionData.questions
      .filter(q => q.answer !== practiceQ.answer)
      .slice(0, 2)
      .map(q => q.answer);
    const options = shuffleDeterministic([practiceQ.answer, ...distractors], aiRng);
    ui.intro.practiceButtons.forEach((btn, idx) => {
      btn.textContent = options[idx];
      btn.dataset.answer = options[idx];
    });
  }

  function onPractice(e) {
    const selected = e.currentTarget.dataset.answer;
    const correct = practicePool[0].answer;
    if (selected === correct) {
      ui.intro.practiceFeedback.textContent = "Correct! You're ready to begin.";
      playSound("correct");
    } else {
      ui.intro.practiceFeedback.textContent = "Incorrect. No worries - examples will help.";
      playSound("incorrect");
    }
  }

  function renderMap() {
    Object.entries(ui.map.nodes).forEach(([level, node]) => {
      const unlocked = !!state.unlocked[level];
      const complete = !!state.completed[level];
      node.classList.toggle("locked", !unlocked);
      node.classList.toggle("complete", complete);
      node.setAttribute("tabindex", unlocked ? "0" : "-1");
      node.setAttribute("aria-label", `${node.querySelector(".city-label").textContent}, level ${level} ${unlocked ? "" : "locked"}`);
    });
    const line12 = ui.map.lines["1-2"];
    const line23 = ui.map.lines["2-3"];
    line12.classList.toggle("dashed", !state.completed[1]);
    line23.classList.toggle("dashed", !state.completed[2]);
  }

  function tryEnterLevel(level) {
    if (!state.unlocked[level]) {
      showToast("Level locked. Clear the previous city first.");
      return;
    }
    if (!localStorage.getItem(onboardingKey)) {
      closeOnboarding(true);
    }
    state.currentLevel = level;
    saveState();
    updateHud();
    renderBoard(level);
    setScreen("board");
  }

  function renderBoard(level) {
    if (!questionData) {
      ui.board.grid.innerHTML = "<p>Question bank failed to load.</p>";
      return;
    }
    ui.board.title.textContent = `Level ${level} - ${questionData?.levels?.find(l => l.id === level)?.name || ""}`;
    ui.board.grid.innerHTML = "";
    const categories = questionData.categories;
    categories.forEach(cat => {
      const col = document.createElement("div");
      col.className = "category-col";
      const title = document.createElement("div");
      title.className = "category-title";
      title.textContent = cat;
      col.appendChild(title);
      config.tileValues.forEach(value => {
        const tile = document.createElement("button");
        tile.className = "tile";
        const key = tileKey(cat, value);
        const played = state.tiles[level][key];
        const q = findQuestion(level, cat, value);
        tile.innerHTML = `<span>$${value}</span><span>${played ? (played.by === "player" ? "You" : "AI") : "Ready"}</span>`;
        tile.disabled = !q || !!played;
        tile.setAttribute("aria-label", `${cat} for $${value} ${played ? "already played" : ""}`);
        if (q) {
          tile.addEventListener("click", () => {
            tile.classList.add("pulse");
            setTimeout(() => tile.classList.remove("pulse"), 350);
            openQuestion(level, cat, value, q);
          });
        }
        col.appendChild(tile);
      });
      ui.board.grid.appendChild(col);
    });
    updateHud();
  }

  function findQuestion(level, category, value) {
    if (!questionData) return null;
    const matches = questionData.questions.filter(q => q.category === category && q.value === value && q.level === level);
    if (matches.length) return matches[0];
    const fallbackId = questionData.fallbacks?.[`${category}|${level}|${value}`];
    if (fallbackId) {
      return questionData.questions.find(q => q.id === fallbackId) || null;
    }
    return null;
  }

  function tileKey(category, value) {
    return `${category}|${value}`;
  }

  function openQuestion(level, category, value, q) {
    activeQuestion = { level, category, value, data: q, start: performance.now() };
    ui.modal.title.textContent = `${category} - $${value}`;
    ui.modal.text.textContent = q.question;
    ui.modal.feedback.textContent = "";
    ui.modal.textField.value = "";
    ui.modal.wrapper.classList.add("show");
    switchMode("text");
    buildChoices(q);
    startTimer();
    playSound("select");
  }

  function closeQuestion() {
    ui.modal.wrapper.classList.remove("show");
    clearInterval(timerInterval);
    ui.board.timer.textContent = "--";
    activeQuestion = null;
  }

  function buildChoices(q) {
    const answers = questionData.questions.map(item => item.answer);
    const unique = [...new Set(answers.filter(a => a !== q.answer))];
    const distractors = shuffleDeterministic(unique, aiRng).slice(0, 3);
    const options = shuffleDeterministic([q.answer, ...distractors], aiRng);
    ui.modal.choiceContainer.innerHTML = "";
    options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.type = "button";
      btn.dataset.value = opt;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        Array.from(ui.modal.choiceContainer.children).forEach(c => c.setAttribute("aria-checked", "false"));
        btn.setAttribute("aria-checked", "true");
        btn.dataset.selected = "true";
      });
      if (idx === 0) btn.setAttribute("aria-checked", "true");
      ui.modal.choiceContainer.appendChild(btn);
    });
  }

  function switchMode(mode) {
    ui.modal.modes.forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.setAttribute("aria-selected", active);
    });
    const textMode = document.querySelector(".mode-text");
    const choiceMode = document.querySelector(".mode-choice");
    if (mode === "text") {
      textMode.classList.remove("hidden");
      choiceMode.classList.add("hidden");
      ui.modal.textField.focus();
    } else {
      textMode.classList.add("hidden");
      choiceMode.classList.remove("hidden");
      const first = ui.modal.choiceContainer.querySelector("button");
      if (first) first.focus();
    }
    ui.board.note.textContent = mode === "text" ? "Type and press Enter to answer quickly." : "Select an option and press Submit.";
  }

  function startTimer() {
    clearInterval(timerInterval);
    let remaining = config.timerSeconds;
    ui.board.timer.textContent = remaining;
    timerInterval = setInterval(() => {
      remaining -= 1;
      ui.board.timer.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(timerInterval);
        concludeAnswer(false, "Time is up");
      }
    }, 1000);
  }

  function submitAnswer() {
    if (!activeQuestion) return;
    const mode = ui.modal.modes.find(m => m.getAttribute("aria-selected") === "true")?.dataset.mode || "text";
    let userAnswer = "";
    if (mode === "text") {
      userAnswer = ui.modal.textField.value.trim();
    } else {
      const sel = ui.modal.choiceContainer.querySelector("[data-selected='true']") || ui.modal.choiceContainer.querySelector("button");
      userAnswer = sel ? sel.dataset.value : "";
    }
    if (!userAnswer) {
      showToast("Type or select an answer");
      return;
    }
    const isCorrect = compareAnswers(userAnswer, activeQuestion.data.answer);
    concludeAnswer(isCorrect, isCorrect ? "Correct!" : "Incorrect answer");
  }

  function compareAnswers(given, correct) {
    const norm = (s) => s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const a = norm(given);
    const b = norm(correct);
    if (!a || !b) return false;
    if (a === b) return true;
    if (b.includes(a) || a.includes(b)) return true;
    const similarity = stringSimilarity(a, b);
    return similarity >= 0.72;
  }

  function stringSimilarity(a, b) {
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 0 : 1 - dist / maxLen;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function concludeAnswer(correct, message) {
    if (!activeQuestion) return;

    // Capture before closeQuestion() clears it.
    const level = activeQuestion.level;
    const category = activeQuestion.category;
    const value = activeQuestion.value;
    const qid = activeQuestion.data?.id;

    clearInterval(timerInterval);
    const elapsed = activeQuestion.start ? Math.round(performance.now() - activeQuestion.start) : null;

    applyScore("player", correct);
    markTile(level, category, value, { by: "player", correct, timeMs: elapsed, id: qid });
    updateStatsAfterAnswer(correct, value, elapsed);

    ui.modal.feedback.textContent = `${message} - Answer: ${activeQuestion.data.answer}`;

    if (correct && state.stats.streak >= 2) {
      showFeedback(`Streak x${state.stats.streak}! ${message} You gain $${value}`);
    } else {
      showFeedback(`${message} ${correct ? "You gain" : "You lose"} $${value}`);
    }

    playSound(correct ? "correct" : "incorrect");
    saveState();

    setTimeout(() => {
      closeQuestion();
      renderBoard(level);
      checkCompletion(level);
      setTimeout(handleAiTurn, 600);
    }, 650);
  }

  function markTile(level, category, value, data) {
    state.tiles[level][tileKey(category, value)] = data;
  }

  function applyScore(who, correct) {
    if (!activeQuestion) return;
    const delta = activeQuestion.value;
    const change = correct ? delta : -delta;
    state.scores[who] = (state.scores[who] || 0) + change;
    updateHud();
  }

  function updateStatsAfterAnswer(correct, value, elapsed) {
    if (correct) {
      state.stats.correct += 1;
      state.stats.streak = (state.stats.streak || 0) + 1;
      state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.stats.streak);

      const cityStat = state.stats.city[state.currentLevel] || getCityStatsTemplate();
      cityStat.correct += 1;
      cityStat.money += value;
      state.stats.city[state.currentLevel] = cityStat;
    } else {
      state.stats.incorrect += 1;
      state.stats.streak = 0;

      const cityStat = state.stats.city[state.currentLevel] || getCityStatsTemplate();
      cityStat.incorrect += 1;
      cityStat.money -= value;
      state.stats.city[state.currentLevel] = cityStat;
    }

    if (correct && value > state.stats.bestValue) state.stats.bestValue = value;
    if (elapsed && (state.stats.fastestMs === null || elapsed < state.stats.fastestMs)) state.stats.fastestMs = elapsed;
  }

  function updateHud() {
    ui.hud.player.textContent = state.nickname || "Player";
    ui.hud.playerMoney.textContent = `$${state.scores.player || 0}`;
    ui.hud.aiMoney.textContent = `$${state.scores.ai || 0}`;
    ui.hud.level.textContent = state.currentLevel;
    ui.hud.aiConfidence.textContent = "AI ready";
  }

  function handleAiTurn() {
    const level = state.currentLevel;
    if (!state.unlocked[level]) return;
    const available = collectAvailableTiles(level);
    if (!available.length) return;
    const pick = chooseAiTile(available);
    if (!pick) return;
    const confidence = Math.round((config.ai.successByLevel[level] || 0.5) * 100);
    ui.hud.aiConfidence.textContent = `AI thinking · ~${confidence}%`;
    showFeedback(`AI thinking on ${pick.category} - $${pick.value}...`);
    const delay = lerp(config.ai.thinkMs[0], config.ai.thinkMs[1], aiRng());
    setTimeout(() => {
      const successChance = config.ai.successByLevel[level] || 0.5;
      const correct = aiRng() < successChance;
      activeQuestion = pick;
      applyScore("ai", correct);
      markTile(level, pick.category, pick.value, { by: "ai", correct, id: pick.data.id });
      showFeedback(`AI ${correct ? "gets" : "misses"} ${pick.category} $${pick.value}`);
      playSound(correct ? "correct" : "incorrect");
      saveState();
      renderBoard(level);
      checkCompletion(level);
      activeQuestion = null;
      ui.hud.aiConfidence.textContent = "AI ready";
    }, delay);
  }

  function collectAvailableTiles(level) {
    if (!questionData) return [];
    const list = [];
    questionData.categories.forEach(category => {
      config.tileValues.forEach(value => {
        const key = tileKey(category, value);
        if (state.tiles[level][key]) return;
        const q = findQuestion(level, category, value);
        if (!q) return;
        list.push({ level, category, value, data: q });
      });
    });
    return list;
  }

  function chooseAiTile(tiles) {
    const weights = tiles.map(t => Math.pow(t.value, 1.25));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = aiRng() * total;
    for (let i = 0; i < tiles.length; i++) {
      r -= weights[i];
      if (r <= 0) return tiles[i];
    }
    return tiles[0];
  }

  function checkCompletion(level) {
    const totalTiles = collectAvailableTiles(level).length + Object.keys(state.tiles[level]).length;
    const answered = Object.keys(state.tiles[level]).length;
    if (answered >= totalTiles && totalTiles > 0) {
      state.completed[level] = true;
      if (level < 3) state.unlocked[level + 1] = true;
      saveState();
      renderMap();
      showFeedback(`City completed. ${level < 3 ? "Next city unlocked!" : "Game finished."}`);
      if (level === 3) {
        triggerEnd();
      } else {
        setScreen("map");
      }
    }
  }

  function triggerEnd() {
    setScreen("end");
    finalizeStats();
    playConfetti();
    playSound("end");
  }

  function finalizeStats() {
    ui.end.player.textContent = `$${state.scores.player}`;
    ui.end.ai.textContent = `$${state.scores.ai}`;
    ui.end.correct.textContent = state.stats.correct;
    ui.end.wrong.textContent = state.stats.incorrect;
    ui.end.best.textContent = state.stats.bestValue ? `$${state.stats.bestValue}` : "--";
    ui.end.fastest.textContent = state.stats.fastestMs ? `${state.stats.fastestMs} ms` : "--";
    const minutes = ((Date.now() - state.stats.start) / 60000).toFixed(2);
    ui.end.time.textContent = `${minutes} min`;
    const total = state.stats.correct + state.stats.incorrect;
    const accuracy = total ? Math.round((state.stats.correct / total) * 100) : 0;
    ui.end.accuracy.textContent = `${accuracy}%`;
    ui.end.streak.textContent = state.stats.bestStreak || 0;
    const breakdown = document.getElementById("final-city-breakdown");
    breakdown.innerHTML = "";
    [1, 2, 3].forEach(level => {
      const c = state.stats.city[level] || { correct: 0, incorrect: 0, money: 0 };
      const card = document.createElement("div");
      card.className = "glass";
      card.innerHTML = `<strong>${questionData?.levels?.find(l => l.id === level)?.name || "City"}</strong><div>${c.correct} correct / ${c.incorrect} incorrect</div><div>Money: $${c.money || 0}</div>`;
      breakdown.appendChild(card);
    });
  }

  function replay(mode) {
    state.tiles = { 1: {}, 2: {}, 3: {} };
    state.scores = { player: 0, ai: 0 };
    state.completed = { 1: false, 2: false, 3: false };
    state.unlocked = { 1: true, 2: false, 3: false };
    state.stats = {
      correct: 0,
      incorrect: 0,
      fastestMs: null,
      bestValue: 0,
      start: Date.now(),
      streak: 0,
      bestStreak: 0,
      city: {
        1: getCityStatsTemplate(),
        2: getCityStatsTemplate(),
        3: getCityStatsTemplate()
      }
    };
    state.currentLevel = 1;

    if (mode === "easy") {
      config.ai.successByLevel = { 1: 0.9, 2: 0.75, 3: 0.6 };
    } else if (mode === "hard") {
      config.ai.successByLevel = { 1: 0.7, 2: 0.5, 3: 0.35 };
    } else {
      config.ai.successByLevel = { 1: 0.78, 2: 0.6, 3: 0.45 };
    }

    saveState();
    renderMap();
    setScreen("map");
  }

  function clearProgress() {
    localStorage.removeItem(storageKey);
    state = createDefaultState();
    aiRng = seededRandom(state.aiSeed);
    applySettingsToUI();
    renderMap();
    renderBoard(state.currentLevel);
    showToast("Progreso borrado.");
  }

  function shareResult() {
    const text = `Ecuador Trivia Journey: ${state.nickname || "Player"} ${state.scores.player >= state.scores.ai ? "beats" : "loses to"} the AI ${state.scores.player} vs ${state.scores.ai}.`;
    if (navigator.share) {
      navigator.share({ title: "Ecuador Trivia Journey", text });
    } else {
      navigator.clipboard.writeText(text);
      showToast("Summary copied to clipboard.");
    }
  }

  function downloadSummary() {
    const summary = {
      nickname: state.nickname,
      scores: state.scores,
      stats: state.stats,
      completed: state.completed,
      version: config.version,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ecuador-trivia-resumen.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function showFeedback(text) {
    ui.feedbackBar.textContent = text;
    ui.feedbackBar.classList.add("show");
    setTimeout(() => ui.feedbackBar.classList.remove("show"), 2200);
  }

  function showToast(text) {
    ui.toast.textContent = text;
    ui.toast.style.display = "block";
    setTimeout(() => { ui.toast.style.display = "none"; }, 2200);
  }

  function closeOnboarding(markComplete) {
    document.getElementById("onboarding").classList.remove("show");
    if (markComplete) localStorage.setItem(onboardingKey, "done");
  }

  function playConfetti() {
    if (!window.confetti) return;
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
  }

  function playSound(name) {
    if (!state.settings.sfx) return;
    if (!audioBank[name]) {
      const src = config.audioFiles[name];
      if (!src) return;
      try {
        audioBank[name] = new Audio(src);
        audioBank[name].volume = 0.7;
        audioBank[name].preload = "auto";
        audioBank[name].addEventListener("error", () => console.warn(`Audio failed to load: ${name}`));
      } catch (err) {
        console.warn("Audio init failed", err);
        return;
      }
    }
    const clip = audioBank[name];
    clip.currentTime = 0;
    clip.play().catch(() => {
      clip.muted = true;
      clip.play().finally(() => { clip.muted = false; });
    });
  }

  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    Object.keys(config.audioFiles).forEach(name => {
      const src = config.audioFiles[name];
      if (!src) return;
      if (!audioBank[name]) {
        try {
          audioBank[name] = new Audio(src);
          audioBank[name].volume = 0.7;
          audioBank[name].preload = "auto";
          audioBank[name].addEventListener("error", () => console.warn(`Audio failed to load: ${name}`));
        } catch (err) {
          console.warn("Audio init failed", err);
          return;
        }
      }
      const clip = audioBank[name];
      clip.muted = true;
      clip.play().catch(() => { }).finally(() => {
        clip.pause();
        clip.currentTime = 0;
        clip.muted = false;
      });
    });
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffleDeterministic(arr, rngFn) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor((rngFn ? rngFn() : Math.random()) * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function cryptoRandom() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        return arr[0];
      }
    } catch (_) { }
    return Math.floor(Math.random() * 1e9);
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return Math.abs(h);
  }
})();
