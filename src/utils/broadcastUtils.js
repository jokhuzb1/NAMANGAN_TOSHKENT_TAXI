const User = require('../models/User');
const keyboards = require('./keyboards');

async function broadcastRequest(api, request) {
    let routeKey = "";
    // determine route key from request details
    // logic matches state.routeData in conversations
    if (request.from === 'Tashkent' && request.to === 'Namangan') routeKey = 'tash_nam';
    else if (request.from === 'Namangan' && request.to === 'Tashkent') routeKey = 'nam_tash';

    // Safety check
    if (!routeKey) return;

    // 1. DELETE PREVIOUS BROADCASTS
    if (request.broadcastMessages && request.broadcastMessages.length > 0) {
        // We do this in parallel but catch errors individually
        await Promise.all(request.broadcastMessages.map(async (msgInfo) => {
            try {
                await api.deleteMessage(msgInfo.driverId, msgInfo.messageId);
            } catch (e) {
                // Ignore delete errors (message too old, user blocked bot, etc)
            }
        }));
        request.broadcastMessages = [];
    }

    // Find Drivers
    const drivers = await User.find({
        role: 'driver',
        isOnline: true,
        activeRoute: routeKey
    });

    const typeIcon = request.type === 'parcel' ? "📦 POST" : "🚖 TAXI";
    const details = request.type === 'parcel' ? `📦 ${request.packageType}` : `💺 ${request.seats} kishi${request.seatType === 'front' ? " (⚠️ OLDI O'RINDIQ)" : ""}`;
    const timeNow = new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });

    const msgText = `🆕 <b>Yangi Buyurtma!</b>\n` +
        `📅 ${timeNow}\n\n` +
        `${typeIcon} 📍 ${request.from.toUpperCase()} ➡️ ${request.to.toUpperCase()}\n` +
        `⏰ ${request.time}\n` +
        `${details}\n` +
        (request.district ? `🚩 ${request.district}` : "");

    for (const driver of drivers) {
        // Don't send to self (unlikely but safe)
        if (driver.telegramId === request.passengerId) continue;

        try {
            let sentMsg;
            if (request.parcelImage) {
                sentMsg = await api.sendPhoto(driver.telegramId, request.parcelImage, {
                    caption: msgText,
                    reply_markup: keyboards.driverBid(request._id),
                    parse_mode: "HTML"
                });
            } else {
                sentMsg = await api.sendMessage(driver.telegramId, msgText, {
                    reply_markup: keyboards.driverBid(request._id),
                    parse_mode: "HTML"
                });
            }

            // Track Message
            request.broadcastMessages.push({
                driverId: driver.telegramId,
                messageId: sentMsg.message_id
            });

            if (request.voiceId) {
                await api.sendVoice(driver.telegramId, request.voiceId, { caption: "🗣 Yo'lovchidan xabar" });
                // Note: we don't track voice message deletion explicitly to keep it simple, 
                // or we could track it too. Let's stick to the main Card logic.
            }
        } catch (e) {
            // Ignore blocked user errors etc
            console.error(`Failed broadcast to ${driver.telegramId}: ${e.message}`);
        }
    }

    // Save the new message IDs
    await request.save();
}

module.exports = { broadcastRequest };
