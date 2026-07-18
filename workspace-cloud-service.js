/**
 * Supabase workspaces — 사용자별 이어풀기 저장 (RLS + publishable key)
 */
import { getSupabaseClient } from "/public/js/supabase-client.js";
import { packWorkspaceRow, unpackWorkspaceRow, mapCloudSaveError } from "./workspace-cloud-model.js";
import { showSaveTraceStatus, traceSave } from "./workspace-save-trace.js";

export { packWorkspaceRow, unpackWorkspaceRow, mapCloudSaveError };

const TABLE_NAME = "workspaces";
const ON_CONFLICT = "user_id,document_key";

function logSupabaseError(scope, error, extra = {}) {
  console.error(`[${scope}] Supabase error:`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
    ...extra,
  });
}

function sanitizeJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function captureError(report, err) {
  if (!err) return;
  report.error = {
    code: err.code ?? null,
    message: err.message ?? String(err),
    details: err.details ?? null,
    hint: err.hint ?? null,
  };
  report.status = err.status ?? err.statusCode ?? report.status ?? null;
}

function sanitizeReturnedRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    user_id: row.user_id ?? null,
    document_key: row.document_key ?? null,
    document_name: row.document_name ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    answer_data_keys: row.answer_data ? Object.keys(row.answer_data) : [],
    workspace_state_keys: row.workspace_state ? Object.keys(row.workspace_state) : [],
    annotation_data_keys: row.annotation_data ? Object.keys(row.annotation_data) : [],
  };
}

function createDebugReport({ documentKey = null } = {}) {
  return {
    success: false,
    userIdPresent: false,
    userIdPreview: null,
    sessionPresent: false,
    documentKey,
    tableName: TABLE_NAME,
    onConflict: ON_CONFLICT,
    payloadFields: [],
    method: null,
    error: {
      code: null,
      message: null,
      details: null,
      hint: null,
    },
    status: null,
    data: null,
  };
}

export async function requireAuthContext() {
  const supabase = await getSupabaseClient();

  let {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    logSupabaseError("requireAuthContext.getSession", sessionError);
  }

  if (!session?.access_token) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      logSupabaseError("requireAuthContext.refreshSession", refreshError);
      const err = new Error(refreshError.message || "AUTH_SESSION_REFRESH_FAILED");
      err.code = refreshError.code || "AUTH_SESSION_REFRESH_FAILED";
      err.details = refreshError;
      err.status = refreshError.status;
      throw err;
    }
    session = refreshed.session;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    logSupabaseError("requireAuthContext.getUser", userError);
    const err = new Error(userError.message || "AUTH_USER_LOOKUP_FAILED");
    err.code = userError.code || "AUTH_USER_LOOKUP_FAILED";
    err.details = userError;
    err.status = userError.status;
    throw err;
  }

  if (!user?.id) {
    const err = new Error("NOT_AUTHENTICATED");
    err.code = "NOT_AUTHENTICATED";
    throw err;
  }

  traceSave("3", `user present: true (id prefix ${user.id.slice(0, 8)}…)`);
  showSaveTraceStatus("로그인 확인 완료");

  if (!session?.access_token) {
    const err = new Error("AUTH_SESSION_MISSING");
    err.code = "AUTH_SESSION_MISSING";
    throw err;
  }

  return { supabase, user, session };
}

export async function getAuthenticatedUser() {
  const { user } = await requireAuthContext();
  return user;
}

/** @deprecated Prefer getAuthenticatedUser() */
export async function getAuthenticatedUserId() {
  const user = await getAuthenticatedUser();
  return user?.id || null;
}

export async function fetchCloudWorkspace(documentKey) {
  const { supabase, user } = await requireAuthContext();
  if (!documentKey) return null;

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .eq("user_id", user.id)
    .eq("document_key", documentKey)
    .maybeSingle();

  if (error) {
    logSupabaseError("fetchCloudWorkspace", error, { documentKey, userId: user.id });
    throw error;
  }
  return data;
}

export async function upsertCloudWorkspaceWithDebug({
  documentKey,
  documentName,
  snapshot,
  legacyFingerprint,
}) {
  const report = createDebugReport({ documentKey: documentKey || null });

  try {
    const { supabase, user, session } = await requireAuthContext();
    report.userIdPresent = Boolean(user?.id);
    report.userIdPreview = user?.id ? `${user.id.slice(0, 8)}…` : null;
    report.sessionPresent = Boolean(session?.access_token);

    if (!documentKey) {
      const err = new Error("MISSING_DOCUMENT_KEY");
      err.code = "MISSING_DOCUMENT_KEY";
      throw err;
    }

    const packed = packWorkspaceRow(snapshot, { documentKey, documentName, legacyFingerprint });
    const payload = {
      user_id: user.id,
      document_key: packed.document_key,
      document_name: packed.document_name,
      answer_data: sanitizeJson(packed.answer_data),
      workspace_state: sanitizeJson(packed.workspace_state),
      annotation_data: sanitizeJson(packed.annotation_data),
    };
    report.payloadFields = Object.keys(payload);

    report.method = "postgrest.upsert";
    traceSave("5", "calling upsertCloudWorkspace");
    showSaveTraceStatus("클라우드 저장 요청 중");

    const { data, error, status } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: ON_CONFLICT })
      .select();

    traceSave("6", `supabase response received (status: ${status ?? "—"})`);

    if (status) report.status = status;
    if (error) {
      captureError(report, error);
      logSupabaseError("upsertCloudWorkspaceWithDebug", error, {
        documentKey,
        userId: user.id,
        onConflict: ON_CONFLICT,
      });
      return report;
    }

    if (!Array.isArray(data) || !data.length) {
      const err = new Error("UPSERT_NO_ROWS_RETURNED");
      err.code = "UPSERT_NO_ROWS_RETURNED";
      err.message = "Upsert succeeded but no rows were returned (check SELECT RLS).";
      captureError(report, err);
      return report;
    }

    report.success = true;
    report.data = sanitizeReturnedRow(data[0]);
    return report;
  } catch (err) {
    captureError(report, err);
    logSupabaseError("upsertCloudWorkspaceWithDebug.exception", err, { documentKey });
    return report;
  }
}

export async function upsertCloudWorkspace(params) {
  const report = await upsertCloudWorkspaceWithDebug(params);
  if (!report.success) {
    const err = new Error(report.error?.message || "CLOUD_SAVE_FAILED");
    err.code = report.error?.code || "CLOUD_SAVE_FAILED";
    err.details = report.error?.details ?? null;
    err.hint = report.error?.hint ?? null;
    err.status = report.status ?? null;
    throw err;
  }
  return report.data;
}
