export type Mode = "vote" | "roulette";
export type ScenarioId = "eat" | "express" | "duty" | "custom";

export interface ScenarioPreset {
  id: ScenarioId;
  title: string;
  desc: string;
  question: string;
  mode: Mode;
  options: string[];
  icon: "bowl" | "box" | "broom" | "scales";
}

export const ROOMMATES = ["床长", "卷王", "干饭人", "夜猫子"];

export const SCENARIOS: ScenarioPreset[] = [
  {
    id: "eat",
    title: "今天吃什么",
    desc: "饭点扯皮 · 民主解决",
    question: "今天吃什么？",
    mode: "vote",
    options: ["食堂", "外卖", "泡面", "出去吃"],
    icon: "bowl",
  },
  {
    id: "express",
    title: "谁去拿快递",
    desc: "全员装死 · 票数说话",
    question: "谁去拿快递？",
    mode: "vote",
    options: [...ROOMMATES],
    icon: "box",
  },
  {
    id: "duty",
    title: "宿舍值日",
    desc: "值日表失效 · 交给命运",
    question: "今天谁值日？",
    mode: "roulette",
    options: [...ROOMMATES],
    icon: "broom",
  },
];

export const DURATIONS: { label: string; sec: number | null }[] = [
  { label: "1 分钟", sec: 60 },
  { label: "3 分钟", sec: 180 },
  { label: "5 分钟", sec: 300 },
  { label: "手动开庭", sec: null },
];