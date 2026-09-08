import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockControls } from "@/app/dao/components/MockControls";
import {
  DAO_MOCK_NOW,
  getDaoMockSnapshot,
  resetDaoMockStore,
} from "@/lib/clients/dao";
import { daoKeys } from "@/lib/hooks/daoKeys";
import { setFixedNow } from "@/lib/mocks/time";

const { disconnectAsync, useHostnameMock } = vi.hoisted(() => ({
  disconnectAsync: vi.fn(),
  useHostnameMock: vi.fn(() => "localhost"),
}));

vi.mock("wagmi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wagmi")>();
  return {
    ...actual,
    useDisconnect: () => ({ disconnectAsync }),
  };
});

vi.mock("@/lib/hooks/useHostname", () => ({
  useHostname: useHostnameMock,
}));

describe("DAO MockControls", () => {
  const originalRuntimeMode = process.env.NEXT_PUBLIC_RUNTIME_MODE;
  const originalDaoFlag = process.env.NEXT_PUBLIC_ENABLE_DAO;
  const originalDaoReviewControlsFlag =
    process.env.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS;
  const originalDebugFlag = process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "development";
    setFixedNow(DAO_MOCK_NOW);
    resetDaoMockStore();
    vi.clearAllMocks();
    useHostnameMock.mockReturnValue("localhost");
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = originalRuntimeMode;
    process.env.NEXT_PUBLIC_ENABLE_DAO = originalDaoFlag;
    process.env.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS =
      originalDaoReviewControlsFlag;
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI = originalDebugFlag;
    setFixedNow(null);
  });

  it("mounts every required control group inside the shared floating shell", () => {
    renderControls(new QueryClient());

    fireEvent.click(screen.getByRole("button", { name: /debug/i }));

    for (const group of [
      "Route state",
      "Fixture",
      "Persona and roles",
      "Content",
      "Lifecycle",
      "Veto",
      "Script",
      "Account",
      "Execution",
      "Authoring",
      "Proposer eligibility",
    ]) {
      expect(screen.getByText(group, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByRole("combobox", { name: "DAO fixture" })).toHaveValue(
      "voting"
    );
    expect(
      screen.getByRole("link", { name: "Open selected proposal" })
    ).toHaveAttribute("href", "/dao/proposals/2?from=active");
  });

  it("mutates live DAO facts and invalidates the DAO query root", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    renderControls(queryClient);

    fireEvent.click(screen.getByRole("button", { name: /debug/i }));
    fireEvent.click(screen.getByText("Content", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Unavailable" }));

    await waitFor(() => {
      expect(
        getDaoMockSnapshot().feed.proposals.find(
          (proposal) => proposal.ref.proposalId === 2n
        )?.content.state
      ).toBe("unavailable");
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: daoKeys.all,
      refetchType: "all",
    });
  });

  it("syncs the DAO clock before invalidating on shared time travel", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    renderControls(queryClient);

    fireEvent.click(screen.getByRole("button", { name: /debug/i }));
    fireEvent.click(screen.getByRole("button", { name: "+1 Day" }));

    await waitFor(() => {
      expect(getDaoMockSnapshot().now).toBe(DAO_MOCK_NOW + 86_400);
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: daoKeys.all,
      refetchType: "all",
    });
  });

  it("does not expose DAO mock controls in production runtime", () => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
    process.env.NEXT_PUBLIC_ENABLE_DAO = "true";
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI = "false";
    renderControls(new QueryClient());

    expect(screen.queryByRole("button", { name: /debug/i })).not.toBeInTheDocument();
  });

  it("excludes mock controls from the production beta host", () => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
    process.env.NEXT_PUBLIC_ENABLE_DAO = "true";
    process.env.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS = "true";
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI = "false";
    useHostnameMock.mockReturnValue("dao-beta.dao-ops.com");

    renderControls(new QueryClient());

    expect(screen.queryByRole("button", { name: /debug/i })).not.toBeInTheDocument();
  });

  it("does not expose DAO-only review controls on another preprod host", () => {
    process.env.NEXT_PUBLIC_RUNTIME_MODE = "production";
    process.env.NEXT_PUBLIC_ENABLE_DAO = "true";
    process.env.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS = "true";
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI = "false";
    useHostnameMock.mockReturnValue("styfi-beta.dao-ops.com");

    renderControls(new QueryClient());

    expect(screen.queryByRole("button", { name: /debug/i })).not.toBeInTheDocument();
  });
});

function renderControls(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MockControls />
    </QueryClientProvider>
  );
}
