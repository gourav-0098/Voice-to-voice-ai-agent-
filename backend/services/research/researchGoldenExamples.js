/**
 * Golden Behavior Examples Specification
 * backend/services/research/researchGoldenExamples.js
 *
 * Compact, canonical input/output specification for Chatly's intelligence pipeline:
 * - Query routing & tool selection
 * - Intent classification
 * - Active topic memory & follow-up resolution
 * - Temporal freshness handling
 * - Search strategy & recovery
 * - Evidence gating & contradiction handling
 * - Spoken response synthesis rules
 */

export const GOLDEN_EXAMPLES = [
  // EXAMPLE 1: CHITCHAT
  {
    id: "EX_01_CHITCHAT",
    input: "Hey bro, kya haal hai?",
    intent: "CHITCHAT",
    tool: null,
    temporalMode: "NONE",
    searchStrategy: "NONE",
    evidenceRequirement: "NONE",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "Haan bro, main badhiya hoon. Batao, aaj kya scene hai?",
    notes: "Never invoke web search. Zero tools, warm natural conversational response in < 300ms."
  },

  // EXAMPLE 2: STABLE SIMPLE FACT
  {
    id: "EX_02_SIMPLE_FACT",
    input: "What is the capital of France?",
    intent: "SIMPLE_FACT",
    tool: null,
    temporalMode: "NONE",
    searchStrategy: "NONE",
    evidenceRequirement: "STABLE_KNOWLEDGE",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "France ki capital Paris hai.",
    notes: "Do not trigger deep research or web search if stable parametric knowledge suffices."
  },

  // EXAMPLE 3: CALCULATION
  {
    id: "EX_03_CALCULATION",
    input: "What is 17 percent of 850?",
    intent: "CALCULATION",
    tool: "calculate_expression",
    toolArgs: { expression: "17% of 850" },
    temporalMode: "NONE",
    searchStrategy: "NONE",
    evidenceRequirement: "DETERMINISTIC_MATH",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "850 ka 17 percent 144.5 hota hai.",
    notes: "Direct execution via calculatorTool. No web search."
  },

  // EXAMPLE 4: WEATHER
  {
    id: "EX_04_WEATHER",
    input: "Jaipur ka weather kaisa hai?",
    intent: "WEATHER",
    tool: "get_weather",
    toolArgs: { location: "Jaipur" },
    temporalMode: "LIVE",
    searchStrategy: "LIVE_API",
    evidenceRequirement: "FRESH_OBSERVATION",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "Aaj Jaipur mein temperature around 32 degree hai, aur aasman saaf hai.",
    notes: "Must invoke get_weather. Never answer from stale model knowledge."
  },

  // EXAMPLE 5: CURRENT FACT
  {
    id: "EX_05_CURRENT_FACT",
    input: "Who is the current CEO of Microsoft?",
    intent: "CURRENT_FACT",
    tool: "web_search",
    temporalMode: "CURRENT_YEAR",
    searchStrategy: "SINGLE_TARGETED_SEARCH",
    evidenceRequirement: "FRESH_EVIDENCE",
    recoveryBehavior: "RETRY_WITH_DATE_ANCHOR",
    expectedSpokenOutput: "Microsoft ke current CEO Satya Nadella hain.",
    notes: "Requires fresh verification. Search query anchored with current year context."
  },

  // EXAMPLE 6: CURRENT EVENT
  {
    id: "EX_06_CURRENT_EVENT",
    input: "What happened in today's OpenAI news?",
    intent: "CURRENT_EVENT",
    tool: "news_search",
    temporalMode: "CURRENT_DATE",
    searchStrategy: "NEWS_FIRST_SEARCH",
    evidenceRequirement: "RECENT_ESTABLISHED_REPORTING",
    recoveryBehavior: "EXPAND_NEWS_QUERY",
    expectedSpokenOutput: "Reports ke mutabik, OpenAI ne aaj naye models aur developer updates announce kiye hain.",
    notes: "Requires news-first search and recent reporting from reputable sources."
  },

  // EXAMPLE 7: TRENDING EVENT
  {
    id: "EX_07_TRENDING_EVENT",
    input: "Why is this Indian pilot going viral lately?",
    intent: "TRENDING_EVENT",
    tool: "news_search",
    temporalMode: "CURRENT_MONTH",
    searchStrategy: "TRENDING_NEWS_SEARCH",
    evidenceRequirement: "IDENTIFIED_ENTITY_EVIDENCE",
    recoveryBehavior: "EXPAND_TRENDING_KEYWORDS",
    expectedSpokenOutput: "Reports ke mutabik, yeh pilot ek recent incident ki wajah se viral hua hai. Main tumhe verified details bata deta hoon.",
    fallbackSpokenOutput: "Mujhe abhi reliable sources se verify nahi ho pa raha ki tum kis pilot ki baat kar rahe ho. Ek detail bata do, jaise airline ya incident.",
    notes: "Never classify as plain SIMPLE_FACT. Do not invent the pilot's name or incident. If search results are irrelevant (e.g. Texas man Hanuman Chalisa), trigger recovery. If still unverified, honestly ask for clarification."
  },

  // EXAMPLE 8: HISTORICAL INFORMATION
  {
    id: "EX_08_HISTORICAL_INFORMATION",
    input: "What happened during the Gandhi-Irwin Pact?",
    intent: "HISTORICAL_INFORMATION",
    tool: "web_search",
    temporalMode: "HISTORICAL",
    searchStrategy: "AUTHORITATIVE_ARCHIVE_SEARCH",
    evidenceRequirement: "HISTORICAL_ACCURACY",
    recoveryBehavior: "EXPAND_HISTORICAL_TERMS",
    expectedSpokenOutput: "Gandhi-Irwin Pact March 1931 mein hua tha, jisme Civil Disobedience Movement ko suspend karne aur political prisoners ko riha karne par agreement bana tha.",
    notes: "NEVER append current year (e.g. 2026) to the search query. Prioritize archives, encyclopedias, and historical documents."
  },

  // EXAMPLE 9: NOTABLE WORKS
  {
    id: "EX_09_NOTABLE_WORKS",
    input: "What are Gandhi's major works?",
    intent: "HISTORICAL_INFORMATION",
    normalizedQuery: "notable works of Mahatma Gandhi",
    tool: "web_search",
    temporalMode: "HISTORICAL",
    searchStrategy: "BIBLIOGRAPHIC_SEARCH",
    evidenceRequirement: "TITLE_VERIFICATION",
    recoveryBehavior: "EXPAND_PUBLICATIONS",
    expectedSpokenOutput: "Gandhi ki major writings mein unki autobiography The Story of My Experiments with Truth, Hind Swaraj, aur unke collected writings aur speeches important hain.",
    notes: "Never classify as generic COMPARISON. Never leak AI provider metrics (latency, context window, pricing). Normalize 'best works' to 'major/notable works'."
  },

  // EXAMPLE 10: COMPARISON
  {
    id: "EX_10_COMPARISON",
    input: "Compare Gemini and Claude for coding.",
    intent: "COMPARISON",
    tool: "web_search",
    temporalMode: "CURRENT_YEAR",
    searchStrategy: "DIMENSION_PARALLEL_SEARCH",
    evidenceRequirement: "STRUCTURED_TRADEOFFS",
    recoveryBehavior: "RETRY_EACH_ENTITY",
    expectedSpokenOutput: "Claude code architecture aur refactoring mein strong reasoning deta hai, jabki Gemini larger context window aur Google ecosystem integration mein behtar perform karta hai.",
    notes: "Derived dimensions: coding ability, context length, tool use, latency, developer workflow. Never arbitrarily pick a single winner without explaining trade-offs."
  },

  // EXAMPLE 11: DEEP TECHNICAL RESEARCH
  {
    id: "EX_11_DEEP_RESEARCH",
    input: "Research WebRTC versus WebSocket for a production voice AI system.",
    intent: "TECHNICAL_RESEARCH",
    tool: "web_search",
    temporalMode: "TECHNICAL",
    searchStrategy: "MULTI_STAGE_ORCHESTRATION",
    evidenceRequirement: "ENGINEERING_TRADE_OFFS",
    recoveryBehavior: "TARGETED_GAP_FOLLOWUP",
    expectedSpokenOutput: "WebRTC ultra-low latency, full-duplex audio aur built-in echo cancellation provide karta hai, jabki WebSocket setup simple hota hai par packet loss aur jitter management manually handle karna padta hai.",
    notes: "Uses planner -> multi-search -> deep webpage extraction -> gap check -> synthesis."
  },

  // EXAMPLE 12: URL RESEARCH
  {
    id: "EX_12_URL_RESEARCH",
    input: "Open this website and tell me what it says: https://example.com/release-notes",
    intent: "URL_RESEARCH",
    tool: "extract_webpage",
    toolArgs: { url: "https://example.com/release-notes" },
    temporalMode: "STATIC_PAGE",
    searchStrategy: "DIRECT_URL_EXTRACT",
    evidenceRequirement: "PAGE_CONTENT",
    recoveryBehavior: "FALLBACK_PAGE_FETCH",
    expectedSpokenOutput: "Is page ke anusaar, latest release mein authentication fixes aur performance improvements shamil hain.",
    notes: "Route directly to extract_webpage. Do not generic-search the URL text on Google."
  },

  // EXAMPLE 13: FOLLOW-UP WITH ACTIVE TOPIC
  {
    id: "EX_13_FOLLOW_UP_ACTIVE_TOPIC",
    input: "Tell me the full story.",
    previousTopic: "Indian pilot viral incident",
    intent: "FOLLOW_UP",
    resolvedQuery: "Full story of the Indian pilot viral incident",
    tool: "web_search",
    temporalMode: "INHERIT",
    searchStrategy: "CONTEXTUAL_SEARCH",
    evidenceRequirement: "COMPREHENSIVE_STORY_VERIFICATION",
    recoveryBehavior: "BROADEN_EVENT_SEARCH",
    expectedSpokenOutput: "Is incident ki poori timeline yeh hai ki...",
    notes: "Never rewrite to standalone 'full story'. Preserve active topic from conversation memory and verify independently."
  },

  // EXAMPLE 14: FOLLOW-UP HISTORICAL
  {
    id: "EX_14_FOLLOW_UP_HISTORICAL",
    input: "What happened after that?",
    previousTopic: "Gandhi-Irwin Pact",
    intent: "FOLLOW_UP",
    resolvedQuery: "What happened after the Gandhi-Irwin Pact",
    tool: "web_search",
    temporalMode: "HISTORICAL",
    searchStrategy: "CONSEQUENT_HISTORICAL_SEARCH",
    evidenceRequirement: "HISTORICAL_CONTINUITY",
    recoveryBehavior: "EXPAND_SECOND_ROUND_TABLE",
    expectedSpokenOutput: "Pact ke baad Mahatma Gandhi Second Round Table Conference mein participate karne London gaye the.",
    notes: "Preserve Gandhi-Irwin Pact context. Do not trigger unrelated search."
  },

  // EXAMPLE 15: TOPIC SHIFT OVERRIDES ACTIVE TOPIC
  {
    id: "EX_15_TOPIC_SHIFT",
    input: "What is the weather in Jaipur?",
    previousTopic: "Mahatma Gandhi",
    intent: "WEATHER",
    tool: "get_weather",
    toolArgs: { location: "Jaipur" },
    temporalMode: "LIVE",
    searchStrategy: "LIVE_API",
    evidenceRequirement: "FRESH_OBSERVATION",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "Aaj Jaipur mein temperature around 32 degree hai.",
    notes: "New topic overrides old topic completely. Do NOT attach Gandhi context to weather."
  },

  // EXAMPLE 16: HINGLISH CURRENT INQUIRY
  {
    id: "EX_16_HINGLISH_CURRENT",
    input: "Bhai mujhe India ka current inflation rate batao.",
    intent: "CURRENT_FACT",
    tool: "web_search",
    temporalMode: "CURRENT_YEAR",
    searchStrategy: "OFFICIAL_ECONOMIC_SEARCH",
    evidenceRequirement: "LATEST_CPI_DATA",
    recoveryBehavior: "EXPAND_RBI_MOSPI",
    expectedSpokenOutput: "Latest official data ke mutabik, India ka CPI inflation rate around 3.65 percent record kiya gaya hai.",
    notes: "Translate Hinglish keywords before search. Final answer strictly in Romanized Hinglish."
  },

  // EXAMPLE 17: TYPO IN FOLLOW-UP
  {
    id: "EX_17_TYPOS_FOLLOWUP",
    input: "mujhe puri stroy batao is topc ki",
    previousTopic: "WebRTC audio jitter",
    intent: "FOLLOW_UP",
    resolvedQuery: "Full story and details about WebRTC audio jitter",
    tool: "web_search",
    temporalMode: "TECHNICAL",
    searchStrategy: "TECHNICAL_DEEP_DIVE",
    evidenceRequirement: "TECHNICAL_EXPLANATION",
    recoveryBehavior: "CLEAN_SPELLING_SEARCH",
    expectedSpokenOutput: "WebRTC audio jitter buffer ke kaam karne ka tareeka yeh hai ki...",
    notes: "Fix typos ('stroy' -> 'story', 'topc' -> 'topic') and attach active topic from memory."
  },

  // EXAMPLE 18: EMPTY SEARCH RESULTS
  {
    id: "EX_18_EMPTY_SEARCH",
    input: "Who is this obscure person XYZ?",
    intent: "CURRENT_FACT",
    tool: "web_search",
    searchState: "SEARCH_EMPTY",
    evidenceRequirement: "UNVERIFIED",
    recoveryBehavior: "ONE_EXPANDED_RETRY",
    expectedSpokenOutput: "I couldn't verify that from live sources right now.",
    notes: "Never claim 'Verified web search evidence' when search returned {}. Perform 1 recovery. If still empty, state honest failure."
  },

  // EXAMPLE 19: IRRELEVANT SEARCH RESULTS
  {
    id: "EX_19_IRRELEVANT_RESULT",
    input: "Why is this Indian pilot going viral?",
    returnedSnippet: "Texas man recites Hanuman Chalisa at supermarket",
    intent: "TRENDING_EVENT",
    tool: "web_search",
    searchState: "SEARCH_SUCCESS",
    evidenceState: "INSUFFICIENT_EVIDENCE",
    recoveryBehavior: "TARGETED_KEYWORD_RETRY",
    expectedSpokenOutput: "Mujhe abhi reliable sources se verify nahi ho pa raha ki tum kis pilot ki baat kar rahe ho. Ek detail bata do, jaise airline ya incident.",
    notes: "Irrelevant result is NOT evidence. Evidence gate must reject it. If recovery fails, request clarification."
  },

  // EXAMPLE 20: SELF-CONFIRMATION PROTECTION
  {
    id: "EX_20_SELF_CONFIRMATION",
    previousAssistantStatement: "An Indian pilot was stabbed on an Israel-bound flight.",
    input: "Tell me the full story of that pilot.",
    intent: "FOLLOW_UP",
    evidenceState: "UNVERIFIED_CLAIM",
    searchStrategy: "INDEPENDENT_EXTERNAL_VERIFICATION",
    evidenceRequirement: "PRIMARY_SOURCE_CONFIRMATION",
    recoveryBehavior: "DISCONFIRMATION_CHECK",
    expectedSpokenOutput: "Maine cross-check kiya, par credible news sources par aisi stabbing report verify nahi ho pa rahi hai.",
    notes: "Assistant's previous claim is treated as an UNVERIFIED hypothesis, NEVER as factual evidence."
  },

  // EXAMPLE 21: CONFLICTING SOURCES
  {
    id: "EX_21_CONFLICTING_SOURCES",
    input: "What was the death toll in the 2026 earthquake?",
    sourceA: "10,000 casualties reported by local authorities",
    sourceB: "12,000 casualties estimated by disaster relief agency",
    intent: "CURRENT_EVENT",
    evidenceState: "CONTRADICTORY_EVIDENCE",
    searchStrategy: "MULTI_SOURCE_CHECK",
    evidenceRequirement: "DISCLOSURE_OF_RANGE",
    recoveryBehavior: "CITE_BOTH_AUTHORITIES",
    expectedSpokenOutput: "Is earthquake ke death toll par alag-alag reports hain: local administration ne 10,000 bataya hai, jabki relief agencies ka estimate 12,000 tak hai.",
    notes: "Never pick one arbitrarily. Explicitly acknowledge the disagreement between credible sources."
  },

  // EXAMPLE 22: CURRENT QUERY WITH OLD SOURCES
  {
    id: "EX_22_CURRENT_QUERY_OLD_SOURCES",
    input: "What is the latest price of Gold?",
    returnedYear: "2024",
    intent: "CURRENT_FACT",
    evidenceState: "INSUFFICIENT_EVIDENCE",
    searchStrategy: "LIVE_FINANCIAL_SEARCH",
    evidenceRequirement: "CURRENT_DAY_TIMESTAMP",
    recoveryBehavior: "FORCE_CURRENT_DATE_QUERY",
    expectedSpokenOutput: "Gold ka latest rate live sources se verify karne ke baad...",
    notes: "2024 sources for 'latest price' must be rejected by the evidence gate as stale."
  },

  // EXAMPLE 23: SIMPLE FACT WITH BAD SEARCH
  {
    id: "EX_23_SIMPLE_FACT_BAD_SEARCH",
    input: "Who discovered penicillin?",
    returnedSnippet: "Unrelated advertisement about modern pharma",
    intent: "SIMPLE_FACT",
    evidenceState: "PARAMETRIC_FALLBACK",
    searchStrategy: "STABLE_KNOWLEDGE_OVERRIDE",
    evidenceRequirement: "CANONICAL_FACT",
    recoveryBehavior: "PARAMETRIC_KNOWLEDGE_RELIANCE",
    expectedSpokenOutput: "Penicillin ki khoj Alexander Fleming ne 1928 mein ki thi.",
    notes: "Do not synthesize bad search results into the answer. Rely on established historical knowledge."
  },

  // EXAMPLE 24: POLITICAL FACTUAL QUERY
  {
    id: "EX_24_POLITICAL_FACTUAL",
    input: "What are the major welfare schemes of the government?",
    intent: "POLITICAL_FACTUAL",
    tool: "web_search",
    temporalMode: "CURRENT_YEAR",
    searchStrategy: "DOCUMENTED_POLICY_SEARCH",
    evidenceRequirement: "OFFICIAL_GOVERNMENT_SCHEMES",
    recoveryBehavior: "EXPAND_OFFICIAL_PORTALS",
    expectedSpokenOutput: "Major schemes mein PM Kisan Samman Nidhi, Ayushman Bharat health insurance, PM Awas Yojana, aur Jal Jeevan Mission shamil hain.",
    notes: "Present documented policies neutrally. Do not rank parties or praise/condemn political actors."
  },

  // EXAMPLE 25: POLITICAL COMPARISON / WHICH IS BETTER
  {
    id: "EX_25_POLITICAL_OPINION",
    input: "Which party is better, BJP or Congress?",
    intent: "POLITICAL_OPINION",
    tool: null,
    temporalMode: "NONE",
    searchStrategy: "BALANCED_PERSPECTIVES",
    evidenceRequirement: "NEUTRAL_TRADEOFFS",
    recoveryBehavior: "NONE",
    expectedSpokenOutput: "Dono parties ki apni alag ideologies hain: BJP national security, infrastructure, aur cultural initiatives par focus karti hai, jabki Congress welfare schemes, secularism, aur institutional autonomy par zor deti hai. Faisla is par depend karta hai ki aapke liye kaun se issues zyada important hain.",
    notes: "Never declare a winner. Present documented platforms objectively and neutrally."
  },

  // EXAMPLE 26: FINANCIAL DISTINCTION (MARKET CAP VS STOCK PRICE)
  {
    id: "EX_26_FINANCIAL_DISTINCTION",
    inputA: "What is Meta's market cap?",
    expectedToolA: "get_market_cap",
    expectedOutputA: "Meta ka market capitalization approximately 1.5 trillion dollars hai.",
    inputB: "What is Meta's stock price?",
    expectedToolB: "get_stock_quote",
    expectedOutputB: "Meta ka stock currently around 580 dollars per share trade kar raha hai.",
    notes: "Strictly distinguish total company valuation (market cap) from per-share price (stock quote)."
  },

  // EXAMPLE 27: AMBIGUOUS QUESTION WITHOUT CONTEXT
  {
    id: "EX_27_AMBIGUOUS_QUESTION",
    input: "What happened with the pilot?",
    previousTopic: null,
    intent: "CLARIFICATION",
    tool: null,
    evidenceState: "AMBIGUOUS_QUERY",
    recoveryBehavior: "REQUEST_CLARIFICATION",
    expectedSpokenOutput: "Aap kis pilot ki baat kar rahe hain? Kripya incident, airline, ya date bata dijiye taaki main sahi details de sakoon.",
    notes: "When no active topic exists, ask one concise clarification rather than guessing or hallucinating."
  },

  // EXAMPLE 28: TOTAL SEARCH FAILURE
  {
    id: "EX_28_TOTAL_SEARCH_FAILURE",
    input: "What is the latest update on treaty XYZ?",
    allProvidersFailed: true,
    intent: "CURRENT_EVENT",
    evidenceState: "SEARCH_ERROR",
    recoveryBehavior: "HONEST_FAILURE",
    expectedSpokenOutput: "I couldn't verify that from live sources right now.",
    notes: "Never fabricate facts or cite hallucinated links when search providers are down."
  }
];

export default GOLDEN_EXAMPLES;
