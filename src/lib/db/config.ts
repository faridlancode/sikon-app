// External (self-hosted by the user) Supabase project configuration.
// The publishable key is safe to keep in the codebase.
export const SUPABASE_URL = "https://gdrqfwqdxazrdrxumnhy.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4OTh0x9IKpznH7v-Ntgvrg_KPzR3rr3";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New-format Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
