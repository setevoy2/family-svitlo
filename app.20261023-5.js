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
  let latestData = null;
  const STALE_AFTER_MS = 5 * 60 * 1000;

  function formatDuration(milliseconds) {
    const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
    if (totalMinutes < 1) return "менше хвилини";
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    return [days ? `${days} д` : "", hours ? `${hours} год` : "", minutes ? `${minutes} хв` : ""]
      .filter(Boolean)
      .join(" ");
  }

  function formatCountdown(target, now = new Date()) {
    const remaining = target.getTime() - now.getTime();
    if (!Number.isFinite(remaining)) return "";
    if (remaining <= 0) return "зараз";
    return `через ${formatDuration(remaining)}`;
  }

  function staleDataMessage(status, checkedAt, now = new Date()) {
    if (safeStatus(status) !== "unknown") return "";
    const checked = new Date(checkedAt);
    if (Number.isNaN(checked.getTime())) return "Дані давно не оновлювалися.";
    const age = now - checked;
    if (age < STALE_AFTER_MS) return "";
    return `Дані не оновлювалися ${formatDuration(age)}.`;
  }

  function plannedTransitionLabel(status) {
    const normalized = safeStatus(status);
    if (normalized === "off") return "світла не буде";
    if (normalized === "on") return "світло буде";
    if (normalized === "conflict") return "дані потребуватимуть перевірки";
    return "даних не буде";
  }

  function currentTimeMarker(scheduleDate, timezone, now = new Date()) {
    if (typeof scheduleDate !== "string") return null;
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone: timezone || "Europe/Kyiv"
      }).formatToParts(now);
    } catch {
      return null;
    }
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const currentDate = `${value.year}-${value.month}-${value.day}`;
    if (currentDate !== scheduleDate) return null;
    const minutes = Number(value.hour) * 60 + Number(value.minute) + Number(value.second) / 60;
    if (!Number.isFinite(minutes)) return null;
    return {
      percent: Math.min(100, Math.max(0, (minutes / 1440) * 100)),
      label: `${value.hour}:${value.minute}`
    };
  }

  globalThis.__familySvitloTime = {
    formatDuration,
    formatCountdown,
    staleDataMessage,
    plannedTransitionLabel,
    currentTimeMarker
  };

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

  function renderEmergencyMode(emergency) {
    const panel = el("emergency-panel");
    if (!panel) return;
    const active = emergency?.state === "emergency";
    panel.hidden = !active;
    if (!active) return;
    const accident = emergency?.type === "accident";
    el("emergency-heading").textContent = accident ? "Аварійні відключення" : "Екстрені відключення";
    el("emergency-help-tooltip").textContent = accident
      ? "Аварійні відключення виникають через пошкодження або відмову елементів електромережі. Їх неможливо точно спрогнозувати."
      : "Екстрені відключення застосовують без попередження, коли потрібно терміново збалансувати енергосистему. Графіки в цей час не діють.";
  }

  function updateTemporalText(data, now = new Date()) {
    const normalized = safeStatus(data.status);
    const changedAt = new Date(data.actualChangedAt);
    if ((normalized === "on" || normalized === "off") && !Number.isNaN(changedAt.getTime())) {
      const prefix = normalized === "on" ? "Світло є вже" : "Світла немає вже";
      el("status-description").textContent = `${prefix} ${formatDuration(now - changedAt)}.`;
    }

    const transition = data.nextTransition;
    const transitionAt = new Date(transition?.at);
    if (transition?.at && STATUS[safeStatus(transition.status)] && !Number.isNaN(transitionAt.getTime())) {
      const next = plannedTransitionLabel(transition.status);
      el("next-transition").textContent = `${formatDateTime(transition.at, data.timezone)} — ${next} · ${formatCountdown(transitionAt, now)}`;
    } else {
      el("next-transition").textContent = "Не заплановано";
    }

    const freshnessWarning = el("freshness-warning");
    const freshnessMessage = staleDataMessage(data.status, data.checkedAt, now);
    freshnessWarning.hidden = !freshnessMessage;
    freshnessWarning.textContent = freshnessMessage;

    const marker = el("today-now-marker");
    if (marker) {
      const position = currentTimeMarker(data.schedules?.today?.date, data.timezone, now);
      marker.hidden = !position;
      if (position) {
        marker.style.left = `${position.percent}%`;
        marker.dataset.edge = position.percent < 7 ? "start" : position.percent > 93 ? "end" : "middle";
        marker.setAttribute("aria-label", `Зараз ${position.label}`);
        marker.querySelector("span").textContent = position.label;
      }
    }
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

    const marker = document.createElement("div");
    marker.className = "current-time-marker";
    marker.id = `${kind}-now-marker`;
    marker.hidden = true;
    marker.setAttribute("role", "img");
    marker.innerHTML = "<span></span>";

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

    host.replaceChildren(track, marker, axis, list);
  }

  function render(data) {
    latestData = data;
    setStatus(data.status);
    renderEmergencyMode(data.emergencyMode);

    renderSchedule("today", data.schedules?.today);
    renderSchedule("tomorrow", data.schedules?.tomorrow);
    updateTemporalText(data);

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
    renderEmergencyMode(null);
    el("next-transition").textContent = "Немає даних";
    el("freshness-warning").hidden = true;
    renderSchedule("today", null);
    renderSchedule("tomorrow", null);
    const alert = el("data-alert");
    alert.hidden = false;
    alert.textContent = "Не вдалося завантажити актуальні дані. Спробуйте оновити сторінку пізніше.";
  }

  function loadData(showError = true) {
    return fetch(`./data.json?v=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(render)
      .catch((error) => {
        console.error("Не вдалося завантажити data.json:", error);
        if (showError) renderError();
      });
  }

  loadData();
  setInterval(() => {
    if (latestData) updateTemporalText(latestData);
  }, 30000);
  setInterval(() => loadData(false), 60000);
})();
