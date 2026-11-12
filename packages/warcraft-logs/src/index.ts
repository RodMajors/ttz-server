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

export class WarcraftLogsClient {
  private cachedToken?: { value: string; expiresAt: number };
  private tokenRequest?: Promise<string>;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly request: typeof fetch = fetch,
  ) {}

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
    const data = await this.graphql<{
      reportData: {
        report: (Omit<WclReportData, "actors"> & { masterData: { actors: WclActor[] } }) | null;
      };
    }>(query, { code });
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

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await this.request("https://www.warcraftlogs.com/api/v2/client", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`WCL GraphQL request failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length || !payload.data)
      throw new Error(payload.errors?.[0]?.message ?? "WCL response was empty");
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
    if (!this.clientId || !this.clientSecret) throw new Error("WCL API credentials are not configured");
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await this.request("https://www.warcraftlogs.com/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`WCL OAuth request failed with HTTP ${response.status}`);
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token || !payload.expires_in) throw new Error("WCL OAuth response is missing an access token");
    this.cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
    return payload.access_token;
  }
}
