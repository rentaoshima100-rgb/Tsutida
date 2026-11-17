import "server-only";
import { getStaff } from "@/lib/server/auth";

/** 管理用の API（PDF・CSV）：管理者で aal2 でなければ 401 */
export async function staffOr401() {
  const staff = await getStaff();
  if (!staff) return { staff: null, response: new Response("Unauthorized", { status: 401 }) } as const;
  return { staff, response: null } as const;
}
