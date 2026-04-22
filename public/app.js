const STORAGE_KEY = "shortly:results";

const form = document.getElementById("shorten-form");
const input = document.getElementById("url-input");
const field = input.closest(".field");
const errorEl = document.getElementById("url-error");
const resultsEl = document.getElementById("results");
const toggle = document.querySelector(".nav-toggle");
const menu = document.querySelector(".nav-menu");

toggle.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  toggle.setAttribute("aria-expanded", String(open));
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  field.classList.add("invalid");
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
  field.classList.remove("invalid");
}

input.addEventListener("input", clearError);

function loadResults() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveResults(results) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results.slice(0, 10)));
  } catch {
    /* ignore quota errors */
  }
}

function renderResults(results) {
  resultsEl.innerHTML = "";
  for (const r of results) {
    const li = document.createElement("li");
    li.className = "result";
    li.innerHTML = `
      <span class="orig"></span>
      <a class="short" target="_blank" rel="noopener"></a>
      <button type="button" class="copy">Copy</button>
    `;
    li.querySelector(".orig").textContent = r.originalUrl;
    const shortAnchor = li.querySelector(".short");
    shortAnchor.textContent = r.shortUrl;
    shortAnchor.href = r.shortUrl;
    const copyBtn = li.querySelector(".copy");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(r.shortUrl);
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      } catch {
        showError("Impossible de copier dans le presse-papiers");
      }
    });
    resultsEl.appendChild(li);
  }
}

renderResults(loadResults());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const value = input.value.trim();
  if (!value) {
    showError("Please add a link");
    return;
  }

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Shortening…";

  try {
    const response = await fetch("/api/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.error || "Quelque chose s'est mal passé");
      return;
    }
    const results = [data, ...loadResults().filter((r) => r.shortCode !== data.shortCode)];
    saveResults(results);
    renderResults(results);
    input.value = "";
  } catch {
    showError("Erreur réseau, réessayez");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});
