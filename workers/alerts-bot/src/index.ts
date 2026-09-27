/// <reference types="@cloudflare/workers-types" />

import {
  isAuthorizedStatusRequest,
  type AlertsEnv,
} from "./config";
import {
  ACTIVE_ALERT_DOMAIN_REGISTRATIONS,
  ALERT_DOMAIN_OBJECT_NAMES,
} from "./domain-registry";
import { activeDomainConfigs, AlertState } from "./runtime";

interface AlertsExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

async function runEnabledDomains(env: AlertsEnv): Promise<void> {
  const enabled = activeDomainConfigs(env);
  const outcomes = await Promise.allSettled(
    enabled.map(async ({ domainId }) => {
      const objectName = ALERT_DOMAIN_OBJECT_NAMES[domainId];
      const stub = env.ALERT_STATE.get(env.ALERT_STATE.idFromName(objectName));
      const response = await stub.fetch(
        `https://alerts.internal/run?domain=${domainId}`,
        { method: "POST" },
      );
      if (!response.ok && response.status !== 202) {
        throw new Error(`alert_domain_run_failed:${domainId}`);
      }
    }),
  );
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      console.error(JSON.stringify({
        event: "alert_dispatch_failed",
        domain: enabled[index]?.domainId ?? "unknown",
      }));
    }
  });
}

async function readStatuses(env: AlertsEnv): Promise<Response> {
  const statuses = await Promise.all(
    ACTIVE_ALERT_DOMAIN_REGISTRATIONS.map(async ({ id }) => {
      try {
        const stub = env.ALERT_STATE.get(
          env.ALERT_STATE.idFromName(ALERT_DOMAIN_OBJECT_NAMES[id]),
        );
        const response = await stub.fetch(
          `https://alerts.internal/status?domain=${id}`,
        );
        if (!response.ok) return { domain: id, status: "unavailable" };
        return response.json();
      } catch {
        return { domain: id, status: "unavailable" };
      }
    }),
  );
  return Response.json({ domains: statuses });
}

const worker = {
  async fetch(request: Request, env: AlertsEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/status") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!isAuthorizedStatusRequest(request, env)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return readStatuses(env);
  },

  scheduled(
    _controller: ScheduledController,
    env: AlertsEnv,
    context: AlertsExecutionContext,
  ): void {
    context.waitUntil(runEnabledDomains(env));
  },
};

export default worker;
export { AlertState };
