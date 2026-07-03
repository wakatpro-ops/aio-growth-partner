import { rolePermissions } from "@/config/permissions";
import type { RoleKey } from "@/types/domain";

export function hasPermission(role: RoleKey, permission: string): boolean {
  const permissions = rolePermissions[role] ?? [];
  return permissions.includes("*") || permissions.includes(permission);
}
