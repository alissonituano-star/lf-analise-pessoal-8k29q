import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://lotorama.com.br/lotofacil/todos-os-resultados/";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "data", "lotofacil.json");

function cleanText(rawHtml) {
  return rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á")
    .replace(/&agrave;/g, "à")
    .replace(/&acirc;/g, "â")
    .replace(/&atilde;/g, "ã")
    .replace(/&eacute;/g, "é")
    .replace(/&ecirc;/g, "ê")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&ocirc;/g, "ô")
    .replace(/&otilde;/g, "õ")
    .replace(/&uacute;/g, "ú")
    .replace(/&ccedil;/g, "ç")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n");
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; GeradorLotoFacil/1.0)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.text();
}

function extractTotalPages(rawHtml) {
  const rawPageText = rawHtml.match(/P(?:á|&aacute;)gina\s+\d+\s+de\s+(\d+)/i);
  if (rawPageText) return Number(rawPageText[1]);

  const pageText = cleanText(rawHtml).match(/P[aá]gina\s+\d+\s+de\s+(\d+)/i);
  if (pageText) return Number(pageText[1]);

  const links = [
    ...[...rawHtml.matchAll(/\/page\/(\d+)\//g)].map((match) => Number(match[1])),
    ...[...rawHtml.matchAll(/[?&]paged=(\d+)/g)].map((match) => Number(match[1])),
  ];
  return links.length ? Math.max(...links) : 1;
}

function parsePage(rawHtml) {
  const contests = [];
  const cardRegex = /<div class="resultado-card">([\s\S]*?)(?=<div class="resultado-card">|<div class="pagination|<footer|$)/g;

  for (const card of rawHtml.matchAll(cardRegex)) {
    const text = cleanText(card[1]);
    const match = text.match(/Concurso\s+(\d+)\s+-\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})/);
    if (!match) continue;

    const numbers = [...card[1].matchAll(/result-number[^>]*>\s*(\d{1,2})\s*</g)]
      .map((item) => Number(item[1]))
      .filter((number) => number >= 1 && number <= 25)
      .sort((a, b) => a - b);

    if (numbers.length !== 15 || new Set(numbers).size !== 15) continue;
    contests.push({
      contest: Number(match[1]),
      weekday: match[2].trim(),
      date: match[3],
      numbers,
    });
  }

  return contests;
}

function pageUrl(page) {
  return page <= 1 ? BASE_URL : `${BASE_URL}?paged=${page}`;
}

function dedupe(contests) {
  const byContest = new Map(contests.map((item) => [item.contest, item]));
  return [...byContest.values()].sort((a, b) => b.contest - a.contest);
}

async function update(maxPages) {
  const firstHtml = await fetchPage(BASE_URL);
  let totalPages = extractTotalPages(firstHtml);
  if (maxPages) totalPages = Math.min(totalPages, maxPages);

  const allContests = parsePage(firstHtml);
  for (let page = 2; page <= totalPages; page += 1) {
    console.error(`Baixando pagina ${page}/${totalPages}...`);
    allContests.push(...parsePage(await fetchPage(pageUrl(page))));
  }

  const results = dedupe(allContests);
  if (!results.length) throw new Error("Nenhum concurso foi encontrado. O layout do site pode ter mudado.");

  const payload = {
    source: BASE_URL,
    updated_at: new Date().toISOString(),
    total_pages: totalPages,
    total_contests: results.length,
    latest_contest: results[0].contest,
    oldest_contest: results.at(-1).contest,
    results,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

const maxPagesArg = process.argv.find((arg) => arg.startsWith("--max-pages="));
const maxPages = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : null;

try {
  const payload = await update(maxPages);
  console.log(
    `OK: ${payload.total_contests} concursos salvos em ${OUTPUT} (${payload.oldest_contest} a ${payload.latest_contest}).`,
  );
} catch (error) {
  console.error(`Erro ao atualizar resultados: ${error.message}`);
  process.exitCode = 1;
}
