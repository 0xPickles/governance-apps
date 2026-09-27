import { describe, expect, it } from "vitest";
import { assertAlertCatalogueIntroductionHtml } from "@/workers/alerts-bot/src/catalogue-renderer";
import {
  PRODUCT_ALERT_INTRODUCTIONS,
  assertProductAlertIntroductionHtml,
} from "@/workers/alerts-bot/src/product-renderer";
import {
  ALERT_CATALOGUE_CANONICAL_FIXTURES,
  renderAlertCatalogueFixture,
} from "./alerts-bot.catalogue-fixtures";
import {
  PRODUCT_ALERT_CATALOGUE_FIXTURES,
  renderProductAlertFixture,
} from "./alerts-bot.product-catalogue-fixtures";

const EXPECTED_TEMPLATES = [
  "S1", "S2", "S3",
  "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V11", "V12",
  "Y1", "Y2", "Y3", "Y4", "Y5", "Y6", "Y7", "Y8", "Y9",
  "I-styfi", "I-veyfi", "I-yeth",
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15", "T16",
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "B14",
  "I-teams", "I-ybc",
] as const;

describe("approved alert catalogue", () => {
  it("contains every action template and five channel introductions", () => {
    expect(() => assertAlertCatalogueIntroductionHtml()).not.toThrow();
    expect(() => assertProductAlertIntroductionHtml()).not.toThrow();
    expect([
      ...ALERT_CATALOGUE_CANONICAL_FIXTURES.map(({ template }) => template),
      ...PRODUCT_ALERT_CATALOGUE_FIXTURES.map(({ template }) => template),
      "I-teams",
      "I-ybc",
    ])
      .toEqual(EXPECTED_TEMPLATES);
  });

  for (const fixture of ALERT_CATALOGUE_CANONICAL_FIXTURES) {
    it(`${fixture.template} ${fixture.id}`, () => {
      const actual = renderAlertCatalogueFixture(fixture);
      if (process.env.ALERTS_PRINT_GOLDENS === "1") {
        console.log(`\n===== ${fixture.template} · ${fixture.id} =====\n${actual}`);
      }
      expect(actual).toBe(fixture.expectedHtml);
      expect(actual.length).toBeLessThanOrEqual(4_096);
      expect(actual).not.toMatch(/Shrimp|Fish|Dolphin|Shark|Impact basis/);
    });
  }

  for (const fixture of PRODUCT_ALERT_CATALOGUE_FIXTURES) {
    it(`${fixture.template} ${fixture.kind}`, () => {
      const actual = renderProductAlertFixture(fixture);
      if (process.env.ALERTS_PRINT_GOLDENS === "1") {
        console.log(`\n===== ${fixture.template} · ${fixture.kind} =====\n${actual}`);
      }
      expect(actual).toMatchSnapshot();
      expect(actual.length).toBeLessThanOrEqual(4_096);
      expect(actual).not.toContain("Snapshot");
    });
  }

  it("I-teams and I-ybc introductions", () => {
    expect(PRODUCT_ALERT_INTRODUCTIONS).toMatchSnapshot();
  });
});
