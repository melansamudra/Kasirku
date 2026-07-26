// Packages the print agent into a single kasirku-print-agent.exe that runs
// on a cashier's PC with no Node.js install required — using Node's built-in
// Single Executable Application (SEA) feature instead of `pkg`, because pkg
// needs to download a prebuilt Node binary per target and none was available
// for this Node version (it fell back to compiling Node from source, which
// needs a full native build toolchain we don't have here). SEA instead reuses
// the Node binary already running this script, so it only works building
// *on* the same OS/arch as the target — fine since we only ship for Windows.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const exePath = path.join(dist, "kasirku-print-agent.exe");
const blobPath = path.join(dist, "sea-prep.blob");
const bundlePath = path.join(dist, "bundle.cjs");

function run(cmd, args, { shell } = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  // Only npx/signtool need a shell on Windows (they resolve via PATHEXT,
  // e.g. npx.cmd); node.exe is invoked directly so its own path (which
  // contains a space, "Program Files") doesn't need shell-level quoting.
  execFileSync(cmd, args, { stdio: "inherit", cwd: root, shell: shell && process.platform === "win32" });
}

fs.mkdirSync(dist, { recursive: true });

run(
  "npx",
  ["esbuild", "src/server.ts", "--bundle", "--platform=node", "--format=cjs", "--outfile=" + bundlePath],
  { shell: true },
);

run(process.execPath, ["--experimental-sea-config", "sea-config.json"]);

fs.copyFileSync(process.execPath, exePath);

if (process.platform === "win32") {
  try {
    run("signtool", ["remove", "/s", exePath], { shell: true });
  } catch {
    // signtool not installed — fine, the copied node.exe usually isn't
    // signature-checked by Windows for a locally-run tool. Not fatal.
    console.log("(signtool not available, skipping — this is fine)");
  }
}

run(
  "npx",
  [
    "postject",
    exePath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    "--overwrite",
  ],
  { shell: true },
);

console.log(`\nBuilt ${exePath}`);
