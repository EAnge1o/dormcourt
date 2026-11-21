import { createCloudAgentsClient } from "./cloud-agents.mjs";

const SCENARIO_LABEL = {
  eat: "今天吃什么",
  express: "谁去拿快递",
  duty: "宿舍值日",
  lights: "几点关灯",
  ac: "空调温度",
  takeout: "外卖谁拿",
  game: "开黑背锅",
  custom: "宿舍自定义议题",
};
const SYSTEM =
  "你是「宿舍法院」的幽默法官，专为宿舍琐事开庭裁决。请用庄重又搞笑的法庭腔写一句判决理由：结合胜出选项与案由，可玩宿舍梗（干饭、打团、取快递、值日），语气像正式判决书但内容好笑。要求：中文，不超过60字，只输出判决理由正文，不要标题、引号、案号或额外解释。";

const clean = (text) => text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

function buildPrompt(c, counts, result) {
  const label = SCENARIO_LABEL[c.scenario] ?? "宿舍议题";
  const tally = c.options.map((option, i) => `${option}${counts[i] ?? 0}票`).join("，");
  return `案由：${c.question}（${label}）。候选与票数：${tally}。裁决结果：${result}。请写一句判决理由。`;
}

async function pickModel(cloud) {
  const res = await cloud.request("/api/v1/cloud/models");
  const models = Array.isArray(res?.data) ? res.data.filter((m) => typeof m?.id === "string") : [];
  if (!models.length) throw new Error("ai_no_model");
  const enabled = models.filter((m) => m.enabled !== false);
  const pool = enabled.length ? enabled : models;
  return pool.slice().sort((a, b) => a.id.localeCompare(b.id))[0].id;
}

// Reuse the shared site Agent/Environment by business metadata; a private binding
// row claims one-time creation so concurrent first verdicts do not duplicate it.
async function ensureResource(cloud, db, kind, definition) {
  const metadata = { app: "dormcourt", role: kind };
  const matches = await cloud.findResources(kind, metadata);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("ai_resource_conflict");
  const claim = await db
    .from("ai_bindings")
    .insertIfAbsent({ binding_key: kind, resource_id: null, resource_version: null, state: "creating", updated_at: new Date().toISOString() }, { onConflict: "binding_key" })
    .select("*");
  if (claim.error) throw new Error("ai_binding_error");
  if (!claim.data?.length) {
    const found = await db.from("ai_bindings").select("*").eq("binding_key", kind).limit(1);
    const row = found.data?.[0];
    if (row?.state === "ready" && row.resource_id) return { id: row.resource_id, version: row.resource_version };
    throw new Error("ai_initialization_pending");
  }
  const created = await cloud.request(`/api/v1/cloud/${kind}`, {
    method: "POST",
    body: { ...definition, metadata },
    ...(kind === "agents" ? { idempotencyKey: `dormcourt-${kind}` } : {}),
  });
  if (typeof created?.id !== "string") throw new Error("ai_response_invalid");
  await db
    .from("ai_bindings")
    .update({ resource_id: created.id, resource_version: created.version ?? null, state: "ready", updated_at: new Date().toISOString() })
    .eq("binding_key", kind);
  return created;
}

async function generate(cloud, db, c, counts) {
  const result = c.options[c.resultIndex];
  const model = await pickModel(cloud);
  const agent = await ensureResource(cloud, db, "agents", { name: "宿舍法院法官", model, system: SYSTEM, tools: [] });
  const environment = await ensureResource(cloud, db, "environments", { name: "宿舍法院环境", config: { type: "cloud" } });
  const session = await cloud.request("/api/v1/cloud/sessions", {
    method: "POST",
    body: { agent: { type: "agent", id: agent.id, version: agent.version }, environment_id: environment.id, title: "宿舍法院判决书", metadata: { app: "dormcourt" } },
  });
  if (typeof session?.id !== "string") throw new Error("ai_response_invalid");
  await cloud.request(`/api/v1/cloud/sessions/${session.id}/events`, {
    method: "POST",
    body: { events: [{ type: "user.message", content: [{ type: "text", text: buildPrompt(c, counts, result) }] }] },
  });
  const deadline = Date.now() + 6500;
  while (Date.now() < deadline) {
    const res = await cloud.request(`/api/v1/cloud/sessions/${session.id}/events?order=asc&limit=100`);
    const events = Array.isArray(res?.data) ? res.data : [];
    let text = "";
    for (const event of events) {
      if (event?.type === "agent.message" && Array.isArray(event.content)) {
        const block = event.content.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
        if (block) text = block;
      }
    }
    if (text) return { text: clean(text), source: "ai" };
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error("ai_timeout");
}

export function createVerdictProvider({ db, origin, fallback, budgetMs = 8000 }) {
  let client;
  const getClient = () => (client ??= createCloudAgentsClient({ origin, timeoutMs: 6000 }));
  return async (c, counts) => {
    const pat = globalThis.Deno?.env.get("QODER_PAT");
    if (typeof pat !== "string" || !pat.trim()) return fallback(c, counts);
    let timer;
    try {
      const cloud = getClient();
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), budgetMs);
      });
      const result = await Promise.race([generate(cloud, db, c, counts), timeout]);
      return result?.text ? result : fallback(c, counts);
    } catch {
      return fallback(c, counts);
    } finally {
      clearTimeout(timer);
    }
  };
}