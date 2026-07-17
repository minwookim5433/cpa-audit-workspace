/**
 * App entry — MVP (문제풀이 화면만)
 */
import { initWorkspace } from "./workspace-app.js";

initWorkspace().catch((err) => {
  console.error("App bootstrap failed:", err);
});
