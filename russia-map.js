"use strict";

const mapWidth = 760;
const mapHeight = 460;
const mapSvgNamespace = "http://www.w3.org/2000/svg";
const countryViews = [
  ["NOR FIN LVA LTU POL EST BLR", [7, 46, 47, 73]],
  ["UKR MDA GEO AZE ARM", [19, 33, 61, 54]],
  ["KAZ UZB KGZ TJK TKM", [42, 30, 93, 58]],
  ["CHN MNG", [65, 22, 140, 59]],
  ["PRK JPN", [112, 26, 151, 53]],
  ["USA", [160, 45, 227, 72]],
];
const waterViews = [
  ["Baltic Sea|White Sea|Gulf of Finland", [6, 48, 49, 70]],
  ["Black Sea|Sea of Azov|Caspian Sea", [17, 34, 62, 52]],
  ["Barents Sea|Kara Sea|Yenisey Gulf|Gulf of Ob", [12, 61, 101, 84]],
  ["Laptev Sea|East Siberian Sea|Chukchi Sea", [97, 62, 210, 85]],
  ["Sea of Okhotsk|Sea of Japan|Shelikhova Gulf", [123, 33, 171, 65]],
  ["Bering Sea|Gulf of Anadyr'", [151, 46, 222, 73]],
  ["island:sakhalin", [128, 41, 161, 57]],
  ["island:wrangel", [159, 64, 200, 77]],
  ["island:novaya", [32, 65, 81, 82]],
];

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS(mapSvgNamespace, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function wrapLongitude(lon, center) {
  return lon + 360 * Math.round((center - lon) / 360);
}

function fitMap([west, south, east, north]) {
  const middleLon = (west + east) / 2;
  const middleLat = (south + north) / 2;
  const cosLat = Math.max(.19, Math.cos(middleLat * Math.PI / 180));
  const scale = Math.min((mapWidth - 36) / ((east - west) * cosLat), (mapHeight - 36) / (north - south));
  const longitudeScale = scale * cosLat;
  const viewport = [
    middleLon - mapWidth / 2 / longitudeScale, middleLat - mapHeight / 2 / scale,
    middleLon + mapWidth / 2 / longitudeScale, middleLat + mapHeight / 2 / scale,
  ];

  function project(lon, lat) {
    return [mapWidth / 2 + (lon - middleLon) * longitudeScale, mapHeight / 2 - (lat - middleLat) * scale];
  }

  function path(polygons, outline = false) {
    const [left, bottom, right, top] = viewport;
    const segments = [];
    for (const [w, s, e, n, rings] of polygons) {
      if (s > top || n < bottom) continue;
      const start = Math.ceil((left - e) / 360);
      const end = Math.floor((right - w) / 360);
      for (let copy = start; copy <= end; copy++) {
        for (const ring of rings) {
          const coordinates = [];
          for (let index = 0; index < ring.length; index += 2) {
            const [x, y] = project(ring[index] + copy * 360, ring[index + 1]);
            coordinates.push(x.toFixed(1) + "," + y.toFixed(1));
          }
          if (outline) {
            let move = true;
            for (let index = 0; index < coordinates.length; index++) {
              const current = (index + 1) % coordinates.length;
              const lon = ring[index * 2];
              const nextLon = ring[current * 2];
              // Natural Earth closes polygons at the antimeridian. Skip these artificial edges.
              if (Math.abs(lon) >= 179.998 && Math.abs(nextLon - lon) <= .002) {
                move = true;
              } else {
                if (move) segments.push("M" + coordinates[index]);
                segments.push("L" + coordinates[current]);
                move = false;
              }
            }
          } else {
            segments.push("M" + coordinates.join(" ") + "Z");
          }
        }
      }
    }
    return segments.join("");
  }

  return { project, path, viewport, middleLon };
}

function makeGrid(camera) {
  const [left, low, right, high] = camera.viewport;
  const bottom = Math.max(-90, low);
  const top = Math.min(90, high);
  const spacing = [1, 2, 5, 10, 20, 30].find(value => (right - left) / value <= 12) ?? 45;
  const latitudeSpacing = Math.max(1, spacing / 2);
  const lines = [];
  for (let lon = Math.ceil(left / spacing) * spacing; lon < right; lon += spacing) {
    lines.push(`M${camera.project(lon, bottom)}L${camera.project(lon, top)}`);
  }
  for (let lat = Math.ceil(bottom / latitudeSpacing) * latitudeSpacing; lat < top; lat += latitudeSpacing) {
    lines.push(`M${camera.project(left, lat)}L${camera.project(right, lat)}`);
  }
  return svgNode("path", { class: "graticule", d: lines.join("") });
}

function markerChoices(question) {
  const [lon, lat] = question.point;
  const cosine = Math.max(.2, Math.cos(lat * Math.PI / 180));
  const distance = ([x, y], [otherX, otherY]) => Math.hypot((x - otherX) * cosine, y - otherY);
  const ordered = physicalQuestions
    .filter(item => item !== question && item.name !== question.name)
    .map(item => ({
      item,
      point: [wrapLongitude(item.point[0], lon), item.point[1]],
    }))
    .filter(option => distance(option.point, question.point) >= .55)
    .sort((a, b) => (
      distance(a.point, question.point) * (a.item.topic === question.topic ? .55 : 1) -
      distance(b.point, question.point) * (b.item.topic === question.topic ? .55 : 1)
    ));
  const options = [{ item: question, point: question.point }];
  for (const option of ordered) {
    if (options.every(other => distance(option.point, other.point) >= .85)) options.push(option);
    if (options.length === 4) break;
  }
  const lons = options.map(option => option.point[0]);
  const lats = options.map(option => option.point[1]);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const lonPadding = Math.max((east - west) * .14, 1.2 / cosine);
  const latPadding = Math.max((north - south) * .16, 1.15);
  const camera = fitMap([west - lonPadding, south - latPadding, east + lonPadding, north + latPadding]);
  const visible = [];
  for (const { item, point } of options) {
    const position = camera.project(...point);
    if (visible.every(other => Math.hypot(position[0] - other.position[0], position[1] - other.position[1]) >= 77)) {
      visible.push({ item, position });
    }
  }
  return { camera, markers: visible.sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]) };
}

function areaCamera(question) {
  if (!question) return fitMap([0, 32, 210, 82]);
  const views = question.country ? countryViews : waterViews;
  const id = question.country || question.shape;
  const separator = question.country ? " " : "|";
  const match = views.find(([keys]) => keys.split(separator).includes(id));
  return fitMap(match?.[1] ?? [0, 32, 210, 82]);
}

function drawRussiaMap(svg, question, answer) {
  const useMarkers = question && !question.country && !question.shape;
  const { camera, markers } = useMarkers ? markerChoices(question) : { camera: areaCamera(question), markers: [] };
  svg.replaceChildren(makeGrid(camera));
  svg.classList.remove("map-locked");
  const land = svgNode("path", { class: "russia-land", d: camera.path(russiaData.land), "fill-rule": "evenodd" });
  const coast = svgNode("path", { class: "coastline", d: camera.path(russiaData.land, true) });
  svg.append(land, coast);

  let rightNode;
  const buttons = [];
  function addChoice(node, right, label) {
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", label);
    node.addEventListener("click", event => {
      event.stopPropagation();
      answer(right, node);
    });
    node.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) answer(right, node);
    });
    svg.append(node);
    if (right) rightNode = node;
    buttons.push(node);
  }

  function addArea(path, right, label) {
    if (!path) return;
    addChoice(svgNode("path", { class: "russia-area", d: path, "fill-rule": "evenodd" }), right, label);
  }

  if (question?.country) {
    const shapes = Object.entries(russiaData.countries)
      .map(([code, polygons]) => [code, camera.path(polygons)])
      .filter(([, path]) => path);
    for (const [code] of shapes) {
      svg.append(svgNode("path", { class: "country-line", d: camera.path(russiaData.countries[code], true) }));
    }
    shapes.forEach(([code, path], index) => addArea(path, code === question.country, `Территория ${index + 1}`));
  } else if (question?.shape) {
    const useIslands = question.shape.startsWith("island:");
    const alternatives = Object.entries(russiaData.shapes).filter(([name]) => name.startsWith("island:") === useIslands);
    alternatives.sort(([a], [b]) => Number(a === question.shape) - Number(b === question.shape));
    alternatives.forEach(([name, polygons], index) => {
      addArea(camera.path(polygons), name === question.shape, `Участок карты ${index + 1}`);
    });
  } else if (useMarkers) {
    markers.forEach(({ item, position: [x, y] }, index) => {
      const marker = svgNode("g", { class: "russia-marker", transform: `translate(${x} ${y})` });
      marker.append(
        svgNode("circle", { class: "marker-hit", r: 30 }),
        svgNode("circle", { class: "marker-dot", r: 10 }),
      );
      addChoice(marker, item === question, `Точка ${index + 1}`);
    });
  }

  svg.onclick = question && !useMarkers ? event => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const miss = svgNode("circle", { class: "miss-dot", cx: point.x, cy: point.y, r: 9 });
    if (answer(false, miss)) svg.append(miss);
  } : null;

  return {
    scale: useMarkers ? "Маркеры на увеличенной карте" : question?.country === "RUS" ? "Обзорная карта" : "Контурная карта региона",
    reveal(wrongNode) {
      if (wrongNode) wrongNode.classList.add("wrong");
      if (rightNode) {
        rightNode.classList.add("right");
        rightNode.setAttribute("aria-label", question.name);
        svg.append(rightNode);
      }
      svg.classList.add("map-locked");
      for (const node of buttons) {
        node.setAttribute("aria-disabled", "true");
        node.setAttribute("tabindex", "-1");
      }
    },
  };
}
