import { randomUUID } from "node:crypto";
import type { NestMiddleware } from "@nestjs/common";

export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: { headers: Record<string, string | string[] | undefined>; requestId?: string },
    response: { setHeader(name: string, value: string): void },
    next: () => void,
  ) {
    const incoming = request.headers["x-request-id"];
    request.requestId = typeof incoming === "string" && incoming.length <= 128 ? incoming : randomUUID();
    response.setHeader("x-request-id", request.requestId);
    next();
  }
}
