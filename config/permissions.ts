import type { RoleKey } from "@/types/domain";

export const rolePermissions: Record<RoleKey, string[]> = {
  platform_admin: ["*"],
  org_owner: [
    "stores.read",
    "stores.write",
    "members.read",
    "members.write",
    "ai.generate_post",
    "ai.generate_review_reply",
    "ai.run_diagnosis",
    "settings.read",
    "settings.write"
  ],
  store_manager: [
    "stores.read",
    "stores.write",
    "ai.generate_post",
    "ai.generate_review_reply",
    "ai.run_diagnosis"
  ],
  staff: ["stores.read", "ai.generate_post", "ai.generate_review_reply"],
  viewer: ["stores.read"]
};
