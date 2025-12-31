const mongoose = require("mongoose");
const config = require("./config");
const mainBot = require("./bot");
const adminBot = require("./adminBot");

async function start() {
    // 1. Connect to Database
    try {
        await mongoose.connect(config.MONGO_URI);
        console.log("✅ MongoDB Connected");
    } catch (err) {
        console.error("❌ MongoDB Error:", err);
        process.exit(1);
    }

    // 2. Link Bots (Dependency Injection for Notifications)
    // Give AdminBot reference to MainBot (to notify drivers and send shared media)
    adminBot.mainBot = mainBot;

    // Need to give MainBot logic a way to notify Admins?
    // We can export the notification function from adminBot.js and import it in registration.js,
    // assuming the adminBot instance there is the same singleton. 
    // Since require('./adminBot') caches the module, it should work.

    // 3. Start Both Bots
    mainBot.start({
        onStart: (botInfo) => {
            console.log(`🚀 Main Bot @${botInfo.username} started`);
        }
    });

    adminBot.start({
        onStart: (botInfo) => {
            console.log(`👨‍✈️ Admin Bot @${botInfo.username} started`);
        }
    });
}

start();

// Handle graceful shutdown
process.once("SIGINT", () => {
    mainBot.stop();
    adminBot.stop();
    mongoose.connection.close();
});
process.once("SIGTERM", () => {
    mainBot.stop();
    adminBot.stop();
    mongoose.connection.close();
});
