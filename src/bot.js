const { Bot, session, InlineKeyboard } = require("grammy");
const { conversations, createConversation } = require("@grammyjs/conversations");
const config = require("./config");
const User = require("./models/User");
const RideRequest = require("./models/RideRequest");
const keyboards = require("./utils/keyboards");
const { passengerRegister, driverRegister } = require("./conversations/registration");
const { rideRequestConversation } = require("./conversations/rideRequest");
const { parcelRequestConversation } = require("./conversations/parcelRequest");
const { driverBidConversation } = require("./conversations/driverBid");
const { driverSettings, passengerSettings } = require("./conversations/settings");
const { quickRequestConversation } = require("./conversations/quickRequest");
const { contactActions } = require("./utils/keyboards");
const { contextMap } = require("./utils/contextMap");
const { broadcastRequest } = require("./utils/broadcastUtils");
const { t } = require("./utils/i18n_fixed");
const dynamicKeyboards = require("./utils/keyboardsDynamic");

// DB Connection moved to index.js

const bot = new Bot(config.BOT_TOKEN);

// Debug Middleware
bot.use(async (ctx, next) => {
    console.log(`[UPDATE] ${ctx.from ? ctx.from.id : 'unknown'} - Type: ${Object.keys(ctx.update)[1] || 'other'}`);
    if (ctx.message && ctx.message.text) console.log(`[TEXT] ${ctx.message.text}`);
    if (ctx.callbackQuery) console.log(`[CALLBACK] ${ctx.callbackQuery.data}`);
    await next();
});

// Rate Limiter (Anti-Spam)
const { limit } = require("@grammyjs/ratelimiter");
bot.use(limit({
    timeFrame: 2000, // 2 seconds
    limit: 1, // Allow 1 request per 2 seconds (Strict? Maybe 2 requests?) 
    // Button spamming: usually 1 click is processed, subseqent are ignored. 
    // Let's set limit: 2 to allow fast double tap but block machine gun.
    limit: 3,
    onLimitExceeded: async (ctx) => {
        try {
            if (ctx.callbackQuery) {
                await ctx.answerCallbackQuery({ text: "⚠️ Iltimos, sekinroq boshing!", show_alert: true });
            } else {
                // For messages, we might not want to reply every time to avoid flooding
                // Just ignore or log
                console.log(`[SPAM] User ${ctx.from.id} is spamming.`);
            }
        } catch (e) { } // Ignore errors if user blocked etc
    },
    keyGenerator: (ctx) => ctx.from?.id,
}));

// Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Register Conversations
bot.use(createConversation(passengerRegister));
bot.use(createConversation(driverRegister));
bot.use(createConversation(rideRequestConversation));
bot.use(createConversation(parcelRequestConversation));
bot.use(createConversation(driverBidConversation));
bot.use(createConversation(driverSettings));
bot.use(createConversation(passengerSettings));
bot.use(createConversation(quickRequestConversation));

// Commands
bot.command("start", async (ctx) => {
    let user = await User.findOne({ telegramId: ctx.from.id });

    // Force Cyrillic as requested by user ("DO NOT NEED LATIN!!!!")
    const lang = 'uz_cyrillic';

    if (user && user.role !== 'none') {
        if (user.role === 'passenger') {
            return ctx.reply(t('welcome', lang), { reply_markup: dynamicKeyboards.getPassengerMenu(lang) });
        } else if (user.role === 'driver') {
            if (user.status === 'approved') {
                return ctx.reply(t('welcome', lang), { reply_markup: dynamicKeyboards.getDriverMenu(lang, user.isOnline, user.activeRoute !== 'none') });
            } else if (user.status === 'rejected') {
                return ctx.reply("❌ " + t('cancel', lang), { reply_markup: dynamicKeyboards.getRoleSelection(lang) });
            } else {
                return ctx.reply("⏳ ...", { reply_markup: { remove_keyboard: true } });
            }
        }
    }

    await ctx.reply(t('welcome', lang) + "\n\n" + t('role_select_title', lang), {
        parse_mode: "HTML",
        reply_markup: dynamicKeyboards.getRoleSelection(lang)
    });
});

// Role Selection Handlers (Support both Latin and Cyrillic)
bot.hears([t('driver', 'uz_latin'), t('driver', 'uz_cyrillic')], async (ctx) => {
    // Check if already registered
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user && user.role === 'driver') {
        // Allow re-registration if rejected
        if (user.status === 'rejected') {
            await ctx.reply("♻️ Сизнинг аризангиз рад этилган эди. Қайтадан маълумотларни юборишингиз мумкин.");
            await ctx.conversation.enter("driverRegister");
            return;
        }
        if (user.status === 'pending_verification') {
            return ctx.reply("⏳ Аризангиз админ томонидан текширилмоқда. Илтимос кутинг.");
        }
        const lang = user.language || 'uz_cyrillic';
        return ctx.reply("Сиз аллақачон рўйхатдан ўтгансиз.", { reply_markup: dynamicKeyboards.getDriverMenu(lang, user.isOnline, user.activeRoute !== 'none') });
    }
    await ctx.conversation.enter("driverRegister");
});

bot.hears([t('passenger', 'uz_latin'), t('passenger', 'uz_cyrillic')], async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user && user.role === 'passenger') {
        return ctx.reply("Сиз аллақачон рўйхатдан ўтгансиз.", { reply_markup: keyboards.passengerMenu });
    }
    await ctx.conversation.enter("passengerRegister");
});

// Passenger Handlers
// Passenger Handlers
bot.hears([
    t('order_taxi', 'uz_latin'), t('order_taxi', 'uz_cyrillic')
], async (ctx) => {
    // Check for active request
    const activeRequest = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    });

    if (activeRequest) {
        return ctx.reply("🚫 Сизда аллақачон фаол буюртма мавжуд. Илтимос, '🚖 Менинг Буюртмам' бўлими орқали ҳолатни текширинг ёки бекор қилинг.");
    }

    await ctx.conversation.enter("rideRequestConversation");
});

bot.hears([
    t('send_parcel', 'uz_latin'), t('send_parcel', 'uz_cyrillic')
], async (ctx) => {
    // Check for active request
    const activeRequest = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    });

    if (activeRequest) {
        return ctx.reply("🚫 Сизда аллақачон фаол буюртма мавжуд. Илтимос, '🚖 Менинг Буюртмам' бўлими орқали ҳолатни текширинг ёки бекор қилинг.");
    }

    await ctx.conversation.enter("parcelRequestConversation");
});

// Mening Buyurtmam (Using i18n triggers)
bot.hears([
    t('my_orders', 'uz_latin'), t('my_orders', 'uz_cyrillic')
], async (ctx) => {
    const request = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    }).sort({ createdAt: -1 });

    if (!request) {
        // Check for recently completed request (last 24 hours)
        const lastCompleted = await RideRequest.findOne({
            passengerId: ctx.from.id,
            status: 'completed'
        }).sort({ createdAt: -1 });

        if (lastCompleted) {
            const timeDiff = new Date() - lastCompleted.updatedAt;
            if (timeDiff < 24 * 60 * 60 * 1000) {
                return ctx.reply(`✅ <b>Охирги буюртмангиз якунланган:</b>\n\n📍 ${lastCompleted.from} ➡️ ${lastCompleted.to}\n⭐️ Агар баҳоламаган бўлсангиз, илтимос баҳоланг.`, { parse_mode: "HTML" });
            }
        }
        return ctx.reply("Сизда фаол буюртмалар йўқ.");
    }
    console.log(`[DEBUG] Found active request ${request._id} for ${ctx.from.id}`);

    let statusText = request.status === 'searching' ? "🔍 Qidirilmoqda" : "✅ Haydovchi topildi";
    let typeHeader = request.type === 'parcel' ? "📦 POCHTA YUBORISH" : "🚖 TAKSI BUYURTMA";
    let typeIcon = request.type === 'parcel' ? "📦" : "🚖";

    // For POCHTA, we do NOT show seats. For Passenger, we do.
    let seatsInfo = "";
    if (request.type !== 'parcel') {
        seatsInfo = ` Joy: ${request.seats}\n`;
    } else {
        // Option to show package type here or not? User said "if POCHTA we do not need to selec seats or show on the offer".
        // Maybe "show on the offer" implies he doesn't want "Joy" line. 
        // Showing "Tur: box" might still be useful? Let's keep Package Type line but definitely no "Joy" line.
        seatsInfo = `📦 Tur: ${request.packageType}\n`;
    }

    let details = request.district || "";
    if (request.voiceId) details += " (🔊 Ovozli xabar)";

    let message = `<b>${typeHeader}</b>\n\n` +
        `📍 Yo'nalish: ${request.from} -> ${request.to}\n` +
        `⏰ Vaqt: ${request.time}\n` +
        `${seatsInfo}` +
        `🚩 Manzil: ${details}\n` +
        `📊 Status: ${statusText}\n`;

    const keyboard = new InlineKeyboard();

    if (request.status === 'searching') {
        message += `📝 Takliflar: ${request.offers ? request.offers.length : 0} ta`;
        keyboard.text("✏️ Tahrirlash", `edit_request_start_${request._id}`).row();
        keyboard.text("❌ Bekor qilish", `cancel_request_${request._id}`);
    } else if (request.status === 'matched') {
        // Find accepted offer
        const acceptedOffer = request.offers.find(o => o.status === 'accepted');
        if (acceptedOffer) {
            const driver = await User.findOne({ telegramId: acceptedOffer.driverId });
            if (driver) {
                message += `\n➖➖➖➖➖➖➖➖\n`;
                const verified = driver.isVerified ? "✅" : "";
                message += `<b>👤 Haydovchi:</b> ${driver.name} ${verified}\n`;
                message += `📞 Tel: ${driver.phone.startsWith('+') ? driver.phone : '+' + driver.phone}\n`;
                message += `🚗 Mashina: ${driver.carModel}\n`;
                message += `💰 Narx: ${acceptedOffer.price} so'm`;

                message += `💰 Narx: ${acceptedOffer.price} so'm`;

                const contactKb = keyboards.contactActions(driver);
                keyboard.row(...contactKb.inline_keyboard[0]); // Merge buttons
            }
        }
        keyboard.text("✅ Yakunlash", `complete_request_${request._id}`).row();
        keyboard.text("❌ Bekor qilish", `cancel_request_${request._id}`);
    }

    if (request.voiceId) {
        await ctx.replyWithVoice(request.voiceId, { caption: "🗣 Sizning ovozli xabaringiz" });
    }

    await ctx.reply(message, { parse_mode: "HTML", reply_markup: keyboard });
});

// Driver Bidding Handlers
bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Handle "Take Admin Request" (First 5 Drivers get logic)
    if (data.startsWith("take_admin_")) {
        const requestId = data.replace("take_admin_", "");
        const request = await RideRequest.findById(requestId);

        if (!request) return ctx.answerCallbackQuery({ text: "⚠️ Буюртма топилмади.", show_alert: true });

        // Concurrency Check (atomically increment?)
        // Mongo atomic increment is safer but for simplicity read/write here.
        if (request.clicksCount >= 5) {
            // Cleanup if not already cleaned
            try { await ctx.deleteMessage(); } catch (e) { };
            return ctx.answerCallbackQuery({ text: "⚠️ Ушбу буюртмани аллақачон 5 та ҳайдовchi қабул қилган.", show_alert: true });
        }

        // Logic check: Did this driver already take it?
        // We really should track WHO took it to prevent double dipping, but requirement says "first 5 offers".
        // Let's assume clicksCount is enough. 
        // Adding driverId to 'offers' or similar array would be cleaner to prevent duplicate clicks.
        // Re-using 'offers' logic:
        const alreadyTook = request.offers.some(o => o.driverId === ctx.from.id);
        if (alreadyTook) {
            return ctx.answerCallbackQuery({ text: "✅ Сиз рақамни аллақачон олгансиз. Тепадаги хабарни текширинг.", show_alert: true });
        }

        // Increment
        request.clicksCount += 1;
        // Record as an 'offer' just to track who took it
        request.offers.push({
            driverId: ctx.from.id,
            driverName: ctx.from.first_name,
            price: 0, // No price negotiation
            status: 'accepted'
        });

        if (request.clicksCount >= 5) {
            request.status = 'completed'; // Close it
            // Trigger cleanup of all broadcast messages
            // We can do it asynchronously
            broadcastRequest(ctx.api, request).catch(err => console.error(err));
            // Actually broadcastRequest normally SENDS messages. We need CLEANUP logic.
            // broadcastRequest currently deletes then sends.
            // If status is completed, we should just delete? 
            // Let's manually delete specifically for this case to be sure.
            if (request.broadcastMessages) {
                for (const msg of request.broadcastMessages) {
                    try { await ctx.api.deleteMessage(msg.driverId, msg.messageId); } catch (e) { }
                }
                request.broadcastMessages = [];
            }
        }

        await request.save();

        // Send Contact Info to Driver
        const phoneDisplay = request.contactPhone && request.contactPhone.startsWith('+')
            ? request.contactPhone
            : '+' + (request.contactPhone || 'N/A');

        const contactMsg = `
🎉 <b>БУЮРТМА ҚАБУЛ ҚИЛИНДИ!</b>

📍 <b>Йўналиш:</b> ${request.from} ➡️ ${request.to}
📞 <b>Йўловчи:</b> ${phoneDisplay}
⏰ <b>Вақт:</b> ${request.time}
💺 <b>Жой:</b> ${request.seats}
🚩 <b>Манзил:</b> ${request.district || '-'}

<i>Илтимос, йўловчи билан боғланинг!</i>
`;
        await ctx.reply(contactMsg, { parse_mode: "HTML" });
        await ctx.answerCallbackQuery("✅ Рақам юборилди!");
        return;
    }

    // Handle "Taklif berish"
    if (data.startsWith("bid_")) {
        const requestId = data.replace("bid_", "");

        // Check Driver Status
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user || user.role !== 'driver') return ctx.reply("Сиз ҳайдовчи эмассиз.");
        if (user.status !== 'approved') return ctx.answerCallbackQuery({ text: "⚠️ Аризангиз ҳали тасдиқланмаган!", show_alert: true });

        // Auto-Online Logic
        if (!user.isOnline) {
            user.isOnline = true;
            await user.save();
            await ctx.reply("🟢 Сиз 'Ишдаман' ҳолатига ўтдингиз ва энди буюртмаларни қабул қилишингиз мумкин.");
        }

        // Check Request Status BEFORE entering conversation
        const request = await RideRequest.findById(requestId);
        if (!request) return ctx.answerCallbackQuery({ text: "⚠️ Буюртма топилмади.", show_alert: true });

        if (request.status === 'negotiating') {
            return ctx.answerCallbackQuery({ text: "⏳ Бу буюртма ҳозирда бошқа ҳайдовчи билан муҳокама қилинмоқда. Бироз кутинг.", show_alert: true });
        }
        if (request.status !== 'searching') {
            return ctx.answerCallbackQuery({ text: "⚠️ Бу буюртма аллақачон олинган ёки бекор қилинган.", show_alert: true });
        }

        console.log(`[DEBUG] Bid clicked. RequestId extracted: '${requestId}'`);

        // Use Map fallback
        contextMap.set(ctx.from.id, requestId);
        console.log(`[DEBUG] Map updated for user ${ctx.from.id}: ${requestId}`);

        await ctx.answerCallbackQuery();
        await ctx.conversation.enter("driverBidConversation");
        return;
    }

    // Handle "Accept Offer"
    if (data.startsWith("accept_")) {
        // Format: accept_ReqID_OfferID
        const parts = data.split("_");
        let requestId, offerId, request, offer;

        if (parts.length === 3) {
            requestId = parts[1];
            offerId = parts[2];
            request = await RideRequest.findById(requestId);
            offer = request ? request.offers.find(o => o._id.toString() === offerId) : null;
        } else {
            // Fallback for old buttons (unlikely to work perfectly but prevents crash)
            offerId = data.replace("accept_", "");
            request = await RideRequest.findOne({ passengerId: ctx.from.id, status: { $in: ['negotiating', 'searching'] } });
            offer = request ? request.offers.find(o => o._id.toString() === offerId) : null;
        }

        if (!request || !offer) {
            console.error(`[ERROR] Accept failed. ReqId: ${requestId}, OfferId: ${offerId}`);
            return ctx.reply("⚠️ Хатолик: Буюртма ёки таклиф топилмади. (Эски тугма бўлиши мумкин)");
        }

        // Debug: Log offer details before accepting
        console.log(`[DEBUG] Accepting offer ID=${offerId}: driverId=${offer.driverId}, price=${offer.price}`);

        request.status = 'matched';
        offer.status = 'accepted';
        await request.save();

        // Re-fetch to ensure we have accurate data after save
        const updatedRequest = await RideRequest.findById(request._id);
        const acceptedOffer = updatedRequest.offers.find(o => o._id.toString() === offerId);

        console.log(`[DEBUG] After save - offer price: ${acceptedOffer.price}`);

        await ctx.answerCallbackQuery("Таклиф қабул қилинди!");

        // Notify Passenger (reveal Driver Phone)
        const driver = await User.findOne({ telegramId: acceptedOffer.driverId });

        if (!driver) {
            console.error(`[ERROR] Driver not found with telegramId: ${acceptedOffer.driverId}`);
            return ctx.reply("⚠️ Хатолик: Ҳайдовчи маълумотлари топилмади.");
        }

        console.log(`[DEBUG] Found driver: ${driver.name}, telegramId: ${driver.telegramId}`);

        // Update original message to remove buttons
        await ctx.editMessageText(`✅ <b>Ҳайдовчи қабул қилинди!</b>\n\nҚуйида ҳайдовчи маълумотлари юборилмоқда...`, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] }
        });

        // Prepare Details
        const carDetails = driver.carDetails || {};
        const cm = keyboards.carNameMap[driver.carModel] || driver.carModel;

        const detailsCaption = `
<b>✅ ҲАЙДОВЧИ ТОПИЛДИ!</b>

👤 <b>Исм:</b> ${driver.name}
📞 <b>Тел:</b> ${driver.phone.startsWith('+') ? driver.phone : '+' + driver.phone}

🚗 <b>Машина:</b> ${carDetails.brand ? carDetails.brand : ''} ${carDetails.model || cm}
🎨 <b>Ранг:</b> ${carDetails.color || '-'}
📅 <b>Йил:</b> ${carDetails.year || '-'}
💺 <b>Жой:</b> ${carDetails.seats || '-'}

💰 <b>Келишилган нарх:</b> ${acceptedOffer.price} сўм
`;

        // Send Text with Actions (Contact + View Photos)
        const buttons = keyboards.contactActions(driver);
        // We can append more buttons to this new keyboard object
        buttons.row(); // separate row

        // Add Photo Buttons
        if (driver.carImages && driver.carImages.length > 0) {
            buttons.text("📷 Машина Расми", `view_car_offer_${driver._id}`).row();
        }

        // Add Selfie Button (Optional, but good for completeness)
        if (driver.selfie && driver.selfie.telegramFileId) {
            buttons.text("👤 Ҳайдовчи Расми", `view_selfie_offer_${driver._id}`).row();
        }

        // Add Completion Actions/Back?
        // Actually we usually show "Complete" or "Cancel" on the MAIN order message. 
        // This message is a NEW message appearing.

        await ctx.reply(detailsCaption, {
            parse_mode: "HTML",
            reply_markup: buttons
        });

        // Notify Driver that their offer was accepted
        const passenger = await User.findOne({ telegramId: ctx.from.id });

        if (!passenger) {
            console.error(`[ERROR] Passenger not found with telegramId: ${ctx.from.id}`);
        } else {
            const isCustom = updatedRequest.contactPhone ? true : false;
            const displayPhoneRaw = isCustom ? updatedRequest.contactPhone : passenger.phone;
            const passPhone = displayPhoneRaw.startsWith('+') ? displayPhoneRaw : '+' + displayPhoneRaw;
            const passName = isCustom && updatedRequest.createdBy === 'admin' ? "Mijoz (Admin)" : passenger.name;

            console.log(`[DEBUG] Sending acceptance notification to driver ${driver.telegramId}`);

            // Build detailed notification message for driver
            const driverNotificationMsg = `
🎉 <b>ТАКЛИФИНГИЗ ҚАБУЛ ҚИЛИНДИ!</b>

<b>👤 Йўловчи:</b> ${passName}
<b>📞 Телефон:</b> ${passPhone}

<b>📍 Йўналиш:</b> ${updatedRequest.from} ➡️ ${updatedRequest.to}
<b>⏰ Вақт:</b> ${updatedRequest.time}
${updatedRequest.type === 'parcel' ? `<b>📦 Тур:</b> ${updatedRequest.packageType}` : `<b>💺 Жой:</b> ${updatedRequest.seats} нафар`}
${updatedRequest.district ? `<b>🚩 Манзил:</b> ${updatedRequest.district}` : ''}

<b>💰 Келишилган нарх:</b> ${acceptedOffer.price} сўм

<i>Йўловчи билан боғланинг!</i>
`;

            try {
                await ctx.api.sendMessage(driver.telegramId, driverNotificationMsg, {
                    parse_mode: "HTML",
                    reply_markup: keyboards.contactActions(passenger)
                });
                console.log(`[NOTIFY] Driver ${driver.telegramId} notified about accepted offer - SUCCESS`);
            } catch (e) {
                console.error(`[ERROR] Failed to notify driver ${driver.telegramId} about accepted offer:`, e.message);
            }
        }

        // Send Voice Message to Driver if exists
        if (updatedRequest.voiceId) {
            try {
                await ctx.api.sendVoice(driver.telegramId, updatedRequest.voiceId, { caption: "🗣 Yo'lovchidan ovozli xabar" });
            } catch (e) {
                console.error(`[ERROR] Failed to send voice to driver ${driver.telegramId}:`, e);
            }
        }

        return;
    }

    // Handle Decline
    if (data.startsWith("decline_")) {
        // Format: decline_ReqID_OfferID
        const parts = data.split("_");
        let requestId, offerId, request, offer;

        if (parts.length === 3) {
            requestId = parts[1];
            offerId = parts[2];
            request = await RideRequest.findById(requestId);
            offer = request ? request.offers.find(o => o._id.toString() === offerId) : null;
        } else {
            // Fallback
            offerId = data.replace("decline_", "");
            request = await RideRequest.findOne({ passengerId: ctx.from.id, status: 'negotiating' });
            const reqToUpdate = request || await RideRequest.findOne({ passengerId: ctx.from.id, status: { $in: ['searching', 'negotiating'] } });
            offer = reqToUpdate ? reqToUpdate.offers.find(o => o._id.toString() === offerId) : null;
            request = reqToUpdate;
        }

        if (!request) {
            return ctx.answerCallbackQuery("Буюртма топилмади.");
        }

        await ctx.answerCallbackQuery("Таклиф рад этилди.");
        await ctx.deleteMessage();

        const reqToUpdate = request;

        if (reqToUpdate && offer) {
            console.log(`[DECLINE] Declining offer ID=${offerId} from driver ${offer.driverId}, price: ${offer.price}`);

            // Blocking Logic
            if (!reqToUpdate.blockedDrivers) reqToUpdate.blockedDrivers = [];
            let blockEntry = reqToUpdate.blockedDrivers.find(b => b.driverId === offer.driverId);
            if (!blockEntry) {
                blockEntry = { driverId: offer.driverId, count: 0 };
                reqToUpdate.blockedDrivers.push(blockEntry);
            }

            blockEntry.count += 1;
            let blockMsg = "";

            if (blockEntry.count >= 3) {
                blockEntry.blockedUntil = new Date(Date.now() + 20 * 60 * 1000); // 20 mins
                blockMsg = "\n\n⚠️ Сиз ушбу буюртмачи томонидан 3 марта рад этилдингиз ва 20 дақиқага блокландингиз.";
            }

            offer.status = 'rejected';

            // RESET STATUS TO SEARCHING so other drivers can still bid
            reqToUpdate.status = 'searching';

            await reqToUpdate.save();

            // Build detailed rejection notification for driver
            const declineMessage = `
❌ <b>ТАКЛИФИНГИЗ РАД ЭТИЛДИ</b>

<b>📍 Йўналиш:</b> ${reqToUpdate.from} ➡️ ${reqToUpdate.to}
<b>⏰ Вақт:</b> ${reqToUpdate.time}
<b>💰 Сизнинг таклифингиз:</b> ${offer.price} сўм

<i>Йўловчи бошқа таклифни танлади ёки рад этди.</i>${blockMsg}
`;

            // Notify Driver about decline
            try {
                await ctx.api.sendMessage(offer.driverId, declineMessage, {
                    parse_mode: "HTML"
                });
                console.log(`[NOTIFY] Driver ${offer.driverId} notified about declined offer`);
            } catch (e) {
                console.error(`[ERROR] Failed to notify driver ${offer.driverId} about declined offer:`, e.message);
            }

            // NOTE: We do NOT re-broadcast to group when offer is declined
            // The request remains in 'searching' status so other drivers can still bid
            // but we don't spam them with the same request again

            // Re-Broadcast to all drivers (per user request)
            try {
                // We utilize the same broadcast function. It cleans up old messages and sends new ones.
                // This ensures "fresh" visibility for the request.
                await broadcastRequest(ctx.api, reqToUpdate);
                console.log(`[BROADCAST] Re-broadcasting request ${reqToUpdate._id} after decline`);
            } catch (e) {
                console.error(`[ERROR] Failed to re-broadcast request ${reqToUpdate._id}:`, e);
            }
        }
        return;
    }

    // Handle Cancel Request Initialization (Ask Confirmation)
    if (data.startsWith("cancel_request_")) {
        const requestId = data.replace("cancel_request_", "");
        // Ask for confirmation
        const kb = new InlineKeyboard()
            .text("✅ Ҳа, бекор қиламан", `confirm_cancel_${requestId}`)
            .text("🔙 Йўқ, қайтаман", `abort_cancel_${requestId}`);

        await ctx.editMessageText("⚠️ <b>Ростдан ҳам буюртмани бекор қилмоқчимисиз?</b>", {
            parse_mode: "HTML",
            reply_markup: kb
        });
        await ctx.answerCallbackQuery();
        return;
    }

    // Handle Cancel Confirmation
    if (data.startsWith("confirm_cancel_")) {
        const requestId = data.replace("confirm_cancel_", "");
        const request = await RideRequest.findById(requestId);

        if (!request) {
            await ctx.deleteMessage();
            return ctx.answerCallbackQuery("Буюртма топилмади.");
        }

        // If matched, notify driver
        if (request.status === 'matched') {
            const acceptedOffer = request.offers.find(o => o.status === 'accepted');
            if (acceptedOffer) {
                const driver = await User.findOne({ telegramId: acceptedOffer.driverId });
                if (driver) {
                    await ctx.api.sendMessage(driver.telegramId, `❌ Йўловчи буюртмани бекор қилди.`).catch(() => { });
                }
            }
        }

        request.status = 'cancelled';
        await request.save();

        await ctx.answerCallbackQuery("Буюртма бекор қилинди.");
        // We delete the confirmation message or edit it to final status
        await ctx.editMessageText("🚮 Буюртмангиз бекор қилинди.", { reply_markup: { inline_keyboard: [] } });
        return;
    }

    // Handle Cancel Abort
    if (data.startsWith("abort_cancel_")) {
        // Re-render the request view? Or just delete confirmation?
        // Ideally we go back to the "Mening Buyurtmam" view.
        // Since we edited the message, let's try to restore it if possible, OR just say "cancelled" and user clicks menu again?
        // User might lose the flow. 
        // Let's just restore "Mening Buyurtmam" text. 
        // We can just trigger the "Mening Buyurtmam" handler logic if we extract requestId?
        // Or simpler: "Bekor qilish bekor qilindi :)" and show brief info.

        await ctx.deleteMessage(); // Remove confirmation prompt.
        // User has to click "Mening Buyurtmam" again to see it, or we could resend it.
        // Resending is better UX but "deleteMessage" keeps chat clean.
        // Let's assume user is in the menu.
        await ctx.reply("Буюртма бекор қилинмади. Давом этамиз.");
        // Ideally we should restore the original message content, but that requires re-fetching everything which is complex in this block.
        // Deleting the confirmation prompt is the simplest "Go Back" interaction usually.
        return ctx.answerCallbackQuery("Bekor qilindi.");
    }

    // Handle Complete Request
    if (data.startsWith("complete_request_")) {
        const requestId = data.replace("complete_request_", "");
        const request = await RideRequest.findById(requestId);

        if (!request) return ctx.answerCallbackQuery("Буюртма топилмади.");

        request.status = 'completed';
        await request.save();

        await ctx.answerCallbackQuery("Буюртма якунланди!");

        const acceptedOffer = request.offers.find(o => o.status === 'accepted');
        const driverId = acceptedOffer ? acceptedOffer.driverId : null;

        const kb = new InlineKeyboard();
        if (driverId) {
            kb.text("⭐️ Ҳайдовчини баҳолаш", `rate_driver_${driverId}_${requestId}`);
        }

        await ctx.editMessageText("✅ Сафарингиз учун раҳмат! Буюртма якунланди.", { reply_markup: kb });
        return;
    }

    // --- Available Drivers Logic (Enhanced) ---

    // Entry Point: List Drivers (replaces old handler)
    // Format: ld_<route>_p<page>_m<model>  (e.g., ld_tash_nam_p0_mall)
    if (data.startsWith("ld_")) {
        // Regex to parse: ld_(route)_p(page)_m(model)
        // route can contains underscores? 'tash_nam'. Yes.
        // Format is fixed: ld_ R _p P _m M
        const parts = data.split("_");
        // ld, tash, nam, p0, mall -> length 5.
        // ld, nam, tash, p0, mall -> length 5.
        // Route is parts[1] + "_" + parts[2].
        const route = parts[1] + "_" + parts[2];
        const pagePart = parts[3];
        const modelPart = parts[4];

        const page = parseInt(pagePart.replace("p", ""));
        const model = modelPart.replace("m", "");

        // Build Query
        const query = { role: 'driver', isOnline: true, activeRoute: route };
        if (model !== 'all') {
            query.carModel = model;
        }

        const limit = 10;
        const total = await User.countDocuments(query);
        const drivers = await User.find(query).skip(page * limit).limit(limit);
        const totalPages = Math.ceil(total / limit);

        const routeName = route === 'tash_nam' ? "Тошкент ➡️ Наманган" : "Наманган ➡️ Тошкент";
        let text = `🚕 <b>Бўш Ҳайдовчилар</b>\n📍 ${routeName}\n`;
        if (model !== 'all') text += `🚙 Филтр: ${keyboards.carNameMap[model] || model}\n`;
        text += `📄 Саҳифа: ${page + 1}/${totalPages || 1}\n\n`;

        const keyboard = new InlineKeyboard();

        if (drivers.length === 0) {
            text += "<i>Ҳозирча бу йўналишда фаол ҳайдовчилар йўқ.</i>";
        } else {
            // Pre-fetch ratings
            const Review = require("./models/Review");

            for (const d of drivers) {
                const cm = keyboards.carNameMap[d.carModel] || d.carModel;
                const verified = d.isVerified ? "✅ " : "";

                // Calculate Rating
                let avgRating = "N/A";
                try {
                    const reviews = await Review.find({ targetId: d.telegramId });
                    if (reviews.length > 0) {
                        const sum = reviews.reduce((a, b) => a + b.rating, 0);
                        avgRating = (sum / reviews.length).toFixed(1);
                    }
                } catch (e) { console.error(e); }

                const starPart = avgRating !== 'N/A' ? ` | ⭐️ ${avgRating}` : '';

                keyboard.text(`🚗 ${verified}${cm}${starPart}`, `public_driver_info_${d._id}`)
                    .text("📩", `direct_offer_${d._id}`).row();
            }
        }

        // Navigation
        const navRow = [];
        if (page > 0) navRow.push({ text: "⬅️ Олдинги", callback_data: `ld_${route}_p${page - 1}_m${model}` });
        if (page < totalPages - 1) navRow.push({ text: "Кейинги ➡️", callback_data: `ld_${route}_p${page + 1}_m${model}` });
        if (navRow.length > 0) keyboard.row(...navRow);

        // Filter & Back
        keyboard.row();
        keyboard.text("🚙 Машина тури бўйича", `filter_show_${route}`);
        keyboard.row();
        // Since we don't have a 'main menu' callback for text commands, we just hide or refresh. 
        // Or if we came from "Bo'sh haydovchilar" command, we can't go 'back' to text. 
        // But we can delete message.
        // keyboard.text("❌ Yopish", "delete_msg"); 

        try { await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" }); }
        catch (e) { await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" }); }

        await ctx.answerCallbackQuery();
        return;
    }

    // Show Filter Options
    if (data.startsWith("filter_show_")) {
        const route = data.replace("filter_show_", "");
        await ctx.editMessageText("🚗 Қайси машина турини қидиряпсиз?", {
            reply_markup: keyboards.carFilter(route)
        });
        await ctx.answerCallbackQuery();
        return;
    }

    // LIST DRIVERS ACTIVE OLD HANDLER (Redirect)
    if (data.startsWith("list_drivers_active_")) {
        const route = data.replace("list_drivers_active_", "");
        // Redirect to new format
        // Manually trigger calling the logic or just change data and re-emit?
        // Changing data is hard in grammy mid-stream. Just call logic or recurse? 
        // Easiest: Just set new data and delegate? No.
        // Just fail over to new format button?
        // Reuse logic?
        // Let's just update the button in the command handler properly.
        // But for safety:
        return ctx.reply("Янги форматга ўтилмоқда...", {
            reply_markup: new InlineKeyboard().text("♻️ Очиш", `ld_${route}_p0_mall`)
        });
    }

    // 2. Public Driver Profile (Updated Back Button)
    if (data.startsWith("public_driver_info_")) {
        const driverId = data.replace("public_driver_info_", "");
        const driver = await User.findById(driverId);
        if (!driver) return ctx.reply("Ҳайдовчи топилмади.");

        const cm = keyboards.carNameMap[driver.carModel] || driver.carModel;

        const verified = driver.isVerified ? "✅ " : "";
        let avgRating = "N/A";
        let reviewCount = 0;
        try {
            const Review = require("./models/Review");
            const reviews = await Review.find({ targetId: driver.telegramId });
            if (reviews.length > 0) {
                const sum = reviews.reduce((a, b) => a + b.rating, 0);
                avgRating = (sum / reviews.length).toFixed(1);
                reviewCount = reviews.length;
            }
        } catch (e) {
            console.error("Review fetch error:", e);
        }

        const caption = `
<b>👤 Ҳайдовчи Маълумотлари</b>

👤 Исм: ${verified}${driver.name}
⭐️ Рейтинг: ${avgRating} (${reviewCount} та баҳо)
🚗 Машина: ${driver.carDetails ? driver.carDetails.model : cm}
🎨 Ранг: ${driver.carDetails ? driver.carDetails.color : "-"}
📅 Йил: ${driver.carDetails ? driver.carDetails.year : "-"}
💺 Бўш жой: ${driver.carDetails ? driver.carDetails.seats : "-"} 

Алоқага чиқиш ёки Таклиф юбориш учун тугмалардан фойдаланинг:
`;
        const keyboard = new InlineKeyboard()
            .text("📩 Таклиф Юбориш", `direct_offer_${driver._id}`).row()
            .text("📞 Алоқага чиқиш", `request_contact_share_${driver._id}`).row()
            .text("📷 Машина Расми", `view_car_offer_${driver._id}`).row() // Reuse handler
            .text("🔙 Орқага", `ld_${driver.activeRoute}_p0_mall`);

        // Send Text Only (edit if possible)
        try {
            await ctx.editMessageText(caption, { parse_mode: "HTML", reply_markup: keyboard });
        } catch (e) {
            // If previous message was photo or something else which cannot be edited to text simply?
            // Actually editMessageText works fine if previous was text.
            // If previous was photo, we might need delete/reply.
            // But we come from list (text) usually.
            await ctx.deleteMessage().catch(() => { });
            await ctx.reply(caption, { parse_mode: "HTML", reply_markup: keyboard });
        }

        await ctx.answerCallbackQuery();
        return;
    }

    // 2.5 View Car Photo (Universal Handler for Offer & Public Profile)
    if (data.startsWith("view_car_offer_")) {
        const driverId = data.replace("view_car_offer_", "");
        const driver = await User.findById(driverId);

        if (!driver) return ctx.answerCallbackQuery("Haydovchi topilmadi.");

        if (driver.carImages && driver.carImages.length > 0) {
            await ctx.replyWithPhoto(driver.carImages[0].telegramFileId, {
                caption: `🚗 <b>${driver.name}</b> машинаси\nМодел: ${driver.carDetails ? driver.carDetails.model : driver.carModel} `,
                parse_mode: "HTML"
            });
            await ctx.answerCallbackQuery();
        } else {
            await ctx.answerCallbackQuery("⚠️ Машина расми юкланмаган.", { show_alert: true });
        }
        return;
    }

    // 2.6 View Selfie (Universal)
    if (data.startsWith("view_selfie_offer_")) {
        const driverId = data.replace("view_selfie_offer_", "");
        const driver = await User.findById(driverId);
        if (driver && driver.selfie && driver.selfie.telegramFileId) {
            await ctx.replyWithPhoto(driver.selfie.telegramFileId, {
                caption: `👤 <b>${driver.name}</b>`,
                parse_mode: "HTML"
            });
            await ctx.answerCallbackQuery();
        } else {
            await ctx.answerCallbackQuery("⚠️ Расм топилмади.", { show_alert: true });
        }
        return;
    }

    // 3. Direct Offer
    // 3. Direct Offer
    if (data.startsWith("direct_offer_")) {
        const driverId = data.replace("direct_offer_", "");
        const driver = await User.findById(driverId);

        // Check active request
        const request = await RideRequest.findOne({ passengerId: ctx.from.id, status: 'searching' });

        if (!request) {
            // Prompt user to create quick request
            await ctx.deleteMessage();

            // Infer route from driver's active route
            const routeMap = { 'tash_nam': { from: 'Tashkent', to: 'Namangan' }, 'nam_tash': { from: 'Namangan', to: 'Tashkent' } };
            const routeInfo = routeMap[driver.activeRoute];

            // Fallback if no specific route (unlikely for active list, but safe check)
            if (!routeInfo) {
                // For now, default or error. The driver list only shows active routes.
                // If undefined, maybe just fallback to asking? 
                // Let's assume valid because we filtered by activeRoute in list.
                return ctx.reply("Ҳайдовчи йўналиши аниқланмади.");
            }

            ctx.session.quickOffer = {
                driverId: driverId,
                from: routeInfo.from,
                to: routeInfo.to
            };

            await ctx.conversation.enter("quickRequestConversation");
            return;
        }

        if (!driver) return ctx.reply("Ҳайдовчи топилмади.");

        await ctx.answerCallbackQuery({ text: "Таклиф юборилди!", show_alert: true });

        // Notify Driver
        const passenger = await User.findOne({ telegramId: ctx.from.id });
        const offerMsg = `
⚡️ <b>СИЗГА МАХСУС ТАКЛИФ ТУШДИ!</b>

👤 Йўловчи: ${passenger.name}
📍 Йўналиш: ${request.from} ➡️ ${request.to}
⏰ Вақт: ${request.time}
${request.type === 'parcel' ? `📦 Тур: ${request.packageType}` : `💺 Жой: ${request.seats} нафар`}

<i>Ушбу йўловчи сизни танлади!</i>
`;
        // Add Bid button for driver
        const kb = new InlineKeyboard().text("🙋‍♂️ Таклиф бериш", `bid_${request._id}`);

        try {
            await ctx.api.sendMessage(driver.telegramId, offerMsg, { parse_mode: "HTML", reply_markup: kb });
        } catch (e) {
            console.error("Failed to notify driver:", e);
        }
        return;
    }

    // 4. Contact Share Request
    if (data.startsWith("request_contact_share_")) {
        const driverId = data.replace("request_contact_share_", "");
        const driver = await User.findById(driverId);
        const passenger = await User.findOne({ telegramId: ctx.from.id });

        if (!driver) return ctx.reply("Ҳайдовчи топилмади.");

        // Notify Driver
        const msg = `
📞 <b>АЛОҚА СЎРОВИ</b>

👤 Йўловчи: ${passenger.name}
📱 Тел: ${passenger.phone && passenger.phone.startsWith('+') ? passenger.phone : '+' + (passenger.phone || '')}

<i>Бу йўловчи сиз билан гаплашмоқчи. Илтимос алоқага чиқинг.</i>
`;
        try {
            await ctx.api.sendMessage(driver.telegramId, msg, { parse_mode: "HTML", reply_markup: contactActions(passenger) });
            await ctx.answerCallbackQuery({ text: "Сўров юборилди! Ҳайдовчи алоқага чиқади.", show_alert: true });
        } catch (e) {
            console.error("Failed to notify driver:", e);
            await ctx.answerCallbackQuery({ text: "Хатолик бўлди.", show_alert: true });
        }
        return;
    }

    // 5. Show Phone Contact
    if (data.startsWith("show_contact_")) {
        const targetUserId = data.replace("show_contact_", "");
        const targetUser = await User.findById(targetUserId);

        if (targetUser && targetUser.phone) {
            const phone = targetUser.phone.startsWith('+') ? targetUser.phone : '+' + targetUser.phone;
            // Send contact or just alert
            // Sharing contact is better as it allows "Add to contacts"
            // But we can't send "his" contact as a contact object easily without vcard or forwarding?
            // Actually, sendContact method works fine if we know the phone number.
            try {
                await ctx.replyWithContact(phone, targetUser.name || "Фойдаланувчи");
                await ctx.answerCallbackQuery();
            } catch (e) {
                // If fails (invalid format?), just show alert
                await ctx.answerCallbackQuery({ text: `📞 Tel: ${phone}`, show_alert: true });
            }
        } else {
            await ctx.answerCallbackQuery({ text: "⚠️ Raqam topilmadi.", show_alert: true });
        }
        return;
    }

    // --- Edit Request Handlers ---

    // Start Edit
    if (data.startsWith("edit_request_start_")) {
        const requestId = data.replace("edit_request_start_", "");
        // Save to session
        ctx.session.editingRequestId = requestId;

        await ctx.editMessageText("✏️ Nimani o'zgartirmoqchisiz?", {
            reply_markup: keyboards.editRequestMenu(requestId)
        });
        await ctx.answerCallbackQuery();
        return;
    }

    // View Active Drivers



    if (data.startsWith("edit_req_menu_")) {
        const type = data.replace("edit_req_menu_", "").split("_")[0]; // time, route, seats
        // Show options
        if (type === 'time') {
            await ctx.editMessageText("⏰ Yangi vaqtni tanlang:", { reply_markup: keyboards.timeSelection });
        } else if (type === 'route') {
            await ctx.editMessageText("📍 Yangi yo'nalishni tanlang:", { reply_markup: keyboards.routeSelection });
        } else if (type === 'seats') {
            await ctx.editMessageText("💺 Yangi joylar sonini tanlang:", { reply_markup: keyboards.seatSelection });
        }
        await ctx.answerCallbackQuery();
        // Note: The buttons in these keyboards trigger global callbacks (time_now, route_..., seats_...)
        // We will handle them below by checking session.
        return;
    }

    // Back to Request
    if (data.startsWith("back_to_req_")) {
        ctx.session.editingRequestId = null;
        await ctx.deleteMessage(); // Delete menu
        await ctx.reply("🚖 Buyurtmani ko'rish uchun menyudan 'Mening Buyurtmam' ni tanlang.", { reply_markup: keyboards.passengerMenu });
        return;
    }

    // GLOBAL EDIT HANDLERS (Time, Route, Seats)
    // Check if we are editing
    if (ctx.session.editingRequestId) {
        const requestId = ctx.session.editingRequestId;
        let update = null;
        let updateText = "";

        if (data.startsWith("time_")) {
            const time = data.replace("time_", "");
            // Map values
            const timeMap = { 'now': "Hozir (ASAP)", 'today': "Bugun", 'tomorrow': "Ertaga" };
            update = { time: timeMap[time] || time };
            updateText = "Vaqt";
        } else if (data.startsWith("route_")) {
            const route = data.replace("route_", "");
            const from = route === 'tash_nam' ? "Tashkent" : "Namangan";
            const to = route === 'tash_nam' ? "Namangan" : "Tashkent";
            update = { from, to };
            updateText = "Yo'nalish";
        } else if (data.startsWith("seats_")) {
            const seats = parseInt(data.replace("seats_", ""));
            update = { seats };
            updateText = "Joylar soni";
        }

        if (update) {
            await RideRequest.findByIdAndUpdate(requestId, update);
            ctx.session.editingRequestId = null; // Done
            await ctx.answerCallbackQuery(`✅ ${updateText} yangilandi!`);
            await ctx.deleteMessage();
            await ctx.reply(`✅ Buyurtma muvaffaqiyatli yangilandi!`, { reply_markup: keyboards.passengerMenu });
            return;
        }
    }

    // Rating Handler
    if (data.startsWith("rate_driver_")) {
        const parts = data.replace("rate_driver_", "").split("_");
        const driverId = parts[0];
        const reqId = parts[1];

        const kb = new InlineKeyboard();
        [1, 2, 3, 4, 5].forEach(star => {
            kb.text(star + " ⭐️", `rate_save_${driverId}_${reqId}_${star}`);
        });

        await ctx.editMessageText("Haydovchini necha yulduz bilan baholaysiz?", { reply_markup: kb });
        await ctx.answerCallbackQuery();
        return;
    }

    if (data.startsWith("rate_save_")) {
        const parts = data.replace("rate_save_", "").split("_");
        const driverId = parts[0];
        const reqId = parts[1];
        const stars = parts[2];

        // Save to DB (Assuming Review model)
        const Review = require("./models/Review");
        await Review.create({
            reviewerId: ctx.from.id,
            targetId: driverId,
            rideRequestId: reqId,
            role: 'passenger',
            rating: stars
        });

        await ctx.editMessageText(`✅ Rahmat! Siz ${stars} yulduz qo'ydingiz.`);
        await ctx.answerCallbackQuery("Baholandi!");
        return;
    }

    await next();
});

// Extras - "Бўш ҳайдовчилар" Handler (Available Drivers)
// This handler asks for route selection first, then triggers the enhanced ld_ callback flow
bot.hears("👀 Бўш ҳайдовчилар", async (ctx) => {
    // Ask for Route Selection
    await ctx.reply("📍 Қайси йўналишдаги ҳайдовчиларни кўрмоқчисиз?", {
        reply_markup: new InlineKeyboard()
            .text("Тошкент ➡️ Наманган", "ld_tash_nam_p0_mall").row()
            .text("Наманган ➡️ Тошкент", "ld_nam_tash_p0_mall")
    });
});

bot.hears("🟢 Ishdaman", async (ctx) => {
    // Prompt for direction
    await ctx.reply("Қайси йўналишда ҳаракатланмоқчисиз?", {
        reply_markup: keyboards.routeSelection
    });
});

// Radar Handler
// Radar Pagination Logic
async function sendRadarPage(ctx, page) {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user || user.role !== 'driver') return ctx.reply("Сиз ҳайдовчи эмассиз.");

    const limit = 10;
    const skip = page * limit;

    const total = await RideRequest.countDocuments({ status: 'searching' });
    const requests = await RideRequest.find({ status: 'searching' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    // If triggered by pagination callback, delete the old navigation message to clean up
    if (ctx.callbackQuery) {
        try {
            await ctx.deleteMessage();
        } catch (e) { } // Ignore if already deleted
    }

    if (requests.length === 0) {
        if (page > 0) return ctx.answerCallbackQuery("Бошқа саҳифа йўқ.");
        return ctx.reply("📂 Ҳозирча фаол буюртмалар йўқ.");
    }

    await ctx.reply(`📡 <b>ОЧИҚ БУЮРТМАЛАР (Саҳифа ${page + 1}):</b>`, { parse_mode: "HTML" });

    // Send each request as a separate card
    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const itemNum = skip + i + 1;
        const typeIcon = req.type === 'parcel' ? "📦 ПОЧТА" : "🚖 ТАКСИ";
        const details = req.type === 'parcel' ? `📦 ${req.packageType}` : `💺 ${req.seats} киши${req.seatType === 'front' ? " (⚠️ ОЛДИ ўРИНДИҚ)" : ""}`;
        const timeCreated = new Date(req.createdAt).toLocaleTimeString('uz-UZ', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });

        let msg = `КЛИЕНТ #${itemNum}\n` +
            `${typeIcon} 📍 <b>${req.from.toUpperCase()} ➡️ ${req.to.toUpperCase()}</b>\n` +
            `📅 ${timeCreated} | ⏰ ${req.time}\n` +
            `${details}\n`;

        if (req.district) msg += `🚩 ${req.district}\n`;
        if (req.createdBy === 'admin') {
            msg += `\n<i>(Буюртма Админдан. 📞 Рақамни тўғридан-тўғри олинг)</i>`;
        }

        const cardKeyboard = new InlineKeyboard();
        if (req.createdBy === 'admin') {
            cardKeyboard.text("📞 Raqamni olish (Tezkor)", `take_admin_${req._id}`);
        } else {
            cardKeyboard.text("🙋‍♂️ Таклиф бериш", `bid_${req._id}`);
        }

        if (req.voiceId) {
            await ctx.replyWithVoice(req.voiceId, {
                caption: msg,
                parse_mode: "HTML",
                reply_markup: cardKeyboard
            });
        } else {
            await ctx.reply(msg, {
                parse_mode: "HTML",
                reply_markup: cardKeyboard
            });
        }
    }

    // Send Navigation Controls as the last message
    const navRow = [];
    if (page > 0) navRow.push({ text: "⬅️ Олдинги", callback_data: `radar_p_${page - 1}` });
    if (skip + requests.length < total) navRow.push({ text: "Кейинги ➡️", callback_data: `radar_p_${page + 1}` });

    const navKeyboard = new InlineKeyboard();
    if (navRow.length > 0) navKeyboard.row(...navRow);
    navKeyboard.row().text("🔄 Янгилаш", `radar_p_${page}`);

    await ctx.reply(`📄 <b>Саҳифа ${page + 1}</b> (Жами: ${total} та)`, {
        parse_mode: "HTML",
        reply_markup: navKeyboard
    });
}

bot.hears("📡 OCHIQ BUYURTMALAR", (ctx) => sendRadarPage(ctx, 0));

bot.callbackQuery(/radar_p_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    await sendRadarPage(ctx, page);
    await ctx.answerCallbackQuery();
});

bot.hears([
    t('rest_mode', 'uz_latin'), t('rest_mode', 'uz_cyrillic')
], async (ctx) => {
    let user = await User.findOne({ telegramId: ctx.from.id });
    if (user) {
        user.isOnline = false;
        user.activeRoute = 'none';
        await user.save();

        const lang = user.language || 'uz_cyrillic';
        // Regenerate menu to show 'Ishdaman' button
        await ctx.reply(t('rest_mode', lang) + "...", { reply_markup: dynamicKeyboards.getDriverMenu(lang, false, false) });
    }
});

bot.hears([
    t('work_mode', 'uz_latin'), t('work_mode', 'uz_cyrillic')
], async (ctx) => {
    await ctx.reply("Қайси йўналишда ҳаракатланмоқчисиз?", {
        reply_markup: keyboards.routeSelection
    });
});

bot.hears([
    t('finish_route', 'uz_latin'), t('finish_route', 'uz_cyrillic')
], async (ctx) => {
    let user = await User.findOne({ telegramId: ctx.from.id });
    if (user) {
        user.activeRoute = 'none';
        user.isOnline = false;
        await user.save();
        const lang = user.language || 'uz_cyrillic';
        await ctx.reply("🏁", { reply_markup: dynamicKeyboards.getDriverMenu(lang, false, false) });
    }
});


// OCHIQ BUYURTMALAR (RADAR)
bot.hears([
    t('active_orders', 'uz_latin'), t('active_orders', 'uz_cyrillic')
], async (ctx) => {
    // Check if driver is active
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user || user.role !== 'driver') return ctx.reply("Сиз ҳайдовчи эмассиз.");

    // If driver is NOT online or has NO route
    if (user.activeRoute === 'none') {
        const lang = user.language || 'uz_cyrillic';
        return ctx.reply("⚠️ Сиз ҳали йўналиш танламадингиз. Илтимос 'Ишдаман' тугмасини босинг.", {
            reply_markup: dynamicKeyboards.getDriverMenu(lang, false, false)
        });
    }

    const routeMap = { 'tash_nam': { from: 'Tashkent', to: 'Namangan' }, 'nam_tash': { from: 'Namangan', to: 'Tashkent' } };
    const route = routeMap[user.activeRoute];

    if (!route) return ctx.reply("Хатолик: Йўналиш аниқланмади.");

    // Find Active Requests
    const requests = await RideRequest.find({
        status: 'searching', // Only open requests
        from: route.from,
        to: route.to,
        // Optional: filter by date to avoid stale?
    }).sort({ createdAt: -1 }).limit(10); // Show last 10

    if (requests.length === 0) {
        return ctx.reply("Ҳозирча бу йўналишда фаол буюртмалар йўқ.");
    }

    await ctx.reply(`📡 <b>Очиқ Буюртмалар (${requests.length}):</b>`, { parse_mode: "HTML" });

    for (const req of requests) {
        let msg = `⏰ <b>${req.time}</b>\n📍 ${req.district ? req.district : 'Манзил'}\n`;
        if (req.type === 'parcel') msg += `📦 <b>Почта:</b> ${req.packageType}`;
        else msg += `💺 <b>Жой:</b> ${req.seats}`;

        const kb = new InlineKeyboard().text("🙋‍♂️ Таклиф бериш", `bid_${req._id}`);
        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb });
    }
});

bot.hears([
    t('my_passengers', 'uz_latin'), t('my_passengers', 'uz_cyrillic')
], async (ctx) => {
    // Find requests where this driver is assigned and status is 'matched'
    // We need to find requests where offers array has an element with driverId = ctx.from.id (telegramId? No, user._id usually?)
    // Let's check how we save driverId in offer.
    // In driverBid.js: driverId: ctx.from.id (Telegram ID).
    // In bot.js (accept_): offer.driverId

    // So we query:
    const activeRequests = await RideRequest.find({
        "offers": {
            $elemMatch: {
                driverId: ctx.from.id,
                status: 'accepted'
            }
        },
        status: 'matched'
    });

    if (activeRequests.length === 0) {
        return ctx.reply("Сизда ҳозирча фаол буюртмалар (йўловчилар) йўқ.");
    }

    await ctx.reply(`📡 <b>Сизнинг фаол буюртмаларингиз (${activeRequests.length}):</b>`, { parse_mode: "HTML" });

    for (const req of activeRequests) {
        const passenger = await User.findOne({ telegramId: req.passengerId });
        const passName = passenger ? passenger.name : "Номаълум";
        const passPhone = passenger ? (passenger.phone ? (passenger.phone.startsWith('+') ? passenger.phone : '+' + passenger.phone) : "N/A") : "N/A";

        let msg = `👤 <b>Йўловчи:</b> ${passName}\n📞 <b>Тел:</b> ${passPhone}\n📍 ${req.from} ➡️ ${req.to}\n`;
        if (req.type === 'parcel') msg += `📦 <b>Почта:</b> ${req.packageType}`;
        else msg += `💺 <b>Жой:</b> ${req.seats} киши`;

        // Actions: Complete, Contact
        const kb = new InlineKeyboard()
            .text("✅ Якунлаш (Етиб бордик)", `complete_ride_${req._id}`).row();

        if (passenger && passenger.username) kb.url("💬 Телеграм", `https://t.me/${passenger.username}`);

        await ctx.reply(msg, { parse_mode: "HTML", reply_markup: kb });
    }
});

// Complete Ride Handler
bot.callbackQuery(/^complete_ride_(.+)$/, async (ctx) => {
    const requestId = ctx.match[1];
    const request = await RideRequest.findById(requestId);

    if (!request) return ctx.answerCallbackQuery("Buyurtma topilmadi.");

    if (request.status !== 'matched') {
        return ctx.answerCallbackQuery("Buyurtma allaqachon yakunlangan yoki bekor qilingan.");
    }

    request.status = 'completed';
    await request.save();

    await ctx.answerCallbackQuery("Buyurtma yakunlandi!");
    await ctx.editMessageText(`✅ <b>Buyurtma yakunlandi!</b>\n\n${request.from} ➡️ ${request.to}`, { parse_mode: "HTML" });

    // Notify Passenger
    try {
        const kb = new InlineKeyboard();
        [1, 2, 3, 4, 5].forEach(star => {
            kb.text(star + " ⭐️", `rate_save_${ctx.from.id}_${requestId}_${star}`);
        });

        await ctx.api.sendMessage(request.passengerId, `🏁 <b>Siz manzilga yetib keldingiz!</b>\n\nHaydovchi safarni yakunladi. Iltimos, xizmat sifatini baholang:`, {
            parse_mode: "HTML",
            reply_markup: kb
        });
    } catch (e) {
        console.error("Failed to notify passenger of completion:", e);
    }
});

// Complete All Handler
bot.hears([
    t('complete_all', 'uz_latin'), t('complete_all', 'uz_cyrillic')
], async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user || user.role !== 'driver') return ctx.reply("Сиз ҳайдовчи эмассиз.");

    const lang = user.language || 'uz_cyrillic';

    // Find all active requests for this driver
    const activeRequests = await RideRequest.find({
        "offers": {
            $elemMatch: {
                driverId: ctx.from.id,
                status: 'accepted'
            }
        },
        status: 'matched'
    });

    if (activeRequests.length === 0) {
        // Even if no passengers, ask if they want to start working on new route
        await ctx.reply("Сизда ҳозирча фаол йўловчилар йўқ.\n\n🔄 Янги йўналишда ишлашни бошлайсизми?", {
            reply_markup: keyboards.routeSelection
        });
        return;
    }

    // Complete all requests
    for (const req of activeRequests) {
        req.status = 'completed';
        await req.save();

        // Notify Passenger
        try {
            const kb = new InlineKeyboard();
            [1, 2, 3, 4, 5].forEach(star => {
                kb.text(star + " ⭐️", `rate_save_${ctx.from.id}_${req._id}_${star}`);
            });

            await ctx.api.sendMessage(req.passengerId, `🏁 <b>Siz manzilga yetib keldingiz!</b>\n\nHaydovchi safarni yakunladi. Iltimos, xizmat sifatini baholang:`, {
                parse_mode: "HTML",
                reply_markup: kb
            });
        } catch (e) {
            console.error("Failed to notify passenger:", e);
        }
    }

    await ctx.reply(`✅ <b>Барча буюртмалар якунланди!</b>\n\nЖами: ${activeRequests.length} та йўловчи/почта.\n\n🔄 Янги йўналишда ишлашни бошлайсизми?`, {
        parse_mode: "HTML",
        reply_markup: keyboards.routeSelection
    });
});

bot.hears([
    t('finish_route', 'uz_latin'), t('finish_route', 'uz_cyrillic')
], async (ctx) => {
    let user = await User.findOne({ telegramId: ctx.from.id });
    if (user) {
        user.activeRoute = 'none'; // Clear route but maybe keep online? Or go offline?
        user.isOnline = false; // Usually finish means stop working
        await user.save();

        const lang = user.language || 'uz_cyrillic';
        await ctx.reply("🏁", { reply_markup: dynamicKeyboards.getDriverMenu(lang, false, false) });
    }
});

// Driver Route Selection Handler (Outside of conversation)
bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("route_")) {
        // Check if user is driver
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (user && user.role === 'driver') {
            const route = data.replace("route_", ""); // tash_nam or nam_tash
            user.isOnline = true;
            user.activeRoute = route;
            await user.save();

            const routeName = route === 'tash_nam' ? "Tashkent ➡️ Namangan" : "Namangan ➡️ Tashkent";
            await ctx.deleteMessage(); // Remove buttons

            const lang = user.language || 'uz_cyrillic';

            await ctx.reply(`✅ Сиз фаол ҳолатдасиз!\nЙўналиш: ${routeName}\n\nБуюртмалар келишини кутинг.`, {
                reply_markup: dynamicKeyboards.getDriverMenu(lang, true, true)
            });
            await ctx.answerCallbackQuery();
            return;
        }
    }
    await next();
});

bot.hears([
    t('settings', 'uz_latin'), t('settings', 'uz_cyrillic')
], async (ctx) => {
    // Check role
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user && user.role === 'driver') {
        await ctx.conversation.enter("driverSettings");
        return;
    } else if (user && user.role === 'passenger') {
        await ctx.conversation.enter("passengerSettings");
        return;
    }
    await ctx.reply("🛠 Sozlamalar.");
});

// The OLD basic "available_drivers" handler is REMOVED.
// The new enhanced flow is triggered via "👀 Бўш ҳайдовчилар" -> Route Selection -> ld_ callback.
// Keeping this as a comment for reference.
// bot.hears(t('available_drivers'...) - DELETED, replaced by enhanced ld_ flow.

// Handle Errors
bot.catch((err) => {
    console.error("Bot Error:", err);
});

module.exports = bot;
