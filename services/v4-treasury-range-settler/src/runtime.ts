export type RpcSource = "primary" | "secondary" | "fallback";

export interface RuntimeFault {
  code: "RPC_REQUEST_TIMEOUT" | "SWEEP_TIMEOUT";
  rpcSource?: RpcSource;
  operation: string;
  timeoutMs: number;
}

export class FatalRuntimeError extends Error {
  readonly code: RuntimeFault["code"];
  readonly fault: RuntimeFault;

  constructor(fault: RuntimeFault) {
    super(fault.code);
    this.name = "FatalRuntimeError";
    this.code = fault.code;
    this.fault = fault;
  }
}

export function isFatalRuntimeError(error: unknown): error is FatalRuntimeError {
  return error instanceof FatalRuntimeError;
}

export class FatalRuntimeGate {
  private faultValue: RuntimeFault | undefined;

  constructor(private readonly onTrip: (fault: RuntimeFault) => void = () => undefined) {}

  get fault(): RuntimeFault | undefined {
    return this.faultValue;
  }

  assertHealthy(): void {
    if (this.faultValue) throw new FatalRuntimeError(this.faultValue);
  }

  trip(fault: RuntimeFault): FatalRuntimeError {
    if (!this.faultValue) {
      this.faultValue = fault;
      this.onTrip(fault);
    }
    return new FatalRuntimeError(this.faultValue);
  }
}

export async function allSettledOrThrow<T>(promises: readonly Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  const fatal = settled.find((result): result is PromiseRejectedResult =>
    result.status === "rejected" && isFatalRuntimeError(result.reason)
  );
  if (fatal) throw fatal.reason;
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (rejected) throw rejected.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
}

export async function withRuntimeDeadline<T>(
  gate: FatalRuntimeGate,
  fault: RuntimeFault,
  task: () => Promise<T>,
): Promise<T> {
  gate.assertHealthy();
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(gate.trip(fault)), fault.timeoutMs);
  });
  try {
    return await Promise.race([task(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class RpcDeadlineSet {
  constructor(
    readonly gate: FatalRuntimeGate,
    readonly timeoutMs: number,
  ) {}

  one<T>(source: RpcSource, operation: string, task: () => Promise<T>): Promise<T> {
    const retryTask = async (): Promise<T> => {
      let delay = 150;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await task();
        } catch (err: unknown) {
          const e = err as { info?: { error?: { code?: number } }; message?: string };
          const isRateLimit = e?.info?.error?.code === -32016 ||
            (typeof e?.message === "string" && (e.message.includes("rate limit") || e.message.includes("429")));
          if (isRateLimit && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          throw err;
        }
      }
      return task();
    };
    return withRuntimeDeadline(this.gate, {
      code: "RPC_REQUEST_TIMEOUT",
      rpcSource: source,
      operation,
      timeoutMs: this.timeoutMs,
    }, retryTask);
  }

  all<T>(
    operation: string,
    tasks: Readonly<Record<RpcSource, () => Promise<T>>>,
  ): Promise<T[]> {
    return allSettledOrThrow([
      this.one("primary", operation, tasks.primary),
      this.one("secondary", operation, tasks.secondary),
      this.one("fallback", operation, tasks.fallback),
    ]);
  }
}
