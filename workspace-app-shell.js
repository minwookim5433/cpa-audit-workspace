/**
 * App Shell — 메인 네비게이션
 */
import { initProblemLibrary } from "./workspace-problem-library.js";
import { markProblemSolved } from "./workspace-problem-service.js";

export function initAppShell() {
  const views = {
    library: document.getElementById("pl-view"),
    solve: document.getElementById("solve-view"),
    review: document.getElementById("review-view"),
    settings: document.getElementById("settings-view"),
  };

  function switchMainView(viewId) {
    document.querySelectorAll(".app-main-nav-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mainView === viewId);
    });
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.classList.toggle("is-active", key === viewId);
    });
    document.body.dataset.mainView = viewId;
  }

  document.querySelectorAll(".app-main-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.mainView;
      if (view === "review" || view === "settings") {
        switchMainView(view);
        return;
      }
      switchMainView(view);
      if (view === "library") window.__problemLibraryRefresh?.();
    });
  });

  initProblemLibrary({
    onSwitchMainView: switchMainView,
    onOpenSolve: async (problem, opts = {}) => {
      if (typeof window.__workspaceOpenForProblem === "function") {
        await window.__workspaceOpenForProblem(problem, opts);
      }
    },
  });

  window.__appSwitchMainView = switchMainView;

  window.__workspaceOnAttemptCompleted = async (attempt) => {
    const { syncProblemAttemptStats } = await import("./workspace-problem-service.js");
    if (attempt?.problemKey) {
      await syncProblemAttemptStats(attempt.problemKey);
      const problems = await (await import("./workspace-problem-service.js")).listAllProblems();
      const match = problems.find((p) => p.problemKey === attempt.problemKey);
      if (match) await markProblemSolved(match.id);
    }
    window.__problemLibraryRefresh?.();
  };

  switchMainView("library");
}
