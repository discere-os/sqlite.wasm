#!/usr/bin/env deno run --allow-read --allow-write

/**
 * SQLite.wasm Performance Benchmarks
 * Comprehensive performance testing with real WASM module execution
 */

import { SQLite } from '../src/lib/index.ts'

interface BenchmarkSuite {
  name: string
  setup?: () => Promise<void>
  teardown?: () => Promise<void>
  tests: BenchmarkTest[]
}

interface BenchmarkTest {
  name: string
  recordCount: number
  operation: () => Promise<void>
}

interface BenchmarkResult {
  suiteName: string
  testName: string
  recordCount: number
  durationMs: number
  recordsPerSecond: number
  memoryUsed: number
  simdEnabled: boolean
}

class SQLiteBenchmark {
  private sqlite!: SQLite
  private results: BenchmarkResult[] = []

  async initialize() {
    this.sqlite = new SQLite({
      simdOptimizations: true,
      maxMemoryMB: 1024,
      enableFTS: true,
      enableJSON: true,
      enableRTree: true
    })
    await this.sqlite.initialize()
  }

  async runBenchmarks() {
    console.log('🏁 SQLite.wasm Performance Benchmarks')
    console.log('=====================================')

    const capabilities = this.sqlite.getCapabilities()
    console.log(`SQLite Version: ${capabilities.version}`)
    console.log(`SIMD Optimizations: ${capabilities.simdSupported ? '✅ Enabled' : '❌ Disabled'}`)
    console.log(`Max Memory: ${capabilities.maxMemoryMB}MB`)
    console.log()

    const suites: BenchmarkSuite[] = [
      await this.createInsertBenchmarkSuite(),
      await this.createSelectBenchmarkSuite(),
      await this.createJSONBenchmarkSuite(),
      await this.createFTSBenchmarkSuite(),
      await this.createBulkOperationsSuite()
    ]

    for (const suite of suites) {
      await this.runSuite(suite)
    }

    await this.generateReport()
  }

  private async createInsertBenchmarkSuite(): Promise<BenchmarkSuite> {
    return {
      name: 'Insert Operations',
      setup: async () => {
        await this.sqlite.execute('DROP TABLE IF EXISTS benchmark_inserts')
        await this.sqlite.execute(`
          CREATE TABLE benchmark_inserts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            score INTEGER,
            data BLOB,
            created_at REAL
          )
        `)
      },
      tests: [
        {
          name: 'Single Row Inserts',
          recordCount: 10000,
          operation: async () => {
            for (let i = 0; i < 10000; i++) {
              await this.sqlite.execute(
                'INSERT INTO benchmark_inserts (name, email, score, created_at) VALUES (?, ?, ?, ?)',
                [`user_${i}`, `user${i}@example.com`, Math.floor(Math.random() * 1000), Date.now()]
              )
            }
          }
        },
        {
          name: 'Bulk Insert with Transaction',
          recordCount: 50000,
          operation: async () => {
            await this.sqlite.execute('BEGIN TRANSACTION')
            for (let i = 0; i < 50000; i++) {
              await this.sqlite.execute(
                'INSERT INTO benchmark_inserts (name, email, score, created_at) VALUES (?, ?, ?, ?)',
                [`bulk_user_${i}`, `bulk${i}@example.com`, Math.floor(Math.random() * 1000), Date.now()]
              )
            }
            await this.sqlite.execute('COMMIT')
          }
        }
      ]
    }
  }

  private async createSelectBenchmarkSuite(): Promise<BenchmarkSuite> {
    return {
      name: 'Select Operations',
      setup: async () => {
        await this.sqlite.execute('DROP TABLE IF EXISTS benchmark_selects')
        await this.sqlite.execute(`
          CREATE TABLE benchmark_selects (
            id INTEGER PRIMARY KEY,
            category TEXT,
            value REAL,
            description TEXT,
            tags TEXT
          )
        `)
        await this.sqlite.execute('CREATE INDEX idx_category ON benchmark_selects(category)')
        await this.sqlite.execute('CREATE INDEX idx_value ON benchmark_selects(value)')

        // Insert test data
        await this.sqlite.execute('BEGIN TRANSACTION')
        for (let i = 0; i < 100000; i++) {
          const category = ['electronics', 'books', 'clothing', 'home', 'sports'][i % 5]
          const value = Math.random() * 1000
          const description = `Product description for item ${i} in ${category} category`
          const tags = `tag${i % 10},category_${category},item_${i}`

          await this.sqlite.execute(
            'INSERT INTO benchmark_selects (id, category, value, description, tags) VALUES (?, ?, ?, ?, ?)',
            [i, category, value, description, tags]
          )
        }
        await this.sqlite.execute('COMMIT')
      },
      tests: [
        {
          name: 'Indexed Category Queries',
          recordCount: 1000,
          operation: async () => {
            for (let i = 0; i < 1000; i++) {
              const category = ['electronics', 'books', 'clothing', 'home', 'sports'][i % 5]
              await this.sqlite.execute('SELECT * FROM benchmark_selects WHERE category = ?', [category])
            }
          }
        },
        {
          name: 'Range Queries with Index',
          recordCount: 500,
          operation: async () => {
            for (let i = 0; i < 500; i++) {
              const min = Math.random() * 500
              const max = min + 200
              await this.sqlite.execute('SELECT * FROM benchmark_selects WHERE value BETWEEN ? AND ?', [min, max])
            }
          }
        },
        {
          name: 'String Pattern Matching (SIMD Optimized)',
          recordCount: 200,
          operation: async () => {
            const patterns = ['Product%', '%electronics%', '%item_1%', '%category%', '%description%']
            for (let i = 0; i < 200; i++) {
              const pattern = patterns[i % patterns.length]
              await this.sqlite.execute('SELECT COUNT(*) FROM benchmark_selects WHERE description LIKE ?', [pattern])
            }
          }
        }
      ]
    }
  }

  private async createJSONBenchmarkSuite(): Promise<BenchmarkSuite> {
    return {
      name: 'JSON Operations',
      setup: async () => {
        await this.sqlite.execute('DROP TABLE IF EXISTS benchmark_json')
        await this.sqlite.execute(`
          CREATE TABLE benchmark_json (
            id INTEGER PRIMARY KEY,
            metadata JSON,
            settings JSON,
            user_data JSON
          )
        `)

        // Insert JSON test data
        await this.sqlite.execute('BEGIN TRANSACTION')
        for (let i = 0; i < 10000; i++) {
          const metadata = JSON.stringify({
            version: '1.0',
            created: new Date().toISOString(),
            type: ['user', 'admin', 'guest'][i % 3],
            features: ['feature_a', 'feature_b', 'feature_c'].slice(0, (i % 3) + 1),
            config: {
              enabled: i % 2 === 0,
              priority: i % 10,
              tags: [`tag_${i % 5}`, `category_${i % 3}`]
            }
          })

          const settings = JSON.stringify({
            theme: ['light', 'dark'][i % 2],
            language: ['en', 'es', 'fr', 'de'][i % 4],
            notifications: {
              email: i % 3 === 0,
              push: i % 2 === 0,
              sms: i % 5 === 0
            }
          })

          const userData = JSON.stringify({
            preferences: {
              layout: ['grid', 'list'][i % 2],
              itemsPerPage: [10, 25, 50][i % 3]
            },
            history: Array.from({ length: 5 }, (_, idx) => `action_${i}_${idx}`)
          })

          await this.sqlite.execute(
            'INSERT INTO benchmark_json (id, metadata, settings, user_data) VALUES (?, ?, ?, ?)',
            [i, metadata, settings, userData]
          )
        }
        await this.sqlite.execute('COMMIT')
      },
      tests: [
        {
          name: 'JSON Path Extraction',
          recordCount: 5000,
          operation: async () => {
            for (let i = 0; i < 5000; i++) {
              await this.sqlite.execute(`
                SELECT json_extract(metadata, '$.type'), json_extract(settings, '$.theme')
                FROM benchmark_json LIMIT 100
              `)
            }
          }
        },
        {
          name: 'JSON Array Operations',
          recordCount: 1000,
          operation: async () => {
            for (let i = 0; i < 1000; i++) {
              await this.sqlite.execute(`
                SELECT COUNT(*) FROM benchmark_json
                WHERE json_extract(metadata, '$.config.enabled') = true
                AND json_array_length(json_extract(metadata, '$.features')) > 1
              `)
            }
          }
        },
        {
          name: 'Complex JSON Queries',
          recordCount: 500,
          operation: async () => {
            for (let i = 0; i < 500; i++) {
              await this.sqlite.execute(`
                SELECT id, json_extract(metadata, '$.type') as user_type
                FROM benchmark_json
                WHERE json_extract(settings, '$.notifications.email') = true
                AND json_extract(metadata, '$.config.priority') > 5
                ORDER BY json_extract(metadata, '$.config.priority') DESC
                LIMIT 10
              `)
            }
          }
        }
      ]
    }
  }

  private async createFTSBenchmarkSuite(): Promise<BenchmarkSuite> {
    return {
      name: 'Full Text Search',
      setup: async () => {
        await this.sqlite.execute('DROP TABLE IF EXISTS benchmark_fts')
        await this.sqlite.execute('DROP TABLE IF EXISTS benchmark_fts_index')

        await this.sqlite.execute(`
          CREATE TABLE benchmark_fts (
            id INTEGER PRIMARY KEY,
            title TEXT,
            content TEXT,
            author TEXT
          )
        `)

        await this.sqlite.execute(`
          CREATE VIRTUAL TABLE benchmark_fts_index USING fts5(
            title, content, author, content='benchmark_fts', content_rowid='id'
          )
        `)

        // Insert text content for FTS testing
        const sampleTexts = [
          'SQLite WebAssembly SIMD optimization performance database',
          'JavaScript TypeScript React Vue Angular frontend development',
          'Python machine learning artificial intelligence data science',
          'Rust systems programming memory safety performance',
          'WebAssembly WASM compilation browser native performance',
          'Database indexing query optimization SQL performance tuning',
          'Full text search information retrieval document processing',
          'SIMD vectorization parallel processing performance optimization'
        ]

        await this.sqlite.execute('BEGIN TRANSACTION')
        for (let i = 0; i < 50000; i++) {
          const title = `Document ${i}: ${sampleTexts[i % sampleTexts.length].split(' ').slice(0, 3).join(' ')}`
          const content = Array.from({ length: 5 }, () => sampleTexts[Math.floor(Math.random() * sampleTexts.length)]).join('. ')
          const author = `Author_${i % 100}`

          await this.sqlite.execute(
            'INSERT INTO benchmark_fts (id, title, content, author) VALUES (?, ?, ?, ?)',
            [i, title, content, author]
          )
        }
        await this.sqlite.execute('COMMIT')

        // Rebuild FTS index
        await this.sqlite.execute('INSERT INTO benchmark_fts_index(benchmark_fts_index) VALUES("rebuild")')
      },
      tests: [
        {
          name: 'FTS Simple Queries',
          recordCount: 1000,
          operation: async () => {
            const queries = ['SQLite', 'WebAssembly', 'performance', 'optimization', 'database', 'SIMD']
            for (let i = 0; i < 1000; i++) {
              const query = queries[i % queries.length]
              await this.sqlite.execute(
                'SELECT * FROM benchmark_fts_index WHERE benchmark_fts_index MATCH ? LIMIT 10',
                [query]
              )
            }
          }
        },
        {
          name: 'FTS Complex Queries',
          recordCount: 500,
          operation: async () => {
            const complexQueries = [
              'SQLite AND performance',
              'WebAssembly OR WASM',
              'database AND optimization',
              'SIMD AND vectorization',
              '"full text search"'
            ]
            for (let i = 0; i < 500; i++) {
              const query = complexQueries[i % complexQueries.length]
              await this.sqlite.execute(
                'SELECT * FROM benchmark_fts_index WHERE benchmark_fts_index MATCH ? ORDER BY rank LIMIT 5',
                [query]
              )
            }
          }
        }
      ]
    }
  }

  private async createBulkOperationsSuite(): Promise<BenchmarkSuite> {
    return {
      name: 'SIMD Bulk Operations',
      tests: [
        {
          name: 'String Processing (SIMD Optimized)',
          recordCount: 100000,
          operation: async () => {
            await this.sqlite.execute('DROP TABLE IF EXISTS bulk_strings')
            await this.sqlite.execute('CREATE TABLE bulk_strings (id INTEGER, data TEXT)')

            await this.sqlite.execute('BEGIN TRANSACTION')
            for (let i = 0; i < 100000; i++) {
              await this.sqlite.execute(
                'INSERT INTO bulk_strings VALUES (?, ?)',
                [i, `test_string_${i}_with_simd_optimization_patterns_for_bulk_processing`]
              )
            }
            await this.sqlite.execute('COMMIT')

            // Perform bulk string operations that benefit from SIMD
            await this.sqlite.execute('SELECT COUNT(*) FROM bulk_strings WHERE data LIKE "%simd%"')
            await this.sqlite.execute('SELECT COUNT(*) FROM bulk_strings WHERE data GLOB "*optimization*"')
            await this.sqlite.execute('SELECT COUNT(*) FROM bulk_strings WHERE LENGTH(data) > 50')
          }
        },
        {
          name: 'Memory-Intensive Operations',
          recordCount: 50000,
          operation: async () => {
            await this.sqlite.execute('DROP TABLE IF EXISTS memory_test')
            await this.sqlite.execute('CREATE TABLE memory_test (id INTEGER, data BLOB)')

            // Create large BLOB data
            const largeData = new Array(1000).fill('x').join('')

            await this.sqlite.execute('BEGIN TRANSACTION')
            for (let i = 0; i < 50000; i++) {
              await this.sqlite.execute(
                'INSERT INTO memory_test VALUES (?, ?)',
                [i, largeData]
              )
            }
            await this.sqlite.execute('COMMIT')

            // Perform memory-intensive operations
            await this.sqlite.execute('SELECT COUNT(*) FROM memory_test')
            await this.sqlite.execute('SELECT SUM(LENGTH(data)) FROM memory_test')
          }
        }
      ]
    }
  }

  private async runSuite(suite: BenchmarkSuite) {
    console.log(`\n📊 Running ${suite.name} benchmarks...`)
    console.log('─'.repeat(50))

    if (suite.setup) {
      console.log('⚙️  Setting up test data...')
      await suite.setup()
    }

    for (const test of suite.tests) {
      const memBefore = this.getMemoryUsage()
      const startTime = performance.now()

      await test.operation()

      const endTime = performance.now()
      const memAfter = this.getMemoryUsage()

      const durationMs = endTime - startTime
      const recordsPerSecond = Math.round(test.recordCount / (durationMs / 1000))

      const result: BenchmarkResult = {
        suiteName: suite.name,
        testName: test.name,
        recordCount: test.recordCount,
        durationMs,
        recordsPerSecond,
        memoryUsed: memAfter - memBefore,
        simdEnabled: this.sqlite.getCapabilities().simdSupported
      }

      this.results.push(result)

      console.log(`✅ ${test.name}:`)
      console.log(`   Records: ${test.recordCount.toLocaleString()}`)
      console.log(`   Duration: ${durationMs.toFixed(2)}ms`)
      console.log(`   Rate: ${recordsPerSecond.toLocaleString()} ops/sec`)
      console.log(`   Memory Delta: ${(memAfter - memBefore).toFixed(2)}MB`)
    }

    if (suite.teardown) {
      await suite.teardown()
    }
  }

  private getMemoryUsage(): number {
    // This would need to be implemented with actual memory measurement
    // For now, return a placeholder based on performance info
    const perfInfo = this.sqlite.getPerformanceInfo()
    return perfInfo.memoryUsed / (1024 * 1024) // Convert to MB
  }

  private async generateReport() {
    console.log('\n📈 Benchmark Report')
    console.log('==================')

    const groupedResults = this.results.reduce((acc, result) => {
      if (!acc[result.suiteName]) {
        acc[result.suiteName] = []
      }
      acc[result.suiteName].push(result)
      return acc
    }, {} as Record<string, BenchmarkResult[]>)

    for (const [suiteName, results] of Object.entries(groupedResults)) {
      console.log(`\n${suiteName}:`)
      for (const result of results) {
        console.log(`  ${result.testName}:`)
        console.log(`    Rate: ${result.recordsPerSecond.toLocaleString()} ops/sec`)
        console.log(`    Duration: ${result.durationMs.toFixed(2)}ms`)
        console.log(`    SIMD: ${result.simdEnabled ? '✅' : '❌'}`)
      }
    }

    // Calculate overall statistics
    const totalOperations = this.results.reduce((sum, r) => sum + r.recordCount, 0)
    const totalDuration = this.results.reduce((sum, r) => sum + r.durationMs, 0)
    const avgRate = Math.round(totalOperations / (totalDuration / 1000))

    console.log('\n🏆 Overall Performance:')
    console.log(`Total Operations: ${totalOperations.toLocaleString()}`)
    console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`)
    console.log(`Average Rate: ${avgRate.toLocaleString()} ops/sec`)
    console.log(`SIMD Optimizations: ${this.results[0]?.simdEnabled ? '✅ Enabled' : '❌ Disabled'}`)
  }

  async cleanup() {
    await this.sqlite.close()
  }
}

async function main() {
  const benchmark = new SQLiteBenchmark()

  try {
    await benchmark.initialize()
    await benchmark.runBenchmarks()
    await benchmark.cleanup()

    console.log('\n✅ All benchmarks completed successfully!')
  } catch (error) {
    console.error('❌ Benchmark failed:', error)
    await benchmark.cleanup()
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}