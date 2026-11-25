// Locks down the packaged Electron binary (Electron fuses). These can't be changed at runtime.
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false,
    [FuseV1Options.RunAsNode]: false, // ELECTRON_RUN_AS_NODE can't turn mncord.exe into a plain Node shell
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // no NODE_OPTIONS injection
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // no --inspect debugger attach
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // tampered app.asar won't load
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
};
