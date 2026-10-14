/* electron-builder configuration — built from the environment so signing
   only happens when the signing secrets are present. See
   scripts/builder-config.cjs and README "Code signing" / "Releasing". */
module.exports = require('./scripts/builder-config.cjs').buildConfig(process.env);
