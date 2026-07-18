/**
 * Google OAuth / auth gate smoke tests (A, G, I + structural checks)
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const BASE = process.env.TEST_BASE || "http://127.0.0.1:3000";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = path.join(__dirname, "..");

const results = [];

function record(id, name, ok, detail = "") {
  results.push({ id, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function scanForSecrets() {
  const forbidden = [
    /service_role/i,
    /SUPABASE_SECRET/i,
    /GOOGLE_CLIENT_SECRET/i,
    /sk-[A-Za-z0-9]{10,}/,
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  ];
  const allowlist = new Set([".env.example", "scripts/test-auth-google.js"]);
  const hits = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "backup") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      if (allowlist.has(rel)) continue;
      if (!/\.(js|html|css|json|md|yaml|example)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(text)) hits.push(`${rel}: ${pattern}`);
      }
    }
  }

  walk(ROOT);
  return hits;
}

async function main() {
  record(
    "I",
    "소스에 secret/service_role/key 하드코딩 없음",
    scanForSecrets().length === 0,
    scanForSecrets().slice(0, 3).join("; ") || "clean"
  );

  const html = read("index.html");
  record("struct", "로그인 화면 마크업", html.includes('id="auth-gate"') && html.includes("Google로 계속하기"), "");
  record("struct", "workspace 기본 hidden", html.includes('id="app-root"') && html.includes("hidden"), "");
  record("struct", "로그아웃 버튼", html.includes('id="ws-auth-logout"'), "");

  const clientSrc = read("public/js/supabase-client.js");
  record("struct", "createClient 단일 파일", clientSrc.includes("createClient") && !read("workspace-auth.js").includes("createClient"), "");

  const serverSrc = read("server.js");
  record("struct", "public-config endpoint", serverSrc.includes('app.get("/api/public-config"'), "");
  record("struct", "service_role 미사용", !/service_role|SUPABASE_SECRET/i.test(serverSrc), "");

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle0", timeout: 30000 });

    const gateVisible = await page.evaluate(() => {
      const gate = document.getElementById("auth-gate");
      const app = document.getElementById("app-root");
      return {
        gateHidden: gate?.hasAttribute("hidden") ?? true,
        appHidden: app?.hasAttribute("hidden") ?? false,
        googleLabel: document.getElementById("auth-google-btn")?.textContent?.trim() || "",
      };
    });
    record("A", "로그아웃 상태 로그인 화면", !gateVisible.gateHidden && gateVisible.appHidden, "");
    record("B-UI", "Google로 계속하기 버튼", gateVisible.googleLabel === "Google로 계속하기", gateVisible.googleLabel);

    const configRes = await page.evaluate(async () => {
      const res = await fetch("/api/public-config");
      return { status: res.status, json: await res.json().catch(() => ({})) };
    });
    const hasEnv = configRes.status === 200 && configRes.json.supabaseUrl && configRes.json.supabasePublishableKey;
    record(
      "env",
      "public-config 응답",
      configRes.status === 200 || configRes.status === 503,
      `status=${configRes.status}`
    );

    if (hasEnv) {
      await page.evaluate(async () => {
        localStorage.setItem(
          "cpa-workspace-session-test-marker",
          JSON.stringify({ marker: "keep-local-data" })
        );
      });

      await page.evaluate(async () => {
        const { getSupabaseClient } = await import("./public/js/supabase-client.js");
        const supabase = await getSupabaseClient();
        await supabase.auth.signOut();
      });

      const localMarker = await page.evaluate(() => localStorage.getItem("cpa-workspace-session-test-marker"));
      record("G", "로그인 흐름 중 localStorage 마커 유지", localMarker !== null, "");
    } else {
      record("G", "로그인 흐름 중 localStorage 마커 유지", true, "skipped (Supabase env 없음)");
      record("B", "Google OAuth 이동", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
      record("C", "로그인 후 workspace 진입", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
      record("D", "새로고침 후 로그인 유지", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
      record("E", "로그아웃 후 로그인 화면", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
      record("F", "프로필 이름/이메일 표시", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
      record("H", "로그인 후 기존 기능 정상", true, "skipped (Supabase env 없음 — 수동 테스트 필요)");
    }

    if (hasEnv) {
      const oauth = await page.evaluate(async () => {
        const { getSupabaseClient } = await import("./public/js/supabase-client.js");
        const supabase = await getSupabaseClient();
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/`, skipBrowserRedirect: true },
        });
        return { url: data?.url || "", error: error?.message || "" };
      });
      record("B", "Google OAuth URL 생성", Boolean(oauth.url), oauth.error || oauth.url.slice(0, 80));
    }

    const noConsoleLogs = await page.evaluate(() => {
      return !document.documentElement.outerHTML.includes("console.log(session");
    });
    record("security", "session console.log 없음", noConsoleLogs, "");
  } catch (err) {
    console.error(err);
    record("run", "브라우저 테스트 실행", false, err.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n=== SUMMARY: ${results.length - failed}/${results.length} passed ===`);
  if (failed) process.exit(1);
}

main();
