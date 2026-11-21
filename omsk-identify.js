"use strict";

function omskDistrictNeighbors(districts) {
  const neighbors = new Map(districts.map(district => [district, new Set()]));
  const owners = new Map();

  for (const district of districts) {
    // The map stores absolute point pairs in closed M…Z rings. Match full edges
    // in either direction so that touching at a single point does not count.
    for (const [, ring] of district.path.matchAll(/M([^Z]+)Z/g)) {
      const vertices = ring.trim().split(/\s+/);
      for (const [i, start] of vertices.entries()) {
        const end = vertices[(i + 1) % vertices.length];
        if (start === end) continue;
        const edge = [start, end].sort().join(" ");
        if (!owners.has(edge)) owners.set(edge, new Set());
        const districtsOnEdge = owners.get(edge);
        for (const other of districtsOnEdge) {
          if (other === district) continue;
          neighbors.get(district).add(other);
          neighbors.get(other).add(district);
        }
        districtsOnEdge.add(district);
      }
    }
  }
  return neighbors;
}

function initializeOmskIdentify(districts, paths, svg, showDistrict) {
  const get = id => document.getElementById(id);
  const control = id => get("omsk-identify-" + id);
  const [findTab, identifyTab] = get("omsk-tabs").querySelectorAll("[role=tab]");
  const neighbors = omskDistrictNeighbors(districts);
  const options = control("options");
  const next = control("next");
  const feedback = control("feedback");
  const roundLength = Number(control("progress").max);
  let round = [];
  let position = 0;
  let score = 0;
  let answered = false;

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function start() {
    const previous = round[0];
    round = shuffled(districts).slice(0, roundLength);
    if (round[0] === previous) [round[0], round[1]] = [round[1], round[0]];
    score = position = 0;
    control("round").hidden = false;
    control("result").hidden = true;
    showQuestion();
  }

  function showQuestion() {
    answered = false;
    svg.setAttribute("aria-label", "Карта Омской области с выделенным районом");
    const target = round[position];
    for (const [district, path] of paths) path.classList.toggle("identify-target", district === target);
    showDistrict(paths.get(target));
    control("count").textContent = "Вопрос " + (position + 1) + " из " + roundLength;
    control("progress").value = position;
    feedback.textContent = "";
    next.hidden = true;
    next.textContent = position === roundLength - 1 ? "Показать результат" : "Следующий вопрос";

    const adjacent = neighbors.get(target);
    const outside = districts.filter(district => district !== target && !adjacent.has(district));
    const choices = shuffled([target, ...shuffled(adjacent).slice(0, 2), ...shuffled(outside).slice(0, 2)]);
    options.replaceChildren(...choices.map(district => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = district.name;
      button.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = district === target;
        score += Number(correct);
        control("progress").value = position + 1;
        for (const option of options.children) option.setAttribute("aria-disabled", "true");
        const solution = options.children[choices.indexOf(target)];
        solution.dataset.result = "right";
        solution.setAttribute("aria-label", target.name + ", правильный ответ");
        if (!correct) {
          button.dataset.result = "wrong";
          button.setAttribute("aria-label", district.name + ", ваш ответ, неверно");
        }
        feedback.dataset.tone = correct ? "right" : "wrong";
        feedback.textContent = correct ? "Верно!" : "Правильный ответ — " + target.name + ".";
        next.hidden = false;
      });
      return button;
    }));
  }

  function focusQuestion() {
    control("question").focus({ preventScroll: true });
    if (matchMedia("(max-width: 740px)").matches) {
      svg.closest(".map-panel").scrollIntoView({ block: "start" });
    }
  }

  next.addEventListener("click", () => {
    if (!answered) return;
    if (++position < roundLength) {
      showQuestion();
      focusQuestion();
    } else {
      answered = false;
      paths.get(round.at(-1)).classList.remove("identify-target");
      svg.setAttribute("aria-label", "Карта районов Омской области");
      control("round").hidden = true;
      control("score").textContent = "Верных ответов: " + score + " из " + roundLength;
      control("result").hidden = false;
      control("result-title").focus();
    }
  });
  control("replay").addEventListener("click", () => {
    start();
    focusQuestion();
  });

  function selectTab(active) {
    const identifying = active === identifyTab;
    for (const tab of [findTab, identifyTab]) {
      const selected = tab === active;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      get(tab.getAttribute("aria-controls")).hidden = !selected;
    }
    svg.classList.toggle("omsk-map-identify", identifying);
    svg.setAttribute("role", identifying ? "img" : "group");
    svg.setAttribute("aria-label", identifying && position < roundLength
      ? "Карта Омской области с выделенным районом" : "Карта районов Омской области");
    for (const path of paths.values()) {
      if (identifying) path.removeAttribute("tabindex");
      else path.setAttribute("tabindex", "0");
    }
    if (identifying && !round.length) start();
    else if (identifying && position < roundLength) showDistrict(paths.get(round[position]));
  }

  for (const tab of [findTab, identifyTab]) {
    tab.addEventListener("click", () => {
      const url = new URL(location.href);
      url.hash = tab === identifyTab ? "#identify" : "";
      if (url.href !== location.href) history.replaceState(null, "", url);
      selectTab(tab);
    });
    tab.addEventListener("keydown", event => {
      let nextTab;
      if (event.key === "Home") nextTab = findTab;
      if (event.key === "End") nextTab = identifyTab;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") nextTab = tab === findTab ? identifyTab : findTab;
      if (!nextTab) return;
      event.preventDefault();
      nextTab.click();
      nextTab.focus();
    });
  }
  const selectFromLocation = () => selectTab(location.hash === "#identify" ? identifyTab : findTab);
  window.addEventListener("hashchange", selectFromLocation);
  get("omsk-tabs").hidden = false;
  selectFromLocation();
}
