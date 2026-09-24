// lib/tx/useTx.ts
"use client";

import { useCallback, useState } from "react";
import type {
  PreparedTransaction,
  TransactionHash,
  TxErrorType,
  TxState,
} from "./types";
import { waitForTransactionReceipt } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { toast } from "@/components/ui/Toast";
import { normalizeTxError } from "./errors";
import { useProtocol } from "@/state/protocol";
import { isSimulationTransportFallbackEnabled } from "@/lib/runtime/features";

type TxExecuteOptions = {
  onSubmitted?: (hash: TransactionHash) => void | Promise<void>;
  waitForReceipt?: (hash: TransactionHash) => Promise<void | TransactionHash>;
  onSuccess?: (hash: TransactionHash) => void | Promise<void>;
  onError?: (error: unknown, hash?: TransactionHash) => void | Promise<void>;
  invalidate?: () => void | Promise<void>;
  skipWaitForReceipt?: boolean;
  retries?: number;
  retryDelayMs?: number;
  submittedMessage?: string;
};

const initialState: TxState = {
  status: "idle",
};

function mapNormalizedCode(code: string): TxErrorType {
  switch (code) {
    case "user_rejected":
      return "user_rejected";
    case "cooldown_not_ready":
      return "cooldown_not_ready";
    case "cap_exceeded":
      return "cap_exceeded";
    case "insufficient_balance":
      return "insufficient_balance";
    case "network":
      return "network";
    case "revert":
      return "revert";
    default:
      return "unknown";
  }
}

export function useTx() {
  const [state, setState] = useState<TxState>(initialState);
  const { publicClient } = useProtocol();
  const txTransportFallbackEnabled = isSimulationTransportFallbackEnabled();

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const execute = useCallback(
    async (prepared: PreparedTransaction, options?: TxExecuteOptions) => {
      if (!prepared) return;

      let hash: TransactionHash | undefined;
      const toastId = toast.loading("Check your wallet...");
      const maxRetries = Math.max(0, options?.retries ?? 0);
      const retryDelay = Math.max(0, options?.retryDelayMs ?? 750);
      let attempt = 0;

      const attemptExecute = async () => {
        try {
          setState({
            status: "signing",
          });

          hash = await prepared();

          setState({
            status: "submitted",
            hash,
          });

          await options?.onSubmitted?.(hash);

          if (options?.skipWaitForReceipt) {
            toast.success(
              options.submittedMessage ?? "Transaction submitted (Mock)",
              { id: toastId }
            );
          } else {
            toast.loading("Transaction submitted. Waiting...", { id: toastId });
            setState({
              status: "mining",
              hash,
            });

            if (options?.waitForReceipt) {
              hash = (await options.waitForReceipt(hash)) ?? hash;
            } else if (publicClient) {
              try {
                await publicClient.waitForTransactionReceipt({ hash });
              } catch (waitError) {
                const normalizedWaitError = normalizeTxError(waitError);
                if (!(txTransportFallbackEnabled && normalizedWaitError.code === "network")) {
                  throw waitError;
                }
                console.warn(
                  "[tx] Wallet RPC receipt wait failed; falling back to configured app RPC.",
                  waitError
                );
                await waitForTransactionReceipt(wagmiConfig, { hash });
              }
            } else {
              await waitForTransactionReceipt(wagmiConfig, { hash });
            }
            toast.success("Transaction confirmed!", { id: toastId });
          }

          if (options?.invalidate) {
            await options.invalidate();
          }

          setState({
            status: "success",
            hash,
          });

          if (options?.onSuccess) {
            await options.onSuccess(hash);
          }
        } catch (error: unknown) {
          const normalized = normalizeTxError(error);
          const errorType = mapNormalizedCode(normalized.code);

          // Retry once for network errors if configured
          if (!hash && normalized.code === "network" && attempt < maxRetries) {
            attempt += 1;
            await new Promise((r) => setTimeout(r, retryDelay));
            return attemptExecute();
          }

          const errorMessage = normalized.message || "Transaction failed";

          if (errorType === "user_rejected") {
            toast.dismiss(toastId);
          } else {
            toast.error(errorMessage, { id: toastId });
          }

          setState({
            status: "error",
            hash,
            errorType,
            errorMessage,
          });

          if (options?.onError) {
            await options.onError(error, hash);
          }
        }
      };

      await attemptExecute();
    },
    [publicClient, txTransportFallbackEnabled]
  );

  return {
    state,
    status: state.status,
    execute,
    reset,
  };
}
