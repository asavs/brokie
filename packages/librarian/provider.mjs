const PROVIDERS = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyName: "OPENROUTER_API_KEY",
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyName: "NVIDIA_NIM_API_KEY",
  },
};

export function providerEnvironmentKey(provider) {
  const configuration = PROVIDERS[provider];
  if (!configuration) throw new Error(`unsupported provider: ${provider}`);
  return configuration.keyName;
}

export function createCompatibleProvider({
  provider,
  model,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 120_000,
  maxTokens = 6_000,
}) {
  const configuration = PROVIDERS[provider];
  if (!configuration) throw new Error(`unsupported provider: ${provider}`);
  if (!apiKey) throw new Error(`${configuration.keyName} is not available to this process`);
  if (provider === "openrouter" && model !== "openrouter/free" && !model.endsWith(":free")) {
    throw new Error(`refusing non-free OpenRouter model: ${model}`);
  }
  const nvidiaReasoningOptions =
    provider !== "nvidia"
      ? {}
      : model.includes("nemotron-3-nano") || model.includes("nemotron-3-ultra")
        ? { chat_template_kwargs: { enable_thinking: false } }
        : model.includes("deepseek-v4")
          ? { chat_template_kwargs: { thinking: false } }
          : {};

  return {
    provider,
    model,
    async complete(messages, options = {}) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${configuration.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(provider === "openrouter"
              ? { "HTTP-Referer": "https://github.com/asavs/brokie", "X-Title": "Brokie" }
              : {}),
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0,
            max_tokens: maxTokens,
            stream: false,
            ...(provider === "openrouter"
              ? { response_format: { type: "json_object" } }
              : {}),
            ...nvidiaReasoningOptions,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
      }

      const body = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1_000)}`);
      }
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("provider response did not contain assistant text");
      }
      return {
        content,
        resolved_model: body.model ?? model,
        usage: body.usage ?? null,
        reasoning:
          body.choices?.[0]?.message?.reasoning_content ??
          body.choices?.[0]?.message?.reasoning ??
          null,
      };
    },
  };
}
