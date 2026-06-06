const NUMBERS = Array.from({ length: 25 }, (_, index) => index + 1);
const STORAGE_KEY = "lotofacil-played-games-v1";
const SUPABASE_SESSION_STORAGE = "lotofacil-supabase-session-v1";
const MAX_HISTORY_ENTRIES = 2000;
const state = {
  data: null,
  analysis: null,
  games: [],
  installPrompt: null,
  supabaseSession: null,
  strategyBacktestReady: false,
};

const $ = (selector) => document.querySelector(selector);
const installButtons = () => [$("#installApp"), $("#installAppMobile")].filter(Boolean);

function formatNumber(value) {
  return String(value).padStart(2, "0");
}

function gameKey(numbers) {
  return [...numbers].sort((a, b) => a - b).map(formatNumber).join("-");
}

function getPlayedGames() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setPlayedGames(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
}

function supabaseConfig() {
  const config = window.LOTOFACIL_SUPABASE || {};
  return {
    url: (config.url || "").replace(/\/$/, ""),
    anonKey: config.anonKey || "",
    table: config.table || "played_games",
    resultsTable: config.resultsTable || "lotofacil_results",
  };
}

function isSupabaseReady() {
  const config = supabaseConfig();
  return Boolean(config.url && config.anonKey && !config.url.includes("SEU-PROJETO"));
}

function setCloudStatus(message, type = "muted") {
  const status = $("#cloudStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function getStoredSupabaseSession() {
  try {
    return JSON.parse(localStorage.getItem(SUPABASE_SESSION_STORAGE) || "null");
  } catch {
    return null;
  }
}

function setSupabaseSession(session) {
  state.supabaseSession = session;
  if (session) localStorage.setItem(SUPABASE_SESSION_STORAGE, JSON.stringify(session));
  else localStorage.removeItem(SUPABASE_SESSION_STORAGE);
  renderCloudAuth();
}

function renderCloudAuth() {
  const signedIn = Boolean(state.supabaseSession?.access_token);
  const email = state.supabaseSession?.user?.email;
  if ($("#cloudEmail")) $("#cloudEmail").disabled = signedIn;
  if ($("#cloudPassword")) $("#cloudPassword").disabled = signedIn;
  if ($("#cloudLogin")) $("#cloudLogin").hidden = signedIn;
  if ($("#cloudLogout")) $("#cloudLogout").hidden = !signedIn;
  if (signedIn) setCloudStatus(`Conectado como ${email}.`, "ok");
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function formatUpdatedAt(value) {
  if (!value) return "sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDrawDate(value) {
  if (!value) return "";
  if (value.includes("/")) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function isLocalServer() {
  return ["localhost", "127.0.0.1", "192.168.1.6"].includes(window.location.hostname)
    || window.location.hostname.startsWith("192.168.")
    || window.location.hostname.startsWith("10.")
    || window.location.hostname.startsWith("172.");
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

function combinationCount(n, k) {
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = result * (n - index + 1) / index;
  }
  return Math.round(result);
}

function estimatedGameCost(size) {
  return combinationCount(size, 15) * 3.5;
}

function intersectionCount(a, b) {
  return a.filter((number) => b.includes(number)).length;
}

function maxSequentialRun(numbers) {
  let best = 1;
  let current = 1;
  for (let index = 1; index < numbers.length; index += 1) {
    if (numbers[index] === numbers[index - 1] + 1) current += 1;
    else current = 1;
    best = Math.max(best, current);
  }
  return best;
}

function gameProfile(numbers) {
  const sum = numbers.reduce((total, number) => total + number, 0);
  const odd = numbers.filter((number) => number % 2).length;
  const even = numbers.length - odd;
  const low = numbers.filter((number) => number <= 13).length;
  const high = numbers.length - low;
  const rows = [0, 0, 0, 0, 0];
  const cols = [0, 0, 0, 0, 0];
  numbers.forEach((number) => {
    rows[Math.floor((number - 1) / 5)] += 1;
    cols[(number - 1) % 5] += 1;
  });
  return { sum, odd, even, low, high, rows, cols, sequence: maxSequentialRun(numbers) };
}

function gameIssues(numbers, analysis) {
  const profile = gameProfile(numbers);
  const latest = analysis.sorted[0]?.numbers || [];
  const repeatLatest = intersectionCount(numbers, latest);
  const maxOldSimilarity = maxHistoricalSimilarity(numbers, analysis);
  const [minRepeat, maxRepeat] = selectedLastRepeatRange(numbers.length);
  const idealHalf = numbers.length / 2;
  const issues = [];

  if (Math.abs(profile.sum - analysis.avgSum) > 38) issues.push("soma fora do padrao");
  if (Math.abs(profile.odd - idealHalf) > 2) issues.push("paridade desequilibrada");
  if (Math.abs(profile.low - idealHalf) > 2) issues.push("baixos/altos desequilibrado");
  if (profile.sequence >= 6) issues.push("sequencia longa");
  if (profile.rows.some((value) => value === 0 || value > 4)) issues.push("linhas concentradas");
  if (profile.cols.some((value) => value === 0 || value > 4)) issues.push("colunas concentradas");
  if (repeatLatest > Math.ceil(numbers.length * 0.75)) issues.push("repete demais o ultimo sorteio");
  if (repeatLatest < minRepeat || repeatLatest > maxRepeat) issues.push("fora da faixa de repeticao do ultimo");
  if (maxOldSimilarity >= 14) issues.push("muito parecido com concurso antigo");
  return issues;
}

function isStrongEnough(numbers, analysis) {
  return gameIssues(numbers, analysis).length === 0;
}

function qualityScore(numbers, analysis) {
  const profile = gameProfile(numbers);
  const latest = analysis.sorted[0]?.numbers || [];
  const repeatLatest = intersectionCount(numbers, latest);
  const sumDeviation = Math.abs(profile.sum - analysis.avgSum) / Math.max(analysis.stdSum, 1);
  const repeatDeviation = Math.abs(repeatLatest - analysis.avgRepeat) / Math.max(analysis.stdRepeat, 1);
  const parityExcess = Math.max(0, Math.abs(profile.odd - numbers.length / 2) - 0.5);
  const lowExcess = Math.max(0, Math.abs(profile.low - numbers.length / 2) - 0.5);
  const rowPenalty = profile.rows.filter((value) => value === 0 || value === 5).length * 5;
  const colPenalty = profile.cols.filter((value) => value === 0 || value === 5).length * 4;
  const sequencePenalty = Math.max(0, profile.sequence - 5) * 4;
  const similarityPenalty = Math.max(0, maxHistoricalSimilarity(numbers, analysis) - 13) * 5;
  const penalty = sumDeviation * 7
    + repeatDeviation * 3
    + parityExcess * 7
    + lowExcess * 6
    + rowPenalty
    + colPenalty
    + sequencePenalty
    + similarityPenalty;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
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
  const repeats = [];

  sorted.forEach((draw, drawIndex) => {
    sums.push(draw.numbers.reduce((sum, number) => sum + number, 0));
    if (sorted[drawIndex + 1]) repeats.push(intersectionCount(draw.numbers, sorted[drawIndex + 1].numbers));
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
    stdSum: standardDeviation(sums),
    avgRepeat: average(repeats),
    stdRepeat: standardDeviation(repeats),
    minSum: Math.min(...sums),
    maxSum: Math.max(...sums),
  };
}

function selectedLastRepeatRange(size) {
  const value = $("#lastRepeatRange")?.value || "auto";
  if (value === "auto") {
    if (size <= 15) return [7, 10];
    if (size <= 17) return [8, 12];
    return [9, 14];
  }
  return value.split("-").map(Number);
}

function maxHistoricalSimilarity(numbers, analysis, limit = 500) {
  return analysis.sorted.slice(0, limit).reduce((best, draw) => (
    Math.max(best, intersectionCount(numbers, draw.numbers))
  ), 0);
}

function explainGame(numbers, analysis) {
  const latest = analysis.sorted[0]?.numbers || [];
  const profile = gameProfile(numbers);
  const ranked = Object.fromEntries(analysis.ranking.map((item, index) => [item.number, index + 1]));
  const topNumbers = numbers.filter((number) => ranked[number] <= 10).length;
  const overdue = numbers.filter((number) => (analysis.ranking.find((item) => item.number === number)?.delay || 0) >= 4).length;
  const repeatLatest = intersectionCount(numbers, latest);
  const similarity = maxHistoricalSimilarity(numbers, analysis);
  return [
    `soma ${profile.sum}, media historica ${Math.round(analysis.avgSum)}`,
    `${profile.odd}/${profile.even} impares/pares`,
    `${topNumbers} numeros no top 10 do ranking`,
    `${overdue} numeros com atraso relevante`,
    `${repeatLatest} repetidos do ultimo sorteio`,
    `maximo ${similarity} iguais a concurso antigo`,
  ];
}

function scoreGame(numbers, analysis, strategy) {
  const rankByNumber = Object.fromEntries(analysis.ranking.map((item) => [item.number, item]));
  const profile = gameProfile(numbers);

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

  const sumPenalty = Math.abs(profile.sum - analysis.avgSum) / 30;
  const oddPenalty = Math.abs(profile.odd - numbers.length / 2) * 0.18;
  const lowPenalty = Math.abs(profile.low - numbers.length / 2) * 0.12;
  const rowPenalty = profile.rows.filter((value) => value === 0 || value > 4).length * 0.18;
  const colPenalty = profile.cols.filter((value) => value === 0 || value > 4).length * 0.12;
  const issuePenalty = gameIssues(numbers, analysis).length * 0.45;

  const historicalComponent = strategy === "balanced" ? 0 : raw * 0.15;
  return qualityScore(numbers, analysis) / 10
    + historicalComponent
    - sumPenalty * 0.1
    - oddPenalty
    - lowPenalty
    - rowPenalty
    - colPenalty
    - issuePenalty;
}

function createCandidate(analysis, strategy, size) {
  const pool = strategy === "balanced" ? NUMBERS : analysis.ranking.map((item, index) => {
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
  state.strategyBacktestReady = false;
  const mode = $("#generationMode").value;
  const requestedCount = Number($("#gameCount").value);
  const count = mode === "daily" ? 1 : requestedCount;
  const size = Number($("#gameSize").value);
  const strategy = $("#strategy").value;
  const playedKeys = new Set(getPlayedGames().map((entry) => entry.key));
  const seen = new Set();
  const candidates = [];

  if (mode === "closure20") {
    state.games = generateClosureGames(count, strategy, playedKeys);
    finishGeneration();
    return;
  }

  const attemptMultiplier = mode === "diversified" ? 320 : 160;
  for (let attempt = 0; attempt < count * attemptMultiplier; attempt += 1) {
    const candidate = createCandidate(state.analysis, strategy, size);
    const key = candidate.numbers.join("-");
    if (!seen.has(key) && !playedKeys.has(gameKey(candidate.numbers)) && isStrongEnough(candidate.numbers, state.analysis)) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  for (let attempt = 0; candidates.length < count && attempt < count * 120; attempt += 1) {
    const candidate = createCandidate(state.analysis, strategy, size);
    const key = candidate.numbers.join("-");
    if (!seen.has(key) && !playedKeys.has(gameKey(candidate.numbers))) {
      seen.add(key);
      candidates.push(candidate);
    }
  }

  const selected = mode === "diversified"
    ? selectDiversifiedGames(candidates, count, size)
    : candidates.sort((a, b) => b.score - a.score).slice(0, count);

  state.games = selected.map((game, index) => ({ ...game, index: index + 1 }));

  finishGeneration();
}

function selectDiversifiedGames(candidates, count, size) {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const selected = [];
  const targetOverlap = size <= 15 ? 8 : Math.ceil(size * 0.55);

  while (selected.length < count && pool.length) {
    const ranked = pool
      .map((candidate) => {
        const overlaps = selected.map((game) => intersectionCount(candidate.numbers, game.numbers));
        const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0;
        const avgOverlap = overlaps.length ? average(overlaps) : 0;
        const covered = new Set(selected.flatMap((game) => game.numbers));
        const newNumbers = candidate.numbers.filter((number) => !covered.has(number)).length;
        const memberships = Object.fromEntries(NUMBERS.map((number) => [
          number,
          selected.filter((game) => game.numbers.includes(number)).length + (candidate.numbers.includes(number) ? 1 : 0),
        ]));
        const membershipSpread = Math.max(...Object.values(memberships)) - Math.min(...Object.values(memberships));
        const excessOverlap = Math.max(0, maxOverlap - targetOverlap);
        return {
          candidate,
          adjustedScore: candidate.score
            - excessOverlap * 0.9
            - avgOverlap * 0.08
            - membershipSpread * 0.12
            + newNumbers * 0.45,
        };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore);

    const best = ranked[0].candidate;
    selected.push(best);
    const bestKey = gameKey(best.numbers);
    const index = pool.findIndex((candidate) => gameKey(candidate.numbers) === bestKey);
    if (index >= 0) pool.splice(index, 1);
  }

  return selected;
}

function generateClosureGames(count, strategy, playedKeys) {
  const base = state.analysis.ranking.slice(0, 20).map((item) => item.number).sort((a, b) => a - b);
  const removable = [...base].sort((a, b) => {
    const scoreA = state.analysis.ranking.find((item) => item.number === a)?.score || 0;
    const scoreB = state.analysis.ranking.find((item) => item.number === b)?.score || 0;
    return scoreA - scoreB;
  });
  const games = [];
  const seen = new Set();

  for (let attempt = 0; attempt < count * 120 && games.length < count; attempt += 1) {
    const offset = attempt % removable.length;
    const shuffled = [...removable.slice(offset), ...removable.slice(0, offset)];
    const remove = new Set(shuffled.filter((_, index) => index % count === games.length % Math.max(count, 1)).slice(0, 5));
    while (remove.size < 5) remove.add(shuffled[Math.floor(Math.random() * shuffled.length)]);
    const numbers = base.filter((number) => !remove.has(number)).sort((a, b) => a - b);
    const key = gameKey(numbers);
    if (!seen.has(key) && !playedKeys.has(key) && isStrongEnough(numbers, state.analysis)) {
      seen.add(key);
      games.push({ numbers, score: scoreGame(numbers, state.analysis, strategy), base });
    }
  }

  for (let attempt = 0; games.length < count && attempt < count * 80; attempt += 1) {
    const numbers = createCandidate(state.analysis, strategy, 15).numbers;
    const key = gameKey(numbers);
    if (!seen.has(key) && !playedKeys.has(key)) {
      seen.add(key);
      games.push({ numbers, score: scoreGame(numbers, state.analysis, strategy), base });
    }
  }

  return games
    .sort((a, b) => b.score - a.score)
    .map((game, index) => ({ ...game, index: index + 1 }));
}

function finishGeneration() {
  updateStrategyNote();
  renderDecisionSummary();
  renderGames();
  renderHistory();
}

function updateStrategyNote() {
  const mode = $("#generationMode").value;
  const budget = Number($("#dailyBudget").value || 0);
  const count = mode === "daily" ? 1 : Number($("#gameCount").value || 1);
  const estimated = count * estimatedGameCost(Number($("#gameSize").value || 15));
  const notes = {
    daily: "Modo 1 jogo: prioriza uma combinacao forte, equilibrada e diferente do seu historico.",
    diversified: "Modo diversificar: seleciona 4 jogos fortes, mas penaliza repeticao alta entre eles para cobrir mais dezenas.",
    closure20: "Modo base 20: monta jogos amarrados dentro de uma base forte de 20 dezenas.",
  };
  const budgetNote = budget > 0 && estimated > budget
    ? ` Custo estimado: R$ ${estimated.toFixed(2).replace(".", ",")}, acima do limite informado.`
    : ` Custo estimado: R$ ${estimated.toFixed(2).replace(".", ",")}.`;
  $("#strategyNote").textContent = `${notes[mode]}${budgetNote}`;
  $("#generate").textContent = mode === "daily" ? "Gerar jogo recomendado" : "Gerar jogos recomendados";
}

function renderDecisionSummary() {
  const mode = $("#generationMode").value;
  const size = Number($("#gameSize").value || 15);
  const count = mode === "daily" ? 1 : Number($("#gameCount").value || 1);
  const estimated = count * estimatedGameCost(size);
  const budget = Number($("#dailyBudget").value || 0);
  const modeLabel = {
    daily: "1 aposta simples",
    diversified: `${count} apostas diversificadas`,
    closure20: `${count} apostas em base 20`,
  }[mode];
  const overBudget = budget > 0 && estimated > budget;
  const text = overBudget
    ? `Custo acima do limite diario. Reduza quantidade ou numeros antes de jogar. Estimado: R$ ${estimated.toFixed(2).replace(".", ",")}.`
    : `Hoje o sistema recomenda ${modeLabel} com ${size} numeros no perfil ${strategyLabel($("#strategy").value)}. Custo estimado: R$ ${estimated.toFixed(2).replace(".", ",")}.`;
  if ($("#decisionSummary")) $("#decisionSummary").textContent = text;
  $("#decisionSummaryMobile").textContent = text;
}

function renderSummary() {
  const data = state.data;
  const results = state.analysis.sorted;
  $("#metricLatest").textContent = data.latest_contest || results[0].contest;
  $("#metricUpdated").textContent = `Atualizado em: ${formatUpdatedAt(data.updated_at)}`;
  $("#updateMode").textContent = isLocalServer()
    ? "Neste modo, o botao Atualizar baixa os resultados agora."
    : "Online: entre na Nuvem pessoal e use o botao Atualizar pelo celular.";
  $("#status").textContent = `Base: ${results.length} concursos. Atualizado: ${formatUpdatedAt(data.updated_at)}`;
}

function renderDrawAnalyzer() {
  const selector = $("#drawSelector");
  const container = $("#drawAnalysis");
  if (!selector || !container || !state.analysis?.sorted?.length) return;

  const selectedContest = Number(selector.value) || state.analysis.sorted[0].contest;
  selector.innerHTML = state.analysis.sorted.map((draw) => `
    <option value="${draw.contest}" ${draw.contest === selectedContest ? "selected" : ""}>
      ${draw.contest} - ${draw.date}
    </option>
  `).join("");

  const drawIndex = state.analysis.sorted.findIndex((draw) => draw.contest === selectedContest);
  const draw = state.analysis.sorted[drawIndex] || state.analysis.sorted[0];
  const previous = state.analysis.sorted[drawIndex + 1];
  const profile = gameProfile(draw.numbers);
  const repeated = previous ? intersectionCount(draw.numbers, previous.numbers) : null;
  const selectedNumbers = new Set(draw.numbers);
  const repeatedNumbers = new Set(previous
    ? draw.numbers.filter((number) => previous.numbers.includes(number))
    : []);
  const sumDifference = profile.sum - state.analysis.avgSum;
  const sumReading = Math.abs(sumDifference) < 5
    ? "proxima da media historica"
    : `${Math.abs(sumDifference).toFixed(1)} ${sumDifference > 0 ? "acima" : "abaixo"} da media`;

  container.innerHTML = `
    <section class="lottery-slip">
      <div class="slip-header">
        <div>
          <span class="slip-brand">LOTOFACIL</span>
          <strong>Concurso ${draw.contest}</strong>
          <small>${draw.weekday || ""} | ${draw.date}</small>
        </div>
        <span class="slip-count">15 dezenas</span>
      </div>
      <div class="slip-board">
        ${NUMBERS.map((number, index) => `
          <span
            class="slip-number ${selectedNumbers.has(number) ? "is-drawn" : ""} ${repeatedNumbers.has(number) ? "is-repeated" : ""}"
            style="--number-order:${index}"
          >${formatNumber(number)}</span>
        `).join("")}
      </div>
      <div class="slip-legend">
        <span><i class="legend-drawn"></i>Sorteado</span>
        <span><i class="legend-repeated"></i>Repetiu do anterior</span>
      </div>
    </section>
    <div class="draw-metrics">
      <div><strong>${profile.sum}</strong><small>Soma | ${sumReading}</small></div>
      <div><strong>${profile.odd} / ${profile.even}</strong><small>Impares / pares</small></div>
      <div><strong>${profile.low} / ${profile.high}</strong><small>Baixos (1-13) / altos (14-25)</small></div>
      <div><strong>${repeated ?? "-"}</strong><small>Repetidos do concurso anterior</small></div>
    </div>
  `;

  $("#drawOlder").disabled = drawIndex >= state.analysis.sorted.length - 1;
  $("#drawNewer").disabled = drawIndex <= 0;
}

function moveDrawSelection(offset) {
  const selector = $("#drawSelector");
  const currentIndex = state.analysis.sorted.findIndex((draw) => draw.contest === Number(selector.value));
  const nextIndex = Math.max(0, Math.min(state.analysis.sorted.length - 1, currentIndex + offset));
  selector.value = state.analysis.sorted[nextIndex].contest;
  renderDrawAnalyzer();
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
  const latest = state.analysis.sorted[0]?.numbers || [];
  $("#games").innerHTML = state.games.map((game) => {
    const profile = gameProfile(game.numbers);
    const repeated = intersectionCount(game.numbers, latest);
    const selectedNumbers = new Set(game.numbers);
    const quality = qualityScore(game.numbers, state.analysis);
    return `
      <article class="game">
        <div class="game-slip-header">
          <div>
            <span>APOSTA RECOMENDADA</span>
            <strong>Jogo ${game.index}</strong>
          </div>
          <b>Nota ${quality}/100</b>
        </div>
        <div class="game-slip-board">
          ${NUMBERS.map((number) => `
            <span class="game-slip-number ${selectedNumbers.has(number) ? "is-selected" : ""}">
              ${formatNumber(number)}
            </span>
          `).join("")}
        </div>
        <div class="game-reasons">
          <span><b>${profile.sum}</b> soma</span>
          <span><b>${profile.odd}/${profile.even}</b> impares/pares</span>
          <span><b>${profile.low}/${profile.high}</b> baixos/altos</span>
          <span><b>${repeated}</b> repetidos</span>
          <strong>Nota de equilibrio, nao probabilidade</strong>
        </div>
      </article>
    `;
  }).join("");
}

function renderDailyGame() {
  const game = state.games[0];
  if (!game) {
    $("#dailyGame").innerHTML = `<div class="empty-state">Gere um jogo para ver a recomendacao principal.</div>`;
    return;
  }
  const quality = qualityScore(game.numbers, state.analysis);
  $("#dailyGame").innerHTML = `
    <article class="daily-card">
      <div>
        <strong>Nota de equilibrio: ${quality}/100</strong>
        <span>${describeGame(game.numbers)}</span>
      </div>
      <div class="numbers">${game.numbers.map((number) => `<span class="mini-ball">${formatNumber(number)}</span>`).join("")}</div>
      <div class="game-explain">
        <strong>Por que este jogo?</strong>
        <ul>${explainGame(game.numbers, state.analysis).slice(0, 4).map((item) => `<li>${item}</li>`).join("")}</ul>
      </div>
    </article>
  `;
}

function describeGame(numbers) {
  const profile = gameProfile(numbers);
  return `Soma ${profile.sum} | ${profile.odd} impares/${profile.even} pares | ${profile.low} baixos/${profile.high} altos`;
}

function renderCoverage() {
  if (!state.games.length) {
    $("#coverage").innerHTML = "";
    return;
  }
  const allNumbers = new Set(state.games.flatMap((game) => game.numbers));
  const overlaps = [];
  combinations(state.games, 2).forEach(([a, b]) => overlaps.push(intersectionCount(a.numbers, b.numbers)));
  const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0;
  const avgOverlap = overlaps.length ? average(overlaps) : 0;
  const base = state.games.find((game) => game.base)?.base;

  $("#coverage").innerHTML = `
    <div><strong>${allNumbers.size}</strong><small>dezenas cobertas</small></div>
    <div><strong>${maxOverlap}</strong><small>maior repeticao entre jogos</small></div>
    <div><strong>${avgOverlap.toFixed(1)}</strong><small>repeticao media</small></div>
    ${base ? `<div><strong>${base.map(formatNumber).join(" ")}</strong><small>base 20 usada</small></div>` : ""}
  `;
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
  $("#strategyBacktest").innerHTML = `
    <div class="strategy-backtest-placeholder">
      <span>Ranking de estrategias sob demanda para a tela abrir mais rapido.</span>
      <button class="ghost action-button" id="runStrategyBacktest">Calcular ranking</button>
    </div>
  `;
  $("#runStrategyBacktest").addEventListener("click", renderStrategyBacktest);
}

function buildStrategyGame(strategy, drawIndex) {
  const historical = state.analysis.sorted.slice(drawIndex + 1);
  if (historical.length < 120) return null;
  const analysis = analyze(historical, Math.min(120, historical.length));
  const candidate = createCandidate(analysis, strategy, 15);
  return candidate.numbers;
}

function renderStrategyBacktest() {
  const button = $("#runStrategyBacktest");
  if (button) {
    button.disabled = true;
    button.textContent = "Calculando...";
  }
  $("#strategyBacktest").innerHTML = `<div class="empty-state">Calculando ranking de estrategias...</div>`;

  setTimeout(() => calculateStrategyBacktest(), 30);
}

function calculateStrategyBacktest() {
  const strategies = [
    ["balanced", "Equilibrado"],
    ["hot", "Mais sorteados"],
    ["overdue", "Mais atrasados"],
    ["mixed", "Misto agressivo"],
  ];
  const sampleSize = Math.min(30, state.analysis.sorted.length - 140);
  if (sampleSize <= 10) {
    $("#strategyBacktest").innerHTML = "";
    return;
  }

  const rows = strategies.map(([strategy, label]) => {
    const matches = [];
    for (let index = 0; index < sampleSize; index += 1) {
      const game = buildStrategyGame(strategy, index);
      if (!game) continue;
      matches.push(intersectionCount(game, state.analysis.sorted[index].numbers));
    }
    const buckets = { 11: 0, 12: 0, 13: 0, 14: 0, 15: 0 };
    matches.forEach((hits) => {
      if (hits >= 11) buckets[hits] += 1;
    });
    return {
      label,
      avg: average(matches),
      best: Math.max(...matches),
      buckets,
    };
  }).sort((a, b) => b.avg - a.avg);

  $("#strategyBacktest").innerHTML = `
    <h3>Ranking de estrategias</h3>
    <div class="strategy-table">
      ${rows.map((row) => `
        <div>
          <strong>${row.label}</strong>
          <span>media ${row.avg.toFixed(2)} | melhor ${row.best}</span>
          <small>11+: ${row.buckets[11] + row.buckets[12] + row.buckets[13] + row.buckets[14] + row.buckets[15]} | 13+: ${row.buckets[13] + row.buckets[14] + row.buckets[15]} | 15: ${row.buckets[15]}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function savePlayedGames() {
  if (!state.games.length) return;
  const entries = getPlayedGames();
  const existing = new Set(entries.map((entry) => entry.key));
  const targetContest = (state.analysis.sorted[0]?.contest || 0) + 1;
  const now = new Date().toISOString();
  let added = 0;

  state.games.forEach((game) => {
    const key = gameKey(game.numbers);
    if (existing.has(key)) return;
    entries.unshift({
      key,
      numbers: game.numbers,
      score: qualityScore(game.numbers, state.analysis),
      mode: $("#generationMode").value,
      strategy: $("#strategy").value,
      cost: estimatedGameCost(game.numbers.length),
      targetContest,
      createdAt: now,
    });
    existing.add(key);
    added += 1;
  });

  setPlayedGames(entries);
  renderHistory();
  showToast(added ? `${added} jogo(s) registrado(s).` : "Esses jogos ja estavam registrados.");
}

function saveDailyGame() {
  if (!state.games[0]) return;
  const original = state.games;
  state.games = [original[0]];
  savePlayedGames();
  state.games = original;
}

async function copyDailyGame() {
  const game = state.games[0];
  if (!game) return;
  await navigator.clipboard.writeText(`Jogo do Dia: ${game.numbers.map(formatNumber).join(" ")}`);
  showToast("Jogo do Dia copiado.");
}

function renderHistory() {
  const entries = getPlayedGames();
  renderHistoryDashboard(entries);
  if (!entries.length) {
    $("#history").innerHTML = `<div class="empty-state">Nenhum jogo registrado ainda.</div>`;
    return;
  }

  const byContest = Object.fromEntries(state.analysis.sorted.map((draw) => [draw.contest, draw]));
  $("#history").innerHTML = entries.slice(0, 12).map((entry) => {
    const draw = byContest[entry.targetContest];
    const hits = draw ? intersectionCount(entry.numbers, draw.numbers) : null;
    const playedNumbers = new Set(entry.numbers);
    const drawnNumbers = new Set(draw?.numbers || []);
    const checkBoard = draw ? `
      <details class="check-mode">
        <summary>Conferir jogo</summary>
        <div class="check-heading">
          <strong>${hits} acertos</strong>
          <small>Resultado do concurso ${entry.targetContest}</small>
        </div>
        <div class="check-board">
          ${NUMBERS.map((number) => {
            const played = playedNumbers.has(number);
            const drawn = drawnNumbers.has(number);
            const status = played && drawn
              ? "is-hit"
              : played
                ? "is-miss"
                : drawn
                  ? "is-drawn-only"
                  : "";
            return `<span class="check-number ${status}">${formatNumber(number)}</span>`;
          }).join("")}
        </div>
        <div class="check-legend">
          <span><i class="check-hit"></i>Acertou</span>
          <span><i class="check-miss"></i>Jogou, nao saiu</span>
          <span><i class="check-drawn"></i>Saiu, nao jogou</span>
        </div>
      </details>
    ` : "";
    return `
      <article class="history-item">
        <div>
          <strong>Concurso ${entry.targetContest}</strong>
          <small>${formatUpdatedAt(entry.createdAt)} | ${entry.mode}</small>
        </div>
        <div class="numbers">${entry.numbers.map((number) => `<span class="mini-ball">${formatNumber(number)}</span>`).join("")}</div>
        <div class="history-result">${hits === null ? "aguardando resultado" : `${hits} acertos`}</div>
        ${checkBoard}
      </article>
    `;
  }).join("");
}

function entryHits(entry, byContest) {
  const draw = byContest[entry.targetContest];
  return draw ? intersectionCount(entry.numbers, draw.numbers) : null;
}

function dashboardEntries(entries) {
  const period = $("#dashboardPeriod")?.value || "all";
  if (period === "all") return entries;
  const cutoff = Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => {
    const timestamp = new Date(entry.createdAt).getTime();
    return Number.isNaN(timestamp) || timestamp >= cutoff;
  });
}

function renderHistoryDashboard(allEntries) {
  const entries = dashboardEntries(allEntries);
  const container = $("#historyStats");
  const dashboard = $("#historyDashboard");
  if (!entries.length) {
    container.innerHTML = "";
    dashboard.innerHTML = `<div class="empty-state">Nenhum jogo registrado neste periodo.</div>`;
    return;
  }

  const byContest = Object.fromEntries(state.analysis.sorted.map((draw) => [draw.contest, draw]));
  const resolved = entries
    .map((entry) => ({ ...entry, hits: entryHits(entry, byContest) }))
    .filter((entry) => entry.hits !== null);
  const pending = entries.length - resolved.length;
  const totalCost = entries.reduce((total, entry) => total + (entry.cost || estimatedGameCost(entry.numbers.length)), 0);
  const bestHits = resolved.length ? Math.max(...resolved.map((entry) => entry.hits)) : "-";
  const avgHits = resolved.length ? average(resolved.map((entry) => entry.hits)).toFixed(2) : "-";
  const strategyScores = {};
  const numberUsage = Object.fromEntries(NUMBERS.map((number) => [number, 0]));
  const hitBuckets = Object.fromEntries(["0-8", "9", "10", "11", "12", "13", "14", "15"].map((key) => [key, 0]));
  const profiles = entries.map((entry) => gameProfile(entry.numbers));
  const qualityValues = entries.map((entry) => qualityScore(entry.numbers, state.analysis));
  const balancedEntries = profiles.filter((profile) => (
    [7, 8].includes(profile.odd) && [7, 8].includes(profile.low)
  )).length;

  entries.forEach((entry) => entry.numbers.forEach((number) => {
    numberUsage[number] += 1;
  }));

  resolved.forEach((entry) => {
    const key = entry.strategy || "sem perfil";
    strategyScores[key] ||= { total: 0, count: 0, best: 0 };
    strategyScores[key].total += entry.hits;
    strategyScores[key].count += 1;
    strategyScores[key].best = Math.max(strategyScores[key].best, entry.hits);
    hitBuckets[entry.hits <= 8 ? "0-8" : String(entry.hits)] += 1;
  });

  const strategyRows = Object.entries(strategyScores)
    .map(([strategy, stats]) => ({
      strategy,
      avg: stats.total / stats.count,
      best: stats.best,
      count: stats.count,
    }))
    .sort((a, b) => b.avg - a.avg);
  const bestStrategy = strategyRows[0];
  const maxBucket = Math.max(...Object.values(hitBuckets), 1);
  const maxUsage = Math.max(...Object.values(numberUsage), 1);
  const sortedUsage = Object.entries(numberUsage).sort((a, b) => b[1] - a[1]);
  const averageSum = average(profiles.map((profile) => profile.sum)).toFixed(1);
  const averageQuality = Math.round(average(qualityValues));
  const balancedRate = Math.round(balancedEntries / entries.length * 100);

  container.innerHTML = `
    <div><strong>${entries.length}</strong><small>jogos registrados</small></div>
    <div><strong>R$ ${totalCost.toFixed(2).replace(".", ",")}</strong><small>gasto estimado</small></div>
    <div><strong>${bestHits}</strong><small>melhor acerto</small></div>
    <div><strong>${avgHits}</strong><small>media de acertos</small></div>
    <div><strong>${pending}</strong><small>aguardando resultado</small></div>
    <div><strong>${bestStrategy ? strategyLabel(bestStrategy.strategy) : "-"}</strong><small>melhor perfil pessoal</small></div>
  `;

  dashboard.innerHTML = `
    <div class="dashboard-grid">
      <section class="dashboard-block">
        <div class="dashboard-block-title">
          <div>
            <strong>Distribuicao dos acertos</strong>
            <small>${resolved.length} jogo(s) com resultado conhecido</small>
          </div>
        </div>
        <div class="hit-chart">
          ${Object.entries(hitBuckets).map(([label, count]) => `
            <div class="chart-row">
              <span>${label} acertos</span>
              <div class="chart-track"><i style="width:${count / maxBucket * 100}%"></i></div>
              <b>${count}</b>
            </div>
          `).join("")}
        </div>
      </section>
      <section class="dashboard-block">
        <div class="dashboard-block-title">
          <div>
            <strong>Qualidade das apostas</strong>
            <small>Caracteristicas calculadas novamente pelo sistema atual</small>
          </div>
        </div>
        <div class="quality-summary">
          <div><strong>${averageQuality}/100</strong><small>nota media de equilibrio</small></div>
          <div><strong>${averageSum}</strong><small>soma media</small></div>
          <div><strong>${balancedRate}%</strong><small>com paridade e baixos/altos 7/8 ou 8/7</small></div>
        </div>
        <div class="strategy-performance">
          ${strategyRows.length ? strategyRows.map((row) => `
            <div>
              <span>${strategyLabel(row.strategy)}</span>
              <b>${row.avg.toFixed(2)} media</b>
              <small>${row.count} jogo(s) | melhor ${row.best}</small>
            </div>
          `).join("") : `<div class="empty-state">Aguardando resultados para comparar os perfis.</div>`}
        </div>
      </section>
      <section class="dashboard-block dashboard-block-wide">
        <div class="dashboard-block-title">
          <div>
            <strong>Dezenas que voce mais jogou</strong>
            <small>Ajuda a perceber concentracao excessiva nas mesmas escolhas.</small>
          </div>
        </div>
        <div class="usage-grid">
          ${sortedUsage.map(([number, count]) => `
            <div class="usage-number">
              <span>${formatNumber(number)}</span>
              <div class="usage-track"><i style="width:${count / maxUsage * 100}%"></i></div>
              <b>${count}</b>
            </div>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function selectHistoryTab(tabName) {
  const dashboardSelected = tabName === "dashboard";
  $("#dashboardPanel").hidden = !dashboardSelected;
  $("#historyPanel").hidden = dashboardSelected;
  $("#dashboardTab").classList.toggle("is-active", dashboardSelected);
  $("#historyTab").classList.toggle("is-active", !dashboardSelected);
  $("#dashboardTab").setAttribute("aria-selected", String(dashboardSelected));
  $("#historyTab").setAttribute("aria-selected", String(!dashboardSelected));
}

function strategyLabel(strategy) {
  return {
    balanced: "Equilibrado",
    hot: "Mais sorteados",
    overdue: "Mais atrasados",
    mixed: "Misto agressivo",
  }[strategy] || strategy;
}

function clearHistory() {
  if (!confirm("Limpar o diario local de jogos?")) return;
  setPlayedGames([]);
  renderHistory();
  showToast("Diario limpo.");
}

function exportHistory() {
  const entries = getPlayedGames();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: "Gerador Lotofacil",
    entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `diario-lotofacil-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Diario exportado.");
}

function importHistoryClick() {
  $("#historyFile").click();
}

async function importHistory(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const imported = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(imported)) throw new Error("Arquivo invalido.");
    const current = getPlayedGames();
    const byKey = new Map([...imported, ...current].filter((entry) => entry?.key).map((entry) => [entry.key, entry]));
    setPlayedGames([...byKey.values()]);
    renderHistory();
    showToast("Diario importado.");
  } catch {
    showToast("Nao consegui importar. Use o JSON exportado pelo sistema.");
  } finally {
    event.target.value = "";
  }
}

function supabaseHeaders(useSession = true) {
  const config = supabaseConfig();
  const token = useSession && state.supabaseSession?.access_token
    ? state.supabaseSession.access_token
    : config.anonKey;
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function supabaseError(response, fallback) {
  let details = "";
  try {
    const payload = await response.json();
    details = payload.message || payload.error_description || payload.error || JSON.stringify(payload);
  } catch {
    details = await response.text().catch(() => "");
  }
  return new Error(details ? `${fallback}: ${details}` : fallback);
}

function sessionExpiresSoon(session) {
  if (!session?.expires_at) return false;
  const now = Math.floor(Date.now() / 1000);
  return session.expires_at - now < 120;
}

async function refreshCloudSession() {
  if (!state.supabaseSession?.refresh_token) return false;
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: supabaseHeaders(false),
    body: JSON.stringify({ refresh_token: state.supabaseSession.refresh_token }),
  });

  if (!response.ok) return false;
  const session = await response.json();
  setSupabaseSession(session);
  return true;
}

async function ensureCloudSession() {
  if (!state.supabaseSession?.access_token) return false;
  if (!sessionExpiresSoon(state.supabaseSession)) return true;
  return refreshCloudSession();
}

function normalizeEntry(entry) {
  return {
    user_id: state.supabaseSession.user.id,
    game_key: entry.key || gameKey(entry.numbers || []),
    numbers: entry.numbers || [],
    score: entry.score ?? null,
    mode: entry.mode || "",
    strategy: entry.strategy || "",
    cost: entry.cost ?? null,
    target_contest: entry.targetContest || null,
    played_at: entry.createdAt || new Date().toISOString(),
  };
}

function entryFromCloud(row) {
  return {
    key: row.game_key,
    numbers: row.numbers || [],
    score: row.score ?? null,
    mode: row.mode || "",
    strategy: row.strategy || "",
    cost: row.cost ?? null,
    targetContest: row.target_contest,
    createdAt: row.played_at,
  };
}

async function fetchCloudEntries() {
  const config = supabaseConfig();
  const userId = state.supabaseSession.user.id;
  const entries = [];
  const pageSize = 500;

  while (entries.length < MAX_HISTORY_ENTRIES) {
    const url = `${config.url}/rest/v1/${config.table}?user_id=eq.${encodeURIComponent(userId)}&select=*&order=played_at.desc&limit=${pageSize}&offset=${entries.length}`;
    const response = await fetch(url, { headers: supabaseHeaders() });
    if (!response.ok) throw await supabaseError(response, "Nao consegui baixar o diario da nuvem");
    const page = await response.json();
    entries.push(...page);
    if (page.length < pageSize) break;
  }

  return entries;
}

async function pushCloudEntries(entries) {
  if (!entries.length) return [];
  const config = supabaseConfig();
  const rows = entries.map((entry) => normalizeEntry(entry));
  const response = await fetch(`${config.url}/rest/v1/${config.table}?on_conflict=user_id,game_key`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw await supabaseError(response, "Nao consegui enviar o diario para a nuvem");
  return response.json();
}

function mergeHistory(localEntries, cloudEntries) {
  const byKey = new Map();
  [...cloudEntries.map(entryFromCloud), ...localEntries].forEach((entry) => {
    if (!entry?.key) return;
    byKey.set(entry.key, entry);
  });
  return [...byKey.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, MAX_HISTORY_ENTRIES);
}

async function syncCloudHistory(silent = false) {
  if (!isSupabaseReady()) {
    setCloudStatus("Configure o Supabase primeiro: URL e anon key no arquivo supabase-config.js.", "warn");
    if (!silent) showToast("Supabase ainda nao configurado.");
    return;
  }
  if (!state.supabaseSession?.access_token) {
    setCloudStatus("Entre com seu email e senha antes de sincronizar.", "warn");
    if (!silent) showToast("Faca login no Supabase primeiro.");
    return;
  }
  const hasValidSession = await ensureCloudSession();
  if (!hasValidSession) {
    setSupabaseSession(null);
    setCloudStatus("Sessao expirada. Entre novamente antes de sincronizar.", "warn");
    if (!silent) showToast("Sessao expirada. Faca login novamente.");
    return;
  }

  const button = $("#syncCloud");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Sincronizando...";
  setCloudStatus("Sincronizando diario pessoal...", "muted");

  try {
    const localEntries = getPlayedGames();
    await pushCloudEntries(localEntries);
    const cloudEntries = await fetchCloudEntries();
    const merged = mergeHistory(localEntries, cloudEntries);
    setPlayedGames(merged);
    await pushCloudEntries(merged);
    generateGames();
    setCloudStatus(`Nuvem sincronizada: ${merged.length} jogo(s) no diario.`, "ok");
    if (!silent) showToast("Diario sincronizado com Supabase.");
  } catch (error) {
    if (error.message.includes("JWT") || error.message.includes("expired") || error.message.includes("401")) {
      setSupabaseSession(null);
    }
    setCloudStatus(error.message, "error");
    if (!silent) showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function loginCloud() {
  if (!isSupabaseReady()) {
    setCloudStatus("Configure o Supabase primeiro: URL e anon key no arquivo supabase-config.js.", "warn");
    showToast("Supabase ainda nao configurado.");
    return;
  }
  const email = $("#cloudEmail").value.trim();
  const password = $("#cloudPassword").value;
  if (!email || !password) {
    showToast("Informe email e senha.");
    return;
  }

  const button = $("#cloudLogin");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Entrando...";

  try {
    const config = supabaseConfig();
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: supabaseHeaders(false),
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await supabaseError(response, "Login nao autorizado. Confira email e senha");
    const session = await response.json();
    setSupabaseSession(session);
    showToast("Conectado ao Supabase.");
    syncCloudHistory(true);
  } catch (error) {
    setCloudStatus(error.message, "error");
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function logoutCloud() {
  setSupabaseSession(null);
  if ($("#cloudPassword")) $("#cloudPassword").value = "";
  setCloudStatus("Voce saiu da nuvem. O diario local continua neste aparelho.", "muted");
  showToast("Nuvem desconectada.");
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

async function loadData() {
  try {
    const response = await fetch(`data/lotofacil.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Nao foi possivel carregar data/lotofacil.json");
    state.data = await response.json();
    refreshAnalysis();
    hydrateSupabaseResults();
    return;
  } catch (error) {
    const cloudData = await loadSupabaseResults();
    if (!cloudData) throw error;
    state.data = cloudData;
  }

  refreshAnalysis();
}

async function loadSupabaseResults() {
  if (!isSupabaseReady()) return null;
  const config = supabaseConfig();
  const pageSize = 1000;
  const rows = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const url = `${config.url}/rest/v1/${config.resultsTable}?select=contest,weekday,draw_date,numbers,source_updated_at&order=contest.desc&limit=${pageSize}&offset=${offset}`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${config.anonKey}`,
        },
      });
      if (!response.ok) throw new Error("Tabela de resultados indisponivel.");
      const batch = await response.json();
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (!rows.length) return null;
  const results = rows.map((row) => ({
    contest: row.contest,
    weekday: row.weekday,
    date: formatDrawDate(row.draw_date),
    numbers: row.numbers,
  }));

  return {
    source: "Supabase",
    updated_at: rows[0]?.source_updated_at || new Date().toISOString(),
    total_pages: null,
    total_contests: results.length,
    latest_contest: results[0].contest,
    oldest_contest: results.at(-1).contest,
    results,
  };
}

async function hydrateSupabaseResults() {
  const cloudData = await loadSupabaseResults();
  if (!cloudData || !state.data) return;
  const cloudIsNewer = cloudData.latest_contest > (state.data.latest_contest || 0)
    || cloudData.total_contests > (state.data.total_contests || 0);
  if (!cloudIsNewer) return;
  state.data = cloudData;
  refreshAnalysis();
  showToast("Base historica atualizada pelo Supabase.");
}

async function forceUpdate() {
  const button = $("#forceUpdate");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Atualizando...";

  try {
    if (!isSupabaseReady()) throw new Error("Supabase ainda nao configurado.");
    if (!state.supabaseSession?.access_token) {
      throw new Error("Entre na sua conta na secao Nuvem pessoal antes de atualizar.");
    }
    if (!await ensureCloudSession()) {
      throw new Error("Sua sessao expirou. Entre novamente na sua conta.");
    }

    const config = supabaseConfig();
    const response = await fetch(`${config.url}/functions/v1/update-lotofacil`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${state.supabaseSession.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || "Nao foi possivel atualizar.");

    const latest = {
      contest: payload.contest,
      weekday: payload.weekday,
      date: formatDrawDate(payload.date),
      numbers: payload.numbers,
    };
    const results = [
      latest,
      ...state.data.results.filter((draw) => draw.contest !== latest.contest),
    ].sort((a, b) => b.contest - a.contest);
    state.data = {
      ...state.data,
      source: "Supabase / API oficial da CAIXA",
      updated_at: payload.updatedAt,
      total_contests: results.length,
      latest_contest: results[0].contest,
      oldest_contest: results.at(-1).contest,
      results,
    };
    refreshAnalysis();
    showToast(`Concurso ${payload.contest} atualizado pelo celular.`);
  } catch (error) {
    showToast(error.message || "Nao foi possivel atualizar agora.");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
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
  renderDrawAnalyzer();
  generateGames();
  renderHistory();
}

async function init() {
  try {
    state.supabaseSession = getStoredSupabaseSession();
    if (state.supabaseSession?.user?.email && $("#cloudEmail")) {
      $("#cloudEmail").value = state.supabaseSession.user.email;
    }
    renderCloudAuth();
    if (!state.supabaseSession) {
      setCloudStatus(isSupabaseReady()
        ? "Entre com seu email e senha para sincronizar."
        : "Nuvem opcional ainda nao configurada. O diario continua salvo neste aparelho.");
    }
    await loadData();
    if (state.supabaseSession?.access_token) syncCloudHistory(true);
  } catch (error) {
    $("#status").textContent = error.message;
  }
}

$("#generate").addEventListener("click", generateGames);
$("#recentWindow").addEventListener("change", refreshAnalysis);
$("#strategy").addEventListener("change", generateGames);
$("#gameSize").addEventListener("change", generateGames);
$("#generationMode").addEventListener("change", generateGames);
$("#lastRepeatRange").addEventListener("change", generateGames);
$("#dailyBudget").addEventListener("change", updateStrategyNote);
$("#copyGames").addEventListener("click", copyGames);
$("#savePlayed").addEventListener("click", savePlayedGames);
$("#exportHistory").addEventListener("click", exportHistory);
$("#importHistory").addEventListener("click", importHistoryClick);
$("#historyFile").addEventListener("change", importHistory);
$("#clearHistory").addEventListener("click", clearHistory);
$("#dashboardTab").addEventListener("click", () => selectHistoryTab("dashboard"));
$("#historyTab").addEventListener("click", () => selectHistoryTab("history"));
$("#dashboardPeriod").addEventListener("change", () => renderHistoryDashboard(getPlayedGames()));
$("#syncCloud").addEventListener("click", () => syncCloudHistory());
$("#cloudLogin").addEventListener("click", loginCloud);
$("#cloudLogout").addEventListener("click", logoutCloud);
$("#forceUpdate").addEventListener("click", forceUpdate);
$("#drawSelector").addEventListener("change", renderDrawAnalyzer);
$("#drawOlder").addEventListener("click", () => moveDrawSelection(1));
$("#drawNewer").addEventListener("click", () => moveDrawSelection(-1));
installButtons().forEach((button) => button.addEventListener("click", installApp));

setupPwa();
init();
