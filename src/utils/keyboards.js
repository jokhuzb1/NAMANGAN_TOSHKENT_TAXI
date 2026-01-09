const { Keyboard, InlineKeyboard } = require("grammy");

// --- Reply Keyboards (Persistent Menus) ---

const roleSelection = new Keyboard()
    .text("🚖 Ҳайдовчи").text("🧍 Йўловчи")
    .resized();

const passengerMenu = new Keyboard()
    .text("🚕 Такси буюртма қилиш")
    .row()
    .text("🚖 Менинг Буюртмам")
    .row()
    .text("📦 Почта юбориш")
    .row()
    .text("👀 Бўш ҳайдовчилар")
    .text("⚙️ Созламалар")
    .resized();

// driverMenu Removed - Use dynamicKeyboards.getDriverMenu instead!

const requestContact = new Keyboard()
    .requestContact("📞 Телефон рақамни юбориш")
    .row()
    .text("❌ Бекор қилиш")
    .resized();

const cancelKeyboard = new Keyboard()
    .text("❌ Бекор қилиш")
    .resized();

// --- Inline Keyboards (Action Interactions) ---

// Car Data
const carNameMap = {
    "gentra": "Chevrolet Gentra",
    "cobalt": "Chevrolet Cobalt",
    "nexia3": "Chevrolet Nexia 3",
    "spark": "Chevrolet Spark",
    "monza": "Chevrolet Monza",
    "onix": "Chevrolet Onix",
    "byd": "BYD",
    "leap": "Leap Motor",
    "other": "Boshqa"
};

// Registration: Car Models
const carModels = new InlineKeyboard()
    .text("Chevrolet Gentra", "car_gentra").text("Chevrolet Cobalt", "car_cobalt").row()
    .text("Chevrolet Nexia 3", "car_nexia3").text("Chevrolet Spark", "car_spark").row()
    .text("Chevrolet Monza", "car_monza").text("Chevrolet Onix", "car_onix").row()
    .text("BYD", "car_byd").text("Leap Motor", "car_leap").row()
    .text("Boshqa", "car_other");

// Filter Cars
const carFilter = (route) => {
    const kb = new InlineKeyboard()
        .text("🌐 Barchasi", `ld_${route}_p0_mall`).row();

    Object.keys(carNameMap).forEach(key => {
        kb.text(carNameMap[key], `ld_${route}_p0_m${key}`).row();
    });
    kb.text("🔙 Orqaga", `ld_${route}_p0_mall`); // Reset to all/main view
    return kb;
};

// Ride Request: Route
const routeSelection = new InlineKeyboard()
    .text("Tashkent ➡️ Namangan", "route_tash_nam").row()
    .text("Namangan ➡️ Tashkent", "route_nam_tash").row()
    .text("❌ Bekor qilish", "cancel_process");

// Ride Request: Time
const timeSelection = new InlineKeyboard()
    .text("🚀 Tayyor yo'lovchi", "time_now").row()
    .text("☀️ Bugun", "time_today").text("🌙 Ertaga", "time_tomorrow").row()
    .text("⬅️ Orqaga", "back_step").text("❌ Bekor qilish", "cancel_process");

// Ride Request: Seats
const seatSelection = new InlineKeyboard()
    .text("1", "seats_1").text("2", "seats_2").text("3", "seats_3").text("4", "seats_4").row()
    .text("⬅️ Orqaga", "back_step").text("❌ Bekor qilish", "cancel_process");

// Ride Request: Seat Type
const seatTypeSelection = new InlineKeyboard()
    .text("Old o'rindiq", "seat_front").text("Orqa o'rindiq", "seat_back").row()
    .text("Farqi yo'q", "seat_any").row()
    .text("⬅️ Orqaga", "back_step").text("❌ Bekor qilish", "cancel_process");

// Ride Request: Package Type
const packageTypeSelection = new InlineKeyboard()
    .text("📄 Dokument", "pack_doc").text("📦 Korobka", "pack_box").row()
    .text("🎒 Yuk", "pack_load").text("❓ Boshqa", "pack_other").row()
    .text("⬅️ Orqaga", "back_step").text("❌ Bekor qilish", "cancel_process");

// Ride Request: Confirm
const confirmRide = new InlineKeyboard()
    .text("✅ Tasdiqlash", "confirm_ride").row()
    .text("⬅️ Orqaga", "back_step").text("❌ Bekor qilish", "cancel_process");

// Driver: Bid on Request
const driverBid = (requestId) => new InlineKeyboard()
    .text("🙋‍♂️ Таклиф бериш", `bid_${requestId}`);

// Driver: Take Admin Request (Direct Contact)
const adminOrderTake = (requestId) => new InlineKeyboard()
    .text("📞 Рақамни олиш", `take_admin_${requestId}`);


// Passenger: Accept/Decline Offer
const offerAction = (requestId, offerId, driverId) => {
    const kb = new InlineKeyboard();
    if (driverId) {
        kb.text("📷 Машина расми", `view_car_offer_${driverId}`).row();
    }
    // Using Offer ID ensures we pick the right one even if array order changes
    // Including Request ID ensures we pick the right Request!
    kb.text("✅ Қабул қилиш", `accept_${requestId}_${offerId}`).text("❌ Рад этиш", `decline_${requestId}_${offerId}`);
    return kb;
}

// Contact Actions (After Match)
// Edit Request Options
const editRequestMenu = (requestId) => new InlineKeyboard()
    .text("⏰ Вақтни ўзгартириш", `edit_req_menu_time_${requestId}`).row()
    .text("📍 Йўналишни ўзгартириш", `edit_req_menu_route_${requestId}`).row()
    .text("💺 Жойлар сонини ўзгартириш", `edit_req_menu_seats_${requestId}`).row()
    .text("🔙 Орқага", `back_to_req_${requestId}`);

// Helper function to format phone number with +
const formatPhone = (phone) => {
    if (!phone) return null;
    const cleaned = phone.toString().replace(/[^\d]/g, '');
    return cleaned.startsWith('998') ? '+' + cleaned : (cleaned.length > 0 ? '+' + cleaned : null);
};

const contactActions = (user) => {
    const kb = new InlineKeyboard();

    // Telegram link - prefer username, fallback to user ID link
    if (user.username) {
        kb.url("💬 Телеграм ёзиш", `https://t.me/${user.username}`);
    } else if (user.telegramId) {
        // tg://user?id= works for users who have enabled "Allow others to find me"
        kb.url("💬 Телеграм профил", `tg://user?id=${user.telegramId}`);
    }

    // Phone call button - detailed in text, so we don't need a button that causes errors
    // Telegram does not support 'tel:' scheme in inline buttons.
    // The phone number is already displayed in the message text which is clickable.

    return kb;
};


// --- Reply Keyboards for Conversations ---

const routeSelectionReply = new Keyboard()
    .text("Тошкент ➡️ Наманган").row()
    .text("Наманган ➡️ Тошкент").row()
    .text("❌ Бекор қилиш")
    .resized();

const timeSelectionReply = new Keyboard()
    .text("🚀 Ҳозир").row()
    .text("☀️ Бугун").text("🌙 Эртага").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const parcelTimeSelectionReply = new Keyboard()
    .text("📦 Тайёр почта/юк").row()
    .text("☀️ Бугун").text("🌙 Эртага").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const seatSelectionReply = new Keyboard()
    .text("1").text("2").text("3").text("4").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const seatTypeSelectionReply = new Keyboard()
    .text("Олд ўриндиқ").text("Орқа ўриндиқ").row()
    .text("Фарқи йўқ").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const packageTypeSelectionReply = new Keyboard()
    .text("📄 Документ").text("📦 Коробка").row()
    .text("🎒 Юк").text("❓ Бошқа").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const confirmRideReply = new Keyboard()
    .text("✅ Тасдиқлаш").row()
    .text("⬅️ Орқага").text("❌ Бекор қилиш")
    .resized();

const priceSuggestionTaxi = new Keyboard()
    .text("100 000").text("125 000").text("150 000").row()
    .text("200 000").text("✏️ Бошқа нарх").row()
    .text("❌ Бекор қилиш")
    // Values are numbers, so they stay same. Text "Boshqa narx" -> "Бошқа нарх"
    .resized();

const priceSuggestionParcel = new Keyboard()
    .text("20 000").text("40 000").text("60 000").row()
    .text("80 000").text("100 000").text("✏️ Бошқа нарх").row()
    .text("❌ Бекор қилиш")
    .resized();


module.exports = {
    roleSelection,
    passengerMenu,
    requestContact,
    cancelKeyboard,
    carModels,
    routeSelection,
    timeSelection,
    seatSelection,
    seatTypeSelection,
    confirmRide,
    driverBid,
    adminOrderTake,
    offerAction,
    contactActions,
    formatPhone,
    carNameMap,
    carFilter,
    editRequestMenu,
    packageTypeSelection,
    // Reply Keyboards
    routeSelectionReply,
    timeSelectionReply,
    parcelTimeSelectionReply,
    seatSelectionReply,
    seatTypeSelectionReply,
    packageTypeSelectionReply,
    confirmRideReply,
    priceSuggestionTaxi,
    priceSuggestionParcel
};
