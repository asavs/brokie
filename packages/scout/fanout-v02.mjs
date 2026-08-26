import { Budget } from "./budget.mjs";
import { discoverCollectionV02 } from "./discovery-v02.mjs";
import { makeExcerptV02 } from "./identity-v02.mjs";
import { buildScoutPacketV02, materialStatusV02 } from "./packet-v02.mjs";
import { createGitRevisionTools, inspectGitRevision } from "./revision-tools-v02.mjs";

const TEXT_FILE = /(?:^|\/)(?:readme[^/]*\.md|[^/]+\.(?:md|markdown|html?))$/i;

function rankedPaths(repository, explicitPath) {
  if (explicitPath) return [String(explicitPath).replaceAll("\\", "/")];
  return repository.tracked.filter((file) => TEXT_FILE.test(file)).sort((left, right) => {
    const leftReadme = /(?:^|\/)readme[^/]*\.md$/i.test(left) ? 0 : 1;
    const rightReadme = /(?:^|\/)readme[^/]*\.md$/i.test(right) ? 0 : 1;
    return leftReadme - rightReadme || left.split("/").length - right.split("/").length || left.localeCompare(right, "en");
  });
}

function validListings(discovered) {
  return discovered.boundaries.map((boundary) => {
    const links = discovered.links.filter((link) => link.start_byte >= boundary.start_byte && link.end_byte <= boundary.end_byte);
    const primary = links.find(({ raw_destination: raw, resolved_destination }) => resolved_destination && /^https?:\/\//i.test(raw));
    return { boundary, links, primary };
  }).filter(({ primary }) => primary);
}

function inspectCollection(fileTools, repository, relativePath) {
  const read = fileTools.readFile(relativePath);
  const baseLocator = repository.remote || `file:///${relativePath.replaceAll("\\", "/")}`;
  const discovered = discoverCollectionV02({
    bytes: read.bytes,
    mediaType: read.artifact.media_type,
    artifactId: read.artifact.artifact_id,
    baseLocator,
  });
  return { relativePath, read, discovered, listings: validListings(discovered) };
}

function chooseCollection(fileTools, repository, { collectionPath, maxCollectionFiles }) {
  const candidates = [];
  for (const relativePath of rankedPaths(repository, collectionPath).slice(0, maxCollectionFiles)) {
    try { candidates.push(inspectCollection(fileTools, repository, relativePath)); } catch {}
  }
  candidates.sort((left, right) => right.listings.length - left.listings.length || left.relativePath.localeCompare(right.relativePath, "en"));
  const selected = candidates[0];
  if (!selected?.listings.length) throw new Error("no collection listings with HTTP links were found");
  return selected;
}

function packetSubject(collection, listing) {
  const { boundary, primary } = listing;
  return {
    candidate: boundary,
    primaryUrl: primary.resolved_destination,
    listing: makeExcerptV02(
      collection.read.artifact.artifact_id,
      boundary.start_byte,
      boundary.end_byte,
      collection.read.bytes,
      "collection_listing",
    ),
    source: { locator: collection.relativePath },
    pages: [],
  };
}

export function fanOutGitCollectionV02(options) {
  const repository = inspectGitRevision(options.seedPath, options.revision);
  repository.locator = options.seedLocator ?? (repository.remote || repository.root);
  const budget = new Budget(options.budgets, () => Date.now(), { requiredMaxDepth: 2 });
  const runId = options.ledger.start({
    seed: { kind: "git", locator: repository.locator, revision: repository.revision },
    provider: "deterministic",
    requested_model: "none",
    prompt_version: "scout-v0.2-collection-fanout",
    action_schema_version: "0.2.0",
    budget: options.budgets,
  });
  const tools = createGitRevisionTools({ repository, artifactStore: options.artifactStore, budget, ledger: options.ledger, runId });
  try {
    const collection = chooseCollection(tools, repository, options);
    const packets = collection.listings.map((listing, ordinal) => {
      const packet = buildScoutPacketV02({ subject: packetSubject(collection, listing), seed: { kind: "git", locator: repository.locator }, repository });
      const stored = options.packetStore.put(packet);
      options.ledger.packet(runId, ordinal, packet.packet_id, stored.status, materialStatusV02(packet));
      return { packet, storage_status: stored.status };
    });
    options.ledger.event(runId, "collection_fanout", { collection_path: collection.relativePath, listing_count: packets.length });
    options.ledger.finish(runId, "completed", budget);
    return { run_id: runId, repository, collection_path: collection.relativePath, packets, budget: budget.snapshot() };
  } catch (error) {
    options.ledger.event(runId, "collection_fanout_failed", { error: String(error).slice(0, 500) });
    options.ledger.finish(runId, "failed", budget, ["collection_fanout_failed"]);
    throw error;
  }
}

export const defaultFanoutBudgetsV02 = Object.freeze({
  max_requests: 1,
  max_pages: 50,
  max_bytes: 50_000_000,
  max_elapsed_ms: 300_000,
  max_inference_calls: 1,
  max_depth: 2,
});
