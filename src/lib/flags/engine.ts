/**
 * The flag engine.
 *
 * Flags are derived from the form data rather than raised by hand, and they
 * block stage 1 from closing until they are resolved or an admin waives them
 * with a written reason.
 *
 * Pure functions, no database. Every rule below is covered by a table-driven
 * test, because both rules have edge cases that are quiet when wrong: a name
 * comparison that is too strict floods the team with false flags, and one
 * that is too loose lets a mismatched bill reach the DISCOM.
 */

export type FlagType = "NAME_MISMATCH" | "LOAD_ENHANCEMENT";

/* ────────────────────────────────────────────────────────────────────────
   Name matching
   ──────────────────────────────────────────────────────────────────────── */

export type NameSource = "AADHAAR" | "PAN" | "BILL" | "BANK";

const HONORIFICS = [
  "SHRI", "SHREE", "SH", "SHRIMATI", "SHMT", "SMT", "KUM", "KUMARI",
  "MR", "MRS", "MS", "MISS", "DR", "PROF",
];

/**
 * "M/s" (Messrs) has to go before the punctuation strip, otherwise the slash
 * splits it into "M" and "S" and it never matches the honorific list.
 */
const MESSRS = /\bM\s*\/\s*S\.?(?=\s|$)/g;

/**
 * Case, punctuation, honorifics and extra whitespace all removed, so that
 * "Shri  Rajesh Kumar." and "RAJESH KUMAR" are the same string.
 */
export function normaliseName(raw: string): string {
  const upper = raw.toUpperCase();
  const depunctuated = upper.replace(MESSRS, " ").replace(/[.,'`\-_/\\]/g, " ");
  const tokens = depunctuated
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.includes(t));
  return tokens.join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** 0 to 1, where 1 is identical. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Whether one name is the other written with initials.
 * "R C SINGH" against "RAMESH CHAUHAN SINGH" is the same person.
 */
function initialsMatch(a: string, b: string): boolean {
  const at = a.split(" ").filter(Boolean);
  const bt = b.split(" ").filter(Boolean);
  if (at.length !== bt.length || at.length === 0) return false;

  let anyAbbreviated = false;
  for (let i = 0; i < at.length; i++) {
    const x = at[i]!;
    const y = bt[i]!;
    if (x === y) continue;
    if (x.length === 1 && y.startsWith(x)) {
      anyAbbreviated = true;
      continue;
    }
    if (y.length === 1 && x.startsWith(y)) {
      anyAbbreviated = true;
      continue;
    }
    return false;
  }
  return anyAbbreviated;
}

export type NameVerdict = "match" | "near" | "mismatch";

/** Above this, two different spellings are treated as the same person. */
const NEAR_THRESHOLD = 0.86;

export function compareName(a: string, b: string): { verdict: NameVerdict; score: number } {
  const na = normaliseName(a);
  const nb = normaliseName(b);

  if (na === nb) return { verdict: "match", score: 1 };
  if (initialsMatch(na, nb)) return { verdict: "match", score: 1 };

  const score = similarity(na, nb);
  // A near match is surfaced to the employee for a judgement call rather than
  // auto-resolved. "RAJESH KUMAR" against "RAJESH KUMMAR" is a typo; against
  // "SURESH KUMAR" it is a different person.
  if (score >= NEAR_THRESHOLD) return { verdict: "near", score };
  return { verdict: "mismatch", score };
}

export interface NameEntry {
  source: NameSource;
  name: string;
}

export interface NameMismatchResult {
  raised: boolean;
  /** The name the others are compared against. Aadhaar is authoritative. */
  reference: NameEntry | null;
  entries: Array<NameEntry & { verdict: NameVerdict; score: number }>;
  mismatchedSources: NameSource[];
  /** True when every difference is only a near match, so a human should look. */
  needsReview: boolean;
}

const PRIORITY: NameSource[] = ["AADHAAR", "PAN", "BANK", "BILL"];

export function checkNameMismatch(entries: NameEntry[]): NameMismatchResult {
  const present = entries.filter((e) => e.name && e.name.trim().length > 0);
  if (present.length < 2) {
    return { raised: false, reference: null, entries: [], mismatchedSources: [], needsReview: false };
  }

  const reference =
    PRIORITY.map((s) => present.find((e) => e.source === s)).find(Boolean) ?? present[0]!;

  const compared = present.map((e) => {
    if (e.source === reference.source) {
      return { ...e, verdict: "match" as NameVerdict, score: 1 };
    }
    const { verdict, score } = compareName(reference.name, e.name);
    return { ...e, verdict, score };
  });

  const mismatchedSources = compared.filter((c) => c.verdict === "mismatch").map((c) => c.source);
  const nearSources = compared.filter((c) => c.verdict === "near");

  return {
    raised: mismatchedSources.length > 0,
    reference,
    entries: compared,
    mismatchedSources,
    needsReview: mismatchedSources.length === 0 && nearSources.length > 0,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Load enhancement
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The DISCOM rule, as stated by BHIM: the sanctioned load must be GREATER
 * than the plant capacity — a 3 kW plant on a 2 kW connection needs
 * enhancing to 4 kW, not 3 kW.
 *
 * Kept configurable because this is DISCOM policy and some zones accept
 * "at least". Change the default here, not at the call sites.
 */
export type LoadRule = "greaterThan" | "atLeast";

export const DEFAULT_LOAD_RULE: LoadRule = "greaterThan";

export function requiredSanctionedKw(plantKw: number, rule: LoadRule = DEFAULT_LOAD_RULE): number {
  const ceiling = Math.ceil(plantKw);
  if (rule === "atLeast") return ceiling;
  // Strictly greater: a whole-number plant needs the next whole kW.
  return ceiling > plantKw ? ceiling : ceiling + 1;
}

export interface LoadEnhancementResult {
  raised: boolean;
  sanctionedKw: number;
  plantKw: number;
  requiredKw: number;
}

export function checkLoadEnhancement(
  plantKw: number,
  sanctionedKw: number,
  rule: LoadRule = DEFAULT_LOAD_RULE,
): LoadEnhancementResult {
  const requiredKw = requiredSanctionedKw(plantKw, rule);
  return {
    raised: sanctionedKw < requiredKw,
    sanctionedKw,
    plantKw,
    requiredKw,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Both rules together
   ──────────────────────────────────────────────────────────────────────── */

export interface FlagInput {
  names: NameEntry[];
  plantKw: number | null;
  sanctionedKw: number | null;
  loadRule?: LoadRule;
}

export interface DerivedFlag {
  type: FlagType;
  detail: NameMismatchResult | LoadEnhancementResult;
}

export function deriveFlags(input: FlagInput): DerivedFlag[] {
  const flags: DerivedFlag[] = [];

  const nameResult = checkNameMismatch(input.names);
  if (nameResult.raised) {
    flags.push({ type: "NAME_MISMATCH", detail: nameResult });
  }

  if (input.plantKw !== null && input.sanctionedKw !== null) {
    const loadResult = checkLoadEnhancement(input.plantKw, input.sanctionedKw, input.loadRule);
    if (loadResult.raised) {
      flags.push({ type: "LOAD_ENHANCEMENT", detail: loadResult });
    }
  }

  return flags;
}
