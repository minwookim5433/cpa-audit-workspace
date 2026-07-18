/**
 * Unit tests for cloud workspace pack/unpack (no Supabase network)
 */
import { packWorkspaceRow, unpackWorkspaceRow } from "../workspace-cloud-model.js";

const sampleSnapshot = {
  answerSheet: ["<p>답안1</p>", "<p>답안2</p>"],
  answerSheetPage: 1,
  timerSeconds: 120,
  timerDurationSeconds: 7200,
  timerRemainingSeconds: 7080,
  bookmarks: [{ page: 2, label: "중요" }],
  drawAnnotations: [{ id: "a1", surface: "exam", page: 1, type: "pen", points: [[0, 0], [1, 1]] }],
  answerFontSize: 11,
  answerLetterSpacing: 0.2,
  currentPage: 3,
  pageViews: { 3: { scale: 1.2, scrollLeft: 10, scrollTop: 20 } },
  memo: "메모",
  tags: ["복습"],
  status: "draft",
  caretOffset: 5,
  circledNumberSession: { next: 2, used: [1] },
  searchQuery: "감사",
};

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log("PASS:", message);
}

const packed = packWorkspaceRow(sampleSnapshot, {
  documentKey: "abc123",
  documentName: "2024 기출",
  legacyFingerprint: "file.pdf|100|1",
});

assert(packed.document_key === "abc123", "document_key preserved");
assert(packed.answer_data.answerSheet.length === 2, "answerSheet in answer_data");
assert(packed.workspace_state.timerRemainingSeconds === 7080, "timer in workspace_state");
assert(packed.annotation_data.drawAnnotations.length === 1, "annotations separated");

const restored = unpackWorkspaceRow({
  document_name: "2024 기출",
  updated_at: "2026-07-18T07:00:00.000Z",
  ...packed,
});

assert(restored.answerSheet[0] === "<p>답안1</p>", "answerSheet restored");
assert(restored.drawAnnotations[0].id === "a1", "annotations restored");
assert(restored.circledNumberSession.next === 2, "circledNumberSession restored");
assert(restored.documentName === "2024 기출", "documentName restored");

console.log("\nAll pack/unpack tests passed.");
