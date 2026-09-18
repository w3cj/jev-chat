import type { ServerId } from "./servers.ts";

export interface JevQuestionJson {
  type: "choice" | "noul" | "score";
  instructions?: unknown;
  criteria?: unknown;
}

export interface JevAnswerJson {
  type: "choice" | "noul" | "score";
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  noul?: number;
  score?: number;
}

export interface ArgTrace {
  name: string;
  value: unknown;
  /**
   * Where the value came from: "message", "earlier result", "Home Assistant", "option", or
   * "default" (the code's fallback when Jev picked none), …
   */
  source: string;
  questionKey?: string;
}

export type Outcome =
  | "call"
  | "confirm"
  | "ask"
  | "choices"
  | "chat"
  | "unsupported"
  | "cancel"
  | "error";

export interface JevTrace {
  request: { model: string; state: unknown; questions: Record<string, JevQuestionJson> };
  response?: {
    model: string;
    answers: Record<string, JevAnswerJson>;
    usage: { input_tokens: number; output_tokens: number };
  };
  error?: string;
  ms: number;
}

export interface CallTrace {
  server: ServerId;
  tool: string;
  args: Record<string, unknown>;
  ms: number;
  isError: boolean;
  result: unknown;
}

/** One step of a multi-step tool: an MCP call, or a Jev request about a call's result. */
export interface TraceStep {
  title: string;
  jev?: JevTrace;
  usedQuestions?: string[];
  optionLabels?: Record<string, Record<string, string>>;
  call?: CallTrace;
}

/** Pre-processing: unknown words, the pick per word, and the message after corrections */
export interface SpellingTrace {
  original: string;
  corrected: string;
  words: {
    word: string;
    suggestions: string[];
    replacement?: string;
    decidedBy: "jev" | "common misspelling" | "only close match";
  }[];
  jev?: JevTrace;
  optionLabels?: Record<string, Record<string, string>>;
}

/** Pre-processing: a short follow-up rewritten into a full question using the previous one */
export interface FollowUpTrace {
  original: string;
  previous: string;
  /** The rewrite Jev picked, or the original when it chose "as-is" */
  resolved: string;
  /** Set when code swapped the previous question's span of this kind without asking Jev */
  slot?: "date" | "number" | "place";
  jev?: JevTrace;
  optionLabels?: Record<string, Record<string, string>>;
}

/** Everything one turn decided: what was asked, what Jev answered, and what the code did with it. */
export interface Trace {
  /** Present when the spell check found unknown or misspelled words */
  spelling?: SpellingTrace;
  /** Present when a short follow-up was checked against the previous question */
  followUp?: FollowUpTrace;
  jev?: JevTrace;
  /** Question keys whose answers the code actually used; the rest were speculative. */
  usedQuestions: string[];
  /** Question key → (option key → label), e.g. weather_get_weather__place → { t3: "Seattle" }. */
  optionLabels?: Record<string, Record<string, string>>;
  decision: {
    outcome: Outcome;
    reason: string;
    requestKind?: string;
    toolId?: string;
    toolConfidence?: number;
  };
  args?: ArgTrace[];
  call?: CallTrace;
  /** Multi-step tools: every MCP call and Jev request the tool made, in order */
  steps?: TraceStep[];
  totalMs: number;
}
