const mongoose = require("mongoose");
const config = require("./config");
const User = require("./models/User");

async function run() {
    try {
        await mongoose.connect(config.MONGO_URI);
        console.log("✅ DB Connected");

        const users = await User.find({});
        console.log(`Found ${users.length} users.`);

        users.forEach(u => {
            console.log(`- ID: ${u.telegramId}, Name: ${u.name}, Role: ${u.role}, Status: '${u.status}'`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}

run();
