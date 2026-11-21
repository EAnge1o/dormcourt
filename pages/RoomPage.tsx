import { useEffect, useState } from "react";
import { api, ApiError, type RoomStateDTO } from "@/lib/api";
import { Link, navigate } from "@/lib/router";

export default function RoomPage({ id }: { id: string }) {
  const [state, setState] = useState<RoomStateDTO | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getRoom(id)
      .then(setState)
      .catch((e) => setError(e instanceof ApiError ? e.message : "加载失败"));
  }, [id]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/" className="pixel-btn pixel-btn--ghost pixel-btn--sm">
          立案大厅
        </Link>
        <h1 className="text-xl">本院档案</h1>
        <Link to={`/?room=${id}`} className="pixel-btn pixel-btn--green pixel-btn--sm">
          再开一庭
        </Link>
      </header>

      {error && <p className="pixel-error text-sm">{error}</p>}
      {!state && !error && <p className="pixel-blink text-center">调卷中…</p>}

      {state && state.cases.length === 0 && (
        <p className="pixel-panel p-5 text-center text-sm">本院尚无案件，去开第一庭吧。</p>
      )}

      <ul className="flex flex-col gap-3">
        {state?.cases.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="pixel-panel flex w-full cursor-pointer flex-col gap-1 p-4 text-left"
              onClick={() => navigate(`/case/${c.id}`)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-base">{c.question}</span>
                <span className="pixel-tag shrink-0">{c.mode === "vote" ? "投票" : "轮盘"}</span>
              </span>
              <span className="text-sm" style={{ color: "var(--site-muted)" }}>
                {c.status === "decided"
                  ? `判决：${c.options[c.resultIndex ?? 0]}${c.punishmentText ? ` · 惩罚：${c.punishmentText}` : ""} · ${new Date(c.decidedAt ?? c.createdAt).toLocaleString("zh-CN", { hour12: false })}`
                  : c.status === "runoff"
                    ? "平票加赛中"
                    : "尚未开庭"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <footer className="mt-auto pt-2 text-center text-xs" style={{ color: "var(--site-muted)" }}>
        宿舍法院 DormCourt · 判决结果仅供娱乐
      </footer>
    </main>
  );
}