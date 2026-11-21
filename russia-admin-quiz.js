"use strict";

function activateRussiaAdminQuiz() {
  const get = id => document.getElementById("admin-" + id);
  const svg = get("map");
  if (svg.childElementCount) return;

  const prompt = get("prompt");
  const target = get("target");
  const feedback = get("feedback");
  const progress = get("progress");
  const restart = get("restart");
  const next = get("next");
  if (typeof russiaAdminData === "undefined") {
    target.textContent = "Карта не загрузилась";
    feedback.textContent = "Обновите страницу, чтобы попробовать снова.";
    return;
  }

  const { regions, west } = russiaAdminData;
  const shapes = new Map();
  const found = new Set();
  const zoomIn = get("zoom-in");
  const zoomOut = get("zoom-out");
  const fullWidth = 900;
  const fullHeight = 500;
  const minWidth = 140;
  const roundSize = progress.max;
  let remaining = shuffled(regions);
  let round = [];
  let queue = [];
  let mistakes = 0;
  let timer = null;
  let drag = null;
  let suppressClick = false;

  function setFeedback(text, tone = "") {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function showQuestion() {
    prompt.textContent = queue.length ? "Покажите на карте" : "Задание выполнено";
    target.textContent = queue[0]?.name || "Раунд завершён!";
    get("count").textContent = found.size + " / " + round.length;
    get("mistakes").textContent = mistakes;
    progress.value = found.size;
    next.hidden = queue.length > 0;
  }

  function answer(region) {
    if (!queue.length || timer !== null) return;
    const expected = queue.shift();
    const clicked = shapes.get(region);
    if (region === expected) {
      found.add(region);
      clicked.classList.add("found");
      clicked.setAttribute("aria-label", region.name + ", найден");
      showQuestion();
      setFeedback(queue.length ? "Верно! Найдите следующий регион." : "Все регионы раунда найдены.", "right");
      return;
    }

    queue.push(expected);
    get("mistakes").textContent = ++mistakes;
    clicked.classList.add("missed");
    setFeedback("Неверно. Смотрите на карту.", "wrong");
    timer = setTimeout(() => {
      clicked.classList.remove("missed");
      const correct = shapes.get(expected);
      makeVisible(correct);
      correct.classList.add("revealed");
      setFeedback("Правильный регион подсвечен.", "right");
      timer = setTimeout(() => {
        correct.classList.remove("revealed");
        timer = null;
        showQuestion();
        setFeedback("Нажмите на нужный регион.");
      }, 1150);
    }, 400);
  }

  const drawingOrder = [...regions.filter(region => !region.point), ...regions.filter(region => region.point)];
  for (const [index, region] of drawingOrder.entries()) {
    const button = svgNode("g", {
      class: "district", role: "button", tabindex: 0, "aria-label": "Участок карты " + (index + 1)
    });
    button.dataset.region = region.id;
    button.append(svgNode("path", { d: region.d, "fill-rule": "evenodd", "vector-effect": "non-scaling-stroke" }));
    if (region.point) {
      const [cx, cy] = region.point;
      button.append(svgNode("circle", { cx, cy, r: 7, class: "admin-city-dot", "vector-effect": "non-scaling-stroke" }));
    }
    button.addEventListener("click", event => {
      if (!event.defaultPrevented) answer(region);
    });
    button.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) answer(region);
    });
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible")) makeVisible(button);
    });
    svg.append(button);
    shapes.set(region, button);
  }

  function setView(width, centerX, centerY) {
    width = Math.max(minWidth, Math.min(fullWidth, width));
    const height = fullHeight * width / fullWidth;
    const left = Math.max(0, Math.min(fullWidth - width, centerX - width / 2));
    const top = Math.max(0, Math.min(fullHeight - height, centerY - height / 2));
    svg.setAttribute("viewBox", [left, top, width, height].join(" "));
    svg.classList.toggle("admin-zoomed", width < fullWidth);
    zoomIn.disabled = width === minWidth;
    zoomOut.disabled = width === fullWidth;
    svg.style.setProperty("--admin-city-size", 9 * width / fullWidth + "px");
  }

  function makeVisible(button) {
    const view = svg.viewBox.baseVal;
    if (view.width === fullWidth || !svg.getClientRects().length) return;
    const box = button.getBBox();
    const visible = box.x >= view.x && box.y >= view.y &&
      box.x + box.width <= view.x + view.width && box.y + box.height <= view.y + view.height;
    if (visible) return;
    const width = Math.max(view.width, box.width * 1.15, box.height * fullWidth / fullHeight * 1.15);
    setView(width, box.x + box.width / 2, box.y + box.height / 2);
  }

  function zoom(factor) {
    const {x, y, width, height} = svg.viewBox.baseVal;
    setView(width * factor, x + width / 2, y + height / 2);
  }

  zoomIn.addEventListener("click", () => zoom(1 / 1.6));
  zoomOut.addEventListener("click", () => zoom(1.6));
  get("west").addEventListener("click", () => setView(365, ...west));
  get("overview").addEventListener("click", () => setView(fullWidth, 0, 0));

  svg.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    const view = svg.viewBox.baseVal;
    if (view.width === fullWidth) return;
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      width: view.width, centerX: view.x + view.width / 2, centerY: view.y + view.height / 2,
      scale: svg.getScreenCTM().a
    };
  });
  svg.addEventListener("pointermove", event => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!suppressClick && Math.hypot(dx, dy) < 6) return;
    if (!suppressClick) svg.setPointerCapture(event.pointerId);
    suppressClick = true;
    svg.classList.add("admin-dragging");
    setView(drag.width, drag.centerX - dx / drag.scale, drag.centerY - dy / drag.scale);
  });
  function stopDrag() {
    drag = null;
    svg.classList.remove("admin-dragging");
  }
  svg.addEventListener("pointerup", stopDrag);
  svg.addEventListener("pointercancel", stopDrag);
  svg.addEventListener("pointerleave", () => {
    if (!suppressClick) stopDrag();
  });
  svg.addEventListener("click", event => {
    if (suppressClick) event.preventDefault();
    suppressClick = false;
  }, true);

  function start() {
    clearTimeout(timer);
    timer = null;
    found.clear();
    mistakes = 0;
    queue = shuffled(round);
    for (const [index, button] of [...shapes.values()].entries()) {
      button.classList.remove("found", "missed", "revealed");
      button.setAttribute("aria-label", "Участок карты " + (index + 1));
    }
    setView(fullWidth, 0, 0);
    setFeedback("Нажмите на нужный регион.");
    showQuestion();
  }

  function advanceRound() {
    round = remaining.splice(0, roundSize);
    if (round.length < roundSize) {
      // Finish the current pass through all regions before reshuffling.
      remaining = shuffled(regions.filter(region => !round.includes(region)));
      round.push(...remaining.splice(0, roundSize - round.length));
    }
    start();
  }

  restart.disabled = false;
  restart.addEventListener("click", start);
  next.addEventListener("click", () => {
    advanceRound();
    target.focus({ preventScroll: true });
  });
  advanceRound();
}
