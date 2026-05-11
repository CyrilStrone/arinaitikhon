const preloader = document.querySelector("#preloader");
const preloaderPercent = document.querySelector("#preloader-percent");
const themeColorMeta = document.querySelector("meta[name='theme-color']");
const form = document.querySelector("#rsvp-form");
const message = document.querySelector("#form-message");
const submitButton = form?.querySelector("button[type='submit']");
const musicButton = document.querySelector(".music-button");
const weddingMusic = document.querySelector("#wedding-music");
const revealItems = document.querySelectorAll(".reveal");
const guestList = document.querySelector("#guest-list");
const addGuestButton = document.querySelector("#add-guest");
const drinkOtherToggle = document.querySelector("#drink-other-toggle");
const drinkOtherInput = document.querySelector("#drink-other");
const allergyYesInput = document.querySelector("#allergy-yes");
const allergyInputs = document.querySelectorAll("input[name='hasAllergies']");
const allergiesInput = document.querySelector("#allergies");
const countdown = document.querySelector(".countdown");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const themeColor = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();

if (themeColorMeta && themeColor) {
  themeColorMeta.setAttribute("content", themeColor);
}

const resetInitialScroll = () => {
  if (window.location.hash) {
    return;
  }

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;

  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previousScrollBehavior;
};

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

resetInitialScroll();
window.addEventListener("pageshow", resetInitialScroll);
window.addEventListener("load", () => window.setTimeout(resetInitialScroll, 0), { once: true });

let loadingPercent = 0;
let preloaderInterval;
let preloaderFinished = false;

if (preloader && preloaderPercent) {
  preloaderInterval = window.setInterval(() => {
    if (loadingPercent >= 90) {
      return;
    }

    loadingPercent += 1;
    preloaderPercent.textContent = `${loadingPercent}%`;
  }, 28);

  const finishPreloader = () => {
    if (preloaderFinished) {
      return;
    }

    preloaderFinished = true;
    window.clearInterval(preloaderInterval);

    const finishInterval = window.setInterval(() => {
      if (loadingPercent < 100) {
        loadingPercent += 1;
        preloaderPercent.textContent = `${loadingPercent}%`;
        return;
      }

      window.clearInterval(finishInterval);
      preloader.classList.add("preloader--hidden");
      window.setTimeout(() => preloader.remove(), 850);
    }, 14);
  };

  window.addEventListener("load", finishPreloader, { once: true });
  window.setTimeout(finishPreloader, 2600);
}

if (prefersReducedMotion) {
  revealItems.forEach((item) => item.classList.add("reveal--visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("reveal--visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.16,
    },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

const setMessage = (text, type) => {
  if (!message) {
    return;
  }

  message.textContent = text;
  message.className = `rsvp-form__message ${type ? `rsvp-form__message--${type}` : ""}`.trim();
};

const toggleExtraInput = (input, isEnabled) => {
  if (!input) {
    return;
  }

  input.hidden = !isEnabled;
  input.disabled = !isEnabled;
  input.required = isEnabled;

  if (!isEnabled) {
    input.value = "";
  }
};

const syncConditionalFields = () => {
  toggleExtraInput(drinkOtherInput, Boolean(drinkOtherToggle?.checked));
  toggleExtraInput(allergiesInput, Boolean(allergyYesInput?.checked));
};

const createGuestField = () => {
  if (!guestList) {
    return;
  }

  const item = document.createElement("div");
  item.className = "rsvp-form__guest";

  const input = document.createElement("input");
  input.type = "text";
  input.name = "guestFullName";
  input.placeholder = "Имя Фамилия";
  input.maxLength = 120;
  input.autocomplete = "off";
  input.required = true;

  const removeButton = document.createElement("button");
  removeButton.className = "rsvp-form__guest-remove";
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", "Удалить гостя");
  removeButton.textContent = "−";
  removeButton.addEventListener("click", () => item.remove());

  item.append(input, removeButton);
  guestList.append(item);
  input.focus();
};

const collectFormData = () => {
  const data = new FormData(form);
  const guests = guestList
    ? [...guestList.querySelectorAll("input[name='guestFullName']")]
      .map((input) => input.value.trim())
      .filter(Boolean)
      .map((fullName) => ({ fullName }))
    : [];
  const hasAllergies = data.get("hasAllergies") === "yes";

  return {
    fullName: String(data.get("fullName") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    attendance: String(data.get("attendance") || ""),
    guests,
    drinks: data.getAll("drinks"),
    drinkOther: String(data.get("drinkOther") || "").trim(),
    hasAllergies,
    allergies: hasAllergies ? String(data.get("allergies") || "").trim() : "",
    playlistSong: String(data.get("playlistSong") || "").trim(),
  };
};

const setMusicState = (isPlaying) => {
  if (!musicButton) {
    return;
  }

  musicButton.setAttribute("aria-pressed", String(isPlaying));
};

if (weddingMusic instanceof HTMLAudioElement) {
  weddingMusic.volume = 0.42;
}

drinkOtherToggle?.addEventListener("change", syncConditionalFields);
allergyInputs.forEach((input) => input.addEventListener("change", syncConditionalFields));
addGuestButton?.addEventListener("click", createGuestField);
form?.addEventListener("reset", () => {
  window.setTimeout(() => {
    if (guestList) {
      guestList.innerHTML = "";
    }

    syncConditionalFields();
  });
});
syncConditionalFields();

if (countdown instanceof HTMLElement) {
  const targetTime = new Date(countdown.dataset.countdownTarget || "").getTime();
  const daysElement = countdown.querySelector("[data-countdown-days]");
  const hoursElement = countdown.querySelector("[data-countdown-hours]");
  const minutesElement = countdown.querySelector("[data-countdown-minutes]");
  const secondsElement = countdown.querySelector("[data-countdown-seconds]");
  const pad = (value) => String(value).padStart(2, "0");

  const updateCountdown = () => {
    const diff = Number.isFinite(targetTime) ? Math.max(0, targetTime - Date.now()) : 0;
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (daysElement) {
      daysElement.textContent = pad(days);
    }

    if (hoursElement) {
      hoursElement.textContent = pad(hours);
    }

    if (minutesElement) {
      minutesElement.textContent = pad(minutes);
    }

    if (secondsElement) {
      secondsElement.textContent = pad(seconds);
    }
  };

  updateCountdown();
  window.setInterval(updateCountdown, 1000);
}

musicButton?.addEventListener("click", async () => {
  if (!(weddingMusic instanceof HTMLAudioElement)) {
    return;
  }

  if (weddingMusic.paused) {
    try {
      await weddingMusic.play();
      setMusicState(true);
    } catch (error) {
      setMusicState(false);
    }
    return;
  }

  weddingMusic.pause();
  setMusicState(false);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("", "");

  if (!form.reportValidity()) {
    setMessage("Проверьте обязательные поля.", "error");
    return;
  }

  const payload = collectFormData();

  if (payload.hasAllergies && /[.,]/.test(payload.allergies)) {
    setMessage("Укажите аллергии без точек и запятых.", "error");
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Отправляем...";
  }

  try {
    const response = await fetch("/api/rsvp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Не получилось отправить форму.");
    }

    form.reset();
    setMessage("Спасибо! Ответ сохранен.", "success");
  } catch (error) {
    setMessage(error.message || "Не получилось отправить форму.", "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Отправить";
    }
  }
});

function updateScale() {
  const minWidth = 200;
  const maxWidth = 560;
  const minScale = 0.27;
  const maxScale = 1;

  const width = window.innerWidth;

  const progress = Math.min(
    Math.max((width - minWidth) / (maxWidth - minWidth), 0),
    1
  );

  const scale = minScale + progress * (maxScale - minScale);

  document.documentElement.style.setProperty("--scale", String(scale));
}

window.addEventListener("DOMContentLoaded", updateScale);
window.addEventListener("resize", updateScale);
