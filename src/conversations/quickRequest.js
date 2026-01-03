const { InlineKeyboard } = require('grammy');
const RideRequest = require('../models/RideRequest');
const User = require('../models/User');
const { t } = require('../utils/i18n_fixed');

// Temporary conversation to handle Quick Request creation
async function quickRequestConversation(conversation, ctx) {
    // 1. Get Info from Session
    const quickInfo = ctx.session.quickOffer;
    if (!quickInfo || !quickInfo.driverId) {
        await ctx.reply('Xatolik: Ma\'lumotlar yo\'qolgan.');
        return;
    }

    const { driverId, from, to } = quickInfo;

    // 2. Ask Time (Skip Route Selection as it is inferred)
    await ctx.reply(`📍 <b>${from} ➡️ ${to}</b>\n\n⏰ Ketish vaqtini tanlang:`, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
            .text(t('time_now', 'uz_cyrillic'), 'time_now').row()
            .text(t('time_today', 'uz_cyrillic'), 'time_today').row()
            .text(t('time_tomorrow', 'uz_cyrillic'), 'time_tomorrow')
    });

    const timeCtx = await conversation.waitFor('callback_query:data');
    const timeData = timeCtx.callbackQuery.data;
    await timeCtx.answerCallbackQuery();

    const timeMap = {
        'time_now': 'Hozir (Tezkor)',
        'time_today': 'Bugun',
        'time_tomorrow': 'Ertaga'
    };
    const time = timeMap[timeData] || 'Hozir';

    // 3. Create Request
    const request = await conversation.external(async () => {
        return await RideRequest.create({
            passengerId: ctx.from.id,
            from,
            to,
            time,
            seats: 1, // Default 1 for quick offer
            status: 'searching',
            type: 'taxi',
            createdAt: new Date()
        });
    });

    // 4. Notify Driver Directly
    const driver = await conversation.external(() => User.findById(driverId));
    const passenger = await conversation.external(() => User.findOne({ telegramId: ctx.from.id }));

    if (driver && passenger) {
        try {
            // Send Offer to Driver
            const offerMsg = `⚡️ <b>SIZGA MAXSUS TAKLIF TUSHDI!</b>\n\n👤 Yo'lovchi: ${passenger.name}\n📍 Yo'nalish: ${from} ➡️ ${to}\n⏰ Vaqt: ${time}\n💺 Joy: 1 kishi (Taxminiy)\n\n<i>Ushbu yo'lovchi sizni to'g'ridan-to'g'ri tanladi!</i>`;

            await conversation.external(async () => {
                await ctx.api.sendMessage(driver.telegramId, offerMsg, {
                    parse_mode: 'HTML',
                    reply_markup: new InlineKeyboard().text('🙋‍♂️ Taklif berish', `bid_${request._id}`)
                });
            });

            await timeCtx.reply('✅ <b>Taklif yuborildi!</b>\nHaydovchi javobini kuting. \n\nBuyurtmangiz yaratildi.', { parse_mode: 'HTML' });
        } catch (e) {
            console.error("Failed to notify driver:", e);
            await timeCtx.reply('⚠️ Haydovchiga xabar yuborishda xatolik bo\'ldi.');
        }
    }
}

module.exports = { quickRequestConversation };
