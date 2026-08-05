"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setAdminOrganizationArchived, setAdminUserArchived } from "@/lib/admin/resource-management";

export async function archiveAdminUserAction(userId: string) {
  await setAdminUserArchived(userId, true);
  revalidatePath("/admin/users");
  redirect("/admin/users?archived=1");
}

export async function restoreAdminUserAction(userId: string) {
  await setAdminUserArchived(userId, false);
  revalidatePath("/admin/users");
  redirect("/admin/users?view=archived&restored=1");
}

export async function archiveAdminOrganizationAction(organizationId: string) {
  await setAdminOrganizationArchived(organizationId, true);
  revalidatePath("/admin/organizations");
  redirect("/admin/organizations?archived=1");
}

export async function restoreAdminOrganizationAction(organizationId: string) {
  await setAdminOrganizationArchived(organizationId, false);
  revalidatePath("/admin/organizations");
  redirect("/admin/organizations?view=archived&restored=1");
}
