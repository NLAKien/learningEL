import { describe, expect, it } from "vitest";
import { pickDefinition, pickPartOfSpeech } from "./pos";

const NV = ["noun", "verb"];

describe("pickPartOfSpeech", () => {
  it.each([
    ["shares", "She shares more about spearheading Project Petal.", NV, "verb"],
    ["share", "He got a fair share of the profits.", NV, "noun"],
    ["share", "Each partner gets an equal share of the profit.", NV, "noun"],
    ["share", "They share an office.", NV, "verb"],
    ["scale", "The aim of this review is to assess the scale of Russia's influence.", NV, "noun"],
    ["assess", "The aim of this review is to assess the scale.", NV, "verb"],
    ["review", "The aim of this review is to assess the scale.", NV, "noun"],
    ["aim", "The aim of this review is clear.", NV, "noun"],
    ["aim", "We aim to finish by Friday.", NV, "verb"],
    ["influence", "Russia's influence in the nuclear sector.", NV, "noun"],
    ["ceased", "Bellona ceased its activities in the country.", ["verb"], "verb"],
    ["associated", "as well as the associated political risks", ["verb", "adjective"], "adjective"],
    ["postponed", "The meeting was postponed until next week.", ["verb", "adjective"], "verb"],
    ["hi", "hi", ["noun", "adjective"], "noun"],
    ["quickly", "She ran quickly to the door.", ["adverb"], "adverb"],
  ])("%s trong câu -> %s", (word, sentence, options, expected) => {
    expect(pickPartOfSpeech(options as string[], word as string, sentence as string)).toBe(expected);
  });
});

describe("pickDefinition", () => {
  const defs = [
    { pos: "noun", text: "A portion of something." },
    { pos: "verb", text: "To give a portion of something to another." },
  ];
  it("lấy định nghĩa đúng từ loại", () => {
    expect(pickDefinition(defs, "verb")).toBe("To give a portion of something to another.");
  });
  it("không khớp thì lấy cái đầu", () => {
    expect(pickDefinition(defs, "adverb")).toBe("A portion of something.");
  });
});
