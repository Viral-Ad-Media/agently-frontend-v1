// services/supabaseClient.ts
//
// The single Supabase client for this app.
//
// services/knowledgeUploadsApi.ts and services/realtime.ts each used to call
// createClient() independently at module scope. Both point at the same
// project, so both GoTrueClient instances share one localStorage key
// ("sb-<project-ref>-auth-token") and fight over the same session-refresh
// lock — which is exactly the "Multiple GoTrueClient instances detected" and
// "Lock ... was not released within 5000ms" warnings in the console. It is
// not cosmetic: two clients racing to refresh the same token can produce a
// session one of them thinks is stale seconds after the other renewed it.
//
// Every module that needs a Supabase client imports the one instance here.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
