export interface Source {
  google_doc_id: string;
  title: string;
  module?: string;
  chunk_ids?: string[];
  best_score?: number;
}

/** [n] in an answer -> the note chunk it cites. */
export interface Citation {
  n: number;
  google_doc_id: string;
  heading: string;
  chunk_index?: number | null;
}

/** How an answer was produced: shown under "How this was answered". */
export interface Trace {
  retrieval: { chunk_id: string | null; heading: string; doc_title: string;
               dense_rank: number | null; lexical_rank: number | null; fused_score: number }[];
  rewritten_question: string | null;
  cache_hit: string | null;
  response_ms: number;
  model: string;
  mode?: string;
  tokens_in: number | null;
  tokens_out: number | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  queryId?: string;
  feedback?: 1 | -1 | null;
  responseMs?: number;
  sources?: Source[];
  citations?: Citation[];
  trace?: Trace;
  followups?: string[];
}
