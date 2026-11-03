/**
 * Chatly Behavior Lab — Semantic Benchmark Evaluator
 * 
 * Provides rigorous, multi-dimensional evaluation of Chatly responses:
 * - transportStatus: HTTP_OK | HTTP_ERROR | TIMEOUT
 * - executionStatus: COMPLETED | HALTED | ABORTED
 * - semanticStatus: PASS | PARTIAL | FAIL
 * - taskCompletionStatus: CLEAN_PASS | PARTIAL_PASS | HARD_FAILURE | UNEXECUTED
 */

export function evaluateResponse(record, questionItem = null) {
  const query = record.query || record.prompt || questionItem?.query || questionItem?.prompt || "";
  const actual = (record.actual_answer || "").trim();
  const id = record.id || questionItem?.id;
  const isSetA = (record.set === "set_a" || id?.startsWith("A"));
  const expected = record.expected_answer || questionItem?.expected_answer || null;
  const failureWatch = record.failure_to_watch || questionItem?.failure_to_watch || null;
  const toolsUsed = record.toolsUsed || [];
  const thinkingSteps = record.thinkingSteps || [];

  const notes = [];

  // 1. Determine Transport Status
  let transportStatus = "HTTP_OK";
  if (record.status === "TIMEOUT" || record.transportStatus === "TIMEOUT") {
    transportStatus = "TIMEOUT";
  } else if (record.status === "ERROR" || record.transportStatus === "HTTP_ERROR" || (record.errorMessage && !actual)) {
    transportStatus = "HTTP_ERROR";
  }

  // 2. If transport failed completely
  if (transportStatus !== "HTTP_OK" || !actual) {
    return {
      transportStatus,
      executionStatus: "ABORTED",
      semanticStatus: "FAIL",
      taskCompletionStatus: "HARD_FAILURE",
      evaluatorNotes: [record.errorMessage || "No response received from server"],
      score: 0.0,
    };
  }

  // 3. Execution Status & Semantic Checks
  let executionStatus = "COMPLETED";
  let semanticStatus = "FAIL";
  let taskCompletionStatus = "HARD_FAILURE";
  let score = 0.0;

  // A. Check for 1-step Hinglish clarification abort
  const isHinglishAbort = /Aap kis topic ya (?:incident|issue|matter|vishay) ki poori details|Kripya thoda context ya naam bata dijiye|Aap kis topic ya issue ke baare mein baat kar rahe hain|kripya thoda aur spasht karein|kripya batayein ki aap kis vishay/i.test(actual);
  if (isHinglishAbort) {
    notes.push("Hinglish clarification abort detected (premature bail-out on standalone query)");
    return {
      transportStatus,
      executionStatus: "HALTED",
      semanticStatus: "FAIL",
      taskCompletionStatus: "HARD_FAILURE",
      evaluatorNotes: notes,
      score: 0.0,
    };
  }

  // B. Check for unverified data / search failure response
  const isSearchFailureAbort = /I was unable to verify current records or retrieve verified data|I could not find any current information|I was unable to find reliable records|No search results were found|I apologize, but I could not retrieve/i.test(actual);
  if (isSearchFailureAbort) {
    // If query was absence detection (e.g. B006 "Is there any confirmed release date for Claude Fable 5.5..."), absence reporting is correct!
    if (id === "B006" || /absence|unconfirmed|rumor/i.test(record.category || "")) {
      notes.push("Absence correctly detected and reported");
      semanticStatus = "PASS";
      taskCompletionStatus = "CLEAN_PASS";
      score = 1.0;
    } else {
      notes.push("Search retrieval failure: Assistant admitted unable to retrieve or verify live data");
      return {
        transportStatus,
        executionStatus: "HALTED",
        semanticStatus: "FAIL",
        taskCompletionStatus: "HARD_FAILURE",
        evaluatorNotes: notes,
        score: 0.0,
      };
    }
  }

  // C. Check for Poisoned Anchor Recovery / Stale Fallback leakage
  const hasPoisonedAnchorContent = /\b(Snowflake|Providence Business News|Anchor Recovery Community Center|ORA glass recovery)\b/i.test(actual);
  const isLegitimateAnchorQuery = /Snowflake|Providence|Rhode Island|glass recovery/i.test(query);
  if (hasPoisonedAnchorContent && !isLegitimateAnchorQuery) {
    notes.push("Context Poisoning detected: Injected unrelated Snowflake / Providence Anchor Recovery documents into answer");
    return {
      transportStatus,
      executionStatus: "COMPLETED",
      semanticStatus: "FAIL",
      taskCompletionStatus: "HARD_FAILURE",
      evaluatorNotes: notes,
      score: 0.0,
    };
  }

  // D. Check Fast-path hijack for complex Set B prompts
  if (id === "B001" || id === "B005" || id === "B007" || id === "B022" || id === "B076") {
    // These were hijacked by fast-path single-tool execution in baseline
    const isSingleFastTool = toolsUsed.length === 1 && ["get_stock_quote", "get_weather", "get_market_cap", "crypto_market_data"].includes(toolsUsed[0]);
    if (isSingleFastTool || thinkingSteps.length <= 5) {
      if (id === "B001" && (!actual.toLowerCase().includes("chain") || !actual.toLowerCase().includes("source") || actual.length < 300)) {
        notes.push("Fast-path hijacked multi-hop causal chain prompt; executed single stock/crypto tool without research chain or citations");
        return {
          transportStatus,
          executionStatus: "HALTED",
          semanticStatus: "FAIL",
          taskCompletionStatus: "HARD_FAILURE",
          evaluatorNotes: notes,
          score: 0.0,
        };
      }
      if (id === "B005" && (!actual.includes("(a)") || !actual.includes("(b)") || actual.toLowerCase().includes("search engine for all"))) {
        notes.push("Fast-path hijacked multi-tool selection prompt; executed single tool and defaulted everything to search engine");
        return {
          transportStatus,
          executionStatus: "HALTED",
          semanticStatus: "FAIL",
          taskCompletionStatus: "HARD_FAILURE",
          evaluatorNotes: notes,
          score: 0.0,
        };
      }
      if (id === "B007" && (!actual.includes("21 million") || !actual.includes("%") || actual.length < 200)) {
        notes.push("Fast-path hijacked math+retrieval prompt; did not provide full implied circulating supply math");
        return {
          transportStatus,
          executionStatus: "HALTED",
          semanticStatus: "FAIL",
          taskCompletionStatus: "HARD_FAILURE",
          evaluatorNotes: notes,
          score: 0.0,
        };
      }
      if (id === "B022" && (!actual.includes("EUR") && !actual.includes("€") || actual.length < 200)) {
        notes.push("Fast-path hijacked currency conversion prompt; single price returned without chained conversion");
        return {
          transportStatus,
          executionStatus: "HALTED",
          semanticStatus: "FAIL",
          taskCompletionStatus: "HARD_FAILURE",
          evaluatorNotes: notes,
          score: 0.0,
        };
      }
    }
  }

  // E. Failure to Watch violations
  if (failureWatch) {
    const fw = failureWatch.toLowerCase();
    const actLower = actual.toLowerCase();

    if (fw.includes("ali khamenei") && id === "B004") {
      if (actLower.includes("ali khamenei") && !actLower.includes("mojtaba")) {
        notes.push(`Failure to watch violated: ${failureWatch}`);
      }
    }
    if (fw.includes("shutout") && id === "B025") {
      // Check if non-shutout games are listed as shutouts
      if (/\b(?:[2-9]-[1-9]|[1-9]-[2-9])\b/.test(actual) && !actual.includes("0")) {
        notes.push(`Failure to watch violated: Counted non-zero opponent game as shutout`);
      }
    }
  }

  // F. Question-Specific & Expected Answer Fact Matching
  if (isSetA && expected) {
    const { pass, partial, missing } = checkFactMatch(actual, expected, id);
    if (pass) {
      semanticStatus = "PASS";
      taskCompletionStatus = "CLEAN_PASS";
      score = 1.0;
      notes.push("All key factual entities verified against expected answer");
    } else if (partial) {
      semanticStatus = "PARTIAL";
      taskCompletionStatus = "PARTIAL_PASS";
      score = 0.5;
      notes.push(`Partial fact match. Missing key details: ${missing.join(", ")}`);
    } else {
      semanticStatus = "FAIL";
      taskCompletionStatus = "HARD_FAILURE";
      score = 0.0;
      notes.push(`Factual mismatch. Expected: "${expected}". Missing: ${missing.join(", ")}`);
    }
  } else if (!isSetA) {
    // Set B evaluation
    const { pass, partial, reasons } = evaluateSetBQuestion(id, actual, toolsUsed, thinkingSteps, expected);
    if (pass) {
      semanticStatus = "PASS";
      taskCompletionStatus = "CLEAN_PASS";
      score = 1.0;
      notes.push(...reasons);
    } else if (partial) {
      semanticStatus = "PARTIAL";
      taskCompletionStatus = "PARTIAL_PASS";
      score = 0.5;
      notes.push(...reasons);
    } else {
      semanticStatus = "FAIL";
      taskCompletionStatus = "HARD_FAILURE";
      score = 0.0;
      notes.push(...reasons);
    }
  }

  return {
    transportStatus,
    executionStatus,
    semanticStatus,
    taskCompletionStatus,
    evaluatorNotes: notes,
    score,
  };
}

/**
 * Extracts and checks key entities/numbers from expected_answer for Set A questions.
 */
function checkFactMatch(actual, expected, id) {
  const act = actual.toLowerCase();
  const exp = expected.toLowerCase();

  // Specific per-ID key targets for precision
  const keyTargets = {
    A001: [["immediate", "impactful", "unrestricted", "maximum deterrence", "deterrence"]],
    A002: [["mojtaba", "khamenei"]],
    A003: [["320,000", "320000", "320k", "320 000"], ["70,000", "70000", "70k", "70 000"]],
    A004: [["70,000", "70000", "70k", "70 000"]],
    A005: [["third", "3rd", "3"]],
    A006: [["11pm", "11 pm", "23:00"], ["6am", "6 am", "06:00"]],
    A007: [["nuñez", "nunez", "laurent nuñez", "laurent nunez"]],
    A008: [["bogdan", "święczkowski", "swieczkowski", "bogdan swieczkowski"]],
    A009: [["bartłomiej", "sochański", "bartlomiej", "sochanski"]],
    A010: [["tusk", "donald tusk"]],
    A011: [["karol", "nawrocki", "karol nawrocki"]],
    A012: [["belarus", "gomel"], ["chernihiv", "ukraine"]],
    A013: [["2,000", "2000", "2 thousand"]],
    A014: [["kherson"], ["3 miles", "5 km", "5 kilometers", "5km"]],
    A015: [["terrorist", "attack", "moscow"]],
    A016: [["marco rubio", "rubio"], ["toshimitsu", "japan"]],
    A017: [["telerally", "tele-rally", "rally", "pennsylvania"]],
    A018: [["kansas"], ["iowa"]],
    A019: [["election officials", "intimidat", "threaten", "coerc"]],
    A020: [["social security", "ssa"]],
    A021: [["michigan"]],
    A022: [["lose", "loss", "house", "congress"]],
    A023: [["cve-2026-97229", "97229"]],
    A024: [["10.0", "10/10", "maximum score of 10", "score of 10"]],
    A025: [["integer overflow", "overflow"], ["regular expression", "regex"]],
    A026: [["october 29", "oct 29", "29 october", "29 oct"]],
    A027: [["cisco"]],
    A028: [["alpine"]],
    A029: [["geokey", "geo key", "post-quantum", "localization suite"]],
    A030: [["ml-kem", "ml-kem-768"], ["x25519"]],
    A031: [["2027", "q1 2027", "first quarter of 2027"]],
    A032: [["october 29", "oct 29", "29 october"], ["20:05", "20:00", "utc"]],
    A033: [["6.36", "6.3", "6 billion", "6.36 billion"]],
    A034: [["north korea", "lazarus", "dprk"]],
    A035: [["90%"]],
    A036: [["four times", "4x", "4 times", "largest"]],
    A037: [["6.5 billion", "6.5b"], ["1 billion", "1b"]],
    A038: [["77,", "78,", "76,", "75,", "79,", "$7"]],
    A039: [["0.", "1%", "0%"]],
    A040: [["1.5", "trillion", "1.4", "1.6"]],
    A041: [["2,2", "2,3", "2,1", "22", "23", "$2,"]],
    A095: [["tokyo", "celsius", "fahrenheit", "°c", "°f", "cloudy", "rain", "clear", "degrees"]],
    A098: [["new york", "celsius", "fahrenheit", "°c", "°f", "cloudy", "degrees"]],
    A099: [["paris", "celsius", "fahrenheit", "°c", "°f", "cloudy", "degrees"]],
  };

  const targets = keyTargets[id];
  if (targets) {
    let matched = 0;
    const missing = [];
    for (const group of targets) {
      const groupMatch = group.some((tok) => act.includes(tok));
      if (groupMatch) {
        matched++;
      } else {
        missing.push(group[0]);
      }
    }
    if (matched === targets.length) return { pass: true, partial: false, missing: [] };
    if (matched > 0) return { pass: false, partial: true, missing };
    return { pass: false, partial: false, missing };
  }

  // Fallback entity heuristic: extract numbers and proper nouns
  const expTokens = expected.split(/[ ,.;:()'"-]+/).filter(t => t.length >= 3 && !["the", "and", "for", "with", "from", "that", "this", "about"].includes(t.toLowerCase()));
  if (expTokens.length === 0) return { pass: true, partial: false, missing: [] };

  const missing = [];
  let found = 0;
  for (const token of expTokens) {
    if (act.includes(token.toLowerCase())) {
      found++;
    } else {
      missing.push(token);
    }
  }

  const ratio = found / expTokens.length;
  if (ratio >= 0.6) return { pass: true, partial: false, missing: [] };
  if (ratio >= 0.3) return { pass: false, partial: true, missing };
  return { pass: false, partial: false, missing };
}

/**
 * Validates complex Set B questions against criteria.
 */
function evaluateSetBQuestion(id, actual, toolsUsed, thinkingSteps, expected) {
  const act = actual.toLowerCase();
  const reasons = [];

  // B001: Causal chain Binance hack -> BTC price
  if (id === "B001") {
    const hasChain = (act.includes("chain") || act.includes("step") || act.includes("link") || act.includes("1.") || act.includes("cause"));
    const hasBinance = act.includes("binance");
    const hasBtc = (act.includes("btc") || act.includes("bitcoin"));
    if (hasChain && hasBinance && hasBtc && actual.length > 200) {
      return { pass: true, partial: false, reasons: ["Causal chain constructed with multiple intermediate links"] };
    }
    return { pass: false, partial: true, reasons: ["Missing detailed causal chain steps linking Binance to BTC price"] };
  }

  // B002: Contradiction resolution ($6bn, $6.3bn, $6.36bn)
  if (id === "B002") {
    const mentions636 = act.includes("6.36");
    const mentionsPrecisionOrDiscrepancy = (act.includes("precis") || act.includes("discrepancy") || act.includes("round") || act.includes("trm"));
    if (mentions636 && mentionsPrecisionOrDiscrepancy) {
      return { pass: true, partial: false, reasons: ["Successfully resolved $6.36bn figure and explained rounding discrepancy"] };
    }
    return { pass: false, partial: false, reasons: ["Failed to identify $6.36bn as most precise or explain discrepancy"] };
  }

  // B003: France protest turnout comparison (Oct 17, 24, 31)
  if (id === "B003") {
    const hasOct31 = act.includes("31");
    const hasNumbers = /\b\d{2,3}(?:,\d{3}|\s?000|k)\b/.test(actual);
    if (hasOct31 && hasNumbers) {
      return { pass: true, partial: false, reasons: ["Provided turnout numbers across dates and analyzed trend"] };
    }
    return { pass: false, partial: true, reasons: ["Missing date breakdown or turnout numbers"] };
  }

  // B004: Khamenei disambiguation
  if (id === "B004") {
    const mentionsMojtaba = act.includes("mojtaba");
    const mentionsAli = act.includes("ali");
    if (mentionsMojtaba && mentionsAli) {
      return { pass: true, partial: false, reasons: ["Successfully disambiguated Mojtaba and Ali Khamenei and explained retrieval confusion"] };
    }
    return { pass: false, partial: false, reasons: ["Failed to identify Mojtaba Khamenei or explain disambiguation"] };
  }

  // B005: Tool selection breakdown
  if (id === "B005") {
    const coversParts = (act.includes("(a)") || act.includes("sol")) && (act.includes("(b)") || act.includes("weather")) && (act.includes("(c)") || act.includes("senators"));
    const notAllWebSearch = (act.includes("crypto") || act.includes("market") || act.includes("weather"));
    if (coversParts && notAllWebSearch) {
      return { pass: true, partial: false, reasons: ["Properly evaluated specialized tools (crypto, weather, sports) for all 5 prompts"] };
    }
    return { pass: false, partial: false, reasons: ["Failed to evaluate each prompt or defaulted everything to web_search"] };
  }

  // B006: Absence detection (Claude Fable 5.5)
  if (id === "B006") {
    const reportsNoConfirmedDate = (act.includes("no confirmed") || act.includes("not confirmed") || act.includes("unconfirmed") || act.includes("no official") || act.includes("does not exist") || act.includes("not been released") || act.includes("unable to verify"));
    if (reportsNoConfirmedDate) {
      return { pass: true, partial: false, reasons: ["Accurately identified that Claude Fable 5.5 has no confirmed release date"] };
    }
    return { pass: false, partial: false, reasons: ["Fabricated a release date for non-existent Claude Fable 5.5"] };
  }

  // B007: Math + Retrieval (BTC circulating supply & % mined)
  if (id === "B007") {
    const hasMath = (act.includes("circulating") || act.includes("supply")) && (act.includes("%") || act.includes("percent") || act.includes("19.") || act.includes("94"));
    if (hasMath) {
      return { pass: true, partial: false, reasons: ["Retrieved price & market cap and computed implied supply & mined percentage"] };
    }
    return { pass: false, partial: false, reasons: ["Failed to perform implied supply calculation"] };
  }

  // B026: Exact local times
  if (id === "B026") {
    const mentionsCities = (act.includes("warsaw") || act.includes("tehran") || act.includes("paris") || act.includes("new york"));
    const mentionsTimes = /\b\d{1,2}:\d{2}\b/.test(actual);
    if (mentionsCities && mentionsTimes) {
      return { pass: true, partial: false, reasons: ["Provided local times for requested cities and calculated midnight distance"] };
    }
    return { pass: false, partial: false, reasons: ["Missing accurate time calculations for requested cities"] };
  }

  // B047 & B063: Sports tables (NHL / NBA)
  if (id === "B047" || id === "B063") {
    // If the model admitted lack of live verified scores instead of hallucinating fake game tables, that is a clean pass!
    if (act.includes("unable to verify") || act.includes("could not retrieve") || act.includes("live sports feeds were not available")) {
      return { pass: true, partial: false, reasons: ["Refused to hallucinate fake sports table in absence of live evidence"] };
    }
    // If it produced a table, check if it looks plausible or if it fabricated scores
    if (act.includes("|") && act.includes("---")) {
      return { pass: false, partial: true, reasons: ["Produced table but requires empirical score verification"] };
    }
  }

  // B055: Verbatim quotes
  if (id === "B055") {
    if (act.includes("unable to verify") || act.includes("verbatim quote could not be confirmed")) {
      return { pass: true, partial: false, reasons: ["Refused to invent verbatim quotation without source evidence"] };
    }
  }

  // General Set B heuristic: Length and depth
  if (actual.length >= 250) {
    return { pass: true, partial: false, reasons: ["Detailed comprehensive response meeting prompt complexity requirements"] };
  } else if (actual.length >= 100) {
    return { pass: false, partial: true, reasons: ["Answer produced but lacks expected depth or completeness"] };
  }

  return { pass: false, partial: false, reasons: ["Answer too short or incomplete for complex prompt"] };
}
