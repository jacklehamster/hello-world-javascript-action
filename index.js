const core = require('@actions/core');
const github = require('@actions/github');

function setOutput(key, value) {
  // Temporary hack until core actions library catches up with github new recommendations
  const output = process.env['GITHUB_OUTPUT']
  fs.appendFileSync(output, `${key}=${value}${os.EOL}`)
}

try {
  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  setOutput("time", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
