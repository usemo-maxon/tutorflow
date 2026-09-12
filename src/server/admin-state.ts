import "server-only";

import type { Lesson } from "@/lib/domain";
import { createSupabaseAdminClient } from "./supabase";

export interface PersistedState {
  students: Array<{ id: string; name: string }>;
  lessons: Lesson[];
  availability: unknown[];
}

export async function updateStateAsAdmin(
  teacherId: string,
  mutate: (state: PersistedState) => void,
) {
  const supabase = createSupabaseAdminClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from("teacher_states")
      .select("state,version")
      .eq("teacher_id", teacherId)
      .single();
    if (error) throw error;
    const state = data.state as PersistedState;
    mutate(state);
    const { data: updated, error: updateError } = await supabase
      .from("teacher_states")
      .update({
        state,
        version: Number(data.version) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("teacher_id", teacherId)
      .eq("version", data.version)
      .select("version");
    if (updateError) throw updateError;
    if (updated?.length) return;
  }
  throw new Error("STATE_VERSION_CONFLICT");
}
