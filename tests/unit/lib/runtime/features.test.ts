import { describe, expect, it } from "vitest";
import {
  isDaoEnabled,
  isDaoMockRuntimeEnabled,
  isDaoReviewControlsEnabled,
  isDebugUiEnabled,
  isProductionRuntime,
  isTeamsEnabled,
  isSimulationTransportFallbackEnabled,
  isYbcEnabled,
  isYethEnabled,
} from "@/lib/runtime/features";

describe("runtime feature flags", () => {
  it("treats non-production runtimes as enabled for gated app surfaces", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "development",
      NEXT_PUBLIC_ENABLE_TEAMS: "false",
      NEXT_PUBLIC_ENABLE_DAO: "false",
      NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: "false",
      NEXT_PUBLIC_ENABLE_YBC: "false",
      NEXT_PUBLIC_ENABLE_YETH: "false",
      NEXT_PUBLIC_ENABLE_DEBUG_UI: "false",
    };

    expect(isProductionRuntime(env)).toBe(false);
    expect(isDaoEnabled(env)).toBe(true);
    expect(isTeamsEnabled(env)).toBe(true);
    expect(isYbcEnabled(env)).toBe(true);
    expect(isYethEnabled(env)).toBe(true);
    expect(isDebugUiEnabled(env)).toBe(true);
  });

  it("disables gated app surfaces by default in production", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "production",
      NEXT_PUBLIC_ENABLE_TEAMS: "false",
      NEXT_PUBLIC_ENABLE_DAO: "false",
      NEXT_PUBLIC_ENABLE_YBC: "false",
      NEXT_PUBLIC_ENABLE_YETH: "false",
      NEXT_PUBLIC_ENABLE_DEBUG_UI: "false",
    };

    expect(isProductionRuntime(env)).toBe(true);
    expect(isDaoEnabled(env)).toBe(false);
    expect(isDaoMockRuntimeEnabled(env)).toBe(false);
    expect(isDaoReviewControlsEnabled(env)).toBe(false);
    expect(isTeamsEnabled(env)).toBe(false);
    expect(isYbcEnabled(env)).toBe(false);
    expect(isYethEnabled(env)).toBe(false);
    expect(isDebugUiEnabled(env)).toBe(false);
  });

  it("allows explicit opt-in for gated app surfaces in production", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "production",
      NEXT_PUBLIC_ENABLE_TEAMS: "true",
      NEXT_PUBLIC_ENABLE_DAO: "true",
      NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: "true",
      NEXT_PUBLIC_ENABLE_YBC: "true",
      NEXT_PUBLIC_ENABLE_YETH: "true",
      NEXT_PUBLIC_ENABLE_DEBUG_UI: "true",
    };

    expect(isTeamsEnabled(env)).toBe(true);
    expect(isDaoEnabled(env)).toBe(true);
    expect(isDaoMockRuntimeEnabled(env)).toBe(false);
    expect(isDaoReviewControlsEnabled(env)).toBe(false);
    expect(isYbcEnabled(env)).toBe(true);
    expect(isYethEnabled(env)).toBe(true);
    expect(isDebugUiEnabled(env)).toBe(true);
  });

  it("does not expose DAO review controls when the DAO route is disabled", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "production",
      NEXT_PUBLIC_ENABLE_DAO: "false",
      NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: "true",
      NEXT_PUBLIC_ENABLE_DEBUG_UI: "false",
    };

    expect(isDaoReviewControlsEnabled(env)).toBe(false);
  });

  it("treats preview mode as non-production for feature gates", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "preview",
      NODE_ENV: "production",
      NEXT_PUBLIC_ENABLE_TEAMS: "false",
      NEXT_PUBLIC_ENABLE_YBC: "false",
      NEXT_PUBLIC_ENABLE_YETH: "false",
      NEXT_PUBLIC_ENABLE_DEBUG_UI: "false",
    };

    expect(isProductionRuntime(env)).toBe(false);
    expect(isDaoEnabled(env)).toBe(true);
    expect(isTeamsEnabled(env)).toBe(true);
    expect(isYbcEnabled(env)).toBe(true);
    expect(isYethEnabled(env)).toBe(true);
    expect(isDebugUiEnabled(env)).toBe(true);
  });

  it("keeps simulation transport fallback disabled by default", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "preview",
      NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: "false",
    };

    expect(isSimulationTransportFallbackEnabled(env)).toBe(false);
  });

  it("enables simulation transport fallback only when explicitly set", () => {
    const env = {
      NEXT_PUBLIC_RUNTIME_MODE: "preview",
      NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: "true",
    };

    expect(isSimulationTransportFallbackEnabled(env)).toBe(true);
  });
});
