const VOTER_KEY = "dormcourt.voterId";
const NICK_KEY = "dormcourt.nickname";

export function getVoterId(): string {
  let id = localStorage.getItem(VOTER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_KEY, id);
  }
  return id;
}

const PREFIX = ["干饭", "熬夜", "摸鱼", "卷王", "摆烂", "早起", "社恐", "养生", "奶茶", "开黑"];
const SUFFIX = ["床长", "选手", "大师", "仙人", "队长", "冠军", "新人", "高手"];

export function randomNickname(): string {
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
  return pick(PREFIX) + pick(SUFFIX);
}

export function getLastNickname(): string {
  return localStorage.getItem(NICK_KEY) ?? "";
}

export function saveNickname(nickname: string) {
  localStorage.setItem(NICK_KEY, nickname);
}