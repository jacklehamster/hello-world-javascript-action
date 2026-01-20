const core = require("@actions/core");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const md5 = require("md5");
const stringify = require("json-stable-stringify");

// -----------------------------
// helpers
// -----------------------------
async function recursePath(path, callback, options) {
  if (options?.ignore) {
    for (let f of options.ignore) {
      if (path.indexOf(f) >= 0) return;
    }
  }
  const isDir = fs.statSync(path).isDirectory();
  if (!isDir) {
    await callback(path);
    return;
  }

  const fileList = await fs.promises.readdir(path);
  return Promise.all(
    fileList
      .map((fileName) => `${path}/${fileName}`)
      .map((filePath) => recursePath(filePath, callback, options))
  );
}

/**
 * Read existing dir.json for a specific folder (path/key), if present.
 * Returns parsed object or null.
 */
function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Could not read/parse ${filePath}, will regenerate fresh.`);
    return null;
  }
}

/**
 * Stable created timestamp:
 * - If previous snapshot has createdAt for this file, keep it.
 * - Else use filesystem birthtimeMs; if unreliable, fall back to ctimeMs.
 */
function getStableCreatedAt(filePath, previousEntry) {
  if (previousEntry && typeof previousEntry.createdAt === "number") {
    return previousEntry.createdAt;
  }
  try {
    const st = fs.statSync(filePath);
    const birth = st.birthtimeMs;
    const ctime = st.ctimeMs;
    // Some platforms/filesystems may give birthtimeMs=0 or NaN-ish values.
    const createdAt = Number.isFinite(birth) && birth > 0 ? birth : ctime;
    return createdAt;
  } catch (error) {
    console.error(`Error stat() for ${filePath}:`, error);
    return null;
  }
}

async function getDirectoryStructure(
  rootPath,
  { ignore, cutoff = 0, previousSnapshot = null },
  extension
) {
  const root = {};
  await recursePath(
    rootPath,
    async (path) => {
      if (extension && !path.endsWith(extension)) return;

      const rel = path.split("/").slice(cutoff).join("/");
      const prevEntry = previousSnapshot?.[rel];

      root[rel] = {
        createdAt: getStableCreatedAt(path, prevEntry),
      };
    },
    { ignore }
  );
  return root;
}

/**
 * Writes snapshot files into each subdir entry, BUT:
 * - If onlyIfExists === true, only writes target if `${path}/${key}/${target}` already exists.
 * - When writing, it preserves createdAt values from the existing target file in that folder.
 */
async function saveDirectoryStructure(
  path,
  target,
  { ignore, cutoff, space, onlyIfExists = false },
  extension
) {
  // Build directories map first (same as you had)
  // but we need the global structure first.
  // We'll read previous per-folder snapshots when writing each folder.
  const structure = await getDirectoryStructure(path, { ignore, cutoff }, extension);

  const directories = {};
  Object.entries(structure).forEach(([key, value]) => {
    const split = key.split("/");
    for (let i = 0; i < split.length; i++) {
      const subdir = split.slice(0, i).join("/");
      if (!directories[subdir]) directories[subdir] = {};
      directories[subdir][split.slice(i).join("/")] = value;
    }
  });

  await Promise.all(
    Object.entries(directories).map(async ([key, value]) => {
      const outPath = `${path}/${key}/${target}`;

      if (onlyIfExists && !fs.existsSync(outPath)) {
        // Requirement (1): don't create it if it doesn't already exist in that folder
        return;
      }

      // Requirement (2): preserve createdAt from existing snapshot in THIS folder
      const previous = tryReadJson(outPath);
      const previousEntries = previous && typeof previous === "object" ? previous : null;

      // Merge: for each entry we’re about to write, if old has createdAt, keep it
      for (const [entryKey, entryVal] of Object.entries(value)) {
        const prevEntry = previousEntries?.[entryKey];
        if (prevEntry && typeof prevEntry.createdAt === "number") {
          entryVal.createdAt = prevEntry.createdAt;
        }
      }

      // md5 over stable contents (createdAt only) + md5 field itself
      delete value.md5;
      value.md5 = md5(stringify(value));

      console.log("writing", outPath);
      await fs.promises.writeFile(outPath, stringify(value, { space }));
    })
  );

  return directories;
}

function setOutput(key, value) {
  const output = process.env["GITHUB_OUTPUT"];
  if (output) fs.appendFileSync(output, `${key}=${value}${os.EOL}`);
}

try {
  async function execute() {
    const directories = fs.readdirSync(".");

    const ignoreList = [".git", "node_modules", "dir.json", "dir-json.json", ".github"];

    const promises = directories.map(async (dir) => {
      if (!fs.statSync(dir).isDirectory()) return;
      if (ignoreList.some((i) => dir.startsWith(i))) return;

      const dirStructureConfig = {
        ignore: ignoreList,
        cutoff: 1,
        space: "  ",
      };

      await Promise.all([
        // (1) Only generate dir.json if it already exists in that folder (and subfolders)
        saveDirectoryStructure(dir, "dir.json", { ...dirStructureConfig, onlyIfExists: true }),

        // Keep generating dir-json.json as before (you didn't ask to change this behavior)
        saveDirectoryStructure(dir, "dir-json.json", dirStructureConfig, ".json"),
      ]);
    });

    for (const promise of promises) await promise;
  }

  execute().then(() => {
    const time = new Date().getTime();
    setOutput("time", time);
  });
} catch (error) {
  core.setFailed(error.message);
}
