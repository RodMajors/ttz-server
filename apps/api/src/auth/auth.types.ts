export interface AuthUser {
  id: bigint;
  name: string;
  privilege: 0 | 1 | 2;
  isApproved: boolean;
}

export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
  requestId?: string;
}
