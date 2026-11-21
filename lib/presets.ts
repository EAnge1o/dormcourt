import type { IconName } from "@/components/PixelIcon";

export type Mode = "vote" | "roulette";
export type ScenarioId = "eat" | "express" | "duty" | "lights" | "ac" | "takeout" | "game" | "custom";

export interface ScenarioPreset {
  id: ScenarioId;
  title: string;
  desc: string;
  question: string;
  mode: Mode;
  options: string[];
  icon: IconName;
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
  {
    id: "lights",
    title: "几点关灯",
    desc: "熬夜党与养生党的休战协议",
    question: "今晚几点熄灯？",
    mode: "vote",
    options: ["22:30", "23:00", "23:30", "通宵"],
    icon: "bulb",
  },
  {
    id: "ac",
    title: "空调几度",
    desc: "26 度党与 22 度党的世纪对决",
    question: "空调开多少度？",
    mode: "vote",
    options: ["22 度", "24 度", "26 度", "关了吧"],
    icon: "snow",
  },
  {
    id: "takeout",
    title: "外卖谁去拿",
    desc: "全员装死 · 票数说话",
    question: "外卖到楼下了，谁下去拿？",
    mode: "vote",
    options: [...ROOMMATES],
    icon: "box",
  },
  {
    id: "game",
    title: "开黑谁背锅",
    desc: "团战输了，总得有个说法",
    question: "这把输了谁背锅？",
    mode: "vote",
    options: ["打野", "辅助", "射手", "网卡了"],
    icon: "gamepad",
  },
];

export const DURATIONS: { label: string; sec: number | null }[] = [
  { label: "1 分钟", sec: 60 },
  { label: "3 分钟", sec: 180 },
  { label: "5 分钟", sec: 300 },
  { label: "手动开庭", sec: null },
];