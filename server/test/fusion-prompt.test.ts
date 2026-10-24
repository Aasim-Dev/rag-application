import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../src/rag/fusion.js";
import { buildPrompt, citedSourceNumbers } from "../src/rag/prompt.js";

describe("reciprocalRankFusion", () => {
  it("ranks items found by both searches above items found by one", () => {
    const vector = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const keyword = [{ id: 3 }, { id: 4 }];
    const fused = reciprocalRankFusion([vector, keyword]);
    expect(fused[0].id).toBe(3);
    expect(fused.map((f) => f.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("uses rank, not raw scores, so lists on different scales can be combined", () => {
    const fused = reciprocalRankFusion([[{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }]]);
    expect(fused[0].fusedScore).toBeCloseTo(fused[1].fusedScore);
  });

  it("handles empty lists", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});

describe("prompt helpers", () => {
  const sources = [
    { id: 10, documentTitle: "JD A", chunkIndex: 0, content: "Laravel and MySQL required." },
    { id: 11, documentTitle: "JD B", chunkIndex: 2, content: "React and Node.js, remote." },
  ];

  it("numbers sources and includes the question", () => {
    const prompt = buildPrompt("Which role is remote?", sources);
    expect(prompt).toContain('[1] (from "JD A", part 1)');
    expect(prompt).toContain('[2] (from "JD B", part 3)');
    expect(prompt.endsWith("Question: Which role is remote?")).toBe(true);
  });

  it("extracts cited source numbers in order, ignoring out-of-range ones", () => {
    expect(citedSourceNumbers("Remote [2]. Laravel [1][2]. Bogus [7].", 2)).toEqual([2, 1]);
    expect(citedSourceNumbers("No citations here.", 2)).toEqual([]);
  });
});
