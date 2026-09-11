import type { Address, Hex } from "viem";
/** Authorization metadata is separate from canonical proposal bytes. */
export function daoPublicationMessage(input: { origin: string; uploader: Address; digest: Hex; bytes: number; issuedAt: number }) {
  return ["Yearn DAO content publication", "Origin: " + input.origin, "Uploader: " + input.uploader.toLowerCase(),
    "SHA-256: " + input.digest, "Bytes: " + input.bytes, "Issued at: " + input.issuedAt].join("\n");
}
