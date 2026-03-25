import { useEffect, useMemo, useState } from "react";

type EntryType = "income" | "expense";

type Entry = {
  id: string;
  type: EntryType;
  date: string; // YYYY-MM-DD
  counterparty: string;
  description: string;
  amount: number;
};

type AuthMode = "login" | "register";

type StoredUser = {
  username: string;
  password: string;
};

const USERS_KEY = "finance_users_v1";
const CURRENT_USER_KEY = "finance_current_user_v1";

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value || 0);
};

const entriesKey = (username: string) =>
  `finance_entries_v1_${username.trim().toLowerCase()}`;

const getQuarterFromMonth = (month: number) =>
  Math.floor((month - 1) / 3) + 1;

const loadUsers = (): StoredUser[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u: any) => typeof u?.username === "string" && typeof u?.password === "string"
    );
  } catch {
    return [];
  }
};

const saveUsers = (users: StoredUser[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);

  // форма авторизации
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // форма добавления операции
  const [date, setDate] = useState<string>(todayISO());
  const [type, setType] = useState<EntryType>("expense");
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");

  // период статистики
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  // попытка восстановить последнего пользователя
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CURRENT_USER_KEY);
    if (saved) {
      setCurrentUser(saved);
    }
  }, []);

  // загрузка операций при смене пользователя
  useEffect(() => {
    if (!currentUser || typeof window === "undefined") {
      setEntries([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(entriesKey(currentUser));
      if (!raw) {
        setEntries([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setEntries([]);
        return;
      }
      const safeEntries = parsed.filter((e: any) =>
        typeof e?.id === "string" &&
        (e?.type === "income" || e?.type === "expense") &&
        typeof e?.date === "string" &&
        typeof e?.counterparty === "string" &&
        typeof e?.description === "string" &&
        typeof e?.amount === "number"
      );
      setEntries(safeEntries);
    } catch {
      setEntries([]);
    }
  }, [currentUser]);

  // сохранение операций пользователя
  useEffect(() => {
    if (!currentUser || typeof window === "undefined") return;
    window.localStorage.setItem(entriesKey(currentUser), JSON.stringify(entries));
  }, [entries, currentUser]);

  const handleRegister = () => {
    const username = authUsername.trim();
    const password = authPassword.trim();

    if (!username || !password) {
      setAuthError("Заполните имя пользователя и пароль.");
      return;
    }

    if (password.length < 4) {
      setAuthError("Пароль должен быть не короче 4 символов.");
      return;
    }

    const users = loadUsers();
    const exists = users.some(
      (u) => u.username.trim().toLowerCase() === username.toLowerCase()
    );

    if (exists) {
      setAuthError("Такое имя уже занято. Выберите другое.");
      return;
    }

    const updated: StoredUser[] = [...users, { username, password }];
    saveUsers(updated);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENT_USER_KEY, username);
    }
    setCurrentUser(username);
    setAuthError(null);
    setAuthPassword("");
  };

  const handleLogin = () => {
    const username = authUsername.trim();
    const password = authPassword.trim();

    if (!username || !password) {
      setAuthError("Заполните имя пользователя и пароль.");
      return;
    }

    const users = loadUsers();
    const user = users.find(
      (u) => u.username.trim().toLowerCase() === username.toLowerCase()
    );

    if (!user || user.password !== password) {
      setAuthError("Неверное имя пользователя или пароль.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(CURRENT_USER_KEY, user.username.trim());
    }
    setCurrentUser(user.username.trim());
    setAuthError(null);
    setAuthPassword("");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CURRENT_USER_KEY);
    }
    setEntries([]);
  };

  const handleAdd = () => {
    const numericAmount = parseFloat(amount.replace(",", "."));
    if (
      !date ||
      isNaN(numericAmount) ||
      numericAmount <= 0 ||
      !counterparty.trim() ||
      !description.trim()
    ) {
      return;
    }

    const newEntry: Entry = {
      id: crypto.randomUUID(),
      type,
      date,
      counterparty: counterparty.trim(),
      description: description.trim(),
      amount: numericAmount,
    };

    setEntries((prev) => [...prev, newEntry]);
    setCounterparty("");
    setDescription("");
    setAmount("");
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const isFormValid =
    !!date &&
    !!counterparty.trim() &&
    !!description.trim() &&
    !isNaN(parseFloat(amount.replace(",", "."))) &&
    parseFloat(amount.replace(",", ".")) > 0;

  // выборка операций под период (месяц/квартал/год) относительно выбранной даты
  const periodEntries = useMemo(() => {
    if (!date) return [] as Entry[];
    if (!entries.length) return [] as Entry[];

    const [yearStr, monthStr] = date.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month) return [] as Entry[];

    const baseQuarter = getQuarterFromMonth(month);

    return entries.filter((entry) => {
      const [eyStr, emStr] = entry.date.split("-");
      const ey = parseInt(eyStr, 10);
      const em = parseInt(emStr, 10);
      if (!ey || !em) return false;

      if (period === "year") {
        return ey === year;
      }

      if (period === "quarter") {
        const eq = getQuarterFromMonth(em);
        return ey === year && eq === baseQuarter;
      }

      // month
      return ey === year && em === month;
    });
  }, [entries, date, period]);

  const totalIncome = useMemo(
    () =>
      periodEntries
        .filter((e) => e.type === "income")
        .reduce((sum, e) => sum + e.amount, 0),
    [periodEntries]
  );

  const totalExpense = useMemo(
    () =>
      periodEntries
        .filter((e) => e.type === "expense")
        .reduce((sum, e) => sum + e.amount, 0),
    [periodEntries]
  );

  const balance = totalIncome - totalExpense;

  const periodLabel = useMemo(() => {
    if (!date) return "Период";

    const [yearStr, monthStr] = date.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month) return "Период";

    if (period === "year") {
      return `${year} год`;
    }

    if (period === "quarter") {
      const q = getQuarterFromMonth(month);
      return `${q}-й квартал ${year}`;
    }

    const formatter = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    });
    const d = new Date(year, month - 1, 1);
    return formatter.format(d);
  }, [date, period]);

  // экран авторизации
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f2f2f7] to-[#e5e5ea] text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4">
          <div className="w-full rounded-3xl bg-white/80 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur-2xl ring-1 ring-slate-200/70 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  Личный финансовый трекер
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Войдите или зарегистрируйтесь, чтобы вести учёт доходов и расходов.
                </p>
              </div>
            </div>

            <div className="mb-4 inline-flex rounded-full bg-slate-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
                className={`flex-1 rounded-full px-4 py-1 transition ${
                  authMode === "login"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
                className={`flex-1 rounded-full px-4 py-1 transition ${
                  authMode === "register"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Регистрация
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (authMode === "login") {
                  handleLogin();
                } else {
                  handleRegister();
                }
              }}
            >
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Имя пользователя
                </label>
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="Телефон или имя"
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Пароль
                </label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Минимум 4 символа"
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>

              {authError && (
                <p className="text-xs text-rose-600">{authError}</p>
              )}

              <button
                type="submit"
                className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 active:bg-slate-900"
              >
                {authMode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </form>

            <p className="mt-4 text-[11px] leading-snug text-slate-400">
              Имя пользователя должно быть уникальным. Если кто-то уже зарегистрировался с таким именем,
              использовать его повторно нельзя.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // основной экран приложения
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f2f2f7] to-[#e5e5ea] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ежемесячный учёт доходов и расходов
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Здравствуйте, <span className="font-medium text-slate-800">{currentUser}</span>.
              Добавляйте операции и анализируйте их помесячно, поквартально или за год.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white hover:text-slate-900"
          >
            Выйти
          </button>
        </header>

        <main className="flex flex-1 flex-col gap-6 pb-8">
          {/* Карточка новой операции */}
          <section className="rounded-3xl bg-white/90 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/70 sm:p-6">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Новая операция
            </h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Дата (год / месяц / день)
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setType("income")}
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      type === "income"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Доход
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("expense")}
                    className={`flex-1 rounded-full px-3 py-1 transition ${
                      type === "expense"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Расход
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {type === "income" ? "От кого" : "Кому"}
                </label>
                <input
                  type="text"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder={
                    type === "income"
                      ? "Работодатель, клиент..."
                      : "Магазин, сервис..."
                  }
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {type === "income" ? "За что" : "На что"}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === "income"
                      ? "Зарплата, проект..."
                      : "Продукты, аренда..."
                  }
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Сумма
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-10 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition placeholder:text-slate-400 hover:bg-white focus:border-slate-400 focus:bg-white"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                По умолчанию устанавливается сегодняшняя дата, но вы можете выбрать любую
                другую. Статистика строится относительно выбранной даты.
              </p>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!isFormValid}
                className="inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-slate-800 enabled:active:bg-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Добавить
              </button>
            </div>
          </section>

          {/* Итоги и список */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Итоги за период
                </h2>
                <p className="text-sm text-slate-700">{periodLabel}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full bg-slate-100 p-1 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setPeriod("month")}
                    className={`rounded-full px-3 py-1 transition ${
                      period === "month"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Месяц
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("quarter")}
                    className={`rounded-full px-3 py-1 transition ${
                      period === "quarter"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Квартал
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriod("year")}
                    className={`rounded-full px-3 py-1 transition ${
                      period === "year"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Год
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-2xl bg-white/90 p-3 text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">
                  Доход
                </p>
                <p className="mt-1 text-base font-semibold">
                  {formatCurrency(totalIncome)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/90 p-3 text-rose-700 shadow-sm ring-1 ring-rose-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                  Расход
                </p>
                <p className="mt-1 text-base font-semibold">
                  {formatCurrency(totalExpense)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/90 p-3 text-slate-800 shadow-sm ring-1 ring-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Баланс
                </p>
                <p className="mt-1 text-base font-semibold">
                  {formatCurrency(balance)}
                </p>
              </div>
            </div>

            <div className="rounded-3xl bg-white/90 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/70 sm:p-5">
              {periodEntries.length === 0 ? (
                <p className="text-sm text-slate-500">
                  За выбранный период ещё нет операций.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {periodEntries
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                      >
                        <div className="flex flex-1 flex-col">
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>
                              {new Date(entry.date).toLocaleDateString("ru-RU", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </span>
                            <span className="h-0.5 w-4 rounded-full bg-slate-300" />
                            <span>{entry.type === "income" ? "Доход" : "Расход"}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="font-medium text-slate-900">
                              {entry.counterparty}
                            </span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-slate-600">{entry.description}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={
                              entry.type === "income"
                                ? "text-sm font-semibold text-emerald-600"
                                : "text-sm font-semibold text-rose-600"
                            }
                          >
                            {entry.type === "income" ? "+" : "-"}
                            {formatCurrency(entry.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="rounded-full p-1 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Удалить операцию"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
