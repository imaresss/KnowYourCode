export function isAbortSignalError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
}
