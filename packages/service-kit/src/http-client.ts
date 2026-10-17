import { CORRELATION_ID_HEADER, getCorrelationId } from './correlation';

/** The called service could not be reached or did not answer in time. */
export class UpstreamUnavailableError extends Error {
  override readonly name = 'UpstreamUnavailableError';

  constructor(
    readonly service: string,
    cause: unknown,
  ) {
    super(`${service} is unavailable`, { cause });
  }
}

/** The called service answered with an unexpected non-2xx status. */
export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';

  constructor(
    readonly service: string,
    readonly status: number,
    /** `code` from the upstream error body, when it followed the API conventions. */
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    super(`${service} answered ${status}${code ? ` ${code}` : ''}`);
  }
}

export interface ServiceClientOptions {
  /** Name used in errors and logs, e.g. `asset-service`. */
  name: string;
  /** Base URL from the environment, e.g. `http://localhost:3002`. Never hardcoded. */
  baseUrl: string;
  /** Default 5000 ms. */
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
}

export interface CallOptions {
  /**
   * Access token of the user the call is made for (ADR 0004: synchronous
   * calls forward the caller's token; the callee authorizes it again).
   */
  accessToken?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Small JSON client for synchronous service-to-service calls. Forwards the
 * caller's bearer token and the current correlation id.
 *
 * ```ts
 * const equipment = await assets.getOrNull<EquipmentDto>(
 *   `/internal/equipment/${id}`, { accessToken: user.accessToken });
 * ```
 */
export class ServiceHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ServiceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  get<T>(path: string, options: CallOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  /** Like `get`, but a 404 answer returns `null` instead of throwing. */
  async getOrNull<T>(path: string, options: CallOptions = {}): Promise<T | null> {
    try {
      return await this.request<T>('GET', path, options);
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  post<T>(path: string, body: unknown, options: CallOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  patch<T>(path: string, body: unknown, options: CallOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  async request<T>(
    method: Method,
    path: string,
    options: CallOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (options.accessToken) {
      headers.authorization = `Bearer ${options.accessToken}`;
    }
    const correlationId = getCorrelationId();
    if (correlationId) {
      headers[CORRELATION_ID_HEADER] = correlationId;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new UpstreamUnavailableError(this.options.name, error);
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      const code =
        body !== null &&
        typeof body === 'object' &&
        typeof (body as { code?: unknown }).code === 'string'
          ? (body as { code: string }).code
          : undefined;
      throw new UpstreamError(this.options.name, response.status, code, body);
    }
    return body as T;
  }
}
