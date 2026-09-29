/** Chat statuses that mean a generation is in flight (D-05). */
export function isChatBusy(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

/** Composer primary control should morph to stop while busy (D-05). */
export function composerIsStop(status: string): boolean {
  return isChatBusy(status);
}
