(() => {
  "use strict";

  const STATUS = {
    on: { title: "Світло є", description: "Електропостачання зафіксовано під час останньої перевірки." },
    off: { title: "Світла немає", description: "Електропостачання не зафіксовано під час останньої перевірки." },
    conflict: { title: "Дані різняться", description: "Джерела дають суперечливі сигнали. Статус потребує повторної перевірки." },
    unknown: { title: "Статус невідомий", description: "Немає достатньо актуальних даних про електропостачання." }
  };

  const PERIOD_LABELS = {
    on: "світло є",
    off: "світла немає",
    conflict: "дані різняться",
    unknown: "немає даних"
  };

  const el = (id) => document.getElementById(id);

  function safeStatus(value) {
    return Object.prototype.hasOwnProperty.call(STATUS, value) ? value : "unknown";
  }

  function parseTime(value) {
    if (typeof value !== "string" || !/^([01]\d|2[0-4]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    if (hours === 24 && minutes !== 0) return null;
    return hours * 60 + minutes;
  }

  function formatDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateString || "Дата не вказана";
    return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long" }).format(date);
  }

  function formatDateTime(value, timezone) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "час не вказано";
    try {
      return new Intl.DateTimeFormat("uk-UA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone || "Europe/Kyiv"
      }).format(date);
    } catch {
      return new Intl.DateTimeFormat("uk-UA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
  }

  function setStatus(status) {
    const normalized = safeStatus(status);
    const content = STATUS[normalized];
    document.body.dataset.status = normalized;
    el("status-heading").textContent = content.title;
    el("status-description").textContent = content.description;
  }

  function summarize(periods) {
    let offMinutes = 0;
    for (const period of periods) {
      if (period.status !== "off") continue;
      const start = parseTime(period.start);
      const end = parseTime(period.end);
      if (start !== null && end !== null && end > start) offMinutes += end - start;
    }
    if (!offMinutes) return "без відключень";
    const hours = Math.floor(offMinutes / 60);
    const minutes = offMinutes % 60;
    return `без світла ${hours ? `${hours} год` : ""}${hours && minutes ? " " : ""}${minutes ? `${minutes} хв` : ""}`;
  }

  function validPeriods(periods) {
    if (!Array.isArray(periods)) return [];
    return periods
      .map((period) => ({
        start: period?.start,
        end: period?.end,
        status: safeStatus(period?.status)
      }))
      .filter((period) => {
        const start = parseTime(period.start);
        const end = parseTime(period.end);
        return start !== null && end !== null && end > start;
      })
      .sort((a, b) => parseTime(a.start) - parseTime(b.start));
  }

  function renderSchedule(kind, schedule) {
    const title = el(`${kind}-title`);
    const summary = el(`${kind}-summary`);
    const host = el(`${kind}-timeline`);

    if (!schedule || typeof schedule !== "object") {
      title.textContent = "Графік не опубліковано";
      summary.textContent = "немає даних";
      host.innerHTML = '<div class="empty-schedule">На цей день планового графіка ще немає.</div>';
      return;
    }

    const periods = validPeriods(schedule.periods);
    title.textContent = formatDate(schedule.date);
    summary.textContent = periods.length ? summarize(periods) : "немає даних";

    if (!periods.length) {
      host.innerHTML = '<div class="empty-schedule">На цей день немає часових інтервалів.</div>';
      return;
    }

    const track = document.createElement("div");
    track.className = "timeline-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", periods.map((p) => `${p.start}–${p.end}: ${PERIOD_LABELS[p.status]}`).join("; "));

    periods.forEach((period) => {
      const segment = document.createElement("span");
      const start = parseTime(period.start);
      const end = parseTime(period.end);
      segment.className = `timeline-segment is-${period.status}`;
      segment.style.left = `${(start / 1440) * 100}%`;
      segment.style.width = `${((end - start) / 1440) * 100}%`;
      segment.title = `${period.start}–${period.end}: ${PERIOD_LABELS[period.status]}`;
      track.append(segment);
    });

    const axis = document.createElement("div");
    axis.className = "timeline-axis";
    axis.setAttribute("aria-hidden", "true");
    axis.innerHTML = "<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>";

    const list = document.createElement("ul");
    list.className = "period-list";
    periods.forEach((period) => {
      const item = document.createElement("li");
      item.innerHTML = `<i class="is-${period.status}" aria-hidden="true"></i><span class="period-time">${period.start}–${period.end}</span><span class="visually-hidden">${PERIOD_LABELS[period.status]}</span>`;
      list.append(item);
    });

    host.replaceChildren(track, axis, list);
  }

  function render(data) {
    setStatus(data.status);
    el("checked-at").textContent = formatDateTime(data.checkedAt, data.timezone);

    const transition = data.nextTransition;
    if (transition?.at && STATUS[safeStatus(transition.status)]) {
      const next = STATUS[safeStatus(transition.status)].title.toLocaleLowerCase("uk-UA");
      el("next-transition").textContent = `${formatDateTime(transition.at, data.timezone)} — ${next}`;
    } else {
      el("next-transition").textContent = "Не заплановано";
    }

    renderSchedule("today", data.schedules?.today);
    renderSchedule("tomorrow", data.schedules?.tomorrow);

    if (typeof data.disclaimer === "string" && data.disclaimer.trim()) {
      el("disclaimer").textContent = data.disclaimer.trim();
    }

    const source = data.source;
    const sourceLink = el("source-link");
    if (source?.url && /^https?:\/\//i.test(source.url)) {
      sourceLink.href = source.url;
      sourceLink.textContent = source.label || "офіційний графік";
    } else {
      sourceLink.removeAttribute("href");
      sourceLink.textContent = source?.label || "не вказано";
    }
  }

  function renderError() {
    setStatus("unknown");
    el("checked-at").textContent = "не вдалося перевірити";
    el("next-transition").textContent = "Немає даних";
    renderSchedule("today", null);
    renderSchedule("tomorrow", null);
    const alert = el("data-alert");
    alert.hidden = false;
    alert.textContent = "Не вдалося завантажити актуальні дані. Спробуйте оновити сторінку пізніше.";
  }

  fetch("./data.json", { cache: "no-store", headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(render)
    .catch((error) => {
      console.error("Не вдалося завантажити data.json:", error);
      renderError();
    });
})();
