import crypto from "node:crypto";
import path from "node:path";

export const USER_NEEDS = [
  ["call-model-api", "I need to call an AI model through an API."],
  ["free-inference", "I need free or discounted model inference."],
  ["model-routing", "I need to compare or route between models."],
  ["embeddings-search", "I need embeddings or semantic search."],
  ["build-agent", "I need to build an AI agent."],
  ["train-model", "I need to train or fine-tune a model."],
  ["evaluate-ai", "I need to evaluate or monitor an AI system."],
  ["gpu-accelerator", "I need a GPU or accelerator."],
  ["ai-notebook", "I need a notebook or hosted AI development environment."],
  ["virtual-computer", "I need a virtual computer or VM."],
  ["cloud-credits", "I need cloud credits for an AI project."],
  ["generate-media", "I need to generate text, code, images, audio, or video."],
];

export const CAPABILITIES = [
  ["model-inference", "Hosted model inference"],
  ["model-api", "Model API access"],
  ["model-routing", "Model routing or gateway"],
  ["embeddings", "Embeddings"],
  ["vector-search", "Vector or semantic search"],
  ["agent-platform", "AI agent platform"],
  ["training", "Model training or fine-tuning"],
  ["evaluation", "AI evaluation"],
  ["observability", "AI observability"],
  ["gpu-compute", "GPU or accelerator compute"],
  ["notebook", "Hosted notebook"],
  ["virtual-machine", "Virtual machine or computer"],
  ["cloud-credit", "Cloud or infrastructure credit"],
  ["text-generation", "Text generation"],
  ["code-generation", "Code generation"],
  ["image-generation", "Image generation"],
  ["audio-generation", "Audio generation"],
  ["video-generation", "Video generation"],
];

export function sha(value, length = 16) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function slug(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "record";
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...data] = rows;
  return data.map((cells, index) => ({
    row_number: index + 2,
    values: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""])),
    raw_text: headers.map((header, cellIndex) => `${header}: ${cells[cellIndex] ?? ""}`).join("\n"),
  }));
}

export function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

export function parseReadme(text) {
  const records = [];
  let category = "";
  let parent = "";
  let pastContents = false;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      category = heading[1].trim();
      parent = "";
      pastContents = true;
      continue;
    }
    if (!pastContents) continue;
    const item = line.match(/^(\s*)\* \[([^\]]+)\]\(([^)]+)\)(?:\s*[-–—]\s*(.*))?$/);
    if (!item) continue;
    const indent = item[1].length;
    const name = stripMarkdown(item[2]);
    if (indent <= 2) parent = name;
    records.push({
      source_kind: "free_for_dev_readme",
      source_locator: `README.md:${index + 1}`,
      source_file: "README.md",
      source_line: index + 1,
      source_row: null,
      source_category: category,
      source_name: name,
      source_url: item[3],
      source_description: stripMarkdown(item[4]),
      source_offer_detail: stripMarkdown(item[4]),
      source_eligibility: "",
      source_platform: "free-for-dev",
      parent_provider: indent > 2 ? parent : "",
      estimated_value_usd: null,
      raw_text: line,
    });
  }
  return records;
}

export function normalizeStartupRows(rows, sourcePath) {
  return rows.map(({ row_number, values, raw_text }) => ({
    source_kind: "startup_offers_csv",
    source_locator: `${path.basename(sourcePath)}:${row_number}`,
    source_file: path.basename(sourcePath),
    source_line: null,
    source_row: row_number,
    source_category: values.Category,
    source_name: values["Brand/Product"],
    source_url: values["Application Link"],
    source_description: values.Description,
    source_offer_detail: values["Monetary Detail"],
    source_eligibility: values["Eligibility Notes"],
    source_platform: values["Platform/Source"],
    parent_provider: "",
    estimated_value_usd: moneyValue(values["Estimated Value"]),
    raw_text,
  }));
}

function moneyValue(value) {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const STRONG_TERMS = [
  "artificial intelligence", "generative ai", "llm", "language model", "model inference",
  "openai-compatible", "model api", "ai gateway", "ai agent", "gpu", "tpu", "accelerator",
  "fine-tun", "embedding", "vector search", "semantic search", "jupyter", "notebook",
  "virtual machine", "cloud credit", "ai studio", "machine learning",
];

const MEDIUM_TERMS = [
  " ai ", "models", "prompt", "eval", "observability", "deepseek", "gemini", "hugging face",
  "image generation", "video generation", "audio generation", "code generation", "compute",
  "virtual computer", "cloud program", "automation",
];

const EXCLUDED_TERMS = [
  "clinical", "medical", "transcription", "meeting notes", "ad creative", "sales", "seo",
  "customer support", "recruit", "resume", "logo", "headshot", "copywriting",
];

export function scoreForV001(record) {
  const haystack = ` ${record.source_category} ${record.source_name} ${record.source_description} ${record.source_offer_detail} `.toLowerCase();
  let score = 0;
  const reasons = [];
  if (record.source_category === "Generative AI") {
    score += 6;
    reasons.push("free-for-dev Generative AI category");
  }
  if (record.source_category === "AI & Automation") {
    score += 1;
    reasons.push("startup AI & Automation category");
  }
  if (record.source_category === "Cloud Programs") {
    score += 6;
    reasons.push("startup cloud-credit program category");
  }
  if (record.source_category === "Cloud Computing & Infrastructure") {
    score += 1;
    reasons.push("adjacent cloud or compute category");
  }
  for (const term of STRONG_TERMS) {
    if (haystack.includes(term)) {
      score += 3;
      reasons.push(`strong term: ${term}`);
    }
  }
  for (const term of MEDIUM_TERMS) {
    if (haystack.includes(term)) {
      score += 1;
      reasons.push(`related term: ${term.trim()}`);
    }
  }
  for (const term of EXCLUDED_TERMS) {
    if (haystack.includes(term)) {
      score -= 5;
      reasons.push(`consumer or vertical-specific term: ${term}`);
    }
  }
  return { score, reasons };
}

export function selectV001(records, limit = 60) {
  return records
    .map((record) => ({ ...record, selection: scoreForV001(record) }))
    .filter((record) => record.selection.score >= 4)
    .sort((a, b) => b.selection.score - a.selection.score || a.source_name.localeCompare(b.source_name))
    .slice(0, limit)
    .map((record) => {
      const sourceId = `src_${sha(`${record.source_kind}\n${record.source_locator}\n${record.raw_text}`)}`;
      return { ...record, source_id: sourceId };
    });
}

export function deterministicAnnotations(record) {
  const text = ` ${record.source_name} ${record.source_description} ${record.source_offer_detail} `.toLowerCase();
  const capabilities = [];
  const needs = [];
  const add = (list, id, evidence) => {
    if (!list.some((entry) => entry.id === id)) list.push({ id, confidence: 1, derivation: "deterministically_parsed", evidence });
  };
  const match = (terms) => terms.find((term) => text.includes(term));
  let found;
  if (record.source_category === "Cloud Programs") {
    add(capabilities, "cloud-credit", "source category: Cloud Programs");
    add(needs, "cloud-credits", "source category: Cloud Programs");
  }
  if ((found = match(["inference", "models", "model api", "openai-compatible", "gemini", "deepseek"]))) {
    add(capabilities, "model-inference", found);
    add(needs, "free-inference", found);
  }
  if ((found = match(["api", "requests", "tokens"]))) {
    add(capabilities, "model-api", found);
    add(needs, "call-model-api", found);
  }
  if ((found = match(["gateway", "route", "200+ llm"]))) {
    add(capabilities, "model-routing", found);
    add(needs, "model-routing", found);
  }
  if ((found = match(["embedding", "vector", "semantic search"]))) {
    add(capabilities, found === "embedding" ? "embeddings" : "vector-search", found);
    add(needs, "embeddings-search", found);
  }
  if ((found = match(["agent", "assistant"]))) {
    add(capabilities, "agent-platform", found);
    add(needs, "build-agent", found);
  }
  if ((found = match(["fine-tun", "train model", "training"]))) {
    add(capabilities, "training", found);
    add(needs, "train-model", found);
  }
  if ((found = match(["eval", "observability", "monitoring", "traces", "observations", "debug"]))) {
    add(capabilities, found === "observability" || found === "traces" ? "observability" : "evaluation", found);
    add(needs, "evaluate-ai", found);
  }
  if ((found = match(["gpu", "tpu", "accelerator"]))) {
    add(capabilities, "gpu-compute", found);
    add(needs, "gpu-accelerator", found);
  }
  if ((found = match(["notebook", "jupyter", "colab", "kaggle"]))) {
    add(capabilities, "notebook", found);
    add(needs, "ai-notebook", found);
  }
  if ((found = match(["virtual machine", "virtual computer", "compute engine", "vm"]))) {
    add(capabilities, "virtual-machine", found);
    add(needs, "virtual-computer", found);
  }
  if ((found = match(["cloud credit", "cloud credits", "infrastructure credit", "hosting credit"]))) {
    add(capabilities, "cloud-credit", found);
    add(needs, "cloud-credits", found);
  }
  for (const [term, capability] of [["image", "image-generation"], ["audio", "audio-generation"], ["video", "video-generation"], ["code generation", "code-generation"], ["text generation", "text-generation"]]) {
    if (text.includes(term)) {
      add(capabilities, capability, term);
      add(needs, "generate-media", term);
    }
  }
  return { capabilities, needs };
}

export function candidateProduct(record) {
  const name = record.parent_provider || record.source_name;
  return {
    product_id: `prd_${slug(name)}_${sha(name.toLowerCase(), 8)}`,
    name,
    canonical_url: record.parent_provider ? "" : record.source_url,
    derivation: "deterministically_parsed",
  };
}
