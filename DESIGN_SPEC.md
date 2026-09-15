# easy4tutor — специфікація дизайну

Цей документ визначає реалізовану візуальну систему easy4tutor. Продуктова логіка залишається у `PRODUCT_SPEC_MVP.md`, поведінка клієнта — у `FRONTEND_SPEC.md`, обмеження — у `DO_NOT_DO.md`. Візуальний pass не змінює API, схему даних, права, автентифікацію або інтеграційні протоколи.

## 1. Дизайн-теза

easy4tutor — особистий робочий простір приватного викладача: **менше організації, більше навчання**. Основні відчуття: спокій, контроль і безперервність. Інтерфейс польською, суми у PLN, дати в часовому поясі викладача.

Концепція «Żywy planer» збережена: точна часова сітка, структуровані нотатки й історія навчання. У центрі робочого дня наступний урок, а не дохід або набір KPI. Не використовуємо декоративні ілюстрації, neon, gradients, glassmorphism або надмірну анімацію.

## 2. Логотип і характер бренду

### Джерело

Основне надане artwork — `logo.png`, PNG 1254 × 1254, sRGB, без alpha. `Завантаження/561620b1-3339-4ca9-a569-002b6f40990f.png` — побайтовий дублікат; SHA-256 обох: `9b66b91971a00bdbeccdcba2b51eda55e2c1a2b28bad0adfd4083267635b4478`. Інші зображення переглянуті контактними аркушами; додаткових варіантів easy4tutor немає. Початково немає SVG, favicon, dark/light або компактного production export.

Production-копія оригіналу: `public/brand/easy4tutor-original.png`. Скрипт `scripts/prepare-brand-assets.mjs` відокремлює вже наявні знак і напис по порожньому простору та створює PNG-експорти й іконки. Він не перемальовує, не трасує й не перефарбовує artwork. Оригінал залишається незмінним. Для повторного експорту: `node scripts/prepare-brand-assets.mjs`.

### Візуальний аналіз

- Знак поєднує розгорнуту книгу, діалог і цифру 4. Це асоціації з навчанням, комунікацією, простотою та послідовністю.
- Зелений близько `#2DB987` і графіт близько `#223039`; оригінальний raster має природні тональні варіації, а не один flat fill.
- М’які зовнішні кути поєднані з чіткою геометрією сторінок. Тому UI використовує компактні прямокутні кнопки, радіус 8 px, картки 12 px, великі панелі 16 px.
- Напис щільний, округлий, sans-serif. Основний інтерфейс підтримує його через Manrope; serif збережений лише у двох маркетингових акцентах.

### Правила використання

Єдиний компонент `BrandLogo` показує вихідний знак і wordmark. Desktop shell: знак 34 px, напис 132 px; public: 40 і 146 px. На mobile: знак 28–30 px, напис 112–120 px. На tablet sidebar залишається лише знак 38 px та доступна текстова назва. У мобільному drawer показується бренд один раз у заголовку.

Зберігаємо aspect ratio (`height: auto`, `object-fit: contain`, без flex shrink). Safe area: мінімум 6 px вертикально, 8 px між знаком і написом, 12 px до сусідніх контролів. Біле тло є частиною наданого raster: logo використовується на білих поверхнях, без CSS filter, mix-blend-mode, crop wordmark або випадкового кольорового підкладу. SVG не вигадується замість відсутнього оригіналу. PNG-джерела мають достатню роздільність для Retina.

`src/app/icon.png` (64 × 64) і `src/app/apple-icon.png` (180 × 180) містять той самий знак із полями. Next.js автоматично додає favicon/apple-touch metadata. Немає окремої PWA/manifest чи OpenGraph-картинки; цей pass не додає неіснуючих продуктових можливостей.

## 3. Єдині токени

Реалізація: `src/app/globals.css`, `:root`. Старі UI-токени `lesson-blue` і `coral-note` замінені на змістовні назви.

| Токен | Значення | Роль |
| --- | --- | --- |
| `brand-logo` | `#2DB987` | Орієнтир кольору artwork; не колір текстових CTA |
| `brand-primary` | `#137D60` | CTA, links, selected, focus, поточний навчальний крок |
| `brand-hover` | `#0E644D` | Hover головної дії |
| `brand-soft` / `info-bg` | `#EAF5EF` | Вибраний стан, поточний день, marketing surface |
| `canvas` | `#F5F7F6` | Спокійне нейтральне тло |
| `surface` | `#FFFFFF` | Основні панелі, форми, shell |
| `surface-subtle` | `#F8FAF9` | Hover та тихі допоміжні поверхні |
| `ink` | `#223039` | Текст і заголовки |
| `muted` | `#64716F` | Допоміжні тексти |
| `border` | `#DCE4DF` | Розділювачі та групування |
| `border-strong` | `#BAC9C1` | Контекстні панелі |
| `control-border` | `#82948A` | Читабельна межа input |
| `attention` | `#AA7334` | Незавершена педагогічна робота |
| `success` / `success-bg` | `#20744A` / `#E7F5ED` | Оплачено, успішна дія |
| `warning` / `warning-bg` | `#8A5B00` / `#FFF3D7` | Очікує, потребує уваги |
| `warning-subtle` / `warning-border` | `#FCF8EF` / `#E9DDC4` | Календарні попередження |
| `error` / `error-bg` | `#B9362B` / `#FDE9E7` | Помилка, конфлікт |
| `unavailable` / `unavailable-ink` | `#EFF2F0` / `#62716A` | Недоступність і нейтральний статус |

Яскравий зелений логотипу не використовується для дрібного білого тексту: основний interactive green затемнений для контрасту. Фінансові статуси використовують окремі semantic tokens, не brand-primary. Колір завжди доповнений назвою, іконкою або формою вузла. Темна тема не входить у MVP.

## 4. Типографіка, простір, геометрія

Шрифти self-hosted через `next/font/local` із ліцензіями SIL OFL у `src/app/fonts/`. Збірка не звертається до Google Fonts; Literata не preload-иться на робочих екранах.

Дві variable font families з польськими діакритичними знаками (повні локальні font-файли, display swap):

- **Manrope** (`--font-ui`): усі заголовки застосунку, body, форми, навігація, числа. `font-variant-numeric: tabular-nums` для часу, сум і таблиць.
- **Literata** (`--font-editorial`): лише «Więcej uczenia.» на landing та коротка фраза на auth aside. Не використовується в input, планах чи таблицях.
- **DM Mono прибраний**: окрема mono-сім’я не покращувала читання цін і часу та робила UI технічним.

H1 застосунку 30 px / 1.21, вага 750; H2 21 px / 1.27, 700; H3 18 px; body 15 px / 1.53; small 13 px; caption 12 px. Ім’я учня 36 px desktop / 29 px mobile. Landing headline 40–60 px desktop, 34–46 px mobile; auth headline 32 px. Довгі імена та теми переносяться, а не руйнують контейнер.

Базова одиниця 4 px; кроки 8, 12, 16, 24, 32, 48 px. Максимальна ширина робочого контенту 1240 px, settings 1080 px. Desktop gutters 24–52 px, mobile 14 px. Радиуси 8 / 12 / 16 px; аватари — м’які квадрати, великі 18 px. Кнопки не pill. Стандартні картки без тіней; тінь тільки для плаваючих поверхонь.

## 5. Shell та responsive

Desktop від 1200 px: білий sidebar 244 px, logo на початку, secondary «Dodaj lekcję», сканована навігація, settings відділені простором, профіль внизу. Активний пункт — світлий зелений фон і темний зелений текст, без важкої вертикальної смуги. Екранні main CTA виразніші за глобальну secondary-дію.

Tablet 768–1199 px: sidebar 84 px зі знаком і доступними назвами навігації. Контекстні панелі складаються під контент на вузькому екрані.

Mobile <768 px: білий header, незатиснений логотип, кнопка додавання, нижня навігація Dzisiaj / Kalendarz / Uczniowie / Więcej. Меню — Radix dialog з focus trap і поверненням focus. Bottom safe area зарезервована. Інтерактивні елементи мінімум 44 px; input 16 px для запобігання zoom. Week grid замінюється agenda, таблиці — рядками з назвами полів.

## 6. Dzisiaj

Порядок і DOM: дата → наступний урок → план дня → Do uzupełnienia → secondary metrics.

На desktop наступний урок зліва, план та незавершені уроки справа. Час і учень помітніші за статуси та гроші. План дня і Do uzupełnienia відділяються простором і лініями, без зайвих карток. Наступний урок — одна цілісна світла панель із дією Otwórz lekcję. На mobile він також перший.

Якщо наступного уроку немає, компактна плашка планування займає всю ширину; нижче план і незавершені уроки. Для нового акаунта шлях починається з додавання учня. Немає фальшивих уроків для заповнення пустоти.

## 7. Calendar

Тиждень — default, доступні day/month/agenda. Компактні заголовки днів, тонка сітка, поточний день позначений green-soft і лінією, поточний час — окремим маркером. Звичайні події нейтральні; зелене підсвічування тільки hover/focus/планування. Потреба заповнення — стриманий amber, completed — нейтральна поверхня з semantic marker, cancelled — перекреслена назва й нейтральний статус. Група має іконку/кількість, недоступність — штрихування.

Помилки Google позначені в подіях. Над календарем є стримане попередження з посиланням Sprawdź połączenie, якщо існують failed/deleted_in_google уроки. Збереження локального уроку не залежить від цього попередження.

Збережені існуючі поведінки: planning selector, hover часу, sheet зі слота, явні conflict/group decisions, undo перенесення, scope серії. На mobile всі функції доступні через agenda, day actions та форму.

## 8. Створення уроку

Desktop side sheet, mobile повний екран. Чіткі змістові групи замість вкладених карток:

1. Учень / група; після вибору стислий список і «Zmień / dodaj do grupy».
2. Дата, час і тривалість; тип Jednorazowo / Kilka terminów / Cyklicznie.
3. Контекст зайнятості дня.
4. Формат, ціна, trial, link/address.
5. Необов’язкові тема й план у disclosure.

Defaults з учня, recurrence preview, validation, conflict та dirty-state збережені. Footer завжди має Anuluj та дію з реальною кількістю створюваних уроків. Secondary не конкурує з CTA.

## 9. Учень і Progress thread

Персональний header: аватар, статус, ім’я, рівень/ціль. Primary Zaplanuj lekcję, secondary Edytuj, інші дії в disclosure. Вкладки Przegląd / Lekcje / Postęp / Płatności / Materiały.

**Signature pattern: Ostatnio → Teraz → Następnie.** Тонка вертикальна лінія, circle-check для минулого, ромб для поточного, порожнє коло для майбутнього. У student profile поточний зміст на тихій green-soft поверхні. Є оцінка та кількість пунктів. Наявні уроки відкриваються кліком по темі; відсутні кроки мають чесний placeholder. Компактний варіант використовується у наступному уроці.

Контакт і стандартні параметри — окрема невелика панель. Нитка й таблиці не дублюють між собою business rules: джерело — існуючий progressContext.

## 10. Lesson workspace

Зліва спільний план, справа індивідуальний результат, присутність, оплата та збереження. Participant switch залишається над workspace; спільний план стабільний. Пункти відділені лініями замість вкладених карток. Topic та plan text використовують UI sans. Score компактний, доступний клавіатурою; note розгортається. Completed показується checkbox, текстом і semantic marker.

На mobile одна колонка, закріплена панель збереження, запас простору внизу та scroll-padding для доступу до сфокусованих полів. Пункти можна переставляти явними кнопками; drag не є єдиним способом. Не змінюємо зміст оцінок, rules завершення або shared-plan data model.

## 11. Payments, statistics, settings

Payments: спокійна summary strip, пошук і фільтри, subtle row separators, суми праворуч із tabular numerals. Кольоровий badge містить назву статусу. На mobile кожен рядок має явні назви полів. Фінансові обчислення незмінні.

Statistics: lesson/hour/student summaries, окремо Planowane / Do otrzymania / Otrzymane, один зелений trend series. Немає rainbow або декоративних charts.

Settings: Profil / Dostępność / Integracje / Subskrypcja; Konto — окрема секція профілю з посиланням на існуючий password-reset. Білий структурований простір, пояснення зліва, fields справа; одна колонка на mobile. Integrations — нейтральні іконки й реальні стани. Subscription зберігає чинні ціни, PayU і read-only правила.

## 12. Public, auth та metadata

Landing: короткий власний headline «Mniej organizacji. Więcej uczenia.», value proposition, trial CTA, продуктова композиція з наступним уроком і реальною структурою Progress thread, позначена як приклад. Три секції описують планування, прогрес та розрахунки. Ціни не змінені. Немає вигаданих відгуків або лічильників.

Auth: справжній logo, проста біла форма, світлий зелений aside з короткою Literata-фразою та правильно вирівняною ниткою. Aside зникає на вузьких екранах; форма і бренд залишаються. Reset використовує ту саму ширину форми та input system.

Root title: easy4tutor — mniej organizacji, więcej uczenia. Public titles: Zaloguj się / Załóż konto / Odzyskaj dostęp / Regulamin / Polityka prywatności + easy4tutor. ApplicationName — easy4tutor. Імена учнів не додаються до browser title.

Видима стара назва замінена також у повідомленнях інтеграцій, checkout description/product name, Telegram copy, calendar event descriptions та CSV filenames. Внутрішні cookie, store directory, extendedProperties key, migrations і environment variables не перейменовуються. Налаштування зовнішніх email templates живе поза frontend repository і цим pass не змінюється.

## 13. Стани, доступність та motion

- Loading: нейтральні skeleton; local action spinner тільки у відповідному контролі.
- Empty: коротка пряма польська підказка, невеликий brand marker, наступна дія; без повторного logo.
- Error: проблема й наступний крок, поля з aria-invalid, доступні conflict dialogs.
- Success: повідомлення після підтвердження сервера; undo там, де дія оборотна.
- Focus: 2 px primary outline, offset 3 px та 3 px soft ring; input має явну контрастну межу.
- Motion: controls 150–160 ms, drawer 200–220 ms; без появи/згасання всього екрана при кожному переході. Reduced motion вимикає рух.
- Мінімальний текст 12 px; label не замінюється placeholder; semantic HTML, aria-current на навігації; групи статусів зрозумілі без кольору.

## 14. Visual QA та джерело порівняння

`https://www.tutorflow.pl/` переглянутий як rendered benchmark: використані лише принципи короткого headline, ієрархії, whitespace і ясних дій. Не використані його artwork, тексти, точні кольори або layout.

Скриншоти й machine-readable layout observations зберігаються локально в `artifacts/visual-qa/` (не production assets). Перед фінальним прийманням перевіряємо public, Dzisiaj, calendar, students/profile, lesson, payments, statistics і всі settings; ширини 360, 390, 768, 1280 px; long names, focus, drawer, group switch, completed state. Дані візуальної перевірки — лише локальний demo store.

Quality bar оцінюється за rendered UI, а не за фактом написання CSS: бренд, ієрархія, читабельність, alignment, mobile safe areas, відсутність clipping. Formatter, lint, typecheck, tests і production build обов’язкові. Перевірка demo UI не означає перевірки live PayU, Google OAuth, Telegram чи production email templates.

