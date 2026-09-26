/**
 * Source Registry Service for Chatly Fact-Checking & RAG
 * 
 * Provides dynamic, topic-aware authority scoring for retrieved documents and web sources.
 * Avoids rigid hardcoding by loading from sourceRegistry.json with flexible pattern matching.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.join(__dirname, "../data/sourceRegistry.json");

let registryCache = null;

function loadRegistry() {
  if (registryCache) return registryCache;
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
      registryCache = JSON.parse(raw);
    }
  } catch (err) {
    console.warn("⚠️ [SOURCE REGISTRY] Could not load sourceRegistry.json:", err.message);
  }

  if (!registryCache) {
    registryCache = {
      default_tiers: {
        tier_1_constitutional_government: { authority_score: 0.98 },
        tier_2_established_wires_and_press: { authority_score: 0.82 },
        tier_3_fact_checkers: { authority_score: 0.85 },
        tier_4_general_web: { authority_score: 0.45 },
      },
      sources: [],
    };
  }
  return registryCache;
}

/**
 * Extracts a normalized domain hostname from a URL or source string
 */
export function extractDomain(inputStr) {
  if (!inputStr || typeof inputStr !== "string") return "";
  try {
    if (inputStr.startsWith("http://") || inputStr.startsWith("https://")) {
      const url = new URL(inputStr);
      return url.hostname.toLowerCase().replace(/^www\./, "");
    }
  } catch (_) {}
  return inputStr.toLowerCase().trim().replace(/^www\./, "");
}

/**
 * Calculates topic-aware authority score for a given source
 * 
 * @param {Object} params
 * @param {string} [params.url] - URL of the source
 * @param {string} [params.publisher] - Declared publisher or organization name
 * @param {string} [params.topic] - Query or document topic (e.g. 'employment', 'court')
 * @returns {{ authorityScore: number, tier: string, sourceName: string, isPrimary: boolean }}
 */
export function evaluateSourceAuthority({ url = "", publisher = "", topic = "" } = {}) {
  const reg = loadRegistry();
  const domain = extractDomain(url);
  const normPub = (publisher || "").toLowerCase();
  const normTopic = (topic || "").toLowerCase();

  // 1. Direct match in registry sources
  for (const src of reg.sources) {
    const pattern = src.pattern.toLowerCase();
    const isDomainMatch = domain && (domain === pattern || domain.endsWith(pattern));
    const isNameMatch = normPub && (normPub.includes(pattern) || src.name.toLowerCase().includes(normPub));

    if (isDomainMatch || isNameMatch) {
      let score = src.authority_score;

      // Topic synergy bonus (e.g. MoSPI on 'employment' gets full primary authority)
      let isPrimary = false;
      if (Array.isArray(src.primary_topics)) {
        for (const t of src.primary_topics) {
          if (normTopic.includes(t)) {
            score = Math.min(1.0, score + 0.03);
            isPrimary = true;
            break;
          }
        }
      }

      return {
        authorityScore: Math.round(score * 100) / 100,
        tier: score >= 0.90 ? "tier_1_official" : score >= 0.80 ? "tier_2_established" : "tier_3_factcheck",
        sourceName: src.name,
        isPrimary,
        domain: domain || pattern,
      };
    }
  }

  // 2. Heuristic checks if not in registry
  if (domain.endsWith(".gov.in") || domain.endsWith(".nic.in")) {
    return {
      authorityScore: 0.94,
      tier: "tier_1_official",
      sourceName: publisher || "Government of India Portal",
      isPrimary: true,
      domain,
    };
  }

  if (domain.endsWith(".edu") || domain.endsWith(".ac.in")) {
    return {
      authorityScore: 0.82,
      tier: "tier_2_established",
      sourceName: publisher || "Academic Institution",
      isPrimary: false,
      domain,
    };
  }

  // 3. Fallback general web
  return {
    authorityScore: reg.default_tiers.tier_4_general_web.authority_score || 0.45,
    tier: "tier_4_general_web",
    sourceName: publisher || domain || "Web Source",
    isPrimary: false,
    domain,
  };
}

export default {
  evaluateSourceAuthority,
  extractDomain,
};
