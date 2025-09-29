
/**
 * 
 * ASAR Packaging Compatibility Issue with 7zip-bin
 * Problem Description
 * Error: spawn ENOTDIR when using 7zip-min for archive extraction in Electron applications packaged with ASAR.
 * 
 * Symptoms:
 * ✅ Works perfectly in development mode (npm run dev)
 * ❌ Fails in production mode (npm run dist:mac) with spawn ENOTDIR error
 * Error originates from 7zip-bin module's binary spawning mechanism
 * 
 * The Core Issue
 * The 7zip-bin package uses __dirname to construct paths to binary executables:
 * path.join(__dirname, "mac", process.arch, "7za")
 */

"use strict"

const path = require("path")

function getPath() {
  if (process.env.USE_SYSTEM_7ZA === "true") {
    return "7za"
  }

  // Handle ASAR packaging - check if __dirname points to ASAR
  let baseDir = __dirname
  if (baseDir.includes('.asar')) {
    // Replace .asar with .asar.unpacked to point to extracted files
    baseDir = baseDir.replace('.asar', '.asar.unpacked')
  }

  if (process.platform === "darwin") {
    return path.join(baseDir, "mac", process.arch, "7za")
  }
  else if (process.platform === "win32") {
    return path.join(baseDir, "win", process.arch, "7za.exe")
  }
  else {
    return path.join(baseDir, "linux", process.arch, "7za")
  }
}

exports.path7za = getPath()

// Handle ASAR packaging for path7x as well
let baseDirFor7x = __dirname
if (baseDirFor7x.includes('.asar')) {
  baseDirFor7x = baseDirFor7x.replace('.asar', '.asar.unpacked')
}
exports.path7x = path.join(baseDirFor7x, "7x.sh")

/**
 * Original Code from 7zip-bin/index.js (for reference)
 */
// "use strict"

// const path = require("path")

// function getPath() {
//   if (process.env.USE_SYSTEM_7ZA === "true") {
//     return "7za"
//   }

//   if (process.platform === "darwin") {
//     return path.join(__dirname, "mac", process.arch, "7za")
//   }
//   else if (process.platform === "win32") {
//     return path.join(__dirname, "win", process.arch, "7za.exe")
//   }
//   else {
//     return path.join(__dirname, "linux", process.arch, "7za")
//   }
// }

// exports.path7za = getPath()
// exports.path7x = path.join(__dirname, "7x.sh")