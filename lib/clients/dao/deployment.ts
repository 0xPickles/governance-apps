import type { Address } from "viem";
import { z } from "@/lib/schemas/zod";
import { DaoAddressSchema, DaoUintSchema, DAO_MAX_TIMESTAMP, DaoFeedError, type DaoFeedWire } from "@/lib/schemas/dao-feed";

// The shared protocol RPC and explorer surfaces currently support mainnet only.
export const DAO_SUPPORTED_CHAIN_ID = 1;
const deploymentSchema = z.strictObject({
  chainId: z.literal(DAO_SUPPORTED_CHAIN_ID),
  votingAddress: DaoAddressSchema,
  deploymentBlock: DaoUintSchema,
  genesis: z.number().int().min(0).max(DAO_MAX_TIMESTAMP),
  active: z.boolean(),
  // App/operator-reviewed implementation allowlists; never supplied by a feed.
  supportedVoters: z.array(DaoAddressSchema).max(8),
  supportedExecutors: z.array(DaoAddressSchema).max(8),
});
export type DaoDeployment = Omit<z.infer<typeof deploymentSchema>, "votingAddress" | "supportedVoters" | "supportedExecutors"> & {
  votingAddress: Address;
  supportedVoters: Address[];
  supportedExecutors: Address[];
};

export function parseDaoDeployments(value: string | undefined): DaoDeployment[] {
  if (!value) return [];
  const deployments = z.array(deploymentSchema).max(8).parse(JSON.parse(value));
  if (new Set(deployments.map((d) => d.chainId)).size > 1 ||
      new Set(deployments.map((d) => d.votingAddress)).size !== deployments.length ||
      deployments.filter((d) => d.active).length > 1) {
    throw new DaoFeedError("incompatible", "DAO deployment configuration is ambiguous.");
  }
  return deployments as DaoDeployment[];
}

export function getDaoDeployments(): DaoDeployment[] {
  // Empty until actual deployments have been verified and reviewed. Test
  // configuration is injected by callers or by the saved-response E2E server.
  return parseDaoDeployments(process.env.NEXT_PUBLIC_DAO_DEPLOYMENTS);
}

export function daoDeploymentScope(deployments: readonly DaoDeployment[]): string {
  return JSON.stringify(["yearn.dao.feed.v2", deployments]);
}

export function assertDaoDeployments(feed: DaoFeedWire, trusted: readonly DaoDeployment[]): void {
  if (trusted.length === 0 || trusted.length !== feed.deployments.length ||
      trusted.some((d) => d.chainId !== DAO_SUPPORTED_CHAIN_ID || d.chainId !== feed.chainId ||
        !feed.deployments.some((entry) => entry.votingAddress === d.votingAddress))) {
    throw new DaoFeedError("incompatible", "DAO feed does not match the configured chain and Voting deployments.");
  }
  for (const p of feed.proposals) {
    const deployment = trusted.find((d) => d.votingAddress === p.votingAddress)!;
    if (p.events.some((e) => BigInt(e.log.blockNumber) < BigInt(deployment.deploymentBlock))) {
      throw new DaoFeedError("invalid", "Proposal event precedes deployment.");
    }
  }
}
