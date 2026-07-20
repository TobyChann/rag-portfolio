export type VisitorRole = "recruiter" | "hiring_manager" | "peer" | "curious";
export type Industry = "Tech" | "Finance" | "Government" | "Healthcare" | "Other";

export interface Source {
  google_doc_id: string;
  title: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  queryId?: string;
  feedback?: 1 | -1 | null;
  responseMs?: number;
  sources?: Source[];
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
