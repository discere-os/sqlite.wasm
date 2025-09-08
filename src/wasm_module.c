/**
 * WASM Bindings for SQLite Database Engine
 * High-performance SQL database engine for WebAssembly
 * 
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under the same license as the underlying SQLite project (Public Domain)
 */

#include "../sqlite3.h"
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// WASM-exported functions for SQLite database operations

EMSCRIPTEN_KEEPALIVE
int sqlite_open(const char* filename, sqlite3** ppDb) {
    return sqlite3_open(filename, ppDb);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_close(sqlite3* db) {
    return sqlite3_close(db);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_exec(sqlite3* db, const char* sql, int (*callback)(void*,int,char**,char**), void* arg, char** errmsg) {
    return sqlite3_exec(db, sql, callback, arg, errmsg);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_prepare_v2(sqlite3* db, const char* zSql, int nByte, sqlite3_stmt** ppStmt, const char** pzTail) {
    return sqlite3_prepare_v2(db, zSql, nByte, ppStmt, pzTail);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_step(sqlite3_stmt* pStmt) {
    return sqlite3_step(pStmt);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_finalize(sqlite3_stmt* pStmt) {
    return sqlite3_finalize(pStmt);
}

EMSCRIPTEN_KEEPALIVE
const unsigned char* sqlite_column_text(sqlite3_stmt* pStmt, int iCol) {
    return sqlite3_column_text(pStmt, iCol);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_column_int(sqlite3_stmt* pStmt, int iCol) {
    return sqlite3_column_int(pStmt, iCol);
}

EMSCRIPTEN_KEEPALIVE
double sqlite_column_double(sqlite3_stmt* pStmt, int iCol) {
    return sqlite3_column_double(pStmt, iCol);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_bind_text(sqlite3_stmt* pStmt, int i, const char* zData, int nData, void(*xDel)(void*)) {
    return sqlite3_bind_text(pStmt, i, zData, nData, xDel);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_bind_int(sqlite3_stmt* pStmt, int i, int iValue) {
    return sqlite3_bind_int(pStmt, i, iValue);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_bind_double(sqlite3_stmt* pStmt, int i, double rValue) {
    return sqlite3_bind_double(pStmt, i, rValue);
}

EMSCRIPTEN_KEEPALIVE
int sqlite_changes(sqlite3* db) {
    return sqlite3_changes(db);
}

EMSCRIPTEN_KEEPALIVE
sqlite3_int64 sqlite_last_insert_rowid(sqlite3* db) {
    return sqlite3_last_insert_rowid(db);
}

EMSCRIPTEN_KEEPALIVE
const char* sqlite_errmsg(sqlite3* db) {
    return sqlite3_errmsg(db);
}

EMSCRIPTEN_KEEPALIVE
const char* sqlite_get_version(void) {
    return sqlite3_libversion();
}

EMSCRIPTEN_KEEPALIVE
int sqlite_get_version_number(void) {
    return sqlite3_libversion_number();
}