import { rosterUpdateSchema, signupSchema } from "@ttz/contracts";
import { describe, expect, it } from "vitest";

describe("activity request rules", () => {
  it("rejects duplicate alternative character/spec choices", () => {
    const result = signupSchema.safeParse({
      characterId: "1",
      choices: [
        { characterId: "2", specId: 3 },
        { characterId: "2", specId: 3 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate signup in the final roster", () => {
    const entry = {
      signupId: "9",
      status: "CONFIRMED",
      characterId: "2",
      orderIndex: 0,
    } as const;
    const result = rosterUpdateSchema.safeParse({ version: 1, entries: [entry, entry] });
    expect(result.success).toBe(false);
  });
});
