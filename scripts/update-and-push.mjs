import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SERVICE_ROLE_FILE = resolve(ROOT, "supabase-service-role.key");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Uso: npm run sync");
  console.log("Atualiza data/lotofacil.json, cria commit se houver mudanca e envia para o GitHub.");
  process.exit(0);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} falhou.${details ? `\n${details}` : ""}`);
  }

  return result.stdout || "";
}

function hasDataChanges() {
  const status = run("git", ["status", "--short", "data/lotofacil.json"], { capture: true });
  return status.trim().length > 0;
}

function loadServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!existsSync(SERVICE_ROLE_FILE)) return;
  process.env.SUPABASE_SERVICE_ROLE_KEY = readFileSync(SERVICE_ROLE_FILE, "utf8").trim();
}

function uploadSupabaseResults() {
  loadServiceRoleKey();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SUPABASE_SERVICE_ROLE_KEY nao definida. Pulando envio ao Supabase.");
    return;
  }

  console.log("Enviando resultados para o Supabase...");
  run("node", ["scripts/upload-results-supabase.mjs"]);
}

console.log("Atualizando resultados...");
run("node", ["scripts/update-results.mjs"]);
uploadSupabaseResults();

if (!hasDataChanges()) {
  console.log("Nenhuma mudanca nova nos resultados para enviar ao GitHub.");
  process.exit(0);
}

const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
console.log("Salvando mudanca no Git...");
run("git", ["add", "data/lotofacil.json"]);
run("git", ["commit", "-m", `Atualiza resultados Lotofacil ${today}`]);

console.log("Enviando para o GitHub...");
run("git", ["push"]);

console.log("Base atualizada e enviada para o GitHub.");
