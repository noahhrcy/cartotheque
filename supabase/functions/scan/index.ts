// Cartothèque — fonction « scan » : identifie les cartes Pokémon d'une photo avec Claude.
// Secrets attendus (Supabase > Edge Functions > Secrets) : ANTHROPIC_API_KEY ; facultatif : SCAN_MODEL.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("SCAN_MODEL") ?? "claude-opus-5-5";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = `Tu es le module d'identification d'une application de collection de cartes Pokémon (jeu de cartes physique).
Regarde la photo jointe. Elle peut contenir une carte, plusieurs cartes (page de classeur, cartes étalées), une carte gradée dans un boîtier, ou un produit scellé.
Pour CHAQUE carte lisible (12 au maximum), relève ce qui est imprimé, sans inventer :
- printedName : le nom imprimé, tel quel
- frenchName : le nom français officiel de ce Pokémon ou de cette carte Dresseur/Énergie (traduis si la carte n'est pas en français)
- number : le numéro de collection en bas de la carte, partie avant la barre (ex. "125", "TG05", "SV049", "GG01"), ou "" s'il est illisible
- total : la partie après la barre (ex. "197"), ou ""
- setCode : le code d'extension imprimé à côté du numéro s'il est lisible (ex. "MEW", "PAF", "OBF"), sinon ""
- language : langue de la carte
- finish : "holo" si l'illustration brille, "reverse" si c'est le reste de la carte qui brille, "normal" sinon, "unknown" si impossible à dire
- condition : estimation prudente de l'état visible
- gradedCompany et gradedGrade : société et note si la carte est dans un boîtier de gradation (ex. "PSA", "10"), sinon ""
- confidence : ta confiance entre 0 et 1 sur la lecture du nom ET du numéro
- where : position courte dans la photo (ex. "en haut à gauche")
Pour chaque produit scellé visible, ajoute une entrée dans "sealed" (type : booster, display, etb, coffret, tripack, blister, tin ou autre ; name ; set = nom de l'extension si lisible, sinon "").
Si un numéro est illisible, laisse-le vide plutôt que de deviner.
Dans "note", une remarque courte sur la photo (flou, reflets…) ou "".`;

const SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          printedName: { type: "string" },
          frenchName: { type: "string" },
          number: { type: "string" },
          total: { type: "string" },
          setCode: { type: "string" },
          language: { type: "string", enum: ["fr", "en", "ja", "de", "it", "es", "other"] },
          finish: { type: "string", enum: ["holo", "reverse", "normal", "unknown"] },
          condition: { type: "string", enum: ["NM", "EX", "GD", "LP", "PL", "PO"] },
          gradedCompany: { type: "string" },
          gradedGrade: { type: "string" },
          confidence: { type: "number" },
          where: { type: "string" },
        },
        required: ["printedName", "frenchName", "number", "total", "setCode", "language", "finish", "condition", "gradedCompany", "gradedGrade", "confidence", "where"],
        additionalProperties: false,
      },
    },
    sealed: {
      type: "array",
      items: {
        type: "object",
        properties: { type: { type: "string" }, name: { type: "string" }, set: { type: "string" } },
        required: ["type", "name", "set"],
        additionalProperties: false,
      },
    },
    note: { type: "string" },
  },
  required: ["cards", "sealed", "note"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Identify the member from their session token; every check below runs as that member.
  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, apiKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "auth" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "not_configured" }, 503);

  let body: { image?: string; mediaType?: string; precise?: boolean };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const image = String(body?.image ?? "");
  const mediaType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(String(body?.mediaType)) ? String(body.mediaType) : "image/jpeg";
  if (!image) return json({ error: "bad_request" }, 400);
  if (image.length > 7_000_000) return json({ error: "too_large" }, 413);

  const { data: gate, error: gateError } = await supabase.rpc("register_scan");
  if (gateError) { console.error("register_scan", gateError); return json({ error: "upstream_error" }, 500); }
  if (!gate?.allowed) {
    const code = gate?.reason === "quota" ? "quota" : gate?.reason === "rate" ? "rate_limited" : "auth";
    return json({ error: code, used: gate?.used, quota: gate?.quota }, 429);
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: body?.precise ? "medium" : "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    // deno-lint-ignore no-explicit-any
    } as any);
    if (response.stop_reason === "refusal") return json({ error: "refused" }, 422);
    // deno-lint-ignore no-explicit-any
    const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const out = JSON.parse(text);
    // deno-lint-ignore no-explicit-any
    const cards = (out.cards ?? []).slice(0, 12).map((c: any) => ({
      printedName: c.printedName || null,
      frenchName: c.frenchName || null,
      number: c.number || null,
      total: c.total || null,
      setCode: c.setCode || null,
      language: c.language,
      finish: c.finish,
      condition: c.condition,
      graded: c.gradedCompany ? { company: c.gradedCompany, grade: c.gradedGrade } : null,
      confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0)),
      where: c.where || "",
    }));
    return json({ cards, sealed: out.sealed ?? [], note: out.note ?? "" });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status, e.message); return json({ error: "upstream_error" }, 502); }
    console.error("scan", e);
    return json({ error: "upstream_error" }, 500);
  }
});
