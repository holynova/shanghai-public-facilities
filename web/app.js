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

form.addEventListener("submit", async (event) => {
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

async function searchNearby(address) {
  if (address.length < 2) {
    renderMessage("请输入更完整的地址。", "error");
    addressInput.focus();
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/nearest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "查询失败，请稍后重试。");
    saveSearchHistory(address);
    renderPlaces(payload);
  } catch (error) {
    renderMessage(error instanceof Error ? error.message : "查询失败，请稍后重试。", "error");
  } finally {
    setLoading(false);
  }
}

categoryNav.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-target]");
  if (!target) return;
  document.querySelector(`#${target.dataset.target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

function setLoading(loading) {
  results.setAttribute("aria-busy", String(loading));
  button.disabled = loading;
  button.setAttribute("aria-label", loading ? "正在定位" : "开始查询");
  if (loading) {
    status.textContent = "正在定位并计算各类别最近地点";
    categoryNav.hidden = true;
    resultContent.className = "loading-state";
    resultContent.innerHTML = "<span></span><span></span><span></span><p>正在读取附近换乘目录</p>";
  }
}

function renderPlaces(payload) {
  const { origin, groups } = payload;
  status.textContent = `${origin.formattedAddress} · ${formatCoordinate(origin.latitude, origin.longitude)}`;
  categoryNav.hidden = false;
  categoryNav.innerHTML = groups.map((group) => {
    const meta = categoryMeta(group.category);
    return `<button type="button" data-target="${groupId(group.category)}" style="--route:${meta.color}"><i></i><span>${meta.label}</span><b>${group.places.length}</b></button>`;
  }).join("");
  resultContent.className = "place-list";
  resultContent.innerHTML = groups.map((group, groupIndex) => {
    const meta = categoryMeta(group.category);
    return `
      <section class="category-group" id="${groupId(group.category)}" style="--route:${meta.color}" aria-label="${escapeHtml(meta.label)}">
        <header class="category-heading">
          <p>${escapeHtml(meta.label)}</p>
        </header>
        ${group.places.map((place, placeIndex) => `
          <article class="place">
            <div class="place-main">
              <h3>${escapeHtml(place.name)}</h3>
              ${renderAlternateNames(place)}
              ${place.metroLines?.length ? `<p class="metro-lines">${escapeHtml(place.metroLines.join(" · "))}</p>` : ""}
              <p class="address">${escapeHtml(place.district || "上海")}${place.address ? " · " + escapeHtml(place.address) : ""}</p>
            </div>
            <div class="distance"><strong>${formatDistance(place.distanceMeters)}</strong><span>直线距离</span></div>
          </article>
        `).join("")}
      </section>
    `;
  }).join("");
}

function renderAlternateNames(place) {
  const alternateNames = (place.alternateNames || []).filter((name) => name !== place.name);
  if (alternateNames.length === 0) return "";
  return `<p class="merged-names">同址/近邻服务点 · ${escapeHtml(alternateNames.join(" · "))}</p>`;
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
  } catch {
    return [];
  }
}

function renderSearchHistory(history = getSearchHistory()) {
  searchHistory.hidden = history.length === 0;
  historyItems.innerHTML = history.map((address) => `<button type="button" data-address="${escapeHtml(address)}">${escapeHtml(address)}</button>`).join("");
}

function renderMessage(message, type) {
  categoryNav.hidden = true;
  status.textContent = type === "error" ? "无法完成定位" : "输入地址后开始检索";
  resultContent.className = `empty-state ${type}`;
  resultContent.innerHTML = `<p class="empty-kicker">${type === "error" ? "LOCATION ERROR" : "NEARBY / 01"}</p><h3>${escapeHtml(message)}</h3><p>请补充区、路名或门牌号后重试。</p>`;
}

function formatDistance(meters) { return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`; }
function formatCoordinate(latitude, longitude) { return `${latitude.toFixed(5)}°N, ${longitude.toFixed(5)}°E`; }
function groupId(category) { return `route-${category.replaceAll(".", "-")}`; }

function categoryMeta(category) {
  const categories = {
    "culture.art_gallery": { label: "美术馆", color: "#e54b3f" },
    "culture.concert_hall": { label: "音乐厅", color: "#9a4f9e" },
    "culture.museum": { label: "博物馆", color: "#ce3347" },
    "commerce.big_box_retail": { label: "大型仓储零售", color: "#c78c00" },
    "commerce.large_mall": { label: "大型商场", color: "#de6a18" },
    "community.civic_service_center": { label: "社区文化与党群服务中心", color: "#00888f" },
    "landmark.city_landmark": { label: "上海地标", color: "#715bba" },
    "library.all": { label: "图书馆", color: "#3474b9" },
    "medical.tertiary_a": { label: "三级甲等医院", color: "#bd2d45" },
    "medical.other": { label: "其他医疗机构", color: "#de6a79" },
    "park.major_city_park": { label: "大型市级公园", color: "#23834d" },
    "park.neighborhood_park": { label: "街区与口袋公园", color: "#68a52b" },
    "transit.metro_station": { label: "地铁站", color: "#009a74" },
    "transport.airport": { label: "机场", color: "#3c87b9" },
    "transport.railway_station": { label: "火车站", color: "#df831e" },
  };
  return categories[category] || { label: category, color: "#617077" };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

renderSearchHistory();
