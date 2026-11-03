import { describe, expect, it } from "vitest";
import { checkEnglish, checkVietnamese, letterHint, meaningParts } from "./answer";

describe("checkEnglish (Việt → Anh)", () => {
  it("đúng: không phân biệt hoa thường, khoảng trắng", () => {
    expect(checkEnglish("  Scale ", ["scale"]).verdict).toBe("correct");
  });
  it("chấp nhận dạng trong câu (surface)", () => {
    expect(checkEnglish("postponed", ["postpone", "postponed"]).verdict).toBe("correct");
  });
  it("sai 1 ký tự ở từ dài = gần đúng, gợi ý Khó", () => {
    const r = checkEnglish("remarkabel", ["remarkable"]);
    expect(r.verdict).toBe("close");
    expect(r.suggested).toBe(1);
  });
  it("từ ngắn phải gõ chính xác", () => {
    expect(checkEnglish("scal", ["scale"]).verdict).toBe("wrong");
  });
  it("dùng gợi ý thì tối đa Khó", () => {
    expect(checkEnglish("scale", ["scale"], true).suggested).toBe(1);
  });
  it("bỏ trống = sai", () => {
    expect(checkEnglish("", ["scale"]).verdict).toBe("wrong");
  });
});

describe("checkVietnamese (Anh → Việt)", () => {
  it("khớp một trong các ý", () => {
    expect(meaningParts("quy mô; tỉ lệ (bản đồ)")).toContain("tỉ lệ");
    expect(checkVietnamese("tỉ lệ", "quy mô; tỉ lệ (bản đồ)").verdict).toBe("correct");
  });
  it("không phân biệt hoa thường, dấu câu", () => {
    expect(checkVietnamese("Hoãn lại!", "hoãn lại").verdict).toBe("correct");
  });
  it("gõ thiếu nhưng đủ ý chính", () => {
    expect(checkVietnamese("hoãn", "hoãn lại").verdict).toBe("correct");
  });
  it("gõ dài hơn nhưng chứa đúng nghĩa", () => {
    expect(checkVietnamese("quy mô lớn", "quy mô").verdict).toBe("correct");
  });
  it("gõ không dấu = gần đúng", () => {
    expect(checkVietnamese("quy mo", "quy mô").verdict).toBe("close");
    expect(checkVietnamese("dang chu y", "đáng chú ý").verdict).toBe("close");
  });
  it("nghĩa khác hẳn = sai", () => {
    expect(checkVietnamese("con cá", "quy mô").verdict).toBe("wrong");
  });
  it("không khớp nhầm một chữ rời trong cụm", () => {
    // "mô" không đủ một nửa cụm "quy mô hoạt động"
    expect(checkVietnamese("mô", "quy mô hoạt động").verdict).toBe("wrong");
  });
  it("thẻ chưa có nghĩa thì không chấm được", () => {
    expect(checkVietnamese("quy mô", undefined).verdict).toBe("wrong");
  });
});

describe("letterHint", () => {
  it("hiện chữ đầu và cuối", () => {
    expect(letterHint("scale")).toBe("s _ _ _ e");
    expect(letterHint("go")).toBe("g _");
  });
});
