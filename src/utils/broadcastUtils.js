const { InlineKeyboard } = require('grammy');
const User = require('../models/User');
const keyboards = require('./keyboards');

async function broadcastRequest(api, request, options = {}) {
    let routeKey = "";
    // determine route key from request details
    if (request.from === 'Tashkent' && request.to === 'Namangan') routeKey = 'tash_nam';
    else if (request.from === 'Namangan' && request.to === 'Tashkent') routeKey = 'nam_tash';

    if (!routeKey) {
        console.log(`[BROADCAST] No route key found for ${request.from}->${request.to}`);
        return;
    }

    // Cleanup old broadcast messages first
    if (request.broadcastMessages && request.broadcastMessages.length > 0) {
        for (const msg of request.broadcastMessages) {
            try {
                await api.deleteMessage(msg.driverId, msg.messageId);
            } catch (e) {
                // Ignore errors (message may already be deleted)
            }
        }
        request.broadcastMessages = [];
    }

    // Find Drivers
    const drivers = await User.find({
        role: 'driver',
        isOnline: true,
        activeRoute: routeKey,
        status: 'approved' // Only approved drivers
    });

    console.log(`[BROADCAST] Found ${drivers.length} drivers for route ${routeKey}. CreatedBy: ${request.createdBy}`);

    // Check if this is an admin-created (manual) order
    const isAdminOrder = options.isAdmin || request.createdBy === 'admin';

    const typeIcon = request.type === 'parcel' ? "📦 ПОЧТА" : "🚖 ТАКСИ";
    const seatType = request.seatType === 'front' ? "ОЛД ЎРИНДИҚ" : (request.seatType === 'back' ? "ОРҚА ЎРИНДИҚ" : "Фарқи йўқ");
    const details = request.type === 'parcel' ? `📦 ${request.packageType}` : `💺 ${request.seats} киши (⚠️ ${seatType})`;
    const timeNow = new Date().toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });

    // Different message format for admin-created orders
    let msgText;
    if (isAdminOrder) {
        // Admin order: DO NOT show phone in broadcast - only reveal when driver clicks button
        msgText = `🔔 <b>ТЕЗКОР БУЮРТМА</b>\n` +
            `📅 ${timeNow}\n\n` +
            `${typeIcon} 📍 ${request.from.toUpperCase()} ➡️ ${request.to.toUpperCase()}\n` +
            `⏰ ${request.time}\n` +
            `${details}\n` +
            (request.district ? `🚩 ${request.district}\n` : "") +
            `\n<i>⚡ Биринчи 5 та ҳайдовчи рақамни олади!</i>`;
    } else {
        // Regular passenger order
        msgText = `🆕 <b>Янги Буюртма!</b>\n` +
            `📅 ${timeNow}\n\n` +
            `${typeIcon} 📍 ${request.from.toUpperCase()} ➡️ ${request.to.toUpperCase()}\n` +
            `⏰ ${request.time}\n` +
            `${details}\n` +
            (request.district ? `🚩 ${request.district}` : "");
    }

    for (const driver of drivers) {
        // Skip if driver is the passenger (for regular orders)
        if (driver.telegramId === request.passengerId && !isAdminOrder) continue;

        try {
            let sentMsg;
            if (request.parcelImage) {
                // Handle parcel with image
                const kb = isAdminOrder
                    ? new InlineKeyboard().text("📞 Рақамни олиш", `take_admin_${request._id}`)
                    : keyboards.driverBid(request._id);

                sentMsg = await api.sendPhoto(driver.telegramId, request.parcelImage, {
                    caption: msgText,
                    parse_mode: "HTML",
                    reply_markup: kb
                });
            } else {
                let replyMarkup;
                if (isAdminOrder) {
                    // Admin order: Button to take the number
                    replyMarkup = new InlineKeyboard().text("📞 Рақамни олиш", `take_admin_${request._id}`);
                } else {
                    // Regular order: Bid button
                    replyMarkup = keyboards.driverBid(request._id);
                }


                sentMsg = await api.sendMessage(driver.telegramId, msgText, {
                    reply_markup: replyMarkup,
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
