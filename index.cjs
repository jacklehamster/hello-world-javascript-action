const core = require("@actions/core");
const os = require("os");
const fs = require("fs");
const stringify = require("json-stable-stringify");
const { execSync } = require("child_process");

async function recursePath(path, callback, options) {
  if (options?.ignore) {
    for (let f of options.ignore) {
      if (path.indexOf(f) >= 0) {
        return;
      }
    }
  }
  const isDir = fs.statSync(path).isDirectory();
  if (!isDir) {
    callback(path);
    return;
  }

  const fileList = await fs.promises.readdir(path);

  return Promise.all(
    fileList
      .map((fileName) => `${path}/${fileName}`)
      .map(async (filePath) => recursePath(filePath, callback, options))
  );
}

function getFileContentSha(filePath) {
  try {
    const command = `git hash-object ${filePath}`;
    const fileSHA = execSync(command).toString().trim();
    return fileSHA;
  } catch (error) {
    console.error(`Error getting file content SHA for ${filePath}:`, error);
    return null;
  }
}

async function getDirectoryStructure(
  rootPath,
  { ignore, cutoff = 0 },
  extension
) {
  const root = {};
  await recursePath(
    rootPath,
    async (path) => {
      if (extension && !path.endsWith(extension)) {
        return;
      }
      root[path.split("/").slice(cutoff).join("/")] = {
        sha: getFileContentSha(path),
      };
    },
    {
      ignore,
    }
  );
  return root;
}

async function saveDirectoryStructure(
  path,
  target,
  { ignore, cutoff, space },
  extension
) {
  const structure = await getDirectoryStructure(
    path,
    { ignore, cutoff },
    extension
  );

  const directories = {};
  Object.entries(structure).forEach(([key, value]) => {
    const split = key.split("/");
    for (let i = 1; i < split.length; i++) {
      const subdir = split.slice(0, i).join("/");
      if (!directories[subdir]) directories[subdir] = {};
      directories[subdir][split.slice(i).join("/")] = value;
    }
  });
  await Promise.all(
    Object.entries(directories).map(([key, value]) => {
      delete value.md5;
      value.md5 = md5(stringify(value));

      return fs.promises.writeFile(
        `${path}/${key}/${target}`,
        stringify(value, { space })
      );
    })
  );
  return json;
}

function setOutput(key, value) {
  // Temporary hack until core actions library catches up with github new recommendations
  const output = process.env["GITHUB_OUTPUT"];
  if (output) {
    fs.appendFileSync(output, `${key}=${value}${os.EOL}`);
  }
}

try {
  async function execute() {
    const directories = fs.readdirSync(".");

    const ignoreList = [
      ".git",
      "node_modules",
      `dir.json`,
      `dir-json.json`,
      ".github",
    ];

    const promises = directories.map(async (dir) => {
      if (!fs.statSync(dir).isDirectory()) {
        return;
      }
      if (ignoreList.some((i) => dir.startsWith(i))) {
        return;
      }
      const dirStructureConfig = {
        ignore: ignoreList,
        cutoff: 1,
        space: "  ",
      };
      await Promise.all([
        saveDirectoryStructure(dir, `dir.json`, dirStructureConfig).then(
          (content) => {
            console.info(content);
          }
        ),
        saveDirectoryStructure(
          dir,
          `dir-json.json`,
          dirStructureConfig,
          ".json"
        ).then((content) => {
          console.info(content);
        }),
      ]);
    });

    for (const promise of promises) {
      await promise;
    }
  }

  execute().then(() => {
    const time = new Date().getTime();
    setOutput("time", time);
  });

  // Get the JSON webhook payload for the event that triggered the workflow
  //const payload = JSON.stringify(github.context.payload, undefined, 2)
  //console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
