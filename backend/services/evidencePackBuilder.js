/**
 * Evidence Pack Builder for Chatly Voice AI
 * 
 * Transforms raw heterogeneous retrieval results (Qdrant chunks + Web Search snippets)
 * into a structured, speech-safe, authority-weighted evidence pack.
 * 
 * Key Principles:
 * 1. ZERO markdown URLs or brackets in the spoken context (prevents TTS pronunciation glitches).
 * 2. Separate UI Citations preserved for visual frontend consumption.
 * 3. Topic-aware Authority Scoring via sourceRegistryService.
 * 4. Nuance & Variation flagging (avoids fake certainty; labels differing figures for Gemini).
 * 5. Deterministic calculated confidence score (HIGH / MEDIUM / LOW).
 */

import { evaluateSourceAuthority } from "./sourceRegistryService.js";

/**
 * Strips URLs, markdown links, footnotes, citations, and TTS-breaking artifacts
 */
export function cleanForSpokenContext(text) {
  if (!text || typeof text !== "string") return "";
  return text
    // Replace markdown links [Anchor Text](http://...) with just Anchor Text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    // Remove raw http/https URLs completely
    .replace(/https?:\/\/\S+/gi, "")
    // Remove citations like [1], [2], [citation needed]
    .replace(/\[\d+\]/g, "")
    .replace(/\[citation\s+needed\]/gi, "")
    // Remove asterisks, hashtags, backticks
    .replace(/[*#`_~]/g, "")
    // Condense excessive whitespaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds a structured Evidence Pack from Qdrant candidates and Web Search results
 * 
 * @param {Object} params
 * @param {string} params.query - Original user query
 * @param {string} [params.topic] - Detected topic
 * @param {Array} [params.qdrantResults] - Retrieved chunks from Qdrant
 * @param {Array} [params.webResults] - Retrieved items from Web Search (Tavily/DuckDuckGo)
 * @param {string} [params.intent] - Query router intent
 * @returns {Object} Evidence Pack
 */
export function buildEvidencePack({
  query = "",
  topic = "general",
  qdrantResults = [],
  webResults = [],
  intent = "GENERAL_KNOWLEDGE",
} = {}) {
  const tStart = performance.now();
  const rawItems = [];
  const uiCitations = [];

  // 1. Process Qdrant items
  if (Array.isArray(qdrantResults)) {
    qdrantResults.forEach((qItem) => {
      const text = qItem.text || qItem.factCheckSummary || qItem.counterArgument || qItem.context || "";
      const sourceUrl = qItem.sourceUrl || qItem.url || "";
      const publisher = qItem.sourceType || qItem.source || qItem.title || "Knowledge Base";

      const auth = evaluateSourceAuthority({
        url: sourceUrl,
        publisher,
        topic,
      });

      const cleanText = cleanForSpokenContext(text);
      if (cleanText.length > 20) {
        rawItems.push({
          sourceName: auth.sourceName,
          authorityScore: auth.authorityScore,
          tier: auth.tier,
          text: cleanText,
          claim: qItem.claim || null,
          isPrimary: auth.isPrimary,
          origin: "qdrant_rag",
        });

        uiCitations.push({
          title: qItem.title || qItem.topic || auth.sourceName,
          publisher: auth.sourceName,
          url: sourceUrl || null,
          authorityScore: auth.authorityScore,
          tier: auth.tier,
          snippet: cleanText.substring(0, 140) + "...",
        });
      }
    });
  }

  // 2. Process Web Search items
  if (Array.isArray(webResults)) {
    webResults.forEach((wItem) => {
      const text = wItem.content || wItem.snippet || wItem.text || "";
      const sourceUrl = wItem.url || "";
      const publisher = wItem.title || "Web Search Result";

      const auth = evaluateSourceAuthority({
        url: sourceUrl,
        publisher,
        topic,
      });

      const cleanText = cleanForSpokenContext(text);
      if (cleanText.length > 20) {
        rawItems.push({
          sourceName: auth.sourceName,
          authorityScore: auth.authorityScore,
          tier: auth.tier,
          text: cleanText,
          claim: null,
          isPrimary: auth.isPrimary,
          origin: "web_search",
        });

        uiCitations.push({
          title: wItem.title || auth.sourceName,
          publisher: auth.sourceName,
          url: sourceUrl,
          authorityScore: auth.authorityScore,
          tier: auth.tier,
          snippet: cleanText.substring(0, 140) + "...",
        });
      }
    });
  }

  // Deduplicate UI citations by URL or title
  const seenUrls = new Set();
  const filteredUiCitations = uiCitations.filter((cit) => {
    const key = cit.url || cit.title;
    if (!key || seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });

  // 3. Sort raw items by Authority Score (primary government/stat bodies first)
  rawItems.sort((a, b) => b.authorityScore - a.authorityScore);

  // Take top-4 most authoritative evidence points
  const topEvidence = rawItems.slice(0, 4);

  // 4. Calculate Aggregate Confidence
  let confidenceLevel = "LOW";
  if (topEvidence.length > 0) {
    const highestAuth = topEvidence[0].authorityScore;
    const avgAuth = topEvidence.reduce((acc, cur) => acc + cur.authorityScore, 0) / topEvidence.length;

    if (highestAuth >= 0.90 && topEvidence.length >= 1) {
      confidenceLevel = "HIGH";
    } else if (highestAuth >= 0.75 || avgAuth >= 0.70) {
      confidenceLevel = "MEDIUM";
    } else {
      confidenceLevel = "LOW";
    }
  }

  // 5. Detect Potential Numerical or Definition Discrepancies
  // If multiple items cite different numbers/metrics, flag for Gemini single-pass nuance
  let conflictFlag = null;
  if (topEvidence.length >= 2) {
    const numbersFound = topEvidence.map((e) => {
      const matches = e.text.match(/\b\d+(\.\d+)?\s*(crore|lakh|percent|%|million|billion)\b/gi);
      return matches ? matches.join(", ") : null;
    }).filter(Boolean);

    if (numbersFound.length >= 2 && new Set(numbersFound).size > 1) {
      conflictFlag = "POSSIBLE_VARIATION: Different numerical estimates or reporting definitions were found across sources. Differentiate between official measured data and broad projections.";
    }
  }

  // 6. Build Compact Spoken Evidence Context for LLM
  let spokenEvidenceContext = "";
  if (topEvidence.length > 0) {
    spokenEvidenceContext += `[STRUCTURED EVIDENCE PACK (CONFIDENCE: ${confidenceLevel})]:\n`;
    topEvidence.forEach((item, idx) => {
      const tag = item.isPrimary ? "[PRIMARY SOURCE]" : "[REPORTED]";
      spokenEvidenceContext += `${idx + 1}. ${tag} ${item.sourceName} (Authority: ${item.authorityScore}): "${item.text}"\n`;
    });

    if (conflictFlag) {
      spokenEvidenceContext += `[NUANCE GUIDANCE]: ${conflictFlag}\n`;
    }

    spokenEvidenceContext += `[SPOKEN CONTEXT RULES]:\n`;
    spokenEvidenceContext += `- Cite sources naturally by name (e.g., 'MoSPI ke data ke mutabiq' or 'official reports ke mutabiq').\n`;
    spokenEvidenceContext += `- NEVER speak raw URLs or web domains.\n`;
    spokenEvidenceContext += `- Follow the confidence level: ${confidenceLevel === "HIGH" ? "Speak with factual certainty." : confidenceLevel === "MEDIUM" ? "Use measured phrasing ('reports indicate')." : "State that direct verification is inconclusive."}\n`;
  }

  const buildLatencyMs = Math.round((performance.now() - tStart) * 100) / 100;

  return {
    query,
    intent,
    evidenceCount: topEvidence.length,
    confidenceLevel,
    spokenEvidenceContext,
    uiCitations: filteredUiCitations,
    buildLatencyMs,
  };
}

export default {
  buildEvidencePack,
  cleanForSpokenContext,
};
