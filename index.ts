import {
  SSMClient,
  SendCommandCommand,
  ListCommandInvocationsCommand,
} from "@aws-sdk/client-ssm";
import * as core from "@actions/core";

async function main() {
  const region = core.getInput("aws-region");
  const client = new SSMClient({ region });
  const TimeoutSeconds = parseInt(core.getInput("timeout"));
  const parameters = core.getInput("parameters", { required: true });

  const command = new SendCommandCommand({
    TimeoutSeconds,
    Targets: JSON.parse(core.getInput("targets", { required: true })),
    DocumentName: core.getInput("document-name"),
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
  let status = "Pending";
  let errorMessage = "";

  // loop until the command is finished
  while (true) {
    Atomics.wait(int32, 0, 0, 5000);

    const result = await client.send(
      new ListCommandInvocationsCommand({ CommandId, Details: true })
    );

    const invocation = result.CommandInvocations?.[0] || {};
    status = invocation.Status as string;

    // check if the command is finished
    if (["Cancelled", "Failed", "Success", "TimedOut"].includes(status)) {
      // check the plugins processed by the command
      for (const cp of invocation.CommandPlugins || []) {
        // Store error message if present
        if (cp.ResponseCode !== 0) {
          errorMessage = cp.Output || "Unknown error occurred";
        }

        // output the command plugin output
        if (cp.Output) {
          core.info(cp.Output);
          outputs.push(cp.Output);
        }
      }

      // break the while loop since the command is finished
      break;
    }
  }

  // output the status and the outputs
  core.setOutput("status", status);
  core.setOutput("output", outputs.join("\n"));
  core.setOutput("command-id", CommandId);

  // if the status is not Success, throw an error with detailed message
  if (status !== "Success") {
    const errorDetail = errorMessage
      ? `Command failed with status ${status}: ${errorMessage}`
      : `Command failed with status ${status}`;
    core.setFailed(errorDetail);
    throw new Error(errorDetail);
  }
}

main().catch((e) => {
  core.setFailed(e.message);
  process.exit(1);
});

export default main;
