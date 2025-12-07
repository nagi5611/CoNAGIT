// Cloudflare Workers型定義
declare global {
  // Console API
  const console: {
    log(...args: any[]): void
    error(...args: any[]): void
    warn(...args: any[]): void
    info(...args: any[]): void
    debug(...args: any[]): void
  }
  // Web標準API（Cloudflare Workers環境で利用可能）
  interface Response extends Body {
    readonly headers: Headers
    readonly ok: boolean
    readonly redirected: boolean
    readonly status: number
    readonly statusText: string
    readonly type: ResponseType
    readonly url: string
    clone(): Response
  }

  interface ResponseInit {
    status?: number
    statusText?: string
    headers?: HeadersInit
  }

  interface Body {
    readonly body: ReadableStream<Uint8Array> | null
    readonly bodyUsed: boolean
    arrayBuffer(): Promise<ArrayBuffer>
    blob(): Promise<Blob>
    formData(): Promise<FormData>
    json(): Promise<any>
    text(): Promise<string>
  }

  type BodyInit = Blob | BufferSource | FormData | URLSearchParams | ReadableStream<Uint8Array> | string

  type HeadersInit = Headers | Record<string, string> | [string, string][]

  interface Headers {
    append(name: string, value: string): void
    delete(name: string): void
    get(name: string): string | null
    has(name: string): boolean
    set(name: string, value: string): void
    forEach(callbackfn: (value: string, key: string, parent: Headers) => void, thisArg?: any): void
    entries(): IterableIterator<[string, string]>
    keys(): IterableIterator<string>
    values(): IterableIterator<string>
    [Symbol.iterator](): IterableIterator<[string, string]>
  }

  const Response: {
    new (body?: BodyInit | null, init?: ResponseInit): Response
    error(): Response
    redirect(url: string, status?: number): Response
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement
  }

  interface D1PreparedStatement {
    bind(...values: any[]): D1PreparedStatement
    first<T = any>(): Promise<T | null>
    run<T = any>(): Promise<D1Result<T>>
    all<T = any>(): Promise<D1Result<T>>
  }

  interface D1Result<T = any> {
    results: T[]
    success: boolean
    meta: {
      last_row_id: number
      changes: number
    }
  }

  interface R2Bucket {
    get(key: string): Promise<R2Object | null>
    put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: R2PutOptions): Promise<R2Object>
    delete(key: string): Promise<void>
    list(options?: R2ListOptions): Promise<R2Objects>
  }

  interface R2Object {
    key: string
    body: ReadableStream
    bodyUsed: boolean
    size: number
    etag: string
    httpEtag: string
    uploaded: Date
    httpMetadata?: R2HTTPMetadata
    customMetadata?: Record<string, string>
  }

  interface R2PutOptions {
    httpMetadata?: R2HTTPMetadata
    customMetadata?: Record<string, string>
  }

  interface R2HTTPMetadata {
    contentType?: string
    contentLanguage?: string
    contentDisposition?: string
    contentEncoding?: string
    cacheControl?: string
    cacheExpiry?: Date
  }

  interface R2ListOptions {
    limit?: number
    prefix?: string
    cursor?: string
    delimiter?: string
    include?: string[]
  }

  interface R2Objects {
    objects: R2Object[]
    truncated: boolean
    cursor?: string
    delimitedPrefixes?: string[]
  }
}

export {}

