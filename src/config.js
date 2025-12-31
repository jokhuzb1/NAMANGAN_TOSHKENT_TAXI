require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/taxibot',
    ADMIN_ID: process.env.ADMIN_ID,
    ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN,
};
