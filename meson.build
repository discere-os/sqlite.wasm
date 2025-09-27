project('sqlite.wasm', ['c'], version: '3.47.0', meson_version: '>=1.3.0', default_options: ['buildtype=release'])

if get_option('simd')
  add_project_arguments('-msimd128', language: 'c')
endif

incs = [ include_directories('.') ]

core = static_library('sqlite_core', ['sqlite3.c'], include_directories: incs,
  c_args: ['-DSQLITE_OMIT_LOAD_EXTENSION', '-DSQLITE_THREADSAFE=0', '-DSQLITE_DEFAULT_MEMSTATUS=0', '-DSQLITE_OMIT_WAL'])

if get_option('main_module')
  executable('sqlite-main', 'src/sqlite_wasm_module.c',
    link_with: core, include_directories: incs, install: true,
    link_args: [
      '--no-entry','-sMODULARIZE=1','-sEXPORT_ES6=1','-sALLOW_MEMORY_GROWTH=1',
      '-sENVIRONMENT=web,webview,worker','-sNO_FILESYSTEM=1',
      '-sEXPORTED_RUNTIME_METHODS=["cwrap","ccall","UTF8ToString"]',
      '-sEXPORTED_FUNCTIONS=@' + meson.project_source_root() / get_option('exports'),
    ])
endif

if get_option('side_module')
  shared_module('sqlite-side', 'src/sqlite_wasm_side.c',
    link_whole: core, include_directories: incs, name_prefix: '',
    install: true, link_args: ['-sSIDE_MODULE=2', '-fPIC'])
endif
