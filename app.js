const STORE_KEY = "qa-command-center-v1";
const sampleState = {
  selectedProjectId: "proj-client-portal",
  projects: [
    { id: "proj-client-portal", name: "Client Portal Upgrade", environment: "Staging" },
    { id: "proj-erp", name: "ERP Customization", environment: "QA" }
  ],
  cases: [
    { id: "case-login", projectId: "proj-client-portal", title: "Client signs in with valid credentials", area: "Authentication", type: "Functional", priority: "Critical", status: "Ready", steps: "1. Open the sign in page\n2. Enter a registered email and valid password\n3. Submit the form", expected: "The client lands on the dashboard and sees their account summary." },
    { id: "case-reset", projectId: "proj-client-portal", title: "Password reset link expires after use", area: "Authentication", type: "Security", priority: "High", status: "Ready", steps: "1. Request a password reset\n2. Use the reset link once\n3. Try to open the same link again", expected: "The second attempt is rejected and a new reset request is required." },
    { id: "case-invoice", projectId: "proj-client-portal", title: "Invoice PDF downloads from billing history", area: "Billing", type: "Regression", priority: "High", status: "Ready", steps: "1. Open Billing History\n2. Select an issued invoice\n3. Download the PDF", expected: "A readable invoice PDF downloads with the correct client, total, and tax values." },
    { id: "case-profile", projectId: "proj-client-portal", title: "Profile update validates required fields", area: "Profile", type: "Functional", priority: "Medium", status: "Draft", steps: "1. Open Profile Settings\n2. Clear required fields\n3. Save changes", expected: "Inline validation appears and no incomplete data is saved." },
    { id: "case-order-sync", projectId: "proj-erp", title: "Approved order syncs to ERP queue", area: "Orders", type: "Integration", priority: "Critical", status: "Ready", steps: "1. Approve a pending order\n2. Trigger ERP sync\n3. Open the integration queue", expected: "The order appears in the queue with mapped customer, SKU, quantity, and amount." }
  ],
  runs: [
    { id: "run-smoke", projectId: "proj-client-portal", name: "Portal smoke run", createdAt: new Date().toISOString(), caseIds: ["case-login", "case-reset", "case-invoice"], results: { "case-login": { status: "Passed", notes: "" }, "case-reset": { status: "Blocked", notes: "Mail service unavailable" }, "case-invoice": { status: "Failed", notes: "Tax value mismatch" } } }
  ],
  defects: [
    { id: "bug-tax", projectId: "proj-client-portal", summary: "Invoice PDF shows incorrect tax total", severity: "High", status: "Open", caseId: "case-invoice", actual: "Downloaded PDF shows 6 percent tax while billing page shows 8 percent.", environment: "Chrome, Staging" },
    { id: "bug-email", projectId: "proj-client-portal", summary: "Reset email delivery is delayed", severity: "Medium", status: "In Progress", caseId: "case-reset", actual: "Reset email arrives after more than 15 minutes.", environment: "Staging mail service" }
  ],
  suggestions: []
};
let state = loadState();
let currentView = "dashboard";
let selectedRunId = state.runs[0]?.id || null;
let lastParsedRequirements = [];
const $ = (id) => document.getElementById(id);
const views = {
  dashboard: { title: "Dashboard", eyebrow: "Quality operations", el: $("dashboardView") },
  cases: { title: "Test Cases", eyebrow: "Test design", el: $("casesView") },
  runs: { title: "Test Runs", eyebrow: "Execution", el: $("runsView") },
  defects: { title: "Defects", eyebrow: "Issue tracking", el: $("defectsView") },
  agent: { title: "QA Agent", eyebrow: "Requirement analysis", el: $("agentView") },
  live: { title: "Live Agent", eyebrow: "Automation runner", el: $("liveView") }
};
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return clone(sampleState);
    const parsed = JSON.parse(saved);
    return { ...clone(sampleState), ...parsed, suggestions: parsed.suggestions || [] };
  } catch (error) { return clone(sampleState); }
}
function saveState(message) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  if (message) toast(message);
}
function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`; }
function activeProject() { return state.projects.find((project) => project.id === state.selectedProjectId) || state.projects[0]; }
function projectCases() { return state.cases.filter((item) => item.projectId === state.selectedProjectId); }
function projectRuns() { return state.runs.filter((item) => item.projectId === state.selectedProjectId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function projectDefects() { return state.defects.filter((item) => item.projectId === state.selectedProjectId); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function pillClass(value) {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, "-");
  if (normalized === "critical" || normalized === "failed" || normalized === "open") return "pill-critical";
  if (normalized === "high" || normalized === "blocked" || normalized === "in-progress") return "pill-high";
  if (normalized === "medium" || normalized === "ready-for-retest") return "pill-medium";
  if (normalized === "low" || normalized === "passed" || normalized === "ready" || normalized === "closed") return "pill-low";
  return "pill-draft";
}
function renderAll() { renderProjectSelect(); renderDashboard(); renderCases(); renderRuns(); renderDefects(); renderAgent(); renderLiveAgent(); }
function renderProjectSelect() {
  $("projectSelect").innerHTML = state.projects.map((project) => `<option value="${project.id}" ${project.id === state.selectedProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
  $("activeProjectName").textContent = activeProject()?.name || "Project";
}
function renderDashboard() {
  const cases = projectCases();
  const runs = projectRuns();
  const defects = projectDefects();
  const openDefects = defects.filter((bug) => bug.status !== "Closed");
  const latestRun = runs[0];
  const latestResults = latestRun ? Object.values(latestRun.results) : [];
  const passed = latestResults.filter((result) => result.status === "Passed").length;
  const passRate = latestResults.length ? Math.round((passed / latestResults.length) * 100) : 0;
  const ready = cases.filter((test) => test.status === "Ready").length;
  const criticalOpen = openDefects.filter((bug) => bug.severity === "Critical").length;
  const readiness = Math.max(0, Math.min(100, Math.round((cases.length ? (ready / cases.length) * 35 : 0) + (passRate * 0.45) + (criticalOpen ? 0 : 20))));
  $("metricGrid").innerHTML = [[cases.length, "Test cases"], [runs.length, "Runs"], [`${passRate}%`, "Latest pass rate"], [openDefects.length, "Open defects"]].map(([value, label]) => `<article class="metric-card"><div class="metric-value">${value}</div><div class="metric-label">${label}</div></article>`).join("");
  $("scoreRing").style.setProperty("--score", `${readiness}%`);
  $("scoreRing").querySelector("span").textContent = `${readiness}%`;
  $("readinessPill").textContent = readiness >= 80 ? "Strong" : readiness >= 55 ? "Watch" : "Risk";
  $("readinessPill").className = `status-pill ${readiness >= 80 ? "pill-low" : readiness >= 55 ? "pill-medium" : "pill-critical"}`;
  $("readinessList").innerHTML = [["Ready cases", `${ready}/${cases.length || 0}`], ["Latest run pass rate", `${passRate}%`], ["Critical open defects", criticalOpen], ["Execution coverage", `${latestRun ? latestRun.caseIds.length : 0}/${cases.length || 0}`]].map(([label, value]) => `<div class="readiness-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
  const severityCounts = ["Critical", "High", "Medium", "Low"].map((severity) => ({ severity, count: openDefects.filter((bug) => bug.severity === severity).length }));
  const maxSeverity = Math.max(1, ...severityCounts.map((item) => item.count));
  $("defectPressureLabel").textContent = `${openDefects.length} open defects`;
  $("defectBars").innerHTML = severityCounts.map((item) => `<div class="bar-row"><span>${item.severity}</span><div class="bar-track"><div class="bar-fill" style="width:${(item.count / maxSeverity) * 100}%"></div></div><strong>${item.count}</strong></div>`).join("");
  const queue = cases.filter((test) => ["Critical", "High"].includes(test.priority)).slice(0, 8);
  $("regressionRows").innerHTML = queue.length ? queue.map((test) => `<tr><td>${escapeHtml(test.title)}</td><td>${escapeHtml(test.area)}</td><td><span class="pill ${pillClass(test.priority)}">${test.priority}</span></td><td><span class="pill ${pillClass(test.status)}">${test.status}</span></td><td>${lastResultForCase(test.id)}</td></tr>`).join("") : `<tr><td colspan="5">No high-priority cases yet.</td></tr>`;
}
function lastResultForCase(caseId) {
  const run = projectRuns().find((item) => item.results[caseId]);
  if (!run) return `<span class="pill pill-untested">Untested</span>`;
  const status = run.results[caseId].status || "Untested";
  return `<span class="pill ${pillClass(status)}">${status}</span>`;
}
function renderCases() {
  const query = $("caseSearch").value.trim().toLowerCase();
  const priority = $("casePriorityFilter").value;
  const status = $("caseStatusFilter").value;
  const cases = projectCases().filter((test) => {
    const matchesQuery = !query || [test.title, test.area, test.type, test.steps, test.expected].join(" ").toLowerCase().includes(query);
    return matchesQuery && (priority === "all" || test.priority === priority) && (status === "all" || test.status === status);
  });
  $("caseCount").textContent = `${cases.length} cases`;
  $("caseList").innerHTML = cases.length ? cases.map((test) => `<article class="case-card" data-id="${test.id}"><div class="card-top"><p class="card-title">${escapeHtml(test.title)}</p><div class="card-actions"><button class="icon-button edit-case" title="Edit" aria-label="Edit"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button delete-case" title="Delete" aria-label="Delete"><svg><use href="#icon-trash"></use></svg></button></div></div><div class="meta-row"><span class="pill ${pillClass(test.priority)}">${test.priority}</span><span class="pill ${pillClass(test.status)}">${test.status}</span><span class="muted">${escapeHtml(test.area)} - ${escapeHtml(test.type)}</span>${test.requirementId ? `<span class="pill pill-draft" title="${escapeHtml(test.requirementText || "")}">${escapeHtml(test.requirementId)}</span>` : ""}</div><p class="muted">${escapeHtml(test.expected)}</p></article>`).join("") : `<div class="empty-state">No matching test cases.</div>`;
  renderCaseOptions();
  renderRunCasePicker();
}
function renderCaseOptions() {
  const options = [`<option value="">Unlinked</option>`].concat(projectCases().map((test) => `<option value="${test.id}">${escapeHtml(test.title)}</option>`));
  $("defectCase").innerHTML = options.join("");
}
function resetCaseForm() {
  $("caseForm").reset();
  $("caseId").value = "";
  $("caseFormTitle").textContent = "New Test Case";
  $("deleteCaseBtn").classList.add("hidden");
  $("casePriority").value = "Medium";
  $("caseStatus").value = "Ready";
}
function fillCaseForm(id) {
  const test = state.cases.find((item) => item.id === id);
  if (!test) return;
  $("caseId").value = test.id;
  $("caseTitle").value = test.title;
  $("caseArea").value = test.area;
  $("caseType").value = test.type;
  $("casePriority").value = test.priority;
  $("caseStatus").value = test.status;
  $("caseSteps").value = test.steps;
  $("caseExpected").value = test.expected;
  $("caseFormTitle").textContent = "Edit Test Case";
  $("deleteCaseBtn").classList.remove("hidden");
  document.querySelectorAll(".case-card").forEach((card) => card.classList.toggle("selected", card.dataset.id === id));
}
function saveCase(event) {
  event.preventDefault();
  const id = $("caseId").value || uid("case");
  const test = { id, projectId: state.selectedProjectId, title: $("caseTitle").value.trim(), area: $("caseArea").value.trim(), type: $("caseType").value, priority: $("casePriority").value, status: $("caseStatus").value, steps: $("caseSteps").value.trim(), expected: $("caseExpected").value.trim() };
  const index = state.cases.findIndex((item) => item.id === id);
  if (index >= 0) state.cases[index] = test;
  else state.cases.push(test);
  saveState("Test case saved");
  resetCaseForm();
  renderAll();
}
function deleteCase(id = $("caseId").value) {
  if (!id) return;
  const test = state.cases.find((item) => item.id === id);
  if (!test || !confirm(`Delete "${test.title}"?`)) return;
  state.cases = state.cases.filter((item) => item.id !== id);
  state.runs.forEach((run) => {
    run.caseIds = run.caseIds.filter((caseId) => caseId !== id);
    delete run.results[id];
  });
  state.defects.forEach((bug) => { if (bug.caseId === id) bug.caseId = ""; });
  saveState("Test case deleted");
  resetCaseForm();
  renderAll();
}
function renderRunCasePicker() {
  const cases = projectCases();
  $("runCasePicker").innerHTML = cases.length ? cases.map((test) => `<label class="check-row"><input type="checkbox" value="${test.id}" ${test.status === "Ready" ? "checked" : ""}><span>${escapeHtml(test.title)}</span></label>`).join("") : `<div class="empty-state">Add test cases first.</div>`;
}
function renderRuns() {
  const runs = projectRuns();
  if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) selectedRunId = runs[0]?.id || null;
  $("runCount").textContent = `${runs.length} runs`;
  $("runList").innerHTML = runs.length ? runs.map((run) => {
    const total = run.caseIds.length;
    const passed = Object.values(run.results).filter((result) => result.status === "Passed").length;
    const failed = Object.values(run.results).filter((result) => result.status === "Failed").length;
    return `<article class="run-card ${run.id === selectedRunId ? "selected" : ""}" data-id="${run.id}"><div class="card-top"><p class="card-title">${escapeHtml(run.name)}</p><button class="icon-button delete-run" title="Delete" aria-label="Delete"><svg><use href="#icon-trash"></use></svg></button></div><div class="meta-row"><span class="pill pill-passed">${passed} passed</span><span class="pill pill-failed">${failed} failed</span><span class="muted">${total} cases - ${new Date(run.createdAt).toLocaleDateString()}</span></div></article>`;
  }).join("") : `<div class="empty-state">No test runs yet.</div>`;
  renderRunDetail();
}
function createRun() {
  const selected = [...$("runCasePicker").querySelectorAll("input:checked")].map((input) => input.value);
  if (!selected.length) return toast("Select at least one case");
  const name = $("runName").value.trim() || `${activeProject().name} run ${new Date().toLocaleDateString()}`;
  const results = Object.fromEntries(selected.map((caseId) => [caseId, { status: "Untested", notes: "" }]));
  const run = { id: uid("run"), projectId: state.selectedProjectId, name, createdAt: new Date().toISOString(), caseIds: selected, results };
  state.runs.push(run);
  selectedRunId = run.id;
  $("runName").value = "";
  saveState("Test run created");
  renderAll();
}
function renderRunDetail() {
  const run = state.runs.find((item) => item.id === selectedRunId);
  if (!run) { $("runDetailTitle").textContent = "Run Results"; $("runDetail").innerHTML = `<div class="empty-state">Create or select a run.</div>`; return; }
  $("runDetailTitle").textContent = run.name;
  $("runDetail").innerHTML = run.caseIds.map((caseId) => {
    const test = state.cases.find((item) => item.id === caseId);
    const result = run.results[caseId] || { status: "Untested", notes: "" };
    return `<div class="result-row" data-case-id="${caseId}"><div><p class="card-title">${escapeHtml(test?.title || "Missing case")}</p><div class="meta-row"><span class="pill ${pillClass(result.status)}">${result.status}</span><span class="muted">${escapeHtml(test?.area || "Unknown area")}</span></div></div><div class="result-controls"><select class="result-status"><option ${result.status === "Untested" ? "selected" : ""}>Untested</option><option ${result.status === "Passed" ? "selected" : ""}>Passed</option><option ${result.status === "Failed" ? "selected" : ""}>Failed</option><option ${result.status === "Blocked" ? "selected" : ""}>Blocked</option></select><input class="result-notes" value="${escapeHtml(result.notes)}" placeholder="Notes" /></div></div>`;
  }).join("");
}
function updateRunResult(caseId, patch) {
  const run = state.runs.find((item) => item.id === selectedRunId);
  if (!run) return;
  run.results[caseId] = { ...(run.results[caseId] || { status: "Untested", notes: "" }), ...patch };
  saveState();
  renderDashboard();
  renderRuns();
}
function deleteRun(id) {
  const run = state.runs.find((item) => item.id === id);
  if (!run || !confirm(`Delete "${run.name}"?`)) return;
  state.runs = state.runs.filter((item) => item.id !== id);
  if (selectedRunId === id) selectedRunId = null;
  saveState("Run deleted");
  renderAll();
}
function renderDefects() {
  const statuses = ["Open", "In Progress", "Ready for Retest", "Closed"];
  const defects = projectDefects();
  $("defectCount").textContent = `${defects.length} defects`;
  $("defectBoard").innerHTML = statuses.map((status) => {
    const items = defects.filter((bug) => bug.status === status);
    return `<section class="kanban-column"><div class="kanban-title"><span>${status}</span><span class="muted">${items.length}</span></div>${items.map((bug) => `<article class="defect-card" data-id="${bug.id}" data-severity="${bug.severity}"><div class="card-top"><p class="card-title">${escapeHtml(bug.summary)}</p><div class="card-actions"><button class="icon-button edit-defect" title="Edit" aria-label="Edit"><svg><use href="#icon-edit"></use></svg></button><button class="icon-button delete-defect" title="Delete" aria-label="Delete"><svg><use href="#icon-trash"></use></svg></button></div></div><div class="meta-row"><span class="pill ${pillClass(bug.severity)}">${bug.severity}</span><span class="muted">${escapeHtml(linkedCaseTitle(bug.caseId))}</span></div></article>`).join("") || `<div class="empty-state">Clear</div>`}</section>`;
  }).join("");
  renderCaseOptions();
}
function linkedCaseTitle(caseId) { return state.cases.find((test) => test.id === caseId)?.title || "Unlinked"; }
function resetDefectForm() {
  $("defectForm").reset();
  $("defectId").value = "";
  $("defectFormTitle").textContent = "Log Defect";
  $("deleteDefectBtn").classList.add("hidden");
  $("defectSeverity").value = "Medium";
  $("defectStatus").value = "Open";
}
function fillDefectForm(id) {
  const bug = state.defects.find((item) => item.id === id);
  if (!bug) return;
  $("defectId").value = bug.id;
  $("defectSummary").value = bug.summary;
  $("defectSeverity").value = bug.severity;
  $("defectStatus").value = bug.status;
  $("defectCase").value = bug.caseId;
  $("defectActual").value = bug.actual;
  $("defectEnv").value = bug.environment;
  $("defectFormTitle").textContent = "Edit Defect";
  $("deleteDefectBtn").classList.remove("hidden");
}
function saveDefect(event) {
  event.preventDefault();
  const id = $("defectId").value || uid("bug");
  const bug = { id, projectId: state.selectedProjectId, summary: $("defectSummary").value.trim(), severity: $("defectSeverity").value, status: $("defectStatus").value, caseId: $("defectCase").value, actual: $("defectActual").value.trim(), environment: $("defectEnv").value.trim() };
  const index = state.defects.findIndex((item) => item.id === id);
  if (index >= 0) state.defects[index] = bug;
  else state.defects.push(bug);
  saveState("Defect saved");
  resetDefectForm();
  renderAll();
}
function deleteDefect(id = $("defectId").value) {
  const bug = state.defects.find((item) => item.id === id);
  if (!bug || !confirm(`Delete "${bug.summary}"?`)) return;
  state.defects = state.defects.filter((item) => item.id !== id);
  saveState("Defect deleted");
  resetDefectForm();
  renderAll();
}
function renderAgent() {
  const project = activeProject();
  if (document.activeElement !== $("businessContext")) $("businessContext").value = project?.businessContext || "";
  if (document.activeElement !== $("agentTargetUrl")) $("agentTargetUrl").value = project?.targetUrl || "";
  $("suggestionList").innerHTML = state.suggestions.length ? state.suggestions.map((test, index) => `<article class="suggestion-card" data-index="${index}"><div class="card-top"><p class="card-title">${escapeHtml(test.title)}</p><button class="icon-button add-suggestion" title="Add" aria-label="Add"><svg><use href="#icon-plus"></use></svg></button></div><div class="meta-row"><span class="pill ${pillClass(test.priority)}">${test.priority}</span><span class="muted">${escapeHtml(test.area)} - ${escapeHtml(test.type)}</span>${test.requirementId ? `<span class="pill pill-draft" title="${escapeHtml(test.requirementText || "")}">${escapeHtml(test.requirementId)}</span>` : ""}</div><p class="muted">${escapeHtml(test.expected)}</p></article>`).join("") : `<div class="empty-state">No generated cases yet.</div>`;
  const cases = projectCases();
  const openDefects = projectDefects().filter((bug) => bug.status !== "Closed");
  const risks = [
    { label: "Critical coverage", score: cases.some((test) => test.priority === "Critical") ? 85 : 25 },
    { label: "Security depth", score: cases.filter((test) => test.type === "Security").length ? 80 : 35 },
    { label: "Open defect load", score: Math.max(10, 100 - openDefects.length * 18) },
    { label: "Review readiness", score: cases.length ? Math.round((cases.filter((test) => test.status === "Ready").length / cases.length) * 100) : 0 }
  ];
  $("riskGrid").innerHTML = risks.map((risk) => `<article class="risk-item"><strong>${risk.label}</strong><div class="risk-meter"><span style="width:${risk.score}%"></span></div><span class="muted">${risk.score}%</span></article>`).join("");
  renderRequirementCoverage();
}
function renderRequirementCoverage() {
  const summaryEl = $("coverageSummary");
  const listEl = $("coverageList");
  if (!lastParsedRequirements.length) {
    summaryEl.textContent = "No PRD parsed yet";
    listEl.innerHTML = `<div class="empty-state">Paste text or import a PRD/ticket, then click Generate to see per-requirement coverage.</div>`;
    return;
  }
  const cases = projectCases();
  const rows = lastParsedRequirements.map((req) => {
    const linkedCases = cases.filter((test) => test.requirementId === req.id);
    const pendingSuggestions = state.suggestions.filter((item) => item.requirementId === req.id);
    const status = linkedCases.length ? "Covered" : pendingSuggestions.length ? "Suggested" : "Gap";
    const cls = linkedCases.length ? "pill-low" : pendingSuggestions.length ? "pill-medium" : "pill-critical";
    const snippet = req.text.length > 130 ? `${req.text.slice(0, 130)}...` : req.text;
    const detail = linkedCases.length ? `${linkedCases.length} linked case${linkedCases.length === 1 ? "" : "s"}` : pendingSuggestions.length ? `${pendingSuggestions.length} suggestion${pendingSuggestions.length === 1 ? "" : "s"} ready to add` : "No test case yet";
    return `<article class="suggestion-card"><div class="card-top"><p class="card-title">${escapeHtml(req.id)}</p><span class="pill ${cls}">${status}</span></div><p class="muted">${escapeHtml(snippet)}</p><span class="muted">${detail}</span></article>`;
  }).join("");
  listEl.innerHTML = rows;
  const gapCount = lastParsedRequirements.filter((req) => !cases.some((test) => test.requirementId === req.id)).length;
  summaryEl.textContent = `${lastParsedRequirements.length} requirement${lastParsedRequirements.length === 1 ? "" : "s"} parsed - ${gapCount} gap${gapCount === 1 ? "" : "s"}`;
}
function parseRequirements(text) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^[-*\u2022]\s*|^\d+[.)]\s*/, "").trim()).filter(Boolean);
  const meaningfulLines = lines.filter((line) => !/^#+\s/.test(line) && line.length > 3);
  const seeds = meaningfulLines.length > 1 ? meaningfulLines : text.split(/[.\n;]+/).map((item) => item.trim()).filter((item) => item.length > 3);
  const finalSeeds = seeds.length ? seeds : [text.trim()];
  return finalSeeds.map((item, index) => ({ id: `REQ-${index + 1}`, text: item }));
}
function normalizeWords(value) {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 3));
}
function textSimilarity(a, b) {
  const wordsA = normalizeWords(a);
  const wordsB = normalizeWords(b);
  if (!wordsA.size || !wordsB.size) return 0;
  let overlap = 0;
  wordsA.forEach((word) => { if (wordsB.has(word)) overlap += 1; });
  return overlap / Math.min(wordsA.size, wordsB.size);
}
function isCoveredByExistingCase(suggestion) {
  return projectCases().some((test) => (test.area === suggestion.area && test.type === suggestion.type) || textSimilarity(test.title, suggestion.title) >= 0.6);
}
function generateSuggestions() {
  const text = $("requirementText").value.trim();
  if (!text) return toast("Add or import requirement text");
  const includeNegative = $("includeNegative").checked;
  const includeSecurity = $("includeSecurity").checked;
  const coverageGapMode = $("coverageGapMode").checked;
  const depth = $("agentDepth").value;
  const requirements = parseRequirements(text);
  const limit = depth === "lean" ? 4 : depth === "deep" ? 12 : 8;
  const seeds = requirements.slice(0, limit);
  lastParsedRequirements = requirements;
  const businessContext = $("businessContext").value.trim();
  const generated = [];
  seeds.forEach((req) => {
    const contextual = `${businessContext} ${req.text}`;
    const area = inferArea(contextual);
    generated.push({ title: `${area} works for a valid user path`, area, type: "Functional", priority: inferPriority(contextual), status: "Ready", steps: `1. Open the ${area.toLowerCase()} workflow\n2. Complete the expected user action\n3. Review the saved or displayed result`, expected: `The ${area.toLowerCase()} workflow completes successfully and shows accurate data.`, requirementId: req.id, requirementText: req.text });
    if (includeNegative) generated.push({ title: `${area} handles invalid or missing input`, area, type: "Regression", priority: "High", status: "Ready", steps: `1. Open the ${area.toLowerCase()} workflow\n2. Submit missing, duplicate, or invalid data\n3. Review validation and saved records`, expected: "The system blocks invalid data, explains the issue, and keeps existing records unchanged.", requirementId: req.id, requirementText: req.text });
  });
  if (includeSecurity) {
    generated.push({ title: "Unauthorized user cannot access protected pages", area: "Access Control", type: "Security", priority: "Critical", status: "Ready", steps: "1. Sign out\n2. Open protected URLs directly\n3. Repeat as a lower-permission user", expected: "Protected pages redirect or deny access without exposing private data.", requirementId: "REQ-SEC", requirementText: "Security baseline (not tied to a specific requirement line)" });
    generated.push({ title: "Sensitive exports respect user permissions", area: "Reporting", type: "Security", priority: "High", status: "Ready", steps: "1. Sign in as a restricted user\n2. Attempt to export sensitive records\n3. Compare against allowed permissions", expected: "Only authorized data is exported and restricted fields are hidden.", requirementId: "REQ-SEC", requirementText: "Security baseline (not tied to a specific requirement line)" });
  }
  let finalSuggestions = generated.slice(0, limit + 4);
  if (coverageGapMode) {
    const before = finalSuggestions.length;
    finalSuggestions = finalSuggestions.filter((item) => !isCoveredByExistingCase(item));
    if (!finalSuggestions.length) { toast(before ? "No gaps found - existing cases already cover this" : "No suggestions to check"); }
  }
  state.suggestions = finalSuggestions;
  saveState(coverageGapMode ? "Coverage gaps generated" : "Cases generated");
  renderAgent();
}
function inferArea(text) {
  const lower = text.toLowerCase();
  if (/login|sign in|password|auth|account/.test(lower)) return "Authentication";
  if (/invoice|billing|payment|subscription|tax|checkout|cart|order(?!s sync)/.test(lower)) return "Billing";
  if (/export|report|analytics|dashboard/.test(lower)) return "Reporting";
  if (/profile|user|client|customer/.test(lower)) return "Profile";
  if (/admin|role|permission|suspend/.test(lower)) return "Administration";
  if (/api|sync|integration|erp/.test(lower)) return "Integration";
  if (/book|appointment|reservation|schedule|calendar/.test(lower)) return "Booking";
  if (/search|filter|listing|directory|catalog|map|location/.test(lower)) return "Search & Listings";
  if (/review|rating|comment|feedback/.test(lower)) return "Reviews";
  if (/chat|message|inbox|notification|email/.test(lower)) return "Messaging";
  if (/upload|image|photo|gallery|media/.test(lower)) return "Media";
  return "Core Workflow";
}
function inferPriority(text) {
  const lower = text.toLowerCase();
  if (/payment|password|admin|permission|security|invoice|critical|checkout|booking confirm/.test(lower)) return "Critical";
  if (/export|sync|email|client|customer|book|reservation/.test(lower)) return "High";
  return "Medium";
}
function addSuggestion(index) {
  const suggestion = state.suggestions[index];
  if (!suggestion) return;
  state.cases.push({ ...suggestion, id: uid("case"), projectId: state.selectedProjectId });
  state.suggestions.splice(index, 1);
  saveState("Generated case added");
  renderAll();
}
function addAllSuggestions() {
  if (!state.suggestions.length) return toast("Generate cases first");
  state.suggestions.forEach((suggestion) => state.cases.push({ ...suggestion, id: uid("case"), projectId: state.selectedProjectId }));
  state.suggestions = [];
  saveState("Generated cases added");
  renderAll();
}
function importPrdFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result || "").trim();
    if (!content) return toast("That file looked empty");
    $("requirementText").value = content;
    $("prdFileName").textContent = `Loaded from ${file.name}`;
    toast("PRD/ticket imported - click Generate to analyze it");
  };
  reader.onerror = () => toast("Could not read that file");
  reader.readAsText(file);
}
function liveAgentCommand() {
  const url = $("liveUrl")?.value.trim() || "https://example.com";
  const rawPages = ($("livePages")?.value || "12").trim().toLowerCase();
  const pages = rawPages === "all" || rawPages === "0" ? "all" : Math.max(1, Math.min(500, Number(rawPages) || 12));
  const agentType = $("liveAgentType")?.value || "smoke";
  const scriptPath = agentType === "auth" ? "live-qa-agent-auth.mjs" : "live-qa-agent.mjs";
  return `node "C:\\Users\\rafid\\OneDrive\\Documents\\Web Testing\\${scriptPath}" ${url} ${pages}`;
}
function renderLiveAgent() {
  if (!$("liveCommand")) return;
  const project = activeProject();
  if (project?.targetUrl && document.activeElement !== $("liveUrl")) $("liveUrl").value = project.targetUrl;
  $("liveCommand").value = liveAgentCommand();
  const context = activeProject()?.businessContext;
  $("liveContextNote").textContent = context ? context : "Add a Business / App Context note on the QA Agent tab so checks here are easier to interpret.";
  $("liveContextNote").classList.toggle("empty-state", !context);
  if (!$("liveReportSummary").innerHTML.trim()) {
    $("liveReportSummary").innerHTML = `<div class="empty-state">Run the command, then load qa-live-report.json here.</div>`;
  }
}
async function copyLiveCommand() {
  const command = liveAgentCommand();
  $("liveCommand").value = command;
  try {
    await navigator.clipboard.writeText(command);
    toast("Live agent command copied");
  } catch (error) {
    $("liveCommand").select();
    document.execCommand("copy");
    toast("Command selected and copied");
  }
}
function importLiveReport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const report = JSON.parse(reader.result);
      const issues = report.issues || [];
      const topIssues = issues.slice(0, 6).map((issue) => `<li><strong>${escapeHtml(issue.level)}</strong> - ${escapeHtml(issue.message)}</li>`).join("");
      $("liveReportSummary").innerHTML = `<div class="metric-grid live-metrics"><article class="metric-card"><div class="metric-value">${report.score ?? 0}%</div><div class="metric-label">Live QA score</div></article><article class="metric-card"><div class="metric-value">${report.summary?.pagesChecked ?? report.pages?.length ?? 0}</div><div class="metric-label">Pages checked</div></article><article class="metric-card"><div class="metric-value">${report.summary?.criticalIssues ?? 0}</div><div class="metric-label">Critical issues</div></article><article class="metric-card"><div class="metric-value">${report.summary?.warnings ?? 0}</div><div class="metric-label">Warnings</div></article></div><div class="issue-list"><strong>Top issues</strong><ul>${topIssues || "<li>No issues found</li>"}</ul></div>`;
    } catch (error) {
      toast("Could not read report JSON");
    }
  };
  reader.readAsText(file);
}
function exportJson() { downloadBlob(JSON.stringify(state, null, 2), `qa-command-center-${dateStamp()}.json`, "application/json"); }
function exportCsv() {
  const rows = [["kind", "project", "title", "area_or_status", "priority_or_severity", "detail"]];
  const projectsById = Object.fromEntries(state.projects.map((project) => [project.id, project.name]));
  state.cases.forEach((test) => rows.push(["case", projectsById[test.projectId], test.title, test.area, test.priority, test.expected]));
  state.defects.forEach((bug) => rows.push(["defect", projectsById[bug.projectId], bug.summary, bug.status, bug.severity, bug.actual]));
  state.runs.forEach((run) => rows.push(["run", projectsById[run.projectId], run.name, new Date(run.createdAt).toLocaleString(), `${run.caseIds.length} cases`, ""]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadBlob(csv, `qa-command-center-${dateStamp()}.csv`, "text/csv");
}
function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.projects || !imported.cases) throw new Error("Invalid file");
      state = { ...clone(sampleState), ...imported, suggestions: imported.suggestions || [] };
      selectedRunId = projectRuns()[0]?.id || null;
      saveState("Imported QA workspace");
      renderAll();
    } catch (error) { toast("Import failed"); }
  };
  reader.readAsText(file);
}
function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}
function switchView(view) {
  currentView = view;
  Object.entries(views).forEach(([name, config]) => config.el.classList.toggle("active", name === view));
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("viewTitle").textContent = views[view].title;
  $("viewEyebrow").textContent = views[view].eyebrow;
  if (view === "cases") setTimeout(() => $("caseTitle").focus(), 40);
}
function wireEvents() {
  document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewTarget)));
  $("projectSelect").addEventListener("change", (event) => { state.selectedProjectId = event.target.value; selectedRunId = projectRuns()[0]?.id || null; saveState(); resetCaseForm(); resetDefectForm(); renderAll(); });
  $("newProjectBtn").addEventListener("click", () => {
    const name = prompt("Project name");
    if (!name?.trim()) return;
    const project = { id: uid("proj"), name: name.trim(), environment: "QA" };
    state.projects.push(project);
    state.selectedProjectId = project.id;
    selectedRunId = null;
    saveState("Project created");
    renderAll();
  });
  $("quickCaseBtn").addEventListener("click", () => { switchView("cases"); resetCaseForm(); });
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("exportCsvBtn").addEventListener("click", exportCsv);
  $("importInput").addEventListener("change", (event) => event.target.files[0] && importJson(event.target.files[0]));
  ["caseSearch", "casePriorityFilter", "caseStatusFilter"].forEach((id) => $(id).addEventListener("input", renderCases));
  $("caseForm").addEventListener("submit", saveCase);
  $("resetCaseFormBtn").addEventListener("click", resetCaseForm);
  $("deleteCaseBtn").addEventListener("click", () => deleteCase());
  $("caseList").addEventListener("click", (event) => {
    const card = event.target.closest(".case-card");
    if (!card) return;
    if (event.target.closest(".delete-case")) deleteCase(card.dataset.id);
    else fillCaseForm(card.dataset.id);
  });
  $("createRunBtn").addEventListener("click", createRun);
  $("runList").addEventListener("click", (event) => {
    const card = event.target.closest(".run-card");
    if (!card) return;
    if (event.target.closest(".delete-run")) deleteRun(card.dataset.id);
    else { selectedRunId = card.dataset.id; renderRuns(); }
  });
  $("runDetail").addEventListener("change", (event) => {
    const row = event.target.closest(".result-row");
    if (!row) return;
    if (event.target.classList.contains("result-status")) updateRunResult(row.dataset.caseId, { status: event.target.value });
  });
  $("runDetail").addEventListener("input", (event) => {
    const row = event.target.closest(".result-row");
    if (row && event.target.classList.contains("result-notes")) updateRunResult(row.dataset.caseId, { notes: event.target.value });
  });
  $("resultBulk").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const run = state.runs.find((item) => item.id === selectedRunId);
    if (!button || !run) return;
    run.caseIds.forEach((caseId) => { run.results[caseId] = { ...(run.results[caseId] || {}), status: button.dataset.result }; });
    saveState("Run updated");
    renderAll();
  });
  $("defectForm").addEventListener("submit", saveDefect);
  $("resetDefectFormBtn").addEventListener("click", resetDefectForm);
  $("deleteDefectBtn").addEventListener("click", () => deleteDefect());
  $("defectBoard").addEventListener("click", (event) => {
    const card = event.target.closest(".defect-card");
    if (!card) return;
    if (event.target.closest(".delete-defect")) deleteDefect(card.dataset.id);
    else fillDefectForm(card.dataset.id);
  });
  $("generateSuggestionsBtn").addEventListener("click", generateSuggestions);
  $("businessContext").addEventListener("change", () => {
    const project = activeProject();
    if (!project) return;
    project.businessContext = $("businessContext").value.trim();
    saveState("Business context saved");
    renderLiveAgent();
  });
  $("agentTargetUrl").addEventListener("change", () => {
    const project = activeProject();
    if (!project) return;
    project.targetUrl = $("agentTargetUrl").value.trim();
    if (project.targetUrl) $("liveUrl").value = project.targetUrl;
    saveState("Website URL saved");
    renderLiveAgent();
  });
  $("liveUrl").addEventListener("change", () => {
    const project = activeProject();
    if (!project) return;
    project.targetUrl = $("liveUrl").value.trim();
    if (document.activeElement !== $("agentTargetUrl")) $("agentTargetUrl").value = project.targetUrl;
    saveState();
  });
  $("agentTargetUrl").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("agentTargetUrl").dispatchEvent(new Event("change"));
    if ($("requirementText").value.trim()) generateSuggestions();
    else toast("URL saved - add requirement text, then press Ctrl+Enter to generate");
  });
  $("businessContext").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    $("businessContext").dispatchEvent(new Event("change"));
    if ($("requirementText").value.trim()) generateSuggestions();
    else toast("Context saved - add requirement text, then press Ctrl+Enter to generate");
  });
  $("requirementText").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    generateSuggestions();
  });
  $("prdImportInput").addEventListener("change", (event) => event.target.files[0] && importPrdFile(event.target.files[0]));
  $("copyLiveCommandBtn").addEventListener("click", copyLiveCommand);
  ["liveUrl", "livePages", "liveAgentType"].forEach((id) => $(id).addEventListener("input", renderLiveAgent));
  $("liveReportInput").addEventListener("change", (event) => event.target.files[0] && importLiveReport(event.target.files[0]));
  $("addSuggestionsBtn").addEventListener("click", addAllSuggestions);
  $("suggestionList").addEventListener("click", (event) => {
    const card = event.target.closest(".suggestion-card");
    if (card && event.target.closest(".add-suggestion")) addSuggestion(Number(card.dataset.index));
  });
}
wireEvents();
resetCaseForm();
resetDefectForm();
renderAll();
