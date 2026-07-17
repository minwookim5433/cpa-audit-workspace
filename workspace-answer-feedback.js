/**
 * 시험 종료 후 전체 답안 작성 피드백
 */
import { normalizeAnswerPages } from "./workspace-answer-editor.js";
import {
  hasMeaningfulAnswerContent,
  plainTextFromHtml,
  stripFormatSpansFromHtml,
} from "./workspace-answer-format.js";

export const ANSWER_FEEDBACK_SYSTEM_PROMPT = `당신은 회계감사 시험 답안의 표현과 가독성을 점검하는 간결한 답안 코치입니다.

문제 원문, 모범답안, 채점 기준을 완전히 알지 못하므로
답안의 정답 여부, 점수, 전문적 타당성을 판단해서는 안 됩니다.

당연한 형식 준수는 칭찬하거나 피드백하지 마세요.
예: "아니오, ~하기 때문이다." 형식 자체, 번호 사용, 물음 구분, 줄바꿈·문단 사용은
요구사항이 명시적으로 요구하지 않는 한 피드백 대상이 아닙니다.
형식이 실제로 잘못되었을 때만 지적하세요.

사용자가 실제로 고칠 수 있는 부분만 찾으세요.
각 항목에는 반드시 원문, 구체적인 수정안 또는 삭제 조치, 짧은 이유가 포함되어야 합니다.

"모호하다", "명확하게 작성하라", "전문적으로 수정하라"처럼
구체적인 수정안이 없는 피드백은 출력하지 마세요.

"모르겠다", "ㅋㅋ" 등 시험 답안과 무관하거나 부적절한 표현은
장황하게 해설하지 말고 type "delete"로 간결히 안내하세요.

사용자의 답안에 없는 전문 내용을 새로 추가하지 마세요.
정답이나 새로운 감사 지식, 기준서 근거를 만들어내지 마세요.
수정 예시는 사용자가 작성한 내용의 범위 안에서만 고치세요.

우선 검토 순서:
1. 요구사항과 무관하거나 시험 답안으로 부적절한 내용
2. 주어·목적어·대상이 빠져 의미가 불분명한 문장
3. 결론과 이유가 문장상 서로 모순되는 경우
4. 한 문장에 여러 행위가 뒤섞여 분리가 필요한 경우
5. 같은 말의 불필요한 반복
6. 구어적이거나 지나치게 축약된 표현
7. 맞춤법·띄어쓰기

최대 5개 항목만 출력하세요. 같은 문제 유형은 하나로 묶고, 같은 단어 중복 출력 금지.
수정할 내용이 없으면 items를 빈 배열로 반환하세요. 억지로 피드백을 생성하지 마세요.

JSON 형식으로만 응답하세요:
{
  "items": [
    {
      "location": { "page": 1, "question": "물음2", "item": "③" },
      "type": "replace",
      "original": "업무에서 제외한다.",
      "suggestion": "해당 공인회계사를 감사업무에서 제외한다.",
      "reason": "적용 대상과 범위가 명확해집니다."
    },
    {
      "location": { "page": 2, "question": "물음6", "item": "④" },
      "type": "delete",
      "original": "이유를 모르겠어 ㅋㅋ",
      "suggestion": "",
      "reason": "요구사항과 관련이 없거나 시험 답안으로 적절하지 않은 내용입니다."
    }
  ],
  "repeatedHabits": [
    {
      "label": "목적어 생략",
      "count": 2,
      "advice": "행위의 대상과 적용 범위를 함께 작성하세요."
    }
  ]
}

type 허용값: replace, delete, split, clarify
repeatedHabits는 실제 반복된 습관만 포함하세요.`;

const VALID_TYPES = new Set(["replace", "delete", "split", "clarify"]);

export function buildFullAnswerPlainText(answerSheet) {
  const pages = normalizeAnswerPages(answerSheet);
  const blocks = [];

  pages.forEach((pageHtml, index) => {
    const html = stripFormatSpansFromHtml(String(pageHtml ?? ""));
    if (!hasMeaningfulAnswerContent(html)) return;
    const text = plainTextFromHtml(html).trim();
    if (!text) return;
    blocks.push(`[답안지 ${index + 1}페이지]\n${text}`);
  });

  return blocks.join("\n\n");
}

export function countWrittenAnswerPages(answerSheet) {
  return normalizeAnswerPages(answerSheet).filter((page) =>
    hasMeaningfulAnswerContent(stripFormatSpansFromHtml(String(page ?? "")))
  ).length;
}

export async function requestFullAnswerFeedback({ answerText, docTitle, forceFail } = {}) {
  const text = String(answerText || "").trim();
  if (!text) throw new Error("피드백할 답안 내용이 없습니다.");

  const apiUrl = "/api/answer-feedback";
  let res;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        answerText: text,
        docTitle: docTitle || "",
        forceFail: Boolean(forceFail),
      }),
    });
  } catch {
    const err = new Error("작성 피드백 서버에 연결하지 못했습니다.");
    err.code = "FEEDBACK_NETWORK";
    throw err;
  }

  const rawText = await res.text();
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    if (contentType.includes("application/json")) {
      try {
        const errData = JSON.parse(rawText);
        throw new Error(errData.error || `피드백 요청 실패 (${res.status})`);
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
      }
    }
    if (rawText.trim().startsWith("<")) {
      const err = new Error("작성 피드백 서버에 연결하지 못했습니다.");
      err.code = "FEEDBACK_HTML";
      err.httpStatus = res.status;
      err.contentType = contentType;
      throw err;
    }
    throw new Error(`피드백 요청 실패 (${res.status})`);
  }

  if (!contentType.includes("application/json")) {
    if (rawText.trim().startsWith("<")) {
      const err = new Error("작성 피드백 서버에 연결하지 못했습니다.");
      err.code = "FEEDBACK_HTML";
      err.httpStatus = res.status;
      err.contentType = contentType;
      throw err;
    }
    throw new Error("피드백 서버가 올바른 응답을 반환하지 않았습니다.");
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("피드백 응답을 해석하지 못했습니다.");
  }

  return data.feedback;
}

export function parseFeedbackFetchError(err) {
  if (err?.code === "FEEDBACK_HTML" || err?.code === "FEEDBACK_NETWORK") {
    return "작성 피드백 서버에 연결하지 못했습니다.";
  }
  const msg = String(err?.message || "");
  if (msg.includes("Unexpected token") || msg.trim().startsWith("<")) {
    return "작성 피드백 서버에 연결하지 못했습니다.";
  }
  return msg || "피드백 요청 실패";
}

function normalizeLocation(loc) {
  if (!loc || typeof loc !== "object") return { page: null, question: "", item: "" };
  return {
    page: Number.isFinite(Number(loc.page)) ? Number(loc.page) : null,
    question: String(loc.question || "").trim(),
    item: String(loc.item || "").trim(),
  };
}

function formatLocationLabel(loc) {
  const parts = [];
  if (loc.page) parts.push(`답안지 ${loc.page}페이지`);
  if (loc.question) parts.push(loc.question);
  if (loc.item) parts.push(loc.item);
  return parts.join(", ") || "위치 미지정";
}

export function normalizeFeedbackPayload(raw) {
  if (!raw || typeof raw !== "object") return emptyFeedback();

  const items = Array.isArray(raw.items)
    ? raw.items
        .slice(0, 5)
        .map((item) => {
          const type = VALID_TYPES.has(item?.type) ? item.type : "replace";
          const original = String(item?.original || "").trim();
          const suggestion = String(item?.suggestion || "").trim();
          const reason = String(item?.reason || "").trim();
          if (!original && type !== "clarify") return null;
          if (type === "replace" && !suggestion) return null;
          return {
            location: normalizeLocation(item?.location),
            type,
            original,
            suggestion,
            reason,
          };
        })
        .filter(Boolean)
    : [];

  const repeatedHabits = Array.isArray(raw.repeatedHabits)
    ? raw.repeatedHabits
        .map((h) => {
          if (typeof h === "string") {
            const label = h.trim();
            return label ? { label, count: 1, advice: "" } : null;
          }
          const label = String(h?.label || "").trim();
          if (!label) return null;
          return {
            label,
            count: Number.isFinite(Number(h?.count)) ? Number(h.count) : 1,
            advice: String(h?.advice || "").trim(),
          };
        })
        .filter(Boolean)
    : [];

  return { items, repeatedHabits };
}

export function emptyFeedback() {
  return { items: [], repeatedHabits: [] };
}

function itemActionLabel(type) {
  switch (type) {
    case "delete":
      return "삭제 권장";
    case "split":
      return "나누기 권장";
    case "clarify":
      return "구체화할 대상";
    default:
      return "수정 제안";
  }
}

export function formatFeedbackForDisplay(feedback) {
  const fb = normalizeFeedbackPayload(feedback);
  if (!fb.items.length && !fb.repeatedHabits.length) {
    return "수정할 항목이 없습니다.";
  }

  const parts = [];
  fb.items.forEach((item, index) => {
    parts.push(`${index + 1}. 위치`);
    parts.push(formatLocationLabel(item.location));
    parts.push(`\n현재 표현`);
    parts.push(`"${item.original}"`);
    if (item.type === "delete") {
      parts.push(`\n판정`);
      parts.push(item.reason || "요구사항과 관련이 없거나 시험 답안으로 적절하지 않은 내용입니다.");
      parts.push(`\n조치`);
      parts.push("삭제하는 것이 좋습니다.");
    } else if (item.type === "split") {
      parts.push(`\n나누기 권장 위치`);
      parts.push(item.suggestion || "(위치 미지정)");
      if (item.reason) {
        parts.push(`\n이유`);
        parts.push(item.reason);
      }
    } else if (item.type === "clarify") {
      parts.push(`\n구체화할 대상`);
      parts.push(item.suggestion || "(대상 미지정)");
      if (item.reason) {
        parts.push(`\n이유`);
        parts.push(item.reason);
      }
    } else {
      parts.push(`\n수정 제안`);
      parts.push(`"${item.suggestion}"`);
      if (item.reason) {
        parts.push(`\n이유`);
        parts.push(item.reason);
      }
    }
    parts.push("\n---");
  });

  if (fb.repeatedHabits.length) {
    parts.push("\n[반복 습관]");
    fb.repeatedHabits.forEach((h) => {
      const count = h.count > 1 ? ` (${h.count}회)` : "";
      parts.push(`- ${h.label}${count}${h.advice ? `: ${h.advice}` : ""}`);
    });
  }

  return parts.join("\n").replace(/\n---\n$/, "");
}

export function formatFeedbackAsHtml(feedback) {
  const fb = normalizeFeedbackPayload(feedback);
  if (!fb.items.length && !fb.repeatedHabits.length) {
    return `<p class="ws-result-feedback-empty">수정할 항목이 없습니다.</p>`;
  }

  const blocks = fb.items.map((item, index) => {
    const loc = formatLocationLabel(item.location);
    let body = `
      <div class="ws-feedback-item-head">${index + 1}. 위치 — ${escapeHtml(loc)}</div>
      <div class="ws-feedback-quote">"${escapeHtml(item.original)}"</div>
    `;

    if (item.type === "delete") {
      body += `
        <div class="ws-feedback-action">삭제 권장</div>
        <div class="ws-feedback-reason">${escapeHtml(item.reason || "요구사항과 관련이 없거나 시험 답안으로 적절하지 않은 내용입니다.")}</div>
      `;
    } else if (item.type === "split") {
      body += `
        <div class="ws-feedback-action">나누기 권장 위치</div>
        <div class="ws-feedback-quote">${escapeHtml(item.suggestion || "(위치 미지정)")}</div>
        ${item.reason ? `<div class="ws-feedback-reason">${escapeHtml(item.reason)}</div>` : ""}
      `;
    } else if (item.type === "clarify") {
      body += `
        <div class="ws-feedback-action">구체화할 대상</div>
        <div class="ws-feedback-quote">${escapeHtml(item.suggestion || "(대상 미지정)")}</div>
        ${item.reason ? `<div class="ws-feedback-reason">${escapeHtml(item.reason)}</div>` : ""}
      `;
    } else {
      body += `
        <div class="ws-feedback-action">수정 제안</div>
        <div class="ws-feedback-quote">"${escapeHtml(item.suggestion)}"</div>
        ${item.reason ? `<div class="ws-feedback-reason">${escapeHtml(item.reason)}</div>` : ""}
      `;
    }

    return `<article class="ws-feedback-item">${body}</article>`;
  });

  let habits = "";
  if (fb.repeatedHabits.length) {
    const list = fb.repeatedHabits
      .map((h) => {
        const count = h.count > 1 ? ` (${h.count}회)` : "";
        const advice = h.advice ? `: ${escapeHtml(h.advice)}` : "";
        return `<li><strong>${escapeHtml(h.label)}</strong>${count}${advice}</li>`;
      })
      .join("");
    habits = `<div class="ws-feedback-habits"><h4>반복 습관</h4><ul>${list}</ul></div>`;
  }

  return `<div class="ws-feedback-list">${blocks.join("")}${habits}</div>`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function feedbackContainsGradingLanguage(feedback) {
  const text = JSON.stringify(feedback || {}).toLowerCase();
  const banned = [
    "정답",
    "오답",
    "점수",
    "합격",
    "불합격",
    "채점",
    "모범답안",
    "키워드 누락",
    "등급",
  ];
  return banned.some((word) => text.includes(word));
}

export function feedbackIsAbstractOnly(item) {
  if (!item) return true;
  const vague = ["모호", "명확하게", "전문적으로", "결론을 먼저"];
  const text = `${item.reason || ""} ${item.suggestion || ""}`;
  const hasConcrete = item.type === "delete" || Boolean(item.suggestion?.trim());
  return !hasConcrete && vague.some((v) => text.includes(v));
}
