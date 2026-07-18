// __OPENCLERK_CORE_VERSION__ is normally injected by esbuild's `define` at build time (see
// scripts/build.js) -- it doesn't exist in Jest's ts-jest/jsdom environment at all, so any test
// whose DOM fixture includes a real #core-version element would hit a ReferenceError the moment
// a page's init() tries to set it. Every other test suite in this project works around that by
// simply omitting #core-version from its fixture; this file instead defines the constant for
// real; so tests that *do* want to exercise that code path (see tests/examples.test.ts) can.
global.__OPENCLERK_CORE_VERSION__ = "0.0.0-test";
