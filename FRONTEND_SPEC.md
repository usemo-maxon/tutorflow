# TutorFlow — специфікація роботи frontend

Цей документ описує поведінку клієнтської частини TutorFlow. Він не визначає конкретний backend-фреймворк, але встановлює контракти, стани й правила, яких має дотримуватися frontend.

Пріоритет джерел:

1. `PRODUCT_SPEC_MVP.md` — продукт і межа MVP.
2. `DESIGN_SPEC.md` — візуальна система та UX.
3. `FRONTEND_SPEC.md` — маршрути, компоненти й поведінка клієнта.
4. `DO_NOT_DO.md` — обмеження та заборонені рішення.

## 1. Технічні принципи

- TypeScript у strict mode.
- Компоненти відображення не повинні напряму знати про transport/API layer.
- Дані сервера, локальний UI-стан і стан форм не змішуються в одному глобальному store.
- Дати з API передаються в ISO 8601; абсолютні моменти — в UTC, локальні правила повторення — разом з IANA timezone (`Europe/Warsaw`).
- Грошові значення передаються в найменших одиницях (`grosz`), наприклад `3900`, а не float `39.00`.
- Усі сутності мають стабільний ID; UI не використовує array index як key.
- Усі видимі рядки проходять через польський i18n-словник, навіть якщо MVP має одну мову.

## 2. Маршрути

Публічні:

```text
/
/logowanie
/rejestracja
/odzyskaj-haslo
/polityka-prywatnosci
/regulamin
```

Викладач:

```text
/app/dzisiaj
/app/kalendarz
/app/uczniowie
/app/uczniowie/:studentId
/app/lekcje/:lessonId
/app/platnosci
/app/statystyki
/app/ustawienia/profil
/app/ustawienia/integracje
/app/ustawienia/dostepnosc
/app/ustawienia/subskrypcja
```

Адміністратор:

```text
/admin
/admin/nauczyciele
/admin/subskrypcje
/admin/platnosci
/admin/wsparcie
/admin/statystyki
```

Admin route не повинен містити endpoint або UI для перегляду учнів, змісту уроків, нотаток чи вкладень.

## 3. App shell та охорона маршрутів

- Неавторизований користувач на `/app/*` перенаправляється на `/logowanie` із безпечним `returnTo`.
- Викладач не може відкрити `/admin/*`; адміністратор не отримує автоматичного доступу до tenant-даних викладача.
- Під час перевірки сесії показується app-shell skeleton, а не короткий flash сторінки входу.
- Після завершення trial/несплати інтерфейс переходить у read-only mode: дані доступні для перегляду та експорту, але mutation controls заблоковані з поясненням і CTA до підписки.
- Permission checks на frontend потрібні для UX, але не замінюють backend authorization.

## 4. Типи даних frontend

Орієнтовні контракти:

```ts
type EntityId = string;
type ISODateTime = string;
type Money = { amount: number; currency: 'PLN' };

type LessonStatus =
  | 'scheduled'
  | 'needs_completion'
  | 'completed'
  | 'cancelled';

type SyncStatus =
  | 'pending'
  | 'synced'
  | 'failed'
  | 'deleted_in_google'
  | 'disabled';

type PaymentStatus = 'unpaid' | 'paid' | 'cancelled';
type AttendanceStatus = 'unknown' | 'present' | 'absent' | 'cancelled';

interface StudentSummary {
  id: EntityId;
  name: string;
  level?: string;
  status: 'active' | 'archived';
  defaultDurationMinutes?: number;
  defaultFormat?: 'online' | 'offline';
  defaultPrice?: Money | null;
}

interface LessonParticipant {
  studentId: EntityId;
  attendanceStatus: AttendanceStatus;
  paymentStatus: PaymentStatus;
  results: PlanItemResult[];
}

interface PlanItem {
  id: EntityId;
  position: number;
  text: string;
}

interface PlanItemResult {
  planItemId: EntityId;
  completed: boolean;
  score?: number;
  note?: string;
}
```

Фактичні типи генерувати з API schema, якщо backend надає OpenAPI/GraphQL schema. Не дублювати вручну різні версії однієї сутності без необхідності.

## 5. Отримання та кешування даних

- Для server state використовувати бібліотеку рівня TanStack Query/SWR або еквівалент із query keys, invalidation і retry policy.
- Query keys включають tenant і релевантні фільтри.
- Деталі учня та списки уроків можуть кешуватися; права доступу й статус підписки мають регулярно актуалізуватися.
- Після mutation оновлювати лише залежні queries, не очищати весь кеш.
- Оптимістичні оновлення дозволені для оборотних дій: зміна статусу оплати, виконання пункту, drag-and-drop перенесення з undo.
- Не використовувати оптимістичне завершення для остаточного видалення, оплати PayU або підключення інтеграції.
- Retry: автоматично повторювати тільки ідемпотентні запити й тимчасові network/5xx помилки. Не повторювати 4xx без зміни даних.

## 6. Форми

- Єдина form library/підхід у всьому застосунку.
- Client validation дає швидкий feedback, але сервер залишається остаточним валідатором.
- Після server validation error зберігати введені дані й фокусувати перше проблемне поле.
- Не блокувати `Zapisz` лише через необов’язкові поля.
- Показувати dirty-state warning при спробі закрити незбережену складну форму уроку або учня.
- Enter не повинен випадково відправляти багатокрокову форму; keyboard behavior визначити явно.

Мінімальні перевірки уроку:

- щонайменше один активний учень;
- валідні дата, час і тривалість;
- тривалість більша нуля та в дозволеному діапазоні;
- online вимагає валідного способу зв’язку, якщо він не успадкований із профілю;
- offline може містити адресу;
- ціна не може бути від’ємною;
- score — ціле число від 1 до 10;
- recurrence має кінцеву дату або кількість повторів у межах безпечного ліміту.

## 7. Сценарій створення уроку

### Entry points

- глобальна кнопка `Dodaj lekcję`;
- дія `Zaplanuj lekcję` у картці учня;
- вибір учня/групи в calendar planning mode;
- дублювання існуючого уроку як нової одиничної події.

### Стан форми

Форма працює як одна логічна транзакція. Чернетка містить:

- participants;
- mode: single / multiple / recurring;
- occurrences;
- duration;
- format і location/meeting link;
- price/trial flag;
- optional plan.

При перемиканні режиму не втрачати вже введені дані без підтвердження.

### Перевірка календаря

Перед submit клієнт показує локально відомі конфлікти, але backend повторно перевіряє їх атомарно. Якщо за цей час слот зайняли, frontend отримує structured conflict response і пропонує:

- повернутися до вибору часу;
- якщо конфлікт — урок того самого викладача, підтвердити об’єднання в групу.

Об’єднання не відбувається автоматично. Frontend надсилає explicit merge intent і ID обох уроків/учасників.

### Multiple dates

- Кожен occurrence має власні дату, час і duration.
- Перед збереженням показати коротке summary та кількість уроків.
- Частковий успіх небажаний: backend має створювати набір атомарно або повернути список конфліктів до запису.

### Recurring series

- UI збирає timezone-aware recurrence rule.
- Попередньо показати наступні 3–5 дат і загальну кількість.
- Недоступні дні та конфлікти показати до підтвердження.
- При редагуванні occurrence frontend завжди запитує scope: only this / this and future.

## 8. Calendar frontend

- Основний view: week; додаткові: day і month.
- Внутрішня модель calendar range має явні `rangeStart`, `rangeEnd`, `timezone`.
- Зміна timezone перераховує відображення абсолютних дат, але не повинна мовчки переписувати правила регулярної недоступності.
- DST-тести обов’язкові для переходів у `Europe/Warsaw` та інших IANA timezone.
- Drag-and-drop перевіряє конфлікт і показує preview нового часу до mutation.
- Після успішного drag показати toast `Termin lekcji zmieniony` з `Cofnij`.
- Agenda/list view є повноцінною альтернативою grid для mobile й accessibility.
- Month view на mobile не намагається вмістити всі дані в клітинки; клік дня відкриває agenda.

## 9. Синхронізація Google Calendar

Frontend не спілкується з Google Calendar напряму після OAuth flow; операції виконує backend/worker.

Для кожного уроку показувати sync status:

- `pending`: ненав’язливий progress indicator;
- `synced`: зазвичай без badge, деталі доступні в меню;
- `failed`: видимий warning і `Spróbuj ponownie`;
- `deleted_in_google`: повідомлення та дві дії;
- `disabled`: нейтральне повідомлення, якщо інтеграцію відключено.

Повторна синхронізація:

- кнопка має loading state і захист від подвійного submit;
- повторний запит ідемпотентний;
- після успіху оновлюється лише конкретний урок та sync issue counter;
- помилка не скасовує локально збережений урок.

Якщо Google-подію видалено, frontend пропонує `Przywróć w Google` або `Pozostaw bez synchronizacji`; жодна дія не виконується автоматично.

## 10. Статус уроку та завершення

- Frontend відображає server-derived status; не визначає `needs_completion` лише локальним таймером.
- Після завершення часу сервер переводить урок у `needs_completion`.
- Unsaved evaluation state може тимчасово зберігатися локально для відновлення після reload, але не позначається як завершений до server confirmation.
- `Oznacz jako uzupełnioną` перевіряє необхідні поля. Якщо всі поля не є обов’язковими, UI чітко показує, що саме лишилося порожнім, але не вигадує вимог.
- Для групи перемикання учня зберігає локальну чернетку попереднього учасника.

## 11. Оплати учнів

- Статус платежу належить participant/lesson relation, а не самому уроку.
- Зміна `unpaid → paid` може бути optimistic з rollback.
- Скасування уроку відкриває явне рішення щодо оплати відповідно до налаштувань викладача; MVP не має мовчки змінювати її без видимого правила.
- Грошові підсумки форматувати через `Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })`.
- Статистика `Otrzymane` рахується лише з paid records, а `Do otrzymania` — з проведених/належних до оплати unpaid records за серверними правилами.

## 12. Вкладення

- Перед upload показати дозволені типи, максимальний розмір і строк зберігання.
- Перевіряти розмір на клієнті, але не покладатися на це як на security boundary.
- Upload має progress, cancel і retry.
- Ніколи не показувати storage path або приватний URL як постійне публічне посилання.
- Після закінчення строку показати стан `Plik wygasł`, якщо історичний запис лишається.
- Видалення вкладення вимагає підтвердження, якщо його не можна відновити.

## 13. Telegram

- Налаштування пояснює короткий flow підключення централізованого бота.
- UI показує `Połączono`, ім’я/ідентифікатор чату в безпечному вигляді та `Odłącz`.
- Не просити користувача вставляти token бота.
- Керування нагадуваннями відображає два стандартні моменти: 24 години й 1 година до уроку.
- Помилка доставки не впливає на існування уроку; вона відображається в integrations status/log без витоку технічних даних.

## 14. Підписка й PayU

- Frontend створює checkout session через backend і переходить на URL, отриманий від сервера.
- Не визначати успішну оплату лише за redirect query parameter. Після повернення опитати backend, який перевірив PayU notification/status.
- Стани: trial, active monthly, active annual, founder active, past due, read-only, cancelled.
- Founder slot призначає backend атомарно після першої успішної оплати.
- Лічильник Founder slots отримується з backend і є інформаційним; frontend не резервує місце під час реєстрації чи trial.
- Ціни відображаються з поясненням billing period; `29 zł/mies. na zawsze` лише для підтвердженого Founder plan.

## 15. Архівація, видалення та експорт

- `Archiwizuj ucznia` — оборотна дія з підтвердженням наслідків.
- Архівований учень доступний через фільтр і може бути відновлений.
- `Usuń dane ucznia` — окремий destructive flow: явний текст наслідків, повторне підтвердження та server-side job/status.
- Не обіцяти миттєве фізичне видалення з резервних копій; текст UI має відповідати реальній GDPR-політиці.
- CSV export запускається як server job, якщо набір даних великий; UI показує progress/status і безпечне тимчасове download link.
- Експорт має використовувати коректне UTF-8 кодування та польські назви колонок.

## 16. Error handling

Єдиний normalized error shape на frontend:

```ts
interface AppError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  correlationId?: string;
}
```

- Користувачу показується польське повідомлення, а не raw backend error.
- `correlationId` можна показати в деталях для підтримки.
- 401: один контрольований refresh attempt, потім login.
- 403: зрозумілий permission/read-only state.
- 404: entity-specific empty/not-found page.
- 409: спеціальний conflict flow, не generic toast.
- 422: errors біля полів.
- 429: cooldown і пояснення.
- 5xx/network: retry для безпечних операцій та збереження введеної форми.

## 17. Loading, empty та offline

- Кожен route має route-level loading UI.
- Кожен значущий список має empty state із релевантною дією.
- Повна offline-first робота не входить у MVP.
- При втраті мережі показати persistent banner `Brak połączenia. Niezapisane zmiany mogą zostać utracone.`
- Не створювати ілюзію успішного server save, коли користувач offline.

## 18. URL і фільтри

- Значущі фільтри списків і статистики зберігаються в query params.
- Відкриття конкретного уроку/учня має shareable internal URL, але доступ все одно перевіряється сервером.
- Modal route допускається лише якщо refresh і back button працюють передбачувано.
- Back повертає користувача до того самого calendar range/filter, а не завжди на default page.

## 19. Доступність frontend

- Semantic HTML перед ARIA.
- Focus management для dialog, drawer, toast actions і route transitions.
- Calendar events доступні клавіатурою; agenda view має ту саму функціональність.
- Drag-and-drop завжди має кнопкову альтернативу.
- Live region використовується для результатів save/sync, але не оголошує кожну фонову зміну.
- Automated axe перевірки доповнюються ручною keyboard-перевіркою.

## 20. Продуктивність

- Route-level code splitting.
- Важкі calendar/chart компоненти не завантажуються на сторінках, де вони не потрібні.
- Великі списки віртуалізувати лише після вимірювання; не ускладнювати короткі списки.
- Зображення/аватари мають визначені dimensions для уникнення layout shift.
- Search input debounce приблизно 200–300 ms; запити скасовуються при зміні query.
- Ціль: головний екран і week calendar залишаються інтерактивними на типовому мобільному пристрої та середньому ноутбуці без довгих main-thread tasks.

## 21. Аналітика продукту

Не передавати PII, теми уроків, нотатки чи контакти в analytics.

Дозволені події з технічними/продуктовими параметрами:

- `lesson_create_started`
- `lesson_created` з mode та duration bucket
- `lesson_conflict_shown`
- `lesson_group_merge_confirmed`
- `lesson_completion_saved`
- `google_sync_retry_clicked`
- `student_archived`
- `trial_started`
- `checkout_started`
- `subscription_activated`

Основні UX-метрики: час створення уроку, час підготовки плану, частка уроків, заповнених протягом 24 годин.

## 22. Тестування

Unit:

- money/date formatting;
- recurrence preview;
- status mapping;
- form validation;
- permission helpers.

Integration/component:

- створення одиничного, multi-date і recurring уроку;
- конфлікт та явне створення групи;
- результати групового уроку;
- failed/deleted Google sync;
- read-only subscription state;
- архівація та видалення.

E2E критичний шлях:

1. Реєстрація/вхід.
2. Створення учня.
3. Створення уроку з календаря.
4. Відкриття наступного уроку.
5. Заповнення плану, оцінки, присутності й оплати.
6. Перевірка статистики та CSV export.

Окремі E2E: серії, DST, груповий конфлікт, Google sync failure, PayU return without confirmed webhook, keyboard-only flow.

## 23. Acceptance criteria frontend MVP

- Користувач може створити типовий одиничний урок не більше ніж за 30 секунд після вибору учня.
- Немає silent data loss при закритті незбереженої форми або network error.
- Усі server mutations мають loading, success і failure behavior.
- Усі критичні дії доступні на mobile та з клавіатури.
- Google sync failure не блокує локальний урок і має manual retry.
- Admin UI не запитує та не показує дані учнів або уроків.
- PLN, timezone, DST і польські діакритичні знаки перевірені тестами.
- Read-only mode не приховує дані та дозволяє експорт.
- Lighthouse/axe не мають критичних accessibility-помилок на основних маршрутах.

