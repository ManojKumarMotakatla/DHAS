// ============================================================
// DHAS — Backend/utils/SeverityLogic.js
//
// FIX P3.1 — This file no longer duplicates condition data.
//             It re-exports from health-data-node.js which is
//             the single source of truth.
//
// All existing callers that do:
//   const { detectCondition, CONDITIONS } = require("./SeverityLogic");
// continue to work unchanged.
// ============================================================

const { CONDITIONS, detectCondition } = require("./health-data-node");

module.exports = { detectCondition, CONDITIONS };