"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";
import {
  archiveLineBookingMigration,
  completeLineBookingMigration,
  confirmLineMigrationTest,
  createLineBookingMigration,
  importLineMigrationBookings,
  markLineMigrationDataPrepared,
  requestLineMigrationCutover,
  previewLineMigrationImport,
  restoreLineBookingMigration,
  rollBackLineBookingMigration,
  updateLineBookingMigrationAssessment
} from "@/lib/line/migration";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/bookings/migration`);
  revalidatePath(`/stores/${storeId}/bookings`);
  revalidatePath(`/stores/${storeId}/bookings/line`);
}

async function run(storeId: string, task: () => Promise<void>, success: string) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await task();
  } catch (error) {
    redirect(`/stores/${storeId}/bookings/migration?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/migration?${success}=1`);
}

export async function createLineBookingMigrationAction(storeId: string, formData: FormData) {
  return run(storeId, () => createLineBookingMigration(storeId, formData), "saved");
}

export async function updateLineBookingMigrationAssessmentAction(storeId: string, formData: FormData) {
  return run(storeId, () => updateLineBookingMigrationAssessment(storeId, formData), "saved");
}

export async function previewLineMigrationImportAction(storeId: string, formData: FormData) {
  return run(storeId, () => previewLineMigrationImport(storeId, formData), "previewed");
}

export async function importLineMigrationBookingsAction(storeId: string) {
  return run(storeId, () => importLineMigrationBookings(storeId), "imported");
}

export async function markLineMigrationDataPreparedAction(storeId: string, formData: FormData) {
  return run(storeId, () => markLineMigrationDataPrepared(storeId, formData), "saved");
}

export async function confirmLineMigrationTestAction(storeId: string, formData: FormData) {
  return run(storeId, () => confirmLineMigrationTest(storeId, formData), "saved");
}

export async function requestLineMigrationCutoverAction(storeId: string, formData: FormData) {
  return run(storeId, () => requestLineMigrationCutover(storeId, formData), "requested");
}

export async function completeLineBookingMigrationAction(storeId: string, formData: FormData) {
  return run(storeId, () => completeLineBookingMigration(storeId, formData), "completed");
}

export async function rollBackLineBookingMigrationAction(storeId: string, formData: FormData) {
  return run(storeId, () => rollBackLineBookingMigration(storeId, formData), "rolledBack");
}

export async function archiveLineBookingMigrationAction(storeId: string) {
  return run(storeId, () => archiveLineBookingMigration(storeId), "deleted");
}

export async function restoreLineBookingMigrationAction(storeId: string, migrationId: string) {
  return run(storeId, () => restoreLineBookingMigration(storeId, migrationId), "restored");
}
