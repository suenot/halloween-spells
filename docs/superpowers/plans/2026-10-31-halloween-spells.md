# Halloween Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Хэллоуин-сайт заклинаний с игрой через камеру/микрофон, турнирами, командами и сюжетами.

**Architecture:** Статический фронт (ванильный JS, ES modules, без сборки) + Node-сервер без зависимостей, который отдает `public/` и хранит JSON в `data/` через `/api/*`. Чистая логика (оценка, классификация жестов, нечеткое сравнение, турнир) в `public/js/core/` и тестируется `node --test`. Браузерные адаптеры (камера, речь, эффекты) в `public/js/engine/`.

**Tech Stack:** Node 20+ (`node:test`), MediaPipe Tasks Vision (локально в `public/vendor/`), Web Speech API, Canvas 2D, CSS + Web Animations API.

**Spec:** `docs/superpowers/specs/2026-10-31-halloween-spells-design.md`

## Global Constraints
- Работает без интернета (все библиотеки и модель руки лежат в `public/vendor/`).
- Терминология: везде "игрок" (`player`), а не "ребенок". Класс игрока: `kind: "child" | "adult"`, в UI "Дети" и "Взрослые".
- Русский текст: буква "е" вместо "ё", кавычки только прямые `"`.
- UI рассчитан на 8 игроков, число игроков произвольное. Взрослые: `kind: "adult"`, `race: "giant"`.
- Результаты турнира пишутся на диск после каждого заклинания.
- Ведущий всегда может засчитать/не засчитать вручную.

## Review Focus
- Камера или микрофон запрещены / нет `SpeechRecognition` (Safari, Firefox): игра остается рабочей через ручное "засчитать".
- Перезагрузка страницы посреди турнира: состояние восстанавливается с диска.
- Ноль игроков, один игрок, нечетное число при делении на команды: нет падения, понятное сообщение.
- Два игрока с одинаковым именем: разные `id`, таблица не склеивает.
- Пустая/шумная речь, длинная фраза: оценка 0..50, без NaN.

## File Structure
- `server.mjs`: статика + `GET/PUT /api/:name` для `players|teams|spells|stories|tournaments|current`. Валидный `name` из белого списка, запись атомарная.
- `data/*.json`: исходные данные.
- `public/index.html`, `public/css/{theme,screens,fx}.css`.
- `public/js/main.js`: роутер экранов. `public/js/store.js`: клиент API.
- `public/js/core/{fuzzy,scoring,gestures,tournament,teams}.js`: чистая логика.
- `public/js/engine/{camera,speech,fx}.js`: адаптеры.
- `public/js/ui/{spellbook,roster,game,leaderboard,stories}.js`: экраны.
- `tests/*.test.mjs`.

### Task 1: Сервер и хранилище
**Files:** Create `package.json`, `server.mjs`, `data/*.json` (пустые массивы), `tests/server.test.mjs`
**Produces:** `startServer(port, dataDir) -> Promise<http.Server>`; API `GET /api/players` -> JSON, `PUT /api/players` пишет тело; неизвестное имя -> 404; невалидный JSON -> 400.
- [ ] Тест: PUT затем GET возвращает то же; `/api/../x` -> 404; битый JSON -> 400.
- [ ] Реализовать сервер (запись через временный файл + rename).
- [ ] `npm test` зеленый. Commit.

### Task 2: Чистое ядро: fuzzy, scoring, teams
**Files:** Create `public/js/core/{fuzzy,scoring,teams}.js`, тесты.
**Produces:**
- `similarity(a: string, b: string) -> number` в 0..1 (нормализация: нижний регистр, "ё"->"е", без пунктуации, Левенштейн по словам/символам).
- `scoreAttempt({ phraseSim: number, gestureOk: number, difficulty: 1..5, lenient: boolean }) -> { word: 0..50, gesture: 0..50, total: number, success: boolean }` где `total = round((word+gesture) * (1 + (difficulty-1)*0.25))`; при `lenient` порог успеха 0.5, иначе 0.8.
- `splitTeams(players, { by: "gender"|"random", names?: [string,string] }) -> { teams: [{name, playerIds}], warning?: string }`.
- [ ] Тесты: `similarity("Экспеллиармус","экспелиармус") > 0.85`, `similarity("", "x") === 0`, `scoreAttempt` не дает NaN, пустая команда не падает.
- [ ] Реализовать. Commit.

### Task 3: Данные: заклинания, игроки, сюжеты
**Files:** `data/spells.json` (>=12 школы "wizard", >=12 школы "shinobi"), `data/players.json`, `data/stories.json`, `tests/data.test.mjs`
**Схема заклинания:** `{id, school, name, phrase, gesture:[gestureId...], description, element, difficulty:1..5, power, cost, range, hint, color}`. Стихии: fire, water, earth, air, lightning, ice, dark, light.
**Команды:** `data/teams.json`, `{id, name, color, playerIds:[...]}`; редактируются в UI, используются режимом "Команды" и сохраняются между турнирами.
**Игроки:** `{id, name, kind:"child"|"adult", race?:"giant", gender?, role?, team?}`; дети: восемь демо-игроков; взрослые: шесть демо-игроков, великаны, `active:false` по умолчанию (см. data/seed/players.json).
**Сюжеты:** `{id, title, mode:"ensemble", intro, roles:[{id,title,spellId}], scenes:[{text, roleId}]}`, минимум 2 сюжета на 8 ролей.
- [ ] Тест валидации: уникальные id, gestureId существуют в `core/gestures.js`, сложность 1..5, element из списка, все `spellId`/`roleId` ссылаются на существующее.
- [ ] Заполнить данные. Commit.

### Task 4: Классификатор жестов (чистый)
**Files:** `public/js/core/gestures.js`, `tests/gestures.test.mjs`
**Produces:**
- `WAND = ["circle","swipe_right","swipe_left","up","down","zigzag"]`, `SEALS = ["prayer","fist_palm","double_fist","peace","open_hands","fist_up"]`; `GESTURE_LABELS: Record<id, string>`.
- `classifyTrace(points: {x,y,t}[]) -> { id: string|null, confidence: 0..1 }` (по траектории кончика указательного, нормализованные координаты 0..1).
- `classifyPose(hands: Landmark[][]) -> { id: string|null, confidence }` (до двух рук, 21 ландмарк MediaPipe; признаки: сколько пальцев вытянуто, расстояние между запястьями, высота руки).
- `matchSequence(expected: string[], observed: string[]) -> number` 0..1 (доля шагов по порядку).
- [ ] Тесты: синтетический круг -> `circle`; линия слева направо -> `swipe_right`; набор ландмарок "две ладони вместе пальцами вверх" -> `prayer`; шум -> `id: null`.
- [ ] Реализовать, Commit.

### Task 5: Тема и каталог заклинаний
**Files:** `public/index.html`, `public/css/*.css`, `public/js/{main,store}.js`, `public/js/ui/spellbook.js`, `public/js/engine/fx.js`
- [ ] Хэллоуин-тема (тыква-оранжевый, фиолетово-черный, зеленый glow), плавающие летучие мыши/призраки, частицы, шрифты системные + заголовочный (локальный).
- [ ] Каталог: фильтры по школе и стихии, сортировка по сложности; карточка с анимацией появления, "звездочки" сложности, значок стихии, описание, фраза и подсказка жеста; по клику модальный показ эффекта на canvas.
- [ ] Идеи motion из `motion-videos-warehouse` / `batumi` применить к переходам (stagger, reveal, parallax).
- [ ] Проверка в браузере (скриншот), Commit.

### Task 6: Игроки и ростер
**Files:** `public/js/ui/roster.js`
- [ ] Игроки двух классов (дети, взрослые) показаны раздельно (взрослые с значком "великан", крупнее аватар), добавить/редактировать/включить в игру, роль и команда. Сохранение в `players`.
- [ ] Commit.

### Task 7: Игра с камерой
**Files:** `public/js/engine/{camera,speech}.js`, `public/js/ui/game.js`
**Produces:** `startCamera(videoEl) -> Promise<HandTracker>` где `HandTracker.onFrame(cb: (hands: Landmark[][], t: number) => void)`; `listen(onResult: (text: string) => void) -> { stop() }`, при отсутствии API возвращает `null`.
- [ ] Скачать MediaPipe `tasks-vision` + `hand_landmarker.task` в `public/vendor/` (npm пакет + модель). Если нет интернета, игра идет в режиме "ведущий засчитывает".
- [ ] Экран игры: видео по центру (зеркально), слово и подсказка жеста поверх, таймер раунда, прогресс слова и жеста, эффект заклинания при успехе, кнопки ведущего "засчитать" / "еще раз" / "пропустить".
- [ ] Щадящий режим по умолчанию, переключатель в настройках.
- [ ] Commit.

### Task 7b: Калибровка палочки (запрос пользователя)
**Files:** `public/js/engine/wand.js`, `public/js/ui/calibrate.js`
**Produces:** `calibrateWand(video) -> { hue, sat, val, tol }` (пользователь показывает палочку, кликает по ней в кадре, сохраняется в `localStorage`/`settings`); `findWandTip(imageData, calib) -> {x,y}|null` (самый большой блоб цвета, точка дальше всего от запястья).
- [ ] Если палочка найдена, `classifyTrace` кормится кончиком палочки, иначе кончиком указательного пальца.
- [ ] Commit.

### Task 8: Турнир и рейтинг
**Files:** `public/js/core/tournament.js`, `public/js/ui/leaderboard.js`, `tests/tournament.test.mjs`
**Produces:** `createTournament(players, mode, opts) -> Tournament`; `recordAttempt(t, playerId, spellId, result) -> Tournament`; `standings(t) -> [{playerId, total, successes, attempts}]` (сортировка по total, потом успехам); `finishTournament(t)`; `nextPlayer(t)`.
- [ ] Тесты: порядок таблицы, ничья, пустой турнир, повторная запись.
- [ ] Экран таблицы (анимированное перестроение мест, подиум), "Новый турнир" (старый уходит в `tournaments`), история.
- [ ] Commit.

### Task 9: Режимы: сюжет и команды
**Files:** `public/js/ui/stories.js`, расширение `game.js`/`tournament.js`
- [ ] Режим "Сюжет": выбор сюжета, раздача ролей игрокам (авто/вручную), сцены по очереди вызывают нужного игрока и его заклинание, итог — общий счет + личные.
- [ ] Режим "Команды": две команды (по полу или вручную), счет по командам и по игрокам.
- [ ] Commit.

### Task 10: Финальная проверка
- [ ] `npm test` зеленый, запуск `npm start`, пройти все экраны в браузере (скриншоты), проверить консоль без ошибок, режим без камеры.
- [ ] README с запуском и инструкцией для ведущего. Commit.
