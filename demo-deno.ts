#!/usr/bin/env deno run --allow-read --allow-write

/**
 * SQLite.wasm Deno Demo
 * Demonstrates high-performance SQLite database operations with SIMD optimizations
 */

import { SQLite } from './src/lib/index.ts'

async function main() {
  console.log('🗄️  SQLite.wasm Deno Demo')
  console.log('=========================')

  try {
    // Initialize SQLite with SIMD optimizations
    const sqlite = new SQLite({
      simdOptimizations: true,
      maxMemoryMB: 512,
      enableFTS: true,
      enableJSON: true,
      enableRTree: true
    })

    console.log('\n📦 Initializing SQLite WASM module...')
    await sqlite.initialize()

    // Display capabilities
    const capabilities = sqlite.getCapabilities()
    console.log('\n✅ SQLite Capabilities:')
    console.log(`   Version: ${capabilities.version}`)
    console.log(`   SIMD Optimizations: ${capabilities.simdSupported ? '✅' : '❌'}`)
    console.log(`   Max Memory: ${capabilities.maxMemoryMB}MB`)
    console.log(`   Features:`)
    console.log(`     • Full Text Search (FTS4/5): ${capabilities.features.fts4 ? '✅' : '❌'}`)
    console.log(`     • JSON1 Extension: ${capabilities.features.json1 ? '✅' : '❌'}`)
    console.log(`     • R-Tree Spatial Index: ${capabilities.features.rtree ? '✅' : '❌'}`)

    console.log('\n📊 Creating sample database schema...')

    // Create tables with various SQLite features
    await sqlite.execute(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        profile JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    await sqlite.execute(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        content TEXT,
        tags JSON,
        location POINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Enable Full Text Search on posts
    if (capabilities.features.fts5) {
      await sqlite.execute(`
        CREATE VIRTUAL TABLE posts_fts USING fts5(title, content, content='posts', content_rowid='id')
      `)
    }

    console.log('\n📝 Inserting sample data...')

    // Insert users with JSON profiles
    const users = [
      {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        profile: JSON.stringify({
          bio: 'Software engineer passionate about databases',
          skills: ['TypeScript', 'Rust', 'WebAssembly'],
          location: { city: 'San Francisco', country: 'USA' }
        })
      },
      {
        name: 'Bob Smith',
        email: 'bob@example.com',
        profile: JSON.stringify({
          bio: 'Data scientist exploring WASM performance',
          skills: ['Python', 'SQL', 'Machine Learning'],
          location: { city: 'New York', country: 'USA' }
        })
      },
      {
        name: 'Carol Davis',
        email: 'carol@example.com',
        profile: JSON.stringify({
          bio: 'Full-stack developer building modern web apps',
          skills: ['JavaScript', 'React', 'Node.js'],
          location: { city: 'London', country: 'UK' }
        })
      }
    ]

    for (const user of users) {
      await sqlite.execute(
        'INSERT INTO users (name, email, profile) VALUES (?, ?, ?)',
        [user.name, user.email, user.profile]
      )
    }

    // Insert posts with JSON tags
    const posts = [
      {
        userId: 1,
        title: 'Getting Started with SQLite WASM',
        content: 'SQLite compiled to WebAssembly offers incredible performance for client-side databases. With SIMD optimizations, string operations are blazingly fast.',
        tags: JSON.stringify(['sqlite', 'wasm', 'performance', 'simd'])
      },
      {
        userId: 2,
        title: 'SIMD Optimizations in Database Operations',
        content: 'Single Instruction Multiple Data (SIMD) processing can dramatically improve database performance for bulk operations and string processing.',
        tags: JSON.stringify(['simd', 'optimization', 'performance', 'databases'])
      },
      {
        userId: 3,
        title: 'Building Modern Web Applications',
        content: 'Modern web applications benefit from client-side databases that can handle complex queries without server round-trips.',
        tags: JSON.stringify(['web-development', 'client-side', 'databases'])
      }
    ]

    for (const post of posts) {
      await sqlite.execute(
        'INSERT INTO posts (user_id, title, content, tags) VALUES (?, ?, ?, ?)',
        [post.userId, post.title, post.content, post.tags]
      )
    }

    console.log('\n🔍 Querying data with JSON operations...')

    // Query users with JSON path expressions
    const usersFromUSA = await sqlite.execute(`
      SELECT name, email, json_extract(profile, '$.location.city') as city
      FROM users
      WHERE json_extract(profile, '$.location.country') = 'USA'
    `)

    console.log('\n👥 Users from USA:')
    for (const row of usersFromUSA.rows) {
      console.log(`   • ${row[0]} (${row[1]}) - ${row[2]}`)
    }

    // Query posts with JSON array operations
    const simdPosts = await sqlite.execute(`
      SELECT title, json_extract(tags, '$') as tags
      FROM posts
      WHERE json_extract(tags, '$') LIKE '%simd%'
    `)

    console.log('\n🏷️  Posts tagged with SIMD:')
    for (const row of simdPosts.rows) {
      console.log(`   • ${row[0]}`)
      console.log(`     Tags: ${row[1]}`)
    }

    console.log('\n🚀 Running performance benchmarks...')

    // Benchmark database operations
    const benchmarkResults = await sqlite.benchmark(5000)

    console.log('\n📈 Benchmark Results:')
    for (const result of benchmarkResults) {
      console.log(`   ${result.operation}:`)
      console.log(`     Records: ${result.recordCount.toLocaleString()}`)
      console.log(`     Duration: ${result.durationMs.toFixed(2)}ms`)
      console.log(`     Rate: ${result.recordsPerSecond.toLocaleString()} records/sec`)
      console.log(`     SIMD: ${result.simdEnabled ? '✅' : '❌'}`)
      console.log()
    }

    // Display performance statistics
    const performanceInfo = sqlite.getPerformanceInfo()
    console.log('📊 Performance Statistics:')
    console.log(`   Total Queries: ${performanceInfo.totalQueries}`)
    console.log(`   Total Time: ${performanceInfo.totalTime.toFixed(2)}ms`)
    console.log(`   Average Query Time: ${(performanceInfo.totalTime / performanceInfo.totalQueries).toFixed(2)}ms`)
    console.log(`   SIMD Operations: ${performanceInfo.simdOperationsCount}`)

    console.log('\n🧹 Cleaning up...')
    await sqlite.close()

    console.log('\n✅ SQLite.wasm demo completed successfully!')
    console.log('\nKey Features Demonstrated:')
    console.log('• SIMD-optimized database operations')
    console.log('• JSON1 extension for complex data')
    console.log('• Full Text Search capabilities')
    console.log('• Real performance benchmarking')
    console.log('• TypeScript-first API design')
    console.log('• Memory-efficient WASM implementation')

  } catch (error) {
    console.error('❌ Demo failed:', error)
    Deno.exit(1)
  }
}

if (import.meta.main) {
  await main()
}