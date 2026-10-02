/**
 * Research Evidence Quality Gate & Normalizer
 * backend/services/research/researchEvidenceGate.js
 *
 * Implements:
 * - Source Tier Classification (TIER_1_PRIMARY, TIER_2_ESTABLISHED, TIER_3_SECONDARY, TIER_4_GENERAL_WEB)
 * - Result Quality Gate & Explicit States (SEARCH_SUCCESS, SEARCH_PARTIAL, SEARCH_EMPTY, SEARCH_ERROR)
 * - Deterministic Evidence Sufficiency Gate
 * - Structured Evidence Pack Normalization
 * - Qwen 27B Semantic Gap & Conflict Analysis
 */

export const SOURCE_TIERS = {
  TIER_1_PRIMARY: "TIER_1_PRIMARY",
  TIER_2_ESTABLISHED: "TIER_2_ESTABLISHED",
  TIER_3_SECONDARY: "TIER_3_SECONDARY",
  TIER_4_GENERAL_WEB: "TIER_4_GENERAL_WEB",
};

/**
 * Classifies a URL / publisher into source authority tiers
 *
 * @param {string} url
 * @param {string} publisher
 * @returns {string} One of SOURCE_TIERS
 */
export function classifySourceTier(url = "", publisher = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // TIER_1_PRIMARY: Official documentation, developer portals, cloud providers, AI labs, standards bodies, government
    if (
      host.endsWith(".gov") ||
      host.endsWith(".mil") ||
      host.endsWith(".edu") ||
      host.includes("arxiv.org") ||
      host.includes("w3.org") ||
      host.includes("ietf.org") ||
      host.includes("developer.mozilla.org") ||
      host.includes("docs.") ||
      host.includes("platform.openai.com") ||
      host.includes("ai.google.dev") ||
      host.includes("console.groq.com") ||
      host.includes("developer.apple.com") ||
      host.includes("learn.microsoft.com") ||
      host.includes("openai.com") ||
      host.includes("anthropic.com") ||
      host.includes("deepmind.google") ||
      host.includes("groq.com") ||
      host.includes("mistral.ai") ||
      host.includes("deepseek.com") ||
      host.includes("cohere.com") ||
      host.includes("together.ai") ||
      host.includes("github.com")
    ) {
      return SOURCE_TIERS.TIER_1_PRIMARY;
    }

    // TIER_2_ESTABLISHED: Established journalism, wire services, recognized tech journalism, benchmark orgs
    if (
      host.includes("reuters.com") ||
      host.includes("bloomberg.com") ||
      host.includes("apnews.com") ||
      host.includes("bbc.com") ||
      host.includes("theverge.com") ||
      host.includes("techcrunch.com") ||
      host.includes("arstechnica.com") ||
      host.includes("wired.com") ||
      host.includes("venturebeat.com") ||
      host.includes("technologyreview.com") ||
      host.includes("nature.com") ||
      host.includes("huggingface.co") ||
      host.includes("lmsys.org") ||
      host.includes("artificialanalysis.ai")
    ) {
      return SOURCE_TIERS.TIER_2_ESTABLISHED;
    }

    // TIER_3_SECONDARY: Blogs, comparison portals, community sites
    if (
      host.includes("medium.com") ||
      host.includes("substack.com") ||
      host.includes("dev.to") ||
      host.includes("hashnode.dev") ||
      host.includes("kdnuggets.com") ||
      host.includes("aimultiple.com") ||
      host.includes("towardsdatascience.com")
    ) {
      return SOURCE_TIERS.TIER_3_SECONDARY;
    }

    return SOURCE_TIERS.TIER_4_GENERAL_WEB;
  } catch (_) {
    return SOURCE_TIERS.TIER_4_GENERAL_WEB;
  }
}

/**
 * Deterministically checks evidence count, valid URLs, freshness, source diversity, and relevance
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {Array} params.observations
 * @param {Array} params.citations
 * @param {number} params.currentYear
 * @returns {Object} Structured deterministic evaluation
 */
export function evaluateEvidenceDeterministic({ query, observations = [], citations = [], currentYear = 2026 }) {
  const validObservations = observations.filter(
    (o) => o.success && o.summary && !o.summary.includes("[SEARCH_EMPTY]") && !o.summary.includes("No recent web search results")
  );

  const sourceCount = citations.length;
  if (validObservations.length === 0 || sourceCount === 0) {
    return {
      passed: false,
      sufficient: false,
      reason: "No valid observations or web sources retrieved.",
      missingInformation: ["Primary facts for query"],
      conflicts: [],
      freshnessOk: false,
      sourceCount: 0,
      sourceDiversity: 0,
      duplicateRate: 0,
      relevance: 0,
    };
  }

  // Valid URLs
  const validUrlCitations = citations.filter((c) => c.url && (c.url.startsWith("http://") || c.url.startsWith("https://")));
  if (validUrlCitations.length === 0) {
    return {
      passed: false,
      sufficient: false,
      reason: "Retrieved citations lack valid URLs.",
      missingInformation: ["Authoritative web sources"],
      conflicts: [],
      freshnessOk: false,
      sourceCount,
      sourceDiversity: 0,
      duplicateRate: 0,
      relevance: 0,
    };
  }

  // Source Diversity (distinct hosts)
  const hosts = new Set();
  validUrlCitations.forEach((c) => {
    try {
      hosts.add(new URL(c.url).hostname.toLowerCase());
    } catch (_) {}
  });
  const sourceDiversity = hosts.size;

  // Duplicate Rate
  const uniqueUrls = new Set(validUrlCitations.map((c) => c.url));
  const duplicateRate = validUrlCitations.length > 0 ? (validUrlCitations.length - uniqueUrls.size) / validUrlCitations.length : 0;

  // Freshness Check: If query asks for current/best/latest/compare, check if retrieved text mentions current year or is exclusively stale
  const queryNeedsRecency = /\b(current|latest|today|now|recent|best|update|models|providers|api|compare|this month|september 2026|october 2026)\b/i.test(query) || !/\b(19\d\d|20[01]\d|202[0-5])\b/.test(query);
  const combinedText = (
    validObservations.map((o) => o.summary).join(" ") + " " +
    validUrlCitations.map((c) => (c.snippet || "") + " " + (c.title || "")).join(" ")
  ).toLowerCase();

  const hasCurrentYear = combinedText.includes(String(currentYear));
  const hasStalePastYearOnly = (combinedText.includes("2024") || combinedText.includes("2023")) && !hasCurrentYear;
  const freshnessOk = !queryNeedsRecency || !hasStalePastYearOnly || hasCurrentYear;

  // Keyword Relevance Check
  const queryTokens = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !["what", "which", "where", "tell", "about", "show", "with"].includes(w));
  const matches = queryTokens.filter((k) => combinedText.includes(k));
  const relevance = queryTokens.length > 0 ? matches.length / queryTokens.length : 1;

  const passed = validObservations.length > 0 && validUrlCitations.length > 0 && relevance >= 0.20 && duplicateRate < 0.85;

  return {
    passed,
    sufficient: passed && freshnessOk,
    reason: passed ? "Deterministic checks passed." : "Evidence failed relevance or URL validity thresholds.",
    missingInformation: passed ? [] : ["Insufficient factual coverage of key inquiry terms"],
    conflicts: [],
    freshnessOk,
    sourceCount,
    sourceDiversity,
    duplicateRate: Number(duplicateRate.toFixed(2)),
    relevance: Number(relevance.toFixed(2)),
  };
}

/**
 * Normalizes raw citations and extracted passages into a structured evidence pack
 *
 * @param {Object} params
 * @param {Array} params.citations
 * @param {Array} params.extractedPassages
 * @param {Array<string>} params.dimensions
 * @returns {Array<Object>} Normalized evidence pack items
 */
export function normalizeEvidencePack({ citations = [], extractedPassages = [], dimensions = [] }) {
  const pack = [];
  const seenPassages = new Set();

  // 1. Ingest deeply extracted passages first (highest fidelity)
  for (const item of extractedPassages) {
    if (!item || !item.url) continue;
    const passage = item.passage || item.evidence || item.snippet || "";
    if (passage && !seenPassages.has(passage)) {
      seenPassages.add(passage);
      pack.push({
        source: item.publisher || item.title || "Primary Source",
        url: item.url,
        publishedAt: item.publishedAt || null,
        retrievedAt: item.retrievedAt || new Date().toISOString(),
        passage: passage.slice(0, 500),
        sourceTier: item.sourceTier || classifySourceTier(item.url, item.publisher),
        sourceRole: item.sourceTier === SOURCE_TIERS.TIER_1_PRIMARY ? "PRIMARY" : "REPORTING",
        relevance: item.relevance || 0.95,
      });
    }
  }

  // 2. Ingest search citations
  for (const c of citations) {
    if (!c || !c.url) continue;
    const passage = c.snippet || c.title || "";
    if (passage && !seenPassages.has(passage)) {
      seenPassages.add(passage);
      pack.push({
        source: c.publisher || c.title || "Web",
        url: c.url,
        publishedAt: c.publishedAt || null,
        retrievedAt: c.retrievedAt || new Date().toISOString(),
        passage: passage.slice(0, 400),
        sourceTier: c.sourceType ? c.sourceType : classifySourceTier(c.url, c.publisher),
        sourceRole: "DISCOVERY",
        relevance: 0.85,
      });
    }
  }

  return pack.slice(0, 12);
}

/**
 * Semantic Gap Analysis via Qwen 27B
 *
 * @param {Object} params
 * @param {string} params.query
 * @param {Array<Object>} params.evidencePack
 * @param {Array<string>} params.dimensions
 * @param {Function} params.callModel
 * @param {string} params.currentDateFormatted
 * @returns {Promise<Object>}
 */
export async function evaluateSemanticGap({ query, evidencePack, dimensions = [], callModel, currentDateFormatted }) {
  const auditPrompt = `User Query: "${query}"
Current Real-World Date: ${currentDateFormatted}

Candidate Dimensions: ${dimensions.join(", ")}

Normalized Evidence Pack (${evidencePack.length} items):
${evidencePack.map((e, idx) => `[Evidence ${idx + 1}] (${e.sourceRole} - ${e.source} | ${e.sourceTier}): ${e.passage}`).join("\n\n")}

Auditing Instructions:
1. Verify if the retrieved evidence sufficiently covers the requested dimensions for the current timeframe.
2. Identify any missing information or conflicting claims.
3. If an essential dimension is completely missing, suggest ONE specific follow-up search task.

Respond strictly in valid JSON format:
{
  "sufficient": true | false,
  "sourceCount": ${evidencePack.length},
  "missingInformation": ["dimension A"],
  "conflicts": [],
  "freshnessOk": true | false,
  "unsupportedClaims": [],
  "followUpTask": null | {
    "topic": "Missing entity or dimension",
    "query": "Specific search query to retrieve missing fact",
    "sourcePreference": "official"
  }
}`;

  try {
    const res = await callModel({
      systemPrompt: "You are a fast, rigorous evidence auditor. Output only valid JSON.",
      messages: [{ role: "user", content: auditPrompt }],
      tier: "FAST_REASONER", // Qwen 27B (~350ms)
      temperature: 0.1,
    });

    const raw = typeof res === "object" && res?.reply ? res.reply : res;
    let parsed = null;
    if (typeof raw === "string") {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const target = match ? match[1] : raw;
      try {
        parsed = JSON.parse(target.trim());
      } catch (_) {
        const braceMatch = target.match(/\{[\s\S]*\}/);
        if (braceMatch) parsed = JSON.parse(braceMatch[0]);
      }
    } else {
      parsed = raw;
    }

    if (parsed && typeof parsed.sufficient === "boolean") {
      return parsed;
    }
  } catch (_) {}

  return {
    sufficient: evidencePack.length >= 3,
    sourceCount: evidencePack.length,
    missingInformation: [],
    conflicts: [],
    freshnessOk: true,
    unsupportedClaims: [],
    followUpTask: null,
  };
}

export default {
  SOURCE_TIERS,
  classifySourceTier,
  evaluateEvidenceDeterministic,
  normalizeEvidencePack,
  evaluateSemanticGap,
};
