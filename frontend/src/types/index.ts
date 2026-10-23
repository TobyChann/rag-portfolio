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
