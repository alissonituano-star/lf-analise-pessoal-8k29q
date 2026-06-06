import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_FILE = resolve(ROOT, "data", "lotofacil.json");
const NUMBERS = Array.from({ length: 25 }, (_, index) => index + 1);

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

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function combinationCount(n, k) {
  let result = 1;
  for (let index = 1; index <= k; index += 1) result = result * (n - index + 1) / index;
  return Math.round(result);
}

function gameKey(numbers) {
  return [...numbers].sort((a, b) => a - b).map((number) => String(number).padStart(2, "0")).join("-");
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

  const maxFreq = Math.max(...NUMBERS.map((number) => frequency[number]));
  const maxRecent = Math.max(...NUMBERS.map((number) => recentFrequency[number]));
  const maxDelay = Math.max(...NUMBERS.map((number) => delay[number] ?? sorted.length));
  const ranking = NUMBERS.map((number) => {
    const freqScore = frequency[number] / maxFreq;
    const recentScore = recentFrequency[number] / Math.max(maxRecent, 1);
    const delayScore = (delay[number] ?? maxDelay) / Math.max(maxDelay, 1);
    return {
      number,
      frequency: frequency[number],
      recentFrequency: recentFrequency[number],
      delay: delay[number] ?? sorted.length,
      score: freqScore * 0.45 + recentScore * 0.35 + delayScore * 0.2,
    };
  }).sort((a, b) => b.score - a.score);

  return {
    sorted,
    ranking,
    avgSum: average(sums),
    stdSum: standardDeviation(sums),
    avgRepeat: average(repeats),
    stdRepeat: standardDeviation(repeats),
  };
}

function selectedLastRepeatRange(size) {
  if (size <= 15) return [7, 10];
  if (size <= 17) return [8, 12];
  return [9, 14];
}

function maxHistoricalSimilarity(numbers, analysis, limit = 500) {
  return analysis.sorted.slice(0, limit).reduce((best, draw) => (
    Math.max(best, intersectionCount(numbers, draw.numbers))
  ), 0);
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
  if (repeatLatest < minRepeat || repeatLatest > maxRepeat) issues.push("fora da faixa de repeticao do ultimo");
  if (maxOldSimilarity >= 14) issues.push("muito parecido com concurso antigo");
  return issues;
}

function qualityScore(numbers, analysis) {
  const profile = gameProfile(numbers);
  const repeatLatest = intersectionCount(numbers, analysis.sorted[0]?.numbers || []);
  const sumDeviation = Math.abs(profile.sum - analysis.avgSum) / Math.max(analysis.stdSum, 1);
  const repeatDeviation = Math.abs(repeatLatest - analysis.avgRepeat) / Math.max(analysis.stdRepeat, 1);
  const parityExcess = Math.max(0, Math.abs(profile.odd - numbers.length / 2) - 0.5);
  const lowExcess = Math.max(0, Math.abs(profile.low - numbers.length / 2) - 0.5);
  const rowPenalty = profile.rows.filter((value) => value === 0 || value === 5).length * 5;
  const colPenalty = profile.cols.filter((value) => value === 0 || value === 5).length * 4;
  const sequencePenalty = Math.max(0, profile.sequence - 5) * 4;
  const similarityPenalty = Math.max(0, maxHistoricalSimilarity(numbers, analysis) - 13) * 5;
  const penalty = sumDeviation * 7 + repeatDeviation * 3 + parityExcess * 7 + lowExcess * 6
    + rowPenalty + colPenalty + sequencePenalty + similarityPenalty;
  return Math.max(0, Math.min(100, Math.round(100 - penalty)));
}

function scoreGame(numbers, analysis) {
  const profile = gameProfile(numbers);
  const sumPenalty = Math.abs(profile.sum - analysis.avgSum) / 30;
  const oddPenalty = Math.abs(profile.odd - numbers.length / 2) * 0.18;
  const lowPenalty = Math.abs(profile.low - numbers.length / 2) * 0.12;
  const rowPenalty = profile.rows.filter((value) => value === 0 || value > 4).length * 0.18;
  const colPenalty = profile.cols.filter((value) => value === 0 || value > 4).length * 0.12;
  const issuePenalty = gameIssues(numbers, analysis).length * 0.45;
  return qualityScore(numbers, analysis) / 10
    - sumPenalty * 0.1 - oddPenalty - lowPenalty - rowPenalty - colPenalty - issuePenalty;
}

function createCandidate(analysis, size) {
  const chosen = new Set();
  while (chosen.size < size) chosen.add(NUMBERS[Math.floor(Math.random() * NUMBERS.length)]);
  const numbers = [...chosen].sort((a, b) => a - b);
  return { numbers, score: scoreGame(numbers, analysis) };
}

function selectDiversifiedGames(candidates, count, size) {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const selected = [];
  const targetOverlap = size <= 15 ? 8 : Math.ceil(size * 0.55);
  while (selected.length < count && pool.length) {
    const ranked = pool.map((candidate) => {
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
        adjustedScore: candidate.score - excessOverlap * 0.9 - avgOverlap * 0.08
          - membershipSpread * 0.12 + newNumbers * 0.45,
      };
    }).sort((a, b) => b.adjustedScore - a.adjustedScore);
    const best = ranked[0].candidate;
    selected.push(best);
    pool.splice(pool.findIndex((candidate) => gameKey(candidate.numbers) === gameKey(best.numbers)), 1);
  }
  return selected;
}

function generatePlan(analysis) {
  const candidates = [];
  const seen = new Set();
  for (let attempt = 0; attempt < 4 * 320; attempt += 1) {
    const candidate = createCandidate(analysis, 15);
    const key = gameKey(candidate.numbers);
    if (!seen.has(key) && !gameIssues(candidate.numbers, analysis).length) {
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return selectDiversifiedGames(candidates, 4, 15);
}

function audit(games, analysis) {
  const allNumbers = new Set(games.flatMap((game) => game.numbers));
  const overlaps = combinations(games, 2).map(([a, b]) => intersectionCount(a.numbers, b.numbers));
  const latest = analysis.sorted[0].numbers;
  const sample = analysis.sorted.slice(0, 120);
  const hits = [];
  sample.forEach((draw) => {
    games.forEach((game) => hits.push(intersectionCount(game.numbers, draw.numbers)));
  });
  return {
    games: games.map((game, index) => ({
      index: index + 1,
      numbers: game.numbers,
      score: Number(game.score.toFixed(2)),
      quality: qualityScore(game.numbers, analysis),
      profile: gameProfile(game.numbers),
      repeatLatest: intersectionCount(game.numbers, latest),
      issues: gameIssues(game.numbers, analysis),
    })),
    uniqueGames: new Set(games.map((game) => gameKey(game.numbers))).size,
    coveredNumbers: allNumbers.size,
    maxOverlap: Math.max(...overlaps),
    avgOverlap: Number(average(overlaps).toFixed(2)),
    historicalFitBest: Math.max(...hits),
    historicalFitAvg: Number(average(hits).toFixed(2)),
    historicalFit13Plus: hits.filter((hit) => hit >= 13).length,
    theoretical15Chance: `1 em ${Math.round(combinationCount(25, 15) / games.length).toLocaleString("pt-BR")}`,
  };
}

const payload = JSON.parse(await readFile(DATA_FILE, "utf8"));
const invalidDraws = payload.results.filter((draw) => (
  !Number.isInteger(draw.contest)
  || draw.numbers.length !== 15
  || new Set(draw.numbers).size !== 15
  || draw.numbers.some((number) => number < 1 || number > 25)
));
const analysis = analyze(payload.results, 120);
const games = generatePlan(analysis);
const report = audit(games, analysis);
const failures = [];
if (invalidDraws.length) failures.push(`${invalidDraws.length} concursos invalidos`);
if (report.uniqueGames !== 4) failures.push("os quatro jogos nao sao unicos");
if (report.coveredNumbers !== 25) failures.push(`cobertura incompleta: ${report.coveredNumbers}/25`);
if (report.maxOverlap > 9) failures.push(`sobreposicao excessiva: ${report.maxOverlap}`);
if (report.games.some((game) => game.issues.length)) failures.push("ha jogos com alertas");

console.log(JSON.stringify({
  contests: payload.total_contests,
  latestContest: payload.latest_contest,
  avgSum: Number(analysis.avgSum.toFixed(2)),
  stdSum: Number(analysis.stdSum.toFixed(2)),
  avgRepeat: Number(analysis.avgRepeat.toFixed(2)),
  invalidDraws: invalidDraws.length,
  formulaChecks: {
    theoreticalAverageSum: 195,
    empiricalAverageSum: Number(analysis.avgSum.toFixed(2)),
    theoreticalAverageRepeat: 9,
    empiricalAverageRepeat: Number(analysis.avgRepeat.toFixed(2)),
  },
  failures,
  ...report,
}, null, 2));

if (failures.length) process.exitCode = 1;
