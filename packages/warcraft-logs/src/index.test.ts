import { describe, expect, it, vi } from "vitest";
import { WarcraftLogsClient } from "./index";

describe("WarcraftLogsClient", () => {
  it("uses client credentials, caches the token, and parses public report data", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === "https://www.warcraftlogs.com/oauth/token") {
        return jsonResponse({ access_token: "secret-token", expires_in: 3600 });
      }
      return jsonResponse({
        data: {
          reportData: {
            report: {
              code: "REPORT123",
              title: "Progress",
              startTime: 1000,
              endTime: 2000,
              fights: [{ id: 1, encounterID: 2, startTime: 1000, endTime: 2000, kill: true }],
              masterData: { actors: [{ id: 3, name: "Player", type: "Player", server: "Illidan" }] },
            },
          },
        },
      });
    });
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    const [first, second] = await Promise.all([client.getReport("REPORT123"), client.getReport("REPORT123")]);

    expect(first).toEqual(second);
    expect(first.actors[0]?.name).toBe("Player");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0]?.[0]).toBe("https://www.warcraftlogs.com/oauth/token");
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ authorization: "Bearer secret-token" }),
    });
    expect(JSON.stringify(request.mock.calls)).not.toContain("client-secret");
  });

  it("rejects an unconfigured client without making a network request", async () => {
    const request = vi.fn<typeof fetch>();
    const client = new WarcraftLogsClient("", "", request);

    await expect(client.getReport("REPORT123")).rejects.toThrow("WCL API credentials are not configured");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects GraphQL errors for unavailable or private reports", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "secret-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ errors: [{ message: "Report not found" }] }));
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    await expect(client.getReport("PRIVATE01")).rejects.toThrow("Report not found");
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}
