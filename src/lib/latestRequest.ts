/** Only the most recent request may update the view, even if a transport ignores abort. */
export function createRequestGate() {
  let active: AbortController | null = null;
  return {
    start() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, abort: () => controller.abort(), isCurrent: () => active === controller };
    },
    cancel() { active?.abort(); active = null; },
  };
}
