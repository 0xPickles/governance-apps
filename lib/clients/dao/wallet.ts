import { getAccount, getConnectorClient, getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/web3/wagmi";
import { daoRpcFromPublicClient } from "./onchain";
import type { DaoWalletContext } from "./writes";

/** Resolve the connected provider again for each check; never use feed RPC URLs. */
export async function getDaoWalletContext(): Promise<DaoWalletContext> {
  const publicClient = getPublicClient(wagmiConfig, { chainId: 1 });
  if (!publicClient) throw new Error("DAO RPC is unavailable.");
  const readWallet = async () => {
    const account = getAccount(wagmiConfig);
    if (!account.isConnected || !account.address) throw new Error("Connect a wallet to continue.");
    const connector = await getConnectorClient(wagmiConfig);
    const [chainId, addresses] = await Promise.all([
      connector.request({ method: "eth_chainId" }),
      connector.request({ method: "eth_accounts" }),
    ]);
    if (addresses[0]?.toLowerCase() !== account.address.toLowerCase()) throw new Error("Wallet account changed. Review the action again.");
    return { address: account.address, chainId: Number(BigInt(chainId)) };
  };
  const wallet = await readWallet();
  return {
    rpc: daoRpcFromPublicClient(publicClient), walletChainId: wallet.chainId,
    getWallet: readWallet,
    send: async (call) => {
      const current = await readWallet();
      if (current.address.toLowerCase() !== call.from.toLowerCase() || current.chainId !== call.chainId) {
        throw new Error("Wallet account or network changed. Review the action again.");
      }
      const connector = await getConnectorClient(wagmiConfig);
      // Explicit from/to/data/chain are the exact simulated action.
      return connector.request({ method: "eth_sendTransaction", params: [{
        from: call.from, to: call.to, data: call.data, value: "0x0",
        chainId: "0x" + call.chainId.toString(16),
      }] });
    },
  };
}
