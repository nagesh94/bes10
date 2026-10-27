import { describe, expect, it } from "vitest";
import { isUploadKind, projectIdFromTempKey, uploadHref } from "./file-url";

/**
 * `projectIdFromTempKey` is the gate on `PUT /api/uploads`, so these are
 * security tests rather than parsing tests.
 *
 * The route writes wherever the caller's key says, under whatever permission
 * the project in that key implies. Two things therefore have to hold: a key
 * that is not exactly the shape both server actions mint is refused outright,
 * and the project the key yields is the project the bytes land under — so the
 * permission checked is the permission that matters.
 */

const uuid = "3c74f6d9-05d7-4eab-8734-b4e929d2d89f";
const project = "prj_2bc85f3150414674bc31";
const good = `incoming/${project}/${uuid}-rooftop.jpg`;

describe("temp upload keys", () => {
  it("reads the project out of a key the actions minted", () => {
    expect(projectIdFromTempKey(good)).toBe(project);
  });

  it("refuses anything outside incoming/", () => {
    // The documents bucket holds finalised files; a browser may never name one.
    expect(projectIdFromTempKey(`documents/${project}/${uuid}-x.jpg`)).toBeNull();
    expect(projectIdFromTempKey(`${project}/${uuid}-x.jpg`)).toBeNull();
    expect(projectIdFromTempKey(`/incoming/${project}/${uuid}-x.jpg`)).toBeNull();
  });

  it("refuses traversal and extra path segments", () => {
    expect(projectIdFromTempKey("../../etc/passwd")).toBeNull();
    expect(projectIdFromTempKey(`incoming/../${project}/${uuid}-x.jpg`)).toBeNull();
    expect(projectIdFromTempKey(`incoming/${project}/nested/${uuid}-x.jpg`)).toBeNull();
    // A slash inside the filename would be a new segment, not a name.
    expect(projectIdFromTempKey(`incoming/${project}/${uuid}-a/b.jpg`)).toBeNull();
  });

  it("requires the uuid the actions put there", () => {
    // Without it a caller could name — and so overwrite — a key it guessed.
    expect(projectIdFromTempKey(`incoming/${project}/rooftop.jpg`)).toBeNull();
    expect(projectIdFromTempKey(`incoming/${project}/short-rooftop.jpg`)).toBeNull();
  });

  it("refuses an empty project or filename", () => {
    expect(projectIdFromTempKey(`incoming//${uuid}-x.jpg`)).toBeNull();
    expect(projectIdFromTempKey(`incoming/${project}/${uuid}-`)).toBeNull();
  });

  it("holds the filename to the 80 characters the actions allow", () => {
    const ok = "a".repeat(80);
    const over = "a".repeat(81);
    expect(projectIdFromTempKey(`incoming/${project}/${uuid}-${ok}`)).toBe(project);
    expect(projectIdFromTempKey(`incoming/${project}/${uuid}-${over}`)).toBeNull();
  });
});

describe("upload URLs", () => {
  it("points at this app, never at the bucket", () => {
    const href = uploadHref("photo", good);
    expect(href.startsWith("/api/uploads?")).toBe(true);
    expect(href).not.toContain("neon.tech");
    expect(href).not.toContain("X-Amz");
  });

  it("round-trips the key through the query string", () => {
    const params = new URL(uploadHref("document", good), "https://x.test").searchParams;
    expect(params.get("kind")).toBe("document");
    expect(params.get("key")).toBe(good);
  });

  it("admits only the two kinds a browser can send", () => {
    expect(isUploadKind("document")).toBe(true);
    expect(isUploadKind("photo")).toBe(true);
    // Quotations and agreements are generated server-side, never uploaded.
    expect(isUploadKind("quotation")).toBe(false);
    expect(isUploadKind("agreement")).toBe(false);
    expect(isUploadKind("")).toBe(false);
  });
});
