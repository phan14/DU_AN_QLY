// src/types/supabase.d.ts
import "@supabase/supabase-js";

declare module "@supabase/supabase-js" {
  interface QueryOptions {
    count?: "exact" | "planned" | "estimated" | null;
    head?: boolean;
  }

  interface OrderByOption {
    ascending?: boolean;
    nullsFirst?: boolean;
    nullsLast?: boolean;
  }

  interface PostgrestSingleResponse<T> {
    data: T | null;
    count: number | null;
    error: any;
    status: number;
    statusText: string;
  }
}