/// <reference types="vite/client" />

// `convexTest` needs every Convex module so it can run functions in-process.
// `import.meta.glob` is a Vite feature; vitest provides it for convex/ tests.
// The `!(*.*.*)` segment excludes files with a second dot — test files
// (`*.test.ts`) and config files (`*.config.ts`, `test.setup.ts`) — so only
// real Convex function modules are collected.
export const modules = import.meta.glob("./**/!(*.*.*)*.*s");
