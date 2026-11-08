import type { CaseDTO } from "@/lib/api";

export function VerdictCard({ c }: { c: CaseDTO }) {
  return (
    <article
      className="pixel-panel flex flex-col gap-3 p-5"
      style={{ background: "var(--pixel-paper)" }}
      aria-label="判决书"
    >
      <h3 className="text-center text-xl tracking-widest">宿舍法院判决书</h3>
      <p className="text-center text-xs" style={{ color: "var(--site-muted)" }}>
        （2026）宿法字第 {c.id.slice(0, 4).toUpperCase()} 号
      </p>
      <hr className="pixel-divider" />
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold">案由：</dt>
          <dd>{c.question}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold">判决结果：</dt>
          <dd className="text-base font-bold">{c.options[c.resultIndex ?? 0]}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 font-bold">判决理由：</dt>
          <dd className="leading-relaxed">{c.verdictText}</dd>
        </div>
      </dl>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--site-muted)" }}>
          {c.verdictSource === "ai" ? "本判决由 AI 法官撰写" : "本判决由值班模板法官撰写"}
          <br />
          本判决为终审判决，仅供娱乐
        </p>
        <span className="pixel-stamp">裁决生效</span>
      </div>
    </article>
  );
}