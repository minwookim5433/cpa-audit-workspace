/**
 * Cloud workspace row shape — pack/unpack only (no Supabase client)
 */

export function packWorkspaceRow(snapshot, { documentKey, documentName, legacyFingerprint } = {}) {
  if (!snapshot || !documentKey) {
    throw new Error("PACK_SNAPSHOT_INVALID");
  }

  return {
    document_key: documentKey,
    document_name: documentName || null,
    answer_data: {
      answerSheet: snapshot.answerSheet || [],
      answerSheetPage: snapshot.answerSheetPage ?? 0,
      caretOffset: snapshot.caretOffset ?? 0,
      circledNumberSession: snapshot.circledNumberSession ?? null,
    },
    workspace_state: {
      timerSeconds: snapshot.timerSeconds ?? 0,
      timerDurationSeconds: snapshot.timerDurationSeconds,
      timerRemainingSeconds: snapshot.timerRemainingSeconds,
      answerFontSize: snapshot.answerFontSize,
      answerLetterSpacing: snapshot.answerLetterSpacing,
      currentPage: snapshot.currentPage ?? 1,
      pageViews: snapshot.pageViews || {},
      bookmarks: snapshot.bookmarks || [],
      memo: snapshot.memo || "",
      tags: snapshot.tags || [],
      status: snapshot.status || "draft",
      searchQuery: snapshot.searchQuery || "",
      legacyFingerprint: legacyFingerprint || null,
    },
    annotation_data: {
      drawAnnotations: snapshot.drawAnnotations || [],
    },
  };
}

export function unpackWorkspaceRow(row) {
  if (!row) return null;

  const answerData = row.answer_data || {};
  const workspaceState = row.workspace_state || {};
  const annotationData = row.annotation_data || {};

  return {
    answerSheet: answerData.answerSheet || [],
    answerSheetPage: answerData.answerSheetPage ?? 0,
    caretOffset: answerData.caretOffset ?? 0,
    circledNumberSession: answerData.circledNumberSession ?? null,
    timerSeconds: workspaceState.timerSeconds ?? 0,
    timerDurationSeconds: workspaceState.timerDurationSeconds,
    timerRemainingSeconds: workspaceState.timerRemainingSeconds,
    answerFontSize: workspaceState.answerFontSize,
    answerLetterSpacing: workspaceState.answerLetterSpacing,
    currentPage: workspaceState.currentPage ?? 1,
    pageViews: workspaceState.pageViews || {},
    bookmarks: workspaceState.bookmarks || [],
    memo: workspaceState.memo || "",
    tags: workspaceState.tags || [],
    status: workspaceState.status || "draft",
    searchQuery: workspaceState.searchQuery || "",
    drawAnnotations: annotationData.drawAnnotations || [],
    documentName: row.document_name || "",
    updatedAt: row.updated_at || null,
    legacyFingerprint: workspaceState.legacyFingerprint || null,
  };
}

export function mapCloudSaveError(err) {
  const code = String(err?.code || "");
  const message = String(err?.message || err || "").toLowerCase();

  if (code === "NOT_AUTHENTICATED" || code === "AUTH_USER_LOOKUP_FAILED") {
    return "로그인이 필요합니다. 다시 로그인해주세요.";
  }
  if (code === "AUTH_SESSION_MISSING" || code === "AUTH_SESSION_REFRESH_FAILED") {
    return "로그인 세션이 만료되었습니다. 다시 로그인해주세요.";
  }
  if (code === "MISSING_DOCUMENT_KEY" || code === "SAVE_CONTEXT_MISSING") {
    return "시험지 정보를 확인할 수 없습니다. PDF를 다시 선택한 뒤 저장해주세요.";
  }
  if (code === "42501") {
    return "저장 권한이 없습니다. 다시 로그인해주세요.";
  }
  if (code === "42P10") {
    return "저장 설정 오류(unique 제약)입니다. Supabase schema.sql을 확인해주세요.";
  }
  if (code === "UPSERT_NO_ROWS_RETURNED" || code === "PGRST116") {
    return "저장에 실패했습니다. (서버 응답 없음)";
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("failed to fetch")) {
    return "네트워크 오류로 임시저장하지 못했습니다. 답안은 이 기기에 보존됩니다.";
  }
  return "임시저장에 실패했습니다. 잠시 후 다시 시도해주세요.";
}
