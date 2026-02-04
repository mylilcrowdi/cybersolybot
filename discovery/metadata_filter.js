const { Connection, PublicKey } = require('@solana/web3.js');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { fetchMetadata, findMetadataPda } = require('@metaplex-foundation/mpl-token-metadata');
const { publicKey } = require('@metaplex-foundation/umi');
const fetch = require('node-fetch'); // Ensure node-fetch is used (might be native in Node 22 but good to be safe)

// Initialize Connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const umi = createUmi('https://api.mainnet-beta.solana.com');

/**
 * Extracts a URI from a buffer using regex (Universal Fallback).
 * Works for Token Extensions where metadata is embedded.
 */
function extractUriFromBuffer(buffer) {
    const hex = buffer.toString('hex');
    const text = buffer.toString('utf8');
    
    // Look for http/https in the text
    const match = text.match(/https?:\/\/[a-zA-Z0-9./\-_]+/);
    return match ? match[0] : null;
}

/**
 * Checks if a token has valid social media links in its metadata.
 * @param {string} mintAddress - The SPL Token Mint Address
 * @returns {Promise<{valid: boolean, socials: object, score: number, error: string}>}
 */
async function checkSocials(mintAddress) {
    let uri = null;
    let strategy = "unknown";

    try {
        // Strategy 1: Metaplex PDA (Legacy)
        try {
            const mint = publicKey(mintAddress);
            const metadataPda = findMetadataPda(umi, { mint });
            const metadataAccount = await fetchMetadata(umi, metadataPda);
            if (metadataAccount.uri) {
                uri = metadataAccount.uri.replace(/\0/g, ''); // Clean null bytes
                strategy = "metaplex_pda";
            }
        } catch (e) {
            // Ignore PDA error, proceed to fallback
        }

        // Strategy 2: Direct Account Scrape (Token Extensions / Fallback)
        if (!uri) {
            const info = await connection.getAccountInfo(new PublicKey(mintAddress));
            if (info && info.data) {
                uri = extractUriFromBuffer(info.data);
                if (uri) strategy = "buffer_scrape";
            }
        }

        if (!uri) {
            return { valid: false, score: 0, error: "No Metadata URI found via PDA or Scrape" };
        }

        console.log(`[Filter] Found URI via ${strategy}: ${uri}`);

        // Fetch JSON
        const response = await fetch(uri);
        if (!response.ok) {
            return { valid: false, score: 0, error: `Failed to fetch URI: ${response.statusText}` };
        }

        const json = await response.json();
        const socials = {
            twitter: json.twitter || json.extensions?.twitter || null,
            telegram: json.telegram || json.extensions?.telegram || null,
            website: json.website || json.extensions?.website || null
        };

        // Heuristic Scoring
        let score = 0;
        if (socials.twitter) score += 40;
        if (socials.telegram) score += 40;
        if (socials.website) score += 20;

        // Auto-fail if no socials at all
        const isValid = score >= 40;

        return {
            valid: isValid,
            score: score,
            socials: socials,
            name: json.name,
            symbol: json.symbol,
            image: json.image,
            uri: uri
        };

    } catch (err) {
        return { valid: false, score: 0, error: err.message };
    }
}

// Test function if run directly
if (require.main === module) {
    const testMint = process.argv[2] || 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    console.log(`Checking socials for: ${testMint}`);
    checkSocials(testMint).then(res => {
        console.log(JSON.stringify(res, null, 2));
        process.exit(0);
    });
}

module.exports = { checkSocials };
