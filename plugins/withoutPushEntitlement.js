const { withEntitlementsPlist } = require('expo/config-plugins');

// expo-notifications unconditionally adds `aps-environment`, which requires a
// paid Apple Developer account. This app only schedules local notifications,
// so the entitlement isn't needed — strip it back out after prebuild.
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
