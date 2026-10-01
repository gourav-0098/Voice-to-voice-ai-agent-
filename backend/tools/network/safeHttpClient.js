import { promises as dnsPromises } from "dns";
import net from "net";

/**
 * Validates whether an IP address is private, loopback, link-local, multicast, or reserved.
 * Handles IPv4, IPv6, and IPv4-mapped IPv6 formats.
 * @param {string} ipStr
 * @returns {boolean} True if private, loopback, or reserved
 */
export function isIpPrivateOrReserved(ipStr) {
  if (!ipStr || typeof ipStr !== "string") return true;
  const cleanIp = ipStr.trim().toLowerCase();

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanIp.startsWith("::ffff:")) {
    const mapped = cleanIp.slice(7);
    if (net.isIPv4(mapped)) {
      return isIpPrivateOrReserved(mapped);
    }
  }

  // IPv4 Checks
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private RFC1918)
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (Shared Address Space / CGNAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-Local / Cloud Metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private RFC1918)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true;
    // 192.168.0.0/16 (Private RFC1918)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 198.18.0.0/15 (Benchmark testing)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    // 240.0.0.0/4 (Reserved) & 255.255.255.255 (Broadcast)
    if (parts[0] >= 240) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(cleanIp)) {
    const raw = cleanIp.replace(/\[|\]/g, "");
    if (raw === "::" || raw === "::1") return true;
    if (raw.startsWith("fc") || raw.startsWith("fd")) return true; // Unique Local Address
    if (raw.startsWith("fe8") || raw.startsWith("fe9") || raw.startsWith("fea") || raw.startsWith("feb")) return true; // Link-local
    if (raw.startsWith("ff")) return true; // Multicast
    if (raw.startsWith("2001:db8")) return true; // Documentation
    return false;
  }

  return true;
}

/**
 * Validates whether a URL is strictly safe for server-side outbound requests.
 * Blocks dangerous schemes (javascript:, file:, data:, ftp:), internal hostnames,
 * cloud metadata endpoints, octal/hex IP evasion, and resolves DNS to verify no private IPs.
 * @param {string} urlString
 * @returns {Promise<boolean>}
 */
export async function isUrlSafe(urlString) {
  try {
    if (!urlString || typeof urlString !== "string") return false;
    const trimmed = urlString.trim();

    // Block non-HTTP(S) schemes
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;

    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    // Enforce standard web ports only (80, 443, or empty default)
    if (url.port && url.port !== "80" && url.port !== "443") return false;

    const hostname = url.hostname.toLowerCase().replace(/\[|\]/g, "");

    // Dangerous host aliases and cloud metadata endpoints
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".onion") ||
      hostname === "host.docker.internal" ||
      hostname === "metadata.google.internal" ||
      hostname === "metadata" ||
      hostname === "instance-data"
    ) {
      return false;
    }

    // Direct IP Literal Check
    if (net.isIP(hostname)) {
      return !isIpPrivateOrReserved(hostname);
    }

    // Hex/Octal/Integer IP format evasion detection (e.g. 0x7f000001, 2130706433)
    if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
      return false;
    }

    // DNS Resolution Check: Resolve all A and AAAA records
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;

    for (const record of addresses) {
      if (isIpPrivateOrReserved(record.address)) {
        return false;
      }
    }

    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Centralized, safe outbound HTTP request wrapper.
 * Enforces SSRF validation, redirects verification (max 3), timeouts, and safe headers.
 * @param {string} targetUrl - Outbound URL
 * @param {Object} [options] - Fetch options
 * @param {number} [options.timeoutMs=5000] - Request timeout
 * @param {number} [options.maxRedirects=3] - Maximum safe redirect hops
 * @param {Object} [options.headers] - Request headers
 * @param {string} [options.method='GET'] - HTTP Method
 * @param {string|Buffer} [options.body] - Request body
 * @returns {Promise<Response>} Fetch Response object
 */
export async function safeOutboundRequest(targetUrl, options = {}) {
  const {
    timeoutMs = 5000,
    maxRedirects = 3,
    headers = {},
    method = "GET",
    body,
  } = options;

  let currentUrl = targetUrl.trim();
  try {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`SSRF Blocked: Protocol "${parsed.protocol}" is not allowed.`);
    }
  } catch (err) {
    if (err.message.includes("SSRF Blocked")) throw err;
    throw new Error(`SSRF Blocked: Invalid URL "${currentUrl}".`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let redirectCount = 0;
    let response = null;

    while (redirectCount <= maxRedirects) {
      // Enforce SSRF validation on the initial URL and on EVERY redirect target
      const isSafe = await isUrlSafe(currentUrl);
      if (!isSafe) {
        throw new Error(`SSRF Blocked: Destination URL "${currentUrl}" is not allowed.`);
      }

      const defaultHeaders = {
        "User-Agent": "ChatlyAI/2.0 (AI Research Engine; +https://chatly.ai)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        ...headers,
      };

      response = await fetch(currentUrl, {
        method,
        headers: defaultHeaders,
        body,
        signal: controller.signal,
        redirect: "manual", // Manually inspect every redirect hop for SSRF
      });

      // Handle HTTP redirects securely
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;

        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }

      break;
    }

    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  }
}

export default {
  isIpPrivateOrReserved,
  isUrlSafe,
  safeOutboundRequest,
};
