"use client";
import { useDaoAuthoringServices } from "@/lib/hooks/useDaoAuthoring";
import { DaoProposalAuthoringForm } from "./DaoProposalAuthoringForm";
import type { Address } from "viem";
import type { DaoProposerState } from "@/lib/clients/dao/types";
export function LiveDaoProposalAuthoringForm(props: { address: Address; proposer: DaoProposerState; hostname?: string; now: number }) {
  const { services, recovery, recoveryKey } = useDaoAuthoringServices(props.address, props.proposer);
  return <DaoProposalAuthoringForm key={recoveryKey} {...props} services={services} recovery={recovery} />;
}
