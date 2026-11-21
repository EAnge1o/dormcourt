// NOTE: run against a freshly started local server (per-IP rate limit is in-memory).
const BASE = "http://127.0.0.1:8000/functions/v1/app/api";
let failures = 0;

function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " · " + extra : ""}`);
  if (!cond) failures++;
}

async function call(path, method = "GET", body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const voterA = crypto.randomUUID();
const voterB = crypto.randomUUID();
const outsider = crypto.randomUUID();

const created = await call("/cases", "POST", {
  scenario: "eat",
  question: "今天吃什么？",
  mode: "vote",
  options: ["食堂", "外卖", "泡面", "出去吃"],
  durationSec: 180,
  voterId: voterA,
});
check("create case 201", created.status === 201, created.data.case?.id);
const caseId = created.data.case.id;
const roomId = created.data.room.id;

const joinedA = await call(`/cases/${caseId}/join`, "POST", { voterId: voterA, nickname: "干饭床长" });
const joinedB = await call(`/cases/${caseId}/join`, "POST", { voterId: voterB, nickname: "熬夜卷王" });
check("join A/B", joinedA.status === 201 && joinedB.status === 201);

await call(`/cases/${caseId}/vote`, "POST", { voterId: voterA, optionIndex: 0 });
await call(`/cases/${caseId}/vote`, "POST", { voterId: voterB, optionIndex: 0 });
await call(`/cases/${caseId}/vote`, "POST", { voterId: voterB, optionIndex: 1 });
let state = await call(`/cases/${caseId}`);
check("change vote counts [1,1,0,0]", JSON.stringify(state.data.counts) === "[1,1,0,0]", JSON.stringify(state.data.counts));

await call(`/cases/${caseId}/vote`, "POST", { voterId: voterB, optionIndex: 0 });
state = await call(`/cases/${caseId}`);
check("no duplicate votes [2,0,0,0]", JSON.stringify(state.data.counts) === "[2,0,0,0]", JSON.stringify(state.data.counts));
check("members = 2", state.data.members.length === 2);

const early = await call(`/cases/${caseId}/decide`, "POST", { voterId: outsider });
check("outsider early decide 403", early.status === 403);

const decided = await call(`/cases/${caseId}/decide`, "POST", { voterId: voterA });
check("creator decide ok", decided.status === 200 && decided.data.case.status === "decided");
check("result = top vote (0)", decided.data.case.resultIndex === 0);

const lateVote = await call(`/cases/${caseId}/vote`, "POST", { voterId: voterB, optionIndex: 2 });
check("vote after decided 409", lateVote.status === 409);

const verdict = await call(`/cases/${caseId}/verdict`, "POST");
check("verdict ready", verdict.data.verdictStatus === "ready" && verdict.data.verdictSource === "template");
check("verdict mentions result", verdict.data.verdictText.includes("食堂"), verdict.data.verdictText);

const verdict2 = await call(`/cases/${caseId}/verdict`, "POST");
check("verdict idempotent", verdict2.data.verdictText === verdict.data.verdictText);

const room = await call(`/rooms/${roomId}`);
check("room history 1 case", room.data.cases.length === 1 && room.data.cases[0].id === caseId);

const roulette = await call("/cases", "POST", {
  scenario: "duty",
  question: "今天谁值日？",
  mode: "roulette",
  options: ["床长", "卷王", "干饭人", "夜猫子"],
  durationSec: null,
  voterId: voterA,
});
const rid = roulette.data.case.id;
await call(`/cases/${rid}/join`, "POST", { voterId: voterB, nickname: "见证人" });
const rVote = await call(`/cases/${rid}/vote`, "POST", { voterId: voterB, optionIndex: 0 });
check("roulette rejects vote 400", rVote.status === 400);
const rDecided = await call(`/cases/${rid}/decide`, "POST", { voterId: voterA });
check("roulette manual decide", rDecided.data.case.status === "decided" && rDecided.data.case.resultIndex >= 0 && rDecided.data.case.resultIndex < 4);
check("roulette punishment drawn", typeof rDecided.data.case.punishmentText === "string" && rDecided.data.case.punishmentText.length > 0, rDecided.data.case.punishmentText);

// Rate limit: voterA already created 2 cases; limit is 5 per 10 minutes.
for (let i = 0; i < 3; i++) {
  const more = await call("/cases", "POST", {
    scenario: "custom",
    question: `限流测试${i + 1}`,
    mode: "vote",
    options: ["甲", "乙"],
    durationSec: null,
    voterId: voterA,
  });
  check(`create case ${i + 3} of 5 ok`, more.status === 201);
}
const blocked = await call("/cases", "POST", {
  scenario: "custom",
  question: "限流测试6",
  mode: "vote",
  options: ["甲", "乙"],
  durationSec: null,
  voterId: voterA,
});
check("6th creation blocked 429", blocked.status === 429 && blocked.data?.error?.code === "too_many_requests");
const freshVoter = await call("/cases", "POST", {
  scenario: "custom",
  question: "新投票人不受限",
  mode: "vote",
  options: ["甲", "乙"],
  durationSec: null,
  voterId: crypto.randomUUID(),
});
check("fresh voter unaffected", freshVoter.status === 201);

// Tie vote forces a runoff round, then final decide draws a punishment
const voterC = crypto.randomUUID();
const voterD = crypto.randomUUID();
const tie = await call("/cases", "POST", {
  scenario: "ac",
  question: "空调开多少度？",
  mode: "vote",
  options: ["22 度", "24 度", "26 度"],
  durationSec: null,
  voterId: voterC,
});
const tieId = tie.data.case.id;
await call(`/cases/${tieId}/join`, "POST", { voterId: voterC, nickname: "冷党" });
await call(`/cases/${tieId}/join`, "POST", { voterId: voterD, nickname: "热党" });
await call(`/cases/${tieId}/vote`, "POST", { voterId: voterC, optionIndex: 0 });
await call(`/cases/${tieId}/vote`, "POST", { voterId: voterD, optionIndex: 2 });
const runoff = await call(`/cases/${tieId}/decide`, "POST", { voterId: voterC });
check("tie enters runoff", runoff.data.case.status === "runoff" && JSON.stringify(runoff.data.case.runoffOptions) === "[0,2]", JSON.stringify(runoff.data.case.runoffOptions));
const tieState = await call(`/cases/${tieId}`);
check("runoff resets votes", JSON.stringify(tieState.data.counts) === "[0,0,0]");
const badVote = await call(`/cases/${tieId}/vote`, "POST", { voterId: voterD, optionIndex: 1 });
check("non-runoff option rejected", badVote.status === 409 && badVote.data?.error?.code === "runoff_required");
await call(`/cases/${tieId}/vote`, "POST", { voterId: voterC, optionIndex: 0 });
await call(`/cases/${tieId}/vote`, "POST", { voterId: voterD, optionIndex: 0 });
const final = await call(`/cases/${tieId}/decide`, "POST", { voterId: voterC });
check("runoff decide final", final.data.case.status === "decided" && final.data.case.resultIndex === 0, `result=${final.data.case.resultIndex}`);
check("vote punishment drawn", typeof final.data.case.punishmentText === "string" && final.data.case.punishmentText.length > 0, final.data.case.punishmentText);

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exitCode = failures === 0 ? 0 : 1;