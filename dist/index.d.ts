/**
 * TypeScript definitions for SQLite.wasm
 * High-performance SQL database engine compiled to WebAssembly
 */

export declare class SQLite {
    constructor();
    initialize(): Promise<void>;
    open(filename?: string): SQLiteDatabase;
    getVersion(): string;
    getVersionNumber(): number;
}

export declare class SQLiteDatabase {
    constructor(wasmModule: any, dbPtr: number);
    exec(sql: string, callback?: Function): number;
    prepare(sql: string): SQLiteStatement;
    changes(): number;
    lastInsertRowId(): number;
    getErrorMessage(): string;
    close(): void;
}

export declare class SQLiteStatement {
    constructor(wasmModule: any, stmtPtr: number);
    step(): number;
    bindText(index: number, value: string): number;
    bindInt(index: number, value: number): number;
    bindDouble(index: number, value: number): number;
    getColumnText(index: number): string | null;
    getColumnInt(index: number): number;
    getColumnDouble(index: number): number;
    finalize(): void;
}

declare const sqlite: SQLite;
export default sqlite;

// SQLite constants
export declare const SQLITE_OK: number;
export declare const SQLITE_ERROR: number;
export declare const SQLITE_BUSY: number;
export declare const SQLITE_MISUSE: number;
export declare const SQLITE_ROW: number;
export declare const SQLITE_DONE: number;