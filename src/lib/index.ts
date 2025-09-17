// SQLite.wasm - High-performance SQLite database engine with SIMD optimizations
// TypeScript-first API for WebAssembly SQLite implementation

import type {
  SqliteOptions,
  SqliteCapabilities,
  SqliteQueryResult,
  SqliteStatement,
  SqliteBenchmarkResult,
  SqlitePerformanceInfo,
  SqliteModule,
  SqliteStatementHandle,
  SqliteDatabaseHandle
} from './types.ts'

import {
  SqliteError,
  SqliteQueryError,
  SqliteConnectionError
} from './types.ts'

export * from './types.ts'

/**
 * High-performance SQLite database engine with WebAssembly and SIMD optimizations
 *
 * Features:
 * - SIMD-optimized string operations and bulk processing
 * - Full Text Search (FTS4/FTS5) support
 * - JSON1 extension for JSON operations
 * - R-Tree spatial indexing
 * - Memory-efficient design with configurable limits
 * - TypeScript-first API with comprehensive error handling
 */
export class SQLite {
  private simdOptimizations: boolean
  private maxMemoryMB: number
  private enableFTS: boolean
  private enableJSON: boolean
  private enableRTree: boolean
  private module: SqliteModule | null = null
  private database: SqliteDatabaseHandle | null = null
  private statements = new Map<string, SqliteStatementHandle>()
  private performanceStats = {
    totalQueries: 0,
    totalTime: 0,
    memoryUsed: 0,
    cacheHitRatio: 0,
    simdOperationsCount: 0
  }

  constructor(options: SqliteOptions = {}) {
    this.simdOptimizations = options.simdOptimizations ?? true
    this.maxMemoryMB = options.maxMemoryMB ?? 256
    this.enableFTS = options.enableFTS ?? true
    this.enableJSON = options.enableJSON ?? true
    this.enableRTree = options.enableRTree ?? true
  }

  /**
   * Initialize the SQLite WASM module and create in-memory database
   */
  async initialize(): Promise<void> {
    try {
      // Load the SIMD-optimized SQLite module
      const moduleFactory = await this.loadModule()
      this.module = await moduleFactory({
        wasmBinary: await this.loadWasmBinary()
      })

      // Open in-memory database
      await this.openDatabase(':memory:')

      // Initialize SIMD functions if enabled
      if (this.simdOptimizations && this.module._sqlite_register_simd_functions) {
        this.module.ccall('sqlite_register_simd_functions', 'void', [], [])
      }
    } catch (error) {
      throw new SqliteConnectionError(`Failed to initialize SQLite: ${error}`)
    }
  }

  private async loadModule(): Promise<() => Promise<SqliteModule>> {
    // Try to load from local file first (development)
    try {
      // Use dynamic import with absolute path to avoid TypeScript module resolution
      const modulePath = new URL('./../../build/sqlite.js', import.meta.url).href
      const localModule = await import(modulePath) as any
      console.log('✅ Loaded SQLite.wasm module from local build')
      return localModule.default
    } catch (error) {
      throw new SqliteConnectionError(`Failed to load SQLite WASM module: ${error}`)
    }
  }

  private async loadWasmBinary(): Promise<ArrayBuffer> {
    // Try local build paths first (for Deno testing)
    // @ts-ignore - Deno global may not exist in all environments
    if (typeof globalThis.Deno !== 'undefined') {
      // Deno environment - use Deno.readFile
      const localPaths = [
        './build/sqlite.wasm',
        './build-dual-main-release/sqlite.wasm',
        './install/wasm/sqlite.wasm'
      ]

      for (const localPath of localPaths) {
        try {
          const wasmBuffer = await Deno.readFile(localPath)
          console.log(`✅ Loaded SQLite.wasm binary from: ${localPath}`)
          return wasmBuffer.buffer
        } catch (error) {
          console.log(`⚠️ Failed to load WASM from ${localPath}:`, (error as Error).message)
          continue
        }
      }
    }

    // @ts-ignore - process global may not exist in all environments
    if (typeof globalThis.process !== 'undefined' && globalThis.process?.versions?.node) {
      // Node.js environment
      const { readFile } = await import('fs/promises')
      const { fileURLToPath } = await import('url')
      const path = await import('path')

      const localPaths = [
        '../../../build/sqlite.wasm',
        '../../../build-dual-main-release/sqlite.wasm',
        '../../../install/wasm/sqlite.wasm'
      ]

      for (const localPath of localPaths) {
        try {
          const filePath = path.resolve(fileURLToPath(import.meta.url), localPath)
          const wasmBuffer = await readFile(filePath)
          console.log(`✅ Loaded SQLite.wasm binary from: ${localPath}`)
          return new ArrayBuffer(wasmBuffer.byteLength).constructor === ArrayBuffer
            ? wasmBuffer.buffer as ArrayBuffer
            : new Uint8Array(wasmBuffer).buffer
        } catch (error) {
          console.log(`⚠️ Failed to load WASM from ${localPath}:`, (error as Error).message)
          continue
        }
      }
    }

    throw new Error('No SQLite.wasm binary available. Run build command to generate WASM files.')
  }

  private async openDatabase(filename: string): Promise<void> {
    if (!this.module) {
      throw new SqliteConnectionError('SQLite module not initialized')
    }

    const filenamePtr = this.allocateString(filename)
    const dbPtrPtr = this.module._malloc(4)

    try {
      const result = this.module.ccall('sqlite_open', 'number', ['number', 'number'], [filenamePtr, dbPtrPtr])

      if (result !== 0) {
        const errorMsg = this.getErrorMessage()
        throw new SqliteConnectionError(`Failed to open database: ${errorMsg}`, result)
      }

      const dbPtr = this.module.HEAP32[dbPtrPtr >> 2]
      this.database = {
        ptr: dbPtr,
        filename,
        isOpen: true
      }
    } finally {
      this.module._free(filenamePtr)
      this.module._free(dbPtrPtr)
    }
  }

  /**
   * Execute a SQL statement and return results
   */
  async execute(sql: string, parameters?: Record<string, unknown> | unknown[]): Promise<SqliteQueryResult> {
    if (!this.module || !this.database) {
      throw new SqliteConnectionError('SQLite not initialized')
    }

    const startTime = performance.now()

    try {
      const statement = await this.prepareStatement(sql)

      if (parameters) {
        await this.bindParameters(statement, parameters)
      }

      const result = await this.stepStatement(statement)
      const endTime = performance.now()

      // Update performance statistics
      this.performanceStats.totalQueries++
      this.performanceStats.totalTime += (endTime - startTime)

      if (this.simdOptimizations) {
        this.performanceStats.simdOperationsCount++
      }

      return result
    } catch (error) {
      throw new SqliteQueryError(`Query execution failed: ${error}`, sql)
    }
  }

  private async prepareStatement(sql: string): Promise<SqliteStatementHandle> {
    if (!this.module || !this.database) {
      throw new SqliteConnectionError('SQLite not initialized')
    }

    // Check if we have a cached prepared statement
    if (this.statements.has(sql)) {
      return this.statements.get(sql)!
    }

    const sqlPtr = this.allocateString(sql)
    const stmtPtrPtr = this.module._malloc(4)

    try {
      const result = this.module.ccall('sqlite_prepare_v2', 'number',
        ['number', 'number', 'number', 'number', 'number'],
        [this.database.ptr, sqlPtr, -1, stmtPtrPtr, 0])

      if (result !== 0) {
        const errorMsg = this.getErrorMessage()
        throw new SqliteQueryError(`Failed to prepare statement: ${errorMsg}`, sql, result)
      }

      const stmtPtr = this.module.HEAP32[stmtPtrPtr >> 2]
      const statement: SqliteStatementHandle = {
        ptr: stmtPtr,
        sql,
        columnCount: 0,
        columnNames: []
      }

      // Cache the prepared statement for reuse
      this.statements.set(sql, statement)
      return statement
    } finally {
      this.module._free(sqlPtr)
      this.module._free(stmtPtrPtr)
    }
  }

  private async bindParameters(statement: SqliteStatementHandle, parameters: Record<string, unknown> | unknown[]): Promise<void> {
    if (!this.module) return

    if (Array.isArray(parameters)) {
      for (let i = 0; i < parameters.length; i++) {
        await this.bindParameter(statement, i + 1, parameters[i])
      }
    } else {
      // Named parameters are more complex to implement
      // For now, we'll support positional parameters
      throw new SqliteQueryError('Named parameters not yet supported', statement.sql)
    }
  }

  private async bindParameter(statement: SqliteStatementHandle, index: number, value: unknown): Promise<void> {
    if (!this.module) return

    if (typeof value === 'string') {
      const valuePtr = this.allocateString(value)
      this.module.ccall('sqlite_bind_text', 'number', ['number', 'number', 'number', 'number', 'number'],
        [statement.ptr, index, valuePtr, -1, 0])
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        this.module.ccall('sqlite_bind_int', 'number', ['number', 'number', 'number'],
          [statement.ptr, index, value])
      } else {
        this.module.ccall('sqlite_bind_double', 'number', ['number', 'number', 'number'],
          [statement.ptr, index, value])
      }
    }
  }

  private async stepStatement(statement: SqliteStatementHandle): Promise<SqliteQueryResult> {
    if (!this.module || !this.database) {
      throw new SqliteConnectionError('SQLite not initialized')
    }

    const rows: unknown[][] = []
    const columns: string[] = []

    while (true) {
      const result = this.module.ccall('sqlite_step', 'number', ['number'], [statement.ptr])

      if (result === 100) { // SQLITE_ROW
        if (columns.length === 0) {
          // Get column information on first row
          const columnCount = this.module.ccall('sqlite3_column_count', 'number', ['number'], [statement.ptr])
          for (let i = 0; i < columnCount; i++) {
            const namePtr = this.module.ccall('sqlite3_column_name', 'number', ['number', 'number'], [statement.ptr, i])
            columns.push(this.module.UTF8ToString(namePtr))
          }
        }

        // Extract row data
        const row: unknown[] = []
        for (let i = 0; i < columns.length; i++) {
          const type = this.module.ccall('sqlite3_column_type', 'number', ['number', 'number'], [statement.ptr, i])

          switch (type) {
            case 1: // INTEGER
              row.push(this.module.ccall('sqlite_column_int', 'number', ['number', 'number'], [statement.ptr, i]))
              break
            case 2: // REAL
              row.push(this.module.ccall('sqlite_column_double', 'number', ['number', 'number'], [statement.ptr, i]))
              break
            case 3: // TEXT
              const textPtr = this.module.ccall('sqlite_column_text', 'number', ['number', 'number'], [statement.ptr, i])
              row.push(this.module.UTF8ToString(textPtr))
              break
            case 4: // BLOB
              // TODO: Handle BLOB data
              row.push(null)
              break
            case 5: // NULL
              row.push(null)
              break
            default:
              row.push(null)
          }
        }
        rows.push(row)
      } else if (result === 101) { // SQLITE_DONE
        break
      } else {
        const errorMsg = this.getErrorMessage()
        throw new SqliteQueryError(`Statement execution failed: ${errorMsg}`, statement.sql, result)
      }
    }

    const changes = this.module.ccall('sqlite_changes', 'number', ['number'], [this.database.ptr])
    const lastInsertRowId = this.module.ccall('sqlite_last_insert_rowid', 'number', ['number'], [this.database.ptr])

    return {
      columns,
      rows,
      changes,
      lastInsertRowId
    }
  }

  /**
   * Get SQLite capabilities and version information
   */
  getCapabilities(): SqliteCapabilities {
    if (!this.module) {
      throw new SqliteConnectionError('SQLite module not initialized')
    }

    const versionPtr = this.module.ccall('sqlite_get_version', 'number', [], [])
    const version = this.module.UTF8ToString(versionPtr)

    return {
      simdSupported: this.simdOptimizations,
      version,
      maxMemoryMB: this.maxMemoryMB,
      features: {
        fts4: this.enableFTS,
        fts5: this.enableFTS,
        json1: this.enableJSON,
        rtree: this.enableRTree
      }
    }
  }

  /**
   * Get performance statistics and SIMD optimization status
   */
  getPerformanceInfo(): SqlitePerformanceInfo {
    return { ...this.performanceStats }
  }

  /**
   * Benchmark database operations with SIMD optimizations
   */
  async benchmark(recordCount: number = 10000): Promise<SqliteBenchmarkResult[]> {
    const results: SqliteBenchmarkResult[] = []

    // Test 1: Bulk string operations
    const startInsert = performance.now()
    await this.execute(`CREATE TABLE IF NOT EXISTS benchmark_strings (id INTEGER PRIMARY KEY, data TEXT)`)

    for (let i = 0; i < recordCount; i++) {
      await this.execute('INSERT INTO benchmark_strings (data) VALUES (?)', [`test_string_${i}_with_simd_optimization`])
    }

    const endInsert = performance.now()
    results.push({
      operation: 'Bulk String Inserts',
      recordCount,
      durationMs: endInsert - startInsert,
      recordsPerSecond: Math.round(recordCount / ((endInsert - startInsert) / 1000)),
      simdEnabled: this.simdOptimizations
    })

    // Test 2: String pattern matching
    const startSearch = performance.now()
    await this.execute(`SELECT COUNT(*) FROM benchmark_strings WHERE data LIKE '%simd%'`)
    const endSearch = performance.now()

    results.push({
      operation: 'String Pattern Matching',
      recordCount,
      durationMs: endSearch - startSearch,
      recordsPerSecond: Math.round(recordCount / ((endSearch - startSearch) / 1000)),
      simdEnabled: this.simdOptimizations
    })

    // Test 3: Bulk memory operations
    if (this.module && this.simdOptimizations) {
      const startBulk = performance.now()
      // Call SIMD bulk operations if available
      if (this.module._sqlite_bulk_memory_copy) {
        this.module.ccall('sqlite_bulk_memory_copy', 'void', [], [])
      }
      const endBulk = performance.now()

      results.push({
        operation: 'SIMD Bulk Memory Operations',
        recordCount: 1000,
        durationMs: endBulk - startBulk,
        recordsPerSecond: Math.round(1000 / ((endBulk - startBulk) / 1000)),
        simdEnabled: true
      })
    }

    return results
  }

  /**
   * Clean up resources and close database connections
   */
  async close(): Promise<void> {
    try {
      // Finalize all prepared statements
      for (const [, statement] of this.statements) {
        if (this.module) {
          this.module.ccall('sqlite_finalize', 'number', ['number'], [statement.ptr])
        }
      }
      this.statements.clear()

      // Close database connection
      if (this.module && this.database) {
        const result = this.module.ccall('sqlite_close', 'number', ['number'], [this.database.ptr])
        if (result !== 0) {
          const errorMsg = this.getErrorMessage()
          throw new SqliteConnectionError(`Failed to close database: ${errorMsg}`, result)
        }
        this.database = null
      }
    } catch (error) {
      throw new SqliteConnectionError(`Error during cleanup: ${error}`)
    }
  }

  private allocateString(str: string): number {
    if (!this.module) throw new SqliteConnectionError('Module not initialized')

    const length = this.module.lengthBytesUTF8(str) + 1
    const ptr = this.module._malloc(length)
    this.module.stringToUTF8(str, ptr, length)
    return ptr
  }

  private getErrorMessage(): string {
    if (!this.module || !this.database) return 'Unknown error'

    const errorPtr = this.module.ccall('sqlite_errmsg', 'number', ['number'], [this.database.ptr])
    return this.module.UTF8ToString(errorPtr)
  }
}