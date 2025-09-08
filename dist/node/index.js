/**
 * SQLite.wasm Node.js Interface
 * High-performance SQL database engine for WebAssembly
 * 
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under the same license as the underlying SQLite project (Public Domain)
 */

import initSQLiteModule from '../../build/sqlite.js';

class SQLite {
    constructor() {
        this.wasmModule = null;
        this.initialized = false;
        this.SQLITE_OK = 0;
        this.SQLITE_ERROR = 1;
        this.SQLITE_BUSY = 5;
        this.SQLITE_MISUSE = 21;
        this.SQLITE_ROW = 100;
        this.SQLITE_DONE = 101;
        this.SQLITE_STATIC = 0;
        this.SQLITE_TRANSIENT = -1;
    }

    async initialize() {
        if (this.initialized) return;
        
        this.wasmModule = await initSQLiteModule();
        this.initialized = true;
    }

    open(filename = ':memory:') {
        if (!this.initialized) {
            throw new Error('SQLite module not initialized. Call initialize() first.');
        }

        const filenamePtr = this._allocateString(filename);
        const dbPtrPtr = this.wasmModule._malloc(4);

        try {
            const result = this.wasmModule._sqlite_open(filenamePtr, dbPtrPtr);
            if (result !== this.SQLITE_OK) {
                throw new Error(`Failed to open database: ${result}`);
            }

            const dbPtr = this.wasmModule.HEAP32[dbPtrPtr / 4];
            return new SQLiteDatabase(this.wasmModule, dbPtr);
        } finally {
            this.wasmModule._free(filenamePtr);
            this.wasmModule._free(dbPtrPtr);
        }
    }

    getVersion() {
        if (!this.initialized) {
            throw new Error('SQLite module not initialized. Call initialize() first.');
        }
        
        const versionPtr = this.wasmModule._sqlite_get_version();
        return this.wasmModule.UTF8ToString(versionPtr);
    }

    getVersionNumber() {
        if (!this.initialized) {
            throw new Error('SQLite module not initialized. Call initialize() first.');
        }
        
        return this.wasmModule._sqlite_get_version_number();
    }

    _allocateString(str) {
        const len = this.wasmModule.lengthBytesUTF8(str) + 1;
        const ptr = this.wasmModule._malloc(len);
        this.wasmModule.stringToUTF8(str, ptr, len);
        return ptr;
    }
}

class SQLiteDatabase {
    constructor(wasmModule, dbPtr) {
        this.wasmModule = wasmModule;
        this.dbPtr = dbPtr;
        this.closed = false;
    }

    exec(sql, callback = null) {
        if (this.closed) {
            throw new Error('Database is closed');
        }

        const sqlPtr = this._allocateString(sql);
        const errorMsgPtrPtr = this.wasmModule._malloc(4);

        try {
            const result = this.wasmModule._sqlite_exec(
                this.dbPtr, sqlPtr, 0, 0, errorMsgPtrPtr
            );

            if (result !== 0) {
                const errorMsgPtr = this.wasmModule.HEAP32[errorMsgPtrPtr / 4];
                const errorMsg = errorMsgPtr ? this.wasmModule.UTF8ToString(errorMsgPtr) : 'Unknown error';
                throw new Error(`SQL execution failed: ${errorMsg}`);
            }

            return result;
        } finally {
            this.wasmModule._free(sqlPtr);
            this.wasmModule._free(errorMsgPtrPtr);
        }
    }

    prepare(sql) {
        if (this.closed) {
            throw new Error('Database is closed');
        }

        const sqlPtr = this._allocateString(sql);
        const stmtPtrPtr = this.wasmModule._malloc(4);
        const tailPtrPtr = this.wasmModule._malloc(4);

        try {
            const result = this.wasmModule._sqlite_prepare_v2(
                this.dbPtr, sqlPtr, -1, stmtPtrPtr, tailPtrPtr
            );

            if (result !== 0) {
                throw new Error(`Failed to prepare statement: ${this.getErrorMessage()}`);
            }

            const stmtPtr = this.wasmModule.HEAP32[stmtPtrPtr / 4];
            return new SQLiteStatement(this.wasmModule, stmtPtr);
        } finally {
            this.wasmModule._free(sqlPtr);
            this.wasmModule._free(stmtPtrPtr);
            this.wasmModule._free(tailPtrPtr);
        }
    }

    changes() {
        if (this.closed) {
            throw new Error('Database is closed');
        }
        
        return this.wasmModule._sqlite_changes(this.dbPtr);
    }

    lastInsertRowId() {
        if (this.closed) {
            throw new Error('Database is closed');
        }
        
        return this.wasmModule._sqlite_last_insert_rowid(this.dbPtr);
    }

    getErrorMessage() {
        if (this.closed) {
            return 'Database is closed';
        }
        
        const errorPtr = this.wasmModule._sqlite_errmsg(this.dbPtr);
        return this.wasmModule.UTF8ToString(errorPtr);
    }

    close() {
        if (this.closed) {
            return;
        }

        this.wasmModule._sqlite_close(this.dbPtr);
        this.closed = true;
    }

    _allocateString(str) {
        const len = this.wasmModule.lengthBytesUTF8(str) + 1;
        const ptr = this.wasmModule._malloc(len);
        this.wasmModule.stringToUTF8(str, ptr, len);
        return ptr;
    }
}

class SQLiteStatement {
    constructor(wasmModule, stmtPtr) {
        this.wasmModule = wasmModule;
        this.stmtPtr = stmtPtr;
        this.finalized = false;
    }

    step() {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        return this.wasmModule._sqlite_step(this.stmtPtr);
    }

    bindText(index, value) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        const valuePtr = this._allocateString(value);
        try {
            return this.wasmModule._sqlite_bind_text(
                this.stmtPtr, index, valuePtr, -1, this.wasmModule.SQLITE_TRANSIENT || -1
            );
        } finally {
            this.wasmModule._free(valuePtr);
        }
    }

    bindInt(index, value) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        return this.wasmModule._sqlite_bind_int(this.stmtPtr, index, value);
    }

    bindDouble(index, value) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        return this.wasmModule._sqlite_bind_double(this.stmtPtr, index, value);
    }

    getColumnText(index) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        const textPtr = this.wasmModule._sqlite_column_text(this.stmtPtr, index);
        return textPtr ? this.wasmModule.UTF8ToString(textPtr) : null;
    }

    getColumnInt(index) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        return this.wasmModule._sqlite_column_int(this.stmtPtr, index);
    }

    getColumnDouble(index) {
        if (this.finalized) {
            throw new Error('Statement is finalized');
        }

        return this.wasmModule._sqlite_column_double(this.stmtPtr, index);
    }

    finalize() {
        if (this.finalized) {
            return;
        }

        this.wasmModule._sqlite_finalize(this.stmtPtr);
        this.finalized = true;
    }

    _allocateString(str) {
        const len = this.wasmModule.lengthBytesUTF8(str) + 1;
        const ptr = this.wasmModule._malloc(len);
        this.wasmModule.stringToUTF8(str, ptr, len);
        return ptr;
    }
}

// Create and export default instance
const sqlite = new SQLite();

export default sqlite;
export { SQLite, SQLiteDatabase, SQLiteStatement };