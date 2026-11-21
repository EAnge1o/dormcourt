import { pickPunishment } from "./templates.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SCENARIOS = ["eat", "express", "duty", "lights", "ac", "takeout", "game", "custom"];
const RUNOFF_MS = 90 * 1000;

const MESSAGES = {
  invalid_input: "输入不合法，请检查后重试",
  payload_too_large: "提交内容过长",
  not_found: "案件或法庭不存在",
  case_closed: "本案已开庭，不能再加入或投票",
  not_joined: "请先输入昵称加入本案",
  not_allowed: "仅发起人可提前开庭，或等待倒计时结束",
  not_decided: "本案尚未开庭",
  invalid_mode: "本案为命运轮盘模式，无需投票",
  runoff_required: "决胜局已开始，请从加赛选项中重新投票",
  too_many_requests: "立案太频繁，本庭先喘口气，稍后再来",
  internal: "本院暂时休庭，请稍后再试",
};

export function application({ db, BackendError, verdictProvider }) {
  const fail = (code, status) => {
    throw new BackendError(code, status);
  };
  const rows = (result) => {
    if (result.error) fail(result.error.code ?? "internal", result.error.status ?? 500);
    return result.data;
  };
  const uuid = (v) => typeof v === "string" && UUID_RE.test(v);

  // In-memory per-instance window; the per-voter DB check below still bounds
  // abuse across instances. Edge restarts simply reset this map.
  const CREATE_LIMIT = { windowMs: 10 * 60 * 1000, perIp: 8, perVoter: 5 };
  const creationTimes = new Map();
  const clientIp = (request) =>
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "local";
  function checkIpLimit(request) {
    const ip = clientIp(request);
    const now = Date.now();
    const list = (creationTimes.get(ip) ?? []).filter((t) => now - t < CREATE_LIMIT.windowMs);
    creationTimes.set(ip, list);
    if (list.length >= CREATE_LIMIT.perIp) fail("too_many_requests", 429);
    return ip;
  }
  function recordCreation(ip) {
    const now = Date.now();
    const list = (creationTimes.get(ip) ?? []).filter((t) => now - t < CREATE_LIMIT.windowMs);
    list.push(now);
    creationTimes.set(ip, list);
  }
  async function checkVoterLimit(voterId) {
    const recent = rows(
      await db.from("cases").select("created_at").eq("created_by", voterId).order("created_at", { ascending: false }).limit(CREATE_LIMIT.perVoter),
    );
    if (recent.length >= CREATE_LIMIT.perVoter && Date.now() - Date.parse(recent[recent.length - 1].created_at) < CREATE_LIMIT.windowMs) {
      fail("too_many_requests", 429);
    }
  }

  async function input(request) {
    if (!request.headers.get("content-type")?.startsWith("application/json")) fail("invalid_input", 400);
    const text = await request.text();
    if (text.length > 8192) fail("payload_too_large", 413);
    try {
      return JSON.parse(text);
    } catch {
      fail("invalid_input", 400);
    }
  }

  const caseDTO = (r) => ({
    id: r.id,
    roomId: r.room_id,
    scenario: r.scenario,
    question: r.question,
    mode: r.mode,
    options: r.options,
    deadlineAt: r.deadline_at,
    status: r.status,
    resultIndex: r.result_index,
    runoffOptions: r.runoff_options ?? null,
    verdictText: r.verdict_text,
    verdictSource: r.verdict_source,
    verdictStatus: r.verdict_status,
    punishmentText: r.punishment_text ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  });
  const memberDTO = (m) => ({ voterId: m.voter_id, nickname: m.nickname, choice: m.choice });
  const roomDTO = (r) => ({ id: r.id, name: r.name, createdAt: r.created_at });

  async function loadCase(id) {
    if (!uuid(id)) fail("not_found", 404);
    const found = rows(await db.from("cases").select("*").eq("id", id).limit(1));
    if (!found?.length) fail("not_found", 404);
    return found[0];
  }

  async function loadMembers(caseId) {
    return rows(await db.from("case_members").select("*").eq("case_id", caseId));
  }

  const countVotes = (members, optionCount) =>
    Array.from({ length: optionCount }, (_, i) => members.filter((m) => m.choice === i).length);

  function pickResult(mode, counts) {
    const random = (idx) => idx[Math.floor(Math.random() * idx.length)];
    const all = counts.map((_, i) => i);
    if (mode === "roulette") return random(all);
    const max = Math.max(...counts);
    if (max === 0) return random(all);
    return random(all.filter((i) => counts[i] === max));
  }

  return async (ctx) => {
    const request = ctx.request;
    try {
      const pathname = new URL(request.url).pathname;
      const match = pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
      if (!match) fail("not_found", 404);
      const path = match[1] || "/";

      if (path === "/api/health" && request.method === "GET") return Response.json({ ok: true });

      if (path === "/api/cases" && request.method === "POST") {
        const body = await input(request);
        const options = Array.isArray(body?.options) ? body.options.map((o) => (typeof o === "string" ? o.trim() : "")) : [];
        if (
          !uuid(body?.voterId) ||
          typeof body?.question !== "string" ||
          !body.question.trim() ||
          body.question.trim().length > 40 ||
          !SCENARIOS.includes(body?.scenario) ||
          !["vote", "roulette"].includes(body?.mode) ||
          options.length < 2 ||
          options.length > 8 ||
          options.some((o) => !o || o.length > 16) ||
          new Set(options).size !== options.length ||
          !(body?.durationSec === null || (Number.isInteger(body?.durationSec) && body.durationSec >= 10 && body.durationSec <= 3600))
        ) {
          fail("invalid_input", 400);
        }
        const ip = checkIpLimit(request);
        await checkVoterLimit(body.voterId);
        let room;
        if (body.roomId) {
          if (!uuid(body.roomId)) fail("invalid_input", 400);
          const found = rows(await db.from("rooms").select("*").eq("id", body.roomId).limit(1));
          if (!found?.length) fail("not_found", 404);
          room = found[0];
        } else {
          const inserted = rows(await db.from("rooms").insert({ id: crypto.randomUUID(), name: "宿舍法院", created_at: new Date().toISOString() }).select("*"));
          room = inserted[0];
        }
        const now = Date.now();
        const inserted = rows(
          await db.from("cases").insert({
            id: crypto.randomUUID(),
            room_id: room.id,
            scenario: body.scenario,
            question: body.question.trim(),
            mode: body.mode,
            options,
            deadline_at: body.durationSec === null ? null : new Date(now + body.durationSec * 1000).toISOString(),
            status: "open",
            result_index: null,
            verdict_text: null,
            verdict_source: null,
            verdict_status: "none",
            verdict_started_at: null,
            created_by: body.voterId,
            created_at: new Date(now).toISOString(),
            decided_at: null,
          }).select("*"),
        );
        recordCreation(ip);
        return Response.json({ room: roomDTO(room), case: caseDTO(inserted[0]) }, { status: 201 });
      }

      const caseMatch = path.match(/^\/api\/cases\/([0-9a-f-]{36})(\/(join|vote|decide|verdict))?$/);
      if (caseMatch && uuid(caseMatch[1])) {
        const id = caseMatch[1];
        const action = caseMatch[3];

        if (!action && request.method === "GET") {
          const c = await loadCase(id);
          const members = await loadMembers(id);
          return Response.json({
            case: caseDTO(c),
            counts: countVotes(members, c.options.length),
            members: members.map(memberDTO),
            serverNow: new Date().toISOString(),
          });
        }

        if (action === "join" && request.method === "POST") {
          const body = await input(request);
          const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
          if (!uuid(body?.voterId) || !nickname || nickname.length > 12) fail("invalid_input", 400);
          const c = await loadCase(id);
          if (c.status === "decided") fail("case_closed", 409);
          const inserted = rows(
            await db.from("case_members").insertIfAbsent(
              { case_id: id, voter_id: body.voterId, nickname, choice: null, updated_at: new Date().toISOString() },
              { onConflict: "case_id,voter_id" },
            ).select("*"),
          );
          if (inserted?.length) return Response.json({ member: memberDTO(inserted[0]) }, { status: 201 });
          const updated = rows(
            await db.from("case_members").update({ nickname, updated_at: new Date().toISOString() }).eq("case_id", id).eq("voter_id", body.voterId).select("*"),
          );
          return Response.json({ member: memberDTO(updated[0]) });
        }

        if (action === "vote" && request.method === "POST") {
          const body = await input(request);
          if (!uuid(body?.voterId) || !Number.isInteger(body?.optionIndex)) fail("invalid_input", 400);
          const c = await loadCase(id);
          if (c.status === "decided") fail("case_closed", 409);
          if (c.mode !== "vote") fail("invalid_mode", 400);
          if (body.optionIndex < 0 || body.optionIndex >= c.options.length) fail("invalid_input", 400);
          if (c.status === "runoff" && !(c.runoff_options ?? []).includes(body.optionIndex)) fail("runoff_required", 409);
          const updated = rows(
            await db.from("case_members").update({ choice: body.optionIndex, updated_at: new Date().toISOString() }).eq("case_id", id).eq("voter_id", body.voterId).select("*"),
          );
          if (!updated?.length) fail("not_joined", 400);
          return Response.json({ member: memberDTO(updated[0]) });
        }

        if (action === "decide" && request.method === "POST") {
          const body = await input(request);
          if (!uuid(body?.voterId)) fail("invalid_input", 400);
          const c = await loadCase(id);
          if (c.status === "decided") return Response.json({ case: caseDTO(c) });
          const expired = c.deadline_at !== null && Date.now() >= Date.parse(c.deadline_at);
          if (body.voterId !== c.created_by && !expired) fail("not_allowed", 403);
          const members = await loadMembers(id);
          const counts = countVotes(members, c.options.length);
          if (c.status === "open" && c.mode === "vote") {
            const max = Math.max(...counts);
            const tied = counts.map((n, i) => (n === max ? i : -1)).filter((i) => i >= 0);
            // 平票且有票：先加赛，不随机。条件更新保证并发下只进入一次。
            if (max > 0 && tied.length > 1) {
              const flipped = rows(
                await db
                  .from("cases")
                  .update({ status: "runoff", runoff_options: tied, deadline_at: new Date(Date.now() + RUNOFF_MS).toISOString() })
                  .eq("id", id)
                  .eq("status", "open")
                  .select("*"),
              );
              if (!flipped?.length) {
                const again = await loadCase(id);
                return Response.json({ case: caseDTO(again) });
              }
              rows(await db.from("case_members").update({ choice: null, updated_at: new Date().toISOString() }).eq("case_id", id));
              return Response.json({ case: caseDTO(flipped[0]) });
            }
          }
          const flipped = rows(
            await db
              .from("cases")
              .update({ status: "decided", decided_at: new Date().toISOString(), punishment_text: pickPunishment(c.scenario) })
              .eq("id", id)
              .eq("status", c.status)
              .select("*"),
          );
          if (!flipped?.length) {
            const again = await loadCase(id);
            return Response.json({ case: caseDTO(again) });
          }
          let resultIndex;
          if (c.mode === "roulette") {
            resultIndex = pickResult("roulette", counts);
          } else if (c.status === "runoff" && c.runoff_options?.length) {
            // 决胜局内仍平票才听天由命，且只在平票选项里随机。
            const max = Math.max(...c.runoff_options.map((i) => counts[i]));
            const tied = c.runoff_options.filter((i) => counts[i] === max);
            resultIndex = tied[Math.floor(Math.random() * tied.length)];
          } else {
            resultIndex = pickResult("vote", counts);
          }
          const withResult = rows(await db.from("cases").update({ result_index: resultIndex }).eq("id", id).select("*"));
          return Response.json({ case: caseDTO(withResult[0]) });
        }

        if (action === "verdict" && request.method === "POST") {
          const c = await loadCase(id);
          if (c.status !== "decided") fail("not_decided", 409);
          if (c.verdict_status === "ready") {
            return Response.json({ verdictText: c.verdict_text, verdictSource: c.verdict_source, verdictStatus: "ready" });
          }
          const now = Date.now();
          let claimed = rows(
            await db.from("cases").update({ verdict_status: "pending", verdict_started_at: new Date(now).toISOString() }).eq("id", id).eq("verdict_status", "none").select("id"),
          );
          if (!claimed?.length) {
            const current = await loadCase(id);
            if (current.verdict_status === "ready") {
              return Response.json({ verdictText: current.verdict_text, verdictSource: current.verdict_source, verdictStatus: "ready" });
            }
            const stale = current.verdict_started_at !== null && now - Date.parse(current.verdict_started_at) > 30000;
            if (!stale) return Response.json({ verdictStatus: "pending" });
            claimed = rows(
              await db.from("cases").update({ verdict_status: "pending", verdict_started_at: new Date(now).toISOString() }).eq("id", id).eq("verdict_status", "pending").eq("verdict_started_at", current.verdict_started_at).select("id"),
            );
            if (!claimed?.length) return Response.json({ verdictStatus: "pending" });
          }
          const members = await loadMembers(id);
          const verdict = await verdictProvider(caseDTO(c), countVotes(members, c.options.length));
          const saved = rows(
            await db.from("cases").update({ verdict_text: verdict.text, verdict_source: verdict.source, verdict_status: "ready" }).eq("id", id).eq("verdict_status", "pending").select("*"),
          );
          if (!saved?.length) {
            const current = await loadCase(id);
            return Response.json({ verdictText: current.verdict_text, verdictSource: current.verdict_source, verdictStatus: current.verdict_status });
          }
          return Response.json({ verdictText: verdict.text, verdictSource: verdict.source, verdictStatus: "ready" });
        }
      }

      const roomMatch = path.match(/^\/api\/rooms\/([0-9a-f-]{36})$/);
      if (roomMatch && uuid(roomMatch[1]) && request.method === "GET") {
        const found = rows(await db.from("rooms").select("*").eq("id", roomMatch[1]).limit(1));
        if (!found?.length) fail("not_found", 404);
        const list = rows(await db.from("cases").select("*").eq("room_id", roomMatch[1]).order("created_at", { ascending: false }).limit(50));
        return Response.json({ room: roomDTO(found[0]), cases: list.map(caseDTO) });
      }

      fail("not_found", 404);
    } catch (error) {
      if (error instanceof BackendError) {
        return Response.json(
          { error: { code: error.code, message: MESSAGES[error.code] ?? "请求失败" } },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return Response.json(
        { error: { code: "internal", message: MESSAGES.internal, requestId: ctx.requestId } },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}