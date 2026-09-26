import { afterEach, describe, expect, it } from "vitest";

import { sealModelKey } from "../../../../web/lib/models/model-key";
import { endpointFromSavedModelRow } from "./graph-extract";

const SECRET_KEYS = ["WORKSPACE_MODEL_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"] as const;

describe("endpointFromSavedModelRow", () => {
  const previous = Object.fromEntries(SECRET_KEYS.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of SECRET_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns undefined when the saved key is missing", () => {
    expect(
      endpointFromSavedModelRow({
        model_id: "openai/gpt-oss-20b",
        api_key: "  ",
        base_url: "https://example.test/v1",
      }),
    ).toBeUndefined();
  });

  it("decrypts a sealed key before building the endpoint", () => {
    process.env.WORKSPACE_MODEL_SECRET = "unit-test-secret";
    const endpoint = endpointFromSavedModelRow({
      model_id: "openai/gpt-oss-20b",
      api_key: sealModelKey("workspace-key"),
      base_url: "https://example.test/v1",
    });
    expect(endpoint?.apiKey).toBe("workspace-key");
    expect(endpoint?.baseURL).toBe("https://example.test/v1");
  });

  it("returns undefined when the sealed key cannot be decrypted", () => {
    delete process.env.WORKSPACE_MODEL_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(
      endpointFromSavedModelRow({
        model_id: "openai/gpt-oss-20b",
        api_key: "enc1:not-valid",
        base_url: "https://example.test/v1",
      }),
    ).toBeUndefined();
  });
});
