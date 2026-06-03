import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

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

console.log("Atualizando resultados...");
run("node", ["scripts/update-results.mjs"]);

if (!hasDataChanges()) {
  console.log("Nenhuma mudanca nova nos resultados. Nada para enviar.");
  process.exit(0);
}

const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
console.log("Salvando mudanca no Git...");
run("git", ["add", "data/lotofacil.json"]);
run("git", ["commit", "-m", `Atualiza resultados Lotofacil ${today}`]);

console.log("Enviando para o GitHub...");
run("git", ["push"]);

console.log("Base atualizada e enviada para o GitHub.");
