"use strict";

const regionKinds = {
  river: { label: "Реки", hint: "Нажмите на любой видимый участок нужного русла.", choice: "Русло" },
  lake: { label: "Озёра", hint: "Нажмите внутри контура озера.", choice: "Озеро" },
  water: { label: "Моря и заливы", hint: "Нажмите внутри нужной акватории.", choice: "Акватория" },
  ridge: { label: "Хребты", hint: "Выберите полосу вдоль гор или хребта.", choice: "Горная полоса" },
  area: { label: "Области рельефа", hint: "Выберите область на карте.", choice: "Область" },
  point: { label: "Точки на карте", hint: "Выберите точку, которая отмечает этот объект.", choice: "Точка" },
};

function regionalExercises(region) {
  const questions = shuffled(region.questions);
  const firstOfEachKind = [...new Set(questions.map(question => question.type))]
    .map(kind => questions.find(question => question.type === kind));
  const remaining = questions.filter(question => !firstOfEachKind.includes(question));
  return [...firstOfEachKind, ...remaining].slice(0, 14);
}

function regionalPointOptions(region, question, overview) {
  const [lon, lat] = question.point;
  const scale = Math.max(.2, Math.cos(lat * Math.PI / 180));
  const distance = ([x, y]) => Math.hypot((wrapLongitude(x, lon) - lon) * scale, y - lat);
  const neighbors = region.pointChoices
    .filter(item => item.view === question.view && item.name !== question.name && distance(item.point) > .16)
    .sort((first, second) => distance(first.point) - distance(second.point))
    .slice(0, 6);

  function positions(camera) {
    const visible = [];
    for (const item of [question, ...neighbors]) {
      const [x, y] = camera.project(wrapLongitude(item.point[0], camera.middleLon), item.point[1]);
      if (x < 37 || x > mapWidth - 37 || y < 37 || y > mapHeight - 37) continue;
      if (visible.every(other => Math.hypot(x - other.position[0], y - other.position[1]) >= 81)) {
        visible.push({ item, position: [x, y] });
      }
      if (visible.length === 4) break;
    }
    return visible;
  }

  let camera = overview;
  let markers = positions(camera);
  if (markers.length < 3 || !markers.some(mark => mark.item === question)) {
    const near = [question, ...neighbors.slice(0, 3)];
    const longs = near.map(item => wrapLongitude(item.point[0], lon));
    const lats = near.map(item => item.point[1]);
    const west = Math.min(...longs);
    const east = Math.max(...longs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const lonPadding = Math.max(.25 / scale, (east - west) * .2);
    const latPadding = Math.max(.27, (north - south) * .22);
    camera = fitMap([west - lonPadding, south - latPadding, east + lonPadding, north + latPadding]);
    markers = positions(camera);
  }
  markers.sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]);
  return { camera, markers };
}

function regionalLakeCamera(question, overview) {
  const largest = question.geometry.reduce((first, second) => {
    const extent = ([w, s, e, n]) => (e - w) * (n - s);
    return extent(second) > extent(first) ? second : first;
  });
  const [west, south, east, north] = largest;
  const [x1, y1] = overview.project(west, north);
  const [x2, y2] = overview.project(east, south);
  if (Math.max(x2 - x1, y2 - y1) >= 28 && Math.min(x2 - x1, y2 - y1) >= 8) return overview;
  const lon = Math.round((west + east) / 2);
  const lat = Math.round((south + north) / 2);
  return fitMap([lon - 3.3, lat - 2, lon + 3.3, lat + 2]);
}

function drawRegionalMap(svg, region, question, answer) {
  const overview = fitMap(region.views[question.view]);
  let camera = overview;
  let markers = [];
  if (question.type === "point") ({ camera, markers } = regionalPointOptions(region, question, overview));
  if (question.type === "lake") camera = regionalLakeCamera(question, overview);
  drawMapBackground(svg, camera);
  svg.classList.add("regional-map");
  const { addChoice, reveal } = mapChoices(svg, question, answer);

  const regionRivers = region.questions.filter(item => item.type === "river" && item.view === question.view);
  if (question.type !== "river") {
    const reference = regionRivers.map(item => camera.path(item.geometry, false, false)).join("");
    svg.append(svgNode("path", { d: reference, class: "regional-river-reference" }));
  }

  if (question.type !== "lake") {
    const lakes = region.questions.filter(item => item.type === "lake" && item.view === question.view);
    const reference = lakes.map(item => camera.path(item.geometry)).join("");
    svg.append(svgNode("path", { d: reference, class: "regional-lake-reference", "fill-rule": "evenodd" }));
  }

  if (question.type === "point") {
    markers.forEach(({ item, position }, index) => {
      addChoice(mapMarker(position, 39), item === question, `Точка ${index + 1}`);
    });
  } else if (question.type === "river") {
    const choices = [];
    regionRivers.forEach((item, index) => {
      const d = camera.path(item.geometry, false, false);
      if (!d) return;
      const path = svgNode("path", { d, class: "regional-river" });
      addChoice(path, item === question, `Русло ${index + 1}`, true);
      choices.push({ path, item, points: null });
    });
    svg.onclick = event => {
      if (svg.classList.contains("map-locked")) return;
      const point = mapPointFromEvent(svg, event);
      const nearest = nearestRegionalRiver(choices, point, svg.getScreenCTM().a);
      if (nearest) answer(nearest.item === question, nearest.path);
    };
  } else {
    const shapes = region.questions.filter(item => item.type === question.type && item.view === question.view);
    const choices = shapes.map(item => ({ item, path: camera.path(item.geometry) })).filter(item => item.path);
    // Draw smaller features over wider ones where polygons overlap.
    const byFootprint = item => item.geometry.reduce((sum, [w, s, e, n]) => sum + (e - w) * (n - s), 0);
    choices.sort((a, b) => byFootprint(b.item) - byFootprint(a.item));
    choices.forEach(({ item, path }, index) => {
      const css = `russia-area regional-${question.type}${choices.length < 2 ? " regional-single-shape" : ""}`;
      const node = svgNode("path", { d: path, class: css, "fill-rule": "evenodd" });
      addChoice(node, item === question, `${regionKinds[question.type].choice} ${index + 1}`);
    });
    svg.onclick = event => markMapMiss(svg, answer, mapPointFromEvent(svg, event));
  }

  return { scale: camera === overview ? region.name : "Увеличенный фрагмент", reveal };
}

function nearestRegionalRiver(choices, point, pixelScale) {
  let nearest = null;
  let best = (17 / pixelScale) ** 2;
  for (const choice of choices) {
    if (!choice.points) {
      const length = choice.path.getTotalLength();
      const steps = Math.max(1, Math.min(900, Math.ceil(length / 4)));
      choice.points = Array.from({ length: steps + 1 }, (_, index) => choice.path.getPointAtLength(length * index / steps));
    }
    for (const sample of choice.points) {
      const distance = (sample.x - point.x) ** 2 + (sample.y - point.y) ** 2;
      if (distance < best) {
        best = distance;
        nearest = choice;
      }
    }
  }
  return nearest;
}
