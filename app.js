const NUMBERS = Array.from({ length: 25 }, (_, index) => index + 1);
const state = {
  data: null,
  analysis: null,
  games: [],
  installPrompt: null,
};

const $ = (selector) => document.querySelector(selector);
const installButtons = () => [$("#installApp"), $("#installAppMobile")].filter(Boolean);

function formatNumber(value) {
  return String(value).padStart(2, "0");
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function combinations(items, size) {
  const output = [];
  const walk = (start, combo) => {
    if (combo.length === size) {
      output.push([...combo]);
      return;
    }
    for (let index = start; index <= items.length - (size - combo.length); index += 1) {
      combo.push(items[index]);
      walk(index + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return output;
}

function analyze(results, recentWindow) {
  const sorted = [...results].sort((a, b) => b.contest - a.contest);
  const recent = sorted.slice(0, recentWindow);
  const total = sorted.length;
  const frequency = Object.fromEntries(NUMBERS.map((number) => [number, 0]));
  const recentFrequency = Object.fromEntries(NUMBERS.map((number) => [number, 0]));
  const delay = Object.fromEntries(NUMBERS.map((number) => [number, null]));
  const pairCounts = new Map();
  const sums = [];

  sorted.forEach((draw, drawIndex) => {
    sums.push(draw.numbers.reduce((sum, number) => sum + number, 0));
    draw.numbers.forEach((number) => {
      frequency[number] += 1;
      if (delay[number] === null) delay[number] = drawIndex;
    });
    combinations(draw.numbers, 2).forEach(([a, b]) => {
      const key = `${a}-${b}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    });
  });

  recent.forEach((draw) => {
    draw.numbers.forEach((number) => {
      recentFrequency[number] += 1;
    });
  });

  const freqValues = NUMBERS.map((number) => frequency[number]);
  const recentValues = NUMBERS.map((number) => recentFrequency[number]);
  const delayValues = NUMBERS.map((number) => delay[number] ?? sorted.length);
  const maxFreq = Math.max(...freqValues);
  const maxRecent = Math.max(...recentValues);
  const maxDelay = Math.max(...delayValues);

  const ranking = NUMBERS.map((number) => {
    const freqScore = frequency[number] / maxFreq;
    const recentScore = recentFrequency[number] / Math.max(maxRecent, 1);
    const delayScore = (delay[number] ?? maxDelay) / Math.max(maxDelay, 1);
    const score = freqScore * 0.45 + recentScore * 0.35 + delayScore * 0.2;
    return {
      number,
      frequency: frequency[number],
      percentage: frequency[number] / total,
      recentFrequency: recentFrequency[number],
      delay: delay[number] ?? sorted.length,
      score,
    };
  }).sort((a, b) => b.score - a.score);

  const pairs = [...pairCounts.entries()]
    .map(([key, count]) => ({ key, count, numbers: key.split("-").map(Number) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    sorted,
    recent,
    ranking,
    pairs,
    avgSum: average(sums),
    minSum: Math.min(...sums),
    maxSum: Math.max(...sums),
  };
}

function scoreGame(numbers, analysis, strategy) {
  const rankByNumber = Object.fromEntries(analysis.ranking.map((item) => [item.number, item]));
  const sum = numbers.reduce((total, number) => total + number, 0);
  const odd = numbers.filter((number) => number % 2).length;
  const low = numbers.filter((number) => number <= 13).length;
  const rows = [0, 0, 0, 0, 0];
  const cols = [0, 0, 0, 0, 0];
  numbers.forEach((number) => {
    rows[Math.floor((number - 1) / 5)] += 1;
    cols[(number - 1) % 5] += 1;
  });

  const profileWeights = {
    balanced: { score: 0.55, delay: 0.15, freq: 0.15, recent: 0.15 },
    hot: { score: 0.35, delay: 0.05, freq: 0.45, recent: 0.15 },
    overdue: { score: 0.25, delay: 0.45, freq: 0.1, recent: 0.2 },
    mixed: { score: 0.35, delay: 0.25, freq: 0.2, recent: 0.2 },
  }[strategy];

  const raw = numbers.reduce((total, number) => {
    const item = rankByNumber[number];
    return total
      + item.score * profileWeights.score
      + item.delay * profileWeights.delay / 100
      + item.frequency * profileWeights.freq / 1000
      + item.recentFrequency * profileWeights.recent / 100;
  }, 0);

  const sumPenalty = Math.abs(sum - analysis.avgSum) / 30;
  const oddPenalty = Math.abs(odd - numbers.length / 2) * 0.18;
  const lowPenalty = Math.abs(low - numbers.length / 2) * 0.12;
  const rowPenalty = rows.filter((value) => value === 0 || value > 4).length * 0.18;
  const colPenalty = cols.filter((value) => value === 0 || value > 4).length * 0.12;

  return raw - sumPenalty - oddPenalty - lowPenalty - rowPenalty - colPenalty;
}

function createCandidate(analysis, strategy, size) {
  const pool = analysis.ranking.map((item, index) => {
    const weight = Math.max(1, Math.round((26 - index) * (1 + item.score)));
    return Array.from({ length: weight }, () => item.number);
  }).flat();
  const chosen = new Set();

  while (chosen.size < size) {
    chosen.add(pool[Math.floor(Math.random() * pool.length)]);
  }

  const numbers = [...chosen].sort((a, b) => a - b);
  return {
    numbers,
    score: scoreGame(numbers, analysis, strategy),
  };
}

function generateGames() {
  const count = Number($("#gameCount").value);
  const size = Number($("#gameSize").value);
  const strategy = $("#strategy").value;
  const seen = new Set();
  const candidates = [];

  for (let attempt = 0; attempt < count * 160; attempt += 1) {
    const candidate = createCandidate(state.analysis, strategy, size);
    const key = candidate.numbers.join("-");
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  state.games = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((game, index) => ({ ...game, index: index + 1 }));

  renderGames();
  renderBacktest();
}

function renderSummary() {
  const data = state.data;
  const results = state.analysis.sorted;
  $("#metricContests").textContent = data.total_contests || results.length;
  $("#metricLatest").textContent = data.latest_contest || results[0].contest;
  $("#metricAvgSum").textContent = Math.round(state.analysis.avgSum);
  $("#metricRange").textContent = `${results.at(-1).date} - ${results[0].date}`;
  $("#status").textContent = `Base: ${results.length} concursos. Fonte: ${data.source}`;
}

function renderRanking() {
  $("#numberRanking").innerHTML = state.analysis.ranking.map((item) => `
    <article class="number-card">
      <div class="number-card-header">
        <span class="ball">${formatNumber(item.number)}</span>
        <strong>${(item.percentage * 100).toFixed(1)}%</strong>
      </div>
      <div class="stat-row"><span>Historico</span><b>${item.frequency} vezes</b></div>
      <div class="stat-row"><span>Janela recente</span><b>${item.recentFrequency} vezes</b></div>
      <div class="stat-row"><span>Atraso atual</span><b>${item.delay} concursos</b></div>
    </article>
  `).join("");
}

function renderPairs() {
  $("#pairRanking").innerHTML = state.analysis.pairs.map((pair) => `
    <div class="pair">
      <span>${pair.numbers.map(formatNumber).join(" + ")}</span>
      <small>${pair.count} vezes</small>
    </div>
  `).join("");
}

function renderGames() {
  $("#games").innerHTML = state.games.map((game) => `
    <article class="game">
      <div class="game-title">
        Jogo ${game.index}
        <span class="game-meta">${game.numbers.length} numeros</span>
      </div>
      <div class="numbers">${game.numbers.map((number) => `<span class="mini-ball">${formatNumber(number)}</span>`).join("")}</div>
      <div class="game-score">
        <strong>${game.score.toFixed(2)} pontos</strong>
        <span>${describeGame(game.numbers)}</span>
      </div>
    </article>
  `).join("");
}

function describeGame(numbers) {
  const sum = numbers.reduce((total, number) => total + number, 0);
  const odd = numbers.filter((number) => number % 2).length;
  const even = numbers.length - odd;
  const low = numbers.filter((number) => number <= 13).length;
  const high = numbers.length - low;
  return `Soma ${sum} | ${odd} impares/${even} pares | ${low} baixos/${high} altos`;
}

function renderBacktest() {
  if (!state.games.length) return;
  const sample = state.analysis.sorted.slice(0, Math.min(120, state.analysis.sorted.length));
  const hits = { 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };
  let best = 0;

  sample.forEach((draw) => {
    state.games.forEach((game) => {
      const match = game.numbers.filter((number) => draw.numbers.includes(number)).length;
      best = Math.max(best, match);
      if (match >= 11) hits[match] = (hits[match] || 0) + 1;
    });
  });

  $("#backtest").innerHTML = `
    <div><strong>${best}</strong><small>maior acerto nos ultimos ${sample.length}</small></div>
    <div><strong>${hits[11] || 0}</strong><small>resultados com 11 acertos</small></div>
    <div><strong>${hits[12] || 0}</strong><small>resultados com 12 acertos</small></div>
    <div><strong>${hits[13] || 0}</strong><small>resultados com 13 acertos</small></div>
    <div><strong>${hits[14] || 0}</strong><small>resultados com 14 acertos</small></div>
    <div><strong>${hits[15] || 0}</strong><small>resultados com 15 acertos</small></div>
  `;
}

function downloadCsv() {
  const header = "numero,frequencia,percentual,frequencia_recente,atraso,pontuacao";
  const rows = state.analysis.ranking.map((item) => [
    formatNumber(item.number),
    item.frequency,
    (item.percentage * 100).toFixed(2),
    item.recentFrequency,
    item.delay,
    item.score.toFixed(4),
  ].join(","));
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ranking-lotofacil.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyGames() {
  const text = state.games
    .map((game) => `Jogo ${game.index}: ${game.numbers.map(formatNumber).join(" ")}`)
    .join("\n");
  await navigator.clipboard.writeText(text);
  $("#copyGames").textContent = "Copiado";
  showToast("Jogos copiados.");
  setTimeout(() => {
    $("#copyGames").textContent = "Copiar";
  }, 1500);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
}

function updateInstallButtons(visible) {
  installButtons().forEach((button) => {
    button.hidden = !visible;
  });
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    const choice = await state.installPrompt.userChoice;
    state.installPrompt = null;
    updateInstallButtons(false);
    if (choice.outcome === "accepted") showToast("App instalado.");
    return;
  }

  if (isIos()) {
    showToast("No iPhone, toque em Compartilhar e depois em Adicionar a Tela de Inicio.");
    return;
  }

  showToast("Se o botao de instalar nao aparecer, abra pelo Chrome e aguarde alguns segundos.");
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      showToast("Nao consegui ativar o modo offline agora.");
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    updateInstallButtons(!isStandalone());
  });

  window.addEventListener("appinstalled", () => {
    state.installPrompt = null;
    updateInstallButtons(false);
    showToast("Instalado na tela inicial.");
  });

  if (isIos() && !isStandalone()) {
    updateInstallButtons(true);
  }
}

function refreshAnalysis() {
  state.analysis = analyze(state.data.results, Number($("#recentWindow").value));
  renderSummary();
  renderRanking();
  renderPairs();
  generateGames();
}

async function init() {
  try {
    const response = await fetch("data/lotofacil.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Nao foi possivel carregar data/lotofacil.json");
    state.data = await response.json();
    refreshAnalysis();
  } catch (error) {
    $("#status").textContent = error.message;
  }
}

$("#generate").addEventListener("click", generateGames);
$("#recentWindow").addEventListener("change", refreshAnalysis);
$("#strategy").addEventListener("change", generateGames);
$("#gameSize").addEventListener("change", generateGames);
$("#downloadCsv").addEventListener("click", downloadCsv);
$("#copyGames").addEventListener("click", copyGames);
installButtons().forEach((button) => button.addEventListener("click", installApp));

setupPwa();
init();
