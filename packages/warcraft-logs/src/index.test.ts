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

  it("builds the documented PKCE authorization URL without a scope parameter", () => {
    const client = new WarcraftLogsClient("client-id", "client-secret");
    const url = new URL(
      client.authorizationUrl({
        redirectUri: "http://127.0.0.1:3001/api/auth/wcl/callback",
        state: "state-token",
        codeChallenge: "challenge",
      }),
    );
    expect(url.origin).toBe("https://www.warcraftlogs.com");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("scope")).toBe(false);
  });

  it("exchanges a PKCE authorization code and reads claimed characters from the regional user endpoint", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "user-token", expires_in: 31104000 }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            userData: {
              currentUser: {
                id: 42,
                name: "RodMajors",
                characters: [
                  {
                    id: 101,
                    canonicalID: 101,
                    name: "Veliotha",
                    classID: 10,
                    claimed: true,
                    server: { id: 569, slug: "anzu", name: "安苏", region: { slug: "CN", name: "China" } },
                  },
                ],
              },
            },
          },
        }),
      );
    const client = new WarcraftLogsClient("client-id", "client-secret", request);
    const token = await client.exchangeAuthorizationCode({
      code: "authorization-code",
      redirectUri: "http://127.0.0.1:3001/api/auth/wcl/callback",
      codeVerifier: "a-random-code-verifier-that-is-long-enough-for-pkce-0123456789",
    });
    const profile = await client.getCurrentUser(token.accessToken, "cn");

    expect(token.accessToken).toBe("user-token");
    expect(profile.id).toBe(42);
    expect(profile.characters[0]).toMatchObject({ name: "Veliotha", server: { slug: "anzu", region: { slug: "CN" } } });
    expect(request.mock.calls[0]?.[0]).toBe("https://www.warcraftlogs.com/oauth/token");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      body: expect.stringContaining("grant_type=authorization_code"),
      headers: expect.objectContaining({ authorization: expect.stringContaining("Basic ") }),
    });
    expect(request.mock.calls[1]?.[0]).toBe("https://cn.warcraftlogs.com/api/v2/user");
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ authorization: "Bearer user-token" }),
    });
  });

  it("queries CN servers and WCL class/spec reference data", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (url === "https://www.warcraftlogs.com/oauth/token") {
        return jsonResponse({ access_token: "secret-token", expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("TTZChinaServers")) {
        return jsonResponse({
          data: {
            worldData: {
              region: {
                servers: {
                  data: [{ id: 569, name: "安苏", slug: "anzu", blizzardID: 1933, connectedRealmID: 111 }],
                  has_more_pages: false,
                },
              },
            },
          },
        });
      }
      return jsonResponse({
        data: {
          gameData: {
            classes: [{ id: 10, name: "术士", slug: "Warlock", specs: [{ id: 1, name: "痛苦", slug: "Affliction" }] }],
          },
        },
      });
    });
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    await expect(client.getChinaServers()).resolves.toEqual({
      data: [{ id: 569, name: "安苏", slug: "anzu", blizzardID: 1933, connectedRealmID: 111 }],
      hasMorePages: false,
    });
    await expect(client.getClasses()).resolves.toEqual([
      { id: 10, name: "术士", slug: "Warlock", specs: [{ id: 1, name: "痛苦", slug: "Affliction" }] },
    ]);
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}
