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

module.exports = config;
