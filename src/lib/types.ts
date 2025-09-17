// SQLite.wasm TypeScript Definitions
// High-performance SQLite database engine with SIMD optimizations

export interface SqliteOptions {
  simdOptimizations?: boolean
  maxMemoryMB?: number
  enableFTS?: boolean
  enableJSON?: boolean
  enableRTree?: boolean
}

export interface SqliteCapabilities {
  simdSupported: boolean
  version: string
  maxMemoryMB: number
  features: {
    fts4: boolean
    fts5: boolean
    json1: boolean
    rtree: boolean
  }
}

export interface SqliteQueryResult {
  columns: string[]
  rows: unknown[][]
  changes: number
  lastInsertRowId: number
}

export interface SqliteStatement {
  sql: string
  parameters?: Record<string, unknown> | unknown[]
}

export interface SqliteBenchmarkResult {
  operation: string
  recordCount: number
  durationMs: number
  recordsPerSecond: number
  simdEnabled: boolean
}

export interface SqlitePerformanceInfo {
  totalQueries: number
  totalTime: number
  memoryUsed: number
  cacheHitRatio: number
  simdOperationsCount: number
}

export class SqliteError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly sql?: string
  ) {
    super(message)
    this.name = 'SqliteError'
  }
}

export class SqliteQueryError extends SqliteError {
  constructor(message: string, sql: string, code?: number) {
    super(message, code, sql)
    this.name = 'SqliteQueryError'
  }
}

export class SqliteConnectionError extends SqliteError {
  constructor(message: string, code?: number) {
    super(message, code)
    this.name = 'SqliteConnectionError'
  }
}

export interface SqliteModule {
  ready: Promise<SqliteModule>
  ccall: (name: string, returnType: string, argTypes: string[], args: unknown[]) => unknown
  cwrap: (name: string, returnType: string, argTypes: string[]) => Function
  UTF8ToString: (ptr: number) => string
  stringToUTF8: (str: string, buffer: number, maxBytesToRead: number) => void
  lengthBytesUTF8: (str: string) => number
  HEAPU8: Uint8Array
  HEAP32: Int32Array
  _malloc: (size: number) => number
  _free: (ptr: number) => void
}

export interface SqliteStatementHandle {
  ptr: number
  sql: string
  columnCount: number
  columnNames: string[]
}

export interface SqliteDatabaseHandle {
  ptr: number
  filename: string
  isOpen: boolean
}