// ============================================================
// DHAS — Backend/utils/suggestions.js
//
// FIX P3.1 — This file no longer duplicates diet/remedy data.
//             It re-exports from health-data-node.js which is
//             the single source of truth.
//
// All existing callers that do:
//   const { getSuggestions } = require("./suggestions");
// continue to work unchanged.
// ============================================================

const { getSuggestions } = require("./health-data-node");

module.exports = { getSuggestions };