const HISTORY_KEY = "github-finder-history";
const FAVORITES_KEY = "github-finder-favorites";
const THEME_KEY = "github-finder-theme";

const form = document.querySelector("#search-form");
const usernameInput = document.querySelector("#username");
const searchButton = document.querySelector("#search-button");
const message = document.querySelector("#message");
const profileSection = document.querySelector("#profile");
const historyList = document.querySelector("#history");
const favoritesList = document.querySelector("#favorites");

let currentUser = null;
let requestId = 0;

function getSaved(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error(`Tidak dapat membaca ${key}:`, error);
    return [];
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Tidak dapat menyimpan ${key}:`, error);
    setMessage("Penyimpanan browser tidak tersedia.", true);
    return false;
  }
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function renderSavedList(element, profiles) {
  element.replaceChildren();

  profiles.forEach((user) => {
    const button = document.createElement("button");
    button.className = "saved-pill";
    button.type = "button";
    button.dataset.username = user.login;

    const image = document.createElement("img");
    image.src = user.avatar_url;
    image.alt = "";

    const name = document.createElement("span");
    name.textContent = user.name || user.login;

    button.append(image, name);
    element.append(button);
  });
}

function renderSaved() {
  renderSavedList(historyList, getSaved(HISTORY_KEY));
  renderSavedList(favoritesList, getSaved(FAVORITES_KEY));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderProfile(user) {
  currentUser = user;

  const favorites = getSaved(FAVORITES_KEY);
  const isFavorite = favorites.some(
    (item) => item.login.toLowerCase() === user.login.toLowerCase()
  );

  profileSection.innerHTML = `
    <article class="profile-card">
      <img class="avatar" src="${escapeHtml(user.avatar_url)}"
        alt="Foto profil ${escapeHtml(user.login)}">
      <div>
        <h2>${escapeHtml(user.name || user.login)}</h2>
        <div class="login">@${escapeHtml(user.login)}</div>
        <p class="bio">${escapeHtml(user.bio || "Bio belum tersedia.")}</p>
        <div class="stats">
          <span><strong>${user.followers.toLocaleString("id-ID")}</strong> followers</span>
          <span><strong>${user.following.toLocaleString("id-ID")}</strong> following</span>
          <span><strong>${user.public_repos.toLocaleString("id-ID")}</strong> repositori</span>
        </div>
        <a class="profile-link" href="${escapeHtml(user.html_url)}"
          target="_blank" rel="noreferrer">Lihat profil GitHub ↗</a><br>
        <button class="favorite-button" id="favorite-button" type="button">
          ${isFavorite ? "★ Hapus dari favorit" : "☆ Simpan favorit"}
        </button>
      </div>
    </article>
    <div class="section-heading repo-heading">
      <h2>Repositori populer</h2>
    </div>
    <div class="repo-list" id="repo-list">Memuat repositori...</div>
  `;

  document.querySelector("#favorite-button").addEventListener("click", toggleFavorite);
}

async function loadRepos(user, thisRequest) {
  const repoList = document.querySelector("#repo-list");

  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(user.login)}/repos?per_page=100&sort=updated`
    );

    if (!response.ok) {
      throw new Error(`GitHub API mengembalikan kesalahan (${response.status}).`);
    }

    const repos = await response.json();
    if (thisRequest !== requestId) return;

    const popularRepos = repos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6);

    if (popularRepos.length === 0) {
      repoList.textContent = "Belum ada repositori publik.";
      return;
    }

    repoList.innerHTML = popularRepos.map((repo) => `
      <article class="repo-card">
        <a href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(repo.name)}
        </a>
        <p>${escapeHtml(repo.description || "Tidak ada deskripsi.")}</p>
        <div class="repo-meta">
          ${escapeHtml(repo.language || "Bahasa tidak dicantumkan")}
          · ★ ${repo.stargazers_count.toLocaleString("id-ID")}
        </div>
      </article>
    `).join("");
  } catch (error) {
    if (thisRequest !== requestId) return;
    console.error("Gagal memuat repositori:", error);
    repoList.textContent = "Repositori gagal dimuat. Silakan coba lagi.";
  }
}

function toggleFavorite() {
  if (!currentUser) return;

  const favorites = getSaved(FAVORITES_KEY);
  const exists = favorites.some(
    (user) => user.login.toLowerCase() === currentUser.login.toLowerCase()
  );

  const updated = exists
    ? favorites.filter(
        (user) => user.login.toLowerCase() !== currentUser.login.toLowerCase()
      )
    : [currentUser, ...favorites].slice(0, 12);

  if (save(FAVORITES_KEY, updated)) {
    renderSaved();
    renderProfile(currentUser);
    loadRepos(currentUser, requestId);
  }
}

async function searchUser(value) {
  const username = value.trim().replace(/^@/, "");
  if (!username) return;

  const thisRequest = ++requestId;
  usernameInput.value = username;
  searchButton.disabled = true;
  searchButton.textContent = "Mencari...";
  setMessage(`Mencari profil @${username}...`);
  profileSection.replaceChildren();

  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );

    if (response.status === 404) {
      throw new Error(`Username "${username}" tidak ditemukan. Periksa ejaannya.`);
    }
    if (response.status === 403 || response.status === 429) {
      throw new Error("Batas permintaan GitHub API tercapai. Coba lagi nanti.");
    }
    if (!response.ok) {
      throw new Error(`GitHub API mengembalikan kesalahan (${response.status}).`);
    }

    const user = await response.json();
    if (thisRequest !== requestId) return;

    renderProfile(user);

    const history = getSaved(HISTORY_KEY).filter(
      (item) => item.login.toLowerCase() !== user.login.toLowerCase()
    );
    if (save(HISTORY_KEY, [user, ...history].slice(0, 6))) renderSaved();

    setMessage("");
    await loadRepos(user, thisRequest);
  } catch (error) {
    if (thisRequest !== requestId) return;
    console.error("Pencarian GitHub gagal:", error);
    setMessage(
      error instanceof TypeError
        ? "Tidak dapat terhubung ke GitHub. Periksa koneksi internet."
        : error.message,
      true
    );
  } finally {
    if (thisRequest === requestId) {
      searchButton.disabled = false;
      searchButton.textContent = "Cari";
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchUser(usernameInput.value);
});

document.addEventListener("click", (event) => {
  const savedProfile = event.target.closest(".saved-pill");
  if (savedProfile) searchUser(savedProfile.dataset.username);
});

document.querySelector("#clear-history").addEventListener("click", () => {
  if (save(HISTORY_KEY, [])) renderSaved();
});

const themeToggle = document.querySelector("#theme-toggle");

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");

themeToggle.addEventListener("click", () => {
  const theme = document.body.classList.contains("dark") ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  } catch (error) {
    console.error("Tidak dapat menyimpan tema:", error);
    applyTheme(theme);
  }
});

renderSaved();