/**
 * Ephemeral localStorage for oneTimeSalts between commit and reveal.
 * Key format: corevo:ots:{proposalId}:{voterAddress}
 */

const PREFIX = "corevo:ots";

export function storeOneTimeSalt(
  proposalId: bigint,
  voter: string,
  salt: string
): void {
  localStorage.setItem(`${PREFIX}:${proposalId}:${voter.toLowerCase()}`, salt);
}

export function getOneTimeSalt(
  proposalId: bigint,
  voter: string
): string | null {
  return localStorage.getItem(
    `${PREFIX}:${proposalId}:${voter.toLowerCase()}`
  );
}

export function clearOneTimeSalt(proposalId: bigint, voter: string): void {
  localStorage.removeItem(`${PREFIX}:${proposalId}:${voter.toLowerCase()}`);
}
