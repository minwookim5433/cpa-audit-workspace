/**
 * Supabase client singleton — createClient는 이 파일에서만 호출합니다.
 * npm 패키지 버전(@supabase/supabase-js)과 동일한 CDN 번들을 사용합니다.
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/+esm";
let supabaseClient = null;
let initPromise = null;

async function loadPublicConfig() {
  const res = await fetch("/api/public-config", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("PUBLIC_CONFIG_UNAVAILABLE");
  }
  const data = await res.json();
  if (!data?.supabaseUrl || !data?.supabasePublishableKey) {
    throw new Error("PUBLIC_CONFIG_INCOMPLETE");
  }
  return data;
}

export async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!initPromise) {
    initPromise = (async () => {
      const { supabaseUrl, supabasePublishableKey } = await loadPublicConfig();
      supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return supabaseClient;
    })();
  }
  return initPromise;
}
