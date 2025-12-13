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

  let questionData = null;
  let state = loadState();
  let activeQuestion = null;
  let timerInterval = null;
  let practicePool = [];
  let aiRng = seededRandom(state.aiSeed || Date.now());
  let audioBank = {};

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
      back: document.getElementById("back-to-map")
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
      replay: document.getElementById("replay"),
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
    try {
      questionData = await fetchQuestions();
      practicePool = questionData.questions.filter(q => q.level === 1 && q.value === 400);
      buildPractice();
      renderMap();
    } catch (err) {
      showToast("Could not load the question bank. Check data/questions.json");
      console.error(err);
    }
  }

  function fetchQuestions() {
    return fetch("data/questions.json")
      .then(r => {
        if (!r.ok) throw new Error("Error loading questions");
        return r.json();
      });
  }

  function loadState() {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (_) {
        return createDefaultState();
      }
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
      stats: { correct: 0, incorrect: 0, fastestMs: null, bestValue: 0, start: Date.now() },
      aiSeed: Date.now(),
      sessionId: cryptoRandom()
    };
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function wireEvents() {
    ui.startForm.addEventListener("submit", onStart);
    ui.clearBtn.addEventListener("click", clearProgress);
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
    ui.modal.close.addEventListener("click", closeQuestion);
    ui.modal.submit.addEventListener("click", submitAnswer);
    ui.modal.giveUp.addEventListener("click", () => concludeAnswer(false, "You passed"));
    ui.modal.modes.forEach(btn => btn.addEventListener("click", () => switchMode(btn.dataset.mode)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeQuestion();
      if (e.key === "Enter" && ui.modal.wrapper.classList.contains("show")) submitAnswer();
    });
    ui.end.replay.addEventListener("click", replay);
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
          tile.addEventListener("click", () => openQuestion(level, cat, value, q));
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
    const norm = (s) => s.toLowerCase().trim().replace(/[.!?\s]+$/g, "");
    return norm(given) === norm(correct);
  }

  function concludeAnswer(correct, message) {
    if (!activeQuestion) return;
    clearInterval(timerInterval);
    const elapsed = activeQuestion.start ? Math.round(performance.now() - activeQuestion.start) : null;
    applyScore("player", correct);
    markTile(activeQuestion.level, activeQuestion.category, activeQuestion.value, { by: "player", correct, timeMs: elapsed, id: activeQuestion.data.id });
    updateStatsAfterAnswer(correct, activeQuestion.value, elapsed);
    ui.modal.feedback.textContent = `${message} - Answer: ${activeQuestion.data.answer}`;
    showFeedback(`${message} ${correct ? "You gain" : "You lose"} $${activeQuestion.value}`);
    playSound(correct ? "correct" : "incorrect");
    saveState();
    setTimeout(() => {
      closeQuestion();
      renderBoard(activeQuestion.level);
      checkCompletion(activeQuestion.level);
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
    if (correct) state.stats.correct += 1;
    else state.stats.incorrect += 1;
    if (correct && value > state.stats.bestValue) state.stats.bestValue = value;
    if (elapsed && (state.stats.fastestMs === null || elapsed < state.stats.fastestMs)) state.stats.fastestMs = elapsed;
  }

  function updateHud() {
    ui.hud.player.textContent = state.nickname || "Player";
    ui.hud.playerMoney.textContent = `$${state.scores.player || 0}`;
    ui.hud.aiMoney.textContent = `$${state.scores.ai || 0}`;
    ui.hud.level.textContent = state.currentLevel;
  }

  function handleAiTurn() {
    const level = state.currentLevel;
    if (!state.unlocked[level]) return;
    const available = collectAvailableTiles(level);
    if (!available.length) return;
    const pick = chooseAiTile(available);
    if (!pick) return;
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
  }

  function replay() {
    state.tiles = { 1: {}, 2: {}, 3: {} };
    state.scores = { player: 0, ai: 0 };
    state.completed = { 1: false, 2: false, 3: false };
    state.unlocked = { 1: true, 2: false, 3: false };
    state.stats = { correct: 0, incorrect: 0, fastestMs: null, bestValue: 0, start: Date.now() };
    state.currentLevel = 1;
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

  function playConfetti() {
    if (!window.confetti) return;
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.7 } });
  }

  function playSound(name) {
    if (!state.settings.sfx) return;
    if (!audioBank[name]) {
      const src = config.audioFiles[name];
      if (!src) return;
      audioBank[name] = new Audio(src);
      audioBank[name].volume = 0.7;
    }
    const clip = audioBank[name];
    clip.currentTime = 0;
    clip.play().catch(() => { /* ignore autoplay restrictions */ });
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
