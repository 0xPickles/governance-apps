import { describe, expect, it } from "vitest";
import { acceptanceLimits, confirmationAnswer } from "@/scripts/dao-pinata-acceptance.mjs";
describe("bounded operator acceptance controls", () => {
  it("rejects empty and ambiguous confirmations", () => {
    for (const answer of ["", "y", "YES", " yes ", "nope"]) expect(confirmationAnswer(answer)).toBeNull();
    expect(confirmationAnswer("yes")).toBe(true); expect(confirmationAnswer("no")).toBe(false);
  });
  it("fits the three-document, four-upload session without broadening concurrency", () => {
    expect(acceptanceLimits).toMatchObject({ documents: 3, bytes: 3 * 131072, uploadAttempts: 4, concurrent: 2 });
  });
});
