/**
 * WASM Bindings for SQLite Database Engine (SIMD Optimized)
 * High-performance SQL database engine with SIMD optimizations for WebAssembly
 * 
 * Copyright (c) 2025 Superstruct Ltd, New Zealand
 * Licensed under the same license as the underlying SQLite project (Public Domain)
 */

#include "../sqlite3.h"
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// SIMD support detection and includes
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#define HAS_SIMD 1
#else
#define HAS_SIMD 0
#endif

// Runtime SIMD detection
static int simd_available = -1;

EMSCRIPTEN_KEEPALIVE
int sqlite_has_simd(void) {
    if (simd_available == -1) {
        simd_available = HAS_SIMD;
    }
    return simd_available;
}

// SIMD-optimized string operations for SQLite query processing
#ifdef __wasm_simd128__

// SIMD-optimized string comparison for WHERE clause processing
static int simd_strcmp(const char* s1, const char* s2, size_t len) {
    if (!s1 || !s2 || len == 0) {
        return s1 == s2 ? 0 : (s1 ? 1 : -1);
    }
    
    const uint8_t* p1 = (const uint8_t*)s1;
    const uint8_t* p2 = (const uint8_t*)s2;
    size_t i = 0;
    
    // Process 16 bytes at a time with SIMD
    const size_t simd_end = (len / 16) * 16;
    for (i = 0; i < simd_end; i += 16) {
        v128_t v1 = wasm_v128_load(&p1[i]);
        v128_t v2 = wasm_v128_load(&p2[i]);
        v128_t cmp = wasm_i8x16_eq(v1, v2);
        
        // If any bytes differ, find the first difference
        if (wasm_i8x16_bitmask(cmp) != 0xFFFF) {
            for (size_t j = i; j < i + 16 && j < len; j++) {
                if (p1[j] != p2[j]) {
                    return (int)p1[j] - (int)p2[j];
                }
            }
        }
    }
    
    // Handle remaining bytes
    for (; i < len; i++) {
        if (p1[i] != p2[i]) {
            return (int)p1[i] - (int)p2[i];
        }
    }
    
    return 0;
}

// SIMD-optimized string search for LIKE operations
static const char* simd_strstr(const char* haystack, const char* needle, size_t haystack_len, size_t needle_len) {
    if (!haystack || !needle || needle_len == 0) return haystack;
    if (needle_len > haystack_len) return NULL;
    
    // For small patterns, use standard search
    if (needle_len < 4 || haystack_len < 16) {
        return strstr(haystack, needle);
    }
    
    // SIMD-accelerated search for first character
    const v128_t needle_first = wasm_i8x16_splat(needle[0]);
    const size_t search_end = haystack_len - needle_len + 1;
    
    for (size_t i = 0; i < search_end; i += 16) {
        const size_t remaining = search_end - i;
        const size_t check_len = remaining < 16 ? remaining : 16;
        
        if (i + 16 <= haystack_len) {
            v128_t haystack_chunk = wasm_v128_load((const uint8_t*)&haystack[i]);
            v128_t cmp = wasm_i8x16_eq(haystack_chunk, needle_first);
            uint32_t mask = wasm_i8x16_bitmask(cmp);
            
            // Check each potential match
            for (int bit = 0; bit < 16 && (i + bit) < search_end; bit++) {
                if (mask & (1 << bit)) {
                    if (simd_strcmp(&haystack[i + bit], needle, needle_len) == 0) {
                        return &haystack[i + bit];
                    }
                }
            }
        } else {
            // Handle remaining bytes with standard search
            for (size_t j = i; j < search_end; j++) {
                if (haystack[j] == needle[0] && strncmp(&haystack[j], needle, needle_len) == 0) {
                    return &haystack[j];
                }
            }
            break;
        }
    }
    
    return NULL;
}

// SIMD-optimized memory operations for bulk data processing
static void* simd_memcpy(void* dest, const void* src, size_t n) {
    uint8_t* d = (uint8_t*)dest;
    const uint8_t* s = (const uint8_t*)src;
    size_t i = 0;
    
    // Process 16 bytes at a time with SIMD
    const size_t simd_end = (n / 16) * 16;
    for (i = 0; i < simd_end; i += 16) {
        v128_t data = wasm_v128_load(&s[i]);
        wasm_v128_store(&d[i], data);
    }
    
    // Handle remaining bytes
    for (; i < n; i++) {
        d[i] = s[i];
    }
    
    return dest;
}

// SIMD-optimized integer array processing for index operations
static void simd_process_int_array(int* array, size_t count, int operation, int operand) {
    size_t i = 0;
    
    if (count >= 4) {
        const v128_t operand_vec = wasm_i32x4_splat(operand);
        const size_t simd_end = (count / 4) * 4;
        
        for (i = 0; i < simd_end; i += 4) {
            v128_t data_vec = wasm_v128_load(&array[i]);
            v128_t result_vec;
            
            switch (operation) {
                case 0: // Add
                    result_vec = wasm_i32x4_add(data_vec, operand_vec);
                    break;
                case 1: // Subtract
                    result_vec = wasm_i32x4_sub(data_vec, operand_vec);
                    break;
                case 2: // Multiply
                    result_vec = wasm_i32x4_mul(data_vec, operand_vec);
                    break;
                case 3: // Compare (set to 1 if equal, 0 otherwise)
                    result_vec = wasm_i32x4_eq(data_vec, operand_vec);
                    break;
                default:
                    result_vec = data_vec;
            }
            
            wasm_v128_store(&array[i], result_vec);
        }
    }
    
    // Handle remaining elements
    for (; i < count; i++) {
        switch (operation) {
            case 0: array[i] += operand; break;
            case 1: array[i] -= operand; break;
            case 2: array[i] *= operand; break;
            case 3: array[i] = (array[i] == operand) ? 1 : 0; break;
        }
    }
}

#endif // __wasm_simd128__

// Enhanced SQLite functions with SIMD optimization where beneficial

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
    static char version_str[64];
    const char* base_version = sqlite3_libversion();
    
    if (sqlite_has_simd()) {
        snprintf(version_str, sizeof(version_str), "%s-SIMD", base_version);
    } else {
        snprintf(version_str, sizeof(version_str), "%s", base_version);
    }
    
    return version_str;
}

EMSCRIPTEN_KEEPALIVE
int sqlite_get_version_number(void) {
    return sqlite3_libversion_number();
}

// SIMD-enhanced utility functions for bulk operations
EMSCRIPTEN_KEEPALIVE
int sqlite_bulk_string_compare(const char* str1, const char* str2, int length) {
#ifdef __wasm_simd128__
    if (sqlite_has_simd() && length >= 16) {
        return simd_strcmp(str1, str2, length);
    }
#endif
    return strncmp(str1, str2, length);
}

EMSCRIPTEN_KEEPALIVE
const char* sqlite_enhanced_search(const char* text, const char* pattern, int text_len, int pattern_len) {
#ifdef __wasm_simd128__
    if (sqlite_has_simd() && text_len >= 16 && pattern_len >= 4) {
        return simd_strstr(text, pattern, text_len, pattern_len);
    }
#endif
    return strstr(text, pattern);
}

EMSCRIPTEN_KEEPALIVE
void sqlite_bulk_memory_copy(void* dest, const void* src, size_t size) {
#ifdef __wasm_simd128__
    if (sqlite_has_simd() && size >= 64) {
        simd_memcpy(dest, src, size);
        return;
    }
#endif
    memcpy(dest, src, size);
}

EMSCRIPTEN_KEEPALIVE
void sqlite_process_integer_array(int* array, int count, int operation, int operand) {
#ifdef __wasm_simd128__
    if (sqlite_has_simd() && count >= 4) {
        simd_process_int_array(array, count, operation, operand);
        return;
    }
#endif
    
    // Fallback implementation
    for (int i = 0; i < count; i++) {
        switch (operation) {
            case 0: array[i] += operand; break;
            case 1: array[i] -= operand; break;
            case 2: array[i] *= operand; break;
            case 3: array[i] = (array[i] == operand) ? 1 : 0; break;
        }
    }
}

// Performance benchmarking functions
EMSCRIPTEN_KEEPALIVE
double sqlite_benchmark_string_ops(const char* test_string, int string_length, int iterations) {
    if (!test_string || iterations <= 0) return -1.0;
    
    double start_time = emscripten_get_now();
    
    // Benchmark string comparison operations
    for (int i = 0; i < iterations; i++) {
        volatile int result = sqlite_bulk_string_compare(test_string, test_string, string_length);
        (void)result; // Prevent optimization
    }
    
    double end_time = emscripten_get_now();
    
    // Return operations per second
    double total_time = (end_time - start_time) / 1000.0;
    return iterations / total_time;
}

EMSCRIPTEN_KEEPALIVE
double sqlite_benchmark_bulk_operations(int array_size, int iterations) {
    int* test_array = (int*)malloc(array_size * sizeof(int));
    if (!test_array) return -1.0;
    
    // Initialize test data
    for (int i = 0; i < array_size; i++) {
        test_array[i] = i % 1000;
    }
    
    double start_time = emscripten_get_now();
    
    // Benchmark bulk integer operations
    for (int i = 0; i < iterations; i++) {
        sqlite_process_integer_array(test_array, array_size, i % 4, 10);
    }
    
    double end_time = emscripten_get_now();
    free(test_array);
    
    // Return operations per second
    double total_time = (end_time - start_time) / 1000.0;
    return iterations / total_time;
}

// SIMD feature and performance information
EMSCRIPTEN_KEEPALIVE
void sqlite_get_performance_info(int* has_simd, int* string_threshold, int* bulk_threshold) {
    *has_simd = sqlite_has_simd();
    *string_threshold = 16;  // Minimum string length for SIMD operations
    *bulk_threshold = 64;    // Minimum data size for SIMD bulk operations
}

// Custom aggregate function for SIMD-optimized SUM operations
EMSCRIPTEN_KEEPALIVE
void sqlite_register_simd_functions(sqlite3* db) {
    // This would register custom SIMD-optimized aggregate functions
    // Implementation would depend on specific SQLite extension API usage
    // For now, this is a placeholder for future enhancement
    (void)db;
}