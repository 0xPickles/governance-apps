import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DaoProposalAuthoringForm } from "@/app/dao/propose/DaoProposalAuthoringForm";
import { deriveDaoProposerState, getDaoMockFixture } from "@/lib/clients/dao";
import { recoveredReview, recoveredTopic } from "@/tests/fixtures/dao-pinata-recovery";
import { daoAuthoringStorageKey, readDaoAuthoringRecovery, saveDaoAuthoringRecovery } from "@/lib/clients/dao/authoring-recovery";
import type { DaoAuthoringServices } from "@/lib/clients/dao/authoring-services";
import { daoProposeCopy } from "@/app/dao/propose/messages";

const b = recoveredReview();
const proposer = { ...deriveDaoProposerState(getDaoMockFixture("discussion").proposer), address: b.address };
const key = daoAuthoringStorageKey("test-deployment", b.address);
function services(): DaoAuthoringServices {
  return {
    retainReview: vi.fn(review => review ? saveDaoAuthoringRecovery(key, review) : true),
    validateForum: vi.fn(async () => ({ state: "valid" as const, topic: recoveredTopic })),
    publish: vi.fn(async () => ({ state: "failed" as const, error: { code: "PUBLICATION_FAILED" as const, message: "Offline rejected key" } })),
    submit: vi.fn(), confirm: vi.fn(), register: vi.fn(), index: vi.fn(),
  };
}
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });

it("imports exact B as unpublished, retains identical repeated downloads, and restores a failed review at a later clock", async () => {
  const user = userEvent.setup(), api = services();
  const first = render(<DaoProposalAuthoringForm address={b.address} proposer={proposer} now={1789750800} services={api} />);
  // jsdom's File omits arrayBuffer; supply the browser File method with the original bytes.
  const file = new File([b.bytes], "B.json", { type: "application/json" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => b.bytes.buffer });
  fireEvent.change(screen.getByLabelText("Restore exact content file"), { target: { files: [file] } });
  await screen.findByText(daoProposeCopy.recovery.unpublished);
  expect(api.publish).not.toHaveBeenCalled(); expect(api.submit).not.toHaveBeenCalled();
  expect(readDaoAuthoringRecovery(key, b.address)?.review.content.createdAt).toBe(b.review.content.createdAt);
  expect(screen.queryByRole("button", { name: "Create onchain proposal" })).toBeNull();
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { blobs.push(blob as Blob); return "blob:review"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Download exact content" }));
  await user.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
  await user.click(screen.getByRole("button", { name: "Publish immutable content" }));
  await screen.findAllByText("Offline rejected key");
  first.unmount();
  const recovery = readDaoAuthoringRecovery(key, b.address);
  render(<DaoProposalAuthoringForm address={b.address} proposer={proposer} now={1789950800} services={api} recovery={recovery} />);
  expect(screen.getByRole("checkbox", { name: /I reviewed/ })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Download exact content" }));
  // FileReader supports jsdom Blob, unlike its optional arrayBuffer method.
  const read = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.readAsText(blob); });
  expect(await Promise.all(blobs.map(read))).toEqual([new TextDecoder().decode(b.bytes), new TextDecoder().decode(b.bytes)]);
  await user.click(screen.getByRole("checkbox", { name: /I reviewed/ }));
  await user.click(screen.getByRole("button", { name: "Publish immutable content" }));
  expect(vi.mocked(api.publish).mock.calls.map(call => call[0].content)).toEqual([b.review.content, b.review.content]);
  expect(api.submit).not.toHaveBeenCalled();
});

it("keeps an imported review downloadable if browser storage refuses the write", async () => {
  const api = services(); api.retainReview = vi.fn(() => false);
  render(<DaoProposalAuthoringForm address={b.address} proposer={proposer} now={1789750800} services={api} />);
  const file = new File([b.bytes], "B.json");
  Object.defineProperty(file, "arrayBuffer", { value: async () => b.bytes.buffer });
  fireEvent.change(screen.getByLabelText("Restore exact content file"), { target: { files: [file] } });
  await screen.findByText(daoProposeCopy.recovery.storageUnavailable);
  expect(screen.getByRole("button", { name: "Download exact content" })).toBeEnabled();
  expect(api.publish).not.toHaveBeenCalled();
});

it("rejects a noncanonical import without a forum request or publication", async () => {
  const api = services();
  render(<DaoProposalAuthoringForm address={b.address} proposer={proposer} now={1789750800} services={api} />);
  const file = new File(["{}"], "B.json");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("{}").buffer });
  fireEvent.change(screen.getByLabelText("Restore exact content file"), { target: { files: [file] } });
  await screen.findByText(daoProposeCopy.recovery.invalid);
  expect(api.validateForum).not.toHaveBeenCalled(); expect(api.publish).not.toHaveBeenCalled();
});
