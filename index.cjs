const core = require("@actions/core");
const os = require("os");
const fs = require("fs");
const md5 = require("md5");
const stringify = require("json-stable-stringify");
const { execSync } = require("child_process");

async function recursePath(path, callback, options) {
  if (options?.ignore) {
    for (let f of options.ignore) {
      if (path.startsWith(f)) {
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

function getGitCommitSha(filePath) {
  try {
    const command = `git log -1 --format=%H -- ${filePath}`;
    const commitSHA = execSync(command).toString().trim();
    return commitSHA;
  } catch (error) {
    console.error(`Error getting git commit time for ${filePath}:`, error);
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
        sha: getGitCommitSha(path),
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
  const md5Hash = md5(stringify(structure));
  structure.md5 = md5Hash;
  const json = stringify(structure, { space });

  await fs.promises.writeFile(target, json);
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
    console.log(directories);

    const ignore = [".git", "node_modules"];

    const promises = directories.map(async (dir) => {
      if (!fs.statSync(dir).isDirectory()) {
        return;
      }
      if (ignore.some((i) => dir.startsWith(i))) {
        return;
      }
      const ignoreList = [...ignore, `${dir}/dir.json`, `${dir}/dir-json.json`];
      const dirStructureConfig = {
        ignore: ignoreList,
        cutoff: 1,
        space: "  ",
      };
      await Promise.all([
        saveDirectoryStructure(dir, `${dir}/dir.json`, dirStructureConfig).then(
          () => {
            const content = fs.readFileSync(`${dir}/dir.json`, {
              encoding: "utf8",
            });
            console.info(content);
          }
        ),
        saveDirectoryStructure(
          dir,
          `${dir}/dir-json.json`,
          dirStructureConfig,
          ".json"
        ).then(() => {
          const content = fs.readFileSync(`${dir}/dir-json.json`, {
            encoding: "utf8",
          });
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
