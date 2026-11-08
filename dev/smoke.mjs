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

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exitCode = failures === 0 ? 0 : 1;