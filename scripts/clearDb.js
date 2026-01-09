require('dotenv').config();
const mongoose = require('mongoose');

async function clearDb() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all collections
        const collections = await mongoose.connection.db.collections();

        for (let collection of collections) {
            await collection.deleteMany({});
            console.log(`🗑️ Cleared collection: ${collection.collectionName}`);
        }

        console.log('✨ All collections cleared successfully!');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error clearing DB:', e);
        process.exit(1);
    }
}

clearDb();
