import { describe, expect, it } from "vitest";
import fork from "@/docs/apps/dao/delivery/evidence/m5-live/fork-execution.json";
import producer from "@/docs/apps/dao/delivery/evidence/m5-live/producer-created.json";
import deployment from "@/docs/apps/dao/delivery/evidence/m5-live/local-deployments.json";
import { parseDaoFeed } from "@/lib/schemas/dao-feed";
import { parseDaoDeployments } from "@/lib/clients/dao/deployment";
import { adaptDaoFeed } from "@/lib/clients/dao/feed-adapter";
describe("retained actual DAO evidence", () => {
  it("accepts the released producer's local acquisition, including ID zero and exact Propose identity", () => {
    const wire = parseDaoFeed(producer);
    const snapshot = adaptDaoFeed(wire, parseDaoDeployments(JSON.stringify(deployment)));
    expect(snapshot.proposals).toHaveLength(1);
    expect(snapshot.proposals[0].ref.proposalId).toBe(0n);
    expect(snapshot.proposals[0].events[0].log.transactionHash).toBe(producer.proposals[0].events[0].log.transactionHash);
    expect(snapshot.proposals[0].script.bytes).toBe(producer.proposals[0].scriptBytes);
    expect(snapshot.proposals[0].content.state).toBe("unavailable");
  });
  it("accepts the separately constructed receipt-backed fork execution fixture", () => {
    const snapshot = adaptDaoFeed(parseDaoFeed(fork), parseDaoDeployments(JSON.stringify(deployment)));
    expect(snapshot.proposals[0].protocolStatus).toBe("executed");
    expect(snapshot.proposals[0].events.map(e => e.type)).toEqual(["propose", "vote", "execute"]);
    expect(snapshot.proposals[0].content.state).toBe("available");
  });
});
