const WCL_OAUTH_ORIGIN = "https://www.warcraftlogs.com";
const WCL_API_ORIGINS = { global: WCL_OAUTH_ORIGIN, cn: "https://cn.warcraftlogs.com" } as const;

export type WclRegion = keyof typeof WCL_API_ORIGINS;

export interface WclActor {
  id: number;
  name: string;
  type: string;
  subType?: string | null;
  server?: string | null;
  gameID?: number | null;
}

export interface WclFight {
  id: number;
  encounterID: number;
  name?: string;
  startTime: number;
  endTime: number;
  kill: boolean;
}

export interface WclReportData {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  fights: WclFight[];
  actors: WclActor[];
}

export interface WclCharacter {
  id: number;
  canonicalID: number;
  name: string;
  classID: number;
  claimed?: boolean | null;
  level?: number | null;
  hidden?: boolean | null;
  faction?: { id: number; name: string } | null;
  server: { id?: number; slug: string; name: string; region?: { slug: string; name: string } | null };
  guilds?: Array<{ id: number; name: string }> | null;
  gameData?: unknown;
}

export interface WclServer {
  id: number;
  name: string;
  slug: string;
  blizzardID?: number | null;
  connectedRealmID?: number | null;
}

export interface WclClassDefinition {
  id: number;
  name: string;
  slug: string;
  specs: Array<{ id: number; name: string; slug: string }>;
}

export interface WclRaidZoneInfo {
  id: number;
  name: string;
  encounters: Array<{ id: number; name: string }>;
}

export interface WclGuildReportFight {
  id: number;
  encounterId: number;
  name: string;
  difficulty: number;
  kill: boolean;
  bossPercent: number | null;
  startTime: number;
  endTime: number;
  friendlyPlayers: string[];
}

export interface WclGuildReportsPage {
  reports: Array<{ code: string; startTime: number; fights: WclGuildReportFight[] }>;
  hasMorePages: boolean;
}

export interface WclCurrentUser {
  id: number;
  name: string;
  battleTag?: string | null;
  characters: WclCharacter[];
}

export class WarcraftLogsClient {
  private cachedToken?: { value: string; expiresAt: number };
  private tokenRequest?: Promise<string>;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  authorizationUrl(input: { redirectUri: string; state: string; codeChallenge: string }) {
    this.requireCredentials();
    const url = new URL(`${WCL_OAUTH_ORIGIN}/oauth/authorize`);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.href;
  }

  async exchangeAuthorizationCode(input: { code: string; redirectUri: string; codeVerifier: string }) {
    this.requireCredentials();
    const response = await this.request(`${WCL_OAUTH_ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    return parseAccessToken(response, "authorization code");
  }

  async getCurrentUser(accessToken: string, region: WclRegion = "cn"): Promise<WclCurrentUser> {
    const data = await this.graphqlUser<{ userData: { currentUser: WclCurrentUser | null } }>(
      accessToken,
      region,
      [
        "query TTZCurrentUser {",
        " userData { currentUser {",
        " id name battleTag",
        " characters {",
        " id canonicalID name classID claimed",
        " server { slug name region { slug name } }",
        " }",
        " } }",
        "}",
      ].join(" "),
      {},
    );
    if (!data.userData.currentUser) throw new Error("WCL current user was not returned");
    return { ...data.userData.currentUser, characters: data.userData.currentUser.characters ?? [] };
  }

  async getCharacter(
    name: string,
    serverSlug: string,
    serverRegion: string,
    region: WclRegion = "cn",
  ): Promise<WclCharacter | null> {
    const query = [
      "query TTZCharacter($name: String!, $serverSlug: String!, $serverRegion: String!) {",
      " characterData { character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {",
      " id canonicalID name classID level hidden",
      " faction { id name }",
      " server { id slug name region { slug name } }",
      " guilds { id name }",
      " gameData",
      " } }",
      "}",
    ].join(" ");
    const data = await this.graphqlClient<{ characterData: { character: WclCharacter | null } }>(region, query, {
      name,
      serverSlug,
      serverRegion,
    });
    return data.characterData.character;
  }

  async getChinaServers(page = 1): Promise<{ data: WclServer[]; hasMorePages: boolean }> {
    const query = [
      "query TTZChinaServers($page: Int) {",
      " worldData { region(id: 5) { servers(limit: 400, page: $page) {",
      " data { id name slug blizzardID connectedRealmID } has_more_pages",
      " } } }",
      "}",
    ].join(" ");
    const result = await this.graphqlClient<{
      worldData: { region: { servers: { data: WclServer[]; has_more_pages: boolean } } | null };
    }>("cn", query, { page });
    const servers = result.worldData.region?.servers;
    return { data: servers?.data ?? [], hasMorePages: servers?.has_more_pages ?? false };
  }

  async getClasses(region: WclRegion = "cn"): Promise<WclClassDefinition[]> {
    const query = "query TTZClasses { gameData { classes { id name slug specs { id name slug } } } }";
    const result = await this.graphqlClient<{ gameData: { classes: WclClassDefinition[] } }>(region, query, {});
    return result.gameData.classes;
  }

  async getRaidZoneInfo(region: WclRegion = "cn"): Promise<WclRaidZoneInfo[]> {
    const result = await this.graphqlClient<{ worldData: { zones: WclRaidZoneInfo[] } }>(
      region,
      "query TTZRaidZones { worldData { zones { id name encounters { id name } } } }",
      {},
    );
    return result.worldData.zones ?? [];
  }

  async getGuildReportPage(input: {
    guildId: number;
    zoneId: number;
    page: number;
    region?: WclRegion;
    startTime?: number;
    endTime?: number;
  }): Promise<WclGuildReportsPage> {
    const fields = "id encounterID name difficulty kill bossPercentage startTime endTime friendlyPlayers";
    const query = [
      "query TTZGuildReports($guildId: Int!, $zoneId: Int!, $page: Int!, $startTime: Float, $endTime: Float) {",
      " reportData { reports(guildID: $guildId, zoneID: $zoneId, startTime: $startTime, endTime: $endTime, limit: 10, page: $page) {",
      ' data { code startTime masterData { actors(type: "Player") { id gameID name server } } heroicFights: fights(difficulty: 4) { ' +
        fields +
        " } mythicFights: fights(difficulty: 5) { " +
        fields +
        " } }",
      " has_more_pages } }",
      "}",
    ].join(" ");
    const data = await this.graphqlClient<{
      reportData: {
        reports: {
          data: Array<{
            code: string;
            startTime: number;
            masterData?: {
              actors: Array<{ id: number; gameID: number | null; name: string; server: string | null }>;
            } | null;
            heroicFights: Array<
              Omit<WclGuildReportFight, "encounterId" | "bossPercent" | "friendlyPlayers"> & {
                encounterID: number;
                bossPercentage: number | null;
                friendlyPlayers: number[];
              }
            >;
            mythicFights: Array<
              Omit<WclGuildReportFight, "encounterId" | "bossPercent"> & {
                encounterID: number;
                bossPercentage: number | null;
                friendlyPlayers: number[];
              }
            >;
          }>;
          has_more_pages: boolean;
        };
      };
    }>(input.region ?? "cn", query, {
      guildId: input.guildId,
      zoneId: input.zoneId,
      page: input.page,
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
    });
    const result = data.reportData.reports;
    return {
      hasMorePages: result.has_more_pages ?? false,
      reports: (result.data ?? []).map((report) => {
        const players = new Map(
          (report.masterData?.actors ?? []).map((actor) => [
            actor.id,
            String(actor.gameID ?? actor.name.toLocaleLowerCase() + "-" + (actor.server ?? "")),
          ]),
        );
        return {
          code: report.code,
          startTime: report.startTime,
          fights: [...(report.heroicFights ?? []), ...(report.mythicFights ?? [])].map((fight) => ({
            id: fight.id,
            encounterId: fight.encounterID,
            name: fight.name,
            difficulty: fight.difficulty,
            kill: fight.kill,
            bossPercent: fight.bossPercentage,
            startTime: fight.startTime,
            endTime: fight.endTime,
            friendlyPlayers: (fight.friendlyPlayers ?? [])
              .map((id) => players.get(id))
              .filter((id): id is string => !!id),
          })),
        };
      }),
    };
  }

  async getReport(code: string): Promise<WclReportData> {
    const query = [
      "query TTZReport($code: String!) {",
      " reportData { report(code: $code) {",
      " code title startTime endTime",
      " fights { id encounterID name startTime endTime kill }",
      ' masterData { actors(type: "Player") { id name type subType server gameID } }',
      " } }",
      "}",
    ].join(" ");
    const data = await this.graphqlClient<{
      reportData: {
        report: (Omit<WclReportData, "actors"> & { masterData: { actors: WclActor[] } }) | null;
      };
    }>("global", query, { code });
    const report = data.reportData.report;
    if (!report) throw new Error("WCL report was not found or is not public");
    return {
      code: report.code,
      title: report.title,
      startTime: report.startTime,
      endTime: report.endTime,
      fights: report.fights,
      actors: report.masterData.actors,
    };
  }

  private graphqlClient<T>(region: WclRegion, query: string, variables: Record<string, unknown>) {
    return this.graphql<T>(`${WCL_API_ORIGINS[region]}/api/v2/client`, this.accessToken(), query, variables);
  }

  private graphqlUser<T>(accessToken: string, region: WclRegion, query: string, variables: Record<string, unknown>) {
    return this.graphql<T>(`${WCL_API_ORIGINS[region]}/api/v2/user`, Promise.resolve(accessToken), query, variables);
  }

  private async graphql<T>(
    endpoint: string,
    accessToken: Promise<string>,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.request(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await accessToken}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`WCL GraphQL request failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length || !payload.data) {
      throw new Error(payload.errors?.map((error) => error.message).join("; ") ?? "WCL response was empty");
    }
    return payload.data;
  }

  private async accessToken() {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) return this.cachedToken.value;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.requestAccessToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = undefined;
    }
  }

  private async requestAccessToken() {
    this.requireCredentials();
    const response = await this.request(`${WCL_OAUTH_ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    const token = await parseAccessToken(response, "client credentials");
    this.cachedToken = { value: token.accessToken, expiresAt: Date.now() + token.expiresIn * 1000 };
    return token.accessToken;
  }

  private requireCredentials() {
    if (!this.clientId || !this.clientSecret) throw new Error("WCL API credentials are not configured");
  }
}

async function parseAccessToken(response: Response, flow: string) {
  if (!response.ok) throw new Error(`WCL OAuth ${flow} request failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; token_type?: string };
  if (!payload.access_token || !payload.expires_in) throw new Error("WCL OAuth response is missing an access token");
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    tokenType: payload.token_type ?? "Bearer",
  };
}
