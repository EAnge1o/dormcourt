import { useState } from "react";
import { PixelIcon } from "@/components/PixelIcon";
import { SCENARIOS, DURATIONS, type ScenarioPreset, type Mode } from "@/lib/presets";
import { api, ApiError } from "@/lib/api";
import { getVoterId } from "@/lib/identity";
import { navigate } from "@/lib/router";

export default function CreatePage() {
  const roomId = new URLSearchParams(window.location.search).get("room") || undefined;
  const [preset, setPreset] = useState<ScenarioPreset | null>(null);
  const [custom, setCustom] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("vote");
  const [durationSec, setDurationSec] = useState<number | null>(180);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const editing = preset !== null || custom;

  function openPreset(p: ScenarioPreset) {
    setPreset(p);
    setCustom(false);
    setQuestion(p.question);
    setOptions([...p.options]);
    setMode(p.mode);
    setError("");
  }

  function openCustom() {
    setPreset(null);
    setCustom(true);
    setQuestion("");
    setOptions(["", ""]);
    setMode("vote");
    setError("");
  }

  function back() {
    setPreset(null);
    setCustom(false);
    setError("");
  }

  async function submit() {
    const q = question.trim();
    const opts = options.map((o) => o.trim());
    if (!q) return setError("案由不能为空");
    if (opts.some((o) => !o)) return setError("候选选项不能为空");
    if (opts.length < 2 || opts.length > 8) return setError("候选选项需要 2–8 个");
    if (new Set(opts).size !== opts.length) return setError("候选选项不能重复");
    setBusy(true);
    setError("");
    try {
      const { case: c } = await api.createCase({
        roomId,
        scenario: preset?.id ?? "custom",
        question: q,
        mode,
        options: opts,
        durationSec,
        voterId: getVoterId(),
      });
      navigate(`/case/${c.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "立案失败，请稍后再试");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col items-center gap-2 text-center">
        <img
          src="/banner.png"
          alt="像素风宿舍法院：木制法院、巨型法槌与宿舍小屋"
          className="pixel-panel h-44 w-full object-cover sm:h-56"
          style={{ imageRendering: "pixelated" }}
        />
        <h1 className="pixel-title mt-2">宿舍法院</h1>
        <p className="text-sm" style={{ color: "var(--site-muted)" }}>
          DormCourt · 宿舍琐事，开庭裁决
        </p>
      </header>

      {!editing ? (
        <section aria-label="选择案由" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="pixel-panel flex cursor-pointer items-center gap-4 p-4 text-left hover:brightness-105"
              onClick={() => openPreset(s)}
            >
              <PixelIcon name={s.icon} size={44} />
              <span>
                <span className="block text-lg">{s.title}</span>
                <span className="block text-sm" style={{ color: "var(--site-muted)" }}>
                  {s.desc}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="pixel-panel flex cursor-pointer items-center gap-4 p-4 text-left hover:brightness-105"
            onClick={openCustom}
          >
            <PixelIcon name="scales" size={44} />
            <span>
              <span className="block text-lg">自定义纠纷</span>
              <span className="block text-sm" style={{ color: "var(--site-muted)" }}>
                空调温度 · 关灯时间 · 一切皆可开庭
              </span>
            </span>
          </button>
        </section>
      ) : (
        <section aria-label="立案信息" className="pixel-panel flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl">{preset ? preset.title : "自定义纠纷"}</h2>
            <button type="button" className="pixel-btn pixel-btn--ghost pixel-btn--sm" onClick={back}>
              ← 返回
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm">案由（要裁决什么）</span>
            <input
              className="pixel-input"
              value={question}
              maxLength={40}
              placeholder="例如：今晚谁请客？"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm">裁决方式</legend>
            <div className="flex gap-3">
              <button
                type="button"
                aria-pressed={mode === "vote"}
                className={`pixel-btn ${mode === "vote" ? "" : "pixel-btn--ghost"}`}
                onClick={() => setMode("vote")}
              >
                民主投票
              </button>
              <button
                type="button"
                aria-pressed={mode === "roulette"}
                className={`pixel-btn ${mode === "roulette" ? "" : "pixel-btn--ghost"}`}
                onClick={() => setMode("roulette")}
              >
                命运轮盘
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--site-muted)" }}>
              {mode === "vote" ? "票数最多者胜出，平票听天由命" : "全员见证，纯随机裁决"}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm">候选选项（2–8 个）</legend>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="pixel-input"
                  value={opt}
                  maxLength={16}
                  placeholder={`选项 ${i + 1}`}
                  aria-label={`选项 ${i + 1}`}
                  onChange={(e) =>
                    setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
                  }
                />
                <button
                  type="button"
                  className="pixel-btn pixel-btn--red pixel-btn--sm"
                  disabled={options.length <= 2}
                  aria-label={`删除选项 ${i + 1}`}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="pixel-btn pixel-btn--ghost pixel-btn--sm self-start"
              disabled={options.length >= 8}
              onClick={() => setOptions([...options, ""])}
            >
              + 加一个选项
            </button>
          </fieldset>

          {mode === "vote" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm">投票时长</legend>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    aria-pressed={durationSec === d.sec}
                    className={`pixel-btn pixel-btn--sm ${durationSec === d.sec ? "" : "pixel-btn--ghost"}`}
                    onClick={() => setDurationSec(d.sec)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {error && (
            <p role="alert" className="pixel-error text-sm">
              {error}
            </p>
          )}

          <button type="button" className="pixel-btn pixel-btn--green text-lg" disabled={busy} onClick={submit}>
            {busy ? "立案中…" : "提交立案"}
          </button>
        </section>
      )}

      <footer className="mt-auto pt-4 text-center text-xs" style={{ color: "var(--site-muted)" }}>
        本院受理：吃什么、拿快递、值日等一切宿舍纠纷 · 判决结果仅供娱乐
      </footer>
    </main>
  );
}