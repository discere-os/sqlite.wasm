/**
 * SQLite.wasm Basic Functionality Tests
 * Tests core database operations with real WASM module
 */

import { assertEquals, assertRejects, assert } from '@std/assert'
import { SQLite } from '../../src/lib/index.ts'

Deno.test('SQLite Initialization', async (t) => {
  await t.step('should initialize with default options', async () => {
    const sqlite = new SQLite()
    await sqlite.initialize()

    const capabilities = sqlite.getCapabilities()
    assert(capabilities.version.length > 0)
    assert(capabilities.simdSupported === true) // Default is true
    assert(capabilities.maxMemoryMB === 256) // Default value

    await sqlite.close()
  })

  await t.step('should initialize with custom options', async () => {
    const sqlite = new SQLite({
      simdOptimizations: false,
      maxMemoryMB: 512,
      enableFTS: true,
      enableJSON: false,
      enableRTree: true
    })
    await sqlite.initialize()

    const capabilities = sqlite.getCapabilities()
    assertEquals(capabilities.simdSupported, false)
    assertEquals(capabilities.maxMemoryMB, 512)
    assertEquals(capabilities.features.fts4, true)
    assertEquals(capabilities.features.json1, false)
    assertEquals(capabilities.features.rtree, true)

    await sqlite.close()
  })

  await t.step('should report correct SQLite version', async () => {
    const sqlite = new SQLite()
    await sqlite.initialize()

    const capabilities = sqlite.getCapabilities()
    assert(capabilities.version.startsWith('3.'))

    await sqlite.close()
  })
})

Deno.test('Basic SQL Operations', async (t) => {
  const sqlite = new SQLite()
  await sqlite.initialize()

  await t.step('should create tables', async () => {
    const result = await sqlite.execute(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `)
    assertEquals(result.changes, 0) // CREATE TABLE doesn't change rows
    assertEquals(result.columns.length, 0) // No columns returned
  })

  await t.step('should insert data', async () => {
    const result = await sqlite.execute(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      ['John Doe', 'john@example.com']
    )
    assertEquals(result.changes, 1)
    assert(result.lastInsertRowId > 0)
  })

  await t.step('should select data', async () => {
    const result = await sqlite.execute('SELECT * FROM users')
    assertEquals(result.columns, ['id', 'name', 'email'])
    assertEquals(result.rows.length, 1)
    assertEquals(result.rows[0][1], 'John Doe')
    assertEquals(result.rows[0][2], 'john@example.com')
  })

  await t.step('should update data', async () => {
    const result = await sqlite.execute(
      'UPDATE users SET email = ? WHERE name = ?',
      ['john.doe@example.com', 'John Doe']
    )
    assertEquals(result.changes, 1)
  })

  await t.step('should delete data', async () => {
    const result = await sqlite.execute('DELETE FROM users WHERE name = ?', ['John Doe'])
    assertEquals(result.changes, 1)
  })

  await sqlite.close()
})

Deno.test('Parameter Binding', async (t) => {
  const sqlite = new SQLite()
  await sqlite.initialize()

  await sqlite.execute(`
    CREATE TABLE test_params (
      id INTEGER PRIMARY KEY,
      text_val TEXT,
      int_val INTEGER,
      real_val REAL
    )
  `)

  await t.step('should bind string parameters', async () => {
    const result = await sqlite.execute(
      'INSERT INTO test_params (text_val) VALUES (?)',
      ['test string']
    )
    assertEquals(result.changes, 1)
  })

  await t.step('should bind integer parameters', async () => {
    const result = await sqlite.execute(
      'INSERT INTO test_params (int_val) VALUES (?)',
      [42]
    )
    assertEquals(result.changes, 1)
  })

  await t.step('should bind float parameters', async () => {
    const result = await sqlite.execute(
      'INSERT INTO test_params (real_val) VALUES (?)',
      [3.14159]
    )
    assertEquals(result.changes, 1)
  })

  await t.step('should bind multiple parameters', async () => {
    const result = await sqlite.execute(
      'INSERT INTO test_params (text_val, int_val, real_val) VALUES (?, ?, ?)',
      ['mixed', 100, 2.718]
    )
    assertEquals(result.changes, 1)
  })

  await t.step('should retrieve all parameter types', async () => {
    const result = await sqlite.execute('SELECT * FROM test_params ORDER BY id')
    assertEquals(result.rows.length, 4)

    // Check string parameter
    assertEquals(result.rows[0][1], 'test string')

    // Check integer parameter
    assertEquals(result.rows[1][2], 42)

    // Check float parameter
    assertEquals(result.rows[2][3], 3.14159)

    // Check mixed parameters
    assertEquals(result.rows[3][1], 'mixed')
    assertEquals(result.rows[3][2], 100)
    assertEquals(result.rows[3][3], 2.718)
  })

  await sqlite.close()
})

Deno.test('Error Handling', async (t) => {
  const sqlite = new SQLite()
  await sqlite.initialize()

  await t.step('should handle SQL syntax errors', async () => {
    await assertRejects(
      () => sqlite.execute('INVALID SQL SYNTAX'),
      Error,
      'syntax error'
    )
  })

  await t.step('should handle constraint violations', async () => {
    await sqlite.execute(`
      CREATE TABLE unique_test (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE
      )
    `)

    await sqlite.execute('INSERT INTO unique_test (email) VALUES (?)', ['test@example.com'])

    await assertRejects(
      () => sqlite.execute('INSERT INTO unique_test (email) VALUES (?)', ['test@example.com']),
      Error,
      'UNIQUE constraint failed'
    )
  })

  await t.step('should handle table not found errors', async () => {
    await assertRejects(
      () => sqlite.execute('SELECT * FROM non_existent_table'),
      Error,
      'no such table'
    )
  })

  await sqlite.close()
})

Deno.test('Performance Monitoring', async (t) => {
  const sqlite = new SQLite()
  await sqlite.initialize()

  await t.step('should track query statistics', async () => {
    // Execute several queries
    await sqlite.execute('CREATE TABLE perf_test (id INTEGER, data TEXT)')

    for (let i = 0; i < 10; i++) {
      await sqlite.execute('INSERT INTO perf_test VALUES (?, ?)', [i, `data_${i}`])
    }

    await sqlite.execute('SELECT COUNT(*) FROM perf_test')

    const perfInfo = sqlite.getPerformanceInfo()
    assert(perfInfo.totalQueries >= 12) // At least CREATE + 10 INSERTs + SELECT
    assert(perfInfo.totalTime > 0)
  })

  await t.step('should run basic benchmarks', async () => {
    const benchmarks = await sqlite.benchmark(1000)
    assert(benchmarks.length > 0)

    for (const benchmark of benchmarks) {
      assert(benchmark.recordCount > 0)
      assert(benchmark.durationMs >= 0)
      assert(benchmark.recordsPerSecond >= 0)
      assert(typeof benchmark.simdEnabled === 'boolean')
    }
  })

  await sqlite.close()
})

Deno.test('Memory Management', async (t) => {
  await t.step('should handle multiple instances', async () => {
    const instances: SQLite[] = []

    // Create multiple SQLite instances
    for (let i = 0; i < 5; i++) {
      const sqlite = new SQLite({ maxMemoryMB: 128 })
      await sqlite.initialize()
      instances.push(sqlite)
    }

    // Use each instance
    for (let i = 0; i < instances.length; i++) {
      await instances[i].execute(`CREATE TABLE test${i} (id INTEGER, data TEXT)`)
      await instances[i].execute(`INSERT INTO test${i} VALUES (?, ?)`, [1, `test_data_${i}`])

      const result = await instances[i].execute(`SELECT * FROM test${i}`)
      assertEquals(result.rows[0][1], `test_data_${i}`)
    }

    // Clean up all instances
    for (const instance of instances) {
      await instance.close()
    }
  })

  await t.step('should handle database closure', async () => {
    const sqlite = new SQLite()
    await sqlite.initialize()

    await sqlite.execute('CREATE TABLE test (id INTEGER)')
    await sqlite.close()

    // Should throw error when trying to use after closure
    await assertRejects(
      () => sqlite.execute('SELECT * FROM test'),
      Error,
      'not initialized'
    )
  })
})

Deno.test('SIMD Optimizations', async (t) => {
  await t.step('should report SIMD capability correctly', async () => {
    const sqliteWithSIMD = new SQLite({ simdOptimizations: true })
    await sqliteWithSIMD.initialize()

    const capabilities = sqliteWithSIMD.getCapabilities()
    assertEquals(capabilities.simdSupported, true)

    await sqliteWithSIMD.close()
  })

  await t.step('should handle string operations with SIMD', async () => {
    const sqlite = new SQLite({ simdOptimizations: true })
    await sqlite.initialize()

    await sqlite.execute('CREATE TABLE string_test (id INTEGER, data TEXT)')

    // Insert test data with patterns that benefit from SIMD
    const testStrings = [
      'This string contains SIMD optimization patterns',
      'Another test string for bulk processing verification',
      'Performance testing with vectorized string operations',
      'SIMD accelerated text processing demonstration'
    ]

    for (let i = 0; i < testStrings.length; i++) {
      await sqlite.execute('INSERT INTO string_test VALUES (?, ?)', [i, testStrings[i]])
    }

    // Perform operations that should benefit from SIMD
    const result1 = await sqlite.execute('SELECT COUNT(*) FROM string_test WHERE data LIKE "%SIMD%"')
    assertEquals(result1.rows[0][0], 2) // Two strings contain "SIMD"

    const result2 = await sqlite.execute('SELECT COUNT(*) FROM string_test WHERE LENGTH(data) > 40')
    assertEquals(result2.rows[0][0], 4) // All strings are longer than 40 chars

    await sqlite.close()
  })
})