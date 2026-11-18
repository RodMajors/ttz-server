import { describe, expect, it } from "vitest";
import { assetUrl } from "./asset-url";

describe("assetUrl", () => {
  it("converts a stored BLP object key to a public PNG URL", () => {
    const previous = process.env.ASSET_BASE_URL;
    process.env.ASSET_BASE_URL = "https://cdn.example.com/assets/";

    expect(assetUrl("Interface/ICONS/Ability_Warrior_SavageBlow.blp")).toBe(
      "https://cdn.example.com/assets/Interface/ICONS/Ability_Warrior_SavageBlow.png",
    );

    if (previous === undefined) delete process.env.ASSET_BASE_URL;
    else process.env.ASSET_BASE_URL = previous;
  });

  it("returns null when public asset hosting is not configured", () => {
    const previous = process.env.ASSET_BASE_URL;
    delete process.env.ASSET_BASE_URL;
    expect(assetUrl("Interface/ICONS/test.blp")).toBeNull();
    if (previous !== undefined) process.env.ASSET_BASE_URL = previous;
  });
});
