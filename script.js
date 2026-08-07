"use strict";

const API_BASE_URL = "https://api.platinov.com";
const REVIEWS_API_BASE_URL = "";
const SUPPORT_URL = "https://t.me/PlatinovSupport";
const TELEGRAM_AUTH_URL = "https://t.me/PlatinovBot?startapp=profile";
const SELL_MANAGER_URL = SUPPORT_URL;
const REVIEWS_TELEGRAM_URL = "https://t.me/+TZeEFqDDYyhkOTEy";
const REVIEWS_VK_URL = "https://vk.ru/wall866011657_25";
const VK_BUY_URL = "https://vk.ru/platinov_shop";
const VK_SELL_URL = "https://vk.ru/platinov_sell";
const TELEGRAM_BUY_URL = "https://t.me/platinov_shop";
const ACCESS_RESTRICTED_TEXT = "Оформить заказ можно вручную.";
const MAX_ORDER_TOTAL_RUB = 250000;
const PAYMENT_PLACEHOLDER_ENABLED = false;
// Temporarily disabled while the acquiring flow is under bank review.
const SELLING_ENABLED = true;
const SITE_ROOT = window.location.protocol === "file:" ? "" : "/";

function siteAsset(path) {
  return `${SITE_ROOT}${String(path).replace(/^\/+/, "")}`;
}

const REVIEW_ENDPOINTS = {
  list: "/api/reviews",
  create: "/api/reviews/create"
};
const REVIEWS_PAGE_SIZE = 15;
const API_SESSION_STORAGE_KEY = "platinov-api-access-token";
let apiAccessToken = (() => {
  try {
    return window.sessionStorage.getItem(API_SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
})();
let telegramAvatarObjectUrl = "";
let telegramAvatarLoadPromise = null;
let promoQuoteTimer = 0;
let promoQuoteSequence = 0;
let remoteOrdersLoading = false;

function setApiAccessToken(token) {
  apiAccessToken = token || "";
  try {
    if (apiAccessToken) {
      window.sessionStorage.setItem(API_SESSION_STORAGE_KEY, apiAccessToken);
    } else {
      window.sessionStorage.removeItem(API_SESSION_STORAGE_KEY);
    }
  } catch {
    // Some Telegram WebViews can disable storage; the in-memory token still works.
  }
}

async function authenticateApi(force = false) {
  if (!API_BASE_URL) return "";
  if (!force && apiAccessToken) return apiAccessToken;
  if (!tg?.initData) throw new Error("Откройте приложение через Telegram");

  const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": tg.initData
    },
    body: "{}"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || `Ошибка авторизации: ${response.status}`);
  }
  setApiAccessToken(data.access_token);
  return apiAccessToken;
}

async function apiRequest(path, options = {}, allowRetry = true) {
  const token = await authenticateApi();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };
  const response = await fetch(
    `${API_BASE_URL.replace(/\/$/, "")}${path}`,
    { ...options, headers }
  );
  if (response.status === 401 && allowRetry) {
    setApiAccessToken("");
    await authenticateApi(true);
    return apiRequest(path, options, false);
  }
  return response;
}

async function loadTelegramAvatar() {
  const directPhotoUrl = tg?.initDataUnsafe?.user?.photo_url || "";
  if (directPhotoUrl) return directPhotoUrl;
  if (telegramAvatarObjectUrl) return telegramAvatarObjectUrl;
  if (!API_BASE_URL || !tg?.initData) return "";
  if (telegramAvatarLoadPromise) return telegramAvatarLoadPromise;

  telegramAvatarLoadPromise = (async () => {
    const response = await apiRequest("/api/profile/avatar");
    if (response.status === 404) return "";
    if (!response.ok) {
      throw new Error(`Не удалось загрузить Telegram-аватар: ${response.status}`);
    }
    const avatarBlob = await response.blob();
    if (!avatarBlob.size || !avatarBlob.type.startsWith("image/")) return "";
    telegramAvatarObjectUrl = URL.createObjectURL(avatarBlob);
    return telegramAvatarObjectUrl;
  })()
    .catch((error) => {
      console.warn("Telegram avatar loading error", error);
      return "";
    })
    .finally(() => {
      telegramAvatarLoadPromise = null;
    });

  return telegramAvatarLoadPromise;
}

async function hydrateTelegramAvatar() {
  const avatarUrl = await loadTelegramAvatar();
  if (!avatarUrl) return;
  renderHeaderProfile();
  if (state.route === "profile") render();
}

const PROJECTS = [
  {
    id: "black-russia",
    name: "BLACK RUSSIA",
    shortName: "Black Russia",
    unit: "кк",
    priceLabel: "100 ₽ / кк",
    color: "red",
    logo: "black-russia.png",
    amountStep: 1,
    defaultAmount: 3,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [{ from: 1, price: 100 }]
  },
  {
    id: "gta-5-rp",
    name: "GTA 5 RP",
    shortName: "GTA 5 RP",
    unit: "кк",
    priceLabel: "1000 ₽ / кк",
    color: "orange",
    logo: "gta5rp.png",
    amountStep: 1,
    defaultAmount: 3,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [{ from: 1, price: 1000 }]
  },
  {
    id: "matreshka-rp",
    name: "MATRESHKA RP",
    shortName: "Matreshka RP",
    unit: "кк",
    priceLabel: "190 ₽ / кк",
    color: "purple",
    logo: "matreshka.png",
    amountStep: 1,
    defaultAmount: 3,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [{ from: 1, price: 190 }]
  },
  {
    id: "standoff-2",
    name: "STANDOFF 2",
    shortName: "Standoff 2",
    unit: "G",
    priceLabel: "175 ₽ / 250G",
    color: "blue",
    logo: "standoff.png",
    amountStep: 250,
    defaultAmount: 250,
    quickAmounts: [250, 500, 1000, 2500],
    tariffs: [{ from: 250, price: 175, per: 250 }]
  }
];

const SERVERS = {
  "black-russia": [
    "RED", "GREEN", "BLUE", "YELLOW", "ORANGE", "PURPLE", "LIME", "PINK", "CHERRY", "BLACK",
    "INDIGO", "WHITE", "MAGENTA", "CRIMSON", "GOLD", "AZURE", "PLATINUM", "AQUA", "GRAY", "ICE",
    "CHILLI", "CHOCO", "MOSCOW", "SPB", "UFA", "SOCHI", "KAZAN", "SAMARA", "ROSTOV", "ANAPA",
    "EKB", "KRASNODAR", "ARZAMAS", "NOVOSIB", "GROZNY", "SARATOV", "OMSK", "IRKUTSK", "VOLGOGRAD",
    "VORONEZH", "BELGOROD", "MAKHACHKALA", "VLADIKAVKAZ", "VLADIVOSTOK", "KALININGRAD",
    "CHELYABINSK", "KRASNOYARSK", "CHEBOKSARY", "KHABAROVSK", "PERM", "TULA", "RYAZAN", "MURMANSK",
    "PENZA", "KURSK", "ARKHANGELSK", "ORENBURG", "KIROV", "KEMEROVO", "TYUMEN", "TOLYATTI",
    "IVANOVO", "STAVROPOL", "SMOLENSK", "PSKOV", "BRYANSK", "OREL", "YAROSLAVL", "BARNAUL",
    "LIPETSK", "ULYANOVSK", "YAKUTSK", "TAMBOV", "BRATSK", "ASTRAKHAN", "CHITA", "KOSTROMA",
    "VLADIMIR", "KALUGA", "NOVGOROD", "TAGANROG", "VOLOGDA", "TVER", "TOMSK", "IZHEVSK", "SURGUT",
    "PODOLSK", "MAGADAN", "CHEREPOVETS", "NORILSK"
  ],
  "gta-5-rp": [
    "Downtown", "Strawberry", "Vinewood", "Blackberry", "Insquad", "Sunrise", "Rainbow", "Richman",
    "Eclipse", "La Mesa", "Burton", "Rockford", "Alta", "Del Perro", "Davis", "Harmony", "Redwood",
    "Hawick", "Grapeseed", "Murrieta", "Vespucci", "Milton", "La Puerta", "Senora"
  ],
  "matreshka-rp": Array.from({ length: 34 }, (_, index) => `MATRESHKA MOBILE #${index + 1}`),
  "standoff-2": ["STANDOFF 2"]
};

PROJECTS.forEach((project) => {
  project.servers = SERVERS[project.id] || [];
});

const REVIEW_PROJECT_SEQUENCE = [
  "black-russia",
  "matreshka-rp",
  "black-russia",
  "gta-5-rp",
  "black-russia",
  "black-russia",
  "matreshka-rp",
  "black-russia",
  "black-russia",
  "black-russia"
];

const REVIEW_INITIALS = [
  "А", "М", "Д", "К", "Р", "И", "С", "Н", "В", "Е",
  "Т", "П", "Г", "Л", "О", "Ф", "Я", "Б", "Ю", "З"
];

const REVIEW_SOURCES = ["Telegram", "Сайт", "Telegram", "VK", "Сайт"];
const DEMO_REVIEW_OPENERS = [
  "всё чётко",
  "быстро выдали",
  "топ всё без заморочек",
  "брал здесь впервые",
  "заказал прямо с телефона",
  "немного переживал сначала",
  "оплатил поздно вечером",
  "нужны были вирты срочно",
  "сделка прошла спокойно",
  "менеджер ответил почти сразу",
  "курс оказался нормальный",
  "оформление простое и понятное",
  "вирты пришли полностью",
  "вопросов по заказу не было",
  "проверил сначала на небольшом заказе",
  "зашёл по совету друга",
  "сначала не понял куда писать",
  "сделал заказ ночью",
  "брал через банк",
  "выбрал получение трейдом",
  "всё гуд",
  "реально быстро",
  "спс всё пришло"
];

const DEMO_REVIEW_DETAILS = [
  "сервер нашли с первого раза",
  "по сумме всё совпало",
  "поддержка объяснила что делать",
  "на выдаче не задержали",
  "статус обновился сразу",
  "ник проверили перед отправкой",
  "зачислили одной суммой",
  "пришлось подождать всего пару минут",
  "без лишних вопросов оформили",
  "курс был такой же как на странице",
  "выдача заняла минут пять",
  "ответили нормально не шаблоном",
  "сделку провели аккуратно",
  "с телефона оформилось без проблем",
  "менеджер всё время был на связи",
  "чутка тупил сам но разобрался",
  "думал будет намного дольше",
  "получил ровно сколько указывал",
  "быстро зделали я доволен"
];

const DEMO_REVIEW_ENDINGS = [
  "буду брать ещё",
  "можно пользоваться",
  "респект менеджеру",
  "в целом доволен",
  "для первого раза отлично",
  "без обмана",
  "норм тема",
  "советую",
  "спасибо",
  "вопросов нет",
  "цена устроила",
  "все ок",
  "имба",
  "вернусь ещё",
  "зачёт",
  "ожидание небольшое",
  "результатом доволен"
];

const REVIEW_VARIANTS = {
  "black-russia": [
    { amount: "3 кк", price: "300 ₽" },
    { amount: "7 кк", price: "700 ₽" },
    { amount: "11 кк", price: "1 100 ₽" },
    { amount: "18 кк", price: "1 800 ₽" },
    { amount: "22 кк", price: "2 200 ₽" },
    { amount: "27 кк", price: "2 700 ₽" },
    { amount: "35 кк", price: "3 500 ₽" },
    { amount: "44 кк", price: "4 400 ₽" },
    { amount: "63 кк", price: "6 300 ₽" },
    { amount: "86 кк", price: "8 600 ₽" },
    { amount: "105 кк", price: "10 500 ₽" }
  ],
  "matreshka-rp": [
    { amount: "3 кк", price: "570 ₽" },
    { amount: "6 кк", price: "1 140 ₽" },
    { amount: "11 кк", price: "2 090 ₽" },
    { amount: "17 кк", price: "3 230 ₽" },
    { amount: "22 кк", price: "4 180 ₽" },
    { amount: "27 кк", price: "5 130 ₽" },
    { amount: "41 кк", price: "7 790 ₽" },
    { amount: "58 кк", price: "11 020 ₽" },
    { amount: "73 кк", price: "13 870 ₽" },
    { amount: "96 кк", price: "18 240 ₽" }
  ],
  "gta-5-rp": [
    { amount: "1 кк", price: "1 000 ₽" },
    { amount: "2 кк", price: "2 000 ₽" },
    { amount: "3 кк", price: "3 000 ₽" },
    { amount: "7 кк", price: "7 000 ₽" },
    { amount: "11 кк", price: "11 000 ₽" },
    { amount: "15 кк", price: "15 000 ₽" },
    { amount: "22 кк", price: "22 000 ₽" },
    { amount: "27 кк", price: "27 000 ₽" },
    { amount: "31 кк", price: "31 000 ₽" },
    { amount: "48 кк", price: "48 000 ₽" }
  ]
};

function demoReviewDate(index) {
  const date = new Date(Date.UTC(2026, 6, 26));
  date.setUTCDate(date.getUTCDate() - Math.floor(index / 3));
  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear()
  ].join(".");
}

function demoReviewText(index) {
  const start = DEMO_REVIEW_OPENERS[index % DEMO_REVIEW_OPENERS.length];
  const detail = DEMO_REVIEW_DETAILS[(index * 7 + 3) % DEMO_REVIEW_DETAILS.length];
  const ending = DEMO_REVIEW_ENDINGS[(index * 11 + 5) % DEMO_REVIEW_ENDINGS.length];
  const lowerDetail = detail.charAt(0).toLowerCase() + detail.slice(1);
  const lowerEnding = ending.charAt(0).toLowerCase() + ending.slice(1);

  const style = index % 24;
  if (style === 0) return `${start}, ${lowerDetail}`;
  if (style === 7) return `${start}. ${detail}`;
  if (style === 15) return `${start} ${lowerDetail}!`;
  if (style === 21) return `${start}. ${detail} ${lowerEnding}`;
  if (style % 3 === 0) return `${start} ${lowerDetail} ${lowerEnding}`;
  return `${start} ${lowerDetail}`;
}

function buildDemoReviews(total = 300) {
  return Array.from({ length: total }, (_, index) => {
    const projectId = REVIEW_PROJECT_SEQUENCE[index % REVIEW_PROJECT_SEQUENCE.length];
    const servers = SERVERS[projectId];
    const variant = REVIEW_VARIANTS[projectId][index % REVIEW_VARIANTS[projectId].length];
    const orderCode = ((0x3000 + index * 73) % 0x10000)
      .toString(16)
      .padStart(4, "0")
      .toUpperCase();
    return {
      id: `demo-review-${String(index + 1).padStart(3, "0")}`,
      initial: REVIEW_INITIALS[index % REVIEW_INITIALS.length],
      order: `Заказ #${orderCode}`,
      status: "подтверждён",
      rating: (index + 1) % 10 === 0 ? 4 : 5,
      text: demoReviewText(index),
      projectId,
      server: servers[(index * 11) % servers.length],
      amount: variant.amount,
      price: variant.price,
      delivery: index % 3 === 0 ? "Трейд" : "Банк",
      time: `~${2 + ((index * 7) % 8)} мин`,
      date: demoReviewDate(index),
      source: REVIEW_SOURCES[index % REVIEW_SOURCES.length]
    };
  });
}

const REVIEWS = buildDemoReviews();

const state = {
  route: "home",
  history: [],
  selectedProjectId: null,
  preferredAction: null,
  action: null,
  selectedServer: null,
  deliveryType: "trade",
  reviewFilter: "all",
  reviewVisibleCount: REVIEWS_PAGE_SIZE,
  reviewRating: 5,
  serverSearch: "",
  apiReviews: [],
  apiOrders: null,
  paymentReturnNotice: null,
  lastEdited: "virtual"
};

const NAVIGATION_SESSION_KEY = "platinov-navigation-session-v1";
const RESTORABLE_ROUTES = new Set([
  "home",
  "projects",
  "action",
  "servers",
  "buy",
  ...(SELLING_ENABLED ? ["sell"] : []),
  "orders",
  "reviews",
  "raffle",
  "support",
  "profile",
  "info"
]);

const app = document.getElementById("app");
const backButton = document.getElementById("backButton");
const modalRoot = document.getElementById("modalRoot");
const toastRegion = document.getElementById("toastRegion");
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, className = "") {
  const extraClass = className ? ` ${className}` : "";
  return `<svg class="ui-icon${extraClass}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
}

function socialLogo(network) {
  const source = network === "telegram" ? "telegram-logo.png" : "vk-logo.png";
  return `<img class="social-brand-logo" src="${source}" alt="" aria-hidden="true">`;
}

function ratingStars(rating = 5) {
  const count = Math.max(0, Math.min(5, Number(rating) || 0));
  return `<span class="review-stars" aria-label="${count} из 5">${Array.from(
    { length: count },
    () => icon("star", "rating-star")
  ).join("")}</span>`;
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ₽`;
}

function calculateStandoffListingPrice(amount) {
  const normalizedAmount = Number(amount);
  return Number.isFinite(normalizedAmount) && normalizedAmount > 0
    ? normalizedAmount / 0.8
    : 0;
}

function formatGold(value) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  }).format(value)} G`;
}

function getProject(projectId = state.selectedProjectId) {
  return PROJECTS.find((project) => project.id === projectId);
}

function getTradeWording(project = getProject()) {
  const isStandoff = project?.id === "standoff-2";
  return {
    buyAction: isStandoff ? "Купить голду" : "Купить вирты",
    sellAction: isStandoff ? "Продать голду" : "Продать вирты",
    productName: "Вирты",
    productDefinition: isStandoff
      ? "(голда - внутриигровая виртуальная валюта)"
      : "(вирты - внутриигровая виртуальная валюта)",
    purchaseTitle: isStandoff ? "Покупка голды" : "Покупка виртов",
    amountLabel: isStandoff ? "Количество голды" : "Количество виртов",
    sellMessage: isStandoff
      ? "Здравствуйте! Хочу продать голду."
      : "Здравствуйте! Хочу продать вирты."
  };
}

function updatePurchaseSummary(project, amount, total) {
  if (!project) return;
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
    ? Number(amount)
    : 0;
  const normalizedTotal = Number.isFinite(Number(total)) && Number(total) > 0
    ? Number(total)
    : 0;
  const wording = getTradeWording(project);
  const productLabel = document.getElementById("productLabel");
  const quantityLabel = document.getElementById("quantityLabel");
  const paymentButtonLabel = document.querySelector("#buyForm .payment-button-label");
  const standoffListingAmount = document.getElementById("standoffListingAmount");
  if (productLabel) {
    productLabel.textContent = `Товар: ${wording.productName}`;
  }
  if (quantityLabel) {
    quantityLabel.textContent = `Количество: ${normalizedAmount.toLocaleString("ru-RU")} ${project.unit}`;
  }
  if (paymentButtonLabel) {
    paymentButtonLabel.textContent = normalizedTotal > 0
      ? `Оплатить ${formatMoney(normalizedTotal)}`
      : "Оплатить";
  }
  if (standoffListingAmount) {
    standoffListingAmount.textContent = formatGold(
      calculateStandoffListingPrice(normalizedAmount)
    );
  }
}

function requiresServerSelection(project) {
  return Boolean(project && project.id !== "standoff-2");
}

function getOrderServerLabel(project, server) {
  if (!project || !server || project.id === "standoff-2") return server;
  const serverIndex = project.servers.indexOf(server);
  if (serverIndex < 0) return server;
  const readableName = project.id === "black-russia"
    ? server.charAt(0).toUpperCase() + server.slice(1).toLowerCase()
    : server;
  return `${serverIndex + 1} | ${readableName}`;
}

function saveNavigationSession() {
  try {
    sessionStorage.setItem(NAVIGATION_SESSION_KEY, JSON.stringify({
      route: state.route,
      history: state.history.slice(-20),
      selectedProjectId: state.selectedProjectId,
      preferredAction: state.preferredAction,
      action: state.action,
      selectedServer: state.selectedServer,
      deliveryType: state.deliveryType,
      reviewFilter: state.reviewFilter,
      serverSearch: state.serverSearch
    }));
  } catch {
    // Session storage may be unavailable in a restricted WebView.
  }
}

function restoreNavigationSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(NAVIGATION_SESSION_KEY));
    if (!saved || typeof saved !== "object") return;

    const project = PROJECTS.find((item) => item.id === saved.selectedProjectId) || null;
    const availableActions = SELLING_ENABLED ? ["buy", "sell"] : ["buy"];
    const preferredAction = availableActions.includes(saved.preferredAction)
      ? saved.preferredAction
      : null;
    let action = availableActions.includes(saved.action) ? saved.action : null;
    let selectedServer = typeof saved.selectedServer === "string"
      ? saved.selectedServer
      : null;
    let route = RESTORABLE_ROUTES.has(saved.route) ? saved.route : "home";

    state.selectedProjectId = project?.id || null;
    state.preferredAction = preferredAction;
    state.deliveryType = ["trade", "bank"].includes(saved.deliveryType)
      ? saved.deliveryType
      : "trade";
    state.reviewFilter = saved.reviewFilter === "all" || getProject(saved.reviewFilter)
      ? saved.reviewFilter
      : "all";
    state.serverSearch = typeof saved.serverSearch === "string"
      ? saved.serverSearch.slice(0, 80)
      : "";
    state.history = Array.isArray(saved.history)
      ? saved.history.filter((item) => RESTORABLE_ROUTES.has(item)).slice(-20)
      : [];

    const projectRoutes = new Set(["action", "servers", "buy", "sell"]);
    if (projectRoutes.has(route) && !project) {
      route = "projects";
      state.history = [];
    }

    if (project && ["servers", "buy", "sell"].includes(route)) {
      if (route === "buy" || route === "sell") action = route;
      if (!action) action = preferredAction;
      if (!action) route = "action";
    }

    if (project && action && !requiresServerSelection(project)) {
      selectedServer = project.servers[0] || project.name;
      if (route === "servers") route = action;
    } else if (
      project &&
      requiresServerSelection(project) &&
      selectedServer &&
      !project.servers.includes(selectedServer)
    ) {
      selectedServer = null;
    }

    if (
      project &&
      requiresServerSelection(project) &&
      ["buy", "sell"].includes(route) &&
      !selectedServer
    ) {
      route = "servers";
    }

    state.action = action;
    state.selectedServer = selectedServer;
    state.route = route;
  } catch {
    try {
      sessionStorage.removeItem(NAVIGATION_SESSION_KEY);
    } catch {
      // Ignore unavailable session storage.
    }
  }
}

function applyPaymentReturnRoute() {
  const url = new URL(window.location.href);
  const startParam = String(
    tg?.initDataUnsafe?.start_param ||
    url.searchParams.get("tgWebAppStartParam") ||
    ""
  ).toLowerCase();
  const requestedScreen = String(url.searchParams.get("screen") || "").toLowerCase();
  const paymentResult = String(url.searchParams.get("payment") || "").toLowerCase();
  const shouldOpenOrders = requestedScreen === "orders" ||
    startParam.startsWith("payment_") ||
    ["success", "paid", "return", "failed", "cancelled"].includes(paymentResult);

  if (!shouldOpenOrders) return;

  const noticeByResult = {
    success: {
      type: "success",
      title: "Оплата принята",
      text: "Проверяем подтверждение платёжной системы и обновляем статус заказа."
    },
    paid: {
      type: "success",
      title: "Оплата принята",
      text: "Проверяем подтверждение платёжной системы и обновляем статус заказа."
    },
    failed: {
      type: "error",
      title: "Оплата не завершена",
      text: "Заказ сохранён. Вы сможете повторить оплату после подключения платёжной системы."
    },
    cancelled: {
      type: "error",
      title: "Оплата отменена",
      text: "Заказ сохранён в истории и не потеряется."
    },
    return: {
      type: "pending",
      title: "Проверяем оплату",
      text: "Статус изменится после подтверждения от платёжной системы."
    }
  };
  const startResult = startParam.replace(/^payment_/, "");
  const resolvedResult = paymentResult || startResult;

  state.route = "orders";
  state.history = [];
  state.paymentReturnNotice = noticeByResult[resolvedResult] || {
    type: "pending",
    title: "Ваш заказ сохранён",
    text: "Актуальный статус заказа отображается в этом разделе."
  };

  ["screen", "payment", "order", "tgWebAppStartParam"].forEach((name) => {
    url.searchParams.delete(name);
  });
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function getStoredJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function setStoredJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("Не удалось сохранить данные на этом устройстве");
  }
}

function getLocalReviews() {
  return getStoredJSON("alexey-store-reviews", []);
}

function getLocalOrders() {
  return getStoredJSON("alexey-store-orders", []);
}

function mapRemoteOrder(order) {
  const statusMap = {
    awaiting_payment_provider: ["Ожидает оплаты", "waiting"],
    paid: ["Оплачен", "paid"],
    processing: ["В обработке", "processing"],
    completed: ["Выполнен", "completed"],
    cancelled: ["Отменён", "cancelled"]
  };
  const [status, statusClass] = statusMap[order.status] || [order.status || "Создан", "waiting"];
  const numericAmount = Number(order.amount_kk);
  const amount = Number.isFinite(numericAmount)
    ? numericAmount.toLocaleString("ru-RU")
    : String(order.amount_kk || "");
  const date = new Date(order.created_at);
  return {
    id: order.public_id,
    game: order.game,
    server: order.server || "Без сервера",
    amount: `${amount} ${order.game === "STANDOFF 2" ? "G" : "кк"}`,
    total: formatMoney(Number(order.price_rub)),
    totalValue: Number(order.price_rub),
    status,
    statusClass,
    date: Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU")
  };
}

function getOrdersForDisplay() {
  return Array.isArray(state.apiOrders)
    ? state.apiOrders.map(mapRemoteOrder)
    : getLocalOrders();
}

function haptic(type = "light") {
  if (!tg?.isVersionAtLeast?.("6.1")) return;
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {
    // Haptic feedback is optional and unavailable outside Telegram.
  }
}

function openExternal(url) {
  if (tg && url.startsWith("https://t.me/")) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openPaymentPage(url) {
  try {
    window.location.assign(url);
  } catch {
    openExternal(url);
  }
}

function showToast(message) {
  toastRegion.innerHTML = `<div class="toast">${escapeHTML(message)}</div>`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toastRegion.innerHTML = "";
  }, 2800);
}

function syncTelegramBackButton() {
  const canGoBack = state.history.length > 0;
  backButton.classList.toggle("is-hidden", !canGoBack);
  if (!tg?.BackButton || !tg.isVersionAtLeast?.("6.1")) return;
  if (canGoBack) tg.BackButton.show();
  else tg.BackButton.hide();
}

function setActiveNav(route) {
  const mainRoute = ["home", "reviews", "raffle", "support", "profile"].includes(route)
    ? route
    : "";
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === mainRoute);
  });
}

function navigate(route, options = {}) {
  const { replace = false, preserveScroll = false } = options;
  if (!replace && state.route !== route) state.history.push(state.route);
  state.route = route;
  render();
  if (route === "orders") loadRemoteOrders();
  if (!preserveScroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

function goBack() {
  if (!state.history.length) {
    navigate("home", { replace: true });
    return;
  }
  state.route = state.history.pop();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function projectLogo(project) {
  return `
    <span class="project-logo project-${project.color}">
      <img src="${escapeHTML(project.logo)}" alt="" loading="lazy">
    </span>
  `;
}

function projectCards(context = "home") {
  const projectAction = context === "selection" ? state.preferredAction : null;
  const actionLabel = projectAction === "buy" ? "Купить" : projectAction === "sell" ? "Продать" : "Выбрать";
  return PROJECTS.map((project) => `
    <button class="project-card project-${project.color} ${state.selectedProjectId === project.id ? "is-selected" : ""}"
      type="button" data-project="${project.id}" data-context="${context}"
      style="--project-art: url('${escapeHTML(project.logo)}')"
      aria-label="${actionLabel}: ${escapeHTML(project.name)}">
      ${projectLogo(project)}
      <span class="project-card-copy">
        <span class="project-name">${escapeHTML(project.name)}</span>
      </span>
      <span class="project-card-chevron" aria-hidden="true">${icon("chevron-right")}</span>
    </button>
  `).join("");
}

function renderHome() {
  return `
    <section class="screen">
      <div class="hero">
        <h1>Игровая валюта — быстро и безопасно</h1>
        <p class="hero-text">Выгодный курс, быстрая выдача и поддержка 24/7.</p>
        <div class="hero-actions ${SELLING_ENABLED ? "" : "hero-actions-single"}">
          <button class="primary-button" type="button" data-start-action="buy">
            Купить вирты <span class="button-arrow">${icon("arrow-right")}</span>
          </button>
          ${SELLING_ENABLED ? `
            <button class="secondary-button" type="button" data-start-action="sell">
              Продать вирты
            </button>
          ` : ""}
        </div>
      </div>

      <section class="section">
        <div class="section-heading">
          <div>
            <h2>Выберите игру</h2>
          </div>
        </div>
        <div class="project-grid project-grid-home">${projectCards("home")}</div>
      </section>

      <section class="section">
        <div class="section-heading"><h2>Почему нам доверяют</h2></div>
        <div class="trust-grid">
          <span class="trust-watermark" aria-hidden="true">${icon("shield-check")}</span>
          <div class="trust-item"><span class="trust-icon">${icon("clock")}</span><span>Быстрая выдача</span></div>
          <div class="trust-item"><span class="trust-icon">${icon("headset")}</span><span>Поддержка 24/7</span></div>
          <div class="trust-item"><span class="trust-icon">${icon("shield-check")}</span><span>Безопасные сделки</span></div>
          <div class="trust-item"><span class="trust-icon">${icon("badge-ruble")}</span><span>Лучшие цены</span></div>
        </div>
      </section>

      <section class="section">
        <div class="glass-card rating-panel">
          <span class="rating-watermark" aria-hidden="true">
            ${icon("message-square")}
            ${icon("star", "rating-watermark-star")}
          </span>
          <div class="rating-copy">
            <div class="rating-value">4.9 из 5</div>
            <p class="muted">Отзывы покупателей</p>
          </div>
          <div class="rating-stars">${ratingStars(5)}</div>
          <button class="ghost-button" type="button" data-route="reviews">Смотреть отзывы</button>
        </div>
      </section>
    </section>
  `;
}

function renderProjectSelection() {
  const modeText = state.preferredAction === "sell"
    ? "Выберите проект для продажи виртов"
    : state.preferredAction === "buy"
      ? "Выберите проект для покупки виртов"
      : "Выберите игру, затем подходящее действие";
  return `
    <section class="screen order-flow order-project-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Шаг 1</p>
        <h1>Выберите проект</h1>
        <p>${modeText}</p>
      </header>
      <div class="project-grid">${projectCards("selection")}</div>
    </section>
  `;
}

function renderActionSelection() {
  const project = getProject();
  if (!project) return renderProjectSelection();
  const requiresServer = requiresServerSelection(project);
  const wording = getTradeWording(project);
  return `
    <section class="screen order-flow order-action-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Шаг 2</p>
        <h1>Что хотите сделать?</h1>
        <p>Вы выбрали ${escapeHTML(project.name)}</p>
      </header>
      <div class="glass-card summary-card selected-game-card"
        style="--project-art: url('${escapeHTML(project.logo)}')">
        ${projectLogo(project)}
        <div class="summary-copy">
          <strong>${escapeHTML(project.name)}</strong>
        </div>
      </div>
      <div class="choice-stack">
        <button class="select-card order-action-card order-action-buy ${state.preferredAction === "buy" ? "is-featured" : ""}" type="button" data-action="buy">
          <span class="select-icon">${icon("arrow-down")}</span>
          <span class="select-copy">
            <strong>${wording.buyAction}</strong>
            <small>${requiresServer ? "Выберите сервер и оформите заказ" : "Укажите данные и оформите заказ"}</small>
          </span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        ${SELLING_ENABLED ? `
          <button class="select-card order-action-card order-action-sell ${state.preferredAction === "sell" ? "is-featured" : ""}" type="button" data-action="sell">
            <span class="select-icon">${icon("arrow-up-right")}</span>
            <span class="select-copy">
              <strong>${wording.sellAction}</strong>
              <small>Передайте данные менеджеру и получите расчёт</small>
            </span>
            <span class="select-chevron">${icon("chevron-right")}</span>
          </button>
        ` : ""}
      </div>
    </section>
  `;
}

function renderServerSelection() {
  const project = getProject();
  if (!project) return renderProjectSelection();
  const query = state.serverSearch.trim().toLocaleLowerCase("ru");
  const servers = (project.servers || [])
    .map((server, index) => ({ server, index }))
    .filter(({ server }) =>
      server.toLocaleLowerCase("ru").includes(query)
    );
  return `
    <section class="screen order-flow order-server-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Шаг 3</p>
        <h1>Выберите сервер</h1>
        <p>${escapeHTML(project.name)} · ${state.action === "sell" ? "Продажа" : "Покупка"}</p>
      </header>
      <div class="search-wrap server-search">
        <span class="search-icon">${icon("search")}</span>
        <input class="search-input" id="serverSearch" type="search" autocomplete="off"
          placeholder="Найти сервер" value="${escapeHTML(state.serverSearch)}" aria-label="Поиск сервера">
      </div>
      <div class="server-list">
        ${servers.length ? servers.map(({ server, index }) => `
          <button class="server-button server-row ${state.selectedServer === server ? "is-selected" : ""}" type="button" data-server="${escapeHTML(server)}">
            <span class="server-number">${String(index + 1).padStart(2, "0")}</span>
            <strong>${escapeHTML(server)}</strong>
            <span class="select-chevron">${state.selectedServer === server ? icon("check") : icon("chevron-right")}</span>
          </button>
        `).join("") : `
          <div class="glass-card empty-state">
            <div class="empty-icon">${icon("search")}</div>
            <h3>Сервер не найден</h3>
            <p>Попробуйте изменить запрос.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function calculateStandoffPrice(project, amount) {
  const tariff = project.tariffs[0];
  const subtotal = (amount / tariff.per) * tariff.price;
  return {
    total: subtotal,
    subtotal,
    discount: 0,
    promoPercent: 0,
    unitPrice: tariff.price
  };
}

function formatRateLabel(project, unitPrice) {
  if (project.id === "standoff-2") {
    return `${unitPrice} ₽ за ${project.tariffs[0].per}G`;
  }
  return `${unitPrice} ₽ за кк`;
}

function formatUnitPriceLabel(project, unitPrice) {
  if (project.id === "standoff-2") {
    return `Цена за ${project.tariffs[0].per}G: ${formatMoney(unitPrice)}`;
  }
  return `Цена за 1 кк: ${formatMoney(unitPrice)}`;
}

function calculatePrice(project, amount) {
  if (!project || !Number.isFinite(amount) || amount <= 0) {
    return { total: 0, subtotal: 0, discount: 0, promoPercent: 0, unitPrice: 0 };
  }
  if (project.id === "standoff-2") {
    return calculateStandoffPrice(project, amount);
  }
  let subtotal = 0;
  let unitPrice = 0;
  const tariff = project.tariffs.find((item) => amount >= item.from) || project.tariffs.at(-1);
  unitPrice = tariff.price;
  subtotal = amount * tariff.price;
  return {
    total: subtotal,
    subtotal,
    discount: 0,
    promoPercent: 0,
    unitPrice
  };
}

function calculateAmountFromMoney(project, money) {
  if (!project || !Number.isFinite(money) || money <= 0) return 0;
  if (project.id === "standoff-2") {
    const tariff = project.tariffs[0];
    return money / tariff.price * tariff.per;
  }
  const tariffs = project.tariffs.slice().sort((a, b) => b.from - a.from);
  for (const tariff of tariffs) {
    const amount = money / tariff.price;
    if (amount >= tariff.from) return amount;
  }
  return money / tariffs.at(-1).price;
}

function getMaxOrderAmount(project) {
  const amount = calculateAmountFromMoney(
    project,
    MAX_ORDER_TOTAL_RUB
  );
  const step = Number(project?.amountStep) || 1;
  return Math.floor((amount + Number.EPSILON) / step) * step;
}

function renderPurchaseForm() {
  const project = getProject();
  if (!project || !state.selectedServer) return renderServerSelection();
  const wording = getTradeWording(project);
  const defaultAmount = project.defaultAmount ?? project.quickAmounts[0];
  const price = calculatePrice(project, defaultAmount);
  return `
    <section class="screen order-flow order-form-step order-buy-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Оформление</p>
        <h1>${wording.purchaseTitle}</h1>
        <p>Проверьте данные перед переходом к оплате</p>
      </header>
      <div class="glass-card summary-card selected-game-card"
        style="--project-art: url('${escapeHTML(project.logo)}')">
        ${projectLogo(project)}
        <div class="summary-copy">
          <strong>${escapeHTML(project.name)}</strong>
          <span>Сервер: ${escapeHTML(state.selectedServer)}</span>
        </div>
        <span class="summary-tag">Покупка</span>
      </div>
      <form class="glass-card form-card form-grid order-form-section" id="buyForm" novalidate>
        ${project.id === "standoff-2" ? "" : `
          <div class="field-group form-field">
            <label for="buyNickname">Игровой ник</label>
            <input class="field-control" id="buyNickname" name="nickname" required maxlength="40"
              autocomplete="off" placeholder="Например, Alex_Walker">
          </div>
        `}
        <div class="dual-inputs">
          <div class="field-group form-field">
            <label for="buyAmount">${wording.amountLabel}</label>
            <div class="amount-wrap">
              <input class="field-control" id="buyAmount" name="amount" type="number" required
                min="${project.amountStep}" step="${project.amountStep}" value="${defaultAmount}">
              <span class="amount-unit">${escapeHTML(project.unit)}</span>
            </div>
          </div>
          <div class="field-group form-field">
            <label for="moneyAmount">Сумма оплаты</label>
            <div class="amount-wrap">
              <input class="field-control" id="moneyAmount" type="number" min="1"
                max="${MAX_ORDER_TOTAL_RUB}" step="1"
                value="${Math.round(price.total)}" inputmode="decimal">
              <span class="amount-unit">₽</span>
            </div>
          </div>
        </div>
        <div class="field-group form-field">
          <div class="quick-row" aria-label="Быстрый выбор количества">
            ${project.quickAmounts.map((amount) => `
              <button class="quick-chip amount-preset ${amount === defaultAmount ? "is-active" : ""}" type="button" data-quick-amount="${amount}">
                ${amount.toLocaleString("ru-RU")} ${escapeHTML(project.unit)}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="price-box order-summary">
          <div class="price-details">
            <span>Стоимость заказа</span>
            <small id="productLabel">Товар: ${escapeHTML(wording.productName)}</small>
            <small id="quantityLabel">Количество: ${defaultAmount.toLocaleString("ru-RU")} ${escapeHTML(project.unit)}</small>
            <small id="rateLabel">${formatUnitPriceLabel(project, price.unitPrice)}</small>
            <small class="price-discount" id="discountLabel"></small>
          </div>
          <strong id="totalPrice">${formatMoney(price.total)}</strong>
        </div>
        <div class="field-group form-field">
          <label for="buyPromo">Промокод</label>
          <input class="field-control" id="buyPromo" name="promo" maxlength="30"
            autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Если есть">
          <p class="promo-status" id="promoStatus"></p>
        </div>
        ${project.id === "standoff-2" ? `
          <div class="inline-note standoff-market-note">
            <span class="inline-note-icon">${icon("info")}</span>
            <span class="standoff-market-copy">
              <strong>Получение через рынок STANDOFF 2</strong>
              <span>
                После оплаты выставьте любой скин с паттерном за
                <b id="standoffListingAmount">${formatGold(calculateStandoffListingPrice(defaultAmount))}</b>.
                Мы купим его, а комиссию рынка 20% полностью оплатит PLATINOV SHOP.
                Оплаченное количество голды вы получите полностью.
              </span>
            </span>
          </div>
        ` : `
          <div class="form-field">
            <span class="field-label">Способ получения</span>
            <div class="segmented" role="group" aria-label="Способ получения">
              <button class="segment-button is-active" type="button" data-delivery="trade">
                <span>Получить трейдом</span>${icon("check", "segment-check")}
              </button>
              <button class="segment-button" type="button" data-delivery="bank">
                <span>Получить банком</span>${icon("check", "segment-check")}
              </button>
            </div>
          </div>
          <div class="field-group form-field is-hidden" id="bankAccountGroup">
            <label for="bankAccount">Номер игрового банковского счёта</label>
            <input class="field-control" id="bankAccount" name="bank_account" maxlength="60"
              autocomplete="off" placeholder="Введите номер счёта">
          </div>
        `}
        <div class="inline-note">
          <span class="inline-note-icon">${icon("shield-check")}</span>
          <span><strong>Данные защищены.</strong> Мы не запрашиваем пароль от игрового аккаунта.</span>
        </div>
        <button class="primary-button order-submit-button" type="submit">
          <span class="payment-button-label">Оплатить ${formatMoney(price.total)}</span>
          <span class="button-arrow">${icon("arrow-right")}</span>
        </button>
      </form>
    </section>
  `;
}

function renderSellForm() {
  const project = getProject();
  if (!project || !state.selectedServer) return renderServerSelection();
  const wording = getTradeWording(project);
  return `
    <section class="screen order-flow order-form-step order-sell-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Продажа</p>
        <h1>${wording.sellAction}</h1>
        <p>Оставьте данные — менеджер уточнит курс и способ расчёта</p>
      </header>
      <div class="glass-card summary-card selected-game-card"
        style="--project-art: url('${escapeHTML(project.logo)}')">
        ${projectLogo(project)}
        <div class="summary-copy">
          <strong>${escapeHTML(project.name)}</strong>
          <span>Сервер: ${escapeHTML(state.selectedServer)}</span>
        </div>
        <span class="summary-tag">Продажа</span>
      </div>
      <form class="glass-card form-card form-grid order-form-section" id="sellForm" novalidate>
        ${project.id === "standoff-2" ? "" : `
          <div class="field-group form-field">
            <label for="sellNickname">Игровой ник</label>
            <input class="field-control" id="sellNickname" name="nickname" required maxlength="40"
              autocomplete="off" placeholder="Ваш ник в игре">
          </div>
        `}
        <div class="field-group form-field">
          <label for="sellAmount">${wording.amountLabel}</label>
          <div class="amount-wrap">
            <input class="field-control" id="sellAmount" name="amount" type="number" required
              min="${project.amountStep}" step="${project.amountStep}" placeholder="0">
            <span class="amount-unit">${escapeHTML(project.unit)}</span>
          </div>
        </div>
        <div class="field-group form-field">
          <label for="sellComment">Комментарий</label>
          <textarea class="field-control" id="sellComment" name="comment" maxlength="300"
            placeholder="Дополнительные детали сделки"></textarea>
        </div>
        <div class="inline-note">
          <span class="inline-note-icon">${icon("info")}</span>
          <span>Финальный курс зависит от объёма и сервера. Менеджер рассчитает его перед сделкой.</span>
        </div>
        <button class="primary-button order-submit-button" type="submit">Написать менеджеру <span class="button-arrow">${icon("arrow-right")}</span></button>
      </form>
    </section>
  `;
}

function normalizeOrder(order) {
  return {
    id: escapeHTML(order.id),
    game: escapeHTML(order.game),
    server: escapeHTML(order.server),
    amount: escapeHTML(order.amount),
    total: escapeHTML(order.total),
    status: escapeHTML(order.status),
    statusClass: escapeHTML(order.statusClass),
    date: escapeHTML(order.date)
  };
}

function orderCard(order) {
  const item = normalizeOrder(order);
  const project = PROJECTS.find((entry) => entry.name === order.game || entry.shortName === order.game);
  return `
    <article class="order-card">
      <div class="order-top">
        <span class="order-id">Заказ #${item.id}</span>
        <span class="status-badge ${item.statusClass}">${item.status}</span>
      </div>
      <div class="order-game-row">
        ${project ? `<img class="order-game-logo" src="${escapeHTML(project.logo)}" alt="" loading="lazy">` : ""}
        <div class="order-game-copy">
          <h3 class="order-title">${item.game}</h3>
          <p class="order-server">Сервер: ${item.server}</p>
        </div>
      </div>
      <div class="order-bottom">
        <span>${item.amount} · ${item.date}</span>
        <strong>${item.total}</strong>
      </div>
    </article>
  `;
}

function renderOrders() {
  const orders = getOrdersForDisplay();
  const paymentNotice = state.paymentReturnNotice
    ? `
      <div class="payment-return-notice is-${escapeHTML(state.paymentReturnNotice.type)}" role="status">
        <span class="payment-return-notice-icon">${icon(
          state.paymentReturnNotice.type === "error" ? "info" : "shield-check"
        )}</span>
        <span>
          <strong>${escapeHTML(state.paymentReturnNotice.title)}</strong>
          <small>${escapeHTML(state.paymentReturnNotice.text)}</small>
        </span>
      </div>
    `
    : "";
  return `
    <section class="screen orders-screen">
      <header class="screen-header orders-hero">
        <p class="eyebrow">История</p>
        <h1>Ваши заказы</h1>
        <p>Актуальные статусы заказов на этом устройстве</p>
      </header>
      ${paymentNotice}
      ${!orders.length ? `
        <div class="glass-card empty-state orders-empty-state">
          <div class="empty-icon">${icon("receipt")}</div>
          <h3>Заказов пока нет</h3>
          <p>Оформите покупку — её данные и статус появятся здесь.</p>
          <button class="primary-button" type="button" data-start-action="buy">Оформить заказ</button>
        </div>
      ` : `<div class="order-list">${orders.map(orderCard).join("")}</div>`}
      <div class="orders-bottom-spacer" aria-hidden="true"></div>
    </section>
  `;
}

function reviewCard(review) {
  const project = getProject(review.projectId);
  const statusClass = review.status === "подтверждён" ? "confirmed" : "";
  return `
    <article class="review-card">
      <div class="review-head">
        <div class="review-user">
          <span class="avatar">${escapeHTML(review.initial)}</span>
          <span class="review-order">
            <strong>${escapeHTML(review.order)}</strong>
            <small><span class="status-badge ${statusClass}">${escapeHTML(review.status)}</span></small>
          </span>
        </div>
        <span class="review-rating">${ratingStars(review.rating)}</span>
      </div>
      <p class="review-text">${escapeHTML(review.text)}</p>
      <div class="review-details">
        <div class="review-detail"><span>Игра</span><strong>${escapeHTML(project?.name || review.projectId)}</strong></div>
        <div class="review-detail"><span>Сервер</span><strong>${escapeHTML(review.server)}</strong></div>
        <div class="review-detail"><span>Заказ</span><strong>${escapeHTML(review.amount)} · ${escapeHTML(review.price)}</strong></div>
        <div class="review-detail"><span>Получение</span><strong>${escapeHTML(review.delivery)} · ${escapeHTML(review.time)}</strong></div>
      </div>
      <div class="review-meta-row">
        <span>${escapeHTML(review.date)}</span>
        <span class="source-badge">${escapeHTML(review.source)}</span>
      </div>
    </article>
  `;
}

function renderReviews() {
  const storedReviews = REVIEWS_API_BASE_URL ? state.apiReviews : getLocalReviews();
  const allReviews = [...storedReviews, ...REVIEWS];
  const visibleReviews = state.reviewFilter === "all"
    ? allReviews
    : allReviews.filter((review) => review.projectId === state.reviewFilter);
  const renderedReviews = visibleReviews.slice(0, state.reviewVisibleCount);
  const remainingReviews = Math.max(0, visibleReviews.length - renderedReviews.length);
  return `
    <section class="screen reviews-screen">
      <div class="glass-card reviews-hero">
        <div>
          <p class="eyebrow">Проверенные сделки</p>
          <h1>Отзывы покупателей</h1>
          <div class="reviews-score"><strong>4.9 из 5</strong>${ratingStars(5)}</div>
          <p class="muted">На основе отзывов из сайта, Telegram и VK</p>
        </div>
        <div class="reviews-actions">
          <button class="primary-button" type="button" data-open-review>Оставить отзыв</button>
          <button class="ghost-button" type="button" data-external="reviews-telegram">Отзывы в Telegram</button>
          <button class="ghost-button" type="button" data-external="reviews-vk">Отзывы во VK</button>
        </div>
      </div>
      <section class="section">
        <div class="filter-row" aria-label="Фильтр отзывов">
          <button class="filter-chip ${state.reviewFilter === "all" ? "is-active" : ""}" type="button" data-review-filter="all">Все</button>
          ${PROJECTS.map((project) => `
            <button class="filter-chip ${state.reviewFilter === project.id ? "is-active" : ""}" type="button"
              data-review-filter="${project.id}">${escapeHTML(project.name)}</button>
          `).join("")}
        </div>
        <div class="review-list section">
          ${renderedReviews.length ? renderedReviews.map(reviewCard).join("") : `
            <div class="glass-card empty-state">
              <div class="empty-icon empty-icon-star">${icon("star", "rating-star")}</div>
              <h3>Пока нет отзывов</h3>
              <p>Станьте первым, кто поделится впечатлением об этом проекте.</p>
              <button class="ghost-button" type="button" data-open-review>Оставить отзыв</button>
            </div>
          `}
        </div>
        ${remainingReviews ? `
          <div class="reviews-pagination">
            <span>Показано ${renderedReviews.length} из ${visibleReviews.length}</span>
            <button class="reviews-more-button" type="button" data-reviews-more>
              Смотреть ещё
              <small>+${Math.min(REVIEWS_PAGE_SIZE, remainingReviews)}</small>
            </button>
          </div>
        ` : ""}
      </section>
    </section>
  `;
}

function getRaffleTickets() {
  return getLocalOrders().length * 2;
}

function renderRaffle() {
  const tickets = getRaffleTickets();
  const raffleParticipation = getStoredJSON("platinov-store-raffle", null);
  const hasJoinedRaffle = Boolean(raffleParticipation?.joined && tickets);
  return `
    <section class="screen raffle-screen">
      <div class="glass-card raffle-hero">
        <span class="raffle-watermark" aria-hidden="true">
          <span class="raffle-ticket-watermark"></span>
          ${icon("gift", "raffle-watermark-gift")}
          ${icon("star", "raffle-watermark-star")}
        </span>
        <div class="raffle-hero-content">
          <p class="eyebrow">Еженедельный приз</p>
          <h1>Розыгрыш недели</h1>
          <span class="prize-label">${icon("gift")}<span>Приз — игровая валюта</span></span>
          <p class="hero-text">Получайте билеты за покупки и участвуйте в розыгрыше.</p>
          <div class="ticket-card">
            <div class="ticket-balance"><span>Ваши билеты</span><strong>${tickets}</strong></div>
            <span class="summary-tag">2 за заказ</span>
          </div>
          <button
            class="primary-button raffle-join-button${hasJoinedRaffle ? " is-joined" : ""}"
            type="button"
            data-raffle-join
            aria-pressed="${hasJoinedRaffle}"
          >
            <span>${hasJoinedRaffle ? "Вы участвуете" : "Участвовать"}</span>
            ${icon(hasJoinedRaffle ? "check" : "arrow-right", "raffle-button-icon")}
          </button>
        </div>
      </div>
      <section class="section raffle-steps-section">
        <div class="section-heading"><h2>Как получить билеты</h2></div>
        <div class="steps-list raffle-steps-panel">
          <article class="step-card"><span class="step-number">1</span><p><strong>Оформите и оплатите заказ</strong> в любой доступной игре.</p></article>
          <article class="step-card"><span class="step-number">2</span><p>После подтверждения сделки <strong>билеты появятся в профиле.</strong></p></article>
          <article class="step-card"><span class="step-number">3</span><p><strong>Нажмите «Участвовать»</strong> до завершения недели.</p></article>
        </div>
      </section>
    </section>
  `;
}

function renderSupport() {
  return `
    <section class="screen support-screen">
      <div class="glass-card support-hero">
        <span class="support-hero-art" aria-hidden="true">
          ${icon("headset", "support-art-headset")}
          ${icon("message-dots", "support-art-message")}
        </span>
        <span class="online-badge">Менеджер на связи</span>
        <h1>Поддержка 24/7</h1>
        <p class="hero-text">Поможем оформить заказ, выбрать способ получения и решить вопрос после оплаты.</p>
        <button class="primary-button" type="button" data-external="support">Написать в Telegram</button>
      </div>
      <section class="section">
        <div class="glass-card legal-card">
          <h3 class="support-order-title">${icon("receipt")}<span>Как оформить заказ?</span></h3>
          <p>Откройте вкладку «Заказ», выберите игру, действие и сервер. Укажите ник, количество валюты и удобный способ получения, затем перейдите к оплате.</p>
          <button class="ghost-button" type="button" data-route="home">Перейти к заказу</button>
        </div>
      </section>
      <section class="section">
        <div class="section-heading"><h2>Частые вопросы</h2></div>
        <div class="faq-list">
          <details class="faq-item"><summary><span>Как быстро выдаёте?</span><span class="faq-chevron">${icon("chevron-down")}</span></summary><p>Обычно выдача занимает несколько минут после подтверждения оплаты. Точное время зависит от игры и сервера.</p></details>
          <details class="faq-item"><summary><span>Можно ли получить банком?</span><span class="faq-chevron">${icon("chevron-down")}</span></summary><p>Да. Выберите «Банком» при оформлении и укажите номер игрового банковского счёта.</p></details>
          <details class="faq-item"><summary><span>Что делать после оплаты?</span><span class="faq-chevron">${icon("chevron-down")}</span></summary><p>Оставайтесь на связи и следуйте инструкции менеджера. Статус заказа можно посмотреть в профиле.</p></details>
          <details class="faq-item"><summary><span>Где посмотреть отзывы?</span><span class="faq-chevron">${icon("chevron-down")}</span></summary><p>Откройте вкладку «Отзывы» в нижнем меню — там доступны подтверждённые отзывы и фильтры по играм.</p></details>
        </div>
      </section>
    </section>
  `;
}

function getTelegramUser() {
  const user = tg?.initDataUnsafe?.user;
  if (user) {
    return {
      name: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь Telegram",
      username: user.username ? `@${user.username}` : "username не указан",
      id: user.id,
      initial: (user.first_name || "T").charAt(0).toLocaleUpperCase("ru"),
      photoUrl: user.photo_url || telegramAvatarObjectUrl || null,
      isAuthenticated: true
    };
  }
  return {
    name: "Гость",
    username: "",
    id: "",
    initial: "Г",
    photoUrl: null,
    isAuthenticated: false
  };
}

function getUserInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || "")
    .join("")
    .toLocaleUpperCase("ru");
}

function getHeaderProfileData() {
  const siteUser = window.PLATINOV_SITE_USER || null;
  const telegramUser = tg?.initDataUnsafe?.user || null;
  const siteName = siteUser?.name || [siteUser?.firstName, siteUser?.lastName].filter(Boolean).join(" ");
  const telegramName = telegramUser
    ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ")
    : "";
  const name = siteName || telegramName || "";
  const photoUrl =
    siteUser?.avatarUrl ||
    telegramUser?.photo_url ||
    telegramAvatarObjectUrl ||
    null;

  return {
    photoUrl,
    initials: getUserInitials(name),
    isAuthenticated: Boolean(siteUser || telegramUser)
  };
}

function renderHeaderProfile() {
  const visual = document.getElementById("headerProfileVisual");
  const button = document.getElementById("headerProfileButton");
  if (!visual || !button) return;

  const profile = getHeaderProfileData();
  const renderFallback = () => {
    visual.className = "header-profile-visual header-profile-fallback";
    visual.innerHTML = profile.initials
      ? `<span class="header-profile-initials">${escapeHTML(profile.initials)}</span>`
      : icon("user", "header-profile-icon");
  };

  button.setAttribute(
    "aria-label",
    profile.isAuthenticated ? "Открыть профиль" : "Открыть страницу профиля"
  );

  if (!profile.photoUrl) {
    renderFallback();
    return;
  }

  const image = document.createElement("img");
  image.className = "header-profile-avatar";
  image.alt = "";
  image.decoding = "async";
  image.addEventListener("error", renderFallback, { once: true });
  visual.className = "header-profile-visual";
  visual.replaceChildren(image);
  image.src = profile.photoUrl;
}

function renderProfile() {
  const user = getTelegramUser();
  const profileAvatar = user.photoUrl
    ? `
      <span class="avatar profile-user-avatar">
        <span class="profile-avatar-fallback">${escapeHTML(user.initial)}</span>
        <img
          class="profile-avatar-image"
          data-profile-avatar
          src="${escapeHTML(user.photoUrl)}"
          alt=""
          decoding="async"
          referrerpolicy="no-referrer"
        >
      </span>
    `
    : `<span class="avatar profile-user-avatar">${escapeHTML(user.initial)}</span>`;
  const orders = getLocalOrders();
  const purchaseTotal = orders.reduce((sum, order) => {
    if (Number.isFinite(order.totalValue)) return sum + order.totalValue;
    return sum + (Number(String(order.total || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0);
  }, 0);
  return `
    <section class="screen profile-screen">
      <header class="screen-header">
        <p class="eyebrow">${icon("user")} Аккаунт</p>
        <h1>Профиль</h1>
        <p>Ваши данные и быстрый доступ к сервису</p>
      </header>
      <div class="glass-card profile-card ${user.isAuthenticated ? "" : "profile-auth-card"}">
        ${user.isAuthenticated ? `
          <div class="profile-main">
            ${profileAvatar}
            <div class="profile-copy">
              <h2>${escapeHTML(user.name)}</h2>
              <p>${escapeHTML(user.username)}</p>
              <span class="profile-id">ID: ${escapeHTML(user.id)}</span>
            </div>
          </div>
        ` : `
          <div class="profile-auth-prompt">
            <span class="profile-auth-icon">${icon("user")}</span>
            <div class="profile-auth-copy">
              <h2>Авторизуйтесь через Telegram</h2>
              <p>Откройте mini-app в Telegram, чтобы загрузить ваш профиль.</p>
            </div>
            <button class="primary-button profile-auth-button" type="button" data-external="telegram-auth">
              <span>Авторизоваться через Telegram</span>
              ${icon("arrow-up-right")}
            </button>
          </div>
        `}
      </div>
      <div class="stats-grid">
        <div class="glass-card stat-card stat-card-bonus">
          <span class="stat-icon">${icon("badge-ruble")}</span>
          <span class="stat-label">Бонусный баланс</span>
          <strong>0 ₽</strong>
        </div>
        <div class="glass-card stat-card stat-card-orders">
          <span class="stat-icon">${icon("receipt")}</span>
          <span class="stat-label">Всего заказов</span>
          <strong>${orders.length}</strong>
        </div>
        <div class="glass-card stat-card stat-card-total">
          <span class="stat-icon">${icon("shopping-bag")}</span>
          <span class="stat-label">Сумма покупок</span>
          <strong>${formatMoney(purchaseTotal)}</strong>
        </div>
      </div>
      <div class="profile-menu">
        <button class="select-card" type="button" data-route="orders">
          <span class="select-icon">${icon("receipt")}</span>
          <span class="select-copy"><strong>История заказов</strong><small>Покупки и их статусы</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        <button class="select-card" type="button" data-copy-referral>
          <span class="select-icon">${icon("arrow-up-right")}</span>
          <span class="select-copy"><strong>Реферальная ссылка</strong><small>Скопировать ссылку-приглашение</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        <button class="select-card" type="button" data-external="support">
          <span class="select-icon">${icon("headset")}</span>
          <span class="select-copy"><strong>Поддержка</strong><small>Задать вопрос менеджеру</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        <button class="select-card" type="button" data-open-resources>
          <span class="select-icon">${icon("arrow-up-right")}</span>
          <span class="select-copy"><strong>Наши ресурсы</strong><small>Магазины и официальный канал</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        <button class="select-card" type="button" data-route="info">
          <span class="select-icon">${icon("info")}</span>
          <span class="select-copy"><strong>О сервисе и условия</strong><small>Доставка, возврат и документы</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
      </div>
    </section>
  `;
}

function openResourcesModal() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet resources-modal" role="dialog" aria-modal="true" aria-labelledby="resourcesModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="resourcesModalTitle">Наши ресурсы</h2>
          </div>
          <button class="close-button" type="button" data-close-modal aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="resources-modal-list">
          <button class="info-document-button resource-link-button" type="button" data-resource-network="telegram" data-resource-url="${TELEGRAM_BUY_URL}">
            <span class="info-document-icon">${socialLogo("telegram")}</span>
            <span class="info-document-copy"><strong>Купить вирты</strong><small>Telegram канал</small></span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </button>
          <button class="info-document-button resource-link-button" type="button" data-resource-network="vk" data-resource-url="${VK_BUY_URL}">
            <span class="info-document-icon">${socialLogo("vk")}</span>
            <span class="info-document-copy"><strong>Купить вирты</strong><small>Сообщество VK</small></span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </button>
          <button class="info-document-button resource-link-button" type="button" data-resource-network="vk" data-resource-url="${VK_SELL_URL}">
            <span class="info-document-icon">${socialLogo("vk")}</span>
            <span class="info-document-copy"><strong>Продать вирты</strong><small>Сообщество VK</small></span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderInfo() {
  return `
    <section class="screen info-screen">
      <article class="info-orb-card">
        <div class="info-orb-copy">
          <p class="eyebrow">Документы</p>
          <h1>О сервисе</h1>
          <p>Юридические документы PLATINOV SHOP.</p>
        </div>

        <div class="info-document-list" aria-label="Документы сервиса">
          <a
            class="info-document-button"
            href="${siteAsset("PLATINOV_Privacy_Policy_2026-07-28_v3.pdf?v=175")}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="info-document-icon">${icon("shield-check")}</span>
            <span class="info-document-copy">
              <strong>Политика конфиденциальности</strong>
              <small>Открыть PDF</small>
            </span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </a>

          <a
            class="info-document-button"
            href="${siteAsset("PLATINOV_User_Agreement_2026-07-28_v3.pdf?v=175")}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="info-document-icon">${icon("receipt")}</span>
            <span class="info-document-copy">
              <strong>Пользовательское соглашение</strong>
              <small>Открыть PDF</small>
            </span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </a>
        </div>
      </article>
    </section>
  `;
}

function openReviewModal() {
  state.reviewRating = 5;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="reviewModalTitle">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Ваш опыт</p>
            <h2 id="reviewModalTitle">Оставить отзыв</h2>
          </div>
          <button class="close-button" type="button" data-close-modal aria-label="Закрыть">${icon("x")}</button>
        </div>
        <form class="form-grid" id="reviewForm" novalidate>
          <div class="field-group">
            <label for="reviewProject">Игра</label>
            <select class="field-control" id="reviewProject" name="projectId" required>
              ${PROJECTS.map((project) => `<option value="${project.id}">${escapeHTML(project.name)}</option>`).join("")}
            </select>
          </div>
          <div>
            <span class="field-label">Оценка</span>
            <div class="rating-picker" role="group" aria-label="Оценка от 1 до 5">
              ${[1, 2, 3, 4, 5].map((rating) => `
                <button class="rating-button ${rating <= state.reviewRating ? "is-active" : ""}"
                  type="button" data-rating="${rating}" aria-label="${rating} из 5">${icon("star", "rating-star")}</button>
              `).join("")}
            </div>
          </div>
          <div class="field-group">
            <label for="reviewText">Текст отзыва</label>
            <textarea class="field-control" id="reviewText" name="text" required minlength="3" maxlength="500"
              placeholder="Расскажите, как всё прошло"></textarea>
          </div>
          <div class="field-group">
            <label for="reviewDelivery">Способ получения</label>
            <select class="field-control" id="reviewDelivery" name="delivery" required>
              <option value="Трейд">Трейд</option>
              <option value="Банк">Банк</option>
            </select>
          </div>
          <button class="primary-button" type="submit">Отправить отзыв</button>
        </form>
      </section>
    </div>
  `;
  modalRoot.querySelector("textarea")?.focus();
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function render() {
  if (!SELLING_ENABLED) {
    if (state.preferredAction === "sell") state.preferredAction = null;
    if (state.action === "sell") state.action = null;
    state.history = state.history.filter((route) => route !== "sell");
    if (state.route === "sell") {
      state.route = state.selectedProjectId ? "action" : "home";
    }
  }
  const renderers = {
    home: renderHome,
    projects: renderProjectSelection,
    action: renderActionSelection,
    servers: renderServerSelection,
    buy: renderPurchaseForm,
    sell: renderSellForm,
    orders: renderOrders,
    reviews: renderReviews,
    raffle: renderRaffle,
    support: renderSupport,
    profile: renderProfile,
    info: renderInfo
  };
  app.innerHTML = (renderers[state.route] || renderHome)();
  setActiveNav(state.route);
  syncTelegramBackButton();
  saveNavigationSession();
}

app.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches("[data-profile-avatar]")) {
      image.remove();
    }
  },
  true
);

function startAction(action) {
  if (action === "sell") {
    if (!SELLING_ENABLED) {
      showToast("Продажа временно недоступна");
      return;
    }
    openExternal(SUPPORT_URL);
    return;
  }
  state.preferredAction = action;
  state.action = null;
  state.selectedProjectId = null;
  state.selectedServer = null;
  state.serverSearch = "";
  navigate("projects");
}

function chooseProject(projectId) {
  state.selectedProjectId = projectId;
  state.selectedServer = null;
  state.action = null;
  state.serverSearch = "";
  if (state.preferredAction) {
    chooseAction(state.preferredAction);
    return;
  }
  navigate("action");
}

function chooseAction(action) {
  if (action === "sell") {
    if (!SELLING_ENABLED) {
      showToast("Продажа временно недоступна");
      return;
    }
    openExternal(SUPPORT_URL);
    return;
  }
  state.action = action;
  state.serverSearch = "";
  const project = getProject();
  if (project && !requiresServerSelection(project)) {
    state.selectedServer = project.servers[0] || project.name;
    state.deliveryType = "trade";
    navigate(action === "sell" ? "sell" : "buy");
    return;
  }
  navigate("servers");
}

function chooseServer(server) {
  state.selectedServer = server;
  state.deliveryType = "trade";
  navigate(state.action === "sell" ? "sell" : "buy");
}

function invalidatePromoQuote() {
  promoQuoteSequence += 1;
  window.clearTimeout(promoQuoteTimer);
  promoQuoteTimer = 0;
}

function schedulePromoQuote(project, amount, promoCode) {
  invalidatePromoQuote();
  const normalizedCode = String(promoCode).trim().toUpperCase();
  if (!normalizedCode || !project || !Number.isFinite(amount) || amount <= 0) return;

  const promoStatus = document.getElementById("promoStatus");
  if (!tg?.initData) {
    if (promoStatus) {
      promoStatus.textContent = "Проверка промокода доступна при открытии через Telegram";
      promoStatus.className = "promo-status is-warning";
    }
    return;
  }

  const requestId = promoQuoteSequence;
  if (promoStatus) {
    promoStatus.textContent = "Проверяем промокод…";
    promoStatus.className = "promo-status";
  }
  promoQuoteTimer = window.setTimeout(() => {
    void requestPromoQuote(project, amount, normalizedCode, requestId);
  }, 420);
}

async function requestPromoQuote(project, amount, promoCode, requestId) {
  try {
    const response = await apiRequest("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: project.name,
        amount_kk: Number(amount.toFixed(2)),
        promo: promoCode
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Ошибка сервера: ${response.status}`);
    }

    const currentPromo = document.getElementById("buyPromo")?.value.trim().toUpperCase();
    const currentAmount = Number(document.getElementById("buyAmount")?.value);
    if (
      requestId !== promoQuoteSequence ||
      currentPromo !== promoCode ||
      Math.abs(currentAmount - amount) > 0.0001
    ) {
      return;
    }

    const total = Number(data.amount_rub);
    const discount = Number(data.discount_rub);
    const promoPercent = Number(data.promo_percent);
    const unitPrice = Number(data.unit_price_rub);
    if (![total, discount, promoPercent, unitPrice].every(Number.isFinite)) {
      throw new Error("Сервер вернул некорректный расчёт");
    }

    const moneyInput = document.getElementById("moneyAmount");
    const totalNode = document.getElementById("totalPrice");
    const rateNode = document.getElementById("rateLabel");
    const discountNode = document.getElementById("discountLabel");
    const promoStatus = document.getElementById("promoStatus");

    if (moneyInput) moneyInput.value = Math.round(total);
    if (totalNode) totalNode.textContent = formatMoney(total);
    updatePurchaseSummary(project, amount, total);
    if (rateNode) rateNode.textContent = formatUnitPriceLabel(project, unitPrice);
    if (discountNode) {
      discountNode.textContent = data.promo_valid && discount > 0
        ? `Скидка ${promoPercent}%: −${formatMoney(discount)}`
        : "";
      discountNode.classList.toggle("is-visible", data.promo_valid && discount > 0);
    }
    if (promoStatus) {
      promoStatus.textContent = data.promo_valid
        ? `Промокод активирован: скидка ${promoPercent}%`
        : "Промокод не найден — заказ будет без скидки";
      promoStatus.className = data.promo_valid
        ? "promo-status is-success"
        : "promo-status is-warning";
    }
  } catch (error) {
    if (requestId !== promoQuoteSequence) return;
    const promoStatus = document.getElementById("promoStatus");
    if (promoStatus) {
      promoStatus.textContent = "Не удалось проверить промокод. Попробуйте ещё раз";
      promoStatus.className = "promo-status is-warning";
    }
    console.error(error);
  }
}

function updatePrice() {
  const input = document.getElementById("buyAmount");
  const moneyInput = document.getElementById("moneyAmount");
  const promoInput = document.getElementById("buyPromo");
  const project = getProject();
  if (!input || !project) return;
  let amount = Number(input.value);
  const promoCode = promoInput?.value || "";
  let price = calculatePrice(project, amount);
  if (price.total > MAX_ORDER_TOTAL_RUB) {
    amount = getMaxOrderAmount(project);
    input.value = Number(amount.toFixed(2)).toString();
    price = calculatePrice(project, amount);
  }
  const totalNode = document.getElementById("totalPrice");
  const rateNode = document.getElementById("rateLabel");
  const discountNode = document.getElementById("discountLabel");
  const promoStatus = document.getElementById("promoStatus");
  if (moneyInput) {
    moneyInput.value = price.total > 0 ? Math.round(price.total) : "";
    moneyInput.setCustomValidity("");
  }
  if (totalNode) totalNode.textContent = formatMoney(price.total);
  updatePurchaseSummary(project, amount, price.total);
  if (rateNode) {
    rateNode.textContent = formatUnitPriceLabel(project, price.unitPrice);
  }
  if (discountNode) {
    discountNode.textContent = "";
    discountNode.classList.remove("is-visible");
  }
  if (promoStatus) {
    const normalizedCode = promoCode.trim().toUpperCase();
    promoStatus.className = "promo-status";
    if (!normalizedCode) {
      promoStatus.textContent = "";
    }
  }
  schedulePromoQuote(project, amount, promoCode);
  document.querySelectorAll("[data-quick-amount]").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.quickAmount) === amount);
  });
}

function updateAmountFromMoney() {
  const amountInput = document.getElementById("buyAmount");
  const moneyInput = document.getElementById("moneyAmount");
  const promoInput = document.getElementById("buyPromo");
  const project = getProject();
  if (!amountInput || !moneyInput || !project) return;
  const enteredMoney = Number(moneyInput.value);
  const money = Math.min(MAX_ORDER_TOTAL_RUB, Math.max(0, enteredMoney));
  if (enteredMoney > MAX_ORDER_TOTAL_RUB) {
    moneyInput.value = String(MAX_ORDER_TOTAL_RUB);
  }
  moneyInput.setCustomValidity("");
  const amount = calculateAmountFromMoney(project, money);
  amountInput.value = amount > 0 ? Number(amount.toFixed(2)).toString() : "";
  const price = calculatePrice(project, amount);
  const totalNode = document.getElementById("totalPrice");
  const rateNode = document.getElementById("rateLabel");
  const discountNode = document.getElementById("discountLabel");
  if (totalNode) totalNode.textContent = formatMoney(money);
  updatePurchaseSummary(project, amount, money);
  if (rateNode) {
    rateNode.textContent = formatUnitPriceLabel(project, price.unitPrice);
  }
  if (discountNode) {
    discountNode.textContent = "";
    discountNode.classList.remove("is-visible");
  }
  schedulePromoQuote(project, amount, promoInput?.value || "");
  document.querySelectorAll("[data-quick-amount]").forEach((button) => {
    button.classList.remove("is-active");
  });
}

function validateForm(form) {
  if (form.checkValidity()) return true;
  form.reportValidity();
  haptic("medium");
  return false;
}

function openPaymentPlaceholder(project, amount, total) {
  const wording = getTradeWording(project);
  const serverLabel = getOrderServerLabel(project, state.selectedServer);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet payment-placeholder-modal" role="dialog" aria-modal="true" aria-labelledby="paymentPlaceholderTitle">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Проверка заказа</p>
            <h2 id="paymentPlaceholderTitle">Оплата временно недоступна</h2>
          </div>
          <button class="close-button" type="button" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="payment-placeholder-summary" aria-label="Состав заказа">
          <div>
            <span>Товар</span>
            <div class="payment-placeholder-product">
              <strong>${escapeHTML(wording.productName)} · ${escapeHTML(project.name)}</strong>
              <small>${escapeHTML(wording.productDefinition)}</small>
            </div>
          </div>
          ${project.id === "standoff-2" ? "" : `<div><span>Сервер</span><strong>${escapeHTML(serverLabel)}</strong></div>`}
          <div><span>Количество</span><strong>${Number(amount).toLocaleString("ru-RU")} ${escapeHTML(project.unit)}</strong></div>
          <div><span>Цена</span><strong>${escapeHTML(formatRateLabel(project, calculatePrice(project, amount).unitPrice))}</strong></div>
          <div class="payment-placeholder-total"><span>К оплате</span><strong>${formatMoney(total)}</strong></div>
        </div>
        <div class="inline-note payment-placeholder-note">
          <span class="inline-note-icon">${icon("info")}</span>
          <span>Это демонстрационная кнопка. После подключения API здесь откроется защищённая платёжная форма.</span>
        </div>
        <button class="primary-button payment-placeholder-close" type="button">Понятно</button>
      </section>
    </div>
  `;
  modalRoot.querySelector(".payment-placeholder-close")?.focus();
}

async function submitPurchase(form) {
  if (!validateForm(form)) return;
  const project = getProject();
  const isStandoff = project.id === "standoff-2";
  const amount = Number(form.elements.amount.value);
  const promoCode = form.elements.promo.value.trim().toUpperCase();
  const price = calculatePrice(project, amount);
  if (price.total > MAX_ORDER_TOTAL_RUB) {
    const moneyInput = document.getElementById("moneyAmount");
    moneyInput?.setCustomValidity("Максимальная сумма заказа — 250 000 ₽");
    moneyInput?.reportValidity();
    haptic("medium");
    return;
  }
  const payload = {
    game: project.name,
    server: getOrderServerLabel(project, state.selectedServer),
    nickname: form.elements.nickname?.value.trim() || "",
    promo: promoCode,
    amount_kk: Number(amount.toFixed(2)),
    delivery_type: isStandoff
      ? "Трейдом"
      : state.deliveryType === "bank" ? "Банком" : "Трейдом",
    bank_account: !isStandoff && state.deliveryType === "bank"
      ? form.elements.bank_account.value.trim()
      : ""
  };

  if (!isStandoff && state.deliveryType === "bank" && !payload.bank_account) {
    form.elements.bank_account.setCustomValidity("Укажите номер игрового счёта");
    form.elements.bank_account.reportValidity();
    form.elements.bank_account.addEventListener("input", () => {
      form.elements.bank_account.setCustomValidity("");
    }, { once: true });
    return;
  }
  if (!isStandoff && state.deliveryType === "bank" && !/^\d+$/.test(payload.bank_account)) {
    form.elements.bank_account.setCustomValidity("Номер счёта должен состоять только из цифр");
    form.elements.bank_account.reportValidity();
    form.elements.bank_account.addEventListener("input", () => {
      form.elements.bank_account.setCustomValidity("");
    }, { once: true });
    return;
  }

  if (PAYMENT_PLACEHOLDER_ENABLED) {
    const displayedTotal = Number(document.getElementById("moneyAmount")?.value);
    const placeholderTotal = Number.isFinite(displayedTotal) && displayedTotal > 0
      ? Math.min(MAX_ORDER_TOTAL_RUB, displayedTotal)
      : price.total;
    haptic("medium");
    openPaymentPlaceholder(project, amount, placeholderTotal);
    return;
  }

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Создаём заказ…";

  try {
    let paymentUrl = "";
    let createdOrder = null;
    if (API_BASE_URL) {
      const response = await apiRequest("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Ошибка сервера: ${response.status}`);
      }
      createdOrder = data;
      paymentUrl = data.payment_url || "";
    } else if (tg?.sendData && tg.initData) {
      tg.sendData(JSON.stringify(payload));
    }

    const confirmedTotal = Number(createdOrder?.amount_rub);
    const orderTotal = Number.isFinite(confirmedTotal)
      ? confirmedTotal
      : price.total;
    const orders = getLocalOrders();
    orders.unshift({
      id: createdOrder?.order_id || Math.random().toString(16).slice(2, 6).toUpperCase(),
      game: project.name,
      server: state.selectedServer,
      amount: `${amount.toLocaleString("ru-RU")} ${project.unit}`,
      total: formatMoney(orderTotal),
      totalValue: orderTotal,
      status: "Ожидает оплаты",
      statusClass: "waiting",
      date: new Date().toLocaleDateString("ru-RU")
    });
    setStoredJSON("alexey-store-orders", orders);
    haptic("medium");
    if (paymentUrl) {
      state.history = [];
      state.paymentReturnNotice = {
        type: "pending",
        title: "Ожидаем оплату",
        text: "После оплаты вы вернётесь в этот раздел, а статус обновит сервер."
      };
      navigate("orders", { replace: true });
      showToast("Заказ сохранён — открываем оплату");
      openPaymentPage(paymentUrl);
    } else {
      showToast("Заказ создан и готов к оплате");
      state.history = [];
      navigate("orders", { replace: true });
    }
  } catch (error) {
    console.error(error);
    showToast(`Не удалось создать заказ: ${error.message}`);
    submitButton.disabled = false;
    submitButton.innerHTML = `<span class="payment-button-label">Оплатить ${formatMoney(price.total)}</span><span class="button-arrow">${icon("arrow-right")}</span>`;
  }
}

function submitSale(form) {
  if (!validateForm(form)) return;
  const project = getProject();
  const wording = getTradeWording(project);
  const nickname = form.elements.nickname?.value.trim() || "";
  const amount = Number(form.elements.amount.value);
  const comment = form.elements.comment.value.trim();
  const message = [
    wording.sellMessage,
    `Игра: ${project.name}`,
    `Сервер: ${state.selectedServer}`,
    ...(nickname ? [`Ник: ${nickname}`] : []),
    `Количество: ${amount.toLocaleString("ru-RU")} ${project.unit}`,
    `Комментарий: ${comment || "—"}`
  ].join("\n");
  const managerUrl = `${SELL_MANAGER_URL}?text=${encodeURIComponent(message)}`;
  haptic("medium");
  openExternal(managerUrl);
}

async function submitReview(form) {
  if (!validateForm(form)) return;
  const formData = new FormData(form);
  const project = getProject(formData.get("projectId"));
  const review = {
    id: `local-${Date.now()}`,
    initial: getTelegramUser().initial,
    order: `Отзыв #${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    status: "ожидает проверки",
    rating: state.reviewRating,
    text: formData.get("text").trim(),
    projectId: formData.get("projectId"),
    server: "Не указан",
    amount: "—",
    price: "—",
    delivery: formData.get("delivery"),
    time: "—",
    date: new Date().toLocaleDateString("ru-RU"),
    source: "Сайт"
  };
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = "Отправляем…";

  try {
    if (REVIEWS_API_BASE_URL) {
      const response = await apiRequest(REVIEW_ENDPOINTS.create, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: project.name,
          rating: review.rating,
          text: review.text,
          delivery_type: review.delivery
        })
      });
      const createdReview = await response.json().catch(() => ({}));
      if (!response.ok || !createdReview.ok) {
        throw new Error(createdReview.error || `Review request failed: ${response.status}`);
      }
    } else {
      const reviews = getLocalReviews();
      reviews.unshift(review);
      setStoredJSON("alexey-store-reviews", reviews);
    }
    closeModal();
    state.reviewFilter = "all";
    state.reviewVisibleCount = REVIEWS_PAGE_SIZE;
    render();
    haptic("medium");
    showToast(`Спасибо! Отзыв о ${project.name} ожидает проверки`);
  } catch (error) {
    console.error(error);
    submitButton.disabled = false;
    submitButton.textContent = "Отправить отзыв";
    showToast("Не удалось отправить отзыв. Попробуйте ещё раз");
  }
}

async function loadRemoteReviews() {
  if (!REVIEWS_API_BASE_URL) return;
  try {
    const response = await fetch(`${REVIEWS_API_BASE_URL.replace(/\/$/, "")}${REVIEW_ENDPOINTS.list}`);
    if (!response.ok) throw new Error(`Reviews request failed: ${response.status}`);
    const data = await response.json();
    state.apiReviews = Array.isArray(data) ? data : (data.reviews || []);
    if (state.route === "reviews") render();
  } catch (error) {
    console.error(error);
  }
}

async function loadRemoteOrders() {
  if (!API_BASE_URL || remoteOrdersLoading || (!tg?.initData && !apiAccessToken)) return;
  remoteOrdersLoading = true;
  try {
    const response = await apiRequest("/api/orders");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.orders)) {
      throw new Error(data.error || `Orders request failed: ${response.status}`);
    }
    state.apiOrders = data.orders;
    if (state.route === "orders") render();
  } catch (error) {
    console.error("Orders load error", error);
  } finally {
    remoteOrdersLoading = false;
  }
}

document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");
  if (routeButton) {
    const route = routeButton.dataset.route;
    if (["home", "reviews", "raffle", "support", "profile"].includes(route)) {
      state.history = [];
      navigate(route, { replace: true });
    } else {
      navigate(route);
    }
    haptic();
    return;
  }

  const startButton = event.target.closest("[data-start-action]");
  if (startButton) {
    startAction(startButton.dataset.startAction);
    haptic();
    return;
  }

  if (event.target.closest("[data-add-project]")) {
    showToast("Новые проекты появятся в следующих обновлениях");
    haptic();
    return;
  }

  if (event.target.closest("[data-raffle-join]")) {
    showToast("Функция в разработке");
    haptic("medium");
    return;
  }

  const projectButton = event.target.closest("[data-project]");
  if (projectButton) {
    state.preferredAction = projectButton.dataset.context === "home" ? null : state.preferredAction;
    chooseProject(projectButton.dataset.project);
    haptic();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    chooseAction(actionButton.dataset.action);
    haptic();
    return;
  }

  const serverButton = event.target.closest("[data-server]");
  if (serverButton) {
    chooseServer(serverButton.dataset.server);
    haptic();
    return;
  }

  const quickButton = event.target.closest("[data-quick-amount]");
  if (quickButton) {
    const amountInput = document.getElementById("buyAmount");
    amountInput.value = quickButton.dataset.quickAmount;
    state.lastEdited = "virtual";
    updatePrice();
    haptic();
    return;
  }

  const deliveryButton = event.target.closest("[data-delivery]");
  if (deliveryButton) {
    state.deliveryType = deliveryButton.dataset.delivery;
    document.querySelectorAll("[data-delivery]").forEach((button) => {
      button.classList.toggle("is-active", button === deliveryButton);
    });
    const accountGroup = document.getElementById("bankAccountGroup");
    const accountInput = document.getElementById("bankAccount");
    const useBank = state.deliveryType === "bank";
    accountGroup?.classList.toggle("is-hidden", !useBank);
    if (accountInput) accountInput.required = useBank;
    haptic();
    return;
  }

  const filterButton = event.target.closest("[data-review-filter]");
  if (filterButton) {
    state.reviewFilter = filterButton.dataset.reviewFilter;
    state.reviewVisibleCount = REVIEWS_PAGE_SIZE;
    render();
    haptic();
    return;
  }

  if (event.target.closest("[data-reviews-more]")) {
    state.reviewVisibleCount += REVIEWS_PAGE_SIZE;
    render();
    haptic();
    return;
  }

  if (event.target.closest("[data-open-review]")) {
    openExternal(REVIEWS_VK_URL);
    haptic();
    return;
  }

  if (event.target.closest("[data-open-resources]")) {
    openResourcesModal();
    haptic();
    return;
  }

  const externalButton = event.target.closest("[data-external]");
  if (externalButton) {
    const urls = {
      support: SUPPORT_URL,
      "telegram-auth": TELEGRAM_AUTH_URL,
      "reviews-telegram": REVIEWS_TELEGRAM_URL,
      "reviews-vk": REVIEWS_VK_URL
    };
    openExternal(urls[externalButton.dataset.external]);
    haptic();
    return;
  }

  if (event.target.closest("[data-copy-referral]")) {
    const user = getTelegramUser();
    if (!user.isAuthenticated) {
      openExternal(TELEGRAM_AUTH_URL);
      showToast("Откройте mini-app через Telegram");
      haptic();
      return;
    }
    const referral = `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(user.id)}`;
    navigator.clipboard?.writeText(referral)
      .then(() => showToast("Реферальная ссылка скопирована"))
      .catch(() => showToast("Ссылка: " + referral));
    haptic();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "buyAmount") {
    state.lastEdited = "virtual";
    updatePrice();
  }
  if (event.target.id === "moneyAmount") {
    state.lastEdited = "money";
    updateAmountFromMoney();
  }
  if (event.target.id === "buyPromo") updatePrice();
  if (event.target.id === "bankAccount") {
    event.target.value = event.target.value.replace(/\D/g, "");
  }
  if (event.target.id === "serverSearch") {
    state.serverSearch = event.target.value;
    const selectionStart = event.target.selectionStart;
    render();
    const search = document.getElementById("serverSearch");
    search?.focus();
    search?.setSelectionRange(selectionStart, selectionStart);
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "buyForm") submitPurchase(event.target);
  if (event.target.id === "sellForm") submitSale(event.target);
});

modalRoot.addEventListener("click", (event) => {
  if (
    event.target.matches(".modal-backdrop") ||
    event.target.closest(".close-button") ||
    event.target.closest(".payment-placeholder-close")
  ) {
    closeModal();
    return;
  }
  const resourceButton = event.target.closest("[data-resource-url]");
  if (resourceButton) {
    openExternal(resourceButton.dataset.resourceUrl);
    haptic();
    return;
  }
  const ratingButton = event.target.closest("[data-rating]");
  if (ratingButton) {
    state.reviewRating = Number(ratingButton.dataset.rating);
    modalRoot.querySelectorAll("[data-rating]").forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.rating) <= state.reviewRating);
    });
    haptic();
  }
});

modalRoot.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "reviewForm") submitReview(event.target);
});

backButton.addEventListener("click", goBack);
tg?.BackButton?.onClick(goBack);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalRoot.innerHTML) closeModal();
});

function initializeTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (tg.isVersionAtLeast?.("7.7")) tg.disableVerticalSwipes?.();
  try {
    tg.setHeaderColor("#2A9FF0");
    tg.setBackgroundColor("#2A9FF0");
    tg.setBottomBarColor?.("#235FD8");
  } catch {
    // Older Telegram versions may not support color setters.
  }
}

async function checkAccess() {
  if (!API_BASE_URL || !tg?.initData) return;
  try {
    const response = await apiRequest("/api/access", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Access check failed: ${response.status}`);
    if (data.allowed === false) {
      document.body.innerHTML = `
        <main class="app-shell">
          <section class="screen app-content">
            <div class="glass-card empty-state">
              <div class="empty-icon">${icon("info")}</div>
              <h1>Ведутся технические работы</h1>
              <p>${escapeHTML(data.message || ACCESS_RESTRICTED_TEXT)}</p>
              <a class="primary-button" href="${SUPPORT_URL}">Написать в поддержку</a>
            </div>
          </section>
        </main>
      `;
    }
  } catch (error) {
    console.error("Access check error", error);
  }
}

initializeTelegram();
restoreNavigationSession();
applyPaymentReturnRoute();
renderHeaderProfile();
render();
hydrateTelegramAvatar();
loadRemoteReviews();
if (state.route === "orders") loadRemoteOrders();
checkAccess();

window.addEventListener?.("pagehide", saveNavigationSession);
