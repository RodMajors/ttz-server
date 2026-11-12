export interface AuthUser {
  id: bigint;
  name: string;
  privilege: 0 | 1 | 2;
  isApproved: boolean;
  status: number;
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  user?: AuthUser;
  authSessionId?: bigint;
  authSource?: "bearer" | "cookie" | "development";
  requestId?: string;
}
