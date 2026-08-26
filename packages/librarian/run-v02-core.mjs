import fs from "node:fs";
import path from "node:path";
import { runLibrarianV01 } from "./run-v0.1-core.mjs";
import { compileProposalV02, parseAndValidateProposalV02, requestPayloadV02 } from "./proposal-v02.mjs";

const promptVersion = "librarian-v0.2";
const systemPrompt = fs.readFileSync(path.join(import.meta.dirname, "prompts", `${promptVersion}.txt`), "utf8");

function initialMessages(record) {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(requestPayloadV02(record)) },
  ];
}

function repairMessage({ error, validationErrors }) {
  return {
    role: "user",
    content: JSON.stringify({
      instruction: "Return a complete corrected small proposal JSON object. Remove unsupported claims; do not add outside facts.",
      failures: error ? [error] : validationErrors,
    }),
  };
}

function createProposalProvider(provider, record, observation) {
  return {
    provider: provider.provider,
    model: provider.model,
    prompt_version: promptVersion,
    run_identity_suffix: promptVersion,
    initial_messages: () => initialMessages(record),
    repair_message: repairMessage,
    async complete(messages, options) {
      const response = await provider.complete(messages, options);
      try {
        const parsed = parseAndValidateProposalV02(response.content);
        const { proposal } = parsed;
        const compiled = compileProposalV02(proposal, record, observation);
        return { ...response, content: JSON.stringify(compiled.candidate), provider_raw_response: response.content, proposal, compiler_actions: [...parsed.actions, ...compiled.actions] };
      } catch (error) {
        const protocolErrors = error.errors?.map(({ message }) => message) ?? [String(error)];
        return { ...response, provider_raw_response: response.content, protocol_errors: protocolErrors };
      }
    },
  };
}

export function runLibrarianV02(options) {
  const provider = createProposalProvider(options.provider, options.record, options.observation);
  return runLibrarianV01({ ...options, provider });
}
