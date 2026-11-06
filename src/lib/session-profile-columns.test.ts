import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_PROFILE_FIELDS } from "./profile-requirements";

// The dashboard gate (getMySession) must read every required profile field,
// otherwise a finished business is sent back to setup forever.
describe("session profile gate", () => {
  const src = readFileSync(new URL("./session.functions.ts", import.meta.url), "utf8");
  const select = src.match(/from\("accounts"\)\.select\("([^"]+)"\)/)?.[1] ?? "";
  const cols = select.split(",");
  for (const field of REQUIRED_PROFILE_FIELDS) {
    it(`reads ${field}`, () => expect(cols).toContain(field));
  }
});
