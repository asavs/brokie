const LIMITS = {
  request: ["max_requests", "requests", "budget_request_exhausted"],
  page: ["max_pages", "pages", "budget_page_exhausted"],
  byte: ["max_bytes", "bytes", "budget_byte_exhausted"],
  inference: ["max_inference_calls", "inference_calls", "budget_inference_exhausted"],
};

export class BudgetError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export class Budget {
  constructor(configured, clock = () => Date.now()) {
    for (const name of ["max_requests", "max_pages", "max_bytes", "max_elapsed_ms", "max_inference_calls"]) {
      if (!Number.isInteger(configured[name]) || configured[name] < 1) throw new Error(`${name} must be a positive integer`);
    }
    if (configured.max_depth !== 1) throw new Error("Scout v0.1 max_depth must be 1");
    this.configured = Object.freeze({ ...configured });
    this.consumed = { requests: 0, pages: 0, bytes: 0, inference_calls: 0, max_depth: 0 };
    this.clock = clock;
    this.started = clock();
  }
  checkTime() {
    if (this.clock() - this.started >= this.configured.max_elapsed_ms) throw new BudgetError("budget_time_exhausted");
  }
  reserve(kind, amount = 1) {
    this.checkTime();
    const [maximum, counter, code] = LIMITS[kind];
    if (!Number.isInteger(amount) || amount < 0) throw new Error("budget reservation must be a nonnegative integer");
    if (this.consumed[counter] + amount > this.configured[maximum]) throw new BudgetError(code);
    this.consumed[counter] += amount;
  }
  depth(value) {
    this.checkTime();
    if (!Number.isInteger(value) || value < 0 || value > this.configured.max_depth || value > 1) throw new BudgetError("depth_exceeded");
    this.consumed.max_depth = Math.max(this.consumed.max_depth, value);
  }
  snapshot() { return { configured: { ...this.configured }, consumed: { ...this.consumed } }; }
}
