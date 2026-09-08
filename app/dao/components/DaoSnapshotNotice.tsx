"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { UtcTime } from "@/components/ui/UtcTime";
import { DAO_FEED_STALE_SECONDS } from "@/lib/clients/dao/feed";
import type { DaoSnapshot } from "@/lib/clients/dao/types";
import { daoCopy } from "../messages";

export function DaoSnapshotNotice({ snapshot, error, onRetry }: {
  snapshot: DaoSnapshot | undefined; error: Error | null; onRetry: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Math.floor(Date.now() / 1000));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, []);
  const age = snapshot && now !== null ? Math.max(0, now - snapshot.canonicalBlock.timestamp) : null;
  const stale = age !== null && age > DAO_FEED_STALE_SECONDS;
  return (
    <div className="min-w-0 space-y-2 rounded-box bg-surface-secondary/60 p-4 text-sm" role={error ? "alert" : "status"}>
      {snapshot ? <p className="font-number tabular-nums">
        {daoCopy.feed.snapshot} <UtcTime timestamp={snapshot.canonicalBlock.timestamp} />
        {age !== null ? " · " + daoCopy.feed.age(Math.floor(age / 60)) : ""}
      </p> : null}
      {snapshot ? <p className="text-text-secondary">{daoCopy.feed.snapshotTiming}</p> : null}
      {stale ? <p>{daoCopy.feed.stale}</p> : null}
      {error ? <p className="break-words [overflow-wrap:anywhere]">
        {snapshot ? daoCopy.feed.lastGood + " " : ""}{error.message}
      </p> : null}
      {(error || stale) ? <Button variant="secondary" size="sm" onClick={onRetry}>{daoCopy.board.retry}</Button> : null}
      <p className="text-text-secondary">{daoCopy.feed.trust}</p>
    </div>
  );
}
