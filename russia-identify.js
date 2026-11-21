"use strict";

(() => {
  const roundLength = 20;
  const tabs = [...document.querySelectorAll(".russia-tabs [role=tab]")];
  const [findTab, identifyTab] = tabs;
  const get = id => document.getElementById(id);
  const options = get("identify-options");
  const feedback = get("identify-feedback");
  const next = get("identify-next");
  const svg = get("identify-map");
  const deepLink = "#identify";
  let round = [];
  let position = 0;
  let score = 0;
  let answered = false;
  let pool;

  function questionPool() {
    const physicalTopics = new Map(physicalQuestions.map(q => [q.name, q.topic]));
    const regional = regionalGeography.flatMap(region => region.questions.map(q => ({
      ...q,
      region,
      category: physicalTopics.get(q.name) ||
        (q.name === "Гыданский полуостров" ? "peninsulas" : q.type === "point" ? "reliefPoints" : q.type)
    })));
    const national = allQuestions.map(q => ({
      ...q,
      category: q.country ? "country" : q.topic
    }));
    const unique = new Map();
    for (const q of [...regional, ...national]) {
      // Two different rivers in the source list share this name.
      const key = q.name === "Ока" ? q.region.id + q.name : q.name;
      if (!unique.has(key)) unique.set(key, q);
    }
    return [...unique.values()];
  }

  function answerOptions(target) {
    const remaining = new Map();
    for (const q of shuffled(pool)) {
      if (q.name !== target.name) remaining.set(q.name, q);
    }
    const candidates = [...remaining.values()];
    return shuffled([
      target,
      ...candidates.filter(q => q.category === target.category).slice(0, 2),
      ...candidates.filter(q => q.category !== target.category).slice(0, 5)
    ]);
  }

  function startRound() {
    if (!pool) pool = questionPool();
    const previous = round[0]?.name;
    const mixed = [...new Map(shuffled(pool).map(q => [q.name, q])).values()];
    const categories = new Set();
    const first = [];
    for (const q of mixed) {
      if (categories.has(q.category)) continue;
      first.push(q);
      categories.add(q.category);
      if (first.length === 6) break;
    }
    round = shuffled([...first, ...mixed.filter(q => !first.includes(q)).slice(0, roundLength - first.length)]);
    if (round[0].name === previous) [round[0], round[1]] = [round[1], round[0]];
    position = score = 0;
    get("identify-round").hidden = false;
    get("identify-result").hidden = true;
    showQuestion();
  }

  function drawQuestion(q) {
    let camera;
    if (q.region) {
      const overview = fitMap(q.region.views[q.view]);
      camera = q.type === "lake" ? regionalLakeCamera(q, overview) : overview;
      if (q.point) {
        const [lon, lat] = q.point;
        const [x, y] = camera.project(wrapLongitude(lon, camera.middleLon), lat);
        if (x < 14 || x > mapWidth - 14 || y < 14 || y > mapHeight - 14) {
          camera = fitMap([lon - 12, lat - 6, lon + 12, Math.min(89, lat + 6)]);
        }
      }
    } else {
      camera = q.shape || q.country ? areaCamera(q) : markerChoices(q).camera;
    }

    drawMapBackground(svg, camera);
    const boundaries = Object.values(russiaData.countries)
      .map(polygons => camera.path(polygons, true)).join("");
    svg.append(svgNode("path", { class: "country-line", d: boundaries }));

    if (q.region) {
      const lakes = q.region.questions.filter(item => item.type === "lake");
      const water = lakes.map(item => camera.path(item.geometry)).join("");
      svg.append(svgNode("path", { class: "regional-lake-reference", d: water, "fill-rule": "evenodd" }));
    }

    const polygons = q.geometry || russiaData.shapes[q.shape] || russiaData.countries[q.country];
    if (polygons) {
      const river = q.type === "river";
      svg.append(svgNode("path", {
        class: river ? "identify-mark is-river" : "identify-mark",
        d: camera.path(polygons, false, !river), "fill-rule": "evenodd"
      }));
      return;
    }

    const [lon, lat] = q.point;
    const [x, y] = camera.project(wrapLongitude(lon, camera.middleLon), lat);
    svg.append(
      svgNode("circle", { class: "identify-pin-halo", cx: x, cy: y, r: 12 }),
      svgNode("circle", { class: "identify-pin-dot", cx: x, cy: y, r: 5 })
    );
  }

  function showQuestion() {
    const target = round[position];
    answered = false;
    get("identify-count").textContent = "Вопрос " + (position + 1) + " из " + roundLength;
    get("identify-progress").value = position;
    feedback.textContent = "";
    next.hidden = true;
    next.textContent = position === roundLength - 1 ? "Показать результат" : "Следующий вопрос";
    drawQuestion(target);

    const choices = answerOptions(target);
    options.replaceChildren(...choices.map(q => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = q.name;
      button.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = q === target;
        score += Number(correct);
        get("identify-progress").value = position + 1;
        for (const option of options.children) option.setAttribute("aria-disabled", "true");
        const solution = options.children[choices.indexOf(target)];
        solution.dataset.result = "right";
        solution.setAttribute("aria-label", target.name + ", правильный ответ");
        if (!correct) {
          button.dataset.result = "wrong";
          button.setAttribute("aria-label", q.name + ", ваш ответ, неверно");
        }
        feedback.dataset.tone = correct ? "right" : "wrong";
        feedback.textContent = correct ? "Верно!" : "Правильный ответ — " + target.name + ".";
        next.hidden = false;
      });
      return button;
    }));
  }

  next.addEventListener("click", () => {
    if (!answered) return;
    if (++position < roundLength) {
      showQuestion();
      focusQuestion();
    } else {
      answered = false;
      get("identify-round").hidden = true;
      get("identify-score").textContent = "Верных ответов: " + score + " из " + roundLength;
      get("identify-result").hidden = false;
      get("identify-result-title").focus();
    }
  });

  get("identify-replay").addEventListener("click", () => {
    startRound();
    focusQuestion();
  });

  function focusQuestion() {
    get("identify-prompt").focus({ preventScroll: true });
    if (matchMedia("(max-width: 740px)").matches) {
      get("identify-round").scrollIntoView({ block: "start" });
    }
  }

  function selectTab(active) {
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      get(tab.getAttribute("aria-controls")).hidden = !selected;
    }
    if (active === identifyTab && !round.length) startRound();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const url = new URL(location.href);
      url.hash = tab === identifyTab ? deepLink : "";
      if (url.href !== location.href) history.replaceState(null, "", url);
      selectTab(tab);
    });
    tab.addEventListener("keydown", event => {
      const other = { ArrowLeft: tab === findTab ? identifyTab : findTab,
        ArrowRight: tab === findTab ? identifyTab : findTab, Home: findTab, End: identifyTab }[event.key];
      if (!other) return;
      event.preventDefault();
      other.click();
      other.focus();
    });
  }

  function selectFromLocation() {
    selectTab(location.hash === deepLink ? identifyTab : findTab);
  }
  window.addEventListener("hashchange", selectFromLocation);
  findTab.parentElement.hidden = false;
  selectFromLocation();
})();
