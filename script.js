"use strict";

const API_BASE_URL = "https://api.platinov.com";
const REVIEWS_API_BASE_URL = API_BASE_URL;
let SUPPORT_URL = "https://t.me/PlatinovSupport";
const TELEGRAM_AUTH_URL = "https://t.me/PlatinovBot?startapp=profile";
let SELL_MANAGER_URL = SUPPORT_URL;
let SELL_BOT_URL = "https://t.me/PlatinovSellBot";
let REVIEWS_TELEGRAM_URL = "https://t.me/+TZeEFqDDYyhkOTEy";
let REVIEWS_VK_URL = "https://vk.ru/wall866011657_25";
let VK_BUY_URL = "https://vk.ru/platinov_shop";
let VK_SELL_URL = "https://vk.ru/platinov_sell";
let TELEGRAM_BUY_URL = "https://t.me/platinov_shop";
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
let activityLoading = false;
let moscowRefreshTimer = 0;
let reactionClaimTimer = 0;
let reactionClaimInFlight = false;
let pendingReactionClaimDue = 0;
let reviewsLoadSequence = 0;
let lastAnimatedRoute = "";
const REACTION_CLAIM_DUE_STORAGE_KEY_PREFIX = "platinov-reaction-claim-due-v3";
const REPOST_POST_OPEN_STORAGE_KEY_PREFIX = "platinov-repost-post-open-v1";
const TELEGRAM_AVATAR_PALETTES = [
  ["#e56f6f", "#c94f62"],
  ["#f2a04b", "#e47735"],
  ["#a987e8", "#8066cc"],
  ["#65c466", "#42a956"],
  ["#5ca8df", "#3d83c5"],
  ["#e477ad", "#c95291"],
  ["#56c3c7", "#389da7"]
];

function getReferralVisitorKey() {
  const storageKey = "platinov-referral-visitor-v1";
  try {
    let value = localStorage.getItem(storageKey) || "";
    if (!value) {
      value = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(storageKey, value);
    }
    return value;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function getReferralId() {
  const url = new URL(window.location.href);
  const startParam = String(
    tg?.initDataUnsafe?.start_param ||
    url.searchParams.get("tgWebAppStartParam") ||
    url.searchParams.get("ref") ||
    ""
  );
  const match = startParam.match(/^(?:ref[_-])?(\d{1,20})$/i);
  return match ? Number(match[1]) : 0;
}

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
    body: JSON.stringify({
      referrer_id: getReferralId() || null,
      visitor_key: getReferralVisitorKey()
    })
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
  if (telegramAvatarObjectUrl) return telegramAvatarObjectUrl;
  if (!API_BASE_URL || !tg?.initData) return directPhotoUrl;
  if (telegramAvatarLoadPromise) return telegramAvatarLoadPromise;

  telegramAvatarLoadPromise = (async () => {
    const response = await apiRequest("/api/profile/avatar");
    if (response.status === 404) return directPhotoUrl;
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
      return directPhotoUrl;
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
    defaultAmount: 1,
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
    defaultAmount: 1,
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
    defaultAmount: 1,
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

// Reviews are published only by the backend after moderation.
const REVIEWS = [];

const state = {
  route: "home",
  history: [],
  selectedProjectId: null,
  preferredAction: null,
  action: null,
  selectedServer: null,
  deliveryType: "bank",
  reviewFilter: "all",
  reviewPage: 0,
  reviewsHasMore: false,
  reviewsLoading: false,
  reviewsError: "",
  reviewRating: 5,
  serverSearch: "",
  apiReviews: [],
  apiOrders: null,
  activity: null,
  activityError: "",
  paymentReturnNotice: null,
  paymentReturnRequest: null,
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

const PUBLIC_ROUTE_PATHS = Object.freeze({
  home: "/",
  profile: "/profile",
  orders: "/orders",
  reviews: "/reviews",
  support: "/support",
  raffle: "/giveaway"
});

const TELEGRAM_START_ROUTES = Object.freeze({
  home: "home",
  shop: "home",
  profile: "profile",
  orders: "orders",
  reviews: "reviews",
  support: "support",
  giveaway: "raffle",
  giveaway_info: "raffle",
  giveawayinfo: "raffle",
  raffle: "raffle"
});

const PUBLIC_PATH_ROUTES = new Map(
  Object.entries(PUBLIC_ROUTE_PATHS).map(([route, pathname]) => [pathname, route])
);

const ROUTE_TITLES = Object.freeze({
  home: "PLATINOV SHOP",
  profile: "Профиль — PLATINOV SHOP",
  orders: "Заказы — PLATINOV SHOP",
  reviews: "Отзывы — PLATINOV SHOP",
  support: "Поддержка — PLATINOV SHOP",
  raffle: "Розыгрыш — PLATINOV SHOP"
});

const app = document.getElementById("app");
const backButton = document.getElementById("backButton");
const modalRoot = document.getElementById("modalRoot");
const toastRegion = document.getElementById("toastRegion");
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
let modalLockedScrollY = 0;

function syncModalScrollLock() {
  const shouldLock = Boolean(modalRoot.firstElementChild);
  const isLocked = document.body.classList.contains("is-modal-open");

  if (shouldLock && !isLocked) {
    modalLockedScrollY = window.scrollY;
    document.documentElement.classList.add("is-modal-open");
    document.body.classList.add("is-modal-open");
    document.body.style.top = `-${modalLockedScrollY}px`;
    return;
  }

  if (!shouldLock && isLocked) {
    document.documentElement.classList.remove("is-modal-open");
    document.body.classList.remove("is-modal-open");
    document.body.style.top = "";
    window.scrollTo(0, modalLockedScrollY);
  }
}

new MutationObserver(syncModalScrollLock).observe(modalRoot, { childList: true });

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

function normalizePublicPath(pathname = window.location.pathname) {
  let normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (normalized === "/index.html") return "/";
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, "");
  return normalized || "/";
}

function getPublicRouteFromLocation() {
  return PUBLIC_PATH_ROUTES.get(normalizePublicPath()) || null;
}

function getPublicPathForRoute(route) {
  if (route === "info") return PUBLIC_ROUTE_PATHS.profile;
  return PUBLIC_ROUTE_PATHS[route] || "/";
}

function updateRouteTitle(route) {
  document.title = ROUTE_TITLES[route] || ROUTE_TITLES.home;
}

function syncBrowserRoute(route, mode = "push") {
  const pathname = getPublicPathForRoute(route);
  const currentPathname = normalizePublicPath();
  const statePayload = { platinovRoute: route };
  const targetUrl = `${pathname}${window.location.search}${window.location.hash}`;

  updateRouteTitle(route);

  if (mode === "none") return;
  if (mode === "replace" || pathname === currentPathname) {
    window.history.replaceState(statePayload, "", targetUrl);
    return;
  }
  window.history.pushState(statePayload, "", targetUrl);
}

function applyRouteFromLocation(historyState = null) {
  const pathnameRoute = getPublicRouteFromLocation();
  const savedRoute = historyState && RESTORABLE_ROUTES.has(historyState.platinovRoute)
    ? historyState.platinovRoute
    : null;
  const route = normalizePublicPath() === "/"
    ? savedRoute || "home"
    : pathnameRoute || "home";

  state.history = [];
  state.route = route;
  updateRouteTitle(route);
  render();
  if (route === "orders" || route === "profile") loadRemoteOrders();
  if (route === "raffle") loadActivity();
  window.scrollTo({ top: 0, behavior: "auto" });
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
    // Bank delivery is the product default, including sessions saved before
    // the delivery-method redesign.
    state.deliveryType = "bank";
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
  const returnedOrderId = String(url.searchParams.get("order") || "").trim().toUpperCase();
  const returnToken = String(url.searchParams.get("return_token") || "").trim();
  const shouldOpenOrders = requestedScreen === "orders" ||
    startParam.startsWith("payment_") ||
    ["success", "paid", "return", "failed", "cancelled"].includes(paymentResult);

  if (!shouldOpenOrders) {
    const requestedStartRoute = TELEGRAM_START_ROUTES[requestedScreen] ||
      TELEGRAM_START_ROUTES[startParam] ||
      null;
    if (requestedStartRoute) {
      state.route = requestedStartRoute;
      state.history = [];
      url.searchParams.delete("screen");
      url.searchParams.delete("tgWebAppStartParam");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
    return;
  }

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
  if (returnedOrderId && returnToken) {
    state.paymentReturnRequest = {
      orderId: returnedOrderId,
      token: returnToken
    };
  }
  state.paymentReturnNotice = noticeByResult[resolvedResult] || {
    type: "pending",
    title: "Ваш заказ сохранён",
    text: "Актуальный статус заказа отображается в этом разделе."
  };

  ["screen", "payment", "order", "return_token", "tgWebAppStartParam"].forEach((name) => {
    url.searchParams.delete(name);
  });
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function reconcilePaymentReturn() {
  const pendingReturn = state.paymentReturnRequest;
  if (!API_BASE_URL || !pendingReturn) return;
  state.paymentReturnRequest = null;
  try {
    const query = new URLSearchParams({
      order: pendingReturn.orderId,
      token: pendingReturn.token
    });
    const response = await fetch(
      `${API_BASE_URL.replace(/\/$/, "")}/api/payments/platega/return-status?${query}`,
      { cache: "no-store" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.order) {
      throw new Error(data.error || `Payment status request failed: ${response.status}`);
    }
    const order = data.order;
    const currentOrders = Array.isArray(state.apiOrders) ? state.apiOrders : [];
    state.apiOrders = [
      order,
      ...currentOrders.filter((item) => item.public_id !== order.public_id)
    ];
    if (["paid", "processing", "completed"].includes(order.status)) {
      state.paymentReturnNotice = {
        type: "success",
        title: `Оплата заказа #${order.public_id} подтверждена`,
        text: "Заказ принят и передан сотрудникам. Его актуальный статус показан ниже."
      };
    } else if (["cancelled", "chargebacked"].includes(order.status)) {
      state.paymentReturnNotice = {
        type: "error",
        title: "Оплата не завершена",
        text: `Статус заказа #${order.public_id} обновлён платёжной системой.`
      };
    } else {
      state.paymentReturnNotice = {
        type: "pending",
        title: "Платёж ещё проверяется",
        text: `Заказ #${order.public_id} сохранён. Статус обновится после подтверждения Platega.`
      };
    }
  } catch (error) {
    console.error("Payment return reconciliation error", error);
    state.paymentReturnNotice = {
      type: "error",
      title: "Не удалось проверить оплату",
      text: "Заказ сохранён. Откройте его через Telegram или обратитесь в поддержку."
    };
  }
  if (state.route === "orders") render();
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
    cancelled: ["Отменён", "cancelled"],
    chargebacked: ["Возврат платежа", "cancelled"]
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

function isTelegramWebClient() {
  const platform = String(tg?.platform || "").trim().toLowerCase();
  return platform === "web" || platform === "weba" || platform === "webk";
}

function preparePaymentWindow() {
  // Telegram Web isolates a pre-opened about:blank tab and may block the later
  // cross-origin redirect. Its native openLink API is used after order creation.
  if (!tg?.initData || isTelegramWebClient()) return null;
  try {
    const paymentWindow = window.open("about:blank", "_blank");
    if (!paymentWindow) return null;
    paymentWindow.document.title = "PLATINOV SHOP — оплата";
    paymentWindow.document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;margin:0;padding:24px;box-sizing:border-box;background:#0b2e53;color:#fff;font-family:Arial,sans-serif;text-align:center">
        <div>
          <div style="width:38px;height:38px;margin:0 auto 18px;border:3px solid rgba(255,255,255,.22);border-top-color:#35aef2;border-radius:50%;animation:platinov-payment-spin .8s linear infinite"></div>
          <strong style="display:block;font-size:18px;line-height:1.3">Подготавливаем безопасную оплату</strong>
          <span style="display:block;margin-top:8px;color:rgba(255,255,255,.72);font-size:14px">Окно Platega откроется автоматически</span>
        </div>
      </main>
      <style>@keyframes platinov-payment-spin{to{transform:rotate(360deg)}}body{margin:0}</style>
    `;
    paymentWindow.opener = null;
    return paymentWindow;
  } catch {
    return null;
  }
}

function closePreparedPaymentWindow(paymentWindow) {
  try {
    if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
  } catch {
    // The browser may revoke access after moving the tab to another process.
  }
}

function openPaymentPage(url, paymentWindow = null) {
  if (isTelegramWebClient() && tg?.openLink) {
    try {
      tg.openLink(url, { try_instant_view: false });
      return;
    } catch {
      // Fall through to ordinary browser navigation if the client API fails.
    }
  }
  if (paymentWindow && !paymentWindow.closed) {
    try {
      paymentWindow.location.replace(url);
      return;
    } catch {
      // Fall through to Telegram's external-link API.
    }
  }
  if (tg?.openLink) {
    tg.openLink(url, { try_instant_view: false });
    return;
  }
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

let bottomNavFlowTimer = 0;
let bottomNavSettleTimer = 0;
let bottomNavFlowFrame = 0;

function setActiveNav(route) {
  const mainRoute = ["home", "reviews", "raffle", "support", "profile"].includes(route)
    ? route
    : "";
  const bottomNav = document.querySelector(".bottom-nav");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const activeIndex = navItems.findIndex((button) => button.dataset.route === mainRoute);

  navItems.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === mainRoute);
  });

  if (!bottomNav) return;

  const previousIndex = Number.parseInt(bottomNav.dataset.activeIndex || "", 10);

  if (activeIndex < 0) {
    window.clearTimeout(bottomNavFlowTimer);
    window.clearTimeout(bottomNavSettleTimer);
    window.cancelAnimationFrame(bottomNavFlowFrame);
    bottomNav.classList.remove("is-flowing", "is-flowing-left", "is-flowing-right");
    bottomNav.classList.add("is-indicator-hidden");
    return;
  }

  bottomNav.classList.remove("is-indicator-hidden");

  if (previousIndex === activeIndex) {
    bottomNav.style.setProperty("--nav-indicator-offset", `${activeIndex * 100}%`);
    return;
  }

  window.clearTimeout(bottomNavFlowTimer);
  window.clearTimeout(bottomNavSettleTimer);
  window.cancelAnimationFrame(bottomNavFlowFrame);
  bottomNav.classList.remove("is-flowing", "is-flowing-left", "is-flowing-right");

  const canFlow =
    bottomNav.classList.contains("is-indicator-ready") &&
    Number.isFinite(previousIndex) &&
    previousIndex !== activeIndex &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  bottomNav.dataset.activeIndex = String(activeIndex);

  if (canFlow) {
    bottomNav.classList.add(
      "is-flowing",
      activeIndex > previousIndex ? "is-flowing-right" : "is-flowing-left"
    );
    const indicator = bottomNav.querySelector(".nav-liquid-indicator");
    if (indicator) window.getComputedStyle(indicator).transform;
    bottomNavFlowFrame = window.requestAnimationFrame(() => {
      bottomNav.style.setProperty("--nav-indicator-offset", `${activeIndex * 100}%`);
    });
    bottomNavSettleTimer = window.setTimeout(() => {
      bottomNav.classList.remove("is-flowing");
    }, 190);
    bottomNavFlowTimer = window.setTimeout(() => {
      bottomNav.classList.remove("is-flowing-left", "is-flowing-right");
    }, 390);
    return;
  }

  bottomNav.style.setProperty("--nav-indicator-offset", `${activeIndex * 100}%`);
  window.requestAnimationFrame(() => bottomNav.classList.add("is-indicator-ready"));
}

function navigate(route, options = {}) {
  const { replace = false, preserveScroll = false, urlMode = "push" } = options;
  if (!replace && state.route !== route) state.history.push(state.route);
  state.route = route;
  syncBrowserRoute(route, urlMode);
  render();
  if (route === "orders" || route === "profile") loadRemoteOrders();
  if (route === "raffle") loadActivity();
  if (!preserveScroll) scrollPageToTop();
}

function goBack() {
  if (!state.history.length) {
    navigate("home", { replace: true });
    return;
  }
  const previousRoute = state.history[state.history.length - 1];
  if (getPublicPathForRoute(previousRoute) !== normalizePublicPath()) {
    window.history.back();
    return;
  }
  state.route = state.history.pop();
  syncBrowserRoute(state.route, "replace");
  render();
  scrollPageToTop();
}

function prefersInstantMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.innerWidth <= 900;
}

function scrollPageToTop() {
  window.scrollTo({
    top: 0,
    behavior: prefersInstantMotion() ? "auto" : "smooth"
  });
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
  if (project.id === "matreshka-rp") state.deliveryType = "bank";
  const wording = getTradeWording(project);
  const defaultAmount = project.defaultAmount ?? project.quickAmounts[0];
  const price = calculatePrice(project, defaultAmount);
  const deliveryOptions = [
    {
      id: "bank",
      iconName: "landmark",
      title: "Банком",
      description: "Через игровой банковский счёт. Быстрая выдача"
    },
    ...(project.id === "matreshka-rp" ? [] : [{
      id: "trade",
      iconName: "arrow-left-right",
      title: "Трейдом",
      description: "Передача напрямую при встрече. Время выдачи заказа дольше."
    }])
  ];
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
        ${project.id === "standoff-2" ? "" : `
          <p class="amount-speed-note">
            ${icon("clock")}
            <span>От 3кк выдача быстрее</span>
          </p>
        `}
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
          <div class="promo-status" id="promoStatus"></div>
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
          <div class="form-field delivery-method-field">
            <span class="field-label">Как получить вирты?</span>
            <div class="delivery-methods" role="radiogroup" aria-label="Способ получения">
              ${deliveryOptions.map((option) => {
                const active = state.deliveryType === option.id;
                return `
                  <button
                    class="delivery-method${active ? " is-active" : ""}"
                    type="button"
                    role="radio"
                    aria-checked="${active}"
                    data-delivery="${option.id}"
                    data-delivery-description="${escapeHTML(option.description)}"
                  >
                    <span class="delivery-method-visual" aria-hidden="true">
                      ${icon(option.iconName, "delivery-method-icon")}
                    </span>
                    <span class="delivery-method-copy">
                      <strong>${option.title}</strong>
                    </span>
                    <span class="delivery-method-state" aria-hidden="true">
                      ${active ? icon("check") : ""}
                    </span>
                  </button>
                `;
              }).join("")}
            </div>
            <p class="delivery-method-help" id="deliveryMethodHelp">
              ${deliveryOptions.find((option) => option.id === state.deliveryType)?.description || ""}
            </p>
          </div>
          <div class="field-group form-field${state.deliveryType === "bank" ? "" : " is-hidden"}" id="bankAccountGroup">
            <label for="bankAccount">Номер игрового банковского счёта</label>
            <input class="field-control" id="bankAccount" name="bank_account" maxlength="60"
              autocomplete="off" placeholder="Введите номер счёта"${state.deliveryType === "bank" ? " required" : ""}>
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
  const visibleSource = review.source === "Администратор" ? "" : review.source;
  return `
    <article class="review-card">
      <div class="review-head">
        <div class="review-user">
          <span class="avatar review-avatar telegram-avatar-fallback${telegramAvatarInitialClass(review.initial)}" style="${telegramAvatarStyle(review.userId || review.order)}">
            <span>${escapeHTML(review.initial)}</span>
            ${review.photoUrl ? `<img data-avatar-image src="${escapeHTML(review.photoUrl)}" alt="" loading="lazy" decoding="async">` : ""}
          </span>
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
        ${visibleSource ? `<span class="source-badge">${escapeHTML(visibleSource)}</span>` : ""}
      </div>
    </article>
  `;
}

function renderReviews() {
  const usingRemoteReviews = Boolean(REVIEWS_API_BASE_URL);
  const localReviews = usingRemoteReviews ? [] : [...getLocalReviews(), ...REVIEWS];
  const filteredLocalReviews = state.reviewFilter === "all"
    ? localReviews
    : localReviews.filter((review) => review.projectId === state.reviewFilter);
  const localPageStart = state.reviewPage * REVIEWS_PAGE_SIZE;
  const renderedReviews = usingRemoteReviews
    ? state.apiReviews
    : filteredLocalReviews.slice(localPageStart, localPageStart + REVIEWS_PAGE_SIZE);
  const hasPreviousPage = state.reviewPage > 0;
  const hasNextPage = usingRemoteReviews
    ? state.reviewsHasMore
    : localPageStart + REVIEWS_PAGE_SIZE < filteredLocalReviews.length;
  const hasPagination = hasPreviousPage || hasNextPage;
  return `
    <section class="screen reviews-screen">
      <div class="glass-card reviews-hero">
        <div>
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
        <div class="review-list section" id="reviews-page-list" aria-busy="${state.reviewsLoading ? "true" : "false"}">
          ${state.reviewsLoading ? `
            <div class="reviews-page-state" role="status">
              <span class="reviews-page-loader" aria-hidden="true"></span>
              <strong>Загружаем отзывы</strong>
            </div>
          ` : renderedReviews.length ? renderedReviews.map(reviewCard).join("") : `
            <div class="glass-card empty-state">
              <div class="empty-icon empty-icon-star">${icon("star", "rating-star")}</div>
              <h3>${state.reviewsError ? "Не удалось загрузить отзывы" : "Пока нет отзывов"}</h3>
              <p>${escapeHTML(state.reviewsError || "Станьте первым, кто поделится впечатлением об этом проекте.")}</p>
              <button class="ghost-button" type="button" data-open-review>Оставить отзыв</button>
            </div>
          `}
        </div>
        ${hasPagination && !state.reviewsLoading ? `
          <div class="reviews-pagination" aria-label="Страницы отзывов">
            <button class="reviews-page-button" type="button" data-reviews-page="-1" ${hasPreviousPage ? "" : "disabled"}>
              Назад
            </button>
            <span>Страница ${state.reviewPage + 1}</span>
            <button class="reviews-page-button" type="button" data-reviews-page="1" ${hasNextPage ? "" : "disabled"}>
              Далее
            </button>
          </div>
        ` : ""}
      </section>
    </section>
  `;
}

function activityCountdown(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  return `${days} д ${hours} ч`;
}

function activityDayWord(value = 0) {
  const number = Math.abs(Number(value) || 0);
  const lastTwo = number % 100;
  const last = number % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function activityInitials(name) {
  return getUserInitials(name) || "P";
}

function activityAvatar(player) {
  const fallbackText = activityInitials(player.display_name);
  const fallback = escapeHTML(fallbackText);
  const fallbackClass = telegramAvatarInitialClass(fallbackText);
  const fallbackStyle = telegramAvatarStyle(player.user_id || player.display_name);
  if (!player.photo_url) {
    return `<span class="activity-avatar telegram-avatar-fallback${fallbackClass}" style="${fallbackStyle}"><span>${fallback}</span></span>`;
  }
  return `
    <span class="activity-avatar telegram-avatar-fallback${fallbackClass}" style="${fallbackStyle}">
      <span>${fallback}</span>
      <img data-avatar-image src="${escapeHTML(player.photo_url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
    </span>
  `;
}

function activityTaskCard({ iconName, title, text, points, status, action = "", copyAddon = "", complete = false, progress = null }) {
  const progressCurrent = Math.max(0, Number(progress?.current) || 0);
  const progressTotal = Math.max(1, Number(progress?.total) || 1);
  const progressPercent = Math.min(100, Math.round((progressCurrent / progressTotal) * 100));
  const taskAction = progress
    ? `
      <span class="activity-task-progress" style="--activity-task-progress:${progressPercent}%">
        <strong>${escapeHTML(progressCurrent)} / ${escapeHTML(progressTotal)}</strong>
        <span class="activity-task-progress-track"><i></i></span>
      </span>
    `
    : action || `<span class="activity-task-status${complete ? " is-complete" : ""}">${escapeHTML(status)}</span>`;
  return `
    <article class="activity-task-card">
      <span class="activity-task-icon">${icon(iconName)}</span>
      <span class="activity-task-copy">
        <strong>${escapeHTML(title)}</strong>
        <span class="activity-task-subline"><small>${escapeHTML(text)}</small>${copyAddon}</span>
      </span>
      <span class="activity-task-points">+${escapeHTML(points)}</span>
      ${taskAction}
    </article>
  `;
}

function activityLeaderboardRow(player, prizes, currentUserId) {
  const prize = prizes.find((item) => Number(item.rank) === Number(player.rank));
  const isCurrent = String(player.user_id) === String(currentUserId);
  const medalClass = player.rank <= 3 ? ` is-medal is-rank-${player.rank}` : "";
  const visibleUsername = Number(player.rank) <= 10 ? String(player.username || "").trim() : "";
  return `
    <article class="activity-leader-row${medalClass}${isCurrent ? " is-current" : ""}">
      <span class="activity-rank">${player.rank}</span>
      ${activityAvatar(player)}
      <span class="activity-player-copy">
        <strong>${escapeHTML(player.display_name)}</strong>
        ${visibleUsername ? `<small>${escapeHTML(visibleUsername)}</small>` : ""}
      </span>
      <strong class="activity-player-points">${Number(player.points).toLocaleString("ru-RU")}</strong>
      ${prize ? `<span class="activity-prize"><small>Приз</small><strong>${escapeHTML(prize.label)}</strong></span>` : ""}
    </article>
  `;
}

function activityPreviewRow(player, prizes) {
  const prize = prizes.find((item) => Number(item.rank) === Number(player.rank));
  return `
    <article class="activity-preview-row">
      <span class="activity-preview-rank">${player.rank}</span>
      ${activityAvatar(player)}
      <span class="activity-preview-player">
        <strong>${escapeHTML(player.display_name)}</strong>
        <small>${Number(player.points).toLocaleString("ru-RU")} баллов</small>
      </span>
      ${prize ? `<strong class="activity-preview-prize">${icon("gift")}<span>${escapeHTML(prize.label)}</span></strong>` : ""}
    </article>
  `;
}

function activityRepostStorageKey(task = {}) {
  const userId = Number(tg?.initDataUnsafe?.user?.id || 0);
  const claimKey = String(task.claim_key || "current");
  return `${REPOST_POST_OPEN_STORAGE_KEY_PREFIX}:${userId}:${claimKey}`;
}

function hasOpenedActivityRepost(task = {}) {
  if (task.opened === true) return true;
  try {
    return window.localStorage.getItem(activityRepostStorageKey(task)) === "1";
  } catch {
    return false;
  }
}

function markActivityRepostOpened(task = {}) {
  task.opened = true;
  try {
    window.localStorage.setItem(activityRepostStorageKey(task), "1");
  } catch {
    // The current render still changes even if Telegram WebView blocks storage.
  }
}

function renderRaffle() {
  const user = getTelegramUser();
  const activity = state.activity;

  if (!user.isAuthenticated) {
    return `
      <section class="screen raffle-screen activity-screen">
        <div class="glass-card activity-auth-card">
          <span class="activity-auth-icon">${icon("gift")}</span>
          <h1>Войдите через Telegram</h1>
          <p>Баллы, задания и место в рейтинге привязаны к вашему Telegram-аккаунту.</p>
          <button class="primary-button" type="button" data-external="telegram-auth">Открыть в Telegram</button>
        </div>
      </section>
    `;
  }

  if (!activity) {
    return `
      <section class="screen raffle-screen activity-screen">
        <div class="glass-card activity-loading-card">
          <span class="activity-loader" aria-hidden="true"></span>
          <h2>${state.activityError ? "Не удалось загрузить рейтинг" : "Загружаем Лигу PLATINOV"}</h2>
          <p>${escapeHTML(state.activityError || "Считаем баллы и обновляем места участников.")}</p>
          ${state.activityError ? `<button class="ghost-button" type="button" data-activity-reload>Повторить</button>` : ""}
        </div>
      </section>
    `;
  }

  const current = activity.current_user || {
    user_id: user.id,
    display_name: user.name,
    username: user.username,
    points: 0,
    rank: "—"
  };
  const tasks = activity.tasks || {};
  const prizes = activity.prizes || [];
  const channelUrl = activity.main_channel?.url || TELEGRAM_BUY_URL;
  const sponsorTasks = Array.isArray(tasks.sponsors) ? tasks.sponsors : [];
  const leaderboard = Array.isArray(activity.leaderboard) ? activity.leaderboard : [];
  const previewLeaders = [leaderboard[1], leaderboard[0], leaderboard[2]].filter(Boolean);
  const streakDays = Math.max(0, Number(activity.streak || 0));
  const repostTask = tasks.daily_repost || {};
  const repostPostUrl = String(repostTask.post_url || "").trim();
  const repostPostOpened = hasOpenedActivityRepost(repostTask);

  return `
    <section class="screen raffle-screen activity-screen">
      <div class="glass-card activity-hero">
        <span class="activity-hero-orb" aria-hidden="true">${icon("star")}</span>
        <div class="activity-hero-copy">
          <h1>Топ активности</h1>
          <p>Выполняйте задания, набирайте баллы и забирайте призы в рейтинге каждые 14 дней.</p>
          <button class="activity-info-button" type="button" data-open-giveaway-info>
            ${icon("info")}<span>Подробнее о розыгрыше</span>${icon("chevron-right")}
          </button>
        </div>
        <div class="activity-user-summary">
          <div class="activity-summary-item is-points">
            <span class="activity-summary-icon">${icon("star")}</span>
            <strong class="activity-summary-value">${Number(current.points || 0).toLocaleString("ru-RU")}</strong>
            <span class="activity-summary-label">баллов</span>
          </div>
          <div class="activity-summary-item is-rank">
            <span class="activity-summary-icon">${icon("trophy")}</span>
            <strong class="activity-summary-value">${escapeHTML(current.rank ?? "—")}</strong>
            <span class="activity-summary-label">место</span>
          </div>
          <div class="activity-summary-item is-time">
            <span class="activity-summary-icon">${icon("clock")}</span>
            <strong class="activity-summary-value">${activityCountdown(activity.season?.seconds_left)}</strong>
            <span class="activity-summary-label">до конца</span>
          </div>
          <div class="activity-summary-item is-streak">
            <span class="activity-summary-icon">${icon("flame")}</span>
            <span class="activity-summary-label">Серия</span>
            <strong class="activity-summary-value">${streakDays} ${activityDayWord(streakDays)}</strong>
          </div>
        </div>
      </div>

      <section class="activity-top-preview" aria-labelledby="activity-preview-title">
        <div class="activity-preview-heading">
          <h2 id="activity-preview-title">Лидеры розыгрыша</h2>
          <button class="activity-full-list-button" type="button" data-activity-scroll-leaderboard>
            Полный список <span aria-hidden="true">→</span>
          </button>
        </div>
        <div class="glass-card activity-preview-card">
          ${previewLeaders.length ? previewLeaders.map((player) =>
            activityPreviewRow(player, prizes)
          ).join("") : `
            <div class="activity-preview-empty">Выполните задание и станьте первым участником</div>
          `}
        </div>
      </section>

      <section class="section activity-tasks-section">
        <div class="section-heading activity-section-heading">
          <div><h2>Задания</h2></div>
        </div>
        <div class="activity-task-list">
          ${activityTaskCard({
            iconName: "clock",
            title: "Ежедневный вход",
            text: "Начисляется автоматически раз в сутки",
            points: tasks.daily_login?.points || 100,
            status: "Получено",
            complete: true
          })}
          ${activityTaskCard({
            iconName: "star",
            title: "Серия входов 7 дней",
            text: `${Number(tasks.seven_day_streak?.progress || 0)} из 7 дней подряд`,
            points: tasks.seven_day_streak?.points || 300,
            progress: {
              current: Number(tasks.seven_day_streak?.progress || 0),
              total: 7
            }
          })}
          ${activityTaskCard({
            iconName: "message-square",
            title: "Комментарий под последним постом",
            text: "Не более одного комментария на публикацию",
            points: tasks.comment?.points || 300,
            action: tasks.comment?.claimed
              ? `<span class="activity-task-status is-complete">Получено</span>`
              : `<button class="activity-task-button" type="button" data-activity-open="${escapeHTML(channelUrl)}">К посту</button>`
          })}
          ${activityTaskCard({
            iconName: "star",
            title: "Реакция на публикацию",
            text: "Баллы начислятся через 10 секунд после открытия",
            points: tasks.reaction?.points || 100,
            action: tasks.reaction?.claimed
              ? `<span class="activity-task-status is-complete">Получено</span>`
              : `<button class="activity-task-button" type="button" data-activity-reaction="${escapeHTML(channelUrl)}">Открыть</button>`
          })}
          ${activityTaskCard({
            iconName: "arrow-up-right",
            title: "Репост минимум в 10 чатов",
            text: "Одно начисление в сутки по вашей отметке",
            points: repostTask.points || 300,
            action: repostTask.claimed
              ? `<span class="activity-task-status is-complete">Получено</span>`
              : !repostPostUrl
                ? `<button class="activity-task-button" type="button" disabled>Пост не задан</button>`
                : repostPostOpened
                  ? `<button class="activity-task-button" type="button" data-activity-claim="repost">Проверить</button>`
                  : `<button class="activity-task-button" type="button" data-activity-repost-open="${escapeHTML(repostPostUrl)}">К посту</button>`
          })}
          ${activityTaskCard({
            iconName: "user",
            title: "Пригласить активного пользователя",
            text: `${Number(activity.referrals?.active || 0)} активных из ${Number(activity.referrals?.invited || 0)} приглашённых`,
            points: tasks.referral?.points || 200,
            copyAddon: `<button class="activity-referral-info-button" type="button" data-active-referral-info aria-label="Как пользователь становится активным">${icon("info")}</button>`,
            action: `<button class="activity-task-button" type="button" data-copy-activity-referral>Ссылка</button>`
          })}
        </div>
      </section>

      <section class="section activity-sponsors-section">
        <div class="section-heading activity-section-heading">
          <div><h2>Каналы спонсоров</h2></div>
        </div>
        <div class="activity-sponsor-list">
          ${sponsorTasks.length ? sponsorTasks.map((sponsor) => `
            <article class="activity-sponsor-card">
              <span class="activity-sponsor-logo">${icon("message-square")}</span>
              <span><strong>${escapeHTML(sponsor.title)}</strong><small>Подписка на канал</small></span>
              <button class="activity-sponsor-open" type="button" data-activity-open="${escapeHTML(sponsor.url)}">Открыть</button>
              <button class="activity-sponsor-check${sponsor.claimed ? " is-complete" : ""}" type="button"
                data-activity-sponsor="${escapeHTML(sponsor.id)}" ${sponsor.claimed ? "disabled" : ""}>
                ${sponsor.claimed ? "Получено" : `Проверить +${Number(sponsor.points || 500)}`}
              </button>
            </article>
          `).join("") : `
            <div class="glass-card activity-empty-sponsors">
              <span>${icon("info")}</span>
              <div><strong>Новых заданий пока нет</strong><p>Каналы спонсоров появятся здесь отдельными карточками.</p></div>
            </div>
          `}
        </div>
      </section>

      <section class="section activity-leaderboard-section" id="activity-full-leaderboard">
        <div class="section-heading activity-section-heading">
          <div><h2>Рейтинг розыгрыша</h2></div>
          <span class="activity-top-prize">${icon("gift")} 10 призов</span>
        </div>
        <div class="activity-leaderboard glass-card">
          <div class="activity-leader-head"><span>Место и участник</span><span>Баллы</span><span>Награда</span></div>
          ${leaderboard.length ? leaderboard.map((player) =>
            activityLeaderboardRow(player, prizes, current.user_id)
          ).join("") : `
            <div class="activity-empty-board">
              <strong>Рейтинг только начинается</strong>
              <p>Выполните первое задание и займите верхнюю строчку.</p>
            </div>
          `}
        </div>
        ${current.rank > 100 ? `
          <div class="activity-current-outside glass-card">
            <span>Ваше текущее место</span>
            ${activityLeaderboardRow(current, prizes, current.user_id)}
          </div>
        ` : ""}
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
      photoUrl: telegramAvatarObjectUrl || user.photo_url || null,
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

function telegramAvatarPaletteIndex(seed) {
  const value = String(seed ?? "telegram-user");
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % TELEGRAM_AVATAR_PALETTES.length;
}

function telegramAvatarStyle(seed) {
  const [start, end] = TELEGRAM_AVATAR_PALETTES[telegramAvatarPaletteIndex(seed)];
  return `--telegram-avatar-start:${start};--telegram-avatar-end:${end}`;
}

function telegramAvatarInitialClass(initials) {
  return Array.from(String(initials ?? "").trim()).length > 1
    ? " telegram-avatar-multi"
    : "";
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
    telegramAvatarObjectUrl ||
    telegramUser?.photo_url ||
    null;

  return {
    photoUrl,
    initials: getUserInitials(name),
    userId: siteUser?.id || telegramUser?.id || "",
    isAuthenticated: Boolean(siteUser || telegramUser)
  };
}

function renderHeaderProfile() {
  const visual = document.getElementById("headerProfileVisual");
  const button = document.getElementById("headerProfileButton");
  if (!visual || !button) return;

  const profile = getHeaderProfileData();
  const renderFallback = () => {
    visual.className = `header-profile-visual header-profile-fallback telegram-avatar-fallback${telegramAvatarInitialClass(profile.initials)}`;
    visual.style.cssText = telegramAvatarStyle(profile.userId || profile.initials);
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
  visual.style.cssText = "";
  visual.replaceChildren(image);
  image.src = profile.photoUrl;
}

function renderProfile() {
  const user = getTelegramUser();
  const profileAvatar = `
    <span class="avatar profile-user-avatar telegram-avatar-fallback${telegramAvatarInitialClass(user.initial)}" style="${telegramAvatarStyle(user.id || user.name)}">
      <span class="profile-avatar-fallback">${escapeHTML(user.initial)}</span>
      ${user.photoUrl ? `
        <img
          class="profile-avatar-image"
          data-profile-avatar
          src="${escapeHTML(user.photoUrl)}"
          alt=""
          decoding="async"
          referrerpolicy="no-referrer"
        >
      ` : ""}
    </span>
  `;
  const orders = getOrdersForDisplay();
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

function openGiveawayInfoModal() {
  const prizes = Array.isArray(state.activity?.prizes) ? state.activity.prizes : [];
  const orderedPrizes = [...prizes]
    .filter((prize) => Number(prize.rank) >= 1 && Number(prize.rank) <= 10)
    .sort((left, right) => Number(left.rank) - Number(right.rank));

  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet giveaway-info-modal" role="dialog" aria-modal="true" aria-labelledby="giveawayInfoModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="giveawayInfoModalTitle">О розыгрыше</h2>
            <p>Баллы за активность превращаются в место в рейтинге.</p>
          </div>
          <button class="close-button" type="button" data-close-modal aria-label="Закрыть">${icon("x")}</button>
        </div>

        <div class="giveaway-info-list">
          <article class="giveaway-info-item">
            <span class="giveaway-info-icon">${icon("clock")}</span>
            <div><strong>Новый розыгрыш каждые 14 дней</strong><p>После окончания периода баллы обнуляются, а начинается новый рейтинг.</p></div>
          </article>
          <article class="giveaway-info-item">
            <span class="giveaway-info-icon">${icon("star")}</span>
            <div><strong>Выполняйте ежедневные задания</strong><p>Баллы активности начисляются за задания в разделе «Розыгрыш» и определяют место участника в рейтинге.</p></div>
          </article>
          <article class="giveaway-info-item">
            <span class="giveaway-info-icon">${icon("message-square")}</span>
            <div><strong>Подписывайтесь на каналы спонсоров</strong><p>Каждая подписка в блоке «Каналы спонсоров» — отдельное задание. Откройте канал, подпишитесь, затем вернитесь в приложение и нажмите «Проверить», чтобы получить баллы.</p></div>
          </article>
          <article class="giveaway-info-item">
            <span class="giveaway-info-icon">${icon("trophy")}</span>
            <div><strong>Призы получают участники топ-10</strong><p>Чем больше баллов набрано к завершению розыгрыша, тем выше место участника и его награда.</p></div>
          </article>
        </div>

        ${orderedPrizes.length ? `
          <div class="giveaway-prizes-block">
            <h3>Призы текущего розыгрыша</h3>
            <div class="giveaway-prize-grid">
              ${orderedPrizes.map((prize) => `
                <div class="giveaway-prize-row${Number(prize.rank) <= 3 ? " is-top" : ""}">
                  <span>${Number(prize.rank)} место</span>
                  <strong>${escapeHTML(prize.label)}</strong>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <div class="giveaway-rules-block">
          <h3>${icon("shield-check")} Правила получения приза</h3>
          <ol class="giveaway-rules-list">
            <li>Игровая валюта выдаётся в <strong>BLACK RUSSIA</strong>. По желанию призёра её можно заменить на сопоставимый по стоимости товар из магазина.</li>
            <li>Призёр должен написать в поддержку в течение <strong>7 дней</strong> после завершения розыгрыша.</li>
            <li>Призёр обязан сохранить достаточные доказательства фактического выполнения заданий.</li>
            <li>Для задания «Репост минимум в 10 чатов» организатор может запросить подтверждение. При отсутствии доказательств организатор вправе отказать в выдаче приза или уменьшить его размер.</li>
          </ol>
        </div>

        <p class="giveaway-rules-footnote">Накрутка, спам и использование нескольких аккаунтов могут стать причиной исключения из рейтинга.</p>
        <button class="primary-button giveaway-info-close" type="button" data-close-modal>Понятно</button>
      </section>
    </div>
  `;
  const giveawayInfoSheet = modalRoot.querySelector(".giveaway-info-modal");
  if (giveawayInfoSheet) giveawayInfoSheet.scrollTop = 0;
  modalRoot.querySelector(".giveaway-info-modal .close-button")?.focus({ preventScroll: true });
}

function openActiveReferralInfoModal() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet active-referral-info-modal" role="dialog" aria-modal="true" aria-labelledby="activeReferralInfoModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="activeReferralInfoModalTitle">Кто считается активным?</h2>
            <p>Баллы начисляются за реального приглашённого пользователя.</p>
          </div>
          <button class="close-button" type="button" data-close-modal aria-label="Закрыть">${icon("x")}</button>
        </div>

        <div class="active-referral-steps">
          <article class="active-referral-step">
            <span>1</span>
            <div><strong>Переход по вашей ссылке</strong><p>Пользователь впервые запускает @PlatinovBot по вашей персональной ссылке.</p></div>
          </article>
          <article class="active-referral-step">
            <span>2</span>
            <div><strong>Первое действие в розыгрыше</strong><p>Пользователь заходит в раздел «Розыгрыш» и получает первое начисление баллов активности.</p></div>
          </article>
          <article class="active-referral-step is-result">
            <span>${icon("check")}</span>
            <div><strong>Вам начисляется +200 баллов</strong><p>Награда выдаётся один раз за каждого активного приглашённого. Повторные переходы не учитываются.</p></div>
          </article>
        </div>

        <p class="active-referral-warning">Самоприглашение и использование нескольких аккаунтов не засчитываются.</p>
        <button class="primary-button active-referral-info-close" type="button" data-close-modal>Понятно</button>
      </section>
    </div>
  `;
  modalRoot.querySelector(".active-referral-info-modal .close-button")?.focus({ preventScroll: true });
}

function openSellContactModal() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-sheet sell-contact-modal" role="dialog" aria-modal="true" aria-labelledby="sellContactModalTitle">
        <div class="modal-head">
          <div>
            <h2 id="sellContactModalTitle">Куда написать?</h2>
            <p>Выберите удобный способ связи для продажи.</p>
          </div>
          <button class="close-button" type="button" data-close-modal aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="sell-contact-list">
          <button class="info-document-button sell-contact-button" type="button" data-sell-contact="manager">
            <span class="info-document-icon">${socialLogo("telegram")}</span>
            <span class="info-document-copy">
              <strong>Лично сотруднику</strong>
              <small>Самый быстрый ответ</small>
            </span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </button>
          <button class="info-document-button sell-contact-button" type="button" data-sell-contact="bot">
            <span class="info-document-icon">${socialLogo("telegram")}</span>
            <span class="info-document-copy">
              <strong>В Telegram-бот</strong>
              <small>В случае спам-блока</small>
            </span>
            <span class="info-document-arrow">${icon("arrow-up-right")}</span>
          </button>
          <button class="info-document-button sell-contact-button" type="button" data-sell-contact="vk">
            <span class="info-document-icon">${socialLogo("vk")}</span>
            <span class="info-document-copy">
              <strong>ВКонтакте</strong>
              <small>Альтернативный вариант</small>
            </span>
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

async function openReviewModal() {
  if (!tg?.initData && !apiAccessToken) {
    showToast("Откройте магазин через Telegram, чтобы оставить отзыв");
    openExternal(TELEGRAM_AUTH_URL);
    return;
  }
  await loadRemoteOrders();
  const eligibleOrders = (state.apiOrders || []).filter((order) =>
    ["paid", "processing", "completed"].includes(order.status)
  );
  if (!eligibleOrders.length) {
    showToast("Отзыв можно оставить после оплаты заказа");
    return;
  }
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
            <label for="reviewOrder">Заказ</label>
            <select class="field-control" id="reviewOrder" name="orderPublicId" required>
              ${eligibleOrders.map((order) => `
                <option value="${escapeHTML(order.public_id)}">
                  #${escapeHTML(order.public_id)} · ${escapeHTML(order.game)} · ${escapeHTML(order.server || "Без сервера")}
                </option>
              `).join("")}
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

function animateRenderedScreen() {
  const screen = app.firstElementChild;
  if (!(screen instanceof HTMLElement) || lastAnimatedRoute === state.route) return;
  lastAnimatedRoute = state.route;
  screen.classList.add("is-page-entering");
  const finishPageEntrance = (event) => {
    if (event.target !== screen) return;
    screen.classList.remove("is-page-entering");
    screen.removeEventListener("animationend", finishPageEntrance);
  };
  screen.addEventListener("animationend", finishPageEntrance);
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
  const renderer = renderers[state.route] || renderHome;
  // Remove a potentially heavy previous list before building the next screen.
  app.replaceChildren();
  app.innerHTML = renderer();
  animateRenderedScreen();
  setActiveNav(state.route);
  syncTelegramBackButton();
  saveNavigationSession();
}

app.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (
      image instanceof HTMLImageElement &&
      image.matches("[data-profile-avatar], [data-avatar-image]")
    ) {
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
    openSellContactModal();
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
    openSellContactModal();
    return;
  }
  state.action = action;
  state.serverSearch = "";
  const project = getProject();
  if (project && !requiresServerSelection(project)) {
    state.selectedServer = project.servers[0] || project.name;
    state.deliveryType = "bank";
    navigate(action === "sell" ? "sell" : "buy");
    return;
  }
  navigate("servers");
}

function chooseServer(server) {
  state.selectedServer = server;
  state.deliveryType = "bank";
  navigate(state.action === "sell" ? "sell" : "buy");
}

function invalidatePromoQuote() {
  promoQuoteSequence += 1;
  window.clearTimeout(promoQuoteTimer);
  promoQuoteTimer = 0;
}

function normalizePromoCode(value) {
  return String(value || "").trim().replace(/^#/, "").trim().toUpperCase();
}

function renderPromoStatus(data) {
  const node = document.getElementById("promoStatus");
  if (!node) return;
  node.replaceChildren();
  const message = String(data?.promo_message || "").trim();
  if (!message) {
    node.className = "promo-status";
    return;
  }
  const text = document.createElement("span");
  text.textContent = message;
  node.append(text);
  const status = String(data?.promo_status || "");
  node.className = `promo-status ${data?.promo_valid ? "is-success" : "is-warning"}`;

  const links = [];
  if (status === "bot_only" && data.bot_url) {
    links.push({ title: "Открыть Telegram-бот", url: data.bot_url });
  }
  if (status === "subscription_required" && Array.isArray(data.channels)) {
    data.channels.forEach((channel) => {
      if (channel?.url) links.push({ title: channel.title || "Подписаться", url: channel.url });
    });
  }
  if (links.length) {
    const actions = document.createElement("div");
    actions.className = "promo-status-actions";
    links.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promo-status-link";
      button.textContent = item.title;
      button.addEventListener("click", () => openExternal(item.url));
      actions.append(button);
    });
    node.append(actions);
  }
}

function schedulePromoQuote(project, amount, promoCode) {
  invalidatePromoQuote();
  const normalizedCode = normalizePromoCode(promoCode);
  if (!project || !Number.isFinite(amount) || amount <= 0) return;

  const promoStatus = document.getElementById("promoStatus");
  if (!tg?.initData) {
    if (promoStatus) {
      if (normalizedCode) {
        promoStatus.textContent = "Проверка промокода доступна при открытии через Telegram";
        promoStatus.className = "promo-status is-warning";
      }
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

    const currentPromo = normalizePromoCode(document.getElementById("buyPromo")?.value);
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
    renderPromoStatus(data);
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
    const normalizedCode = normalizePromoCode(promoCode);
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
  const promoCode = normalizePromoCode(form.elements.promo.value);
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
  const paymentWindow = preparePaymentWindow();

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
      openPaymentPage(paymentUrl, paymentWindow);
    } else {
      closePreparedPaymentWindow(paymentWindow);
      showToast("Заказ создан и готов к оплате");
      state.history = [];
      navigate("orders", { replace: true });
    }
  } catch (error) {
    closePreparedPaymentWindow(paymentWindow);
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
  const orderPublicId = String(formData.get("orderPublicId") || "");
  const selectedOrder = (state.apiOrders || []).find((order) => order.public_id === orderPublicId);
  if (!selectedOrder) {
    showToast("Выберите заказ");
    return;
  }
  const review = {
    id: `local-${Date.now()}`,
    initial: getTelegramUser().initial,
    order: `Отзыв #${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    status: "ожидает проверки",
    rating: state.reviewRating,
    text: formData.get("text").trim(),
    projectId: PROJECTS.find((project) => project.name === selectedOrder.game)?.id || "black-russia",
    server: selectedOrder.server || "Без сервера",
    amount: selectedOrder.amount_kk,
    price: selectedOrder.price_rub,
    delivery: selectedOrder.delivery_type,
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
          order_public_id: orderPublicId,
          rating: review.rating,
          text: review.text
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
    state.reviewPage = 0;
    if (REVIEWS_API_BASE_URL) {
      void loadRemoteReviews();
    } else {
      render();
    }
    haptic("medium");
    showToast(`Спасибо! Отзыв о ${selectedOrder.game} ожидает проверки`);
  } catch (error) {
    console.error(error);
    submitButton.disabled = false;
    submitButton.textContent = "Отправить отзыв";
    showToast("Не удалось отправить отзыв. Попробуйте ещё раз");
  }
}

function mapApiReview(review) {
  const project = PROJECTS.find((item) => item.name === review.game || item.shortName === review.game);
  const amountNumber = Number(review.amount_kk);
  const amount = Number.isFinite(amountNumber)
    ? `${amountNumber.toLocaleString("ru-RU")} ${review.game === "STANDOFF 2" ? "G" : "кк"}`
    : "—";
  const created = new Date(review.created_at);
  return {
    id: review.public_id,
    userId: review.user_id || "",
    initial: getUserInitials(review.username || "Пользователь"),
    photoUrl: review.user_id ? `${API_BASE_URL}/api/public/avatar/${review.user_id}` : "",
    order: review.order_public_id ? `Заказ #${review.order_public_id}` : `Отзыв #${review.public_id}`,
    status: "подтверждён",
    rating: Number(review.rating) || 5,
    text: review.text || "",
    projectId: project?.id || "black-russia",
    server: review.server || "—",
    amount,
    price: review.price_rub ? formatMoney(Number(review.price_rub)) : "—",
    delivery: review.delivery_type || "—",
    time: "—",
    date: Number.isNaN(created.getTime()) ? "" : created.toLocaleDateString("ru-RU"),
    source: review.source == null ? "Сайт" : review.source
  };
}

async function loadRemoteReviews() {
  if (!REVIEWS_API_BASE_URL) return;
  const requestSequence = ++reviewsLoadSequence;
  const requestedPage = Math.max(0, Number(state.reviewPage) || 0);
  const requestedFilter = state.reviewFilter;
  state.reviewsLoading = true;
  state.reviewsError = "";
  state.apiReviews = [];
  state.reviewsHasMore = false;
  if (state.route === "reviews") render();
  try {
    const query = new URLSearchParams({
      limit: String(REVIEWS_PAGE_SIZE + 1),
      offset: String(requestedPage * REVIEWS_PAGE_SIZE)
    });
    if (requestedFilter !== "all") {
      const selectedProject = PROJECTS.find((project) => project.id === requestedFilter);
      if (selectedProject) query.set("game", selectedProject.name);
    }
    const response = await fetch(
      `${REVIEWS_API_BASE_URL.replace(/\/$/, "")}${REVIEW_ENDPOINTS.list}?${query}`
    );
    if (!response.ok) throw new Error(`Reviews request failed: ${response.status}`);
    const data = await response.json();
    const batch = Array.isArray(data) ? data : (data.reviews || []);
    if (requestSequence !== reviewsLoadSequence) return;
    state.apiReviews = batch.slice(0, REVIEWS_PAGE_SIZE).map(mapApiReview);
    state.reviewsHasMore = batch.length > REVIEWS_PAGE_SIZE;
  } catch (error) {
    console.error(error);
    if (requestSequence !== reviewsLoadSequence) return;
    state.reviewsError = "Проверьте соединение и попробуйте ещё раз.";
  } finally {
    if (requestSequence === reviewsLoadSequence) {
      state.reviewsLoading = false;
      if (state.route === "reviews") render();
    }
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

async function loadSiteConfig() {
  if (!API_BASE_URL) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/site-config`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return;
    const values = data.values || {};
    SUPPORT_URL = values.support_url || SUPPORT_URL;
    SELL_MANAGER_URL = SUPPORT_URL;
    SELL_BOT_URL = values.sell_bot_url || SELL_BOT_URL;
    TELEGRAM_BUY_URL = values.main_channel_url || TELEGRAM_BUY_URL;
    REVIEWS_TELEGRAM_URL = values.reviews_telegram_url || REVIEWS_TELEGRAM_URL;
    REVIEWS_VK_URL = values.reviews_vk_url || REVIEWS_VK_URL;
    VK_BUY_URL = values.vk_buy_url || VK_BUY_URL;
    VK_SELL_URL = values.vk_sell_url || VK_SELL_URL;
    render();
  } catch (error) {
    console.warn("Site config load error", error);
  }
}

async function reportReferralVisit() {
  const referrerId = getReferralId();
  if (!API_BASE_URL || !referrerId) return;
  try {
    await fetch(`${API_BASE_URL}/api/referrals/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        referrer_id: referrerId,
        visitor_key: getReferralVisitorKey()
      })
    });
  } catch (error) {
    console.warn("Referral visit tracking error", error);
  }
}

async function loadActivity(force = false) {
  if (!API_BASE_URL || !tg?.initData || activityLoading) return;
  if (state.activity && !force) return;
  activityLoading = true;
  state.activityError = "";
  try {
    const response = await apiRequest("/api/activity");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Activity request failed: ${response.status}`);
    }
    state.activity = data;
  } catch (error) {
    console.error("Activity load error", error);
    state.activityError = error.message || "Попробуйте ещё раз";
  } finally {
    activityLoading = false;
    if (state.route === "raffle") render();
  }
}

function scheduleMoscowMidnightRefresh() {
  window.clearTimeout(moscowRefreshTimer);
  const now = new Date();
  const moscowNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const nextMidnightUtc = Date.UTC(
    moscowNow.getUTCFullYear(),
    moscowNow.getUTCMonth(),
    moscowNow.getUTCDate() + 1,
    -3,
    0,
    0,
    0
  );
  const delay = Math.max(1000, nextMidnightUtc - now.getTime() + 1500);
  moscowRefreshTimer = window.setTimeout(async () => {
    await loadSiteConfig();
    if (tg?.initData) await loadActivity(true);
    scheduleMoscowMidnightRefresh();
  }, delay);
}

async function claimActivityTask(type, sponsorId = "") {
  try {
    const response = await apiRequest("/api/activity/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, sponsor_id: sponsorId || null })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Activity claim failed: ${response.status}`);
    }
    state.activity = data;
    state.activityError = "";
    render();
    showToast(data.message || "Баллы обновлены");
    return true;
  } catch (error) {
    console.error("Activity claim error", error);
    showToast(error.message || "Не удалось проверить задание");
    return false;
  }
}

function getPendingReactionClaimDue() {
  const storageKey = `${REACTION_CLAIM_DUE_STORAGE_KEY_PREFIX}:${Number(tg?.initDataUnsafe?.user?.id || 0)}`;
  try {
    const due = Number(window.localStorage.getItem(storageKey));
    pendingReactionClaimDue = Number.isFinite(due) && due > 0 ? due : 0;
    return pendingReactionClaimDue;
  } catch {
    return pendingReactionClaimDue;
  }
}

function setPendingReactionClaimDue(due) {
  const storageKey = `${REACTION_CLAIM_DUE_STORAGE_KEY_PREFIX}:${Number(tg?.initDataUnsafe?.user?.id || 0)}`;
  pendingReactionClaimDue = due > 0 ? due : 0;
  try {
    if (due > 0) {
      window.localStorage.setItem(storageKey, String(due));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // The in-memory timer still works if Telegram WebView blocks storage.
  }
}

async function finishPendingReactionClaim() {
  if (reactionClaimInFlight) return;
  const due = getPendingReactionClaimDue();
  if (!due || Date.now() < due) return;
  reactionClaimInFlight = true;
  const succeeded = await claimActivityTask("reaction");
  reactionClaimInFlight = false;
  if (succeeded) setPendingReactionClaimDue(0);
}

function schedulePendingReactionClaim() {
  window.clearTimeout(reactionClaimTimer);
  const due = getPendingReactionClaimDue();
  if (!due) return;
  reactionClaimTimer = window.setTimeout(
    () => void finishPendingReactionClaim(),
    Math.max(0, due - Date.now())
  );
}

function startDelayedReactionClaim(url, button) {
  if (state.activity?.tasks?.reaction?.claimed) return;
  const existingDue = getPendingReactionClaimDue();
  const due = existingDue > Date.now() ? existingDue : Date.now() + 10000;
  setPendingReactionClaimDue(due);
  if (button) {
    button.disabled = true;
    button.textContent = "Проверяем…";
  }
  schedulePendingReactionClaim();
  showToast("Реакция засчитается через 10 секунд");
  // Persist and schedule the claim before Telegram suspends the Mini App.
  openExternal(url);
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

  if (event.target.closest("[data-activity-reload]")) {
    state.activity = null;
    state.activityError = "";
    render();
    loadActivity(true);
    return;
  }

  if (event.target.closest("[data-open-giveaway-info]")) {
    openGiveawayInfoModal();
    haptic();
    return;
  }

  if (event.target.closest("[data-activity-scroll-leaderboard]")) {
    const leaderboard = document.getElementById("activity-full-leaderboard");
    leaderboard?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    haptic();
    return;
  }

  const activityOpenButton = event.target.closest("[data-activity-open]");
  if (activityOpenButton) {
    openExternal(activityOpenButton.dataset.activityOpen);
    haptic();
    return;
  }

  const repostOpenButton = event.target.closest("[data-activity-repost-open]");
  if (repostOpenButton) {
    const repostTask = state.activity?.tasks?.daily_repost || {};
    markActivityRepostOpened(repostTask);
    openExternal(repostOpenButton.dataset.activityRepostOpen);
    render();
    haptic();
    return;
  }

  const reactionButton = event.target.closest("[data-activity-reaction]");
  if (reactionButton) {
    startDelayedReactionClaim(reactionButton.dataset.activityReaction, reactionButton);
    haptic("medium");
    return;
  }

  const activityClaimButton = event.target.closest("[data-activity-claim]");
  if (activityClaimButton) {
    if (
      activityClaimButton.dataset.activityClaim === "repost" &&
      !window.confirm("Подтверждаете, что отправили нужный пост минимум в 10 чатов?")
    ) {
      return;
    }
    activityClaimButton.disabled = true;
    claimActivityTask(activityClaimButton.dataset.activityClaim);
    haptic("medium");
    return;
  }

  const sponsorClaimButton = event.target.closest("[data-activity-sponsor]");
  if (sponsorClaimButton) {
    sponsorClaimButton.disabled = true;
    claimActivityTask("sponsor", sponsorClaimButton.dataset.activitySponsor);
    haptic("medium");
    return;
  }

  if (event.target.closest("[data-copy-activity-referral]")) {
    const user = getTelegramUser();
    if (!user.isAuthenticated) {
      openExternal(TELEGRAM_AUTH_URL);
      return;
    }
    const referral = `https://t.me/PlatinovBot?start=ref_${encodeURIComponent(user.id)}`;
    navigator.clipboard?.writeText(referral)
      .then(() => showToast("Реферальная ссылка скопирована"))
      .catch(() => showToast(`Ссылка: ${referral}`));
    haptic();
    return;
  }

  if (event.target.closest("[data-active-referral-info]")) {
    openActiveReferralInfoModal();
    haptic();
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
      const active = button === deliveryButton;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-checked", String(active));
      const stateIcon = button.querySelector(".delivery-method-state");
      if (stateIcon) stateIcon.innerHTML = active ? icon("check") : "";
    });
    const methodHelp = document.getElementById("deliveryMethodHelp");
    if (methodHelp) methodHelp.textContent = deliveryButton.dataset.deliveryDescription || "";
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
    state.reviewPage = 0;
    if (REVIEWS_API_BASE_URL) {
      void loadRemoteReviews();
    } else {
      render();
    }
    haptic();
    return;
  }

  const reviewsPageButton = event.target.closest("[data-reviews-page]");
  if (reviewsPageButton && !reviewsPageButton.disabled) {
    const pageDelta = Number(reviewsPageButton.dataset.reviewsPage) || 0;
    state.reviewPage = Math.max(0, state.reviewPage + pageDelta);
    if (REVIEWS_API_BASE_URL) {
      void loadRemoteReviews();
    } else {
      render();
    }
    window.scrollTo({
      top: Math.max(0, (document.querySelector(".reviews-screen .filter-row")?.offsetTop || 0) - 82),
      behavior: "auto"
    });
    haptic();
    return;
  }

  if (event.target.closest("[data-open-review]")) {
    void openReviewModal();
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
    event.target.closest("button[data-close-modal]") ||
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
  const sellContactButton = event.target.closest("[data-sell-contact]");
  if (sellContactButton) {
    const urls = {
      manager: SELL_MANAGER_URL,
      bot: SELL_BOT_URL,
      vk: VK_SELL_URL
    };
    const url = urls[sellContactButton.dataset.sellContact];
    if (url) {
      closeModal();
      openExternal(url);
      haptic();
    }
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
const launchStartParam = String(
  tg?.initDataUnsafe?.start_param ||
  new URL(window.location.href).searchParams.get("tgWebAppStartParam") ||
  ""
).toLowerCase();
const shouldOpenGiveawayInfoOnLaunch = ["giveaway_info", "giveaway-info", "giveawayinfo"]
  .includes(launchStartParam);
const directPublicRoute = getPublicRouteFromLocation();
if (normalizePublicPath() !== "/" && directPublicRoute) {
  state.route = directPublicRoute;
  state.history = [];
}
applyPaymentReturnRoute();
syncBrowserRoute(state.route, "replace");
renderHeaderProfile();
render();
void reconcilePaymentReturn();
loadSiteConfig();
scheduleMoscowMidnightRefresh();
reportReferralVisit();
hydrateTelegramAvatar();
loadRemoteReviews();
if (state.route === "orders") loadRemoteOrders();
if (state.route === "raffle") {
  const activityPromise = loadActivity();
  if (shouldOpenGiveawayInfoOnLaunch) {
    Promise.resolve(activityPromise).finally(() => {
      if (state.route !== "raffle") return;
      window.requestAnimationFrame(() => openGiveawayInfoModal());
    });
  }
}
checkAccess();

schedulePendingReactionClaim();
async function refreshActivityAfterReturn() {
  if (document.hidden) return;
  await finishPendingReactionClaim();
  if (state.route === "raffle" && tg?.initData) {
    await loadActivity(true);
  }
  schedulePendingReactionClaim();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshActivityAfterReturn();
});
window.addEventListener?.("focus", () => void refreshActivityAfterReturn());
window.addEventListener?.("pageshow", () => void refreshActivityAfterReturn());
tg?.onEvent?.("activated", () => void refreshActivityAfterReturn());

window.addEventListener?.("pagehide", saveNavigationSession);
window.addEventListener?.("popstate", (event) => {
  applyRouteFromLocation(event.state);
});
