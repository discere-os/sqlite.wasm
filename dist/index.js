/**
 * SQLite.wasm Browser Interface
 * High-performance SQL database engine for WebAssembly
 * 
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under the same license as the underlying SQLite project (Public Domain)
 */

// Re-export Node.js interface for compatibility
export { default, SQLite, SQLiteDatabase, SQLiteStatement } from './node/index.js';

// Browser-specific features can be added here
export const isBrowser = typeof window !== 'undefined';
export const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;