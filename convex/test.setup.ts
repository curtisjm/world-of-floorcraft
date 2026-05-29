// Convex test module registry for `convex-test`.
//
// `convexTest` needs every Convex runtime module so it can run functions
// in-process — including the generated `_generated/*.js` files, which it uses
// to locate the Convex root directory.
//
// `import.meta.glob` is a Vite/Vitest compile-time macro. The rate limiter
// component test helper references `vite/client`, which provides the ambient
// `ImportMeta.glob` type for the test TypeScript program.
//
// The extglob form from the Convex docs (`import.meta.glob("./**/!(*.*.*)
// *.*s")`) resolves to an empty set under this project's Vite/Vitest version,
// so the array form is used: one positive pattern plus negative patterns that
// drop type declarations, test files, and config modules (none of which are
// Convex functions).

export const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.d.ts",
  "!./**/*.test.{js,ts}",
  "!./**/*.config.{js,ts}",
  "!./test.setup.{js,ts}",
]);
