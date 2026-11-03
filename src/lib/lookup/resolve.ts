/** Từ kết quả tra từ điển (nhiều từ loại) -> từ loại + định nghĩa hợp với câu gốc. */
import { parsePosList, pickDefinition, pickPartOfSpeech } from "../nlp/pos";
import type { LookupResult } from "../types";

export function resolveWordInfo(
  lookup: LookupResult | undefined,
  surface: string,
  context: string,
): { partOfSpeech?: string; definitionEn?: string } {
  if (!lookup) return {};
  const options = parsePosList(lookup.partOfSpeech);
  const partOfSpeech = lookup.source === "ai" ? options[0] : pickPartOfSpeech(options, surface, context);
  return {
    partOfSpeech,
    definitionEn: pickDefinition(lookup.definitions, partOfSpeech) ?? lookup.definitionEn,
  };
}
