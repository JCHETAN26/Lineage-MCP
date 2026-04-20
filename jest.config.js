export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  modulePathIgnorePatterns: [
    "<rootDir>/vscode-extension/",
    "<rootDir>/vscode-extension/.vscode-test/",
  ],
  testPathIgnorePatterns: [
    "<rootDir>/vscode-extension/",
    "<rootDir>/vscode-extension/.vscode-test/",
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
