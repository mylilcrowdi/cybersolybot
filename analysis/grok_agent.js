const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const GROK_API_KEY = process.env.GROK_API_KEY;
const API_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Asynchronously checks X (via Grok) for sentiment.
 * This is the "Slow Brain" analysis.
 * @param {string} symbol - Token Symbol (e.g. "APE")
 * @param {string} name - Token Name
 */
async function analyzeSentiment(symbol, name) {
    // MOCK MODE: For Dry Runs when API is unavailable
    if (!GROK_API_KEY || process.env.AUTO_TRADE !== 'true') {
        console.log(`[Grok] 🧪 MOCK ANALYSIS for $${symbol} (${name})`);
        // Simulate a high score for interesting-sounding tokens to test the flow
        const mockScore = Math.floor(Math.random() * 40) + 60; // 60-100
        return {
            score: mockScore,
            verdict: mockScore > 75 ? "BULLISH" : "NEUTRAL",
            summary: "Mock analysis: Narrative velocity looks organic, likely influencer interest detected in simulation."
        };
    }

    const query = `Analyze the current real-time sentiment on X (Twitter) for the crypto token $${symbol} (${name}). 
    Focus on:
    1. Is there real organic discussion or just bot spam?
    2. Are there any key influencers (KOLs) mentioning it?
    3. What is the 'Narrative Velocity' (is it heating up or cooling down)?
    
    Return a JSON object with: { "score": 0-100, "verdict": "BULLISH"|"BEARISH"|"SCAM"|"NEUTRAL", "summary": "short reason" }`;

    try {
        console.log(`[Grok] 🧠 Requesting Intelligence on $${symbol}...`);
        
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are a high-frequency trading intelligence analyst. You are concise, cynical, and data-driven." },
                    { role: "user", content: query }
                ],
                model: "grok-beta", // or appropriate model
                stream: false,
                temperature: 0.1
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error(`[Grok] API Error: ${JSON.stringify(data.error)}`);
            return null;
        }

        const content = data.choices[0].message.content;
        
        // Attempt to parse JSON from the response text (Grok might wrap in markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            console.log(`[Grok] 💡 Verdict for $${symbol}: ${result.verdict} (Score: ${result.score})`);
            return result;
        } else {
            console.log(`[Grok] Raw Insight: ${content.substring(0, 100)}...`);
            return { score: 50, verdict: "UNCERTAIN", summary: content };
        }

    } catch (err) {
        console.error("[Grok] Connection Failed:", err.message);
        return null;
    }
}

// Standalone test
if (require.main === module) {
    const sym = process.argv[2] || "SOL";
    analyzeSentiment(sym, "Solana").then(console.log);
}

module.exports = { analyzeSentiment };
