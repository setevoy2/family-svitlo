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

  const STATUS_FAVICONS = {
    on: "favicon-on.20261024.svg",
    off: "favicon-off.20261024.svg",
    conflict: "favicon-unknown.20261024.svg",
    unknown: "favicon-unknown.20261024.svg"
  };

  const el = (id) => document.getElementById(id);
  let latestData = null;


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

  function degradationMessage(status, statusChangedAt, now = new Date()) {
    if (safeStatus(status) !== "unknown") return "";
    const changed = new Date(statusChangedAt);
    if (Number.isNaN(changed.getTime())) return "Статус залишається невідомим.";
    return `Статус залишається невідомим ${formatDuration(now - changed)}.`;
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
    degradationMessage,
    plannedTransitionLabel,
    statusFaviconHref,
    currentTimeMarker,
    scheduleDateLabel,
    transitionAxisLabels
  };

  function safeStatus(value) {
    return Object.prototype.hasOwnProperty.call(STATUS, value) ? value : "unknown";
  }

  function statusFaviconHref(status) {
    return STATUS_FAVICONS[safeStatus(status)];
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

  function scheduleDateLabel(kind, dateString) {
    const prefix = kind === "tomorrow" ? "Завтра" : "Сьогодні";
    return `${prefix}, ${formatDate(dateString)}`;
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
    const favicon = el("status-favicon");
    if (favicon) favicon.href = statusFaviconHref(normalized);
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
      ? "• Причина: локальне пошкодження лінії або обладнання електромережі.\n"
        + "• Хто усуває: оператор системи розподілу та його аварійні бригади.\n"
        + "• Графік: на пошкодженій ділянці не діє.\n"
        + "• Масштаб: зазвичай окремі будинки, вулиці або обмежена територія.\n"
        + "• Тривалість: залежить від характеру пошкодження та часу ремонту."
      : "• Причина: дефіцит потужності або пошкодження енергоінфраструктури, через які систему потрібно терміново збалансувати.\n"
        + "• Хто застосовує: оператори системи розподілу за командою НЕК «Укренерго».\n"
        + "• Графік: не діє; відключення застосовують без попередження.\n"
        + "• Тривалість: наперед невідома; світло повертають після стабілізації системи та команди Укренерго.";
  }

  function updateTemporalText(data, now = new Date()) {
    const normalized = safeStatus(data.status);
    const changedAt = new Date(data.statusChangedAt || data.actualChangedAt);
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
    const freshnessMessage = degradationMessage(data.status, data.statusChangedAt || data.actualChangedAt, now);
    freshnessWarning.hidden = !freshnessMessage;
    freshnessWarning.textContent = freshnessMessage;

    const marker = el("today-now-marker");
    if (marker) {
      const position = currentTimeMarker(data.schedules?.today?.date, data.timezone, now);
      marker.hidden = !position;
      if (position) {
        marker.style.left = marker.closest(".timeline-host")?.classList.contains("has-factual-timeline")
          ? `calc(var(--timeline-label-width) + 10px + (100% - var(--timeline-label-width) - 10px) * ${position.percent / 100})`
          : `${position.percent}%`;
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

  function transitionAxisLabels(periods) {
    const minutes = new Map();
    periods.forEach((period) => {
      for (const time of [period.start, period.end]) {
        const value = parseTime(time);
        if (value !== null) minutes.set(value, time);
      }
    });
    return [...minutes.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, time]) => ({ time, percent: (value / 1440) * 100 }));
  }

  function factualPeriods(timeline, timezone, now = new Date()) {
    if (!timeline || !Array.isArray(timeline.transitions)) return [];
    const marker = currentTimeMarker(timeline.date, timezone, now);
    if (!marker) return [];
    const endMinutes = (marker.percent / 100) * 1440;
    const transitions = timeline.transitions
      .map((item) => {
        const at = new Date(item?.at);
        if (Number.isNaN(at.getTime())) return null;
        const parts = new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timezone || "Europe/Kyiv"
        }).formatToParts(at);
        const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return { minutes: Number(values.hour) * 60 + Number(values.minute), status: safeStatus(item?.status) };
      })
      .filter((item) => item && item.minutes <= endMinutes)
      .sort((a, b) => a.minutes - b.minutes);
    if (!transitions.length) return [];
    const periods = [];
    if (transitions[0].minutes > 0) periods.push({ startMinutes: 0, endMinutes: transitions[0].minutes, status: "unknown" });
    transitions.forEach((item, index) => {
      const next = transitions[index + 1];
      periods.push({ startMinutes: item.minutes, endMinutes: next ? next.minutes : endMinutes, status: item.status });
    });
    return periods.filter((period) => period.endMinutes > period.startMinutes);
  }

  function makeTrack(periods, className = "timeline-track") {
    const track = document.createElement("div");
    track.className = className;
    periods.forEach((period) => {
      const segment = document.createElement("span");
      const start = period.startMinutes ?? parseTime(period.start);
      const end = period.endMinutes ?? parseTime(period.end);
      segment.className = `timeline-segment is-${period.status}`;
      segment.style.left = `${(start / 1440) * 100}%`;
      segment.style.width = `${((end - start) / 1440) * 100}%`;
      track.append(segment);
    });
    return track;
  }

  function renderSchedule(kind, schedule, actualTimeline = null, timezone = "Europe/Kyiv") {
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
    title.textContent = scheduleDateLabel(kind, schedule.date);
    summary.textContent = periods.length ? summarize(periods) : "немає даних";

    if (!periods.length) {
      host.innerHTML = '<div class="empty-schedule">На цей день немає часових інтервалів.</div>';
      return;
    }

    const track = makeTrack(periods);
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", periods.map((p) => `${p.start}–${p.end}: ${PERIOD_LABELS[p.status]}`).join("; "));

    [...track.children].forEach((segment, index) => {
      const period = periods[index];
      segment.title = `${period.start}–${period.end}: ${PERIOD_LABELS[period.status]}`;
    });

    const comparison = document.createElement("div");
    comparison.className = "timeline-comparison";
    const facts = kind === "today" && actualTimeline?.date === schedule.date
      ? factualPeriods(actualTimeline, timezone)
      : [];
    if (facts.length) {
      const factLabel = document.createElement("span");
      factLabel.className = "timeline-row-label";
      factLabel.textContent = "Фактично";
      const factTrack = makeTrack(facts, "timeline-track timeline-factual-track");
      const future = document.createElement("span");
      future.className = "timeline-future";
      const factEnd = facts[facts.length - 1].endMinutes;
      future.style.left = `${(factEnd / 1440) * 100}%`;
      future.style.width = `${((1440 - factEnd) / 1440) * 100}%`;
      factTrack.append(future);
      comparison.append(factLabel, factTrack);
      const planLabel = document.createElement("span");
      planLabel.className = "timeline-row-label";
      planLabel.textContent = "За графіком";
      comparison.append(planLabel, track);
      comparison.classList.add("has-facts");
    } else {
      comparison.append(track);
    }

    const marker = document.createElement("div");
    marker.className = "current-time-marker";
    marker.id = `${kind}-now-marker`;
    marker.hidden = true;
    marker.setAttribute("role", "img");
    marker.innerHTML = "<span></span>";

    const axis = document.createElement("div");
    axis.className = "timeline-axis timeline-axis-transitions";
    axis.setAttribute("aria-hidden", "true");
    transitionAxisLabels(periods).forEach((label) => {
      const tick = document.createElement("span");
      tick.className = "timeline-axis-label";
      tick.style.left = `${label.percent}%`;
      tick.dataset.edge = label.percent === 0 ? "start" : label.percent === 100 ? "end" : "middle";
      const text = document.createElement("span");
      text.className = "timeline-axis-label-text";
      text.textContent = label.time;
      tick.append(text);
      axis.append(tick);
    });

    const mobileAxis = document.createElement("div");
    mobileAxis.className = "timeline-axis timeline-axis-mobile";
    mobileAxis.setAttribute("aria-hidden", "true");
    mobileAxis.innerHTML = "<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>";

    const list = document.createElement("ul");
    list.className = "period-list";
    periods.forEach((period) => {
      const item = document.createElement("li");
      item.innerHTML = `<i class="is-${period.status}" aria-hidden="true"></i><span class="period-time">${period.start}–${period.end}</span><span class="visually-hidden">${PERIOD_LABELS[period.status]}</span>`;
      list.append(item);
    });

    host.classList.toggle("has-factual-timeline", facts.length > 0);
    host.replaceChildren(comparison, marker, axis, mobileAxis, list);
  }

  function render(data) {
    latestData = data;
    setStatus(data.status);
    renderEmergencyMode(data.emergencyMode);

    renderSchedule("today", data.schedules?.today, data.actualTimeline, data.timezone);
    renderSchedule("tomorrow", data.schedules?.tomorrow, null, data.timezone);
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
