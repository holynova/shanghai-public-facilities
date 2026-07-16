const form = document.querySelector("#address-form");
const addressInput = document.querySelector("#address");
const resultContent = document.querySelector("#result-content");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const button = form.querySelector("button");
const categoryNav = document.querySelector("#category-nav");
const searchHistory = document.querySelector("#search-history");
const historyItems = document.querySelector("#history-items");
const HISTORY_STORAGE_KEY = "shanghai-place-search-history";
const HISTORY_LIMIT = 5;

let facilities = [];
let amapReady;

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

categoryNav.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-target]");
  if (!target) return;
  document.querySelector(`#${target.dataset.target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

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
    resultContent.className = "loading-state";
    resultContent.innerHTML = "<span></span><span></span><span></span><p>正在查询高德地图</p>";
  }
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
  status.textContent = `${origin.formattedAddress} · ${formatCoordinate(origin.latitude, origin.longitude)}`;
  categoryNav.hidden = false;
  categoryNav.innerHTML = groups.map((group) => {
    const meta = categoryMeta(group.category);
    return `<button type="button" data-target="${groupId(group.category)}" style="--route:${meta.color}"><i></i><span>${meta.label}</span></button>`;
  }).join("");
  resultContent.className = "place-list";
  resultContent.innerHTML = groups.map((group) => {
    const meta = categoryMeta(group.category);
    return `<section class="category-group" id="${groupId(group.category)}" style="--route:${meta.color}" aria-label="${escapeHtml(meta.label)}"><header class="category-heading"><p>${escapeHtml(meta.label)}</p></header>${group.places.map((place) => `<article class="place"><div class="place-main"><h3>${escapeHtml(place.name)}</h3>${renderAlternateNames(place)}${place.metroLines?.length ? `<p class="metro-lines">${escapeHtml(place.metroLines.join(" · "))}</p>` : ""}<p class="address">${escapeHtml(place.district || "上海")}${place.address ? " · " + escapeHtml(place.address) : ""}</p></div><div class="distance"><strong>${formatDistance(place.distanceMeters)}</strong><span>直线距离</span></div></article>`).join("")}</section>`;
  }).join("");
}

function renderAlternateNames(place) {
  const alternateNames = (place.alternateNames || []).filter((name) => name !== place.name);
  return alternateNames.length ? `<p class="merged-names">同址/近邻服务点 · ${escapeHtml(alternateNames.join(" · "))}</p>` : "";
}

function renderMessage(message, type) {
  categoryNav.hidden = true;
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
  return ["culture.museum", "culture.art_gallery", "culture.concert_hall", "library.all", "community.civic_service_center", "transit.metro_station", "transport.railway_station", "transport.airport", "park.major_city_park", "park.neighborhood_park", "medical.tertiary_a", "medical.other", "commerce.big_box_retail", "commerce.large_mall", "landmark.city_landmark"].indexOf(category);
}

function categoryMeta(category) {
  const categories = {
    "culture.art_gallery": { label: "美术馆", color: "#e54b3f" }, "culture.concert_hall": { label: "音乐厅", color: "#9a4f9e" }, "culture.museum": { label: "博物馆", color: "#ce3347" }, "commerce.big_box_retail": { label: "大型仓储零售", color: "#c78c00" }, "commerce.large_mall": { label: "大型商场", color: "#de6a18" }, "community.civic_service_center": { label: "社区文化与党群服务中心", color: "#00888f" }, "landmark.city_landmark": { label: "上海地标", color: "#715bba" }, "library.all": { label: "图书馆", color: "#3474b9" }, "medical.tertiary_a": { label: "三级甲等医院", color: "#bd2d45" }, "medical.other": { label: "其他医疗机构", color: "#de6a79" }, "park.major_city_park": { label: "大型市级公园", color: "#23834d" }, "park.neighborhood_park": { label: "街区与口袋公园", color: "#68a52b" }, "transit.metro_station": { label: "地铁站", color: "#009a74" }, "transport.airport": { label: "机场", color: "#3c87b9" }, "transport.railway_station": { label: "火车站", color: "#df831e" },
  };
  return categories[category] || { label: category, color: "#617077" };
}

function formatDistance(meters) { return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`; }
function formatCoordinate(latitude, longitude) { return `${latitude.toFixed(5)}°N, ${longitude.toFixed(5)}°E`; }
function groupId(category) { return `route-${category.replaceAll(".", "-")}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

renderSearchHistory();
