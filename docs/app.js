const form = document.querySelector("#address-form");
const addressInput = document.querySelector("#address");
const resultContent = document.querySelector("#result-content");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const button = form.querySelector("button");
const categoryNav = document.querySelector("#category-nav");
const scoreContent = document.querySelector("#score-content");
const searchHistory = document.querySelector("#search-history");
const historyItems = document.querySelector("#history-items");
const currentLocationButton = document.querySelector("#current-location");
const shareDialog = document.querySelector("#share-dialog");
const shareCloseButton = document.querySelector("#share-close");
const nativeShareButton = document.querySelector("#native-share");
const copyShareButton = document.querySelector("#copy-share");
const shareAddress = document.querySelector("#share-address");
const shareScore = document.querySelector("#share-score");
const shareQr = document.querySelector("#share-qr");
const shareLink = document.querySelector("#share-link");
const shareFeedback = document.querySelector("#share-feedback");
const HISTORY_STORAGE_KEY = "shanghai-place-search-history";
const HISTORY_LIMIT = 5;

let facilities = [];
let amapReady;
let latestShare;

const catalogueReady = fetch("data/facilities.json")
  .then((response) => {
    if (!response.ok) throw new Error("地点目录加载失败，请刷新页面重试。");
    return response.json();
  })
  .then((catalogue) => {
    facilities = catalogue.facilities ?? [];
    if (facilities.length === 0) throw new Error("地点目录为空。");
    status.textContent = `已加载 ${facilities.length.toLocaleString("zh-CN")} 处上海地点`;
    resultContent.innerHTML = "<h3>输入地址开始查找</h3><p>每个类别显示最近三处地点。</p>";
  })
  .catch((error) => renderMessage(error instanceof Error ? error.message : "地点目录加载失败。", "error"));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchNearby(addressInput.value.trim());
});

historyItems.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-address]");
  if (!target) return;
  const address = target.dataset.address;
  addressInput.value = address;
  searchNearby(address);
});

currentLocationButton.addEventListener("click", async () => {
  setLocationLoading(true);
  setLoading(true);
  try {
    await catalogueReady;
    const origin = await getCurrentLocation();
    renderPlaces({ origin, groups: findNearestByCategory(facilities, origin) });
  } catch (error) {
    renderMessage(error instanceof Error ? error.message : "无法获取当前位置。", "error");
  } finally {
    setLoading(false);
    setLocationLoading(false);
  }
});

categoryNav.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-target]");
  if (!target) return;
  document.querySelector(`#${target.dataset.target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

scoreContent.addEventListener("click", (event) => {
  if (!event.target.closest("#open-share")) return;
  openShareDialog();
});

shareCloseButton.addEventListener("click", () => shareDialog.close());
shareDialog.addEventListener("click", (event) => {
  if (event.target === shareDialog) shareDialog.close();
});
nativeShareButton.addEventListener("click", shareCurrentResult);
copyShareButton.addEventListener("click", copyProjectLink);

async function searchNearby(address) {
  if (address.length < 2) {
    renderMessage("请输入更完整的地址。", "error");
    addressInput.focus();
    return;
  }

  setLoading(true);
  try {
    await catalogueReady;
    const origin = await geocodeAddress(address);
    saveSearchHistory(address);
    renderPlaces({ origin, groups: findNearestByCategory(facilities, origin) });
  } catch (error) {
    renderMessage(error instanceof Error ? error.message : "查询失败，请稍后重试。", "error");
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  results.setAttribute("aria-busy", String(loading));
  button.disabled = loading;
  button.setAttribute("aria-label", loading ? "正在定位" : "开始查询");
  if (loading) {
    status.textContent = "正在定位并计算各类别最近地点";
    categoryNav.hidden = true;
    scoreContent.hidden = true;
    scoreContent.innerHTML = "";
    resultContent.className = "loading-state";
    resultContent.innerHTML = "<span></span><span></span><span></span><p>正在查询高德地图</p>";
  }
}

function setLocationLoading(loading) {
  currentLocationButton.disabled = loading;
  currentLocationButton.querySelector("span").textContent = loading ? "正在定位" : "使用当前位置";
}

function geocodeAddress(address) {
  return loadAmap().then(() => new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("高德地址解析超时，请检查网络或域名白名单。"));
    }, 12_000);
    const geocoder = new window.AMap.Geocoder({ city: "上海市" });
    geocoder.getLocation(address, (status, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const place = result?.geocodes?.[0];
      if (status !== "complete" || result?.info !== "OK" || !place?.location) {
        reject(new Error("没有找到这个地址，请补充区、路名或门牌号。"));
        return;
      }
      resolve({
        formattedAddress: place.formattedAddress || address,
        latitude: Number(place.location.lat),
        longitude: Number(place.location.lng),
      });
    });
  }));
}

function getCurrentLocation() {
  return loadAmapPlugin("AMap.Geolocation", "Geolocation").then(() => new Promise((resolve, reject) => {
    const geolocation = new window.AMap.Geolocation({ enableHighAccuracy: true, timeout: 10_000, convert: true });
    geolocation.getCurrentPosition((status, result) => {
      if (status !== "complete" || !result?.position) {
        reject(new Error("定位失败，请允许浏览器访问位置后重试。"));
        return;
      }
      resolve({
        formattedAddress: result.formattedAddress || "当前位置",
        latitude: Number(result.position.lat),
        longitude: Number(result.position.lng),
      });
    });
  }));
}

function loadAmap() {
  if (amapReady) return amapReady;
  const config = window.AMAP_CONFIG;
  if (!config?.key || !config?.securityJsCode) return Promise.reject(new Error("高德地图配置缺失。"));
  window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
  amapReady = new Promise((resolve, reject) => {
    let finished = false;
    const complete = () => {
      if (finished || !window.AMap?.Geocoder) return;
      finished = true;
      clearInterval(checkReady);
      clearTimeout(timeout);
      resolve();
    };
    const fail = (message) => {
      if (finished) return;
      finished = true;
      clearInterval(checkReady);
      clearTimeout(timeout);
      reject(new Error(message));
    };
    const checkReady = setInterval(complete, 100);
    const timeout = setTimeout(() => fail("高德地图初始化超时，请检查网络或域名白名单。"), 12_000);
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}&plugin=AMap.Geocoder`;
    script.async = true;
    script.onload = complete;
    script.onerror = () => fail("无法连接高德地图，请检查网络或域名白名单。");
    document.head.append(script);
  });
  return amapReady;
}

function loadAmapPlugin(pluginName, className) {
  return loadAmap().then(() => {
    if (window.AMap?.[className]) return undefined;
    return new Promise((resolve, reject) => {
      window.AMap.plugin(pluginName, () => window.AMap?.[className] ? resolve() : reject(new Error("高德定位插件初始化失败。")));
    });
  });
}

function findNearestByCategory(catalogue, origin) {
  const groups = new Map();
  for (const facility of catalogue) {
    const category = displayCategoryFor(facility.category);
    const items = groups.get(category) ?? [];
    items.push(facility);
    groups.set(category, items);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => categorySortOrder(left) - categorySortOrder(right))
    .map(([category, items]) => ({
      category,
      places: items.map((place) => ({ ...place, distanceMeters: nearestDistance(origin, place) }))
        .sort((left, right) => left.distanceMeters - right.distanceMeters)
        .slice(0, 3),
    }));
}

function nearestDistance(origin, place) {
  const locations = place.sourceLocations ?? place.stationLocations ?? [place];
  return Math.round(Math.min(...locations.map((location) => haversineMeters(origin, location))));
}

function haversineMeters(first, second) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLng = toRadians(second.longitude - first.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(first.latitude)) * Math.cos(toRadians(second.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderPlaces(payload) {
  const { origin, groups } = payload;
  const score = calculateConvenienceScore(groups);
  latestShare = { address: origin.formattedAddress, score: score.total };
  status.textContent = origin.formattedAddress;
  scoreContent.hidden = false;
  scoreContent.innerHTML = renderScoreSummary(score);
  categoryNav.hidden = false;
  categoryNav.innerHTML = groups.map((group) => {
    const meta = categoryMeta(group.category);
    return `<button type="button" data-target="${groupId(group.category)}" style="--route:${meta.color}" aria-label="${escapeHtml(meta.label)}" title="${escapeHtml(meta.label)}"><i></i><span>${escapeHtml(meta.shortLabel)}</span></button>`;
  }).join("");
  resultContent.className = "place-list";
  resultContent.innerHTML = groups.map((group) => {
    const meta = categoryMeta(group.category);
    return `<section class="category-group" id="${groupId(group.category)}" style="--route:${meta.color}" aria-label="${escapeHtml(meta.label)}"><header class="category-heading"><p>${escapeHtml(meta.label)}</p></header>${group.places.map((place) => `<article class="place"><div class="place-main"><h3>${escapeHtml(place.name)}</h3>${renderAlternateNames(place)}${place.metroLines?.length ? `<p class="metro-lines">${escapeHtml(place.metroLines.join(" · "))}</p>` : ""}<p class="address">${escapeHtml(place.district || "上海")}${place.address ? " · " + escapeHtml(place.address) : ""}</p></div><div class="distance"><strong>${formatDistance(place.distanceMeters)}</strong><span>直线距离</span></div></article>`).join("")}</section>`;
  }).join("");
}

function calculateConvenienceScore(groups) {
  const byCategory = new Map(groups.map((group) => [group.category, group.places]));
  const categoryScore = (category, maximumDistance) => proximityScore(byCategory.get(category) || [], maximumDistance);
  const dimensions = [
    { label: "交通", maximum: 30, score: 22 * categoryScore("transit.metro_station", 2_000) + 6 * categoryScore("transport.railway_station", 8_000) + 2 * categoryScore("transport.airport", 30_000) },
    { label: "医疗", maximum: 20, score: 12 * categoryScore("medical.tertiary_a", 5_000) + 8 * categoryScore("medical.other", 2_500) },
    { label: "公共服务", maximum: 20, score: 12 * categoryScore("community.civic_service_center", 2_000) + 8 * categoryScore("library.all", 2_500) },
    { label: "文化艺术", maximum: 15, score: 7 * categoryScore("culture.museum", 4_000) + 4 * categoryScore("culture.art_gallery", 4_000) + 4 * categoryScore("culture.concert_hall", 4_000) },
    { label: "生活商业", maximum: 10, score: 4 * categoryScore("commerce.big_box_retail", 5_000) + 6 * categoryScore("commerce.large_mall", 5_000) },
    { label: "绿地休闲", maximum: 5, score: 3 * categoryScore("park.major_city_park", 6_000) + 2 * categoryScore("park.neighborhood_park", 2_000) },
  ].map((dimension) => ({ ...dimension, value: Math.round(dimension.score) }));
  return { total: dimensions.reduce((sum, dimension) => sum + dimension.value, 0), dimensions };
}

function proximityScore(places, maximumDistance) {
  const rankWeights = [0.6, 0.25, 0.15];
  return places.reduce((sum, place, index) => sum + (rankWeights[index] || 0) * Math.max(0, 1 - place.distanceMeters / maximumDistance), 0);
}

function renderScoreSummary(score) {
  return `<section class="score-summary" aria-label="综合便利度评分"><div class="score-total"><span>综合便利度</span><strong>${score.total}<small>/ 100</small></strong><button id="open-share" class="share-trigger" type="button">分享</button></div><div class="score-breakdown">${score.dimensions.map((dimension) => `<div><span>${escapeHtml(dimension.label)}</span><strong>${dimension.value} / ${dimension.maximum}</strong></div>`).join("")}</div><p>按每类最近三处地点的直线距离加权估算，适合作为初步比较。</p></section>`;
}

function projectUrl() { return new URL("./", window.location.href).href; }

function shareText() {
  return `${latestShare.address}附近设施：综合便利度 ${latestShare.score}/100。`;
}

function openShareDialog() {
  if (!latestShare) return;
  const url = projectUrl();
  shareAddress.textContent = latestShare.address;
  shareScore.textContent = latestShare.score;
  shareLink.href = url;
  shareLink.textContent = url.replace(/^https?:\/\//, "");
  shareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(url)}`;
  shareFeedback.textContent = "";
  shareDialog.showModal();
}

async function shareCurrentResult() {
  if (!latestShare) return;
  if (!navigator.share) {
    await copyProjectLink();
    return;
  }
  try {
    await navigator.share({ title: "近邻｜上海公共设施", text: shareText(), url: projectUrl() });
    shareFeedback.textContent = "已打开系统分享。";
  } catch (error) {
    if (error?.name !== "AbortError") shareFeedback.textContent = "系统分享暂不可用，可复制项目链接。";
  }
}

async function copyProjectLink() {
  try {
    await navigator.clipboard.writeText(projectUrl());
    shareFeedback.textContent = "项目链接已复制。";
  } catch {
    shareFeedback.textContent = "复制失败，请长按链接手动复制。";
  }
}

function renderAlternateNames(place) {
  const alternateNames = (place.alternateNames || []).filter((name) => name !== place.name);
  return alternateNames.length ? `<p class="merged-names">同址/近邻服务点 · ${escapeHtml(alternateNames.join(" · "))}</p>` : "";
}

function renderMessage(message, type) {
  categoryNav.hidden = true;
  scoreContent.hidden = true;
  scoreContent.innerHTML = "";
  status.textContent = type === "error" ? "无法完成定位" : "输入地址后开始检索";
  resultContent.className = `empty-state ${type}`;
  resultContent.innerHTML = `<h3>${escapeHtml(message)}</h3><p>请补充区、路名或门牌号后重试。</p>`;
}

function saveSearchHistory(address) {
  const history = [address, ...getSearchHistory().filter((item) => item !== address)].slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  renderSearchHistory(history);
}

function getSearchHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => typeof item === "string" && item.length > 0) : [];
  } catch { return []; }
}

function renderSearchHistory(history = getSearchHistory()) {
  searchHistory.hidden = history.length === 0;
  historyItems.innerHTML = history.map((address) => `<button type="button" data-address="${escapeHtml(address)}">${escapeHtml(address)}</button>`).join("");
}

function displayCategoryFor(category) {
  if (category.startsWith("library.")) return "library.all";
  if (category === "hospital.tertiary_a") return "medical.tertiary_a";
  if (category === "hospital.secondary_a" || category.startsWith("primary_care.")) return "medical.other";
  return category;
}

function categorySortOrder(category) {
  return ["transit.metro_station", "transport.railway_station", "transport.airport", "medical.tertiary_a", "medical.other", "community.civic_service_center", "library.all", "culture.museum", "culture.art_gallery", "culture.concert_hall", "park.major_city_park", "park.neighborhood_park", "commerce.big_box_retail", "commerce.large_mall", "landmark.city_landmark"].indexOf(category);
}

function categoryMeta(category) {
  const categories = {
    "culture.art_gallery": { label: "美术馆", shortLabel: "美术馆", color: "#e54b3f" }, "culture.concert_hall": { label: "音乐厅", shortLabel: "音乐厅", color: "#9a4f9e" }, "culture.museum": { label: "博物馆", shortLabel: "博物馆", color: "#ce3347" }, "commerce.big_box_retail": { label: "大型仓储零售", shortLabel: "仓储零售", color: "#c78c00" }, "commerce.large_mall": { label: "大型商场", shortLabel: "大型商场", color: "#de6a18" }, "community.civic_service_center": { label: "社区文化与党群服务中心", shortLabel: "社区中心", color: "#00888f" }, "landmark.city_landmark": { label: "上海地标", shortLabel: "上海地标", color: "#715bba" }, "library.all": { label: "图书馆", shortLabel: "图书馆", color: "#3474b9" }, "medical.tertiary_a": { label: "三级甲等医院", shortLabel: "三甲医院", color: "#bd2d45" }, "medical.other": { label: "其他医疗机构", shortLabel: "其他医疗", color: "#de6a79" }, "park.major_city_park": { label: "大型市级公园", shortLabel: "市级公园", color: "#23834d" }, "park.neighborhood_park": { label: "街区与口袋公园", shortLabel: "口袋公园", color: "#68a52b" }, "transit.metro_station": { label: "地铁站", shortLabel: "地铁站", color: "#009a74" }, "transport.airport": { label: "机场", shortLabel: "机场", color: "#3c87b9" }, "transport.railway_station": { label: "火车站", shortLabel: "火车站", color: "#df831e" },
  };
  return categories[category] || { label: category, shortLabel: category, color: "#617077" };
}

function formatDistance(meters) { return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`; }
function formatCoordinate(latitude, longitude) { return `${latitude.toFixed(5)}°N, ${longitude.toFixed(5)}°E`; }
function groupId(category) { return `route-${category.replaceAll(".", "-")}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

renderSearchHistory();
