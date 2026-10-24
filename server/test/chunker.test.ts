import { describe, expect, it } from "vitest";
import { chunkText, tail } from "../src/rag/chunker.js";

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as one chunk", () => {
    const chunks = chunkText("We are hiring a Laravel developer.\n\nRemote friendly.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("Remote friendly.");
  });

  it("splits long text into chunks no larger than size + overlap", () => {
    const para = "Laravel queues process jobs in the background. ".repeat(20);
    const text = Array.from({ length: 10 }, () => para).join("\n\n");
    const chunks = chunkText(text, { size: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(600);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("overlaps consecutive chunks so boundary facts are not lost", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Fact number ${i} is important.`).join(" ");
    const chunks = chunkText(sentences, { size: 300, overlap: 80 });
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].content.slice(-40).trim().split(" ").slice(-3).join(" ");
      expect(chunks[i].content).toContain(prevEnd);
    }
  });

  it("hard-splits a single enormous sentence", () => {
    const chunks = chunkText("x".repeat(5000), { size: 1000, overlap: 100 });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
  });

  it("rejects overlap >= size", () => {
    expect(() => chunkText("abc", { size: 100, overlap: 100 })).toThrow();
  });
});

describe("tail", () => {
  it("never cuts a word in half", () => {
    expect(tail("the quick brown fox jumps", 12)).toBe("fox jumps");
  });
  it("returns the whole text when it is shorter than n", () => {
    expect(tail("short", 50)).toBe("short");
  });
});
