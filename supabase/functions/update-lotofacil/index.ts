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

    const caixaResponse = await fetch(
      "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil",
      { headers: { Accept: "application/json", "User-Agent": "Lotofacil-Pessoal/1.0" } },
    );
    if (!caixaResponse.ok) throw new Error(`API da CAIXA respondeu HTTP ${caixaResponse.status}.`);

    const draw = await caixaResponse.json();
    const numbers = (draw.listaDezenas || [])
      .map((value: string) => Number(value))
      .filter((value: number) => value >= 1 && value <= 25)
      .sort((a: number, b: number) => a - b);

    if (!Number.isInteger(draw.numero) || numbers.length !== 15 || new Set(numbers).size !== 15) {
      throw new Error("O resultado recebido da CAIXA esta incompleto.");
    }

    const drawDate = isoDate(draw.dataApuracao);
    const sum = numbers.reduce((total: number, number: number) => total + number, 0);
    const odd = numbers.filter((number: number) => number % 2 !== 0).length;
    const low = numbers.filter((number: number) => number <= 13).length;
    const updatedAt = new Date().toISOString();
    const row = {
      contest: draw.numero,
      weekday: weekday(drawDate),
      draw_date: drawDate,
      numbers,
      sum_total: sum,
      odd_count: odd,
      even_count: numbers.length - odd,
      low_count: low,
      high_count: numbers.length - low,
      source: "https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil",
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
