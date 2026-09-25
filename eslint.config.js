// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  {
    ignores: [
      "dist/**",
      "backend/**",
      "supabase/**",
      ".expo/**",
      "node_modules/**",
      "test-results/**",
      "facturapi-template/**",
      "scripts/**"
    ]
  },
  expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
    }
  }
]);
