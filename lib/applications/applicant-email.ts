import "server-only";
import { normalizeVerificationEmail } from "@/lib/applications/contact-verification";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const registeredApplicantEmailCode = "applicant_email_registered";
export const registeredApplicantEmailMessage = "このメールアドレスはすでに登録があります。ログインするか、パスワード再設定をご利用ください。";

export async function applicantEmailAlreadyRegistered(supabase: SupabaseAdminClient, rawEmail: string) {
  const email = normalizeVerificationEmail(rawEmail);
  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id")
    .ilike("email", email)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (applicationError) throw applicationError;
  if (application) return true;

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    if (data.users.some((user) => normalizeVerificationEmail(user.email ?? "") === email)) return true;
    if (data.users.length < 1000) return false;
  }
  return false;
}

export function isDuplicateApplicantEmailError(error: { code?: string | null; message?: string | null } | null | undefined) {
  return error?.code === "23505" && Boolean(error.message?.includes("applications_active_email_uidx"));
}
