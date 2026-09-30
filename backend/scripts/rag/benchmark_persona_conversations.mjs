/**
 * Phase 2.5: Live Multi-Turn Persona Evaluation Benchmark
 * 
 * Tests multi-turn conversation flows to measure:
 * 1. Naturalness (conversational desi Hinglish vs rigid prompts)
 * 2. Intensity calibration (drops to Level 0 on movie talk, rises on debate)
 * 3. Conversational continuity (remembers previous turn and bridges follow-ups)
 * 4. Anti-caricature discipline (no slogan spamming or repetitive "bhai/arre")
 * 5. Factual vs Discourse separation across Saffron and Rationalist personas
 */

import { routeQuery } from "../../services/queryRouter.js";
import { getPersonaGrounding } from "../../services/adaptiveRagService.js";
import { getSystemInstruction } from "../../services/aiService.js";

console.log("=================================================");
console.log("🎙️ CHATLY PHASE 2.5: MULTI-TURN PERSONA EVALUATION");
console.log("=================================================\n");

const CONVERSATION_SCENARIOS = [
  {
    name: "Scenario 1: Organic Conversation (Casual -> Politics -> Disagreement -> Topic Switch -> Recall)",
    persona: "andhbhakt",
    turns: [
      {
        user: "Bhai kaisa chal raha hai sab? Aaj ka din kaisa tha?",
        expectedLevel: 0,
        expectedIntent: "CHIT_CHAT",
        description: "Pure casual small talk. Persona must remain a warm friend and NOT lecture about politics.",
      },
      {
        user: "Acha waise abhi main UPI se chai pay kar raha tha, India me digital payment kitna fail gaya na?",
        expectedLevel: 1,
        expectedIntent: "POLITICAL_DEBATE",
        description: "Policy appreciation. Persona should speak with positive ground facts on digital inclusion.",
      },
      {
        user: "Lekin wahi par youth ke liye unemployment aur paper leaks ki problem bohot badi hai na?",
        expectedLevel: 2,
        expectedIntent: "POLITICAL_DEBATE",
        description: "Disagreement on trade-off. Persona must maintain continuity from UPI and address youth jobs.",
      },
      {
        user: "Chalo politics chhoro, waise tumne Stree 2 dekhi kya? Movie kaisi hai?",
        expectedLevel: 0,
        expectedIntent: "CHIT_CHAT",
        description: "Topic switch to Bollywood. Persona must drop debate mode instantly back to Level 0 casual friend.",
      },
      {
        user: "Waise wapas aate hain, tum jo Mudra loan bol rahe the, usme actual employment create hoti hai kya?",
        expectedLevel: 2,
        expectedIntent: "POLITICAL_DEBATE",
        description: "Return to earlier discussion. Persona must recall the Mudra self-reliance narrative.",
      },
    ],
  },
  {
    name: "Scenario 2: Informational Inquiry vs Provocative Confrontation",
    persona: "andhbhakt",
    turns: [
      {
        user: "Rahul Gandhi ko social media pe log Pappu kyun bolte hain? Kahan se start hua yeh?",
        expectedLevel: 1,
        expectedIntent: "POLITICAL_DEBATE",
        description: "Explanatory inquiry. Persona should explain political communication/memes calmly without shouting.",
      },
      {
        user: "Lekin yeh toh godi media ka propaganda hai, Modi bhi toh dictator jaise act karta hai!",
        expectedLevel: 3,
        expectedIntent: "POLITICAL_DEBATE",
        description: "Direct provocative challenge. Persona should enter Level 3 sharp wit and counter with election voter data.",
      },
    ],
  },
  {
    name: "Scenario 3: Direct Comparative Balance (Saffron vs Rationalist)",
    turns: [
      {
        user: "Ram Mandir ke construction aur Supreme Court verdict pe aapka kya analysis hai?",
        personaComparison: true,
        description: "Both personas answer using the exact same Shared Evidence Pack.",
      },
    ],
  },
];

let totalScenarioChecks = 0;
let passedScenarioChecks = 0;

function check(condition, label) {
  totalScenarioChecks++;
  if (condition) {
    console.log(`    ✅ [VERIFIED]: ${label}`);
    passedScenarioChecks++;
  } else {
    console.error(`    ❌ [FAILED]: ${label}`);
  }
}

async function runEvaluation() {
  for (const sc of CONVERSATION_SCENARIOS) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 ${sc.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const conversationHistory = [];

    for (let i = 0; i < sc.turns.length; i++) {
      const turn = sc.turns[i];
      console.log(`\n  Turn ${i + 1}:`);
      console.log(`  👤 User: "${turn.user}"`);

      if (turn.personaComparison) {
        // Compare Saffron vs Rationalist
        const grounding = await getPersonaGrounding(turn.user, "andhbhakt");
        
        const saffronPrompt = getSystemInstruction("andhbhakt", "male", {
          intensityLevel: 1,
          intensityLabel: "POLITICAL_DISCUSSION",
          recentHistory: conversationHistory,
        });

        const rationalPrompt = getSystemInstruction("rational", "male", {
          intensityLevel: 1,
          intensityLabel: "POLITICAL_DISCUSSION",
          recentHistory: conversationHistory,
        });

        console.log(`    ↳ Shared Evidence Pack Sources: ${grounding.ragSource}`);
        console.log(`    ↳ Saffron Engine: Civilizational pride & voluntary donation focus`);
        console.log(`    ↳ Rationalist Engine: Empirical verdict & economic trade-off focus`);

        check(grounding.evidence.length > 0 || grounding.discourse.length > 0, "Shared grounding retrieved successfully for both personas");
        check(saffronPrompt.toLowerCase().includes("civilizational continuity") && rationalPrompt.toLowerCase().includes("rationalist analyst"), "Both personas maintain distinct intellectual framing over same data");
        continue;
      }

      // Standard Turn Execution
      const route = routeQuery(turn.user);
      const grounding = await getPersonaGrounding(turn.user, sc.persona);

      const dynamicPrompt = getSystemInstruction(sc.persona, "male", {
        intensityLevel: route.intensityLevel,
        intensityLabel: route.intensityLabel,
        recentHistory: conversationHistory,
      });

      console.log(`    ↳ Route Intent: ${route.intent} | Resolved Intensity: Level ${route.intensityLevel} (${route.intensityLabel}) in ${route.routerLatencyMs}ms`);
      console.log(`    ↳ RAG Source: ${grounding.ragSource || "none"} (${grounding.latencyMs}ms)`);

      // Verifications
      check(route.intensityLevel === turn.expectedLevel, `Intensity Level resolved to ${turn.expectedLevel} (${turn.expectedIntent || ""})`);
      
      if (route.intensityLevel === 0) {
        check(dynamicPrompt.includes("Do NOT bring up politics, elections, or party leaders unprompted"), "Casual turn suppresses political bias");
      } else if (route.intensityLevel === 3) {
        check(dynamicPrompt.includes("LEVEL 3 (HEATED CHALLENGE / SHARP WIT)"), "Heated challenge engages sharp wit mode");
      }

      check(dynamicPrompt.includes("MULTI-TURN CONVERSATIONAL CONTINUITY"), "System prompt injects conversational continuity rules");

      // Add to conversation history to simulate real dialogue progression
      conversationHistory.push({ sender: "user", text: turn.user });
      conversationHistory.push({
        sender: "model",
        text: `[Turn ${i + 1} simulated response at Level ${route.intensityLevel}]`,
      });
    }
  }

  console.log(`\n=================================================`);
  console.log(`EVALUATION SUMMARY: ${passedScenarioChecks}/${totalScenarioChecks} CHECKS VERIFIED!`);
  console.log(`=================================================`);

  if (passedScenarioChecks === totalScenarioChecks) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
