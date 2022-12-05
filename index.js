const core = require('@actions/core');
const github = require('@actions/github');
const os = require("os")
const fs = require("fs")

function setOutput(key, value) {
  // Temporary hack until core actions library catches up with github new recommendations
  const output = process.env['GITHUB_OUTPUT']
  fs.appendFileSync(output, `${key}=${value}${os.EOL}`)
}

try {
  const file = fs.readFileSync(core.getInput('file'));
  const json = JSON.parse(packageJson);


  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  json.hello = `Hello ${nameToGreet}`;

  fs.writeFileSync(core.getInput('file'), JSON.stringify(json, null, '   '));

  const time = (new Date()).getTime();
  setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
