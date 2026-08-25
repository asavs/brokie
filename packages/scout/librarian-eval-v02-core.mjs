function text(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.text === "string") return value.text;
  return "";
}

function compact(value, maximum = 900) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

export function summarizeLibrarianCandidate(candidate) {
  if (!candidate?.product || !Array.isArray(candidate.opportunities)) return "No accepted candidate.";
  const name = text(candidate.product.proposed_canonical_name) || candidate.product.source_name || "Unnamed product";
  const description = text(candidate.product.description);
  const opportunities = candidate.opportunities.map((opportunity) => {
    const label = opportunity.plan_label || opportunity.variant_label || opportunity.local_key;
    const entitlements = (opportunity.entitlements ?? []).map(({ label: itemLabel, quantity, monetary_value, percentage_value }) => {
      if (itemLabel) return itemLabel;
      if (quantity?.value != null) return `${quantity.value} ${quantity.source_unit ?? "units"}`;
      if (monetary_value?.amount != null) return `${monetary_value.amount} ${monetary_value.currency ?? "currency"}`;
      if (percentage_value != null) return `${percentage_value}%`;
      return "unnamed benefit";
    });
    return `${label}: ${entitlements.length ? entitlements.join(", ") : "no supported entitlement"}`;
  });
  return compact(`${name}${description ? ` — ${description}` : ""}; ${opportunities.length ? opportunities.join(" | ") : "no offer opportunity proposed"}`);
}
