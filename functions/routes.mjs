const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SCENARIOS = ["eat", "express", "duty", "custom"];
const MESSAGES = {
  invalid_input: "输入不合法，请检查后重试",
  payload_too_large: "提交内容过长",
  not_found: "案件或法庭不存在",
  case_closed: "本案已开庭，不能再加入或投票",
  not_joined: "请先输入昵称加入本案",
  not_allowed: "仅发起人可提前开庭，或等待倒计时结束",
  not_decided: "本案尚未开庭",
  invalid_mode: "本案为命运轮盘模式，无需投票",
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
    verdictText: r.verdict_text,
    verdictSource: r.verdict_source,
    verdictStatus: r.verdict_status,
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
          if (c.status !== "open") fail("case_closed", 409);
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
          if (c.status !== "open") fail("case_closed", 409);
          if (c.mode !== "vote") fail("invalid_mode", 400);
          if (body.optionIndex < 0 || body.optionIndex >= c.options.length) fail("invalid_input", 400);
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
          const flipped = rows(
            await db.from("cases").update({ status: "decided", decided_at: new Date().toISOString() }).eq("id", id).eq("status", "open").select("*"),
          );
          if (!flipped?.length) {
            const again = await loadCase(id);
            return Response.json({ case: caseDTO(again) });
          }
          const members = await loadMembers(id);
          const resultIndex = pickResult(c.mode, countVotes(members, c.options.length));
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