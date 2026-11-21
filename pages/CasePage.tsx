import { useCallback, useEffect, useRef, useState } from "react";
import { PixelIcon } from "@/components/PixelIcon";
import { VerdictCard } from "@/components/VerdictCard";
import { api, ApiError, copyText, shareUrl, type CaseStateDTO } from "@/lib/api";
import { getLastNickname, getVoterId, randomNickname, saveNickname } from "@/lib/identity";
import { Link } from "@/lib/router";

const POLL_MS = 2500;
const REVEAL_MS = 2600;

export default function CasePage({ id }: { id: string }) {
  const voterId = getVoterId();
  const [state, setState] = useState<CaseStateDTO | null>(null);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState(() => getLastNickname() || randomNickname());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [spin, setSpin] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [retryTick, setRetryTick] = useState(0);
  const revealSeen = useRef(false);
  const verdictRequested = useRef(false);
  const decideRequested = useRef(false);
  const retryAttempts = useRef(0);
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const refresh = useCallback(async () => {
    try {
      setState(await api.getCase(id));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败，请刷新重试");
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(
    () => () => {
      retryTimers.current.forEach(clearTimeout);
      retryTimers.current = [];
    },
    [],
  );

  const scheduleRetry = useCallback((retry: () => void) => {
    const delay = Math.min(30000, 2000 * 2 ** retryAttempts.current);
    retryAttempts.current += 1;
    const timer = setTimeout(() => {
      retryTimers.current = retryTimers.current.filter((t) => t !== timer);
      retry();
    }, delay);
    retryTimers.current.push(timer);
  }, []);

  const c = state?.case;
  const status = c?.status;
  const verdictStatus = c?.verdictStatus;

  useEffect(() => {
    if (!c) return;
    if (status === "open" || status === "runoff" || (status === "decided" && verdictStatus !== "ready")) {
      const timer = setInterval(refresh, POLL_MS);
      return () => clearInterval(timer);
    }
  }, [c, status, verdictStatus, refresh]);

  useEffect(() => {
    if (status !== "open" && status !== "runoff") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "decided" && c?.resultIndex !== null && !revealSeen.current) {
      revealSeen.current = true;
      setRevealing(true);
      const timer = setTimeout(() => setRevealing(false), REVEAL_MS);
      return () => clearTimeout(timer);
    }
  }, [status, c?.resultIndex]);

  useEffect(() => {
    if (!revealing) return;
    const timer = setInterval(() => setSpin((i) => i + 1), 180);
    return () => clearInterval(timer);
  }, [revealing]);

  useEffect(() => {
    if (status === "decided" && verdictStatus === "none" && !verdictRequested.current) {
      verdictRequested.current = true;
      api
        .verdict(id)
        .then(() => {
          retryAttempts.current = 0;
          refresh();
        })
        .catch(() => {
          verdictRequested.current = false;
          scheduleRetry(() => setRetryTick((t) => t + 1));
        });
    }
  }, [status, verdictStatus, id, refresh, retryTick, scheduleRetry]);

  const remaining = c?.deadlineAt ? Math.max(0, Date.parse(c.deadlineAt) - now) : null;

  useEffect(() => {
    if ((status === "open" || status === "runoff") && remaining === 0 && !decideRequested.current) {
      decideRequested.current = true;
      api
        .decide(id, voterId)
        .then(() => {
          retryAttempts.current = 0;
          refresh();
        })
        .catch(() => {
          decideRequested.current = false;
          scheduleRetry(() => setRetryTick((t) => t + 1));
        });
    }
  }, [status, remaining, id, voterId, refresh, retryTick, scheduleRetry]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作失败，请稍后再试");
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? kind : "");
    if (!ok) setError("复制失败，请手动长按选择文本");
    setTimeout(() => setCopied(""), 1600);
  }

  if (!state) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center justify-center p-6">
        <p className="pixel-blink text-lg">{error || "开庭准备中…"}</p>
      </main>
    );
  }

  if (!c) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6">
        <p className="pixel-error">{error}</p>
        <Link to="/" className="pixel-btn pixel-btn--ghost">
          回立案大厅
        </Link>
      </main>
    );
  }

  const me = state.members.find((m) => m.voterId === voterId);
  const isCreator = c.createdBy === voterId;
  const totalVotes = state.counts.reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(1, ...state.counts);
  const runoffOptions = c.runoffOptions;
  const voteOptions =
    runoffOptions && c.status === "runoff"
      ? c.options.map((o, i) => ({ o, i })).filter((x) => runoffOptions.includes(x.i))
      : c.options.map((o, i) => ({ o, i }));
  const losers = c.status === "decided" && c.mode === "vote" ? state.members.filter((m) => m.choice !== c.resultIndex) : [];
  const countdown =
    remaining === null
      ? "手动开庭"
      : `${String(Math.floor(remaining / 60000)).padStart(2, "0")}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" className="pixel-btn pixel-btn--ghost pixel-btn--sm">
          立案大厅
        </Link>
        <span className="pixel-tag">{c.mode === "vote" ? (c.status === "runoff" ? "平票加赛" : "民主投票") : "命运轮盘"}</span>
        <Link to={`/room/${c.roomId}`} className="pixel-btn pixel-btn--ghost pixel-btn--sm">
          本院档案
        </Link>
      </header>

      <section className="pixel-panel flex flex-col gap-3 p-5">
        <h1 className="text-2xl leading-snug">{c.question}</h1>
        <p className="text-sm" style={{ color: "var(--site-muted)" }}>
          {c.status !== "decided" ? (
            <>
              距开庭 <span className={remaining !== null && remaining < 15000 ? "pixel-blink font-bold" : "font-bold"}>{countdown}</span>
              {" · "}
              {state.members.length} 人在场
              {c.mode === "vote" ? ` · ${totalVotes} 票` : ""}
            </>
          ) : (
            <>已开庭 · {state.members.length} 人在场见证</>
          )}
        </p>

        {c.status === "runoff" && (
          <p className="pixel-blink text-sm font-bold" role="status">
            平票！进入决胜局：仅平票选项参与，票数清零重新投票。
          </p>
        )}

        {c.status !== "decided" && (
          <button
            type="button"
            className="pixel-btn pixel-btn--ghost pixel-btn--sm self-start"
            onClick={() => copy("invite", `宿舍法院开庭了：${c.question} 快来投票/见证 → ${shareUrl(c.id)}`)}
          >
            {copied === "invite" ? "已复制邀请文案" : "复制邀请链接甩进群"}
          </button>
        )}

        {c.status !== "decided" && !me && (
          <div className="flex flex-col gap-2">
            <label className="text-sm" htmlFor="nickname">
              报上名来（昵称）
            </label>
            <div className="flex gap-2">
              <input
                id="nickname"
                className="pixel-input"
                value={nickname}
                maxLength={12}
                onChange={(e) => setNickname(e.target.value)}
              />
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost pixel-btn--sm shrink-0"
                onClick={() => setNickname(randomNickname())}
              >
                随机
              </button>
            </div>
            <button
              type="button"
              className="pixel-btn pixel-btn--green"
              disabled={busy || !nickname.trim()}
              onClick={() =>
                act(async () => {
                  await api.join(c.id, voterId, nickname.trim());
                  saveNickname(nickname.trim());
                })
              }
            >
              {c.mode === "vote" ? "加入本案" : "在场见证"}
            </button>
          </div>
        )}

        {c.status !== "decided" && me && c.mode === "vote" && (
          <ul className="flex flex-col gap-2" aria-label="候选选项">
            {voteOptions.map(({ o, i }) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={me.choice === i}
                  className="pixel-panel flex w-full cursor-pointer flex-col gap-1 p-3 text-left"
                  style={me.choice === i ? { background: "var(--pixel-gold)" } : undefined}
                  onClick={() => act(() => api.vote(c.id, voterId, i))}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base">
                      {o}
                      {me.choice === i ? "（已投）" : ""}
                    </span>
                    <span className="text-sm font-bold">{state.counts[i]} 票</span>
                  </span>
                  <span className="pixel-meter">
                    <span className="pixel-meter-fill block" style={{ width: `${(state.counts[i] / maxVotes) * 100}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {c.status !== "decided" && me && c.mode === "roulette" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">在场见证人：</p>
            <p className="flex flex-wrap gap-2">
              {state.members.map((m) => (
                <span key={m.voterId} className="pixel-tag">
                  {m.nickname}
                </span>
              ))}
            </p>
            <p className="text-xs" style={{ color: "var(--site-muted)" }}>
              轮盘模式不投票，开庭后由命运随机指定。
            </p>
          </div>
        )}

        {c.status !== "decided" && isCreator && (
          <button
            type="button"
            className="pixel-btn pixel-btn--red"
            disabled={busy}
            onClick={() => act(() => api.decide(c.id, voterId))}
          >
            {c.mode === "vote" ? (c.status === "runoff" ? "立即终审" : "提前开庭") : "立即开庭"}
          </button>
        )}
      </section>

      {revealing && (
        <section className="pixel-panel flex flex-col items-center gap-4 p-6" aria-live="polite">
          {c.mode === "vote" ? (
            <span className="pixel-gavel-anim inline-block">
              <PixelIcon name="gavel" size={72} />
            </span>
          ) : (
            <p className="flex flex-wrap justify-center gap-2">
              {c.options.map((opt, i) => (
                <span
                  key={i}
                  className="pixel-tag"
                  style={spin % c.options.length === i ? { background: "var(--pixel-green)", color: "#fff8e7" } : undefined}
                >
                  {opt}
                </span>
              ))}
            </p>
          )}
          <p className="pixel-blink text-lg">开庭中…</p>
          <button type="button" className="pixel-btn pixel-btn--ghost pixel-btn--sm" onClick={() => setRevealing(false)}>
            跳过动画
          </button>
        </section>
      )}

      {c.status === "decided" && !revealing && (
        <>
          <section className="pixel-panel flex flex-col items-center gap-2 p-5 text-center" aria-live="polite">
            <p className="text-sm" style={{ color: "var(--site-muted)" }}>
              判决结果
            </p>
            <p className="pixel-title" style={{ fontSize: "calc(32px * var(--site-type))" }}>
              {c.options[c.resultIndex ?? 0]}
            </p>
          </section>

          {c.punishmentText && (
            <section className="pixel-panel flex flex-col gap-1 p-4 text-sm" aria-live="polite">
              {c.mode === "vote" ? (
                losers.length > 0 ? (
                  <>
                    <p>
                      败选方：<span className="font-bold">{losers.map((m) => m.nickname).join("、")}</span>
                    </p>
                    <p>
                      惩罚令：<span className="font-bold">{c.punishmentText}</span>
                    </p>
                  </>
                ) : (
                  <p>全票通过！无人败选，惩罚作废，全员庆祝。</p>
                )
              ) : (
                <p>
                  <span className="font-bold">{c.options[c.resultIndex ?? 0]}</span> 被命运选中，附加惩罚：
                  <span className="font-bold">{c.punishmentText}</span>
                </p>
              )}
            </section>
          )}

          {c.verdictStatus === "ready" && c.verdictText ? (
            <VerdictCard c={c} />
          ) : (
            <p className="pixel-blink text-center text-sm">本院正在撰写判决书…</p>
          )}

          <div className="flex flex-wrap gap-2">
            {c.verdictText && (
              <button
                type="button"
                className="pixel-btn pixel-btn--ghost pixel-btn--sm"
                onClick={() =>
                  copy(
                    "verdict",
                    `【宿舍法院判决书】${c.question} 判决结果：${c.options[c.resultIndex ?? 0]}。${c.verdictText}${c.punishmentText ? ` 惩罚令：${c.punishmentText}` : ""}`,
                  )
                }
              >
                {copied === "verdict" ? "已复制判决书" : "复制判决书"}
              </button>
            )}
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost pixel-btn--sm"
              onClick={() =>
                copy(
                  "share",
                  `宿舍法院裁决：${c.question} → ${c.options[c.resultIndex ?? 0]}！${c.verdictText ?? ""}${c.punishmentText ? ` 惩罚令：${c.punishmentText}` : ""} 围观/再开一庭 → ${shareUrl(c.id)}`,
                )
              }
            >
              {copied === "share" ? "已复制分享文案" : "复制分享文案"}
            </button>
            <Link to={`/room/${c.roomId}`} className="pixel-btn pixel-btn--ghost pixel-btn--sm">
              查看本院历史
            </Link>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="pixel-error text-sm">
          {error}
        </p>
      )}

      <footer className="mt-auto pt-2 text-center text-xs" style={{ color: "var(--site-muted)" }}>
        宿舍法院 DormCourt · 判决结果仅供娱乐
      </footer>
    </main>
  );
}