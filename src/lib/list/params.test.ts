import { describe, expect, it } from "vitest";
import {
  DEFAULT_PER_PAGE,
  isFiltered,
  likePattern,
  readListParams,
} from "./params";

const STATUSES = ["DRAFT", "ISSUED", "ACCEPTED"] as const;
const read = (raw: Record<string, string | string[] | undefined>) =>
  readListParams(Promise.resolve(raw), STATUSES);

describe("list parameters", () => {
  it("defaults to the first 25, unfiltered", async () => {
    const params = await read({});
    expect(params.per).toBe(DEFAULT_PER_PAGE);
    expect(params.per).toBe(25);
    expect(params.page).toBe(1);
    expect(params.offset).toBe(0);
    expect(isFiltered(params)).toBe(false);
  });

  it("offsets by whole pages", async () => {
    expect((await read({ page: "3" })).offset).toBe(50);
    expect((await read({ page: "3", per: "50" })).offset).toBe(100);
  });

  it("refuses a page size it does not offer", async () => {
    // Otherwise a hand-typed ?per=100000 is a full table scan on request.
    expect((await read({ per: "100000" })).per).toBe(25);
    expect((await read({ per: "0" })).per).toBe(25);
    expect((await read({ per: "-1" })).per).toBe(25);
    expect((await read({ per: "abc" })).per).toBe(25);
    expect((await read({ per: "50" })).per).toBe(50);
  });

  it("refuses a page that is not a counting number", async () => {
    expect((await read({ page: "0" })).page).toBe(1);
    expect((await read({ page: "-4" })).page).toBe(1);
    expect((await read({ page: "two" })).page).toBe(1);
    expect((await read({ page: "2.7" })).page).toBe(2);
  });

  it("keeps only a status the column actually has", async () => {
    expect((await read({ status: "issued" })).status).toBe("ISSUED");
    expect((await read({ status: "SIGNED" })).status).toBe("");
    expect((await read({ status: "'; drop table quotations" })).status).toBe("");
  });

  it("keeps only the two attachment values", async () => {
    expect((await read({ project: "Attached" })).project).toBe("attached");
    expect((await read({ project: "standalone" })).project).toBe("standalone");
    expect((await read({ project: "maybe" })).project).toBe("");
  });

  it("trims and caps the search term", async () => {
    expect((await read({ q: "  shashikala  " })).q).toBe("shashikala");
    expect((await read({ q: "x".repeat(500) })).q).toHaveLength(80);
  });

  it("reads a repeated parameter once", async () => {
    expect((await read({ page: ["2", "9"] })).page).toBe(2);
  });

  it("counts any of the three as filtered", async () => {
    expect(isFiltered(await read({ q: "das" }))).toBe(true);
    expect(isFiltered(await read({ status: "DRAFT" }))).toBe(true);
    expect(isFiltered(await read({ project: "standalone" }))).toBe(true);
    // Paging through the whole list is not filtering it.
    expect(isFiltered(await read({ page: "4", per: "50" }))).toBe(false);
  });
});

describe("search patterns", () => {
  it("wraps the term in wildcards", () => {
    expect(likePattern("das")).toBe("%das%");
  });

  it("escapes the wildcards a consumer's name might contain", () => {
    // "100%" would otherwise match every row in the table.
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
  });
});
