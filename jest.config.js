module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.ts"],
  // See tests/globalSetup.js: works around a broken (native-binding-missing) `canvas` install
  // crashing every suite via jest-environment-jsdom, not just PDF-related ones.
  globalSetup: "<rootDir>/tests/globalSetup.js",
  // Runs inside each test file's own jsdom environment (unlike globalSetup above) -- see
  // tests/setupGlobals.js for why this exists.
  setupFiles: ["<rootDir>/tests/setupGlobals.js"],
};
