export type UtilityBackend = "claude" | "ollama" | "custom";
export type UtilityFallbackApproval = "allow" | "deny";

export interface UtilityRuntimePolicy {
  backend: UtilityBackend;
  endpoint?: string;
  isMobile: boolean;
  claudeAvailable: boolean;
  fallbackApproval?: UtilityFallbackApproval;
}

export type EndpointClassification = "loopback" | "wildcard-local" | "lan" | "remote" | "invalid";

export type UtilityRuntimeResolution =
  | { state: "configured-provider"; backend: UtilityBackend }
  | { state: "unavailable-loopback"; backend: Exclude<UtilityBackend, "claude">; endpoint: string }
  | {
      state: "approved-Claude-fallback";
      backend: "claude";
      configuredBackend: Exclude<UtilityBackend, "claude">;
      endpoint: string;
    }
  | {
      state: "unavailable-without-Claude";
      backend: Exclude<UtilityBackend, "claude">;
      endpoint: string;
      reason: "claude-unavailable" | "fallback-denied" | "invalid-endpoint";
    };

function normalizedHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return hostname || null;
  } catch {
    return null;
  }
}

export function classifyEndpoint(url: string): EndpointClassification {
  const hostname = normalizedHostname(url);
  if (!hostname) return "invalid";
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "::1" || /^127(?:\.|$)/.test(hostname)) {
    return "loopback";
  }
  if (hostname === "0.0.0.0" || hostname === "::" || hostname === "::0") return "wildcard-local";

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part > 255)) return "invalid";
    const [first = 0, second = 0] = octets;
    if (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    ) {
      return "lan";
    }
  }
  return "remote";
}

export function resolveUtilityForRuntime(policy: UtilityRuntimePolicy): UtilityRuntimeResolution {
  if (!policy.isMobile || policy.backend === "claude") {
    return { state: "configured-provider", backend: policy.backend };
  }

  const endpoint = policy.endpoint ?? "";
  const classification = classifyEndpoint(endpoint);
  if (classification === "invalid") {
    return { state: "unavailable-without-Claude", backend: policy.backend, endpoint, reason: "invalid-endpoint" };
  }
  if (classification === "lan" || classification === "remote") {
    return { state: "configured-provider", backend: policy.backend };
  }
  if (!policy.claudeAvailable) {
    return { state: "unavailable-without-Claude", backend: policy.backend, endpoint, reason: "claude-unavailable" };
  }
  if (policy.fallbackApproval === "allow") {
    return {
      state: "approved-Claude-fallback",
      backend: "claude",
      configuredBackend: policy.backend,
      endpoint,
    };
  }
  if (policy.fallbackApproval === "deny") {
    return { state: "unavailable-without-Claude", backend: policy.backend, endpoint, reason: "fallback-denied" };
  }
  return { state: "unavailable-loopback", backend: policy.backend, endpoint };
}
