import { packetIdV02 } from "./identity-v02.mjs";

export function explicitlyDescribesAgreementV02(observation) {
  const text = String(observation).toLowerCase();
  const agreement = /\bsame limits?\b|\bconsistent\b|\bequivalent\b/.test(text);
  const negated = /\b(?:not|isn't|aren't|wasn't|weren't)\s+(?:the\s+)?same limits?\b|\bnot\s+(?:consistent|equivalent)\b/.test(text);
  return agreement && !negated;
}

export function deriveTruthfulPacketV02(source) {
  const packet = structuredClone(source), removed = packet.conflicts.filter(({ observation }) => explicitlyDescribesAgreementV02(observation));
  if (!removed.length) return { packet, repairs: [] };
  const removedIds = new Set(removed.map(({ conflict_id }) => conflict_id));
  packet.conflicts = packet.conflicts.filter(({ conflict_id }) => !removedIds.has(conflict_id));
  const repairs = removed.map(({ conflict_id, topic }) => ({ kind: "self_disclaimed_conflict", conflict_id, topic }));
  packet.research_outcomes = packet.research_outcomes.map((outcome) => {
    const next = structuredClone(outcome); next.conflict_ids = next.conflict_ids.filter((id) => !removedIds.has(id));
    if (next.status === "conflicting" && next.conflict_ids.length === 0) {
      next.status = next.unresolved_questions.length ? "partially_answered" : "answered";
      repairs.push({ kind: "research_outcome", topic: next.topic, from: "conflicting", to: next.status });
    }
    return next;
  });
  packet.unresolved_questions = [...new Set(packet.research_outcomes.flatMap(({ unresolved_questions }) => unresolved_questions))].sort();
  packet.packet_id = packetIdV02(packet);
  return { packet, repairs };
}
