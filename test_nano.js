const nano = require('./utils/nano_agent');

async function test() {
    console.log("Testing Nano Agent...");
    
    // Test Tweet Generation
    const mockTrade = {
        symbol: "SOL",
        action: "BUY",
        price: 150.23,
        reason: "Volume spike detected on Meteora"
    };
    
    console.log("Generating Tweet...");
    const tweet = await nano.generateTweet(mockTrade);
    console.log("Result:", tweet);

    // Test Status Update
    const mockStats = {
        uptime: "24h",
        profit: "+0.5 SOL",
        trades: 12
    };
    
    console.log("\nGenerating Dashboard Update...");
    const update = await nano.generateDashboardUpdate(mockStats);
    console.log("Result:", update);
}

test();
