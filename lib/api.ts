import type { Mode, ScenarioId } from "./presets";

export interface MemberDTO {
  voterId: string;
  nickname: string;
  choice: number | null;
}

export interface CaseDTO {
  id: string;
  roomId: string;
  scenario: ScenarioId;
  question: string;
  mode: Mode;
  options: string[];
  deadlineAt: string | null;
  status: "open" | "decided";
  resultIndex: number | null;
  verdictText: string | null;
  verdictSource: "ai" | "template" | null;
  verdictStatus: "none" | "pending" | "ready";
  createdBy: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface CaseStateDTO {
  case: CaseDTO;
  counts: number[];
  members: MemberDTO[];
}

export interface RoomDTO {
  id: string;
  name: string;
  createdAt: string;
}

export interface RoomStateDTO {
  room: RoomDTO;
  cases: CaseDTO[];
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const BASE = "/functions/v1/app/api";

async function req<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(data?.error?.code ?? "network_error", data?.error?.message ?? "网络异常，请稍后再试");
  }
  return data as T;
}

export const api = {
  createCase: (input: {
    roomId?: string;
    scenario: ScenarioId;
    question: string;
    mode: Mode;
    options: string[];
    durationSec: number | null;
    voterId: string;
  }) => req<{ room: RoomDTO; case: CaseDTO }>("/cases", "POST", input),
  getCase: (id: string) => req<CaseStateDTO>(`/cases/${id}`),
  join: (id: string, voterId: string, nickname: string) =>
    req<{ member: MemberDTO }>(`/cases/${id}/join`, "POST", { voterId, nickname }),
  vote: (id: string, voterId: string, optionIndex: number) =>
    req<{ member: MemberDTO }>(`/cases/${id}/vote`, "POST", { voterId, optionIndex }),
  decide: (id: string, voterId: string) =>
    req<{ case: CaseDTO }>(`/cases/${id}/decide`, "POST", { voterId }),
  verdict: (id: string) =>
    req<{ verdictText: string; verdictSource: "ai" | "template"; verdictStatus: string }>(
      `/cases/${id}/verdict`,
      "POST",
    ),
  getRoom: (id: string) => req<RoomStateDTO>(`/rooms/${id}`),
};

export function shareUrl(caseId: string): string {
  return `${window.location.origin}/case/${caseId}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}