"use strict";

const russiaMap = document.querySelector("#russia-map");
const russiaHeading = document.querySelector("#russia-heading");
const topicSelect = document.querySelector("#topic");
const modeNote = document.querySelector("#mode-note");
const regionField = document.querySelector("#region-field");
const regionSelect = document.querySelector("#region");
const russiaPrompt = document.querySelector("#russia-prompt");
const russiaTarget = document.querySelector("#russia-target");
const russiaFeedback = document.querySelector("#russia-feedback");
const russiaProgress = document.querySelector("#russia-progress");
const russiaCount = document.querySelector("#russia-count");
const russiaMistakes = document.querySelector("#russia-mistakes");
const mapScale = document.querySelector("#map-scale");
const nextButton = document.querySelector("#next");
const reviewButton = document.querySelector("#review");
const russiaRestart = document.querySelector("#russia-restart");

const modes = [
  ["mixed", "Смешанный раунд"],
  ["regional", "Смешанный раунд по региону"],
  ["region-all", "Все объекты региона"],
  ["all", "Весь перечень"],
  ...topics,
];
const topicLabels = new Map(topics);
const regionsById = new Map(regionalGeography.map(region => [region.id, region]));
let round;
let activeMap;

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function exercisesFor(mode) {
  if (mode === "regional") return regionalExercises(regionsById.get(regionSelect.value));
  if (mode === "region-all") return regionsById.get(regionSelect.value).questions;
  if (mode === "all") return allQuestions;
  if (mode !== "mixed") return byTopic.get(mode);

  const chosen = [];
  const names = new Set();
  for (const [id] of topics) {
    const sample = shuffled(byTopic.get(id)).filter(item => !names.has(item.name)).slice(0, 2);
    chosen.push(...sample);
    sample.forEach(item => names.add(item.name));
  }
  return chosen;
}

function startRussiaRound(items = exercisesFor(topicSelect.value), isReview = false) {
  const mode = topicSelect.value;
  const region = mode === "regional" || mode === "region-all" ? regionsById.get(regionSelect.value) : null;
  round = {
    region,
    total: items.length,
    queue: shuffled(items),
    solved: 0,
    errors: 0,
    missed: new Set(),
    answered: false,
  };
  if (isReview) {
    modeNote.textContent = "Повторение объектов, в которых были ошибки.";
  } else if (mode === "mixed") {
    modeNote.textContent = "По два объекта из каждой темы.";
  } else if (mode === "cisList") {
    modeNote.textContent = "Расположение стран из раздела «СНГ» в учебном листе.";
  } else {
    modeNote.textContent = "";
  }
  regionField.hidden = !region;
  russiaHeading.textContent = region ? "Природные объекты России" : "Географическое положение России";
  document.title = russiaHeading.textContent + " · Геопрактика";
  modeNote.hidden = !modeNote.textContent;
  russiaProgress.max = round.total;
  showRussiaQuestion();
}

function updateRussiaProgress() {
  russiaProgress.value = round.solved;
  russiaCount.textContent = `${round.solved} / ${round.total}`;
  russiaMistakes.textContent = round.errors;
}

function showRussiaQuestion() {
  const question = round.queue[0];
  nextButton.disabled = true;
  nextButton.hidden = false;
  reviewButton.hidden = true;
  round.answered = false;
  const kind = round.region ? regionKinds[question.type] : null;
  russiaPrompt.textContent = kind ? kind.label : topicLabels.get(question.topic);
  russiaTarget.textContent = question.name;
  russiaFeedback.dataset.tone = "";
  russiaFeedback.textContent = kind?.hint ?? (question.country
    ? "Нажмите на территорию страны."
    : question.shape
      ? "Нажмите на нужный объект на карте."
      : "Выберите одну из точек на карте.");
  activeMap = round.region
    ? drawRegionalMap(russiaMap, round.region, question, answerRussiaQuestion)
    : drawRussiaMap(russiaMap, question, answerRussiaQuestion);
  mapScale.textContent = activeMap.scale;
  updateRussiaProgress();
}

function answerRussiaQuestion(correct, choice) {
  if (round.answered || !round.queue.length) return false;

  const question = round.queue.shift();
  round.answered = true;
  activeMap.reveal(correct ? null : choice);
  if (correct) {
    round.solved++;
    russiaFeedback.dataset.tone = "right";
    russiaFeedback.textContent = ["Верно!", question.note].filter(Boolean).join(" ");
  } else {
    round.errors++;
    round.missed.add(question);
    round.queue.splice(Math.min(3, round.queue.length), 0, question);
    russiaFeedback.dataset.tone = "wrong";
    russiaFeedback.textContent = ["Неверно. Правильное место отмечено зелёным. Вопрос повторится.", question.note].filter(Boolean).join(" ");
  }

  updateRussiaProgress();
  if (!round.queue.length) {
    russiaPrompt.textContent = "Раунд завершён";
    nextButton.hidden = true;
    reviewButton.hidden = !round.missed.size;
  } else {
    nextButton.disabled = false;
  }
  if (choice === document.activeElement) {
    const control = !round.queue.length ? (reviewButton.hidden ? russiaRestart : reviewButton) : nextButton;
    control.focus({ preventScroll: true });
  }
  return true;
}

for (const [id, label] of modes) topicSelect.add(new Option(label, id));
for (const region of regionalGeography) regionSelect.add(new Option(region.name, region.id));
const initialMode = new URLSearchParams(window.location.search);
const modeFromUrl = initialMode.get("mode");
const regionFromUrl = initialMode.get("region");
if (modes.some(([id]) => id === modeFromUrl)) topicSelect.value = modeFromUrl;
if (regionsById.has(regionFromUrl)) regionSelect.value = regionFromUrl;
else regionSelect.value = "far-east";
topicSelect.addEventListener("change", () => startRussiaRound());
regionSelect.addEventListener("change", () => startRussiaRound());
russiaRestart.addEventListener("click", () => startRussiaRound());
reviewButton.addEventListener("click", () => startRussiaRound([...round.missed], true));
nextButton.addEventListener("click", event => {
  if (!round.answered || !round.queue.length) return;
  showRussiaQuestion();
  if (event.detail === 0) russiaTarget.focus({ preventScroll: true });
});
startRussiaRound();
