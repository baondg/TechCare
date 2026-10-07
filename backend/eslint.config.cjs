const js = require("@eslint/js");
const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

/** All configuration goes through src/config/env.ts (validated once at startup). */
const noProcessEnv = [
  "error",
  { object: "process", property: "env", message: "Read configuration from src/config/env (config.*) instead." },
];

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-properties": noProcessEnv,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Most of src/ is still CommonJS JavaScript — lint it too (bugs, not style).
    files: ["src/**/*.js", "test/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Pre-existing findings; tracked as warnings until the owning modules are refactored.
      "no-useless-escape": "warn",
      "no-useless-assignment": "warn",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: ["src/**/*.js"],
    rules: { "no-restricted-properties": noProcessEnv },
  },
  {
    // The config module itself, and the logger (must not depend on config).
    files: ["src/config/env.ts", "src/common/logger.ts"],
    rules: { "no-restricted-properties": "off" },
  },
];
