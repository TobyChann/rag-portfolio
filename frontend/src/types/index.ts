export type VisitorRole = "recruiter" | "hiring_manager" | "peer" | "curious";
export type Industry = "Tech" | "Finance" | "Government" | "Healthcare" | "Other";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  queryId?: string;
  feedback?: 1 | -1 | null;
  responseMs?: number;
}

export interface Course {
  id: string;
  name: string;
  institution: string;
  year: number;
  summary: string;
  topics: string[];
}

export interface Experience {
  title: string;
  company: string;
  period: string;
  description: string;
}
