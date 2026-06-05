import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = resolve(ROOT, "data", "lotofacil.json");
const CONFIG_FILE = resolve(ROOT, "supabase-config.js");
const BATCH_SIZE = 500;

function readConfigValue(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return match?.[1] || "";
}

function toIsoDate(value) {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function rowFromDraw(draw, payload) {
  const sum = draw.numbers.reduce((total, number) => total + number, 0);
  const odd = draw.numbers.filter((number) => number % 2).length;
  const low = draw.numbers.filter((number) => number <= 13).length;
  return {
    contest: draw.contest,
    weekday: draw.weekday,
    draw_date: toIsoDate(draw.date),
    numbers: draw.numbers,
    sum_total: sum,
    odd_count: odd,
    even_count: draw.numbers.length - odd,
    low_count: low,
    high_count: draw.numbers.length - low,
    source: payload.source,
    source_updated_at: payload.updated_at,
  };
}

async function uploadBatch({ url, serviceKey, table }, rows) {
  const response = await fetch(`${url}/rest/v1/${table}?on_conflict=contest`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase HTTP ${response.status}: ${details}`);
  }
}

async function main() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("Defina SUPABASE_SERVICE_ROLE_KEY antes de rodar este script.");
  }

  const configSource = await readFile(CONFIG_FILE, "utf8");
  const url = readConfigValue(configSource, "url").replace(/\/$/, "");
  const table = readConfigValue(configSource, "resultsTable") || "lotofacil_results";
  if (!url) throw new Error("Preencha a url em supabase-config.js.");

  const payload = JSON.parse(await readFile(DATA_FILE, "utf8"));
  const rows = payload.results.map((draw) => rowFromDraw(draw, payload));

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    await uploadBatch({ url, serviceKey, table }, batch);
    console.log(`Enviados ${Math.min(index + batch.length, rows.length)}/${rows.length} concursos...`);
  }

  console.log(`OK: ${rows.length} concursos enviados para ${table}.`);
}

main().catch((error) => {
  console.error(`Erro ao enviar resultados: ${error.message}`);
  process.exitCode = 1;
});
