const { Keyboard, InlineKeyboard } = require("grammy");

// --- Reply Keyboards (Persistent Menus) ---

const roleSelection = new Keyboard()
    .text("🚖 Haydovchi").text("🧍 Yo'lovchi")
    .resized();

const passengerMenu = new Keyboard()
    .text("🚕 Taksi buyurtma qilish")
    .row()
    .text("🚖 Mening Buyurtmam")
    .row()
    .text("📦 Pochta yuborish")
    .row()
    .text("👀 Bo'sh haydovchilar")
    .text("⚙️ Sozlamalar")
    .resized();

const driverMenu = new Keyboard()
    .text("🟢 Ishdaman").text("🔴 Dam olyapman")
    .row()
    .text("📡 OCHIQ BUYURTMALAR")
    .row()
    .text("⚙️ Sozlamalar")
    .resized();

const requestContact = new Keyboard()
    .requestContact("📞 Telefon raqamni yuborish")
    .row()
    .text("❌ Bekor qilish")
    .resized();

const cancelKeyboard = new Keyboard()
    .text("❌ Bekor qilish")
    .resized();

// --- Inline Keyboards (Action Interactions) ---

// Car Data
const carNameMap = {
    "gentra": "Chevrolet Gentra",
    "cobalt": "Chevrolet Cobalt",
    "nexia3": "Chevrolet Nexia 3",
    "spark": "Chevrolet Spark",
    "other": "Boshqa"
};

// Registration: Car Models
const carModels = new InlineKeyboard()
    .text("Chevrolet Gentra", "car_gentra").row()
    .text("Chevrolet Cobalt", "car_cobalt").row()
    .text("Chevrolet Nexia 3", "car_nexia3").row()
    .text("Chevrolet Spark", "car_spark").row()
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
    .text("🙋‍♂️ Taklif berish", `bid_${requestId}`);

// Passenger: Accept/Decline Offer
const offerAction = (offerIndex, driverId) => {
    const kb = new InlineKeyboard();
    if (driverId) {
        kb.text("📷 Mashina Rasmi", `view_car_offer_${driverId}`).row();
    }
    kb.text("✅ Qabul qilish", `accept_${offerIndex}`).text("❌ Rad etish", `decline_${offerIndex}`);
    return kb;
}

// Contact Actions (After Match)
// Edit Request Options
const editRequestMenu = (requestId) => new InlineKeyboard()
    .text("⏰ Vaqtni o'zgartirish", `edit_req_menu_time_${requestId}`).row()
    .text("📍 Yo'nalishni o'zgartirish", `edit_req_menu_route_${requestId}`).row()
    .text("💺 Joylar sonini o'zgartirish", `edit_req_menu_seats_${requestId}`).row()
    .text("🔙 Orqaga", `back_to_req_${requestId}`);

const contactActions = (user) => {
    const kb = new InlineKeyboard();
    if (user.username) {
        kb.url("💬 Telegram yozish", `https://t.me/${user.username}`);
    } else {
        kb.url("💬 Telegram profil", `tg://user?id=${user.telegramId}`);
    }
    // Only show phone call button if we want to encourage offline calls, but url buttons don't support tel: well.
    // The text message contains the phone number anyway.
    return kb;
};


// --- Reply Keyboards for Conversations ---

const routeSelectionReply = new Keyboard()
    .text("Tashkent ➡️ Namangan").row()
    .text("Namangan ➡️ Tashkent").row()
    .text("❌ Bekor qilish")
    .resized();

const timeSelectionReply = new Keyboard()
    .text("🚀 Tayyor yo'lovchi").row()
    .text("☀️ Bugun").text("🌙 Ertaga").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const parcelTimeSelectionReply = new Keyboard()
    .text("🚀 Tayyor pochta/yuk").row()
    .text("☀️ Bugun").text("🌙 Ertaga").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const seatSelectionReply = new Keyboard()
    .text("1").text("2").text("3").text("4").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const seatTypeSelectionReply = new Keyboard()
    .text("Old o'rindiq").text("Orqa o'rindiq").row()
    .text("Farqi yo'q").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const packageTypeSelectionReply = new Keyboard()
    .text("📄 Dokument").text("📦 Korobka").row()
    .text("🎒 Yuk").text("❓ Boshqa").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const confirmRideReply = new Keyboard()
    .text("✅ Tasdiqlash").row()
    .text("⬅️ Orqaga").text("❌ Bekor qilish")
    .resized();

const priceSuggestionTaxi = new Keyboard()
    .text("100 000").text("125 000").text("150 000").row()
    .text("200 000").text("✏️ Boshqa narx").row()
    .text("❌ Bekor qilish")
    .resized();

const priceSuggestionParcel = new Keyboard()
    .text("20 000").text("40 000").text("60 000").row()
    .text("80 000").text("100 000").text("✏️ Boshqa narx").row()
    .text("❌ Bekor qilish")
    .resized();


module.exports = {
    roleSelection,
    passengerMenu,
    driverMenu,
    requestContact,
    cancelKeyboard,
    carModels,
    routeSelection,
    timeSelection,
    seatSelection,
    seatTypeSelection,
    confirmRide,
    driverBid,
    offerAction,
    contactActions,
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
