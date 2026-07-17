/**
 * 검색용 태그 추천 — 규칙 기반 (GPT 미사용)
 */
export const SEARCH_TAG_CATALOG = [
  { tag: "독립성", keywords: ["독립성", "직무", "윤리", "감사인", "금지", "제한"] },
  { tag: "계속기업", keywords: ["계속기업", "going concern", "청산", "12개월"] },
  { tag: "내부통제", keywords: ["내부통제", "통제환경", "통제활동", "ITGC", "ELC"] },
  { tag: "감사증거", keywords: ["감사증거", "증거", "입증", "충분", "적합"] },
  { tag: "수익인식", keywords: ["수익", "인식", "매출", "performance obligation", "수익인식"] },
  { tag: "품질관리", keywords: ["품질", "QM", "품질관리", "감리", "EQCR"] },
  { tag: "위험평가", keywords: ["위험", "중요왜곡", "RMM", "감사위험", "위험평가"] },
  { tag: "회계추정치", keywords: ["추정", "회계추정", "가정", "민감"] },
  { tag: "특수관계자", keywords: ["특수관계", "관련당사자", "연결", "종속"] },
  { tag: "부정위험", keywords: ["부정", "횡령", "fraud", "부정위험"] },
  { tag: "조회", keywords: ["조회", "inquiry", "확인", "interview"] },
  { tag: "재고실사", keywords: ["재고", "실사", "count", "재고실사"] },
  { tag: "감사절차", keywords: ["절차", "실증", "분석", "관찰"] },
  { tag: "중요성", keywords: ["중요성", "materiality", "PM", "CT"] },
];

/**
 * @param {string} text - 메모·제목·설명 등
 * @param {string[]} existingTags
 * @returns {string[]} 새로 추천할 태그 (기존에 없는 것만)
 */
export function suggestSearchTags(text, existingTags = []) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack.trim()) return [];

  const have = new Set(existingTags.map((t) => String(t).trim()));
  const scores = [];

  for (const entry of SEARCH_TAG_CATALOG) {
    if (have.has(entry.tag)) continue;
    let score = 0;
    for (const kw of entry.keywords) {
      if (haystack.includes(kw.toLowerCase())) score += 1;
    }
    if (score > 0) scores.push({ tag: entry.tag, score });
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.tag);
}
