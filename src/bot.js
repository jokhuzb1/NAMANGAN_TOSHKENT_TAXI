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
const { contactActions } = require("./utils/keyboards");
const { contextMap } = require("./utils/contextMap");
const { broadcastRequest } = require("./utils/broadcastUtils");

// DB Connection moved to index.js

const bot = new Bot(config.BOT_TOKEN);

// Debug Middleware
bot.use(async (ctx, next) => {
    console.log(`[UPDATE] ${ctx.from ? ctx.from.id : 'unknown'} - Type: ${Object.keys(ctx.update)[1] || 'other'}`);
    if (ctx.message && ctx.message.text) console.log(`[TEXT] ${ctx.message.text}`);
    if (ctx.callbackQuery) console.log(`[CALLBACK] ${ctx.callbackQuery.data}`);
    await next();
});

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

// Commands
bot.command("start", async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });

    if (user && user.role !== 'none') {
        if (user.role === 'passenger') {
            return ctx.reply("Xush kelibsiz, yo'lovchi!", { reply_markup: keyboards.passengerMenu });
        } else if (user.role === 'driver') {
            if (user.status === 'approved') {
                return ctx.reply("Xush kelibsiz, haydovchi!", { reply_markup: keyboards.driverMenu });
            } else if (user.status === 'rejected') {
                // Reset keyboard to allow re-register
                return ctx.reply("❌ Sizning arizangiz rad etilgan. Qaytadan urinib ko'rishingiz mumkin.", { reply_markup: keyboards.roleSelection });
            } else {
                return ctx.reply("⏳ Arizangiz ko'rib chiqilmoqda...", { reply_markup: { remove_keyboard: true } });
            }
        }
    }

    await ctx.reply(`👋 <b>Assalomu alaykum!</b>\n\n<b>Namangan-Toshkent-Namangan</b> yo'nalishidagi eng qulay taksi va pochta botiga xush kelibsiz.\n\n🚖 <b>Yo'lovchilar uchun:</b> Uydan chiqmay turib taksi buyurtma qiling.\n📦 <b>Pochta yuboruvchilar uchun:</b> Pochtangizni ishonchli haydovchilar orqali yuboring.\n🚙 <b>Haydovchilar uchun:</b> Mijozlarni tez va oson toping.\n\nIltimos, davom etish uchun o'z rolingizni tanlang: 👇`, {
        parse_mode: "HTML",
        reply_markup: keyboards.roleSelection
    });
});

// Role Selection Handlers
bot.hears("🚖 Haydovchi", async (ctx) => {
    // Check if already registered
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user && user.role === 'driver') {
        // Allow re-registration if rejected
        if (user.status === 'rejected') {
            await ctx.reply("♻️ Sizning arizangiz rad etilgan edi. Qaytadan ma'lumotlarni yuborishingiz mumkin.");
            await ctx.conversation.enter("driverRegister");
            return;
        }
        if (user.status === 'pending_verification') {
            return ctx.reply("⏳ Arizangiz admin tomonidan tekshirilmoqda. Iltimos kuting.");
        }
        return ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz.", { reply_markup: keyboards.driverMenu });
    }
    await ctx.conversation.enter("driverRegister");
});

bot.hears("🧍 Yo'lovchi", async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user && user.role === 'passenger') {
        return ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz.", { reply_markup: keyboards.passengerMenu });
    }
    await ctx.conversation.enter("passengerRegister");
});

// Passenger Handlers
bot.hears("🚕 Taksi buyurtma qilish", async (ctx) => {
    // Check for active request
    const activeRequest = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    });

    if (activeRequest) {
        return ctx.reply("🚫 Sizda allaqachon faol buyurtma mavjud. Iltimos, '🚖 Mening Buyurtmam' bo'limi orqali holatni tekshiring yoki bekor qiling.");
    }

    await ctx.conversation.enter("rideRequestConversation");
});

bot.hears("📦 Pochta yuborish", async (ctx) => {
    // Check for active request
    const activeRequest = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    });

    if (activeRequest) {
        return ctx.reply("🚫 Sizda allaqachon faol buyurtma mavjud. Iltimos, '🚖 Mening Buyurtmam' bo'limi orqali holatni tekshiring yoki bekor qiling.");
    }

    await ctx.conversation.enter("parcelRequestConversation");
});

bot.hears("🚖 Mening Buyurtmam", async (ctx) => {
    const request = await RideRequest.findOne({
        passengerId: ctx.from.id,
        status: { $in: ['searching', 'matched'] }
    }).sort({ createdAt: -1 });

    if (!request) {
        console.log(`[DEBUG] No active request found for ${ctx.from.id}`);
        return ctx.reply("sizda faol buyurtmalar yo'q.");
    }
    console.log(`[DEBUG] Found active request ${request._id} for ${ctx.from.id}`);

    let statusText = request.status === 'searching' ? "🔍 Qidirilmoqda" : "✅ Haydovchi topildi";
    let typeHeader = request.type === 'parcel' ? "📦 POCHTA YUBORISH" : "🚖 TAKSI BUYURTMA";
    let typeIcon = request.type === 'parcel' ? "📦" : "🚖";

    // For POCHTA, we do NOT show seats. For Passenger, we do.
    let seatsInfo = "";
    if (request.type !== 'parcel') {
        seatsInfo = `� Joy: ${request.seats}\n`;
    } else {
        // Option to show package type here or not? User said "if POCHTA we do not need to selec seats or show on the offer".
        // Maybe "show on the offer" implies he doesn't want "Seats: ...". 
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
                message += `<b>👤 Haydovchi:</b> ${driver.name}\n`;
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

    // Handle "Taklif berish"
    if (data.startsWith("bid_")) {
        const requestId = data.replace("bid_", "");

        // Check Driver Status
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user || user.role !== 'driver') return ctx.reply("Siz haydovchi emassiz.");
        if (user.status !== 'approved') return ctx.answerCallbackQuery({ text: "⚠️ Arizangiz hali tasdiqlanmagan!", show_alert: true });

        // Auto-Online Logic
        if (!user.isOnline) {
            user.isOnline = true;
            await user.save();
            await ctx.reply("🟢 Siz 'Ishdaman' holatiga o'tdingiz va endi buyurtmalarni qabul qilishingiz mumkin.");
        }

        // Check Request Status BEFORE entering conversation
        const request = await RideRequest.findById(requestId);
        if (!request) return ctx.answerCallbackQuery({ text: "⚠️ Buyurtma topilmadi.", show_alert: true });

        if (request.status === 'negotiating') {
            return ctx.answerCallbackQuery({ text: "⏳ Bu buyurtma hozirda boshqa haydovchi bilan muhokama qilinmoqda. Biroz kuting.", show_alert: true });
        }
        if (request.status !== 'searching') {
            return ctx.answerCallbackQuery({ text: "⚠️ Bu buyurtma allaqachon olingan yoki bekor qilingan.", show_alert: true });
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
        const offerIndex = parseInt(data.replace("accept_", ""));
        // Need to find which request this message belongs to. 
        // For MVP, simplistic approach: pass RequestID in buttons OR search by passengerID + status?
        // Better: Search DB for pending request for this user.
        // Better: Search DB for pending request for this user.
        // Status is 'negotiating' because an offer was made. Check both just in case.
        const request = await RideRequest.findOne({ passengerId: ctx.from.id, status: { $in: ['negotiating', 'searching'] } });

        if (!request || !request.offers[offerIndex]) {
            return ctx.reply("⚠️ Xatolik: Buyurtma yoki taklif topilmadi.");
        }

        const offer = request.offers[offerIndex];
        request.status = 'matched';
        // In real app, mark offer as accepted
        offer.status = 'accepted';
        await request.save();

        await ctx.answerCallbackQuery("Taklif qabul qilindi!");

        // Notify Passenger (reveal Driver Phone)
        const driver = await User.findOne({ telegramId: offer.driverId });

        // Update original message to remove buttons
        await ctx.editMessageText(`✅ <b>Haydovchi qabul qilindi!</b>\n\nQuyida haydovchi ma'lumotlari yuborilmoqda...`, {
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [] }
        });

        // Prepare Details
        const carDetails = driver.carDetails || {};
        const cm = keyboards.carNameMap[driver.carModel] || driver.carModel;

        const detailsCaption = `
<b>✅ HAYDOVCHI TOPILDI!</b>

👤 <b>Ism:</b> ${driver.name}
📞 <b>Tel:</b> ${driver.phone.startsWith('+') ? driver.phone : '+' + driver.phone}

🚗 <b>Mashina:</b> ${carDetails.brand ? carDetails.brand : ''} ${carDetails.model || cm}
🎨 <b>Rang:</b> ${carDetails.color || '-'}
📅 <b>Yil:</b> ${carDetails.year || '-'}
💺 <b>Joy:</b> ${carDetails.seats || '-'}

💰 <b>Kelishilgan narx:</b> ${offer.price} so'm
`;

        // Send Text with Actions (Contact + View Photos)
        const buttons = keyboards.contactActions(driver);
        // We can append more buttons to this new keyboard object
        buttons.row(); // separate row

        // Add Photo Buttons
        if (driver.carImages && driver.carImages.length > 0) {
            buttons.text("📷 Mashina Rasmi", `view_car_offer_${driver._id}`).row();
        }

        // Add Selfie Button (Optional, but good for completeness)
        if (driver.selfie && driver.selfie.telegramFileId) {
            buttons.text("👤 Haydovchi Rasmi", `view_selfie_offer_${driver._id}`).row();
        }

        // Add Completion Actions/Back?
        // Actually we usually show "Complete" or "Cancel" on the MAIN order message. 
        // This message is a NEW message appearing.

        await ctx.reply(detailsCaption, {
            parse_mode: "HTML",
            reply_markup: buttons
        });

        // Notify Driver
        const passenger = await User.findOne({ telegramId: ctx.from.id });
        const passPhone = passenger.phone.startsWith('+') ? passenger.phone : '+' + passenger.phone;
        await ctx.api.sendMessage(driver.telegramId, `✅ Taklifingiz qabul qilindi!\n\n👤 Yo'lovchi: ${passenger.name}\n📞 ${passPhone}\n📍 ${request.from} ➡️ ${request.to}`, {
            reply_markup: keyboards.contactActions(passenger)
        });

        // Send Voice Message to Driver if exists
        if (request.voiceId) {
            try {
                await ctx.api.sendVoice(driver.telegramId, request.voiceId, { caption: "🗣 Yo'lovchidan ovozli xabar" });
            } catch (e) {
                console.error(`Failed to send voice to driver ${driver.telegramId}:`, e);
            }
        }

        return;
    }

    // Handle Decline
    if (data.startsWith("decline_")) {
        const offerIndex = parseInt(data.replace("decline_", ""));
        // Find request. It might be in 'negotiating' status now.
        const request = await RideRequest.findOne({ passengerId: ctx.from.id, status: 'negotiating' });

        if (!request) {
            // Maybe it's 'searching' if something weird happened? Check generic.
            const reqAny = await RideRequest.findOne({ passengerId: ctx.from.id, status: { $in: ['searching', 'negotiating'] } });
            if (!reqAny) return ctx.answerCallbackQuery("Buyurtma topilmadi.");
            // If found but not negotiating, maybe logic desync. Let's assume it failed.
        }

        await ctx.answerCallbackQuery("Taklif rad etildi. Qidiruv davom etmoqda...");
        await ctx.deleteMessage();

        const reqToUpdate = request || await RideRequest.findOne({ passengerId: ctx.from.id, status: { $in: ['searching', 'negotiating'] } });

        if (reqToUpdate && reqToUpdate.offers[offerIndex]) {
            const offer = reqToUpdate.offers[offerIndex];

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
                blockMsg = "\n⚠️ Siz ushbu buyurtmachi tomonidan 3 marta rad etildingiz va 20 daqiqaga bloklandingiz.";
            }

            offer.status = 'rejected';

            // RESET STATUS TO SEARCHING
            reqToUpdate.status = 'searching';

            await reqToUpdate.save();

            // Notify Driver
            try {
                await ctx.api.sendMessage(offer.driverId, `❌ Sizning taklifingiz rad etildi.${blockMsg}`);
            } catch (e) {
                console.error("Failed to notify driver rejection:", e);
            }

            // RE-BROADCAST TO ALL DRIVERS
            await broadcastRequest(ctx.api, reqToUpdate);
        }
        return;
    }

    // Handle Cancel Request Initialization (Ask Confirmation)
    if (data.startsWith("cancel_request_")) {
        const requestId = data.replace("cancel_request_", "");
        // Ask for confirmation
        const kb = new InlineKeyboard()
            .text("✅ Ha, bekor qilaman", `confirm_cancel_${requestId}`)
            .text("🔙 Yo'q, qaytaman", `abort_cancel_${requestId}`);

        await ctx.editMessageText("⚠️ <b>Rostdan ham buyurtmani bekor qilmoqchimisiz?</b>", {
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
            return ctx.answerCallbackQuery("Buyurtma topilmadi.");
        }

        // If matched, notify driver
        if (request.status === 'matched') {
            const acceptedOffer = request.offers.find(o => o.status === 'accepted');
            if (acceptedOffer) {
                const driver = await User.findOne({ telegramId: acceptedOffer.driverId });
                if (driver) {
                    await ctx.api.sendMessage(driver.telegramId, `❌ Yo'lovchi buyurtmani bekor qildi.`).catch(() => { });
                }
            }
        }

        request.status = 'cancelled';
        await request.save();

        await ctx.answerCallbackQuery("Buyurtma bekor qilindi.");
        // We delete the confirmation message or edit it to final status
        await ctx.editMessageText("🚮 Buyurtmangiz bekor qilindi.", { reply_markup: { inline_keyboard: [] } });
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
        await ctx.reply("Buyurtma bekor qilinmadi. Davom etamiz.");
        // Ideally we should restore the original message content, but that requires re-fetching everything which is complex in this block.
        // Deleting the confirmation prompt is the simplest "Go Back" interaction usually.
        return ctx.answerCallbackQuery("Bekor qilindi.");
    }

    // Handle Complete Request
    if (data.startsWith("complete_request_")) {
        const requestId = data.replace("complete_request_", "");
        const request = await RideRequest.findById(requestId);

        if (!request) return ctx.answerCallbackQuery("Buyurtma topilmadi.");

        request.status = 'completed';
        await request.save();

        await ctx.answerCallbackQuery("Buyurtma yakunlandi!");
        await ctx.editMessageText("✅ Safaringiz uchun rahmat! Buyurtma yakunlandi.", { reply_markup: { inline_keyboard: [] } });
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

        const routeName = route === 'tash_nam' ? "Tashkent ➡️ Namangan" : "Namangan ➡️ Tashkent";
        let text = `🚕 <b>Bo'sh Haydovchilar</b>\n📍 ${routeName}\n`;
        if (model !== 'all') text += `🚙 Filter: ${keyboards.carNameMap[model] || model}\n`;
        text += `📄 Sahifa: ${page + 1}/${totalPages || 1}\n\n`;

        const keyboard = new InlineKeyboard();

        if (drivers.length === 0) {
            text += "<i>Hozircha bu yo'nalishda haydovchilar yo'q.</i>";
        } else {
            drivers.forEach(d => {
                const cm = keyboards.carNameMap[d.carModel] || d.carModel;
                keyboard.text(`👤 ${d.name} | ${cm}`, `public_driver_info_${d._id}`).row();
            });
        }

        // Navigation
        const navRow = [];
        if (page > 0) navRow.push({ text: "⬅️ Oldingi", callback_data: `ld_${route}_p${page - 1}_m${model}` });
        if (page < totalPages - 1) navRow.push({ text: "Keyingi ➡️", callback_data: `ld_${route}_p${page + 1}_m${model}` });
        if (navRow.length > 0) keyboard.row(...navRow);

        // Filter & Back
        keyboard.row();
        keyboard.text("🚙 Mashina turi bo'yicha", `filter_show_${route}`);
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
        await ctx.editMessageText("🚗 Qaysi mashina turini qidiryapsiz?", {
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
        return ctx.reply("Yangi formatga o'tilmoqda...", {
            reply_markup: new InlineKeyboard().text("♻️ Ochish", `ld_${route}_p0_mall`)
        });
    }

    // 2. Public Driver Profile (Updated Back Button)
    if (data.startsWith("public_driver_info_")) {
        const driverId = data.replace("public_driver_info_", "");
        const driver = await User.findById(driverId);
        if (!driver) return ctx.reply("Haydovchi topilmadi.");

        const cm = keyboards.carNameMap[driver.carModel] || driver.carModel;

        const caption = `
<b>👤 Haydovchi Ma'lumotlari</b>

👤 Ism: ${driver.name}
🚗 Mashina: ${driver.carDetails ? driver.carDetails.model : cm}
🎨 Rang: ${driver.carDetails ? driver.carDetails.color : "-"}
📅 Yil: ${driver.carDetails ? driver.carDetails.year : "-"}
💺 Bo'sh joy: ${driver.carDetails ? driver.carDetails.seats : "-"} 

Aloqaga chiqish yoki Taklif yuborish uchun tugmalardan foydalaning:
`;
        const keyboard = new InlineKeyboard()
            .text("📩 Taklif Yuborish", `direct_offer_${driver._id}`).row()
            .text("📞 Aloqaga chiqish", `request_contact_share_${driver._id}`).row()
            .text("📷 Mashina Rasmi", `view_car_offer_${driver._id}`).row() // Reuse handler
            .text("🔙 Orqaga", `ld_${driver.activeRoute}_p0_mall`);

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
                caption: `🚗 <b>${driver.name}</b> mashinasi\nModel: ${driver.carDetails ? driver.carDetails.model : driver.carModel}`,
                parse_mode: "HTML"
            });
            await ctx.answerCallbackQuery();
        } else {
            await ctx.answerCallbackQuery("⚠️ Mashina rasmi yuklanmagan.", { show_alert: true });
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
            await ctx.answerCallbackQuery("⚠️ Rasm topilmadi.", { show_alert: true });
        }
        return;
    }

    // 3. Direct Offer
    if (data.startsWith("direct_offer_")) {
        const driverId = data.replace("direct_offer_", "");
        // Check active request
        const request = await RideRequest.findOne({ passengerId: ctx.from.id, status: 'searching' });

        if (!request) {
            return ctx.answerCallbackQuery({ text: "⚠️ Sizda faol buyurtma yo'q. Avval buyurtma yarating!", show_alert: true });
        }

        const driver = await User.findById(driverId);
        if (!driver) return ctx.reply("Haydovchi topilmadi.");

        // Check if already offered? (Skip for now)

        await ctx.answerCallbackQuery({ text: "Taklif yuborildi!", show_alert: true });

        // Notify Driver
        const passenger = await User.findOne({ telegramId: ctx.from.id });
        const offerMsg = `
⚡️ <b>SIZGA MAXSUS TAKLIF TUSHDI!</b>

👤 Yo'lovchi: ${passenger.name}
📍 Yo'nalish: ${request.from} ➡️ ${request.to}
⏰ Vaqt: ${request.time}
${request.type === 'parcel' ? `📦 Tur: ${request.packageType}` : `💺 Joy: ${request.seats} nafar`}

<i>Ushbu yo'lovchi sizni tanladi!</i>
`;
        // Add Bid button for driver
        const kb = new InlineKeyboard().text("🙋‍♂️ Taklif berish", `bid_${request._id}`);

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

        if (!driver) return ctx.reply("Haydovchi topilmadi.");

        // Notify Driver
        const msg = `
📞 <b>ALOQA SO'ROVI</b>

👤 Yo'lovchi: ${passenger.name}
📱 Tel: ${passenger.phone}

<i>Bu yo'lovchi siz bilan gaplashmoqchi. Iltimos aloqaga chiqing.</i>
`;
        try {
            await ctx.api.sendMessage(driver.telegramId, msg, { parse_mode: "HTML", reply_markup: contactActions(passenger.phone) });
            await ctx.answerCallbackQuery({ text: "So'rov yuborildi! Haydovchi aloqaga chiqadi.", show_alert: true });
        } catch (e) {
            console.error("Failed to notify driver:", e);
            await ctx.answerCallbackQuery({ text: "Xatolik bo'ldi.", show_alert: true });
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

    await next();
});

// Extras
bot.hears("👀 Bo'sh haydovchilar", async (ctx) => {
    // Check if user is passenger or driver? (Passenger mostly)
    // Ask for Route
    await ctx.reply("📍 Qaysi yo'nalishdagi haydovchilarni ko'rmoqchisiz?", {
        reply_markup: new InlineKeyboard()
            .text("Tashkent ➡️ Namangan", "ld_tash_nam_p0_mall").row()
            .text("Namangan ➡️ Tashkent", "ld_nam_tash_p0_mall")
    });
});

bot.hears("🟢 Ishdaman", async (ctx) => {
    // Prompt for direction
    await ctx.reply("Qaysi yo'nalishda harakatlanmoqchisiz?", {
        reply_markup: keyboards.routeSelection
    });
});

// Radar Handler
// Radar Pagination Logic
async function sendRadarPage(ctx, page) {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user || user.role !== 'driver') return ctx.reply("Siz haydovchi emassiz.");

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
        if (page > 0) return ctx.answerCallbackQuery("Boshqa sahifa yo'q.");
        return ctx.reply("📂 Hozircha faol buyurtmalar yo'q.");
    }

    await ctx.reply(`📡 <b>OCHIQ BUYURTMALAR (Sahifa ${page + 1}):</b>`, { parse_mode: "HTML" });

    // Send each request as a separate card
    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const itemNum = skip + i + 1;
        const typeIcon = req.type === 'parcel' ? "📦 POST" : "🚖 TAXI";
        const details = req.type === 'parcel' ? `📦 ${req.packageType}` : `💺 ${req.seats} kishi${req.seatType === 'front' ? " (⚠️ OLDI O'RINDIQ)" : ""}`;
        const timeCreated = new Date(req.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

        let msg = `KLIENT #${itemNum}\n` +
            `${typeIcon} 📍 <b>${req.from.toUpperCase()} ➡️ ${req.to.toUpperCase()}</b>\n` +
            `📅 ${timeCreated} | ⏰ ${req.time}\n` +
            `${details}\n`;

        if (req.district) msg += `🚩 ${req.district}\n`;

        const cardKeyboard = new InlineKeyboard()
            .text("🙋‍♂️ Taklif berish", `bid_${req._id}`);

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
    if (page > 0) navRow.push({ text: "⬅️ Oldingi", callback_data: `radar_p_${page - 1}` });
    if (skip + requests.length < total) navRow.push({ text: "Keyingi ➡️", callback_data: `radar_p_${page + 1}` });

    const navKeyboard = new InlineKeyboard();
    if (navRow.length > 0) navKeyboard.row(...navRow);
    navKeyboard.row().text("🔄 Yangilash", `radar_p_${page}`);

    await ctx.reply(`📄 <b>Sahifa ${page + 1}</b> (Jami: ${total} ta)`, {
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

bot.hears("🔴 Dam olyapman", async (ctx) => {
    await User.updateOne({ telegramId: ctx.from.id }, { isOnline: false, activeRoute: 'none' });
    await ctx.reply("Siz dam olish rejimidasiz. Buyurtmalar kelmaydi.");
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
            await ctx.reply(`✅ Siz faol holatdasiz!\nYo'nalish: ${routeName}\n\nBuyurtmalar kelishini kuting.`);
            await ctx.answerCallbackQuery();
            return;
        }
    }
    await next();
});

bot.hears("⚙️ Sozlamalar", async (ctx) => {
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

// View Active Drivers
bot.hears("👀 Bo'sh haydovchilar", async (ctx) => {
    const drivers = await User.find({
        role: 'driver',
        status: 'approved',
        isOnline: true,
        // activeRoute: { $ne: 'none' } // Optional: only show those with active route
    }).limit(10);

    if (drivers.length === 0) {
        return ctx.reply("hozirda afsuski barcha haydovchilar band.");
    }

    let msg = `<b>🟢 Aktiv Haydovchilar (${drivers.length}):</b>\n\n`;
    drivers.forEach((d, i) => {
        const route = d.activeRoute === 'tash_nam' ? "Toshkent -> Namangan" :
            d.activeRoute === 'nam_tash' ? "Namangan -> Toshkent" : "Yo'nalish tanlanmagan";
        const car = d.carDetails ? d.carDetails.model : d.carModel;
        msg += `${i + 1}. <b>${d.name}</b>\n🚗 ${car}\n📍 ${route}\n\n`;
    });

    await ctx.reply(msg, { parse_mode: "HTML" });
});

// Handle Errors
bot.catch((err) => {
    console.error("Bot Error:", err);
});

module.exports = bot;
