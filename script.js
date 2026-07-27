"use strict";

const API_BASE_URL = "https://api.platinov.com";
const REVIEWS_API_BASE_URL = "";
const SUPPORT_URL = "https://t.me/PlatinovBot";
const SELL_MANAGER_URL = "https://t.me/PlatinovBot";
const REVIEWS_TELEGRAM_URL = "https://t.me/PlatinovBot";
const REVIEWS_VK_URL = "https://vk.com";
const ACCESS_RESTRICTED_TEXT = "Оформить заказ можно вручную.";
const PROMO_CODES = {
  START5: 5,
  BONUS7: 7,
  VIP10: 10
};
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

const PROJECTS = [
  {
    id: "black-russia",
    name: "BLACK RUSSIA",
    shortName: "Black Russia",
    unit: "кк",
    priceLabel: "от 40 ₽ / кк",
    color: "red",
    logo: "black-russia.png",
    amountStep: 1,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [
      { from: 100, price: 40 },
      { from: 10, price: 45 },
      { from: 1, price: 50 }
    ]
  },
  {
    id: "gta-5-rp",
    name: "GTA 5 RP",
    shortName: "GTA 5 RP",
    unit: "кк",
    priceLabel: "от 800 ₽ / кк",
    color: "orange",
    logo: "gta5rp.png",
    amountStep: 1,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [
      { from: 50, price: 800 },
      { from: 10, price: 900 },
      { from: 5, price: 950 },
      { from: 1, price: 1000 }
    ]
  },
  {
    id: "matreshka-rp",
    name: "MATRESHKA RP",
    shortName: "Matreshka RP",
    unit: "кк",
    priceLabel: "от 70 ₽ / кк",
    color: "purple",
    logo: "matreshka.png",
    amountStep: 1,
    quickAmounts: [10, 20, 50, 100],
    tariffs: [
      { from: 100, price: 70 },
      { from: 10, price: 80 },
      { from: 1, price: 100 }
    ]
  },
  {
    id: "standoff-2",
    name: "STANDOFF 2",
    shortName: "Standoff 2",
    unit: "G",
    priceLabel: "от 15 ₽ / 1000G",
    color: "blue",
    logo: "standoff.png",
    amountStep: 1000,
    quickAmounts: [1000, 5000, 10000, 50000],
    tariffs: [{ from: 1000, price: 15, per: 1000 }]
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

const REVIEW_TEXT_STARTS = [
  "всё чётко",
  "быстро выдали",
  "топ, всё быстро и легко",
  "оплатил и получил через пару минут",
  "спасибо, всё нормально",
  "сделка прошла спокойно",
  "получил без лишних вопросов",
  "всё пришло как договаривались",
  "первый раз покупал здесь, всё хорошо",
  "менеджер быстро ответил",
  "курс хороший, выдача быстрая",
  "оформление простое и понятное",
  "валюту получил полностью",
  "никаких проблем с заказом",
  "всё сделали аккуратно"
];

const REVIEW_TEXT_ENDINGS = [
  "Спасибо менеджеру.",
  "Сервер нашли сразу.",
  "Буду обращаться ещё.",
  "По времени вышло совсем недолго.",
  "Поддержка была на связи.",
  "Получал банком, всё прошло нормально.",
  "Трейдом передали без задержек.",
  "Цена совпала с расчётом.",
  "После оплаты долго ждать не пришлось.",
  "Ник и сервер проверили перед выдачей.",
  "Инструкция была понятной.",
  "Заказ оформили с телефона без проблем.",
  "Статус заказа обновился быстро.",
  "Всё количество пришло сразу.",
  "Удобно, что можно выбрать способ получения.",
  "Ответили спокойно и по делу.",
  "Первый заказ оставил хорошее впечатление.",
  "За такую скорость отдельный плюс.",
  "Сделка заняла меньше десяти минут.",
  "Результатом доволен."
];

const REVIEW_INITIALS = [
  "А", "М", "Д", "К", "Р", "И", "С", "Н", "В", "Е",
  "Т", "П", "Г", "Л", "О", "Ф", "Я", "Б", "Ю", "З"
];

const REVIEW_SOURCES = ["Telegram", "Сайт", "Telegram", "VK", "Сайт"];
const REVIEW_VARIANTS = {
  "black-russia": [
    { amount: "10 кк", price: "450 ₽" },
    { amount: "20 кк", price: "900 ₽" },
    { amount: "50 кк", price: "2 250 ₽" },
    { amount: "100 кк", price: "4 000 ₽" }
  ],
  "matreshka-rp": [
    { amount: "10 кк", price: "800 ₽" },
    { amount: "20 кк", price: "1 600 ₽" },
    { amount: "50 кк", price: "4 000 ₽" },
    { amount: "100 кк", price: "7 000 ₽" }
  ],
  "gta-5-rp": [
    { amount: "1 кк", price: "1 000 ₽" },
    { amount: "5 кк", price: "4 750 ₽" },
    { amount: "10 кк", price: "9 000 ₽" },
    { amount: "50 кк", price: "40 000 ₽" }
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
      text: `${REVIEW_TEXT_STARTS[index % REVIEW_TEXT_STARTS.length]}. ${
        REVIEW_TEXT_ENDINGS[Math.floor(index / REVIEW_TEXT_STARTS.length) % REVIEW_TEXT_ENDINGS.length]
      }`,
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
  "sell",
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

function getProject(projectId = state.selectedProjectId) {
  return PROJECTS.find((project) => project.id === projectId);
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
    const preferredAction = ["buy", "sell"].includes(saved.preferredAction)
      ? saved.preferredAction
      : null;
    let action = ["buy", "sell"].includes(saved.action) ? saved.action : null;
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
      aria-label="${actionLabel}: ${escapeHTML(project.name)}, ${escapeHTML(project.priceLabel)}">
      ${projectLogo(project)}
      <span class="project-card-copy">
        <span class="project-name">${escapeHTML(project.name)}</span>
        <span class="project-price">${escapeHTML(project.priceLabel)}</span>
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
        <div class="hero-actions">
          <button class="primary-button" type="button" data-start-action="buy">
            Купить валюту <span class="button-arrow">${icon("arrow-right")}</span>
          </button>
          <button class="secondary-button" type="button" data-start-action="sell">
            Продать валюту
          </button>
        </div>
      </div>

      <section class="section">
        <div class="section-heading">
          <div>
            <h2>Выберите игру</h2>
          </div>
        </div>
        <div class="project-grid">${projectCards("home")}</div>
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
    ? "Выберите проект, валюту которого хотите продать"
    : state.preferredAction === "buy"
      ? "Выберите проект для покупки валюты"
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
          <span>${escapeHTML(project.priceLabel)}</span>
        </div>
        <span class="summary-tag">${escapeHTML(project.unit)}</span>
      </div>
      <div class="choice-stack">
        <button class="select-card order-action-card order-action-buy ${state.preferredAction === "buy" ? "is-featured" : ""}" type="button" data-action="buy">
          <span class="select-icon">${icon("arrow-down")}</span>
          <span class="select-copy">
            <strong>Купить валюту</strong>
            <small>${requiresServer ? "Выберите сервер и оформите заказ" : "Укажите данные и оформите заказ"}</small>
          </span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
        <button class="select-card order-action-card order-action-sell ${state.preferredAction === "sell" ? "is-featured" : ""}" type="button" data-action="sell">
          <span class="select-icon">${icon("arrow-up-right")}</span>
          <span class="select-copy">
            <strong>Продать валюту</strong>
            <small>Передайте данные менеджеру и получите расчёт</small>
          </span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
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

function getPromoPercent(code = "") {
  return PROMO_CODES[String(code).trim().toUpperCase()] || 0;
}

function calculateStandoffPrice(amount, promoPercent = 0) {
  const pricePerThousand = 15;
  const subtotal = (amount / 1000) * pricePerThousand;
  const discount = subtotal * promoPercent / 100;
  return {
    total: Math.max(0, subtotal - discount),
    subtotal,
    discount,
    promoPercent,
    unitPrice: pricePerThousand
  };
}

function calculatePrice(project, amount, promoCode = "") {
  if (!project || !Number.isFinite(amount) || amount <= 0) {
    return { total: 0, subtotal: 0, discount: 0, promoPercent: 0, unitPrice: 0 };
  }
  const promoPercent = getPromoPercent(promoCode);
  if (project.id === "standoff-2") {
    return calculateStandoffPrice(amount, promoPercent);
  }
  let subtotal = 0;
  let unitPrice = 0;
  const tariff = project.tariffs.find((item) => amount >= item.from) || project.tariffs.at(-1);
  unitPrice = tariff.price;
  subtotal = amount * tariff.price;
  const discount = subtotal * promoPercent / 100;
  return {
    total: Math.max(0, subtotal - discount),
    subtotal,
    discount,
    promoPercent,
    unitPrice
  };
}

function calculateAmountFromMoney(project, money, promoCode = "") {
  if (!project || !Number.isFinite(money) || money <= 0) return 0;
  const multiplier = 1 - getPromoPercent(promoCode) / 100;
  if (multiplier <= 0) return 0;
  if (project.id === "standoff-2") {
    const tariff = project.tariffs[0];
    return money / (tariff.price * multiplier) * tariff.per;
  }
  const tariffs = project.tariffs.slice().sort((a, b) => b.from - a.from);
  for (const tariff of tariffs) {
    const amount = money / (tariff.price * multiplier);
    if (amount >= tariff.from) return amount;
  }
  return money / (tariffs.at(-1).price * multiplier);
}

function renderPurchaseForm() {
  const project = getProject();
  if (!project || !state.selectedServer) return renderServerSelection();
  const defaultAmount = project.quickAmounts[0];
  const price = calculatePrice(project, defaultAmount);
  return `
    <section class="screen order-flow order-form-step order-buy-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Оформление</p>
        <h1>Покупка валюты</h1>
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
        <div class="field-group form-field">
          <label for="buyNickname">Игровой ник</label>
          <input class="field-control" id="buyNickname" name="nickname" required maxlength="40"
            autocomplete="off" placeholder="Например, Alex_Walker">
        </div>
        <div class="dual-inputs">
          <div class="field-group form-field">
            <label for="buyAmount">Количество валюты</label>
            <div class="amount-wrap">
              <input class="field-control" id="buyAmount" name="amount" type="number" required
                min="${project.amountStep}" step="${project.amountStep}" value="${defaultAmount}">
              <span class="amount-unit">${escapeHTML(project.unit)}</span>
            </div>
          </div>
          <div class="field-group form-field">
            <label for="moneyAmount">Сумма оплаты</label>
            <div class="amount-wrap">
              <input class="field-control" id="moneyAmount" type="number" min="1" step="1"
                value="${Math.round(price.total)}" inputmode="decimal">
              <span class="amount-unit">₽</span>
            </div>
          </div>
        </div>
        <div class="field-group form-field">
          <div class="quick-row" aria-label="Быстрый выбор количества">
            ${project.quickAmounts.map((amount, index) => `
              <button class="quick-chip amount-preset ${index === 0 ? "is-active" : ""}" type="button" data-quick-amount="${amount}">
                ${amount.toLocaleString("ru-RU")} ${escapeHTML(project.unit)}
              </button>
            `).join("")}
          </div>
        </div>
        <div class="price-box order-summary">
          <div class="price-details">
            <span>К оплате</span>
            <small id="rateLabel">${project.id === "standoff-2" ? `${price.unitPrice} ₽ за 1000G` : `${price.unitPrice} ₽ за кк`}</small>
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
        <div class="inline-note">
          <span class="inline-note-icon">${icon("shield-check")}</span>
          <span><strong>Данные защищены.</strong> Мы не запрашиваем пароль от игрового аккаунта.</span>
        </div>
        <button class="primary-button order-submit-button" type="submit">
          Перейти к оплате <span class="button-arrow">${icon("arrow-right")}</span>
        </button>
      </form>
    </section>
  `;
}

function renderSellForm() {
  const project = getProject();
  if (!project || !state.selectedServer) return renderServerSelection();
  return `
    <section class="screen order-flow order-form-step order-sell-step">
      <header class="screen-header order-step-header">
        <p class="eyebrow">Продажа</p>
        <h1>Продать валюту</h1>
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
        <div class="field-group form-field">
          <label for="sellNickname">Игровой ник</label>
          <input class="field-control" id="sellNickname" name="nickname" required maxlength="40"
            autocomplete="off" placeholder="Ваш ник в игре">
        </div>
        <div class="field-group form-field">
          <label for="sellAmount">Количество валюты</label>
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
  const orders = getLocalOrders();
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
      photoUrl: user.photo_url || null
    };
  }
  return {
    name: "Алексей",
    username: "@demo_user",
    id: "demo",
    initial: "А",
    photoUrl: null
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
      <div class="glass-card profile-card">
        <div class="profile-main">
          ${profileAvatar}
          <div class="profile-copy">
            <h2>${escapeHTML(user.name)}</h2>
            <p>${escapeHTML(user.username)}</p>
            <span class="profile-id">ID: ${escapeHTML(user.id)}</span>
          </div>
        </div>
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
        <button class="select-card" type="button" data-route="info">
          <span class="select-icon">${icon("info")}</span>
          <span class="select-copy"><strong>О сервисе и условия</strong><small>Доставка, возврат и документы</small></span>
          <span class="select-chevron">${icon("chevron-right")}</span>
        </button>
      </div>
    </section>
  `;
}

function renderInfo() {
  return `
    <section class="screen">
      <header class="screen-header">
        <p class="eyebrow">Документы</p>
        <h1>О сервисе</h1>
        <p>Как проходит заказ, правила доставки и условия использования mini-app.</p>
      </header>
      <div class="legal-stack">
        <article class="glass-card legal-card">
          <h3>Как проходит заказ</h3>
          <p>Выберите игру, сервер, количество валюты и способ получения. После оформления заказ передаётся в обработку, а данные проверяются менеджером.</p>
          <p>Для заказа потребуются игровой ник, сервер, объём и способ получения: трейдом или через игровой банк.</p>
        </article>
        <article class="glass-card legal-card">
          <h3>Оплата и доставка</h3>
          <p>Товар является цифровым, физическая доставка не осуществляется. Передача выполняется внутри выбранной игры на указанном сервере.</p>
        </article>
        <article class="glass-card legal-card">
          <h3>Возврат и отмена</h3>
          <p>Заказ можно отменить до начала выполнения. После передачи цифрового товара возврат невозможен, кроме случаев ошибки со стороны сервиса. Если заказ нельзя выполнить по техническим причинам, предлагается возврат или другой способ исполнения.</p>
        </article>
        <article class="glass-card legal-card">
          <h3>Политика конфиденциальности</h3>
          <p>Для оформления заказа могут использоваться Telegram username и технические данные Telegram, игровой ник, игра, сервер, объём, промокод, способ получения и номер игрового банковского счёта.</p>
          <p>Данные используются для обработки заказа, поддержки, улучшения сервиса и предотвращения злоупотреблений. Передача третьим лицам допускается только в объёме, необходимом для платежей, исполнения закона или защиты сервиса.</p>
        </article>
        <article class="glass-card legal-card">
          <h3>Пользовательское соглашение</h3>
          <ul>
            <li>Указывайте корректные данные и проверяйте параметры заказа.</li>
            <li>Не используйте сервис в противоправных целях и не нарушайте его работу.</li>
            <li>Сервис не отвечает за ошибки пользователя в нике, сервере и способе получения.</li>
            <li>Сервис не отвечает за сбои Telegram, платёжных систем и игровых платформ.</li>
          </ul>
        </article>
        <button class="primary-button" type="button" data-external="support">Связаться с поддержкой</button>
      </div>
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
  navigate("action");
}

function chooseAction(action) {
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

function updatePrice() {
  const input = document.getElementById("buyAmount");
  const moneyInput = document.getElementById("moneyAmount");
  const promoInput = document.getElementById("buyPromo");
  const project = getProject();
  if (!input || !project) return;
  const amount = Number(input.value);
  const promoCode = promoInput?.value || "";
  const price = calculatePrice(project, amount, promoCode);
  const totalNode = document.getElementById("totalPrice");
  const rateNode = document.getElementById("rateLabel");
  const discountNode = document.getElementById("discountLabel");
  const promoStatus = document.getElementById("promoStatus");
  if (moneyInput) moneyInput.value = price.total > 0 ? Math.round(price.total) : "";
  if (totalNode) totalNode.textContent = formatMoney(price.total);
  if (rateNode) {
    rateNode.textContent = project.id === "standoff-2"
      ? `${price.unitPrice} ₽ за 1000G`
      : `${price.unitPrice} ₽ за кк`;
  }
  if (discountNode) {
    discountNode.textContent = price.discount > 0
      ? `Скидка ${price.promoPercent}%: −${formatMoney(price.discount)}`
      : "";
    discountNode.classList.toggle("is-visible", price.discount > 0);
  }
  if (promoStatus) {
    const normalizedCode = promoCode.trim().toUpperCase();
    promoStatus.className = "promo-status";
    if (!normalizedCode) {
      promoStatus.textContent = "";
    } else if (price.promoPercent) {
      promoStatus.textContent = `Промокод активирован: скидка ${price.promoPercent}%`;
      promoStatus.classList.add("is-success");
    } else {
      promoStatus.textContent = "Промокод не найден — заказ будет без скидки";
      promoStatus.classList.add("is-warning");
    }
  }
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
  const amount = calculateAmountFromMoney(project, Number(moneyInput.value), promoInput?.value || "");
  amountInput.value = amount > 0 ? Number(amount.toFixed(2)).toString() : "";
  const price = calculatePrice(project, amount, promoInput?.value || "");
  const totalNode = document.getElementById("totalPrice");
  const rateNode = document.getElementById("rateLabel");
  const discountNode = document.getElementById("discountLabel");
  if (totalNode) totalNode.textContent = formatMoney(Number(moneyInput.value) || 0);
  if (rateNode) {
    rateNode.textContent = project.id === "standoff-2"
      ? `${price.unitPrice} ₽ за 1000G`
      : `${price.unitPrice} ₽ за кк`;
  }
  if (discountNode) {
    discountNode.textContent = price.discount > 0
      ? `Включена скидка ${price.promoPercent}%`
      : "";
    discountNode.classList.toggle("is-visible", price.discount > 0);
  }
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

async function submitPurchase(form) {
  if (!validateForm(form)) return;
  const project = getProject();
  const amount = Number(form.elements.amount.value);
  const promoCode = form.elements.promo.value.trim().toUpperCase();
  const price = calculatePrice(project, amount, promoCode);
  const payload = {
    game: project.name,
    server: getOrderServerLabel(project, state.selectedServer),
    nickname: form.elements.nickname.value.trim(),
    promo: promoCode,
    amount_kk: Number(amount.toFixed(2)),
    delivery_type: state.deliveryType === "bank" ? "Банком" : "Трейдом",
    bank_account: state.deliveryType === "bank" ? form.elements.bank_account.value.trim() : ""
  };

  if (state.deliveryType === "bank" && !payload.bank_account) {
    form.elements.bank_account.setCustomValidity("Укажите номер игрового счёта");
    form.elements.bank_account.reportValidity();
    form.elements.bank_account.addEventListener("input", () => {
      form.elements.bank_account.setCustomValidity("");
    }, { once: true });
    return;
  }
  if (state.deliveryType === "bank" && !/^\d+$/.test(payload.bank_account)) {
    form.elements.bank_account.setCustomValidity("Номер счёта должен состоять только из цифр");
    form.elements.bank_account.reportValidity();
    form.elements.bank_account.addEventListener("input", () => {
      form.elements.bank_account.setCustomValidity("");
    }, { once: true });
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

    const orders = getLocalOrders();
    orders.unshift({
      id: createdOrder?.order_id || Math.random().toString(16).slice(2, 6).toUpperCase(),
      game: project.name,
      server: state.selectedServer,
      amount: `${amount.toLocaleString("ru-RU")} ${project.unit}`,
      total: formatMoney(price.total),
      totalValue: price.total,
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
      openExternal(paymentUrl);
    } else {
      showToast("Заказ создан и готов к оплате");
      state.history = [];
      navigate("orders", { replace: true });
    }
  } catch (error) {
    console.error(error);
    showToast(`Не удалось создать заказ: ${error.message}`);
    submitButton.disabled = false;
    submitButton.innerHTML = `Перейти к оплате <span class="button-arrow">${icon("arrow-right")}</span>`;
  }
}

function submitSale(form) {
  if (!validateForm(form)) return;
  const project = getProject();
  const nickname = form.elements.nickname.value.trim();
  const amount = Number(form.elements.amount.value);
  const comment = form.elements.comment.value.trim();
  const message = [
    "Здравствуйте! Хочу продать игровую валюту.",
    `Игра: ${project.name}`,
    `Сервер: ${state.selectedServer}`,
    `Ник: ${nickname}`,
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
    openReviewModal();
    haptic();
    return;
  }

  const externalButton = event.target.closest("[data-external]");
  if (externalButton) {
    const urls = {
      support: SUPPORT_URL,
      "reviews-telegram": REVIEWS_TELEGRAM_URL,
      "reviews-vk": REVIEWS_VK_URL
    };
    openExternal(urls[externalButton.dataset.external]);
    haptic();
    return;
  }

  if (event.target.closest("[data-copy-referral]")) {
    const user = getTelegramUser();
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
  if (event.target.matches(".modal-backdrop") || event.target.closest(".close-button")) {
    closeModal();
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
    tg.setBottomBarColor?.("#0f1628");
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
loadRemoteReviews();
checkAccess();

window.addEventListener?.("pagehide", saveNavigationSession);
