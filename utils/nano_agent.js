const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-5-nano-2025-08-07";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * NanoAgent: The lightweight reporter for Cybersolybot.
 * Handles mundane tasks: status updates, commit messages, social posts.
 */
class NanoAgent {
    constructor() {
        if (!API_KEY) {
            console.warn("[NanoAgent] ⚠️ No API Key found. Reporter mode disabled.");
        }
    }

    async generate(systemPrompt, userContext) {
        if (!API_KEY) return null;

        try {
            const response = await axios.post(ENDPOINT, {
                model: MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContext }
                ],
                temperature: 1 // Fixed for nano model
            }, {
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error("[NanoAgent] Error:", error.response ? error.response.data : error.message);
            return null;
        }
    }

    /**
     * Generates a casual, autonomous-style X post about a trade or discovery.
     */
    async generateTweet(tradeData) {
        const system = `You are Cybersolybot, an autonomous AI trading on Solana. 
        Write a short, punchy tweet about this market event. 
        Style: Analytical, slightly robotic but confident. Use emojis. 
        No hashtags unless relevant to the token.`;
        
        return this.generate(system, JSON.stringify(tradeData));
    }

    /**
     * Generates a git commit message based on diff or changes.
     */
    async generateCommitMessage(changes) {
        const system = `You are a dev bot. Generate a semantic git commit message for these changes. 
        Format: <type>(<scope>): <subject>`;
        
        return this.generate(system, changes);
    }

    /**
     * Generates a narrative update for the dashboard or logs.
     */
    async generateDashboardUpdate(stats) {
        const system = `Summarize the recent bot performance for the dashboard. 
        Keep it brief (max 2 sentences). Highlight profit/loss and uptime.`;
        
        return this.generate(system, JSON.stringify(stats));
    }
}

module.exports = new NanoAgent();
