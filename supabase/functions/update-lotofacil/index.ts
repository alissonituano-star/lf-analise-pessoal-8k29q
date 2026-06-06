import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDate(date: string) {
  const [day, month, year] = date.split("/");
  if (!day || !month || !year) throw new Error("Data do sorteio invalida.");
  return `${year}-${month}-${day}`;
}

function weekday(date: string) {
  const labels = [
    "Domingo",
    "Segunda-feira",
    "Terca-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sabado",
  ];
  return labels[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

type LatestDraw = {
  contest: number;
  date: string;
  numbers: number[];
  source: string;
};

function validateDraw(draw: LatestDraw) {
  if (
    !Number.isInteger(draw.contest)
    || draw.numbers.length !== 15
    || new Set(draw.numbers).size !== 15
    || draw.numbers.some((number) => number < 1 || number > 25)
  ) {
    throw new Error("O resultado recebido esta incompleto.");
  }
  return draw;
}

async function fetchFromCaixa(): Promise<LatestDraw> {
  const response = await fetch(
    "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil",
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9",
        Origin: "https://loterias.caixa.gov.br",
        Referer: "https://loterias.caixa.gov.br/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36",
      },
    },
  );
  if (!response.ok) throw new Error(`CAIXA HTTP ${response.status}`);

  const draw = await response.json();
  return validateDraw({
    contest: draw.numero,
    date: draw.dataApuracao,
    numbers: (draw.listaDezenas || []).map(Number).sort((a: number, b: number) => a - b),
    source: "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil",
  });
}

async function fetchFromLotorama(): Promise<LatestDraw> {
  const source = "https://lotorama.com.br/lotofacil/todos-os-resultados/";
  const response = await fetch(source, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Lotorama HTTP ${response.status}`);

  const html = await response.text();
  const firstCard = html.match(/<div class="resultado-card">([\s\S]*?)(?=<div class="resultado-card">|<div class="pagination|<footer|$)/i)?.[1] || "";
  const contest = Number(firstCard.match(/Concurso\s+(\d+)/i)?.[1]);
  const date = firstCard.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";
  const numbers = [...firstCard.matchAll(/result-number[^>]*>\s*(\d{1,2})\s*</gi)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);

  return validateDraw({ contest, date, numbers, source });
}

async function fetchLatestDraw() {
  const errors: string[] = [];
  for (const fetchDraw of [fetchFromCaixa, fetchFromLotorama]) {
    try {
      return await fetchDraw();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "erro desconhecido");
    }
  }
  throw new Error(`Fontes indisponiveis: ${errors.join(" | ")}`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, message: "Metodo nao permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Variaveis do Supabase nao configuradas.");
    }
    if (!token) return json({ ok: false, message: "Entre na sua conta antes de atualizar." }, 401);

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ ok: false, message: "Sua sessao expirou. Entre novamente." }, 401);
    }

    const draw = await fetchLatestDraw();
    const numbers = draw.numbers;
    const drawDate = isoDate(draw.date);
    const sum = numbers.reduce((total: number, number: number) => total + number, 0);
    const odd = numbers.filter((number: number) => number % 2 !== 0).length;
    const low = numbers.filter((number: number) => number <= 13).length;
    const updatedAt = new Date().toISOString();
    const row = {
      contest: draw.contest,
      weekday: weekday(drawDate),
      draw_date: drawDate,
      numbers,
      sum_total: sum,
      odd_count: odd,
      even_count: numbers.length - odd,
      low_count: low,
      high_count: numbers.length - low,
      source: draw.source,
      source_updated_at: updatedAt,
    };

    const admin = createClient(supabaseUrl, serviceKey);
    const { error: upsertError } = await admin
      .from("lotofacil_results")
      .upsert(row, { onConflict: "contest" });
    if (upsertError) throw upsertError;

    return json({
      ok: true,
      contest: row.contest,
      weekday: row.weekday,
      date: row.draw_date,
      numbers: row.numbers,
      updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida.";
    return json({ ok: false, message }, 500);
  }
});
