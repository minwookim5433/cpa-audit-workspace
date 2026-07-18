/**
 * Validate upsert payload field names match workspaces schema
 */
import { packWorkspaceRow } from "../workspace-cloud-model.js";

const snapshot = {
  answerSheet: ["<p>test</p>"],
  answerSheetPage: 0,
  timerSeconds: 0,
  drawAnnotations: [],
};

const packed = packWorkspaceRow(snapshot, {
  documentKey: "abc123deadbeef",
  documentName: "테스트 시험지",
  legacyFingerprint: "sample.pdf|100|1",
});

const required = ["document_key", "document_name", "answer_data", "workspace_state", "annotation_data"];
const payload = {
  user_id: "00000000-0000-4000-8000-000000000001",
  ...packed,
};

let failed = 0;
for (const key of required) {
  if (!(key in payload)) {
    console.error("FAIL: missing payload field", key);
    failed += 1;
  } else {
    console.log("PASS: payload includes", key);
  }
}

if (failed) process.exitCode = 1;
else console.log("\nPayload shape matches workspaces columns.");
