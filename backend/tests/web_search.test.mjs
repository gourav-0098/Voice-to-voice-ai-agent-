/**
 * Multi-Stage Research & Web Search Engine Test Suite
 * backend/tests/web_search.test.mjs
 */

import { multiSearchEngine } from "../tools/providers/search/multiSearchEngine.js";
import { duckDuckGoProvider } from "../tools/providers/search/duckDuckGoProvider.js";
import { wikipediaProvider } from "../tools/providers/search/wikipediaProvider.js";
import { newsProvider } from "../tools/providers/search/newsProvider.js";
import { webSearchTool } from "../tools/modules/web/webSearchTool.js";
import { newsSearchTool } from "../tools/modules/web/newsSearchTool.js";
import { openUrlTool } from "../tools/modules/web/openUrlTool.js";
import { extractWebpageTool } from "../tools/modules/web/extractWebpageTool.js";
import { searchAndReadTool } from "../tools/modules/web/searchAndReadTool.js";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    const res = await fn();
    if (res === false) {
      console.error(`  ❌ FAIL: ${name}`);
      failedTests++;
    } else {
      console.log(`  ✅ PASS: ${name}`);
      passedTests++;
    }
  } catch (err) {
    console.error(`  ❌ FAIL (Exception): ${name}`, err.message);
    failedTests++;
  }
}

async function runWebSearchSuite() {
  console.log("================================================================================");
  console.log("🔍 CHATLY MULTI-STAGE WEB SEARCH & RESEARCH PIPELINE TEST SUITE");
  console.log("================================================================================\n");

  // 1. Individual Providers
  console.log("🔹 1. Individual Search Providers");
  await test("Wikipedia Provider returns structured entries for factual queries", async () => {
    const results = await wikipediaProvider.search("Alan Turing", { maxResults: 3 });
    return (
      Array.isArray(results) &&
      results.length > 0 &&
      results[0].title.includes("Alan Turing") &&
      results[0].url.startsWith("https://en.wikipedia.org") &&
      results[0].snippet.length > 20
    );
  });

  await test("DuckDuckGo Provider returns results or answers without error", async () => {
    const results = await duckDuckGoProvider.search("nodejs runtime", { maxResults: 3 });
    return Array.isArray(results) && results.length > 0 && typeof results[0].url === "string";
  });

  await test("Google News RSS Provider extracts authentic news items with dates and publishers", async () => {
    const results = await newsProvider.search("technology", { maxResults: 3 });
    return (
      Array.isArray(results) &&
      results.length > 0 &&
      results[0].url.startsWith("https://") &&
      results[0].publisher &&
      results[0].sourceType === "ESTABLISHED_REPORTING"
    );
  });

  // 2. MultiSearch Engine Deduplication & Ranking
  console.log("\n🔹 2. Multi-Provider Aggregation & Deduplication");
  await test("Engine strips tracking query params and fragments to deduplicate URLs", () => {
    const rawUrl1 = "https://example.com/article?utm_source=twitter&utm_medium=social#section1";
    const rawUrl2 = "https://example.com/article";
    const norm1 = multiSearchEngine.normalizeUrl(rawUrl1);
    const norm2 = multiSearchEngine.normalizeUrl(rawUrl2);
    return norm1 === norm2 && norm1 === "https://example.com/article";
  });

  await test("Engine classifies authority categories accurately", () => {
    const govType = multiSearchEngine.classifySourceType("https://www.isro.gov.in/chandrayaan.html");
    const newsType = multiSearchEngine.classifySourceType("https://www.reuters.com/world/india/article");
    const eduType = multiSearchEngine.classifySourceType("https://cs.stanford.edu/research/paper.pdf");
    const blogType = multiSearchEngine.classifySourceType("https://random-tech-blog.medium.com/post");

    return (
      govType === "OFFICIAL" &&
      newsType === "ESTABLISHED_REPORTING" &&
      eduType === "ACADEMIC" &&
      blogType === "COMMENTARY"
    );
  });

  await test("MultiSearchEngine searches across providers and ranks combined results", async () => {
    const results = await multiSearchEngine.search("Artificial Intelligence history", { maxResults: 4 });
    return (
      Array.isArray(results) &&
      results.length > 0 &&
      results.every((r) => r.title && r.url && r.sourceType && r.snippet)
    );
  });

  // 3. Web & News Search Tools
  console.log("\n🔹 3. Modular Search Tools (web_search & news_search)");
  await test("web_search tool returns normalized data contract with citation sources", async () => {
    const res = await webSearchTool.execute({ query: "Quantum computing basics" });
    return (
      res.ok === true &&
      res.tool === "web_search" &&
      res.data &&
      Array.isArray(res.sources) &&
      res.sources.length > 0 &&
      res.sources[0].url.startsWith("https://")
    );
  });

  await test("news_search tool returns fresh news articles with publishers", async () => {
    const res = await newsSearchTool.execute({ query: "artificial intelligence", maxResults: 3 });
    return (
      res.ok === true &&
      res.tool === "news_search" &&
      Array.isArray(res.data.articles) &&
      res.data.articles.length > 0 &&
      res.data.articles[0].publisher
    );
  });

  // 4. Webpage Scraping and Extraction
  console.log("\n🔹 4. Webpage Scraping & Boilerplate Cleaning");
  await test("extract_webpage cleans HTML boilerplate and returns readable text", async () => {
    const res = await extractWebpageTool.execute({ url: "https://en.wikipedia.org/wiki/Ada_Lovelace" });
    return (
      res.ok === true &&
      res.data &&
      res.data.title.includes("Ada Lovelace") &&
      res.data.text.includes("mathematician") &&
      !res.data.text.includes("<script") &&
      !res.data.text.includes("<style")
    );
  });

  await test("open_url returns normalized metadata and clean text", async () => {
    const res = await openUrlTool.execute({ url: "https://en.wikipedia.org/wiki/Grace_Hopper" });
    return (
      res.ok === true &&
      res.data &&
      res.data.title.includes("Grace Hopper") &&
      res.data.url.startsWith("https://")
    );
  });

  // 5. search_and_read End-to-End Execution
  console.log("\n🔹 5. search_and_read End-to-End Pipeline");
  await test("search_and_read conducts search, reads top pages, and extracts concise evidence", async () => {
    const res = await searchAndReadTool.execute({
      query: "James Webb Space Telescope discoveries",
      maxResults: 2,
    });

    const hasResults = res.ok === true && Array.isArray(res.data.results) && res.data.results.length > 0;
    const topResult = res.data.results?.[0];
    const hasEvidence =
      topResult &&
      topResult.title &&
      topResult.url &&
      Array.isArray(topResult.relevantPassages) &&
      topResult.sourceType;

    const voiceSummaryClean =
      typeof res.voiceSummary === "string" &&
      !res.voiceSummary.includes("http://") &&
      !res.voiceSummary.includes("https://");

    return hasResults && hasEvidence && voiceSummaryClean;
  });

  // 6. Voice Optimization & Citation Provenance
  console.log("\n🔹 6. Voice Output Optimization & Citation Provenance");
  await test("formatVoiceSummary produces conversational spoken summaries without raw URLs", () => {
    const mockResult = {
      ok: true,
      data: {
        query: "Mars rover mission",
        results: [
          {
            title: "NASA Perseverance Mars Rover Latest Findings",
            url: "https://mars.nasa.gov/news/123",
            publisher: "NASA",
            sourceType: "OFFICIAL",
            relevantPassages: ["Perseverance found organic molecules in Jezero crater."],
          },
        ],
      },
    };

    const spoken = searchAndReadTool.formatVoiceSummary(mockResult);
    return (
      typeof spoken === "string" &&
      spoken.includes("Perseverance") &&
      !spoken.includes("https://mars.nasa.gov") &&
      !spoken.includes("<") &&
      !spoken.includes(">")
    );
  });

  console.log("\n================================================================================");
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED:      ${passedTests}`);
  console.log(`FAILED:      ${failedTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runWebSearchSuite().catch((err) => {
  console.error("Fatal search suite crash:", err);
  process.exit(1);
});
