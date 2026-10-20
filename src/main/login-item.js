// Options for app.setLoginItemSettings. The Windows portable exe runs from a temp copy that's
// deleted on exit, so it must register the original exe electron-builder points us to.
function loginItemSettings(openAtLogin, env = process.env) {
  const settings = { openAtLogin };
  if (env.PORTABLE_EXECUTABLE_FILE) settings.path = env.PORTABLE_EXECUTABLE_FILE;
  return settings;
}

module.exports = { loginItemSettings };
