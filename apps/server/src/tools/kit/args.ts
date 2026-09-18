import { NOUL_YES } from "../../config.ts";
import type { Candidate } from "../../jev/pools.ts";
import type { Answers } from "../../jev/questions.ts";
import type { ArgTrace } from "../../shared/types.ts";
import { missing, ok, type BuildResult } from "./adapter.ts";

/**
 * Builds an adapter's MCP arguments and its argument trace together: each value goes into the
 * arguments and is recorded with where it came from.
 */
export class Args {
  readonly args: Record<string, unknown>;
  readonly sources: ArgTrace[] = [];

  constructor(
    private readonly a: Answers,
    partial: Record<string, unknown> = {},
  ) {
    this.args = { ...partial };
  }

  /** The full question key, for a trace entry the code fills in itself. */
  key(question: string) {
    return this.a.key(question);
  }

  /** Whether a Noul question came back as yes. */
  yes(question: string) {
    return this.a.noul(question) > NOUL_YES;
  }

  /** The option Jev picked for a Choice question, without recording it. */
  choice(question: string, fallback?: string) {
    return this.a.choice(question) ?? fallback;
  }

  /** The candidate Jev picked from a pool, without recording it. */
  candidate<C extends Candidate<unknown>>(question: string, pool: C[]) {
    return this.a.candidate(question, pool);
  }

  /** Jev's options for a Choice with their probabilities, best first, without recording them. */
  ranked(question: string) {
    return this.a.ranked(question);
  }

  /** A Choice that is itself the argument; `fallback`, traced as "default", when Jev picked none. */
  option(name: string, fallback?: string): string | undefined {
    const picked = this.a.choice(name);
    const value = picked ?? fallback;
    const source = picked === undefined ? "default" : "option";
    if (value !== undefined) this.set(name, value, source, this.key(name));
    return value;
  }

  /** A value picked out of a pool (the message, an earlier result, a tool's own names). */
  pick<C extends Candidate<unknown>>(name: string, pool: C[]): C | undefined {
    const c = this.candidate(name, pool);
    if (c) this.set(name, c.value, c.source, this.key(name));
    return c;
  }

  /** An argument the code worked out itself (a clamped number, a date, a private `__` hint). */
  set(name: string, value: unknown, source: string, questionKey?: string) {
    this.args[name] = value;
    this.note(name, value, source, questionKey);
    return value;
  }

  /** Something worth showing in the trace that the tool is not actually sent. */
  note(name: string, value: unknown, source: string, questionKey?: string) {
    this.sources.push({ name, value, source, ...(questionKey ? { questionKey } : {}) });
  }

  /** Send an argument without a trace row of its own. */
  fixed(name: string, value: unknown) {
    this.args[name] = value;
  }

  /** The argument set so far under `name`. */
  get(name: string) {
    return this.args[name];
  }

  /** Whether `name` is set to anything other than undefined. */
  has(name: string) {
    return this.args[name] !== undefined;
  }

  /** Ready to call; pass `args` to send another shape than the flat arguments (`{ tasks: [] }`). */
  ok(args: Record<string, unknown> = this.args): BuildResult {
    return ok(args, this.sources);
  }

  /** Not ready: the user is asked `prompt` for the argument `name`. */
  missing(name: string, prompt: string, args: Record<string, unknown> = this.args): BuildResult {
    return missing(name, prompt, args, this.sources);
  }

  /** Ready unless one required argument never arrived — then ask the user for it. */
  require(name: string, prompt: string): BuildResult {
    return this.has(name) ? this.ok() : this.missing(name, prompt);
  }

  /** Ready unless any of these is absent; all of them are reported as one missing thing. */
  requireAll(names: string[], reportAs: string, prompt: string): BuildResult {
    return names.every((n) => this.has(n)) ? this.ok() : this.missing(reportAs, prompt);
  }
}
