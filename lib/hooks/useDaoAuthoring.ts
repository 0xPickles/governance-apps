"use client";
import { useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useTx } from "@/lib/tx/useTx";
import { getDaoRouteClient } from "./useDao";
import { getDaoDeployments, daoDeploymentScope } from "@/lib/clients/dao/deployment";
import { deriveDaoProposalContentIdentity } from "@/lib/clients/dao/content";
import { decodeDaoProposeReceipt } from "@/lib/clients/dao/receipt";
import { normalizeTxError } from "@/lib/tx/errors";
import { daoContentBase64, retrieveDaoPublishedContent } from "@/lib/clients/dao/publication";
import { readDaoContentBytes } from "@/lib/clients/dao/content-bytes";
import { daoProposeCall } from "@/lib/clients/dao/writes";
import { DaoTransactionRevertedError, waitForDaoReceipt } from "@/lib/clients/dao/live-receipt";
import { daoAuthoringStorageKey, readDaoAuthoringRecovery, saveDaoAuthoringRecovery, saveDaoPendingCreation } from "@/lib/clients/dao/authoring-recovery";
import type { DaoAuthoringServices } from "@/lib/clients/dao/authoring-services";
import type { DaoDecodedProposeIdentity, DaoProposerState } from "@/lib/clients/dao/types";
import type { DaoForumValidationResult } from "@/lib/clients/dao/authoring-types";

export function useDaoAuthoringServices(address: Address, proposer: DaoProposerState) {
  const tx = useTx();
  const submitting = useRef(false);
  const deployments = getDaoDeployments();
  const deployment = deployments.find(d => d.active);
  const key = daoAuthoringStorageKey(daoDeploymentScope(deployments), address);
  const [recovery] = useState(() => readDaoAuthoringRecovery(key, address));
  const [identities] = useState(() => new Map<string, DaoDecodedProposeIdentity>());
  const services: DaoAuthoringServices = {
    async validateForum(input) {
      try {
        const result = await fetch("/api/dao-forum?url=" + encodeURIComponent(input), { cache: "no-store", signal: AbortSignal.timeout(30_000) });
        if (!result.ok) throw new Error("Forum unavailable");
        return await result.json() as DaoForumValidationResult;
      } catch {
        return { state: "invalid", error: { code: "FORUM_UNAVAILABLE", message: "The forum could not be checked. Retry without changing your draft." } };
      }
    },
    async publish(review) {
      try {
        const identity = deriveDaoProposalContentIdentity(review.content);
        const response = await fetch("/api/dao-content", {
          method: "POST", headers: { "Content-Type": "application/octet-stream" },
          body: new Uint8Array(identity.bytes), signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error("Content publication failed. Retry the same content after checking the service.");
        const result = await response.json();
        if (result.digest !== identity.digest || result.cid !== identity.cid || !Number.isSafeInteger(result.publishedAt)) throw new Error("Publication returned a different content identity.");
        const retained = await retrieveDaoPublishedContent(identity.digest);
        if (readDaoContentBytes(daoContentBase64(retained), identity.digest).state !== "available") throw new Error("Published content could not be verified.");
        const publication = { fingerprint: identity.digest, cid: identity.cid, canonicalBytes: identity.bytes, publishedAt: result.publishedAt };
        saveDaoAuthoringRecovery(key, review, publication);
        return { state: "published", publication };
      } catch (error) {
        return { state: "failed", error: { code: "PUBLICATION_FAILED", message: error instanceof Error ? error.message : "Content publication failed." } };
      }
    },
    async submit({ review, publication, onSubmitted }) {
      if (submitting.current) return { state: "failed", error: { code: "NETWORK_ERROR", message: "A proposal submission is already in progress." } };
      let hash: Hex | null = null;
      let failure: unknown;
      const existing = readDaoAuthoringRecovery(key, address);
      if (existing?.transactionHash) return { state: "submitted", transactionHash: existing.transactionHash };
      submitting.current = true;
      await tx.execute(async () => {
        if (!deployment) throw new Error("No active trusted DAO deployment.");
        if (review.content.createdBy.toLowerCase() !== address.toLowerCase()) throw new Error("Wallet account changed. Review the proposal again.");
        const identity = deriveDaoProposalContentIdentity(review.content);
        if (identity.digest !== publication.fingerprint || identity.cid !== publication.cid) throw new Error("Published content changed.");
        await retrieveDaoPublishedContent(identity.digest);
        const client = getDaoRouteClient();
        if (!client.preparePropose) throw new Error("Live creation is unavailable.");
        const prepared = await client.preparePropose(address, identity.digest, review.scriptCheck.script as Hex, proposer.expectedVotingEpoch);
        return prepared();
      }, {
        onSubmitted: submitted => {
          hash = submitted;
          saveDaoAuthoringRecovery(key, review, publication, submitted, proposer.expectedVotingEpoch);
          onSubmitted?.(submitted);
        },
        waitForReceipt: async submitted => { await waitForDaoReceipt(submitted, deployment!.chainId, address, daoProposeCall(deployment!.chainId, address, deployment!.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex)); },
        onError: error => { failure = error; },
      });
      submitting.current = false;
      const error = normalizeTxError(failure);
      if (hash && error.code !== "revert") return { state: "submitted", transactionHash: hash };
      if (hash && error.code === "revert") saveDaoAuthoringRecovery(key, review, publication);
      return { state: "failed", error: {
        code: error.code === "user_rejected" ? "WALLET_REJECTED" : error.code === "revert" ? "PROPOSAL_REVERTED" : "NETWORK_ERROR",
        message: error.message,
      } };
    },
    async confirm(review, publication, hash, epoch) {
      if (!deployment) throw new Error("No trusted DAO deployment.");
      const stored = readDaoAuthoringRecovery(key, address);
      const receipt = await waitForDaoReceipt(hash, deployment.chainId, address, daoProposeCall(deployment.chainId, address, deployment.votingAddress, publication.fingerprint, review.scriptCheck.script as Hex)).catch(error => {
        if (error instanceof DaoTransactionRevertedError) saveDaoAuthoringRecovery(key, review, publication);
        throw error;
      });
      return { state: "confirmed", receipt, decoded: decodeDaoProposeReceipt(receipt, {
        chainId: deployment.chainId, votingAddress: deployment.votingAddress, transactionHash: hash,
        proposer: address, votingEpoch: stored?.expectedEpoch ?? epoch,
        contentDigest: publication.fingerprint, script: review.scriptCheck.script as Hex,
      }) };
    },
    async register(review, _publication, identity) {
      identities.set(identity.ref.proposalId.toString(), identity);
      saveDaoPendingCreation(identity, review.parsedContent.title ?? "Proposal");
    },
    async index(ref) {
      const identity = identities.get(ref.proposalId.toString());
      if (!identity) return null;
      const feed = await getDaoRouteClient().getFeed();
      const proposal = feed.proposals.find(p => p.ref.chainId === ref.chainId && p.ref.votingAddress === ref.votingAddress && p.ref.proposalId === ref.proposalId);
      if (!proposal || proposal.proposer.toLowerCase() !== identity.proposer.toLowerCase() ||
          proposal.content.digest !== identity.contentDigest || proposal.script.bytes !== identity.script ||
          proposal.votingEpoch !== identity.votingEpoch ||
          !proposal.events.some(event => event.type === "propose" && event.log.transactionHash === identity.log.transactionHash && event.log.blockHash === identity.log.blockHash && event.log.logIndex === identity.log.logIndex)) return null;
      const recovery = readDaoAuthoringRecovery(key, address);
      if (recovery?.transactionHash === identity.log.transactionHash) sessionStorage.removeItem(key);
      return proposal;
    },
  };
  return { services, recovery };
}
