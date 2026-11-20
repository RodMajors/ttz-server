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

  it("reads WCL raid zones and normalizes paginated guild fight data", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (url === "https://www.warcraftlogs.com/oauth/token") {
        return jsonResponse({ access_token: "token", expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("TTZRaidZones")) {
        return jsonResponse({
          data: { worldData: { zones: [{ id: 53, name: "烈毒之渊", encounters: [{ id: 3420, name: "Boss" }] }] } },
        });
      }
      return jsonResponse({
        data: {
          reportData: {
            reports: {
              has_more_pages: true,
              data: [
                {
                  code: "R1",
                  startTime: 100,
                  phases: [
                    {
                      encounterID: 3420,
                      phases: [
                        { id: 1, name: "Stage One", isIntermission: false },
                        { id: 2, name: "Intermission", isIntermission: true },
                      ],
                    },
                  ],
                  heroicFights: [
                    {
                      id: 1,
                      encounterID: 3420,
                      name: "Boss",
                      difficulty: 4,
                      kill: true,
                      bossPercentage: null,
                      fightPercentage: 100,
                      startTime: 0,
                      endTime: 50,
                      phaseTransitions: [{ id: 1, startTime: 100 }],
                      friendlyPlayers: [],
                    },
                  ],
                  mythicFights: [
                    {
                      id: 2,
                      encounterID: 3420,
                      name: "Boss",
                      difficulty: 5,
                      kill: false,
                      bossPercentage: 22.5,
                      fightPercentage: 90.99,
                      startTime: 60,
                      endTime: 90,
                      phaseTransitions: [
                        { id: 1, startTime: 160 },
                        { id: 2, startTime: 180 },
                      ],
                      friendlyPlayers: [],
                    },
                  ],
                },
              ],
            },
          },
        },
      });
    });
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    await expect(client.getRaidZoneInfo("cn")).resolves.toEqual([
      { id: 53, name: "烈毒之渊", encounters: [{ id: 3420, name: "Boss" }] },
    ]);
    await expect(client.getGuildReportPage({ guildId: 820881, zoneId: 53, page: 2 })).resolves.toEqual({
      hasMorePages: true,
      reports: [
        {
          code: "R1",
          startTime: 100,
          phases: [
            {
              encounterId: 3420,
              phases: [
                { id: 1, name: "Stage One", isIntermission: false },
                { id: 2, name: "Intermission", isIntermission: true },
              ],
            },
          ],
          fights: [
            {
              id: 1,
              encounterId: 3420,
              name: "Boss",
              difficulty: 4,
              kill: true,
              bossPercent: null,
              fightPercent: 100,
              startTime: 0,
              endTime: 50,
              friendlyPlayers: [],
              phaseData: {
                phases: [
                  { id: 1, name: "Stage One", isIntermission: false },
                  { id: 2, name: "Intermission", isIntermission: true },
                ],
                transitions: [{ phaseId: 1, offsetMs: 50 }],
              },
            },
            {
              id: 2,
              encounterId: 3420,
              name: "Boss",
              difficulty: 5,
              kill: false,
              bossPercent: 22.5,
              fightPercent: 90.99,
              startTime: 60,
              endTime: 90,
              friendlyPlayers: [],
              phaseData: {
                phases: [
                  { id: 1, name: "Stage One", isIntermission: false },
                  { id: 2, name: "Intermission", isIntermission: true },
                ],
                transitions: [
                  { phaseId: 1, offsetMs: 30 },
                  { phaseId: 2, offsetMs: 30 },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(request.mock.calls.at(-1)?.[1]).toMatchObject({
      body: expect.stringContaining("mythicFights: fights(difficulty: 5)"),
    });
  });

  it("aggregates best-fight DPS, HPS, and damage-taken time series", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (url === "https://www.warcraftlogs.com/oauth/token")
        return jsonResponse({ access_token: "token", expires_in: 3600 });
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("TTZFights"))
        return jsonResponse({
          data: { reportData: { report: { fights: [{ id: 4, startTime: 5_000, endTime: 7_000 }] } } },
        });
      return jsonResponse({
        data: {
          reportData: {
            report: {
              damage: {
                data: {
                  series: [
                    { pointStart: 5_000, pointInterval: 1_000, data: [10, 20] },
                    { pointStart: 5_000, pointInterval: 1_000, data: [2, null] },
                  ],
                },
              },
              healing: { data: { series: [{ pointStart: 5_000, pointInterval: 1_000, data: [3, 4] }] } },
              damageTaken: { data: { series: [{ pointStart: 5_000, pointInterval: 1_000, data: [5, 6] }] } },
            },
          },
        },
      });
    });
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    await expect(client.getFightMetricGraph("R1", 4)).resolves.toEqual({
      durationMs: 2_000,
      points: [
        { timeMs: 0, dps: 12, hps: 3, dtps: 5 },
        { timeMs: 1_000, dps: 20, hps: 4, dtps: 6 },
      ],
    });
    const graphQuery = JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(graphQuery.query).toContain("dataType: DamageTaken");
    expect(graphQuery.variables).toMatchObject({ startTime: 5_000, endTime: 7_000, fightIDs: [4] });
  });

  it("loads raid zone metadata and paginated guild fight records", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (url === "https://www.warcraftlogs.com/oauth/token") {
        return jsonResponse({ access_token: "token", expires_in: 3600 });
      }
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (body.query.includes("TTZRaidZones")) {
        return jsonResponse({
          data: { worldData: { zones: [{ id: 53, name: "烈毒之渊", encounters: [{ id: 3420, name: "Boss" }] }] } },
        });
      }
      return jsonResponse({
        data: {
          reportData: {
            reports: {
              has_more_pages: false,
              data: [
                {
                  code: "R1",
                  startTime: 100,
                  phases: [],
                  heroicFights: [
                    {
                      id: 1,
                      encounterID: 3420,
                      name: "Boss",
                      difficulty: 4,
                      kill: true,
                      bossPercentage: null,
                      fightPercentage: null,
                      startTime: 0,
                      endTime: 50,
                      phaseTransitions: [],
                      friendlyPlayers: [],
                    },
                  ],
                  mythicFights: [
                    {
                      id: 2,
                      encounterID: 3420,
                      name: "Boss",
                      difficulty: 5,
                      kill: false,
                      bossPercentage: 22.5,
                      fightPercentage: null,
                      startTime: 60,
                      endTime: 90,
                      phaseTransitions: [],
                      friendlyPlayers: [],
                    },
                  ],
                },
              ],
            },
          },
        },
      });
    });
    const client = new WarcraftLogsClient("client-id", "client-secret", request);

    await expect(client.getRaidZoneInfo("cn")).resolves.toEqual([
      { id: 53, name: "烈毒之渊", encounters: [{ id: 3420, name: "Boss" }] },
    ]);
    await expect(
      client.getGuildReportPage({ guildId: 820881, zoneId: 53, page: 1, startTime: 1_000 }),
    ).resolves.toEqual({
      hasMorePages: false,
      reports: [
        {
          code: "R1",
          startTime: 100,
          phases: [],
          fights: [
            {
              id: 1,
              encounterId: 3420,
              name: "Boss",
              difficulty: 4,
              kill: true,
              bossPercent: null,
              fightPercent: null,
              startTime: 0,
              endTime: 50,
              friendlyPlayers: [],
              phaseData: null,
            },
            {
              id: 2,
              encounterId: 3420,
              name: "Boss",
              difficulty: 5,
              kill: false,
              bossPercent: 22.5,
              fightPercent: null,
              startTime: 60,
              endTime: 90,
              friendlyPlayers: [],
              phaseData: null,
            },
          ],
        },
      ],
    });
    const queryBody = JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    expect(queryBody.query).toContain("heroicFights: fights(difficulty: 4)");
    expect(queryBody.variables).toMatchObject({ guildId: 820881, zoneId: 53, page: 1, startTime: 1_000 });
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}
