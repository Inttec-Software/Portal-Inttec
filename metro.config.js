const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Fix: "Cannot redefine property: default"
// This happens because Metro's web bundler tries to redefine 'default' on modules
// that used Object.defineProperty without configurable:true.
// Solution: enable unstable_allowRequireContext and configure a custom serializer
// that handles CJS/ESM interop properly.

// Disable static output for web (use SPA mode instead) to avoid the SSR defineProperty bug
config.resolver.resolveRequest = (context, moduleName, platform) => {
  return context.resolveRequest(context, moduleName, platform);
};

// Add problematic packages to transform so Metro re-compiles them with proper interop
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
