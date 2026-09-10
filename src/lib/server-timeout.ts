/**
 * Server-side timeout guard.
 *
 * A database read that never resolves used to hang server-side page rendering
 * until the hosting runtime killed the whole request ("Worker code had hung"),
 * so visitors got a dead tab instead of a page. Anything awaited on the render
 * path must have an upper bound.
 */
export class ServerTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "ServerTimeoutError";
  }
}

export async function withTimeout<T>(
  work: PromiseLike<T> | (() => PromiseLike<T>),
  ms = 6_000,
  label = "server request",
): Promise<T> {
  const promise = Promise.resolve(typeof work === "function" ? work() : work);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ServerTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Same bound, but a timeout (or any failure) yields a fallback value. */
export async function withTimeoutOr<T>(
  work: PromiseLike<T> | (() => PromiseLike<T>),
  fallback: T,
  ms = 6_000,
  label = "server request",
): Promise<T> {
  try {
    return await withTimeout(work, ms, label);
  } catch {
    return fallback;
  }
}
