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

  while (true) {
    Atomics.wait(int32, 0, 0, 5000);

    const result = await client.send(
      new ListCommandInvocationsCommand({CommandId, Details: true}),
    );

    const invocation = result.CommandInvocations?.[0] || {};
    status = invocation.Status as string;

    if (['Cancelled', 'Failed', 'Success', 'TimedOut'].includes(status)) {
      for (const cp of invocation.CommandPlugins || []) {
        outputs.push(cp.Output as string);
      }

      break;
    }
  }

  core.setOutput('status', status);
  core.setOutput('output', outputs.join('\n'));

  if (status != 'Success') {
    throw new Error(`Failed to send command: ${status}`);
  }
}

main().catch((e) => core.setFailed(e.message));

export default main;
