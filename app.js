(() => {
  const NAV_ITEMS = [
    ["dashboard", "Dashboard"], ["planner", "Planner"], ["focus", "Focus"], ["notes", "Notes"],
    ["quiz", "Quiz"], ["formula", "Formula Vault"], ["codelab", "Code Lab"], ["calculator", "Calculator"],
    ["analytics", "Analytics"], ["achievements", "Achievements"], ["settings", "Settings"], ["about", "About"]
  ];
  const STORAGE_KEYS = {
    user: "bilzzard_user", tasks: "bilzzard_tasks", notes: "bilzzard_notes", quizzes: "bilzzard_quizzes",
    focus: "bilzzard_focus", progress: "bilzzard_progress", achievements: "bilzzard_achievements",
    settings: "bilzzard_settings", activity: "bilzzard_activity", projects: "bilzzard_projects"
  };

  const defaults = {
    user: { name: "Student" },
    tasks: [],
    notes: [],
    quizzes: [],
    focus: { sessions: [], totalMinutes: 0 },
    progress: {
      Mathematics: { done: 0, total: 0 }, Science: { done: 0, total: 0 }, English: { done: 0, total: 0 },
      "Computer Science": { done: 0, total: 0 }, Other: { done: 0, total: 0 }
    },
    achievements: {},
    settings: { theme: "dark", accent: "#6f8dff", focusMinutes: 25, breakMinutes: 5, notifications: false },
    activity: [],
    projects: []
  };

  const state = loadAll();
  let currentSection = "dashboard";
  let timer = { handle: null, mode: "focus", total: state.settings.focusMinutes * 60, left: state.settings.focusMinutes * 60, running: false };
  let quizState = null;

  function safeParse(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
  function getLocal(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v ? safeParse(v, fallback) : fallback;
    } catch { return fallback; }
  }
  function setLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function loadAll() {
    const out = {};
    out.user = getLocal(STORAGE_KEYS.user, defaults.user);
    out.tasks = getLocal(STORAGE_KEYS.tasks, defaults.tasks);
    out.notes = getLocal(STORAGE_KEYS.notes, defaults.notes);
    out.quizzes = getLocal(STORAGE_KEYS.quizzes, defaults.quizzes);
    out.focus = getLocal(STORAGE_KEYS.focus, defaults.focus);
    out.progress = getLocal(STORAGE_KEYS.progress, defaults.progress);
    out.achievements = getLocal(STORAGE_KEYS.achievements, defaults.achievements);
    out.settings = { ...defaults.settings, ...getLocal(STORAGE_KEYS.settings, defaults.settings) };
    out.activity = getLocal(STORAGE_KEYS.activity, defaults.activity);
    out.projects = getLocal(STORAGE_KEYS.projects, defaults.projects);
    return out;
  }
  function persist() {
    Object.entries(STORAGE_KEYS).forEach(([k, key]) => setLocal(key, state[k]));
    applyTheme();
  }
  function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }
  function sanitize(s) {
    return String(s || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }
  function toast(msg) {
    const root = document.getElementById("toastRoot");
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function addActivity(type, text) {
    state.activity.unshift({ id: uid(), type, text, at: new Date().toISOString() });
    state.activity = state.activity.slice(0, 40);
    persist();
  }

  function modal(title, content, onClose) {
    const root = document.getElementById("modalRoot");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal card"><h3>${sanitize(title)}</h3>${content}<div style="margin-top:10px"><button class="btn" id="modalClose">Close</button></div></div></div>`;
    const close = () => { root.innerHTML = ""; if (onClose) onClose(); };
    root.querySelector("#modalClose").onclick = close;
    root.querySelector(".modal-backdrop").onclick = e => { if (e.target.classList.contains("modal-backdrop")) close(); };
  }
  function confirmModal(title, text, okLabel, onOk) {
    modal(title, `<p class="muted">${sanitize(text)}</p><button class="btn danger" id="okBtn">${sanitize(okLabel)}</button>`);
    document.getElementById("okBtn").onclick = () => { document.getElementById("modalRoot").innerHTML = ""; onOk(); };
  }

  function buildNav() {
    const nav = document.getElementById("mainNav");
    const bottom = document.getElementById("mobileBottom");
    nav.innerHTML = NAV_ITEMS.map(([id, label]) => `<button class="nav-item ${id === currentSection ? "active" : ""}" data-section="${id}">${label}</button>`).join("");
    const top5 = ["dashboard", "planner", "focus", "notes", "quiz"];
    bottom.innerHTML = top5.map(id => `<button class="nav-item ${id === currentSection ? "active" : ""}" data-section="${id}">${NAV_ITEMS.find(n => n[0] === id)[1]}</button>`).join("");
    document.querySelectorAll("[data-section]").forEach(btn => btn.onclick = () => goto(btn.dataset.section));
  }
  function goto(id) {
    currentSection = id;
    document.querySelectorAll(".section").forEach(s => s.classList.toggle("active", s.id === id));
    buildNav();
    renderSection(id);
    document.getElementById("sidebar").classList.remove("open");
  }

  function nowGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }
  function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
  function tasksToday() { return state.tasks.filter(t => t.date === todayKey()); }
  function calcStreak() {
    const days = new Set(state.activity.map(a => a.at.slice(0, 10))).values();
    const arr = Array.from(days).sort().reverse();
    let c = 0;
    let cur = new Date();
    while (arr.includes(cur.toISOString().slice(0, 10))) { c += 1; cur.setDate(cur.getDate() - 1); }
    return c;
  }

  function renderDashboard() {
    const el = document.getElementById("dashboard");
    const today = tasksToday();
    const done = today.filter(t => t.done).length;
    const pct = today.length ? Math.round((done / today.length) * 100) : 0;
    const quizAcc = state.quizzes.length ? Math.round(state.quizzes.reduce((a, q) => a + q.percent, 0) / state.quizzes.length) : 0;
    const focusToday = state.focus.sessions.filter(s => s.date === todayKey()).reduce((a, s) => a + s.minutes, 0);
    el.innerHTML = `
      <div class="grid cols-2">
        <div class="card panel">
          <h2 class="h1">${nowGreeting()}, ${sanitize(state.user.name || "Student")}</h2>
          <p class="muted">Ready to make progress today?</p>
          <p>${new Date().toDateString()}</p>
          <button class="btn" id="editNameBtn">Edit Name</button>
        </div>
        <div class="card panel">
          <h3 class="h2">Statistics</h3>
          <div class="grid cols-2">
            <div>Today's study time<br><strong>${focusToday} min</strong></div>
            <div>Tasks completed<br><strong>${state.tasks.filter(t => t.done).length}</strong></div>
            <div>Quiz accuracy<br><strong>${quizAcc}%</strong></div>
            <div>Current streak<br><strong>${calcStreak()} days</strong></div>
          </div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card panel">
          <h3 class="h2">Today's Mission</h3>
          <div id="todayTaskWrap"></div>
          <div class="progress"><div style="width:${pct}%"></div></div>
          <p class="muted">Today's Progress ${pct}%</p>
          <button class="btn primary" id="dashAddTask">Add Task</button>
        </div>
        <div class="card panel">
          <h3 class="h2">Quick Actions</h3>
          <div class="row-3">
            <button class="btn" data-go="focus">Start Focus</button>
            <button class="btn" id="dashAddTask2">Add Task</button>
            <button class="btn" id="dashNewNote">New Note</button>
            <button class="btn" data-go="quiz">Start Quiz</button>
            <button class="btn" data-go="calculator">Calculator</button>
            <button class="btn" data-go="codelab">Code Lab</button>
          </div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card panel"><h3 class="h2">Subject Progress</h3><div id="subjectProgress"></div></div>
        <div class="card panel"><h3 class="h2">Recent Activity</h3><div id="recentActivity"></div></div>
      </div>`;

    document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => goto(b.dataset.go));
    document.getElementById("editNameBtn").onclick = () => editNameModal();
    document.getElementById("dashAddTask").onclick = () => taskModal();
    document.getElementById("dashAddTask2").onclick = () => taskModal();
    document.getElementById("dashNewNote").onclick = () => noteModal();

    const wrap = document.getElementById("todayTaskWrap");
    wrap.innerHTML = today.length ? today.map(taskRow).join("") : empty("No tasks yet.", "Plan your first study session.", "Add Task", () => taskModal());
    bindTaskButtons();

    const sp = document.getElementById("subjectProgress");
    sp.innerHTML = Object.entries(state.progress).map(([sub, p]) => {
      const percent = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
      return `<div class="item"><strong>${sanitize(sub)}</strong><div>${p.done}/${p.total} topics (${percent}%)</div><div class="progress"><div style="width:${percent}%"></div></div><button class="btn small" data-sub="${sanitize(sub)}">Update</button></div>`;
    }).join("");
    sp.querySelectorAll("[data-sub]").forEach(btn => btn.onclick = () => subjectProgressModal(btn.dataset.sub));

    const ra = document.getElementById("recentActivity");
    ra.innerHTML = state.activity.slice(0, 8).map(a => `<div class="item">${sanitize(a.text)}<div class="muted">${new Date(a.at).toLocaleString()}</div></div>`).join("") || `<p class="muted">No activity yet.</p>`;
  }

  function taskRow(t) {
    return `<div class="item ${t.done ? "done" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px"><strong>${sanitize(t.name)}</strong><span class="badge">${sanitize(t.priority || "Normal")}</span></div>
      <div class="muted">${sanitize(t.subject || "Other")} · ${sanitize(t.topic || "-")} · ${sanitize(t.date || "")}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn small" data-task-complete="${t.id}">${t.done ? "Undo" : "Complete"}</button>
        <button class="btn small" data-task-edit="${t.id}">Edit</button>
        <button class="btn small danger" data-task-del="${t.id}">Delete</button>
      </div></div>`;
  }
  function bindTaskButtons() {
    document.querySelectorAll("[data-task-complete]").forEach(b => b.onclick = () => {
      const task = state.tasks.find(t => t.id === b.dataset.taskComplete);
      if (!task) return;
      task.done = !task.done;
      if (task.done) addActivity("task", `Task completed: ${task.name}`);
      persist(); checkAchievements(); renderAll(); toast("Task updated ✓");
    });
    document.querySelectorAll("[data-task-edit]").forEach(b => b.onclick = () => taskModal(b.dataset.taskEdit));
    document.querySelectorAll("[data-task-del]").forEach(b => b.onclick = () => confirmModal("Delete Task", "Remove this task?", "Delete", () => {
      state.tasks = state.tasks.filter(t => t.id !== b.dataset.taskDel);
      persist(); renderAll(); toast("Task deleted ✓");
    }));
  }

  function empty(title, sub, action, cbName) {
    const id = uid();
    setTimeout(() => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = cbName;
    }, 0);
    return `<div class="item"><strong>${sanitize(title)}</strong><p class="muted">${sanitize(sub)}</p><button class="btn" id="${id}">${sanitize(action)}</button></div>`;
  }

  function taskModal(taskId = null) {
    const t = taskId ? state.tasks.find(x => x.id === taskId) : null;
    modal(taskId ? "Edit Task" : "Add Task", `
      <div class="list">
        <input id="taskName" placeholder="Task name" value="${sanitize(t?.name || "")}">
        <div class="row"><input id="taskSubject" placeholder="Subject" value="${sanitize(t?.subject || "")}"><input id="taskTopic" placeholder="Topic" value="${sanitize(t?.topic || "")}"></div>
        <div class="row"><input id="taskDate" type="date" value="${sanitize(t?.date || "")}"><input id="taskTime" type="time" value="${sanitize(t?.startTime || "")}"></div>
        <div class="row"><input id="taskDuration" type="number" min="1" placeholder="Duration (min)" value="${sanitize(t?.duration || "")}"><select id="taskPriority"><option>Low</option><option>Medium</option><option>High</option></select></div>
        <button class="btn primary" id="saveTaskBtn">Save Task</button>
      </div>`);
    const pr = document.getElementById("taskPriority"); if (t?.priority) pr.value = t.priority;
    document.getElementById("saveTaskBtn").onclick = () => {
      const name = document.getElementById("taskName").value.trim();
      const date = document.getElementById("taskDate").value;
      if (!name) return toast("Task name required");
      if (!date) return toast("Date required");
      const model = {
        id: t?.id || uid(), name, subject: document.getElementById("taskSubject").value.trim() || "Other", topic: document.getElementById("taskTopic").value.trim(),
        date, startTime: document.getElementById("taskTime").value, duration: Number(document.getElementById("taskDuration").value || 0),
        priority: pr.value, done: t?.done || false
      };
      if (taskId) state.tasks = state.tasks.map(x => x.id === taskId ? model : x); else state.tasks.unshift(model);
      persist(); document.getElementById("modalRoot").innerHTML = ""; renderAll(); toast("Task saved ✓");
    };
  }

  function renderPlanner() {
    const el = document.getElementById("planner");
    el.innerHTML = `
      <div class="card panel">
        <h2 class="h1">Study Planner</h2>
        <div class="row-3">
          <input id="plannerSearch" placeholder="Search tasks">
          <select id="plannerFilter"><option value="All">All</option><option value="Today">Today</option><option value="Upcoming">Upcoming</option><option value="Completed">Completed</option><option value="Pending">Pending</option></select>
          <select id="plannerSort"><option value="date">Sort by Date</option><option value="priority">Sort by Priority</option><option value="subject">Sort by Subject</option></select>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px"><button class="btn primary" id="plannerAdd">Add Task</button><select id="plannerSubject"><option value="">All Subjects</option>${[...new Set(state.tasks.map(t => t.subject || "Other"))].map(s => `<option>${sanitize(s)}</option>`).join("")}</select></div>
      </div>
      <div class="card panel"><div id="plannerList" class="list"></div></div>`;
    document.getElementById("plannerAdd").onclick = () => taskModal();
    ["plannerSearch", "plannerFilter", "plannerSort", "plannerSubject"].forEach(id => document.getElementById(id).oninput = draw);
    draw();
    function draw() {
      const q = document.getElementById("plannerSearch").value.toLowerCase();
      const f = document.getElementById("plannerFilter").value;
      const s = document.getElementById("plannerSort").value;
      const sub = document.getElementById("plannerSubject").value;
      let arr = state.tasks.filter(t => `${t.name} ${t.topic}`.toLowerCase().includes(q));
      if (sub) arr = arr.filter(t => t.subject === sub);
      const today = todayKey();
      arr = arr.filter(t => {
        if (f === "All") return true;
        if (f === "Today") return t.date === today;
        if (f === "Upcoming") return t.date > today;
        if (f === "Completed") return t.done;
        if (f === "Pending") return !t.done;
      });
      if (s === "date") arr.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      if (s === "priority") arr.sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - ({ High: 0, Medium: 1, Low: 2 }[b.priority])));
      if (s === "subject") arr.sort((a, b) => (a.subject || "").localeCompare(b.subject || ""));
      const wrap = document.getElementById("plannerList");
      wrap.innerHTML = arr.length ? arr.map(taskRow).join("") : empty("No tasks yet.", "Plan your first study session.", "Add Task", () => taskModal());
      bindTaskButtons();
    }
  }

  function renderFocus() {
    const el = document.getElementById("focus");
    const pct = Math.round(((timer.total - timer.left) / Math.max(1, timer.total)) * 100);
    const todayMin = state.focus.sessions.filter(s => s.date === todayKey()).reduce((a, s) => a + s.minutes, 0);
    el.innerHTML = `<div class="card panel">
      <h2 class="h1">Focus Timer</h2>
      <div class="row"><div>
      <p class="muted">Mode: ${timer.mode}</p>
      <h3 style="font-size:2rem;margin:0">${fmtTime(timer.left)}</h3>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <p class="muted">Completed sessions: ${state.focus.sessions.length} · Today's focus time: ${todayMin} min</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="focusStart">Start</button><button class="btn" id="focusPause">Pause</button><button class="btn" id="focusResume">Resume</button><button class="btn" id="focusReset">Reset</button><button class="btn" id="focusSkip">Skip</button>
      </div></div>
      <div><h3 class="h2">Durations</h3><div class="row"><input id="focusDur" type="number" min="1" value="${state.settings.focusMinutes}"><input id="breakDur" type="number" min="1" value="${state.settings.breakMinutes}"></div><button class="btn" id="saveDur">Save</button></div></div>
    </div>`;
    document.getElementById("focusStart").onclick = startTimer;
    document.getElementById("focusPause").onclick = pauseTimer;
    document.getElementById("focusResume").onclick = resumeTimer;
    document.getElementById("focusReset").onclick = resetTimer;
    document.getElementById("focusSkip").onclick = skipTimer;
    document.getElementById("saveDur").onclick = () => {
      const fm = Number(document.getElementById("focusDur").value);
      const bm = Number(document.getElementById("breakDur").value);
      if (fm < 1 || bm < 1) return toast("Invalid duration");
      state.settings.focusMinutes = fm; state.settings.breakMinutes = bm;
      persist(); resetTimer(); toast("Durations saved ✓");
    };
  }
  function fmtTime(x) { const m = Math.floor(x / 60), s = x % 60; return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
  function startTimer() {
    if (timer.running) return;
    if (timer.left <= 0) resetTimer();
    timer.running = true;
    timer.handle = setInterval(() => {
      timer.left -= 1;
      if (timer.left <= 0) {
        clearInterval(timer.handle); timer.running = false;
        onTimerFinished();
      }
      if (currentSection === "focus") renderFocus();
    }, 1000);
    renderFocus();
  }
  function pauseTimer() { if (!timer.running) return; clearInterval(timer.handle); timer.running = false; renderFocus(); }
  function resumeTimer() { if (!timer.running) startTimer(); }
  function resetTimer() { clearInterval(timer.handle); timer.running = false; timer.mode = "focus"; timer.total = state.settings.focusMinutes * 60; timer.left = timer.total; renderFocus(); }
  function skipTimer() { clearInterval(timer.handle); timer.running = false; timer.left = 0; onTimerFinished(); }
  function onTimerFinished() {
    if (timer.mode === "focus") {
      const mins = Math.round(timer.total / 60);
      state.focus.sessions.unshift({ id: uid(), date: todayKey(), minutes: mins, at: new Date().toISOString() });
      state.focus.totalMinutes += mins;
      addActivity("focus", `Focus session completed (${mins} min)`);
      checkAchievements();
      toast("Focus session completed ✓");
      timer.mode = "break"; timer.total = state.settings.breakMinutes * 60; timer.left = timer.total;
      notify("Break time started");
    } else {
      toast("Break completed ✓");
      timer.mode = "focus"; timer.total = state.settings.focusMinutes * 60; timer.left = timer.total;
      notify("Focus session ready");
    }
    persist();
    renderAll();
  }

  function noteModal(noteId = null) {
    const n = noteId ? state.notes.find(x => x.id === noteId) : null;
    modal(noteId ? "Edit Note" : "New Note", `
      <div class="list">
        <input id="noteTitle" placeholder="Title" value="${sanitize(n?.title || "")}">
        <select id="noteCategory">${["Mathematics", "Science", "Coding", "Ideas", "Personal", "Other"].map(c => `<option>${c}</option>`).join("")}</select>
        <textarea id="noteContent" placeholder="Write your note...">${sanitize(n?.content || "")}</textarea>
        <div style="display:flex;gap:8px"><label><input id="notePin" type="checkbox" ${n?.pin ? "checked" : ""}> Pin</label></div>
        <button class="btn primary" id="saveNoteBtn">Save Note</button>
      </div>`);
    if (n?.category) document.getElementById("noteCategory").value = n.category;
    const auto = setInterval(() => {
      const titleEl = document.getElementById("noteTitle");
      if (!titleEl) return clearInterval(auto);
      if (!titleEl.value.trim()) return;
      save(true);
    }, 4000);
    document.getElementById("saveNoteBtn").onclick = () => save(false);
    function save(silent) {
      const title = document.getElementById("noteTitle").value.trim();
      if (!title) return !silent && toast("Title required");
      const prev = n?.createdAt || new Date().toISOString();
      const model = {
        id: n?.id || uid(), title, category: document.getElementById("noteCategory").value,
        content: document.getElementById("noteContent").value,
        createdAt: prev, updatedAt: new Date().toISOString(), pin: document.getElementById("notePin").checked
      };
      if (noteId) state.notes = state.notes.map(x => x.id === noteId ? model : x); else state.notes.unshift(model);
      if (!noteId) addActivity("note", `Note created: ${title}`);
      persist(); checkAchievements(); if (!silent) { document.getElementById("modalRoot").innerHTML = ""; renderAll(); toast("Note saved ✓"); }
    }
  }
  function renderNotes() {
    const el = document.getElementById("notes");
    el.innerHTML = `<div class="card panel"><h2 class="h1">Notes</h2>
      <div class="row"><input id="noteSearch" placeholder="Search notes"><select id="noteCat"><option value="">All categories</option>${["Mathematics","Science","Coding","Ideas","Personal","Other"].map(c=>`<option>${c}</option>`).join("")}</select></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" id="newNoteBtn">New Note</button><select id="noteSort"><option value="updated">Last edited</option><option value="created">Created</option><option value="title">Title</option></select></div></div>
      <div class="card panel"><div id="noteList" class="list"></div></div>`;
    document.getElementById("newNoteBtn").onclick = () => noteModal();
    ["noteSearch", "noteCat", "noteSort"].forEach(id => document.getElementById(id).oninput = draw);
    draw();
    function draw() {
      const q = document.getElementById("noteSearch").value.toLowerCase();
      const c = document.getElementById("noteCat").value;
      const s = document.getElementById("noteSort").value;
      let arr = state.notes.filter(n => `${n.title} ${n.content}`.toLowerCase().includes(q));
      if (c) arr = arr.filter(n => n.category === c);
      arr.sort((a, b) => {
        if (a.pin !== b.pin) return a.pin ? -1 : 1;
        if (s === "updated") return b.updatedAt.localeCompare(a.updatedAt);
        if (s === "created") return b.createdAt.localeCompare(a.createdAt);
        return a.title.localeCompare(b.title);
      });
      const wrap = document.getElementById("noteList");
      wrap.innerHTML = arr.length ? arr.map(n => `<div class="item"><div style="display:flex;justify-content:space-between"><strong>${sanitize(n.title)} ${n.pin?"📌":""}</strong><span class="badge">${sanitize(n.category)}</span></div><p>${sanitize((n.content || "").slice(0, 200))}</p><div class="muted">Created ${new Date(n.createdAt).toLocaleString()} · Edited ${new Date(n.updatedAt).toLocaleString()}</div><div style="display:flex;gap:6px;margin-top:8px"><button class="btn small" data-note-edit="${n.id}">Edit</button><button class="btn small danger" data-note-del="${n.id}">Delete</button></div></div>`).join("") : empty("No notes yet.", "Create your first note.", "New Note", () => noteModal());
      wrap.querySelectorAll("[data-note-edit]").forEach(b => b.onclick = () => noteModal(b.dataset.noteEdit));
      wrap.querySelectorAll("[data-note-del]").forEach(b => b.onclick = () => confirmModal("Delete Note", "Remove this note?", "Delete", () => {
        state.notes = state.notes.filter(n => n.id !== b.dataset.noteDel);
        persist(); renderAll();
      }));
    }
  }

  const QUIZ_BANK = buildQuizBank();
  function buildQuizBank() {
    const cats = {
      Mathematics: [
        ["2+2=?", ["3", "4", "5", "6"], 1, "Easy"], ["Derivative of x²?", ["x", "2x", "x²", "2"], 1, "Easy"],
        ["π approx?", ["2.14", "3.14", "4.13", "1.34"], 1, "Easy"], ["5! = ?", ["120", "24", "60", "100"], 0, "Medium"],
        ["Root of x²-9=0", ["3 only", "-3 only", "±3", "0"], 2, "Medium"], ["sin 90°", ["0", "1", "-1", "0.5"], 1, "Easy"],
        ["Area circle formula", ["πr", "πr²", "2πr", "r²"], 1, "Easy"], ["log10(100)", ["1", "2", "10", "0"], 1, "Easy"],
        ["Equation of line slope m", ["y=mx+c", "x=my+c", "y=m/x", "y=x+c"], 0, "Medium"], ["∫1 dx", ["0", "1", "x", "x²"], 2, "Hard"]
      ],
      Science: [
        ["H2O is", ["Hydrogen", "Oxygen", "Water", "Helium"], 2, "Easy"], ["Force unit", ["Watt", "Newton", "Joule", "Pascal"], 1, "Easy"],
        ["Speed =", ["distance/time", "time/distance", "mass*acc", "work/time"], 0, "Easy"], ["Planet known red?", ["Venus", "Mars", "Jupiter", "Saturn"], 1, "Easy"],
        ["Atomic number of C", ["6", "12", "8", "14"], 0, "Medium"], ["Photosynthesis needs", ["CO2", "O2", "N2", "He"], 0, "Easy"],
        ["SI unit of work", ["Watt", "Joule", "Volt", "Ohm"], 1, "Medium"], ["DNA full form", ["Deoxy...Acid", "Dynamic...Acid", "Dual...Acid", "None"], 0, "Hard"],
        ["Light year is", ["time", "distance", "mass", "speed"], 1, "Medium"], ["pH <7 means", ["neutral", "basic", "acidic", "salt"], 2, "Easy"]
      ],
      "Computer Science": [
        ["Binary of 5", ["101", "111", "100", "011"], 0, "Easy"], ["HTML stands for", ["HyperText Markup Language", "HighText", "Hyper Transfer", "None"], 0, "Easy"],
        ["OOP pillar", ["Encapsulation", "Compilation", "Execution", "Sorting"], 0, "Easy"], ["CSS used for", ["Logic", "Styling", "Database", "Networking"], 1, "Easy"],
        ["JS is", ["compiled only", "interpreted", "machine code", "none"], 1, "Medium"], ["Big O for binary search", ["O(n)", "O(log n)", "O(1)", "O(n²)"], 1, "Hard"],
        ["HTTP code for not found", ["200", "301", "404", "500"], 2, "Easy"], ["Array index starts", ["1", "0", "-1", "2"], 1, "Easy"],
        ["SQL used for", ["styling", "querying data", "graphics", "gaming"], 1, "Medium"], ["Recursion means", ["loop forever", "self-calling function", "sorting", "none"], 1, "Medium"]
      ],
      "General Knowledge": [
        ["Capital of India", ["Mumbai", "Delhi", "Chennai", "Kolkata"], 1, "Easy"], ["UN founded", ["1945", "1919", "1950", "1930"], 0, "Medium"],
        ["Largest ocean", ["Atlantic", "Indian", "Pacific", "Arctic"], 2, "Easy"], ["Olympics every", ["2", "3", "4", "5"], 2, "Easy"],
        ["Currency of Japan", ["Won", "Yen", "Dollar", "Euro"], 1, "Easy"], ["Earth satellite", ["Moon", "Mars", "Venus", "Sun"], 0, "Easy"],
        ["7 continents?", ["Yes", "No", "8", "5"], 0, "Easy"], ["First PM of India", ["Nehru", "Patel", "Gandhi", "Bose"], 0, "Medium"],
        ["Water freezes at", ["0C", "10C", "-10C", "100C"], 0, "Easy"], ["Largest mammal", ["Elephant", "Blue whale", "Giraffe", "Rhino"], 1, "Easy"]
      ]
    };
    const out = [];
    Object.entries(cats).forEach(([cat, list]) => list.forEach(x => out.push({ id: uid(), category: cat, q: x[0], options: x[1], answer: x[2], difficulty: x[3] })));
    return out;
  }

  function renderQuiz() {
    const el = document.getElementById("quiz");
    if (!quizState) {
      const hist = state.quizzes.slice(0, 6).map(q => `<div class="item">${q.category}/${q.difficulty}: ${q.score}/${q.total} (${q.percent}%)</div>`).join("") || `<p class="muted">No quiz history yet.</p>`;
      el.innerHTML = `<div class="card panel"><h2 class="h1">Quiz Center</h2>
        <div class="row"><select id="quizCategory">${["Mathematics","Science","Computer Science","General Knowledge"].map(c=>`<option>${c}</option>`).join("")}</select><select id="quizDifficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
        <button class="btn primary" id="startQuizBtn" style="margin-top:8px">Start Quiz</button>
      </div>
      <div class="card panel"><h3 class="h2">Quiz History</h3>${hist}</div>`;
      document.getElementById("startQuizBtn").onclick = startQuiz;
      return;
    }
    const q = quizState.questions[quizState.index];
    const left = fmtTime(quizState.left);
    el.innerHTML = `<div class="card panel"><h2 class="h1">${sanitize(quizState.category)} · ${sanitize(quizState.difficulty)}</h2>
      <p class="muted">Question ${quizState.index + 1}/${quizState.questions.length} · ${left}</p>
      <div class="item"><strong>${sanitize(q.q)}</strong><div class="list" style="margin-top:8px">${q.options.map((op, i) => `<label><input type="radio" name="quizOpt" value="${i}" ${quizState.answers[q.id] === i ? "checked" : ""}> ${sanitize(op)}</label>`).join("")}</div></div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn" id="prevQ">Previous</button><button class="btn" id="nextQ">Next</button><button class="btn primary" id="submitQ">Submit</button></div></div>`;
    document.querySelectorAll("input[name=quizOpt]").forEach(i => i.onchange = () => quizState.answers[q.id] = Number(i.value));
    document.getElementById("prevQ").onclick = () => { if (quizState.index > 0) quizState.index--; renderQuiz(); };
    document.getElementById("nextQ").onclick = () => { if (quizState.index < quizState.questions.length - 1) quizState.index++; renderQuiz(); };
    document.getElementById("submitQ").onclick = finishQuiz;
  }
  function startQuiz() {
    const category = document.getElementById("quizCategory").value;
    const difficulty = document.getElementById("quizDifficulty").value;
    const questions = QUIZ_BANK.filter(q => q.category === category && q.difficulty === difficulty).slice(0, 10);
    if (!questions.length) return toast("No questions available");
    quizState = { category, difficulty, questions, answers: {}, index: 0, left: 600, timer: null };
    quizState.timer = setInterval(() => {
      quizState.left -= 1;
      if (quizState.left <= 0) finishQuiz();
      if (currentSection === "quiz") renderQuiz();
    }, 1000);
    renderQuiz();
  }
  function finishQuiz() {
    if (!quizState) return;
    clearInterval(quizState.timer);
    const total = quizState.questions.length;
    let score = 0;
    const review = quizState.questions.map(q => {
      const picked = quizState.answers[q.id];
      const ok = picked === q.answer;
      if (ok) score += 1;
      return { q: q.q, correct: q.options[q.answer], picked: picked != null ? q.options[picked] : "Unanswered", ok };
    });
    const percent = Math.round((score / total) * 100);
    const rec = { id: uid(), at: new Date().toISOString(), category: quizState.category, difficulty: quizState.difficulty, score, total, percent, review };
    state.quizzes.unshift(rec);
    addActivity("quiz", `Quiz completed: ${quizState.category} (${percent}%)`);
    quizState = null;
    persist(); checkAchievements(); renderAll();
    modal("Quiz Results", `<p><strong>${score}/${total}</strong> (${percent}%)</p><p>Correct: ${score} · Wrong: ${total - score}</p><div class="search-modal-results">${review.map(r => `<div class="item">${sanitize(r.q)}<br><span class="muted">Your answer: ${sanitize(r.picked)} | Correct: ${sanitize(r.correct)}</span></div>`).join("")}</div>`);
    toast("Quiz completed ✓");
  }

  const FORMULAS = [
    ["Mathematics", "Algebra", "(a+b)^2=a^2+2ab+b^2", "Square expansion", "a,b terms", "(2+3)^2=25"],
    ["Mathematics", "Geometry", "Area=πr²", "Circle area", "r radius", "r=3 => 28.27"],
    ["Mathematics", "Mensuration", "Volume=l×b×h", "Cuboid volume", "l,b,h", "2×3×4=24"],
    ["Mathematics", "Coordinate Geometry", "d=√((x2-x1)^2+(y2-y1)^2)", "Distance", "points", "(0,0),(3,4)=>5"],
    ["Mathematics", "Trigonometry", "sin²θ+cos²θ=1", "Identity", "θ angle", "θ=30°"],
    ["Physics", "Motion", "v=u+at", "Velocity equation", "u,a,t", "u=0,a=2,t=3 => 6"],
    ["Physics", "Force", "F=ma", "Newton 2nd law", "m,a", "2kg×3=6N"],
    ["Physics", "Work", "W=Fs", "Work done", "F,s", "10N×2m=20J"],
    ["Physics", "Energy", "KE=1/2mv²", "Kinetic energy", "m,v", "m=2,v=3 => 9"],
    ["Physics", "Electricity", "V=IR", "Ohm law", "I,R", "2A×5Ω=10V"],
    ["Chemistry", "Mole concept", "n=m/M", "Moles", "m,M", "18g/18=1"],
    ["Chemistry", "Atomic structure", "Z=protons", "Atomic number", "Z", "C has 6"],
    ["Chemistry", "Basic formulas", "Molarity=n/V", "Concentration", "n,V", "1/0.5=2M"],
    ["Computer Science", "Binary", "decimal→binary by 2-division", "Conversion", "n", "5=>101"],
    ["Computer Science", "Number systems", "hex 10 = decimal 16", "Base systems", "base", "A=10"],
    ["Computer Science", "Basic algorithms", "Binary Search O(log n)", "Complexity", "n", "sorted array"]
  ].map(f => ({ id: uid(), main: f[0], sub: f[1], formula: f[2], meaning: f[3], vars: f[4], example: f[5] }));

  function renderFormula() {
    const el = document.getElementById("formula");
    const fav = new Set((state.settings.formulaFav || []));
    el.innerHTML = `<div class="card panel"><h2 class="h1">Formula Vault</h2><div class="row"><input id="formulaSearch" placeholder="Search formulas"><select id="formulaCat"><option value="">All</option>${[...new Set(FORMULAS.map(f=>f.main))].map(x=>`<option>${x}</option>`).join("")}</select></div></div><div class="card panel"><div id="formulaList" class="list"></div></div>`;
    ["formulaSearch", "formulaCat"].forEach(id => document.getElementById(id).oninput = draw);
    draw();
    function draw() {
      const q = document.getElementById("formulaSearch").value.toLowerCase();
      const c = document.getElementById("formulaCat").value;
      let arr = FORMULAS.filter(f => `${f.main} ${f.sub} ${f.formula} ${f.meaning}`.toLowerCase().includes(q));
      if (c) arr = arr.filter(f => f.main === c);
      const wrap = document.getElementById("formulaList");
      wrap.innerHTML = arr.map(f => `<div class="item"><div style="display:flex;justify-content:space-between"><strong>${sanitize(f.main)} · ${sanitize(f.sub)}</strong><button class="btn small" data-form-fav="${f.id}">${fav.has(f.id) ? "★" : "☆"}</button></div><p><code>${sanitize(f.formula)}</code></p><div class="muted">${sanitize(f.meaning)} | Variables: ${sanitize(f.vars)} | Example: ${sanitize(f.example)}</div><button class="btn small" data-form-copy="${f.id}" style="margin-top:8px">Copy Formula</button></div>`).join("");
      wrap.querySelectorAll("[data-form-fav]").forEach(b => b.onclick = () => {
        const id = b.dataset.formFav;
        const s = new Set(state.settings.formulaFav || []);
        if (s.has(id)) s.delete(id); else { s.add(id); addActivity("formula", "Formula favorited"); }
        state.settings.formulaFav = Array.from(s); persist(); renderFormula(); checkAchievements();
      });
      wrap.querySelectorAll("[data-form-copy]").forEach(b => b.onclick = async () => {
        const form = FORMULAS.find(x => x.id === b.dataset.formCopy);
        if (!form) return;
        try { await navigator.clipboard.writeText(form.formula); toast("Formula copied ✓"); }
        catch { toast("Copy failed"); }
      });
    }
  }

  function renderCodeLab() {
    const el = document.getElementById("codelab");
    const base = state.projects[0] || { id: uid(), name: "My Project", html: "<h1>Hello BILZZARD</h1>", css: "body{font-family:sans-serif}", js: "console.log('Ready');" };
    el.innerHTML = `<div class="card panel"><h2 class="h1">Code Lab</h2>
      <div class="editor-grid"><div><label>HTML</label><textarea id="codeHtml">${sanitize(base.html)}</textarea></div><div><label>CSS</label><textarea id="codeCss">${sanitize(base.css)}</textarea></div></div>
      <label>JavaScript</label><textarea id="codeJs">${sanitize(base.js)}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn primary" id="codeRun">Run</button><button class="btn" id="codeClear">Clear</button><button class="btn" id="codeReset">Reset</button><button class="btn" id="codeFullscreen">Fullscreen preview</button><button class="btn" id="codeDownload">Download HTML</button><button class="btn" id="codeSave">Save Project</button></div>
    </div><div class="card panel"><h3 class="h2">Live Preview</h3><iframe id="previewFrame" class="preview-frame" sandbox="allow-scripts"></iframe></div>`;

    const run = () => {
      const html = document.getElementById("codeHtml").value;
      const css = document.getElementById("codeCss").value;
      const js = document.getElementById("codeJs").value;
      const doc = `<!doctype html><html><head><style>${css}</style></head><body>${html}<script>try{${js}}catch(e){document.body.insertAdjacentHTML('beforeend','<pre style="color:red">'+e.message+'</pre>')}</script></body></html>`;
      document.getElementById("previewFrame").srcdoc = doc;
    };
    document.getElementById("codeRun").onclick = run;
    document.getElementById("codeClear").onclick = () => { ["codeHtml", "codeCss", "codeJs"].forEach(id => document.getElementById(id).value = ""); run(); };
    document.getElementById("codeReset").onclick = () => { document.getElementById("codeHtml").value = "<h1>Hello BILZZARD</h1>"; document.getElementById("codeCss").value = "body{font-family:sans-serif}"; document.getElementById("codeJs").value = "console.log('Ready');"; run(); };
    document.getElementById("codeFullscreen").onclick = () => { const f = document.getElementById("previewFrame"); if (f.requestFullscreen) f.requestFullscreen(); };
    document.getElementById("codeDownload").onclick = () => {
      const blob = new Blob([document.getElementById("previewFrame").srcdoc], { type: "text/html" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bilzzard-project.html"; a.click();
    };
    document.getElementById("codeSave").onclick = () => {
      const project = {
        id: uid(), name: `Project ${new Date().toLocaleString()}`,
        html: document.getElementById("codeHtml").value,
        css: document.getElementById("codeCss").value,
        js: document.getElementById("codeJs").value,
        at: new Date().toISOString()
      };
      state.projects.unshift(project);
      state.projects = state.projects.slice(0, 20);
      addActivity("code", "Code project saved"); persist(); checkAchievements(); toast("Project saved ✓");
    };
    run();
  }

  function renderCalculator() {
    const el = document.getElementById("calculator");
    el.innerHTML = `<div class="card panel"><h2 class="h1">Scientific Calculator</h2>
      <input id="calcDisplay" placeholder="0" value="${sanitize(state.settings.calcExpr || "")}">
      <div class="calc-grid" style="margin-top:8px">${["7","8","9","/","sqrt(","4","5","6","*","(","1","2","3","-",")","0",".","%","+","^","sin(","cos(","tan(","C","←"].map(k => `<button class="btn" data-key="${sanitize(k)}">${sanitize(k)}</button>`).join("")}</div>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary" id="calcEq">=</button><button class="btn" id="calcSq">x²</button></div>
    </div>`;
    const inp = document.getElementById("calcDisplay");
    document.querySelectorAll("[data-key]").forEach(b => b.onclick = () => {
      const k = b.dataset.key;
      if (k === "C") inp.value = "";
      else if (k === "←") inp.value = inp.value.slice(0, -1);
      else inp.value += k;
      state.settings.calcExpr = inp.value; persist();
    });
    document.getElementById("calcSq").onclick = () => { inp.value += "^2"; state.settings.calcExpr = inp.value; persist(); };
    document.getElementById("calcEq").onclick = () => {
      try { inp.value = String(calc(inp.value)); state.settings.calcExpr = inp.value; persist(); }
      catch { toast("Invalid expression"); }
    };
    inp.onkeydown = e => { if (e.key === "Enter") document.getElementById("calcEq").click(); };
  }

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      const ch = expr[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/\d|\./.test(ch)) {
        let n = ch; i++;
        while (i < expr.length && /[\d.]/.test(expr[i])) n += expr[i++];
        if ((n.match(/\./g) || []).length > 1) throw new Error("invalid number");
        tokens.push({ t: "num", v: parseFloat(n) }); continue;
      }
      const funcs = ["sin", "cos", "tan", "sqrt"];
      const f = funcs.find(fn => expr.slice(i).startsWith(fn));
      if (f) { tokens.push({ t: "fn", v: f }); i += f.length; continue; }
      if ("+-*/%^()".includes(ch)) { tokens.push({ t: "op", v: ch }); i++; continue; }
      throw new Error("bad token");
    }
    return tokens;
  }
  function calc(expr) {
    const out = [], ops = [];
    const prec = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
    const rightAssoc = new Set(["^"]);
    const tokens = tokenize(expr);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.t === "num") out.push(tok);
      else if (tok.t === "fn") ops.push(tok);
      else if (tok.v === "(") ops.push(tok);
      else if (tok.v === ")") {
        while (ops.length && ops[ops.length - 1].v !== "(") out.push(ops.pop());
        if (!ops.length) throw new Error("mismatch");
        ops.pop();
        if (ops.length && ops[ops.length - 1].t === "fn") out.push(ops.pop());
      } else {
        while (ops.length && ((ops[ops.length - 1].t === "fn") || (ops[ops.length - 1].v in prec && ((rightAssoc.has(tok.v) ? prec[tok.v] < prec[ops[ops.length - 1].v] : prec[tok.v] <= prec[ops[ops.length - 1].v]))))) out.push(ops.pop());
        ops.push(tok);
      }
    }
    while (ops.length) {
      const x = ops.pop();
      if (x.v === "(") throw new Error("mismatch");
      out.push(x);
    }
    const st = [];
    out.forEach(tok => {
      if (tok.t === "num") st.push(tok.v);
      else if (tok.t === "fn") {
        const a = st.pop();
        if (a == null) throw new Error("bad");
        const rad = a * (Math.PI / 180);
        if (tok.v === "sin") st.push(Math.sin(rad));
        if (tok.v === "cos") st.push(Math.cos(rad));
        if (tok.v === "tan") st.push(Math.tan(rad));
        if (tok.v === "sqrt") { if (a < 0) throw new Error("sqrt"); st.push(Math.sqrt(a)); }
      } else {
        const b = st.pop(), a = st.pop();
        if (a == null || b == null) throw new Error("bad");
        if (tok.v === "+") st.push(a + b);
        if (tok.v === "-") st.push(a - b);
        if (tok.v === "*") st.push(a * b);
        if (tok.v === "/") { if (b === 0) throw new Error("div0"); st.push(a / b); }
        if (tok.v === "%") st.push(a % b);
        if (tok.v === "^") st.push(a ** b);
      }
    });
    if (st.length !== 1 || Number.isNaN(st[0])) throw new Error("invalid");
    return Number(st[0].toFixed(10));
  }

  function renderAnalytics() {
    const el = document.getElementById("analytics");
    const quizzes = state.quizzes.length;
    const avgQuiz = quizzes ? Math.round(state.quizzes.reduce((a, q) => a + q.percent, 0) / quizzes) : 0;
    const streak = calcStreak();
    const totalTasksDone = state.tasks.filter(t => t.done).length;
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      const mins = state.focus.sessions.filter(s => s.date === key).reduce((a, s) => a + s.minutes, 0);
      return { day: d.toLocaleDateString(undefined, { weekday: "short" }), mins };
    });
    const maxW = Math.max(1, ...weekly.map(w => w.mins));
    const subProg = Object.entries(state.progress).map(([k, v]) => ({ k, p: v.total ? Math.round((v.done / v.total) * 100) : 0 }));

    el.innerHTML = `<div class="card panel"><h2 class="h1">Analytics</h2>
      <div class="grid cols-3"><div>Total study time<br><strong>${state.focus.totalMinutes} min</strong></div><div>Tasks completed<br><strong>${totalTasksDone}</strong></div><div>Focus sessions<br><strong>${state.focus.sessions.length}</strong></div><div>Quizzes completed<br><strong>${quizzes}</strong></div><div>Average quiz score<br><strong>${avgQuiz}%</strong></div><div>Current streak<br><strong>${streak}</strong></div></div>
      <p>Longest streak: <strong>${streak}</strong></p></div>
      <div class="grid cols-2">
        <div class="card panel"><h3 class="h2">Weekly Study Activity</h3><svg viewBox="0 0 320 170" style="width:100%;height:180px">${weekly.map((w, i) => {
          const h = (w.mins / maxW) * 120;
          const x = 20 + i * 42;
          return `<rect x="${x}" y="${140 - h}" width="26" height="${h}" fill="var(--accent)"/><text x="${x}" y="155" fill="var(--muted)" font-size="10">${w.day}</text><text x="${x}" y="${130 - h}" fill="var(--muted)" font-size="10">${w.mins}</text>`;
        }).join("")}</svg></div>
        <div class="card panel"><h3 class="h2">Subject Progress</h3>${subProg.map(s => `<div class="item">${sanitize(s.k)} ${s.p}%<div class="progress"><div style="width:${s.p}%"></div></div></div>`).join("")}</div>
      </div>
      <div class="card panel"><h3 class="h2">Quiz Accuracy</h3><div class="progress"><div style="width:${avgQuiz}%"></div></div><p>${avgQuiz}%</p></div>
      <div class="card panel"><h3 class="h2">Productivity Streak</h3><p>${streak} active day(s)</p></div>`;
  }

  const ACHIEVEMENTS = [
    ["first_task", "🔥 First Task", s => s.tasks.filter(t => t.done).length >= 1, s => Math.min(1, s.tasks.filter(t => t.done).length)],
    ["streak_3", "🔥 3-Day Streak", s => calcStreak() >= 3, () => Math.min(3, calcStreak()) / 3],
    ["streak_7", "🔥 7-Day Streak", s => calcStreak() >= 7, () => Math.min(7, calcStreak()) / 7],
    ["tasks_10", "📚 10 Tasks Completed", s => s.tasks.filter(t => t.done).length >= 10, s => Math.min(10, s.tasks.filter(t => t.done).length) / 10],
    ["tasks_50", "📚 50 Tasks Completed", s => s.tasks.filter(t => t.done).length >= 50, s => Math.min(50, s.tasks.filter(t => t.done).length) / 50],
    ["quiz_1", "🧠 First Quiz", s => s.quizzes.length >= 1, s => Math.min(1, s.quizzes.length)],
    ["quiz_5", "🧠 5 Quizzes Completed", s => s.quizzes.length >= 5, s => Math.min(5, s.quizzes.length) / 5],
    ["focus_5", "⏱️ 5 Focus Sessions", s => s.focus.sessions.length >= 5, s => Math.min(5, s.focus.sessions.length) / 5],
    ["quiz_90", "🏆 90% Quiz Accuracy", s => s.quizzes.some(q => q.percent >= 90), s => (Math.max(0, ...s.quizzes.map(q => q.percent)) / 90)],
    ["code_1", "💻 First Code Project", s => s.projects.length >= 1, s => Math.min(1, s.projects.length)],
    ["notes_10", "📝 10 Notes Created", s => s.notes.length >= 10, s => Math.min(10, s.notes.length) / 10]
  ];
  function checkAchievements() {
    ACHIEVEMENTS.forEach(([id, title, test]) => {
      if (test(state) && !state.achievements[id]) {
        state.achievements[id] = { unlockedAt: new Date().toISOString(), title };
        addActivity("achievement", `Achievement unlocked: ${title}`);
        toast(`Unlocked: ${title}`);
      }
    });
    persist();
  }
  function renderAchievements() {
    const el = document.getElementById("achievements");
    const cards = ACHIEVEMENTS.map(([id, title, test, prog]) => {
      const unlocked = !!state.achievements[id];
      const p = Math.max(0, Math.min(1, prog(state) || 0));
      return `<div class="item"><strong>${sanitize(title)}</strong><div class="muted">${unlocked ? `Unlocked ${new Date(state.achievements[id].unlockedAt).toLocaleDateString()}` : "Locked"}</div><div class="progress"><div style="width:${Math.round(p * 100)}%"></div></div></div>`;
    }).join("");
    el.innerHTML = `<div class="card panel"><h2 class="h1">Achievements</h2>${cards || `<p class="muted">Your journey starts here.</p>`}</div>`;
  }

  function editNameModal() {
    modal("Student Name", `<input id="studentNameInput" value="${sanitize(state.user.name)}"><button class="btn primary" id="saveNameBtn" style="margin-top:8px">Save</button>`);
    document.getElementById("saveNameBtn").onclick = () => {
      const name = document.getElementById("studentNameInput").value.trim();
      if (!name) return toast("Name required");
      state.user.name = name; persist(); document.getElementById("modalRoot").innerHTML = ""; renderAll();
    };
  }
  function subjectProgressModal(sub) {
    const p = state.progress[sub] || { done: 0, total: 0 };
    modal(`Update ${sub}`, `<div class="row"><input id="spDone" type="number" min="0" value="${p.done}"><input id="spTotal" type="number" min="0" value="${p.total}"></div><button class="btn primary" id="spSave" style="margin-top:8px">Save</button>`);
    document.getElementById("spSave").onclick = () => {
      const done = Number(document.getElementById("spDone").value || 0);
      const total = Number(document.getElementById("spTotal").value || 0);
      if (done < 0 || total < 0 || done > total) return toast("Invalid values");
      state.progress[sub] = { done, total }; persist(); document.getElementById("modalRoot").innerHTML = ""; renderAll();
    };
  }

  function exportData() {
    const data = {};
    Object.entries(STORAGE_KEYS).forEach(([k, v]) => data[v] = state[k]);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bilzzard-backup.json"; a.click();
    toast("Backup exported ✓");
  }
  function validateImport(obj) {
    return obj && Object.values(STORAGE_KEYS).every(k => k in obj);
  }
  function importData(file) {
    const fr = new FileReader();
    fr.onload = () => {
      let parsed;
      try { parsed = JSON.parse(fr.result); } catch { return toast("Invalid JSON"); }
      if (!validateImport(parsed)) return toast("Invalid imported data");
      confirmModal("Import backup", "Replace current data with imported backup?", "Import", () => {
        Object.entries(STORAGE_KEYS).forEach(([k, key]) => {
          state[k] = parsed[key];
          setLocal(key, parsed[key]);
        });
        persist(); renderAll(); toast("Data imported ✓");
      });
    };
    fr.readAsText(file);
  }

  function renderSettings() {
    const el = document.getElementById("settings");
    el.innerHTML = `<div class="card panel"><h2 class="h1">Settings</h2>
      <div class="grid cols-2"><div><h3 class="h2">Profile</h3><input id="setName" value="${sanitize(state.user.name)}"><button class="btn" id="saveProfile">Save profile</button></div>
      <div><h3 class="h2">Appearance</h3><select id="setTheme"><option value="dark">Dark mode</option><option value="light">Light mode</option></select><input id="setAccent" type="color" value="${sanitize(state.settings.accent || "#6f8dff")}"><button class="btn" id="saveAppearance">Save appearance</button></div>
      <div><h3 class="h2">Timer</h3><div class="row"><input id="setFocus" type="number" min="1" value="${state.settings.focusMinutes}"><input id="setBreak" type="number" min="1" value="${state.settings.breakMinutes}"></div><button class="btn" id="saveTimer">Save timer</button></div>
      <div><h3 class="h2">Notifications</h3><label><input id="setNotif" type="checkbox" ${state.settings.notifications ? "checked" : ""}> Enable browser notifications</label><button class="btn" id="saveNotif">Save notifications</button></div></div>
      <h3 class="h2">Data</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="exportBtn">Export data</button><label class="btn">Import data <input id="importInput" type="file" accept="application/json" style="display:none"></label><button class="btn danger" id="resetBtn">Reset all data</button></div>
    </div>`;
    document.getElementById("setTheme").value = state.settings.theme;
    document.getElementById("saveProfile").onclick = () => {
      const name = document.getElementById("setName").value.trim();
      if (!name) return toast("Name required");
      state.user.name = name; persist(); renderAll();
    };
    document.getElementById("saveAppearance").onclick = () => {
      state.settings.theme = document.getElementById("setTheme").value;
      state.settings.accent = document.getElementById("setAccent").value;
      persist(); renderAll();
    };
    document.getElementById("saveTimer").onclick = () => {
      const fm = Number(document.getElementById("setFocus").value); const bm = Number(document.getElementById("setBreak").value);
      if (fm < 1 || bm < 1) return toast("Invalid timer values");
      state.settings.focusMinutes = fm; state.settings.breakMinutes = bm; persist(); resetTimer();
    };
    document.getElementById("saveNotif").onclick = async () => {
      state.settings.notifications = document.getElementById("setNotif").checked;
      if (state.settings.notifications && "Notification" in window && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
      persist();
    };
    document.getElementById("exportBtn").onclick = exportData;
    document.getElementById("importInput").onchange = e => { const f = e.target.files[0]; if (f) importData(f); };
    document.getElementById("resetBtn").onclick = () => confirmModal("Reset data", "This will clear all BILZZARD data.", "Reset", () => {
      Object.keys(defaults).forEach(k => state[k] = JSON.parse(JSON.stringify(defaults[k])));
      persist(); renderAll(); toast("Data reset ✓");
    });
  }

  function renderAbout() {
    const el = document.getElementById("about");
    el.innerHTML = `<div class="card panel"><h2 class="h1">BILZZARD</h2><p class="muted">Student Command Center</p><p>Study. Build. Track. Achieve.</p><p>“BILZZARD is a browser-based student productivity workspace designed to bring planning, studying, coding, quizzes, notes and progress tracking into one place.”</p><p><strong>Made by Ayush Chandra</strong></p></div>`;
  }

  function applyTheme() {
    document.body.dataset.theme = state.settings.theme;
    document.documentElement.style.setProperty("--accent", state.settings.accent || "#6f8dff");
  }

  function renderSection(id) {
    if (id === "dashboard") renderDashboard();
    if (id === "planner") renderPlanner();
    if (id === "focus") renderFocus();
    if (id === "notes") renderNotes();
    if (id === "quiz") renderQuiz();
    if (id === "formula") renderFormula();
    if (id === "codelab") renderCodeLab();
    if (id === "calculator") renderCalculator();
    if (id === "analytics") renderAnalytics();
    if (id === "achievements") renderAchievements();
    if (id === "settings") renderSettings();
    if (id === "about") renderAbout();
  }
  function renderAll() {
    applyTheme();
    buildNav();
    renderSection(currentSection);
  }

  function notify(text) {
    if (!state.settings.notifications || !("Notification" in window)) return;
    if (Notification.permission === "granted") new Notification(text);
  }

  function openGlobalSearch() {
    const formulas = FORMULAS;
    const projects = state.projects;
    const quizCats = [...new Set(QUIZ_BANK.map(q => q.category))].map(c => ({ type: "quiz", id: c, title: c }));
    modal("Global Search", `<input id="globalSearchInput" placeholder="Search notes, tasks, formulas, quiz categories, projects"><div id="globalSearchResults" class="search-modal-results" style="margin-top:8px"></div>`);
    const input = document.getElementById("globalSearchInput");
    const draw = () => {
      const q = input.value.toLowerCase();
      const results = [];
      state.notes.filter(n => `${n.title} ${n.content}`.toLowerCase().includes(q)).forEach(n => results.push({ type: "notes", id: n.id, title: `Note: ${n.title}` }));
      state.tasks.filter(t => `${t.name} ${t.topic}`.toLowerCase().includes(q)).forEach(t => results.push({ type: "planner", id: t.id, title: `Task: ${t.name}` }));
      formulas.filter(f => `${f.formula} ${f.main} ${f.sub}`.toLowerCase().includes(q)).forEach(f => results.push({ type: "formula", id: f.id, title: `Formula: ${f.sub}` }));
      quizCats.filter(c => c.title.toLowerCase().includes(q)).forEach(c => results.push({ type: "quiz", id: c.id, title: `Quiz: ${c.title}` }));
      projects.filter(p => (p.name || "").toLowerCase().includes(q)).forEach(p => results.push({ type: "codelab", id: p.id, title: `Project: ${p.name}` }));
      const wrap = document.getElementById("globalSearchResults");
      wrap.innerHTML = results.length ? results.slice(0, 30).map(r => `<button class="btn" style="text-align:left" data-go-search="${r.type}">${sanitize(r.title)}</button>`).join("") : `<p class="muted">No results</p>`;
      wrap.querySelectorAll("[data-go-search]").forEach(b => b.onclick = () => {
        document.getElementById("modalRoot").innerHTML = "";
        goto(b.dataset.goSearch);
      });
    };
    input.oninput = draw;
    draw();
    input.focus();
  }

  function setupKeys() {
    document.addEventListener("keydown", e => {
      const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); openGlobalSearch(); }
      if (e.ctrlKey && e.key.toLowerCase() === "n") { e.preventDefault(); noteModal(); }
      if (e.ctrlKey && e.key.toLowerCase() === "t") { e.preventDefault(); taskModal(); }
      if (e.key === "Escape") document.getElementById("modalRoot").innerHTML = "";
      if (e.key === " " && currentSection === "focus" && !inField) { e.preventDefault(); if (timer.running) pauseTimer(); else startTimer(); }
    });
  }

  function initPwa() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  document.getElementById("menuBtn").onclick = () => document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("globalSearchBtn").onclick = openGlobalSearch;
  setupKeys();
  initPwa();
  checkAchievements();
  renderAll();
})();
