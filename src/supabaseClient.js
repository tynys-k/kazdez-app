import { createClient } from "@supabase/supabase-js";

// Эти два значения безопасны для публикации (защита данных — на стороне базы,
// через правила доступа, которые мы настроили на Этапе 2).
const SUPABASE_URL = "https://tkfifsvoiqnjbjvluwub.supabase.co";
const SUPABASE_KEY = "sb_publishable_4L8SKkHN5UNL8orN1pW6fw_6RW7v-Uq";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
