export interface AuthUser {
  id: bigint;
  name: string;
  wxNickname: string | null;
  guildNickname: string | null;
  privilege: 0 | 1 | 2;
  isApproved: boolean;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason?: string | null;
  profileComplete: boolean;
  status: number;
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  user?: AuthUser;
  authSessionId?: bigint;
  authSource?: "bearer" | "cookie";
  requestId?: string;
}
