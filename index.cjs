// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

const core = require('@actions/core');
const github = require('@actions/github');
// const {saveDirectoryStructure} = require('@dobuki/recurse-directory');
const os = require("os");
const fs = require("fs");
const md5 = required("md5");
// import core from '@actions/core';
// // import {saveDirectoryStructure} from '@dobuki/recurse-directory';
// import os from 'os';
// import fs from 'fs';
const stringify = require("json-stable-stringify");


async function recursePath(path, callback, options) {
  if (options?.ignore) {
    for (let f of options.ignore) {
      if (path.startsWith(f)) {
        return;
      }
    }
  }
  const fileList = await fs.promises.readdir(path);

  return Promise.all(fileList.map(fileName => `${path}/${fileName}`)
    .map(async filePath => await (fs.statSync(filePath).isDirectory()
      ? recursePath(filePath, callback, options)
      : callback(filePath))));
}

function insertPathInStructure(pathSplit, index, structure) {
  const isFile = index === pathSplit.length - 1;
  if (isFile) {
    if (!structure.files) {
      structure.files = {};
    }
    const { mtime } = fs.statSync(pathSplit.join("/"));
    structure.files[pathSplit[index]] = mtime.getTime();
  } else {
    if (!structure.dir) {
      structure.dir = {};
    }
    const subStructure = structure.dir[pathSplit[index]] = {};
    insertPathInStructure(pathSplit, index + 1, subStructure);
  }
}

async function getDirectoryStructure(path, { ignore, cutoff = 0 }) {
  const root = {};
  await recursePath(path, async path => {
    insertPathInStructure(path.split("/"), cutoff, root);
  }, {
    ignore,
  });
  return root;
}

async function saveDirectoryStructure(path, target, { ignore, cutoff, space }) {
  const structure = await getDirectoryStructure(path, { ignore, cutoff });
  const md5Hash = md5(stringify(structure));
  structure.md5 = md5Hash;
  const json = stringify(structure, { space });
  
  await fs.promises.writeFile(target, json);
}




function setOutput(key, value) {
  // Temporary hack until core actions library catches up with github new recommendations
  const output = process.env['GITHUB_OUTPUT']
  fs.appendFileSync(output, `${key}=${value}${os.EOL}`)
}

try {
  const file = fs.readFileSync(core.getInput('file'));
  const json = JSON.parse(file);


  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  console.log(process.cwd());
  const { mtime, ctime } = fs.statSync(core.getInput('file'))
  
  json.hello = `Hello ${nameToGreet}`;
  json.mtime = mtime;
  json.ctime = ctime;

  fs.writeFileSync(core.getInput('file'), JSON.stringify(json, null, '   '));
  
  
  saveDirectoryStructure(".", "dir.json", { ignore: ['./.git', './node_modules'], cutoff: 1, space: "  " })
  .then(() => {
    const content = fs.readFileSync("dir.json", { encoding: "utf8" });
    console.info(content);
  });

  
  const time = (new Date()).getTime();
  setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}