export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  // Subprocess-spawning tests (MCP, CLI) run ~10ms on macOS but take seconds
  // on Alpine Linux due to musl/fork overhead. 30s covers worst-case CI/Docker
  // without masking actual hangs. Per-test `timeout` args still override this.
  testTimeout: 30_000,
  modulePathIgnorePatterns: [
    "<rootDir>/vscode-extension/",
    "<rootDir>/vscode-extension/.vscode-test/",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/vscode-extension/",
    "<rootDir>/vscode-extension/.vscode-test/",
    "<rootDir>/src/__tests__/fixtures/",
    "<rootDir>/dist/",
  ],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "bundler",
        },
      },
    ],
  },
};
