import {
  SSMClient,
  SendCommandCommand,
  ListCommandInvocationsCommand,
} from '@aws-sdk/client-ssm';
import * as core from '@actions/core';

async function main() {
  const region = core.getInput('aws-region');
  const client = new SSMClient({region});
  const TimeoutSeconds = parseInt(core.getInput('timeout'));
  const parameters = core.getInput('parameters', {required: true});

  const command = new SendCommandCommand({
    TimeoutSeconds,
    Targets: JSON.parse(core.getInput('targets', {required: true})),
    DocumentName: core.getInput('document-name'),
    Parameters: JSON.parse(parameters),
  });

  if (core.isDebug()) {
    core.debug(parameters);
    core.debug(JSON.stringify(command));
  }

  const result = await client.send(command);
  const CommandId = result.Command?.CommandId;
  core.info(`command-id: ${CommandId}`);

  const int32 = new Int32Array(new SharedArrayBuffer(4));
  const outputs = [];
  let status = 'Pending';

  // loop until the command is finished
  while (true) {
    Atomics.wait(int32, 0, 0, 5000);

    const result = await client.send(
      new ListCommandInvocationsCommand({CommandId, Details: true}),
    );

    const invocation = result.CommandInvocations?.[0] || {};
    status = invocation.Status as string;

    // check if the command is finished
    if (['Cancelled', 'Failed', 'Success', 'TimedOut'].includes(status)) {
      // check the plugins processed by the command
      for (const cp of invocation.CommandPlugins || []) {
        // output the command plugin output
        core.info(cp.Output as string);

        // add to the outputs to use in setOutput later
        outputs.push(cp.Output as string);
      }

      // break the while loop since the command is finished
      break;
    }
  }

  // output the status and the outputs
  core.setOutput('status', status);
  core.setOutput('output', outputs.join('\n'));

  // if the status is not Success, throw an error
  if (status != 'Success') {
    throw new Error(`Command failed with status ${status}`);
  }
}

main().catch((e) => core.setFailed(e.message));

export default main;
