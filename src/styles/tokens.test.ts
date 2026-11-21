import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The palette is three blocks of the same tokens: light, dark-by-preference
 * and dark-by-choice. Nothing in CSS keeps the two dark blocks in step, and a
 * token that drifts in one of them produces a bug only half the users ever
 * see. These tests are the thing that keeps them honest.
 *
 * The contrast pairs are not every combination that CSS permits — they are the
 * pairings the components actually render, listed by hand. A generated list
 * pairs the two halves of a ternary with each other and drowns in noise.
 */

const css = readFileSync(resolve(__dirname, "./globals.css"), "utf8").replace(/\r\n/g, "\n");

function body(selector: RegExp): string {
  const m = css.match(selector);
  if (!m?.[1]) throw new Error(`palette block not found: ${selector}`);
  return m[1];
}

function tokens(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of src.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    if (name && value) out[name] = value;
  }
  return out;
}

/** Reads a token, failing loudly rather than silently comparing `undefined`. */
function token(palette: Record<string, string>, name: string): string {
  const value = palette[`--${name}`];
  if (!value) throw new Error(`palette has no --${name}`);
  return value;
}

const lightBlock = body(/:root \{\n([\s\S]*?)\n\}/);
const darkPreferred = body(/:root:not\(\[data-theme="light"\]\) \{\n([\s\S]*?)\n  \}\n\}/);
const darkChosen = body(/:root\[data-theme="dark"\] \{\n([\s\S]*?)\n\}/);

const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkChosen) };

/** Every token the light block declares, colour or not — radii and shadows too. */
const declared = new Set(
  [...lightBlock.matchAll(/(--[a-z0-9-]+):/g)].flatMap((m) => (m[1] ? [m[1]] : [])),
);

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r = 0, g = 0, b = 0] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Background token, ink token — as the components pair them. */
const TEXT_PAIRS: Array<[string, string]> = [
  ["surface", "ink"], ["surface", "muted"], ["surface", "muted-soft"],
  ["surface", "navy-text"], ["surface", "link"], ["surface", "red-text"],
  ["surface", "orange-text"], ["surface", "green-text"], ["surface", "gold-text"],
  ["surface-2", "ink"], ["surface-2", "muted"], ["surface-2", "muted-soft"],
  ["surface-2", "navy-text"], ["surface-2", "link"],
  ["surface-sunken", "ink"], ["surface-sunken", "muted"],
  ["bg", "ink"], ["bg", "muted"], ["bg", "link"],
  ["chip-soft", "chip-text"], ["chip-soft", "muted"], ["chip-soft", "muted-soft"],
  ["chip-soft", "navy-text"],
  ["navy-soft", "navy-text"], ["navy-soft", "link"], ["navy", "navy-ink"],
  ["green", "green-ink"], ["green-soft", "green-text"],
  ["amber-soft", "amber-text"], ["amber-surface", "amber-text"],
  ["amber-surface", "amber-body"],
  ["red-soft", "red-text"], ["red-surface", "red-text"],
  ["orange", "orange-ink"], ["orange-hover", "orange-ink"],
  ["orange-soft", "orange-text"], ["orange-ring", "orange-text"],
  ["gold", "gold-ink"], ["gold-soft", "gold-text"],
  ["partner-soft", "partner-text"], ["locked-soft", "locked-text"],
  ["chrome", "chrome-ink"], ["chrome", "chrome-muted"],
  ["chrome-2", "chrome-ink"], ["chrome-2", "chrome-muted"],
  ["chrome", "gold"], ["chrome-2", "gold"],
];

/** The focus ring has to be seen against whatever it lands on. */
const FOCUS_SURFACES = ["surface", "surface-2", "bg"];

describe("palette", () => {
  it("defines the same tokens in both dark blocks", () => {
    const squash = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(squash(darkPreferred)).toBe(squash(darkChosen));
  });

  it("overrides only tokens that the light theme declares", () => {
    for (const name of Object.keys(tokens(darkChosen))) {
      expect(light, `dark declares ${name}, light does not`).toHaveProperty(name);
    }
  });

  for (const [theme, palette] of [["light", light], ["dark", dark]] as const) {
    it(`clears 4.5:1 on every text pair — ${theme}`, () => {
      const failures: string[] = [];
      for (const [bg, ink] of TEXT_PAIRS) {
        const ratio = contrast(token(palette, bg), token(palette, ink));
        if (ratio < 4.5) failures.push(`--${ink} on --${bg} is ${ratio.toFixed(2)}:1`);
      }
      expect(failures).toEqual([]);
    });

    it(`keeps the focus ring at 3:1 — ${theme}`, () => {
      for (const surface of FOCUS_SURFACES) {
        const ratio = contrast(token(palette, surface), token(palette, "focus"));
        expect(ratio, `--focus on --${surface}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
  it("defines every token the components reference", () => {
    const root = resolve(__dirname, "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = resolve(dir, e.name);
        if (e.isDirectory()) return walk(path);
        return e.name.endsWith(".tsx") || e.name.endsWith(".ts") ? [path] : [];
      });

    const missing = new Set<string>();
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      for (const [, name] of src.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
        if (name && !declared.has(name)) {
          missing.add(`${name} in ${file.slice(root.length + 1)}`);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
