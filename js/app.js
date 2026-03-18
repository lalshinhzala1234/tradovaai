// =============================================
//   FIREBASE HELPER FUNCTIONS
// =============================================

async function saveTradeToFirestore(trade) {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return null;
  try {
    const docRef = await fns.addDoc(fns.collection(db, "users", user.uid, "trades"), trade);
    return docRef.id;
  } catch (e) { console.error("Save error:", e); return null; }
}

async function updateTradeInFirestore(firestoreId, trade) {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user || !firestoreId) return;
  try {
    await fns.updateDoc(fns.doc(db, "users", user.uid, "trades", firestoreId), trade);
  } catch (e) { console.error("Update error:", e); }
}

async function deleteTradeFromFirestore(firestoreId) {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user || !firestoreId) return;
  try {
    await fns.deleteDoc(fns.doc(db, "users", user.uid, "trades", firestoreId));
  } catch (e) { console.error("Delete error:", e); }
}

window.loadTradesFromFirestore = async function () {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return;
  try {
    // Save user email for admin search + localStorage
    await fns.setDoc(fns.doc(db, "users", user.uid), { email: user.email || "" }, { merge: true });
    localStorage.setItem("userEmail", user.email || "");
    const q = fns.query(fns.collection(db, "users", user.uid, "trades"), fns.orderBy("date", "asc"));
    const snapshot = await fns.getDocs(q);
    trades = [];
    snapshot.forEach(docSnap => {
      trades.push({ ...docSnap.data(), _firestoreId: docSnap.id });
    });
    filteredTrades = [...trades];
    renderTrades();
    updateDashboard();
    renderCharts();
    renderCalendar();
    updateBackupInfo();
    window.loadUserPlan(); // Plan bhi load karo
  } catch (e) { console.error("Load error:", e); }
};

window.loadAccountSettingsFromFirestore = async function () {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return;
  try {
    const docSnap = await fns.getDoc(fns.doc(db, "users", user.uid, "settings", "account"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.accountSize) localStorage.setItem("accountSize", data.accountSize);
      if (data.riskPercent) localStorage.setItem("riskPercent", data.riskPercent);
    }
    updateAccountDisplay();
  } catch (e) { console.error("Settings load error:", e); }
};

async function saveAccountSettingsToFirestore(size, risk) {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return;
  try {
    await fns.setDoc(fns.doc(db, "users", user.uid, "settings", "account"), { accountSize: size, riskPercent: risk });
  } catch (e) { console.error("Settings save error:", e); }
}

// =============================================
//   PLAN SYSTEM (Free / Pro)
// =============================================

const FREE_TRADE_LIMIT = 20;
let currentPlan = "free";

window.loadUserPlan = async function () {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return;
  try {
    const docSnap = await fns.getDoc(fns.doc(db, "users", user.uid, "settings", "plan"));
    if (docSnap.exists()) {
      const planData = docSnap.data();
      currentPlan = planData.plan || "free";
      // Expiry check - only downgrade if expiry exists AND has passed
      const expiry = planData.expiryDate;
      if (expiry && expiry !== null && new Date(expiry) < new Date()) {
        currentPlan = "free";
        await savePlanToFirestore("free", null);
      }
    } else {
      currentPlan = "free";
    }
    updatePlanUI();
    // If redirected from payment
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("upgraded") === "1") {
      const paymentId = localStorage.getItem("pendingProPayment");
      await window.activateProPlan(paymentId);
      localStorage.removeItem("pendingProPayment");
      history.replaceState({}, "", "app.html");
    }
  } catch (e) {
    console.error("Plan load error:", e);
    currentPlan = "free";
    updatePlanUI();
  }
};

async function savePlanToFirestore(plan, expiryDate) {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  const user = window._currentUser;
  if (!db || !user) return;
  try {
    await fns.setDoc(fns.doc(db, "users", user.uid, "settings", "plan"), {
      plan: plan,
      expiryDate: expiryDate || null,
      updatedAt: new Date().toISOString()
    });
    currentPlan = plan;
    updatePlanUI();
  } catch (e) { console.error("Plan save error:", e); }
}

function updatePlanUI() {
  const badge = document.getElementById("planBadge");
  if (badge) {
    if (currentPlan === "pro") {
      badge.textContent = "⭐ Pro";
      badge.style.background = "linear-gradient(135deg, #6366f1, #00f5c4)";
      badge.style.color = "white";
    } else {
      badge.textContent = "🔒 Free — " + trades.length + "/20";
      badge.style.background = "rgba(255,255,255,0.08)";
      badge.style.color = "#94a3b8";
    }
  }
  // Submit button update
  if (submitBtn) {
    if (currentPlan === "free" && trades.length >= FREE_TRADE_LIMIT && editIndex === -1) {
      submitBtn.textContent = "🔒 Upgrade to Pro — Limit Reached";
      submitBtn.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else {
      submitBtn.textContent = editIndex > -1 ? "Update Trade" : "Add Trade";
      submitBtn.style.background = "";
    }
  }
}

window.activateProPlan = async function (paymentId) {
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 1);
  await savePlanToFirestore("pro", expiry.toISOString());
  alert("🎉 Pro Plan activate ho gaya!\nAb unlimited trades add kar sakte ho.\nExpiry: " + expiry.toLocaleDateString());
};

// =============================================
//   AUTH FUNCTIONS
// =============================================

function waitForFirebase(cb) {
  if (window._firebaseFns && window._firebaseAuth) { cb(); }
  else { setTimeout(() => waitForFirebase(cb), 100); }
}

window.loginUser = async function () {
  const email = document.getElementById("authEmail").value.trim();
  const pass = document.getElementById("authPassword").value;
  document.getElementById("authError").textContent = "";
  waitForFirebase(async () => {
    const auth = window._firebaseAuth;
    const fns = window._firebaseFns;
    try {
      await fns.signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      document.getElementById("authError").textContent = "❌ " + e.message;
    }
  });
};

window.registerUser = async function () {
  const email = document.getElementById("authEmail").value.trim();
  const pass = document.getElementById("authPassword").value;
  document.getElementById("authError").textContent = "";
  waitForFirebase(async () => {
    const auth = window._firebaseAuth;
    const fns = window._firebaseFns;
    try {
      await fns.createUserWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      document.getElementById("authError").textContent = "❌ " + e.message;
    }
  });
};

window.loginGoogle = async function () {
  document.getElementById("authError").textContent = "";
  waitForFirebase(async () => {
    const auth = window._firebaseAuth;
    const fns = window._firebaseFns;
    try {
      await fns.signInWithPopup(auth, window._googleProvider);
    } catch (e) {
      document.getElementById("authError").textContent = "❌ " + e.message;
    }
  });
};

// Forgot Password
window.forgotPassword = async function () {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    document.getElementById("authError").textContent = "Please enter your email first.";
    return;
  }
  waitForFirebase(async () => {
    const auth = window._firebaseAuth;
    const fns = window._firebaseFns;
    try {
      await fns.sendPasswordResetEmail(auth, email);
      document.getElementById("authError").style.color = "#22c55e";
      document.getElementById("authError").textContent = "✅ Password reset email sent! Check your inbox.";
    } catch (e) {
      document.getElementById("authError").style.color = "#ef4444";
      document.getElementById("authError").textContent = "❌ " + e.message;
    }
  });
};

window.logoutUser = async function () {
  const auth = window._firebaseAuth;
  const fns = window._firebaseFns;
  await fns.signOut(auth);
  trades = [];
  filteredTrades = [];
};

// =============================================
//   THEME TOGGLE
// =============================================

const toggleBtn = document.getElementById("themeToggle");
toggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode");
  toggleBtn.textContent = document.body.classList.contains("light-mode") ? "☀️" : "🌙";
});

// =============================================
//   TRADE FORM SETUP
// =============================================

const form = document.getElementById("tradeForm");
const submitBtn = document.getElementById("submitBtn");

const imageInput = document.getElementById("tradeImage");
imageInput.addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById("imagePreview").src = e.target.result;
    document.getElementById("imagePreviewBox").style.display = "block";
  };
  reader.readAsDataURL(file);
});

let trades = [];
let filteredTrades = [];
let chart, pieChart, monthlyChart, strategyChart, drawdownChart, pairChart, strategyCompareChart;
let editIndex = -1;
let editFirestoreId = null;

["entryPrice", "stopLoss", "takeProfit"].forEach(id => {
  document.getElementById(id).addEventListener("input", calculateRR);
});

function calculateRR() {
  const entry = parseFloat(document.getElementById("entryPrice").value);
  const sl = parseFloat(document.getElementById("stopLoss").value);
  const tp = parseFloat(document.getElementById("takeProfit").value);
  const rrDiv = document.getElementById("rrDisplay");
  const rrVal = document.getElementById("rrValue");
  if (!isNaN(entry) && !isNaN(sl) && !isNaN(tp) && sl !== entry) {
    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const rr = (reward / risk).toFixed(2);
    rrVal.textContent = "1 : " + rr;
    rrDiv.style.display = "block";
  } else {
    rrDiv.style.display = "none";
  }
}

// =============================================
//   ACCOUNT SETTINGS
// =============================================

function saveAccountSettings() {
  const size = parseFloat(document.getElementById("accountSize").value);
  const risk = parseFloat(document.getElementById("riskPercent").value);
  if (isNaN(size) || isNaN(risk)) return;
  localStorage.setItem("accountSize", size);
  localStorage.setItem("riskPercent", risk);
  saveAccountSettingsToFirestore(size, risk);
  updateAccountDisplay();
}

function updateAccountDisplay() {
  const size = parseFloat(localStorage.getItem("accountSize"));
  const risk = parseFloat(localStorage.getItem("riskPercent"));
  if (!isNaN(size)) {
    document.getElementById("accountSize").value = size;
    document.getElementById("displayAccount").textContent = size.toLocaleString();
  }
  if (!isNaN(risk)) {
    document.getElementById("riskPercent").value = risk;
    document.getElementById("displayRisk").textContent = risk + "%";
  }
  if (!isNaN(size) && !isNaN(risk)) {
    document.getElementById("displayRiskAmt").textContent = ((size * risk) / 100).toFixed(2);
  }
}

// =============================================
//   TRADE FORM SUBMIT
// =============================================

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // FREE PLAN LIMIT CHECK
  if (currentPlan === "free" && trades.length >= FREE_TRADE_LIMIT && editIndex === -1) {
    if (confirm("🔒 Free plan limit (20 trades) reach ho gayi!\n\n₹199/month mein Pro upgrade karo?\n\nOK = Pricing page pe jao")) {
      window.location.href = "mailto:documorahelp@gmail.com?subject=TradoVault%20Pro%20Upgrade%20Request&body=Hi%2C%20I%20want%20to%20upgrade%20to%20Pro%20Plan%20Rs199%2Fmonth.%20Please%20activate%20my%20account.";
    }
    return;
  }

  const pair = document.getElementById("pair").value;
  const entry = Number(document.getElementById("entryPrice").value);
  const exitInput = document.getElementById("exitPrice").value;
  const qty = Number(document.getElementById("quantity").value);
  const strategy = document.getElementById("strategy").value || "Manual";
  const notes = document.getElementById("notes").value;

  let imageData = document.getElementById("imagePreview").src || "";
  if (imageData === window.location.href) imageData = "";

  const tradeDate = document.getElementById("tradeDate").value || new Date().toISOString().split("T")[0];
  const exit = exitInput === "" ? null : Number(exitInput);
  const positionType = document.getElementById("positionType").value;
  const stopLoss = document.getElementById("stopLoss").value ? Number(document.getElementById("stopLoss").value) : null;
  const takeProfit = document.getElementById("takeProfit").value ? Number(document.getElementById("takeProfit").value) : null;
  const leverage = document.getElementById("leverage").value ? Number(document.getElementById("leverage").value) : null;
  const tradeTags = document.getElementById("tradeTags").value;
  const mistakeType = document.getElementById("mistakeType").value;
  const tradeOpenTime = document.getElementById("tradeOpenTime").value;
  const tradeCloseTime = document.getElementById("tradeCloseTime").value;

  let rr = null;
  if (stopLoss !== null && takeProfit !== null && entry && stopLoss !== entry) {
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    rr = (reward / risk).toFixed(2);
  }

  let duration = null;
  if (tradeOpenTime && tradeCloseTime) {
    const ms = new Date(tradeCloseTime) - new Date(tradeOpenTime);
    if (ms > 0) {
      const mins = Math.floor(ms / 60000);
      const hrs = Math.floor(mins / 60);
      const days = Math.floor(hrs / 24);
      if (days > 0) duration = days + "d " + (hrs % 24) + "h";
      else if (hrs > 0) duration = hrs + "h " + (mins % 60) + "m";
      else duration = mins + "m";
    }
  }

  const trade = {
    pair, entry, exit, qty, strategy, notes, image: imageData, date: tradeDate,
    positionType, stopLoss, takeProfit, rr, leverage, tradeTags, mistakeType,
    tradeOpenTime, tradeCloseTime, duration
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  if (editIndex > -1) {
    await updateTradeInFirestore(editFirestoreId, trade);
    trade._firestoreId = editFirestoreId;
    trades[editIndex] = trade;
    editIndex = -1;
    editFirestoreId = null;
  } else {
    const newId = await saveTradeToFirestore(trade);
    if (newId) trade._firestoreId = newId;
    trades.push(trade);
  }

  submitBtn.disabled = false;
  updatePlanUI(); // Plan badge update karo

  filteredTrades = [...trades];
  renderTrades();
  updateDashboard();
  renderCharts();
  renderCalendar();
  updateBackupInfo();

  form.reset();
  document.getElementById("rrDisplay").style.display = "none";
  document.getElementById("imagePreview").src = "";
  document.getElementById("imagePreviewBox").style.display = "none";
});

// =============================================
//   RENDER TRADES TABLE
// =============================================

function renderTrades() {
  const tableBody = document.getElementById("tradeTableBody");
  tableBody.innerHTML = "";
  filteredTrades.forEach((trade) => {
    const index = trades.indexOf(trade);
    let profit = trade.exit === null ? "OPEN" : (trade.positionType === "Short" ? (trade.entry - trade.exit) : (trade.exit - trade.entry)) * trade.qty;
    const profitClass = profit === "OPEN" ? "" : profit >= 0 ? "profit" : "loss";
    const posBadge = trade.positionType === "Short"
      ? `<span class="short-badge">Short</span>`
      : `<span class="long-badge">Long</span>`;
    const tagsHtml = trade.tradeTags
      ? trade.tradeTags.split(",").map(t => `<span class="tag-badge">${t.trim()}</span>`).join("")
      : "-";
    const mistakeHtml = trade.mistakeType
      ? `<span class="mistake-badge">${trade.mistakeType}</span>`
      : "-";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${trade.pair}</td>
      <td>${posBadge}</td>
      <td>${trade.entry}</td>
      <td>${trade.exit ?? "-"}</td>
      <td>${trade.stopLoss ?? "-"}</td>
      <td>${trade.takeProfit ?? "-"}</td>
      <td>${trade.rr ? "1:" + trade.rr : "-"}</td>
      <td>${trade.qty}</td>
      <td>${trade.leverage ? trade.leverage + "x" : "-"}</td>
      <td class="${profitClass}">${profit === "OPEN" ? profit : profit.toLocaleString()}</td>
      <td>${trade.strategy}</td>
      <td>${tagsHtml}</td>
      <td>${mistakeHtml}</td>
      <td>${trade.duration ?? "-"}</td>
      <td>${trade.notes}</td>
      <td>
        <button onclick="editTrade(${index})">Edit</button>
        <button class="delete-btn" onclick="deleteTrade(${index})">Delete</button>
        ${trade.image ? `<button onclick="viewImage(${index})">Chart</button>` : ""}
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// =============================================
//   DASHBOARD STATS
// =============================================

function updateDashboard() {
  let totalTrades = filteredTrades.length;
  let wins = 0, totalProfit = 0;
  let currentWinStreak = 0, currentLossStreak = 0;
  let maxWinStreak = 0, maxLossStreak = 0;
  let grossProfit = 0, grossLoss = 0;
  let winAmount = 0, lossAmount = 0, lossCount = 0;
  let closedTrades = 0;
  let bestTrade = -Infinity, worstTrade = Infinity;

  filteredTrades.forEach((trade) => {
    if (trade.exit === null) return;
    closedTrades++;
    let profit = (trade.positionType === "Short" ? (trade.entry - trade.exit) : (trade.exit - trade.entry)) * trade.qty;
    if (profit > 0) {
      currentWinStreak++; currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      wins++; winAmount += profit; grossProfit += profit;
    } else if (profit < 0) {
      currentLossStreak++; currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      lossAmount += Math.abs(profit); lossCount++; grossLoss += Math.abs(profit);
    }
    totalProfit += profit;
    if (profit > bestTrade) bestTrade = profit;
    if (profit < worstTrade) worstTrade = profit;
  });

  let profitFactor = grossLoss === 0 ? grossProfit.toFixed(2) : (grossProfit / grossLoss).toFixed(2);
  let avgWin = wins ? (winAmount / wins).toFixed(2) : 0;
  let avgLoss = lossCount ? (lossAmount / lossCount).toFixed(2) : 0;
  let winRateDecimal = closedTrades ? wins / closedTrades : 0;
  let lossRateDecimal = 1 - winRateDecimal;
  let expectancy = (winRateDecimal * Number(avgWin) - lossRateDecimal * Number(avgLoss)).toFixed(2);
  let winRate = closedTrades ? ((wins / closedTrades) * 100).toFixed(1) : 0;

  document.getElementById("totalTrades").textContent = totalTrades;
  document.getElementById("winRate").textContent = winRate + "%";
  document.getElementById("totalProfit").textContent = totalProfit.toLocaleString();
  document.getElementById("bestTrade").textContent = bestTrade === -Infinity ? 0 : bestTrade.toLocaleString();
  document.getElementById("worstTrade").textContent = worstTrade === Infinity ? 0 : worstTrade.toLocaleString();
  document.getElementById("profitFactor").textContent = profitFactor;
  document.getElementById("avgWin").textContent = avgWin;
  document.getElementById("avgLoss").textContent = avgLoss;
  document.getElementById("expectancy").textContent = expectancy;
  document.getElementById("winStreak").textContent = maxWinStreak;
  document.getElementById("lossStreak").textContent = maxLossStreak;
}

// =============================================
//   DELETE & EDIT
// =============================================

window.deleteTrade = async function (index) {
  const trade = trades[index];
  if (!confirm("Are you sure you want to delete this trade?")) return;
  await deleteTradeFromFirestore(trade._firestoreId);
  trades.splice(index, 1);
  filteredTrades = [...trades];
  renderTrades(); updateDashboard(); renderCharts(); renderCalendar(); updateBackupInfo();
  updatePlanUI();
};

window.editTrade = function (index) {
  const trade = trades[index];
  document.getElementById("pair").value = trade.pair;
  document.getElementById("entryPrice").value = trade.entry;
  document.getElementById("exitPrice").value = trade.exit ?? "";
  document.getElementById("quantity").value = trade.qty;
  document.getElementById("strategy").value = trade.strategy;
  document.getElementById("notes").value = trade.notes;
  document.getElementById("tradeDate").value = trade.date ? trade.date.split("T")[0] : "";
  document.getElementById("positionType").value = trade.positionType || "Long";
  document.getElementById("stopLoss").value = trade.stopLoss ?? "";
  document.getElementById("takeProfit").value = trade.takeProfit ?? "";
  document.getElementById("leverage").value = trade.leverage ?? "";
  document.getElementById("tradeTags").value = trade.tradeTags ?? "";
  document.getElementById("mistakeType").value = trade.mistakeType ?? "";
  document.getElementById("tradeOpenTime").value = trade.tradeOpenTime ?? "";
  document.getElementById("tradeCloseTime").value = trade.tradeCloseTime ?? "";
  if (trade.image) {
    document.getElementById("imagePreview").src = trade.image;
    document.getElementById("imagePreviewBox").style.display = "block";
  } else {
    document.getElementById("imagePreview").src = "";
    document.getElementById("imagePreviewBox").style.display = "none";
  }
  if (trade.rr) {
    document.getElementById("rrValue").textContent = "1 : " + trade.rr;
    document.getElementById("rrDisplay").style.display = "block";
  }
  editIndex = index;
  editFirestoreId = trade._firestoreId || null;
  submitBtn.textContent = "Update Trade";
  submitBtn.style.background = "";
  document.querySelector(".trade-form").scrollIntoView({ behavior: "smooth" });
};

// =============================================
//   CHARTS
// =============================================

function renderEquity() {
  if (trades.length === 0) return;
  let running = 0, data = [], labels = [];
  trades.forEach((trade, i) => {
    if (trade.exit === null) return;
    running += (trade.positionType === "Short" ? (trade.entry - trade.exit) : (trade.exit - trade.entry)) * trade.qty;
    data.push(running);
    labels.push("Trade " + (i + 1));
  });
  const ctx = document.getElementById("profitChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.2)", fill: true, tension: 0.4 }] },
    options: { plugins: { legend: { display: false } } }
  });
}

function renderPie() {
  let wins = 0, losses = 0;
  trades.forEach(t => {
    if (t.exit === null) return;
    (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty > 0 ? wins++ : losses++;
  });
  const ctx = document.getElementById("winLossChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  pieChart = new Chart(ctx, {
    type: "doughnut",
    data: { labels: ["Wins", "Losses"], datasets: [{ data: [wins, losses], backgroundColor: ["#22c55e", "#ef4444"] }] },
    options: { responsive: true, cutout: "65%", animation: { animateRotate: true, animateScale: true, duration: 1500 }, plugins: { legend: { display: false } } }
  });
}

function renderMonthly() {
  let monthly = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    let d = new Date(t.date);
    if (isNaN(d)) return;
    let key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthly[key] = (monthly[key] || 0) + (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
  });
  let sortedKeys = Object.keys(monthly).sort();
  let data = sortedKeys.map(l => monthly[l]);
  if (data.length === 1) { sortedKeys.push(""); data.push(0); }
  let labels = sortedKeys.map(m => {
    if (!m) return "";
    let [year, month] = m.split("-");
    let d = new Date(year, Number(month) - 1, 1);
    return d.toLocaleString("default", { month: "short" }) + " " + d.getFullYear();
  });
  const ctx = document.getElementById("monthlyChart").getContext("2d");
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: data.map(v => v >= 0 ? "#3b82f6" : "#ef4444") }] },
    options: { plugins: { legend: { display: false } } }
  });
}

function renderStrategy() {
  let map = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    let profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    map[t.strategy] = (map[t.strategy] || 0) + profit;
  });
  const ctx = document.getElementById("strategyChart").getContext("2d");
  if (strategyChart) strategyChart.destroy();
  strategyChart = new Chart(ctx, {
    type: "bar",
    data: { labels: Object.keys(map), datasets: [{ data: Object.values(map), backgroundColor: "#f59e0b", borderRadius: 6, maxBarThickness: 60 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderStrategyCompare() {
  let map = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    if (!map[t.strategy]) map[t.strategy] = { wins: 0, total: 0 };
    map[t.strategy].total++;
    if ((t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty > 0) map[t.strategy].wins++;
  });
  const labels = Object.keys(map);
  const data = labels.map(s => map[s].total ? ((map[s].wins / map[s].total) * 100).toFixed(1) : 0);
  const ctx = document.getElementById("strategyCompareChart").getContext("2d");
  if (strategyCompareChart) strategyCompareChart.destroy();
  strategyCompareChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Win Rate %", data, backgroundColor: "#6366f1", borderRadius: 6, maxBarThickness: 60 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
  });
}

function renderPairPerformance() {
  let map = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    let profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    map[t.pair] = (map[t.pair] || 0) + profit;
  });
  const labels = Object.keys(map);
  const data = labels.map(p => map[p]);
  const ctx = document.getElementById("pairChart").getContext("2d");
  if (pairChart) pairChart.destroy();
  pairChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: data.map(v => v >= 0 ? "#22c55e" : "#ef4444"), borderRadius: 6, maxBarThickness: 60 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

function renderDrawdown() {
  let equity = 0, peak = 0, labels = [], data = [];
  trades.forEach((t, i) => {
    if (t.exit === null) return;
    equity += (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    if (equity > peak) peak = equity;
    data.push(equity - peak);
    labels.push("Trade " + (i + 1));
  });
  const ctx = document.getElementById("drawdownChart").getContext("2d");
  if (drawdownChart) drawdownChart.destroy();
  drawdownChart = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.2)", fill: true }] },
    options: { plugins: { legend: { display: false } } }
  });
}

function renderCharts() {
  renderEquity(); renderPie(); renderMonthly(); renderStrategy();
  renderStrategyCompare(); renderPairPerformance(); renderDrawdown();
}

// =============================================
//   CALENDAR
// =============================================

let calendarDate = new Date();

function changeMonth(dir) {
  calendarDate.setMonth(calendarDate.getMonth() + dir);
  renderCalendar();
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const title = calendarDate.toLocaleString("default", { month: "long", year: "numeric" });
  document.getElementById("calendarTitle").textContent = title;
  const dailyMap = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    const d = new Date(t.date);
    if (isNaN(d)) return;
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const key = d.getDate();
    const profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    dailyMap[key] = (dailyMap[key] || 0) + profit;
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let html = days.map(d => `<div class="calendar-day-header">${d}</div>`).join("");
  for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const val = dailyMap[d];
    let cls = "calendar-day";
    let profitHtml = "";
    if (val !== undefined) {
      cls += val >= 0 ? " profit-day" : " loss-day";
      profitHtml = `<div class="day-profit">${val >= 0 ? "+" : ""}${val.toFixed(0)}</div>`;
    }
    html += `<div class="${cls}"><div class="day-num">${d}</div>${profitHtml}</div>`;
  }
  document.getElementById("calendarGrid").innerHTML = html;
}

// =============================================
//   FILTER
// =============================================

function applyFilter() {
  const type = document.getElementById("dateFilter").value;
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;
  filteredTrades = [...trades];
  if (type !== "all") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(type));
    filteredTrades = filteredTrades.filter(t => new Date(t.date) >= cutoff);
  }
  if (start) filteredTrades = filteredTrades.filter(t => new Date(t.date) >= new Date(start));
  if (end) {
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    filteredTrades = filteredTrades.filter(t => new Date(t.date) <= endDate);
  }
  renderTrades(); updateDashboard(); renderCharts();
}

// =============================================
//   IMAGE MODAL
// =============================================

window.viewImage = function (index) {
  const trade = trades[index];
  if (!trade.image) return;
  document.getElementById("imageModal").style.display = "flex";
  document.getElementById("modalImage").src = trade.image;
};

document.getElementById("closeModal").onclick = function () {
  document.getElementById("imageModal").style.display = "none";
};
document.getElementById("imageModal").onclick = function (e) {
  if (e.target === this) this.style.display = "none";
};

// =============================================
//   EXPORT / IMPORT CSV
// =============================================

function exportCSV() {
  if (trades.length === 0) { alert("No trades found!"); return; }
  const headers = ["Pair","Type","Entry","Exit","SL","TP","RR","Qty","Leverage","Profit","Strategy","Tags","Mistake","Duration","Date","Notes"];
  const rows = trades.map(t => {
    const profit = t.exit !== null ? (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty : "OPEN";
    return [t.pair, t.positionType, t.entry, t.exit ?? "", t.stopLoss ?? "", t.takeProfit ?? "",
      t.rr ?? "", t.qty, t.leverage ?? "", profit, t.strategy, t.tradeTags ?? "", t.mistakeType ?? "",
      t.duration ?? "", t.date, t.notes].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "trading_journal.csv"; a.click();
  URL.revokeObjectURL(url);
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.trim().split("\n");
    lines.shift();
    lines.forEach(line => {
      const cols = line.split(",");
      if (cols.length < 2) return;
      const trade = {
        pair: cols[0], positionType: cols[1], entry: Number(cols[2]),
        exit: cols[3] === "" ? null : Number(cols[3]),
        stopLoss: cols[4] === "" ? null : Number(cols[4]),
        takeProfit: cols[5] === "" ? null : Number(cols[5]),
        rr: cols[6] || null, qty: Number(cols[7]),
        leverage: cols[8] === "" ? null : Number(cols[8]),
        strategy: cols[10] || "Manual", tradeTags: cols[11] || "",
        mistakeType: cols[12] || "", duration: cols[13] || null,
        date: cols[14] || new Date().toISOString().split("T")[0],
        notes: cols[15] || "", image: ""
      };
      saveTradeToFirestore(trade).then(id => { if (id) trade._firestoreId = id; });
      trades.push(trade);
    });
    filteredTrades = [...trades];
    renderTrades(); updateDashboard(); renderCharts(); renderCalendar(); updateBackupInfo();
  };
  reader.readAsText(file);
}

// =============================================
//   EXPORT / IMPORT JSON
// =============================================

function exportJSON() {
  if (trades.length === 0) { alert("No trades found!"); return; }
  const clean = trades.map(t => { const { _firestoreId, ...rest } = t; return rest; });
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "trading_journal_backup.json"; a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("lastBackup", new Date().toLocaleString());
  updateBackupInfo();
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) { alert("Invalid JSON!"); return; }
      for (const trade of data) {
        const id = await saveTradeToFirestore(trade);
        if (id) trade._firestoreId = id;
        trades.push(trade);
      }
      filteredTrades = [...trades];
      renderTrades(); updateDashboard(); renderCharts(); renderCalendar(); updateBackupInfo();
    } catch { alert("JSON parse error!"); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm("Are you sure? This will permanently delete all data from Firestore!")) return;
  const promises = trades.map(t => deleteTradeFromFirestore(t._firestoreId));
  Promise.all(promises).then(() => {
    trades = []; filteredTrades = [];
    renderTrades(); updateDashboard(); renderCharts(); renderCalendar(); updateBackupInfo();
    updatePlanUI();
  });
}

function updateBackupInfo() {
  document.getElementById("backupTradeCount").textContent = trades.length;
  const last = localStorage.getItem("lastBackup");
  document.getElementById("lastBackupTime").textContent = last || "Never";
}

// =============================================
//   TAB NAVIGATION
// =============================================

function showTab(tabName, btn) {
  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tabName).classList.add("active");
  btn.classList.add("active");
  if (tabName === "analytics") { renderAnalytics(); renderLeaderboard(); renderStrategyReport(); }
  if (tabName === "gallery") renderGallery();
  if (tabName === "goals") { renderGoalDisplay(); renderGoalChart(); }
  if (tabName === "session") renderSessionAnalysis();
  if (tabName === "score") renderTraderScore();
}

// =============================================
//   ANALYTICS TAB
// =============================================

function renderAnalytics() {
  const closed = trades.filter(t => t.exit !== null);
  const profits = closed.map(t => (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty);
  const wins = profits.filter(p => p > 0);
  const losses = profits.filter(p => p < 0);
  const total = profits.reduce((a, b) => a + b, 0);
  const avgProfit = profits.length ? (total / profits.length).toFixed(2) : 0;
  const largestWin = wins.length ? Math.max(...wins).toLocaleString() : 0;
  const largestLoss = losses.length ? Math.min(...losses).toLocaleString() : 0;
  const openTrades = trades.filter(t => t.exit === null).length;
  const rrs = trades.filter(t => t.rr).map(t => parseFloat(t.rr));
  const avgRR = rrs.length ? (rrs.reduce((a, b) => a + b, 0) / rrs.length).toFixed(2) : "-";
  const cards = [
    { title: "Closed Trades", value: closed.length, sub: openTrades + " open" },
    { title: "Total P&L", value: total.toFixed(2), sub: "All time" },
    { title: "Avg Profit/Trade", value: avgProfit, sub: "Closed trades" },
    { title: "Largest Win", value: largestWin, sub: "Single trade" },
    { title: "Largest Loss", value: largestLoss, sub: "Single trade" },
    { title: "Avg R:R", value: avgRR, sub: "Trades with RR" },
  ];
  document.getElementById("analyticsCards").innerHTML = cards.map(c => `
    <div class="analytics-card">
      <h4>${c.title}</h4>
      <div class="ac-value">${c.value}</div>
      <div class="ac-sub">${c.sub}</div>
    </div>
  `).join("");
}

let currentLbType = "profit";

function showLeaderboard(type, btn) {
  currentLbType = type;
  document.querySelectorAll(".lb-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderLeaderboard();
}

function renderLeaderboard() {
  const pairMap = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    if (!pairMap[t.pair]) pairMap[t.pair] = { profit: 0, wins: 0, total: 0 };
    const p = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    pairMap[t.pair].profit += p;
    pairMap[t.pair].total++;
    if (p > 0) pairMap[t.pair].wins++;
  });
  let sorted = Object.entries(pairMap).map(([pair, data]) => ({
    pair, profit: data.profit, winRate: data.total ? (data.wins / data.total * 100).toFixed(1) : 0, trades: data.total
  }));
  if (currentLbType === "profit") sorted.sort((a, b) => b.profit - a.profit);
  else if (currentLbType === "winrate") sorted.sort((a, b) => b.winRate - a.winRate);
  else sorted.sort((a, b) => b.trades - a.trades);
  const maxVal = sorted.length ? Math.max(...sorted.map(s => currentLbType === "profit" ? Math.abs(s.profit) : currentLbType === "winrate" ? s.winRate : s.trades)) : 1;
  const ranks = ["🥇", "🥈", "🥉"];
  const rankCls = ["gold", "silver", "bronze"];
  document.getElementById("leaderboardList").innerHTML = sorted.map((item, i) => {
    const val = currentLbType === "profit" ? item.profit.toFixed(2) : currentLbType === "winrate" ? item.winRate + "%" : item.trades;
    const barW = maxVal ? (Math.abs(currentLbType === "profit" ? item.profit : currentLbType === "winrate" ? item.winRate : item.trades) / maxVal * 100).toFixed(1) : 0;
    const barColor = currentLbType === "profit" ? (item.profit >= 0 ? "#22c55e" : "#ef4444") : "#3b82f6";
    return `
      <div class="leaderboard-item">
        <div class="lb-rank ${rankCls[i] || "normal"}">${ranks[i] || (i + 1)}</div>
        <div class="lb-info">
          <div class="lb-pair">${item.pair}</div>
          <div class="lb-meta">${item.trades} trades · ${item.winRate}% win rate</div>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barW}%;background:${barColor};"></div></div>
        </div>
        <div class="lb-value" style="color:${currentLbType === "profit" && item.profit < 0 ? "#ef4444" : "#22c55e"}">${val}</div>
      </div>
    `;
  }).join("") || "<p style='color:#64748b;padding:16px'>No trade data found.</p>";
}

function renderStrategyReport() {
  const map = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    const p = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    if (!map[t.strategy]) map[t.strategy] = { total: 0, wins: 0, profit: 0 };
    map[t.strategy].total++;
    map[t.strategy].profit += p;
    if (p > 0) map[t.strategy].wins++;
  });
  const rows = Object.entries(map).map(([s, d]) =>
    `<tr><td>${s}</td><td>${d.total}</td><td>${d.wins}</td><td>${(d.wins / d.total * 100).toFixed(1)}%</td><td class="${d.profit >= 0 ? "profit" : "loss"}">${d.profit.toFixed(2)}</td></tr>`
  ).join("");
  document.getElementById("strategyReport").innerHTML = `
    <table class="strategy-report-table">
      <thead><tr><th>Strategy</th><th>Trades</th><th>Wins</th><th>Win Rate</th><th>Profit</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='5' style='color:#64748b'>No data available</td></tr>"}</tbody>
    </table>`;
}

// =============================================
//   GALLERY TAB
// =============================================

function renderGallery() {
  const withImages = trades.filter(t => t.image && t.image.length > 5);
  const container = document.getElementById("screenshotGallery");
  if (!withImages.length) { container.innerHTML = "<p class='gallery-empty'>No screenshots found.</p>"; return; }
  container.innerHTML = withImages.map((t) => {
    const idx = trades.indexOf(t);
    const profit = t.exit !== null ? (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty : null;
    return `
      <div class="gallery-item" onclick="viewImage(${idx})">
        <img src="${t.image}" alt="${t.pair}">
        <div class="gallery-info">
          <strong>${t.pair}</strong>
          <span>${t.date}</span><br>
          ${profit !== null ? `<span class="${profit >= 0 ? "profit" : "loss"}">${profit >= 0 ? "+" : ""}${profit.toFixed(2)}</span>` : "<span>OPEN</span>"}
        </div>
      </div>`;
  }).join("");
}

// =============================================
//   AI REVIEW TAB
// =============================================

window.runAIReview = function () {
  if (trades.length === 0) { alert("Please add some trades first!"); return; }

  if (currentPlan !== "pro") {
    if (confirm("🔒 AI Review is only available on the Pro plan!\n\n₹199/month mein upgrade karo?\n\nOK = Email bhejo")) {
      window.location.href = "mailto:documorahelp@gmail.com?subject=TradoVault%20Pro%20Upgrade%20Request&body=Hi%2C%20I%20want%20to%20upgrade%20to%20Pro%20Plan%20Rs199%2Fmonth.%20Please%20activate%20my%20account.";
    }
    return;
  }

  const btn = document.getElementById("aiReviewBtn");
  const result = document.getElementById("aiReviewResult");
  btn.disabled = true;
  btn.textContent = "⏳ Analyzing...";
  result.className = "ai-result loading";
  result.textContent = "Deeply analyzing your trading patterns...";

  setTimeout(() => {
    try {
      const closed = trades.filter(t => t.exit !== null);
      if (closed.length === 0) {
        result.className = "ai-result";
        result.textContent = "No closed trades found. Please close some trades first.";
        btn.disabled = false; btn.textContent = "▶ Run AI Review";
        return;
      }

      const profits = closed.map(t =>
        (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty
      );
      const totalPnL = profits.reduce((a, b) => a + b, 0);
      const winList = profits.filter(p => p > 0);
      const lossList = profits.filter(p => p < 0);
      const winRate = ((winList.length / closed.length) * 100).toFixed(1);
      const avgWin = winList.length ? (winList.reduce((a,b)=>a+b,0)/winList.length) : 0;
      const avgLoss = lossList.length ? Math.abs(lossList.reduce((a,b)=>a+b,0)/lossList.length) : 0;
      const rr = avgLoss > 0 ? (avgWin/avgLoss) : 0;
      const grossProfit = winList.reduce((a,b)=>a+b,0);
      const grossLoss = Math.abs(lossList.reduce((a,b)=>a+b,0));
      const profitFactor = grossLoss > 0 ? (grossProfit/grossLoss) : grossProfit;

      let peak=0, eq=0, maxDD=0;
      profits.forEach(p=>{eq+=p;if(eq>peak)peak=eq;if((peak-eq)>maxDD)maxDD=peak-eq;});

      let maxWS=0,maxLS=0,ws=0,ls=0;
      profits.forEach(p=>{if(p>0){ws++;ls=0;if(ws>maxWS)maxWS=ws;}else{ls++;ws=0;if(ls>maxLS)maxLS=ls;}});

      const mistakeMap={};
      closed.forEach(t=>{if(t.mistakeType)mistakeMap[t.mistakeType]=(mistakeMap[t.mistakeType]||0)+1;});
      const topMistakes=Object.entries(mistakeMap).sort((a,b)=>b[1]-a[1]);
      const revengeCount=mistakeMap["Revenge Trade"]||0;
      const fomoCount=mistakeMap["FOMO"]||0;
      const overlevCount=mistakeMap["Overleverage"]||0;
      const noSlCount=mistakeMap["No SL"]||0;
      const earlyExitCount=mistakeMap["Early Exit"]||0;

      const stratMap={};
      closed.forEach((t,i)=>{
        if(!stratMap[t.strategy])stratMap[t.strategy]={profit:0,wins:0,total:0};
        stratMap[t.strategy].profit+=profits[i]||0;
        stratMap[t.strategy].total++;
        if((profits[i]||0)>0)stratMap[t.strategy].wins++;
      });
      const stratList=Object.entries(stratMap).sort((a,b)=>b[1].profit-a[1].profit);
      const bestStrat=stratList[0];
      const worstStrat=stratList[stratList.length-1];

      const pairMap={};
      closed.forEach((t,i)=>{
        if(!pairMap[t.pair])pairMap[t.pair]={profit:0,total:0,wins:0};
        pairMap[t.pair].profit+=profits[i]||0;
        pairMap[t.pair].total++;
        if((profits[i]||0)>0)pairMap[t.pair].wins++;
      });
      const pairList=Object.entries(pairMap).sort((a,b)=>b[1].profit-a[1].profit);
      const bestPair=pairList[0];
      const worstPair=pairList[pairList.length-1];

      const recent5=profits.slice(-5);
      const recentPnL=recent5.reduce((a,b)=>a+b,0);
      const recentWins=recent5.filter(p=>p>0).length;

      let psychScore=100-revengeCount*12-fomoCount*8-overlevCount*10-noSlCount*15-earlyExitCount*5;
      psychScore=Math.max(0,Math.min(100,psychScore));
      const psychLabel=psychScore>=85?"Excellent":psychScore>=70?"Good":psychScore>=50?"Needs Improvement":"Poor — Urgent Attention Needed";
      const psychEmoji=psychScore>=85?"🟢":psychScore>=70?"🟡":psychScore>=50?"🟠":"🔴";

      const traderLevel=winRate>=60&&rr>=1.5&&profitFactor>=1.5?"Advanced Trader":winRate>=50&&profitFactor>=1?"Intermediate Trader":"Beginner / Developing Trader";
      const userName=(document.getElementById("userEmailDisplay")?.textContent||"").replace("👤 ","").split("@")[0]||"Trader";

      let en="";
      en+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      en+="  🤖 AI TRADE REVIEW — ENGLISH\n";
      en+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

      en+=`Hey ${userName}, I've finished analyzing your ${closed.length} closed trades in detail. `;
      if(totalPnL>0){
        en+=`The overall picture is positive — you're up ${totalPnL.toFixed(2)} in total, which means your strategy is working at some level. But just being profitable isn't enough; the real question is whether you're performing at your true potential. Based on what I see in your data, there are clear patterns — both good ones to double down on, and some dangerous habits that are quietly limiting your growth.\n\n`;
      }else{
        en+=`Right now your total P&L is ${totalPnL.toFixed(2)}, which means you're in a drawdown. But don't be discouraged — your trades tell me that the core problem is fixable. I can see specific patterns in your mistakes and your trade management that, if corrected, can flip your results significantly. Let me break it all down for you.\n\n`;
      }

      en+="─────────────────────────────────────\n";
      en+="📊 PERFORMANCE OVERVIEW\n";
      en+="─────────────────────────────────────\n\n";
      en+=`Out of your ${closed.length} trades, you won ${winList.length} and lost ${lossList.length}, giving you a win rate of ${winRate}%. `;
      if(winRate>=60)en+=`That's a strong win rate — most professional traders aim for 50-60%, so you're already in a healthy zone. The key now is making sure your winners are significantly larger than your losers.\n\n`;
      else if(winRate>=50)en+=`This is right at the breakeven threshold. With a 50%+ win rate, your profitability entirely depends on your Risk/Reward ratio — if your winners are bigger than your losers, you're profitable. If not, even winning more than half your trades won't save you.\n\n`;
      else en+=`This is below 50%, which means you need a strong Risk/Reward ratio to compensate. You cannot afford average trade management at this win rate — every trade needs to be well-planned with a clear exit strategy.\n\n`;

      en+=`Your average winning trade is ${avgWin.toFixed(2)} and your average losing trade is ${avgLoss.toFixed(2)}, giving you a Risk/Reward ratio of ${rr.toFixed(2)}. `;
      if(rr>=2)en+=`This is excellent. A 2:1 R:R means even if you only win 40% of your trades, you'll still be profitable. Keep protecting this ratio — it's your biggest strength.\n\n`;
      else if(rr>=1.5)en+=`This is solid. You're making more than you're losing per trade. The goal is to push this toward 2:1 over time.\n\n`;
      else if(rr>=1)en+=`This is marginal. Target a minimum of 1.5:1 — either move your Take Profit farther away or tighten your Stop Loss.\n\n`;
      else en+=`This is a critical problem. Your losses are larger than your wins. Review where you're placing your TP and SL — this needs to be fixed immediately.\n\n`;

      en+=`Your Profit Factor is ${profitFactor.toFixed(2)} — `;
      if(profitFactor>=2)en+=`excellent! You're generating 2x more in profits than losses.\n\n`;
      else if(profitFactor>=1.5)en+=`strong. You're generating 1.5x more in profits than losses.\n\n`;
      else if(profitFactor>=1)en+=`profitable but thin. You need more margin between your gross profits and gross losses.\n\n`;
      else en+=`your total losses exceed your total profits. This is your top priority to fix.\n\n`;

      en+=`Your maximum drawdown hit ${maxDD.toFixed(2)} at its worst point. `;
      if(maxDD>Math.abs(totalPnL)*2)en+=`This is disproportionately high relative to your net gain — meaning you took on a lot of risk to earn what you did. Focus on reducing position sizes during losing streaks.\n\n`;
      else en+=`This is within an acceptable range. Keep managing your position sizes to keep drawdowns controlled.\n\n`;

      en+="─────────────────────────────────────\n";
      en+="📈 RECENT FORM (Last 5 Trades)\n";
      en+="─────────────────────────────────────\n\n";
      en+=`In your most recent 5 trades, you won ${recentWins} and your P&L was ${recentPnL>=0?"+":""}${recentPnL.toFixed(2)}. `;
      if(recentWins>=4)en+=`Your recent form is excellent — you're clearly in a good rhythm. Stay disciplined and don't get overconfident.\n\n`;
      else if(recentWins>=3)en+=`Your recent form is decent. You're winning more than you're losing recently, which is a positive sign.\n\n`;
      else if(recentWins===2)en+=`Your recent form is average. Take a critical look at what's different about your recent entries compared to your winning trades.\n\n`;
      else en+=`Your recent form is concerning — only ${recentWins} win from the last 5 trades. Consider reducing position size temporarily until you find your rhythm again.\n\n`;

      en+="─────────────────────────────────────\n";
      en+="🎯 STRATEGY ANALYSIS\n";
      en+="─────────────────────────────────────\n\n";
      if(bestStrat){
        const bsWR=(bestStrat[1].wins/bestStrat[1].total*100).toFixed(0);
        en+=`Your best performing strategy is "${bestStrat[0]}" with a P&L of +${bestStrat[1].profit.toFixed(2)} across ${bestStrat[1].total} trades at a ${bsWR}% win rate. This is your bread and butter — the setup that fits your style and your market read the best. `;
        if(bestStrat[1].total<5)en+=`However, the sample size of ${bestStrat[1].total} trades is small, so keep tracking it to confirm its edge.\n\n`;
        else en+=`With ${bestStrat[1].total} trades, this is a statistically meaningful sample. Trust this strategy and look for more opportunities in it.\n\n`;
      }
      if(worstStrat&&worstStrat[0]!==bestStrat?.[0]){
        const wsWR=(worstStrat[1].wins/worstStrat[1].total*100).toFixed(0);
        en+=`On the other end, "${worstStrat[0]}" is your weakest strategy with a P&L of ${worstStrat[1].profit.toFixed(2)} and only a ${wsWR}% win rate over ${worstStrat[1].total} trades. You should either stop using this strategy entirely or go back to your charts and completely rethink your entry criteria for it.\n\n`;
      }
      if(bestPair){
        en+=`Pair-wise, ${bestPair[0]} is your strongest market — you've made +${bestPair[1].profit.toFixed(2)} from ${bestPair[1].total} trades on it. Clearly you understand this pair's behaviour well. `;
        if(worstPair&&worstPair[0]!==bestPair[0])en+=`Meanwhile, ${worstPair[0]} has given you ${worstPair[1].profit.toFixed(2)} — consider whether it's worth continuing to trade it.\n\n`;
        else en+="\n\n";
      }

      en+="─────────────────────────────────────\n";
      en+="⚠️ MISTAKE ANALYSIS\n";
      en+="─────────────────────────────────────\n\n";
      if(topMistakes.length===0){
        en+=`You haven't logged any mistakes — which either means you're executing flawlessly, or you're not being honest enough in your journaling. I encourage you to revisit each trade and tag any emotional or technical errors, because that data is what makes this journal truly powerful.\n\n`;
      }else{
        en+=`Your logged mistakes reveal some clear behavioral patterns that are costing you money:\n\n`;
        topMistakes.forEach(([m,c])=>{
          en+=`  • ${m} (${c} time${c>1?"s":""}): `;
          if(m==="FOMO")en+=`Chasing trades after missing the entry is one of the most costly habits in trading. The market always presents new opportunities — missing one setup is never a reason to force a trade. For every FOMO trade you take, ask yourself: "Would I have taken this trade if I saw it fresh?"\n`;
          else if(m==="Revenge Trade")en+=`Trading to recover losses emotionally is extremely destructive. Each revenge trade compounds your losses and clouds your judgment further. After a losing trade, close your charts for at least 30 minutes.\n`;
          else if(m==="No SL")en+=`Trading without a stop loss is not trading — it's gambling. Every single trade, no matter how confident you feel, must have a predefined maximum loss. This is non-negotiable.\n`;
          else if(m==="Overleverage")en+=`High leverage amplifies both gains and losses, but more importantly it amplifies emotional pressure, which leads to poor decisions. Reduce your leverage to a level where a loss doesn't stress you out.\n`;
          else if(m==="Early Exit")en+=`Cutting your winners short is silently killing your R:R ratio. If you took the trade based on a setup, trust the setup to play out. Move your SL to breakeven and let the trade run to your TP.\n`;
          else if(m==="Late Entry")en+=`Entering after the optimal zone has passed increases risk and reduces reward. If you missed the entry, wait for the next setup.\n`;
          else en+=`This pattern is appearing frequently enough to be a real habit. Analyze these specific trades and look for what triggers this mistake.\n`;
        });
        en+="\n";
      }

      en+="─────────────────────────────────────\n";
      en+="🛡️ RISK MANAGEMENT\n";
      en+="─────────────────────────────────────\n\n";
      en+=`Your max win streak is ${maxWS} and max loss streak is ${maxLS}. `;
      if(maxLS>=4)en+=`A ${maxLS}-trade losing streak is significant. During a losing streak, the biggest mistake traders make is increasing position size to recover faster — do the opposite. Drop your size by 50% until you're back to winning.\n\n`;
      else en+=`A max loss streak of ${maxLS} is manageable. Key rule: after 3 consecutive losses, stop trading for the day and review what went wrong.\n\n`;
      if(noSlCount>0)en+=`You traded without a Stop Loss ${noSlCount} time${noSlCount>1?"s":""}. This is your single biggest risk management failure. One trade without a SL can wipe out weeks of profits. This must be zero going forward.\n\n`;

      en+="─────────────────────────────────────\n";
      en+=`🧘 TRADING PSYCHOLOGY — ${psychScore}/100 ${psychEmoji} (${psychLabel})\n`;
      en+="─────────────────────────────────────\n\n";
      if(psychScore>=85)en+=`Your psychological score is outstanding. You're showing strong emotional discipline — low revenge trading, minimal FOMO, good mistake management. This is the foundation that separates consistently profitable traders from break-even traders. Keep journaling every trade; it's clearly working.\n\n`;
      else if(psychScore>=70)en+=`Your psychology is generally good, but there are a few emotional leaks. The mistakes you're making — ${topMistakes.slice(0,2).map(m=>m[0]).join(", ")} — are emotion-driven, not strategy-driven. Work on creating a pre-trade checklist that you complete before every entry. This forces you to slow down and think before acting.\n\n`;
      else if(psychScore>=50)en+=`Your psychology needs attention. Multiple emotional trading patterns are showing up — ${topMistakes.slice(0,3).map(m=>m[0]).join(", ")}. These aren't random; they're habits forming. The fix is structure: define exactly when you're allowed to trade, under what conditions, and what you do after a loss. Write it down and stick to it.\n\n`;
      else en+=`Your psychology score is low, and it's directly impacting your P&L. Emotional decisions — ${topMistakes.slice(0,3).map(m=>m[0]).join(", ")} — are appearing repeatedly. I strongly recommend taking a 3-day break from trading, reviewing every losing trade, and building a strict trading plan with clear rules before returning.\n\n`;

      en+="─────────────────────────────────────\n";
      en+=`🏆 FINAL VERDICT — ${traderLevel}\n`;
      en+="─────────────────────────────────────\n\n";
      en+=`Based on all the data, here are your 3 most impactful action items right now:\n\n`;
      if(rr<1.5)en+=`1. Fix your Risk/Reward immediately. Your average win (${avgWin.toFixed(2)}) needs to be at least 1.5x your average loss (${avgLoss.toFixed(2)}). Review where you're placing your Take Profit — you're likely exiting too early.\n\n`;
      else en+=`1. You have a strong R:R of ${rr.toFixed(2)} — protect it. Never take a trade where your potential reward isn't at least 1.5x your risk.\n\n`;
      if(topMistakes.length>0)en+=`2. Your most damaging habit is "${topMistakes[0][0]}" (${topMistakes[0][1]} times). Before your next trade, write down one specific rule to prevent this mistake from happening again.\n\n`;
      else en+=`2. No mistakes logged — great start. Now start tagging the quality of each trade (A+, A, B) to identify which setups deserve bigger position sizes.\n\n`;
      if(bestStrat)en+=`3. Double down on "${bestStrat[0]}" — it's your highest-performing strategy. Look for more high-quality setups matching this approach and reduce exposure to weaker strategies.\n\n`;
      en+=`Remember: consistency in process creates consistency in results. The traders who make it long-term are not the ones who find a magic strategy — they're the ones who execute the same disciplined approach trade after trade, month after month.\n\n`;

      // ─── HINDI ───
      let hi="";
      hi+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      hi+="  🤖 AI TRADE REVIEW — HINDI\n";
      hi+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

      hi+=`${userName} bhai, maine tumhare ${closed.length} closed trades ko detail mein analyze kiya hai. `;
      if(totalPnL>0)hi+=`Overall picture positive hai — tumhara total P&L +${totalPnL.toFixed(2)} hai, matlab tumhari strategy kuch had tak kaam kar rahi hai. Lekin sirf profitable hona kaafi nahi — asli sawaal ye hai ki kya tum apni full potential pe perform kar rahe ho? Data mein kuch strong patterns dikh rahe hain — kuch strengths jo aur badhaani chahiye, aur kuch dangerous habits jo growth rok rahi hain.\n\n`;
      else hi+=`Abhi tumhara total P&L ${totalPnL.toFixed(2)} hai, matlab tum drawdown mein ho. Lekin ghabrao mat — trades dekh ke lag raha hai ki problem fixable hai. Kuch specific patterns hain mistakes aur trade management mein jo agar fix ho jayein, toh results completely badal sakte hain.\n\n`;

      hi+="─────────────────────────────────────\n";
      hi+="📊 PERFORMANCE OVERVIEW\n";
      hi+="─────────────────────────────────────\n\n";
      hi+=`Tumhare ${closed.length} trades mein se ${winList.length} win aur ${lossList.length} loss hue — win rate ${winRate}% raha. `;
      if(winRate>=60)hi+=`Ye ek strong win rate hai — professional traders 50-60% ke beech kaam karte hain, toh tum already ek healthy zone mein ho. Ab focus karo ki winners losers se significantly bade hon.\n\n`;
      else if(winRate>=50)hi+=`Ye breakeven ke kareeb hai. 50%+ win rate pe profitability poori tarah Risk/Reward pe depend karti hai — agar winners losers se bade hain, profit hoga.\n\n`;
      else hi+=`Ye 50% se neeche hai. Iska matlab hai tumhein strong Risk/Reward chahiye compensate karne ke liye. Har trade carefully plan karo aur sirf high-quality setups lo.\n\n`;

      hi+=`Tumhara average winning trade ${avgWin.toFixed(2)} hai aur average losing trade ${avgLoss.toFixed(2)}, jo ${rr.toFixed(2)} ka Risk/Reward ratio deta hai. `;
      if(rr>=2)hi+=`Ye excellent hai — 2:1 R:R matlab 40% win rate pe bhi profit possible hai. Ye tumhari sabse badi strength hai, ise protect karo.\n\n`;
      else if(rr>=1.5)hi+=`Ye solid hai. Goal hai ise 2:1 tak le jaana over time.\n\n`;
      else if(rr>=1)hi+=`Ye marginal hai. Minimum 1.5:1 ka target rakho — ya TP door karo ya SL tight karo.\n\n`;
      else hi+=`Ye critical problem hai. Loss winners se bada hai — TP aur SL placement turant fix karo.\n\n`;

      hi+=`Profit Factor ${profitFactor.toFixed(2)} hai — `;
      if(profitFactor>=2)hi+=`excellent! Loss se 2x zyada profit bana rahe ho.\n\n`;
      else if(profitFactor>=1.5)hi+=`strong. Loss se 1.5x zyada profit.\n\n`;
      else if(profitFactor>=1)hi+=`profitable ho lekin margin thin hai. Improve karna zaroori hai.\n\n`;
      else hi+=`total loss profit se zyada hai — ye top priority fix karo.\n\n`;

      hi+=`Maximum drawdown ${maxDD.toFixed(2)} tha. `;
      if(maxDD>Math.abs(totalPnL)*2)hi+=`Ye net gain ke relative bahut zyada hai — matlab bahut zyada risk liya kam earn karne ke liye. Losing streak mein position size zaroor kam karo.\n\n`;
      else hi+=`Ye acceptable range mein hai — position sizes control mein rakhte raho.\n\n`;

      hi+="─────────────────────────────────────\n";
      hi+="📈 RECENT FORM (Aakhri 5 Trades)\n";
      hi+="─────────────────────────────────────\n\n";
      hi+=`Tumhare recent 5 trades mein ${recentWins} jeet mili aur P&L ${recentPnL>=0?"+":""}${recentPnL.toFixed(2)} raha. `;
      if(recentWins>=4)hi+=`Recent form kaafi achha hai — ek acche rhythm mein ho. Discipline banaye rakho, overconfident mat bano.\n\n`;
      else if(recentWins>=3)hi+=`Recent form decent hai. Theek chal raha hai, positive sign hai.\n\n`;
      else if(recentWins===2)hi+=`Recent form average hai. Recent entries ko winning trades se compare karo — kya alag hai?\n\n`;
      else hi+=`Recent form concerning hai — sirf ${recentWins} win aakhri 5 mein. Temporarily position size kam karo jab tak rhythm wapas aaye.\n\n`;

      hi+="─────────────────────────────────────\n";
      hi+="🎯 STRATEGY ANALYSIS\n";
      hi+="─────────────────────────────────────\n\n";
      if(bestStrat){
        const bsWR2=(bestStrat[1].wins/bestStrat[1].total*100).toFixed(0);
        hi+=`Tumhari sabse best strategy "${bestStrat[0]}" hai — ${bestStrat[1].total} trades mein +${bestStrat[1].profit.toFixed(2)} P&L aur ${bsWR2}% win rate. Ye tumhari strongest setup hai. `;
        if(bestStrat[1].total<5)hi+=`Lekin sample size sirf ${bestStrat[1].total} trades hai — aur track karte raho confirm karne ke liye.\n\n`;
        else hi+=`${bestStrat[1].total} trades ka data statistically meaningful hai. Is strategy pe trust karo aur zyada opportunities dhundo.\n\n`;
      }
      if(worstStrat&&worstStrat[0]!==bestStrat?.[0]){
        const wsWR2=(worstStrat[1].wins/worstStrat[1].total*100).toFixed(0);
        hi+=`Sabse weak strategy "${worstStrat[0]}" rahi — ${worstStrat[1].total} trades mein ${worstStrat[1].profit.toFixed(2)} P&L aur ${wsWR2}% win rate. Ya toh isse band karo ya poori tarah entry criteria rethink karo. Is strategy pe zyada trading karne se fix nahi hogi.\n\n`;
      }
      if(bestPair){
        hi+=`Pair analysis mein ${bestPair[0]} tumhara strongest market hai — ${bestPair[1].total} trades mein +${bestPair[1].profit.toFixed(2)}. Tum clearly is pair ko achhe se samajhte ho. `;
        if(worstPair&&worstPair[0]!==bestPair[0])hi+=`${worstPair[0]} pe ${worstPair[1].profit.toFixed(2)} hua — socho ki is pair ko trade karna worth it hai ya nahi.\n\n`;
        else hi+="\n\n";
      }

      hi+="─────────────────────────────────────\n";
      hi+="⚠️ GALTIYAN (MISTAKE ANALYSIS)\n";
      hi+="─────────────────────────────────────\n\n";
      if(topMistakes.length===0){
        hi+=`Tumne koi mistake log nahi ki — ya toh tum perfectly execute kar rahe ho, ya journaling mein honest nahi ho. Suggest karunga ki har trade dobara dekho aur emotional ya technical errors tag karo — ye data hi journal ko powerful banata hai.\n\n`;
      }else{
        hi+=`Tumhari logged mistakes mein kuch clear behavioral patterns dikh rahe hain:\n\n`;
        topMistakes.forEach(([m,c])=>{
          hi+=`  • ${m} (${c} baar): `;
          if(m==="FOMO")hi+=`Entry miss hone ke baad market chase karna bahut costly habit hai. Market hamesha naye opportunities deta hai — ek setup miss hona forced trade lene ka reason nahi hai. Khud se pucho: "Kya main ye trade fresh dekhke leta?"\n`;
          else if(m==="Revenge Trade")hi+=`Loss recover karne ke liye emotionally trade lena bahut destructive hai. Har revenge trade loss ko compound karta hai. Losing trade ke baad minimum 30 minutes ke liye charts band karo.\n`;
          else if(m==="No SL")hi+=`Stop Loss ke bina trading gambling hai, trading nahi. Har ek trade mein, chahe kitna bhi confident feel ho, predefined maximum loss zaroori hai. Ye non-negotiable hai.\n`;
          else if(m==="Overleverage")hi+=`High leverage emotional pressure amplify karta hai jo poor decisions ka karan banta hai. Leverage itna rakho ki ek loss tumhe stress na de.\n`;
          else if(m==="Early Exit")hi+=`Winners ko jaldi close karna silently R:R ratio kharab kar raha hai. Agar setup pe trust karke trade liya, toh TP tak jane do. SL breakeven pe move karo aur trade ko kaam karne do.\n`;
          else if(m==="Late Entry")hi+=`Optimal zone ke baad entry karna risk badhata hai aur reward kam karta hai. Agar entry miss ho gayi, next setup ka wait karo.\n`;
          else hi+=`Ye pattern baar baar aa raha hai — in specific trades ko analyze karo aur dhundo ki kya trigger karta hai ye mistake.\n`;
        });
        hi+="\n";
      }

      hi+="─────────────────────────────────────\n";
      hi+="🛡️ RISK MANAGEMENT\n";
      hi+="─────────────────────────────────────\n\n";
      hi+=`Tumhara max win streak ${maxWS} aur max loss streak ${maxLS} raha. `;
      if(maxLS>=4)hi+=`${maxLS} consecutive losses ek significant streak hai. Losing streak mein position size badhaana sabse badi galti hoti hai — ulta karo, size 50% kam karo jab tak winning wapas aaye.\n\n`;
      else hi+=`${maxLS} ka max loss streak manageable hai. Rule banao: 3 consecutive losses ke baad us din trading band — review karo ki kya galat hua.\n\n`;
      if(noSlCount>0)hi+=`Tumne ${noSlCount} baar bina Stop Loss ke trade liya. Ye tumhari sabse badi risk management failure hai. Ek bina SL ka trade weeks ki kamai khatam kar sakta hai — aage se ye zero hona chahiye.\n\n`;

      hi+="─────────────────────────────────────\n";
      hi+=`🧘 TRADING PSYCHOLOGY — ${psychScore}/100 ${psychEmoji} (${psychLabel})\n`;
      hi+="─────────────────────────────────────\n\n";
      if(psychScore>=85)hi+=`Tumhara psychology score outstanding hai. Strong emotional discipline dikh raha hai — revenge trading low, FOMO controlled, mistakes manageable. Ye wahi foundation hai jo consistent traders ko baaki se alag banati hai. Journaling continue rakho — clearly kaam kar raha hai.\n\n`;
      else if(psychScore>=70)hi+=`Psychology generally achha hai, lekin kuch emotional leaks hain. ${topMistakes.slice(0,2).map(m=>m[0]).join(" aur ")} — ye strategy issues nahi, emotion-driven issues hain. Har trade se pehle ek pre-trade checklist complete karo. Ye tumhein slow down karke sochne pe majboor karega.\n\n`;
      else if(psychScore>=50)hi+=`Psychology pe attention chahiye. Multiple emotional patterns dikh rahe hain — ${topMistakes.slice(0,3).map(m=>m[0]).join(", ")}. Ye random nahi, habits ban rahi hain. Fix: exactly define karo kab trade karoge, kis condition pe, aur loss ke baad kya karoge. Likh lo aur strictly follow karo.\n\n`;
      else hi+=`Psychology score low hai aur directly P&L affect ho raha hai. Emotional decisions baar baar aa rahe hain. Strongly recommend karunga ki 3 din trading band karo, har losing trade review karo, aur strict plan banao clear rules ke saath before returning.\n\n`;

      hi+="─────────────────────────────────────\n";
      hi+=`🏆 FINAL VERDICT — ${traderLevel}\n`;
      hi+="─────────────────────────────────────\n\n";
      hi+=`Poore data ke basis pe, abhi ke liye tumhare 3 sabse important action items:\n\n`;
      if(rr<1.5)hi+=`1. Risk/Reward turant fix karo. Tumhara average win (${avgWin.toFixed(2)}) average loss (${avgLoss.toFixed(2)}) ka kam se kam 1.5x hona chahiye. Dekho kahan TP place kar rahe ho — shayad bahut jaldi exit kar rahe ho.\n\n`;
      else hi+=`1. Tumhara ${rr.toFixed(2)} ka R:R strong hai — ise protect karo. Koi bhi trade mat lo jahan potential reward risk ka 1.5x se kam ho.\n\n`;
      if(topMistakes.length>0)hi+=`2. Tumhari sabse damaging habit "${topMistakes[0][0]}" hai (${topMistakes[0][1]} baar). Agle trade se pehle ek specific rule likho is mistake ko rokne ke liye.\n\n`;
      else hi+=`2. Koi mistakes log nahi — achha start hai. Ab har trade ko quality tag karo (A+, A, B) identify karne ke liye ki kis setup pe zyada size deserve karti hai.\n\n`;
      if(bestStrat)hi+=`3. "${bestStrat[0]}" pe double down karo — ye tumhari highest-performing strategy hai. Isme zyada high-quality setups dhundo aur weaker strategies pe exposure kam karo.\n\n`;
      hi+=`Yaad rakho: process mein consistency results mein consistency laati hai. Jo traders long-term survive karte hain wo wo nahi hain jinhe magic strategy milti hai — wo hain jo same disciplined approach trade after trade, month after month execute karte hain.\n`;

      result.className = "ai-result";
      result.textContent = en + hi;

    } catch(e) {
      result.className = "ai-result";
      result.textContent = "❌ Error: " + e.message;
    }
    btn.disabled = false;
    btn.textContent = "▶ Run AI Review";
  }, 2200);
};

// =============================================
//   GOALS TAB
// =============================================

function saveGoal() {
  const goal = parseFloat(document.getElementById("monthlyGoal").value);
  if (isNaN(goal)) return;
  localStorage.setItem("monthlyGoal", goal);
  renderGoalDisplay(); renderGoalChart();
}

function renderGoalDisplay() {
  const goal = parseFloat(localStorage.getItem("monthlyGoal"));
  const now = new Date();
  const monthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  let monthlyProfit = 0;
  trades.forEach(t => {
    if (t.exit === null) return;
    const d = new Date(t.date);
    if (isNaN(d)) return;
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (k === monthKey) monthlyProfit += (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
  });
  const display = document.getElementById("goalDisplay");
  if (isNaN(goal)) { display.innerHTML = "<p style='color:#64748b'>No goal set yet.</p>"; return; }
  const pct = Math.min(Math.max((monthlyProfit / goal) * 100, 0), 100).toFixed(1);
  const fillCls = monthlyProfit < 0 ? "loss" : monthlyProfit >= goal ? "over" : "";
  display.innerHTML = `
    <div class="goal-title">This Month: <strong>${now.toLocaleString("default", { month: "long", year: "numeric" })}</strong></div>
    <div class="goal-progress-bar"><div class="goal-progress-fill ${fillCls}" style="width:${pct}%"></div></div>
    <div class="goal-stats">
      <span>Goal: <strong>${goal.toLocaleString()}</strong></span>
      <span>Earned: <strong class="${monthlyProfit >= 0 ? "profit" : "loss"}">${monthlyProfit.toFixed(2)}</strong></span>
      <span>Progress: <strong>${pct}%</strong></span>
      <span>Remaining: <strong>${Math.max(goal - monthlyProfit, 0).toFixed(2)}</strong></span>
    </div>`;
}

let goalChart;
function renderGoalChart() {
  const monthMap = {};
  trades.forEach(t => {
    if (t.exit === null) return;
    const d = new Date(t.date);
    if (isNaN(d)) return;
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthMap[k] = (monthMap[k] || 0) + (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
  });
  const goal = parseFloat(localStorage.getItem("monthlyGoal")) || 0;
  const labels = Object.keys(monthMap).sort();
  const data = labels.map(k => monthMap[k]);
  const goalLine = labels.map(() => goal);
  const ctx = document.getElementById("goalChart").getContext("2d");
  if (goalChart) goalChart.destroy();
  goalChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Monthly Profit", data, backgroundColor: data.map(v => v >= 0 ? "#3b82f6" : "#ef4444"), borderRadius: 6 },
        { label: "Goal", data: goalLine, type: "line", borderColor: "#f59e0b", borderDash: [6, 4], pointRadius: 0, fill: false }
      ]
    },
    options: { plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } }
  });
}

// =============================================
//   TRADE REPLAY TAB
// =============================================

let replayIndex = 0, replayTimer = null, replayRunning = false, replayChartObj = null;

function replayPlay() {
  if (replayRunning) return;
  const closed = trades.filter(t => t.exit !== null);
  if (closed.length === 0) { alert("No closed trades found!"); return; }
  replayRunning = true;
  function step() {
    const closed = trades.filter(t => t.exit !== null);
    if (replayIndex >= closed.length) { replayRunning = false; return; }
    const t = closed[replayIndex];
    const profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    const equity = closed.slice(0, replayIndex + 1).reduce((sum, tr) => sum + (tr.positionType === "Short" ? (tr.entry - tr.exit) : (tr.exit - tr.entry)) * tr.qty, 0);
    document.getElementById("replayTradeCard").innerHTML = `
      <div class="rtc-header">
        <span class="rtc-pair">${t.pair} <span class="${t.positionType === "Short" ? "short-badge" : "long-badge"}">${t.positionType}</span></span>
        <span class="rtc-profit ${profit >= 0 ? "profit" : "loss"}">${profit >= 0 ? "+" : ""}${profit.toFixed(2)}</span>
      </div>
      <div class="rtc-details">
        <span>📅 <strong>${t.date}</strong></span>
        <span>Entry: <strong>${t.entry}</strong></span>
        <span>Exit: <strong>${t.exit}</strong></span>
        <span>Qty: <strong>${t.qty}</strong></span>
        <span>Strategy: <strong>${t.strategy}</strong></span>
        ${t.mistakeType ? `<span>Mistake: <strong style="color:#ef4444">${t.mistakeType}</strong></span>` : ""}
      </div>`;
    const pct = ((replayIndex + 1) / closed.length * 100).toFixed(1);
    document.getElementById("replayProgressFill").style.width = pct + "%";
    const labels = closed.slice(0, replayIndex + 1).map((_, i) => "T" + (i + 1));
    const equities = closed.slice(0, replayIndex + 1).reduce((arr, tr) => {
      arr.push((arr[arr.length - 1] || 0) + (tr.positionType === "Short" ? (tr.entry - tr.exit) : (tr.exit - tr.entry)) * tr.qty); return arr;
    }, []);
    const ctx = document.getElementById("replayChart").getContext("2d");
    if (replayChartObj) replayChartObj.destroy();
    replayChartObj = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ data: equities, borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.15)", fill: true, tension: 0.4 }] },
      options: { plugins: { legend: { display: false } }, animation: { duration: 300 } }
    });
    const wins = closed.slice(0, replayIndex + 1).filter(tr => (tr.positionType === "Short" ? (tr.entry - tr.exit) : (tr.exit - tr.entry)) * tr.qty > 0).length;
    document.getElementById("replayStats").innerHTML = `
      <div class="replay-stat-box"><h4>Trade</h4><p>${replayIndex + 1}/${closed.length}</p></div>
      <div class="replay-stat-box"><h4>Equity</h4><p class="${equity >= 0 ? "profit" : "loss"}">${equity.toFixed(2)}</p></div>
      <div class="replay-stat-box"><h4>Win Rate</h4><p>${((wins / (replayIndex + 1)) * 100).toFixed(1)}%</p></div>`;
    replayIndex++;
    const speed = parseInt(document.getElementById("replaySpeed").value) || 800;
    replayTimer = setTimeout(step, speed);
  }
  step();
}

function replayPause() { clearTimeout(replayTimer); replayRunning = false; }

function replayReset() {
  clearTimeout(replayTimer); replayRunning = false; replayIndex = 0;
  document.getElementById("replayTradeCard").innerHTML = "<p style='color:#64748b;text-align:center'>Press Play to start the replay</p>";
  document.getElementById("replayProgressFill").style.width = "0%";
  document.getElementById("replayStats").innerHTML = "";
  if (replayChartObj) { replayChartObj.destroy(); replayChartObj = null; }
}

// =============================================
//   SESSION ANALYSIS TAB
// =============================================

let sessionProfitChart, sessionWinChart, dayChart;

function renderSessionAnalysis() {
  const sessions = {
    morning:   { name: "🌅 Morning",   cls: "morning",   profit: 0, wins: 0, total: 0 },
    afternoon: { name: "☀️ Afternoon", cls: "afternoon", profit: 0, wins: 0, total: 0 },
    evening:   { name: "🌆 Evening",   cls: "evening",   profit: 0, wins: 0, total: 0 },
    night:     { name: "🌙 Night",     cls: "night",     profit: 0, wins: 0, total: 0 }
  };
  const days = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  trades.forEach(t => {
    if (!t.tradeOpenTime || t.exit === null) return;
    const d = new Date(t.tradeOpenTime);
    if (isNaN(d)) return;
    const h = d.getHours();
    const profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    const dayKey = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    days[dayKey] += profit;
    let sess;
    if (h >= 6 && h < 12) sess = "morning";
    else if (h >= 12 && h < 16) sess = "afternoon";
    else if (h >= 16 && h < 20) sess = "evening";
    else sess = "night";
    sessions[sess].profit += profit;
    sessions[sess].total++;
    if (profit > 0) sessions[sess].wins++;
  });
  const bestSession = Object.entries(sessions).sort((a, b) => b[1].profit - a[1].profit)[0][0];
  document.getElementById("sessionCards").innerHTML = Object.entries(sessions).map(([key, s]) => `
    <div class="session-card ${s.cls}">
      <h4>${s.name}</h4>
      <div class="sc-profit ${s.profit >= 0 ? "profit" : "loss"}">${s.profit >= 0 ? "+" : ""}${s.profit.toFixed(2)}</div>
      <div class="sc-meta">${s.total} trades · ${s.total ? (s.wins / s.total * 100).toFixed(0) : 0}% win rate</div>
      ${key === bestSession && s.total > 0 ? '<span class="session-best-badge">⭐ Best</span>' : ''}
    </div>`).join("");
  const sLabels = Object.values(sessions).map(s => s.name);
  const sProfits = Object.values(sessions).map(s => s.profit);
  const sWinRates = Object.values(sessions).map(s => s.total ? (s.wins / s.total * 100).toFixed(1) : 0);
  const ctx1 = document.getElementById("sessionProfitChart").getContext("2d");
  if (sessionProfitChart) sessionProfitChart.destroy();
  sessionProfitChart = new Chart(ctx1, {
    type: "bar",
    data: { labels: sLabels, datasets: [{ data: sProfits, backgroundColor: sProfits.map(v => v >= 0 ? "#22c55e" : "#ef4444"), borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } } }
  });
  const ctx2 = document.getElementById("sessionWinChart").getContext("2d");
  if (sessionWinChart) sessionWinChart.destroy();
  sessionWinChart = new Chart(ctx2, {
    type: "bar",
    data: { labels: sLabels, datasets: [{ data: sWinRates, backgroundColor: "#6366f1", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
  });
  const ctx3 = document.getElementById("dayChart").getContext("2d");
  if (dayChart) dayChart.destroy();
  dayChart = new Chart(ctx3, {
    type: "bar",
    data: {
      labels: Object.keys(days),
      datasets: [{ data: Object.values(days), backgroundColor: Object.values(days).map(v => v >= 0 ? "#3b82f6" : "#ef4444"), borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

// =============================================
//   TRADER SCORE TAB
// =============================================

let scoreChart;

function renderTraderScore() {
  const closed = trades.filter(t => t.exit !== null);
  if (closed.length === 0) {
    document.getElementById("traderScoreDisplay").innerHTML = "<p style='color:#64748b;padding:20px'>Add some trades to see your Trader Score!</p>";
    document.getElementById("scoreStats").innerHTML = "";
    return;
  }

  // 1. DISCIPLINE SCORE (0-100) — based on mistakes
  const mistakes = closed.filter(t => t.mistakeType && t.mistakeType !== "").length;
  const mistakeRate = mistakes / closed.length;
  const disciplineScore = Math.round(Math.max(0, 100 - (mistakeRate * 100)));

  // 2. CONSISTENCY SCORE (0-100) — based on win rate stability month by month
  const monthMap = {};
  closed.forEach(t => {
    const d = new Date(t.date);
    if (isNaN(d)) return;
    const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2,"0");
    if (!monthMap[k]) monthMap[k] = { wins: 0, total: 0 };
    monthMap[k].total++;
    const profit = (t.positionType === "Short" ? (t.entry - t.exit) : (t.exit - t.entry)) * t.qty;
    if (profit > 0) monthMap[k].wins++;
  });
  const monthlyRates = Object.values(monthMap).map(m => m.total ? m.wins / m.total : 0);
  let consistencyScore = 50;
  if (monthlyRates.length >= 2) {
    const avg = monthlyRates.reduce((a, b) => a + b, 0) / monthlyRates.length;
    const variance = monthlyRates.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / monthlyRates.length;
    const stdDev = Math.sqrt(variance);
    consistencyScore = Math.round(Math.max(0, Math.min(100, 100 - (stdDev * 150))));
  } else if (monthlyRates.length === 1) {
    consistencyScore = Math.round(monthlyRates[0] * 100);
  }

  // 3. RISK SCORE (0-100) — based on SL usage and leverage discipline
  const withSL = closed.filter(t => t.stopLoss !== null).length;
  const slUsageScore = Math.round((withSL / closed.length) * 100);
  const highLeverage = closed.filter(t => t.leverage && t.leverage > 20).length;
  const leveragePenalty = Math.round((highLeverage / closed.length) * 40);
  const riskScore = Math.max(0, Math.min(100, slUsageScore - leveragePenalty));

  // OVERALL SCORE
  const overallScore = Math.round((disciplineScore * 0.35) + (consistencyScore * 0.35) + (riskScore * 0.30));

  // Grade
  let grade, gradeColor, gradeMsg;
  if (overallScore >= 80) { grade = "A+"; gradeColor = "#00f5c4"; gradeMsg = "Elite Trader 🔥"; }
  else if (overallScore >= 65) { grade = "A"; gradeColor = "#22c55e"; gradeMsg = "Strong Trader 💪"; }
  else if (overallScore >= 50) { grade = "B"; gradeColor = "#3b82f6"; gradeMsg = "Developing Trader 📈"; }
  else if (overallScore >= 35) { grade = "C"; gradeColor = "#f59e0b"; gradeMsg = "Needs Improvement ⚠️"; }
  else { grade = "D"; gradeColor = "#ef4444"; gradeMsg = "Work on Discipline ❌"; }

  // Display
  document.getElementById("traderScoreDisplay").innerHTML = `
    <div style="text-align:center;padding:32px;background:var(--glass);border:1px solid var(--gb);border-radius:20px;margin-bottom:20px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${gradeColor},#6366f1);"></div>
      <div style="font-size:72px;font-weight:900;font-family:var(--font-m);color:${gradeColor};line-height:1;">${overallScore}</div>
      <div style="font-size:13px;color:var(--muted2);margin:4px 0 8px;">out of 100</div>
      <div style="display:inline-block;padding:6px 20px;border-radius:99px;background:${gradeColor}22;border:1px solid ${gradeColor}44;font-size:14px;font-weight:700;color:${gradeColor};">Grade ${grade} — ${gradeMsg}</div>
      <div style="margin-top:20px;font-size:13px;color:var(--muted2);">Based on ${closed.length} closed trades</div>
    </div>`;

  document.getElementById("scoreStats").innerHTML = `
    <div class="stat-box">
      <h3>🎯 Discipline</h3>
      <p style="color:${disciplineScore >= 70 ? '#00f5c4' : disciplineScore >= 40 ? '#f59e0b' : '#ef4444'}">${disciplineScore}/100</p>
      <small style="color:var(--muted2);font-size:11px;">${mistakes} mistakes in ${closed.length} trades</small>
    </div>
    <div class="stat-box">
      <h3>📊 Consistency</h3>
      <p style="color:${consistencyScore >= 70 ? '#00f5c4' : consistencyScore >= 40 ? '#f59e0b' : '#ef4444'}">${consistencyScore}/100</p>
      <small style="color:var(--muted2);font-size:11px;">Win rate stability</small>
    </div>
    <div class="stat-box">
      <h3>🛡️ Risk Mgmt</h3>
      <p style="color:${riskScore >= 70 ? '#00f5c4' : riskScore >= 40 ? '#f59e0b' : '#ef4444'}">${riskScore}/100</p>
      <small style="color:var(--muted2);font-size:11px;">SL: ${withSL}/${closed.length} trades</small>
    </div>`;

  // Chart
  const ctx = document.getElementById("scoreChart").getContext("2d");
  if (scoreChart) scoreChart.destroy();
  scoreChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: ["Discipline", "Consistency", "Risk Management"],
      datasets: [{
        data: [disciplineScore, consistencyScore, riskScore],
        backgroundColor: "rgba(99,102,241,0.2)",
        borderColor: "#6366f1",
        borderWidth: 2,
        pointBackgroundColor: "#00f5c4",
        pointRadius: 5
      }]
    },
    options: {
      scales: { r: { beginAtZero: true, max: 100, ticks: { color: "#64748b", stepSize: 25 }, grid: { color: "rgba(255,255,255,0.06)" }, pointLabels: { color: "#e2e8f0", font: { size: 13 } } } },
      plugins: { legend: { display: false } }
    }
  });
}

// =============================================
//   INIT
// =============================================

updateAccountDisplay();
renderCalendar();
