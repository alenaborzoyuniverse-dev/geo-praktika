"use strict";

const map = document.querySelector("#map");
const prompt = document.querySelector("#prompt");
const target = document.querySelector("#target");
const feedback = document.querySelector("#feedback");
const solved = document.querySelector("#solved");
const mistakes = document.querySelector("#mistakes");
const progress = document.querySelector("#progress");
const restart = document.querySelector("#restart");
const zoomIn = document.querySelector("#zoom-in");
const zoomOut = document.querySelector("#zoom-out");
const svgNamespace = "http://www.w3.org/2000/svg";

if (window.omskMap?.districts.length === 32) {
  initialize(window.omskMap);
} else {
  target.textContent = "Карта не загрузилась";
  feedback.textContent = "Обновите страницу или откройте её из полной папки проекта.";
  zoomIn.disabled = true;
}

function initialize(data) {
  const found = new Set();
  const paths = new Map();
  let queue = [];
  let errors = 0;
  let errorTimer = null;

  function setFeedback(message, tone = "") {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
  }

  function showQuestion() {
    const next = queue[0];
    target.textContent = next ? next.name : "Все районы найдены!";
    prompt.textContent = next ? "Покажите на карте" : "Задание выполнено";
    solved.textContent = found.size;
    mistakes.textContent = errors;
    progress.value = found.size;
  }

  function answer(district) {
    if (!queue.length || errorTimer !== null) return;

    const next = queue.shift();
    const path = paths.get(district);
    if (district === next) {
      found.add(district);
      path.classList.add("found");
      path.setAttribute("aria-label", district.name + ", найден");
      showQuestion();
      setFeedback(queue.length ? "Верно! Найдите следующий район." : "Все 32 района отмечены зелёным.", "right");
      if (!queue.length) {
        for (const region of paths.values()) region.setAttribute("aria-disabled", "true");
      }
      return;
    }

    errors++;
    mistakes.textContent = errors;
    queue.push(next);
    path.classList.add("missed");
    setFeedback("Неверно. Смотрите на карту.", "wrong");
    errorTimer = window.setTimeout(() => {
      path.classList.remove("missed");
      const correctPath = paths.get(next);
      showDistrict(correctPath);
      correctPath.classList.add("revealed");
      setFeedback("Правильный район подсвечен.", "right");
      errorTimer = window.setTimeout(() => {
        correctPath.classList.remove("revealed");
        errorTimer = null;
        showQuestion();
        setFeedback(queue.length === 1 ? "Попробуйте ещё раз." : "Нажмите на нужный район.");
      }, 1150);
    }, 400);
  }

  for (const [index, district] of data.districts.entries()) {
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", district.path);
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("class", "district");
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", "Участок карты " + (index + 1));
    path.addEventListener("click", (event) => {
      if (!event.defaultPrevented) answer(district);
    });
    path.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) answer(district);
    });
    paths.set(district, path);
    map.append(path);
  }

  if (data.city) {
    const city = document.createElementNS(svgNamespace, "path");
    city.setAttribute("d", data.city);
    city.setAttribute("fill-rule", "evenodd");
    city.setAttribute("class", "city");
    city.setAttribute("aria-label", "Город Омск");
    map.append(city);
  }

  const { resetView, showDistrict } = enableZoom(data.viewBox);
  function start() {
    window.clearTimeout(errorTimer);
    errorTimer = null;
    found.clear();
    errors = 0;
    queue = [...data.districts];
    for (let index = queue.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [queue[index], queue[other]] = [queue[other], queue[index]];
    }
    for (const [index, path] of [...paths.values()].entries()) {
      path.classList.remove("found", "missed", "revealed");
      path.removeAttribute("aria-disabled");
      path.setAttribute("aria-label", "Участок карты " + (index + 1));
    }
    resetView();
    setFeedback("Нажмите на нужный район.");
    showQuestion();
  }

  restart.disabled = false;
  restart.addEventListener("click", start);
  start();
}

function enableZoom([left, top, width, height]) {
  const scales = [1, 1.5, 2.2, 3.2];
  let level = 0;
  let centerX = left + width / 2;
  let centerY = top + height / 2;
  let drag = null;
  let suppressClick = false;

  function render() {
    const viewWidth = width / scales[level];
    const viewHeight = height / scales[level];
    const x = Math.max(left, Math.min(left + width - viewWidth, centerX - viewWidth / 2));
    const y = Math.max(top, Math.min(top + height - viewHeight, centerY - viewHeight / 2));
    centerX = x + viewWidth / 2;
    centerY = y + viewHeight / 2;
    map.setAttribute("viewBox", [x, y, viewWidth, viewHeight].join(" "));
    map.classList.toggle("zoomed", level > 0);
    zoomIn.disabled = level === scales.length - 1;
    zoomOut.disabled = level === 0;
  }

  zoomIn.addEventListener("click", () => { level++; render(); });
  zoomOut.addEventListener("click", () => { level--; render(); });
  map.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressClick = false;
    if (!level) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, centerX, centerY };
  });
  map.addEventListener("pointermove", (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!suppressClick && Math.hypot(dx, dy) < 6) return;
    if (!suppressClick) map.setPointerCapture(event.pointerId);
    suppressClick = true;
    const ratio = map.getScreenCTM().a;
    centerX = drag.centerX - dx / ratio;
    centerY = drag.centerY - dy / ratio;
    render();
  });
  const stopDrag = () => { drag = null; };
  map.addEventListener("pointerup", stopDrag);
  map.addEventListener("pointercancel", stopDrag);
  map.addEventListener("pointerleave", () => { if (!suppressClick) stopDrag(); });
  map.addEventListener("click", (event) => {
    if (suppressClick) event.preventDefault();
    suppressClick = false;
  }, true);
  map.addEventListener("focusin", (event) => {
    if (!level || !event.target.matches(".district:focus-visible")) return;
    const bounds = event.target.getBBox();
    centerX = bounds.x + bounds.width / 2;
    centerY = bounds.y + bounds.height / 2;
    render();
  });

  function resetView() {
    level = 0;
    centerX = left + width / 2;
    centerY = top + height / 2;
    render();
  }

  function showDistrict(path) {
    if (level === 0) return;
    const bounds = path.getBBox();
    const view = map.viewBox.baseVal;
    if (bounds.x >= view.x && bounds.y >= view.y &&
        bounds.x + bounds.width <= view.x + view.width &&
        bounds.y + bounds.height <= view.y + view.height) return;

    while (level > 0 && (bounds.width > width / scales[level] || bounds.height > height / scales[level])) {
      level--;
    }
    centerX = bounds.x + bounds.width / 2;
    centerY = bounds.y + bounds.height / 2;
    render();
  }

  return { resetView, showDistrict };
}
