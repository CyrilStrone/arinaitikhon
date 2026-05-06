const form = document.querySelector("#rsvp-form");
const message = document.querySelector("#form-message");
const submitButton = form.querySelector("button[type='submit']");
const musicButton = document.querySelector(".music-button");

const setMessage = (text, type) => {
  message.textContent = text;
  message.className = `form-message ${type ? `is-${type}` : ""}`.trim();
};

const collectFormData = () => {
  const data = new FormData(form);

  return {
    fullName: String(data.get("fullName") || "").trim(),
    attendance: String(data.get("attendance") || ""),
    allergies: String(data.get("allergies") || "").trim(),
    drinks: data.getAll("drinks"),
  };
};

musicButton.addEventListener("click", () => {
  const nextState = musicButton.getAttribute("aria-pressed") !== "true";
  musicButton.setAttribute("aria-pressed", String(nextState));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("", "");

  if (!form.reportValidity()) {
    setMessage("Проверьте обязательные поля.", "error");
    return;
  }

  const payload = collectFormData();

  submitButton.disabled = true;
  submitButton.textContent = "Отправляем...";

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
    setMessage("Спасибо! Ответ сохранён.", "success");
  } catch (error) {
    setMessage(error.message || "Не получилось отправить форму.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Отправить";
  }
});
