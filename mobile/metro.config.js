// Monorepo Metro config. Without this, Metro resolves modules only from
// mobile/node_modules and cannot see either the hoisted root node_modules or
// the local @adaptive-macros/engine source it imports directly from TypeScript.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so edits to the engine trigger a fast refresh.
config.watchFolders = [workspaceRoot];

// Check the app's own node_modules first, then the hoisted root one.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// npm workspaces hoists most packages to the root; without this Metro can
// resolve the same package from two paths and bundle it twice.
config.resolver.disableHierarchicalLookup = true;

// On web, expo-sqlite is a WebAssembly build of SQLite. Metro treats an
// unknown extension as a module to parse rather than a file to copy, so
// without this the .wasm import fails to resolve and the web bundle dies.
//
// No cross-origin isolation headers are needed alongside it: the web build was
// verified reading, writing and persisting across a reload on a page where
// crossOriginIsolated was false and SharedArrayBuffer was undefined.
config.resolver.assetExts.push('wasm');

module.exports = config;
