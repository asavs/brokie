import { contentId } from "./canonical.mjs";

export const RESEARCH_TOPICS = Object.freeze([
  { topic: "benefit", question: "What free or discounted benefit does the source currently state?" },
  { topic: "numerical_limits", question: "What numerical limits, quantities, units, cadences, or durations does the source state?" },
  { topic: "requirements", question: "What accounts, payment methods, setup steps, approvals, or other requirements does the source state?" },
  { topic: "eligibility", question: "What audience, geography, customer status, or other eligibility does the source state?" },
  { topic: "material_caveats", question: "What exclusions, conflicts, expiry, incomplete content, or other material caveats are visible?" },
]);

export const DEFAULT_RESEARCH_OBJECTIVE = "Find current authoritative evidence for the offer described by this collection listing, including its free/discounted benefit, numerical limits, requirements, eligibility, and material caveats.";

export function createResearchRequest(objective = DEFAULT_RESEARCH_OBJECTIVE, topics = RESEARCH_TOPICS) {
  const request = { request_version: "0.2.0", request_id: "", objective, topics: topics.map((topic) => ({ ...topic })) };
  request.request_id = contentId("research", { request_version: request.request_version, objective: request.objective, topics: request.topics });
  return request;
}
