export type ActiveRequest = {
  requestId: string;
  controller: AbortController;
  model: string;
};

export class ActiveRequestManager {
  private activeRequest: ActiveRequest | undefined;
  private requestSeq = 0;

  public start(model: string): ActiveRequest {
    // Ensure only one cancellable generation is active at a time.
    if (this.activeRequest) {
      this.activeRequest.controller.abort("superseded");
    }

    const request: ActiveRequest = {
      requestId: `kyc-${Date.now()}-${++this.requestSeq}`,
      controller: new AbortController(),
      model
    };
    this.activeRequest = request;
    return request;
  }

  public stop(requestId?: string): boolean {
    if (!this.activeRequest) {
      return false;
    }
    if (requestId && this.activeRequest.requestId !== requestId) {
      return false;
    }
    this.activeRequest.controller.abort("user");
    this.activeRequest = undefined;
    return true;
  }

  public complete(requestId: string): void {
    if (this.activeRequest?.requestId === requestId) {
      this.activeRequest = undefined;
    }
  }

  public hasActive(): boolean {
    return Boolean(this.activeRequest);
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("abort") || message.includes("cancel");
}
