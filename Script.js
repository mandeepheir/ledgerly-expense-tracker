// ---------- Data ----------
// "YYYY-MM" for this month (offset 0) or another month (-1 = last month)
function monthKey(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
const ym = monthKey(0);

// Sample data, only used the very first time the app opens
const seed = [
  { id: 1, date: `${ym}-28`, note: "Salary",           type: "income",  category: "Income", amount: 85000 },
  { id: 2, date: `${ym}-27`, note: "Flat rent",        type: "expense", category: "Rent",   amount: 14700 },
  { id: 3, date: `${ym}-25`, note: "Groceries",        type: "expense", category: "Food",   amount: 2340 },
  { id: 4, date: `${ym}-22`, note: "Train to Delhi",   type: "expense", category: "Travel", amount: 1150 },
  { id: 5, date: `${ym}-20`, note: "Electricity bill", type: "expense", category: "Bills",  amount: 1820 },
];

// A little history for the first 5 months so the bar chart has something to show
function pastSeed() {
  return [1, 2, 3, 4, 5].flatMap((i) => [
    { id: 100 + i * 2, date: `${monthKey(-i)}-05`, note: "Flat rent", type: "expense", category: "Rent", amount: 14700 },
    { id: 101 + i * 2, date: `${monthKey(-i)}-12`, note: "Groceries", type: "expense", category: "Food", amount: 2000 + i * 450 },
  ]);
}

// localStorage can fail (private mode, storage full), so always use try/catch
function load() {
  try {
    const raw = localStorage.getItem("transactions");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
function save() {
  try { localStorage.setItem("transactions", JSON.stringify(transactions)); } catch (e) {}
}

let transactions = load() ?? [...seed, ...pastSeed()];
let nextId = transactions.reduce((max, t) => Math.max(max, t.id), 0) + 1;
let editingId = null; // null = adding, a number = editing that transaction

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + n.toLocaleString("en-IN");
const sum = (list) => list.reduce((total, t) => total + t.amount, 0);

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML; // never put raw user input into innerHTML
}

function shortDate(iso) {
  return new Date(iso + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ---------- Render ----------
function renderTable() {
  const sorted = getFiltered().sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) {
    $("rows").innerHTML = `<tr><td colspan="5">${transactions.length ? "No transactions match your filters." : "No transactions yet. Use “Add transaction” to create your first one."}</td></tr>`;
    return;
  }
  $("rows").innerHTML = sorted.map((t) => `
    <tr>
      <td>${shortDate(t.date)}</td>
      <td>${escapeHTML(t.note)}</td>
      <td><span class="tag" style="--c:var(--c-${t.category.toLowerCase()})">${t.category}</span></td>
      <td class="num ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "-"}${money(t.amount)}</td>
      <td class="row-actions">
        <button data-edit="${t.id}">Edit</button>
        <button data-delete="${t.id}">Delete</button>
      </td>
    </tr>`).join("");
}

function renderSummary() {
  const thisMonth = transactions.filter((t) => t.date.startsWith(ym));
  const income = sum(thisMonth.filter((t) => t.type === "income"));
  const spent = sum(thisMonth.filter((t) => t.type === "expense"));
  const allIncome = sum(transactions.filter((t) => t.type === "income"));
  const allSpent = sum(transactions.filter((t) => t.type === "expense"));
  $("income").textContent = money(income);
  $("spent").textContent = money(spent);
  $("balance").textContent = money(allIncome - allSpent);
}

function render() {
  renderTable();
  renderSummary();
  renderCharts();
}

// Every change goes through here: save first, then redraw
function commit() {
  save();
  render();
}

// ---------- Search + category filter ----------
function getFiltered() {
  const q = $("searchBox").value.trim().toLowerCase();
  const cat = $("catFilter").value;
  return transactions.filter(
    (t) => (cat === "All" || t.category === cat) && t.note.toLowerCase().includes(q)
  );
}
$("searchBox").addEventListener("input", renderTable);
$("catFilter").addEventListener("change", renderTable);

// ---------- Charts (Chart.js) ----------
let donutChart, barChart;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function renderCharts() {
  if (typeof Chart === "undefined") return; // CDN didn't load (offline?)
  Chart.defaults.color = cssVar("--muted");
  Chart.defaults.font.family = "Manrope, system-ui, sans-serif";

  // 1) Doughnut: this month's spending by category
  const cats = ["Rent", "Food", "Travel", "Bills", "Other"];
  const monthSpend = transactions.filter((t) => t.type === "expense" && t.date.startsWith(ym));
  if (donutChart) donutChart.destroy();
  donutChart = new Chart($("donutChart"), {
    type: "doughnut",
    data: {
      labels: cats,
      datasets: [{
        data: cats.map((c) => sum(monthSpend.filter((t) => t.category === c))),
        backgroundColor: cats.map((c) => cssVar("--c-" + c.toLowerCase())),
        borderColor: cssVar("--surface"),
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "right" },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${money(ctx.parsed)}` } },
      },
    },
  });

  // 2) Bars: total spending for each of the last 6 months
  const keys = [-5, -4, -3, -2, -1, 0].map(monthKey);
  const labels = keys.map((k) => new Date(k + "-01T00:00").toLocaleDateString("en-IN", { month: "short" }));
  const totals = keys.map((k) =>
    sum(transactions.filter((t) => t.type === "expense" && t.date.startsWith(k)))
  );
  if (barChart) barChart.destroy();
  barChart = new Chart($("barChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: totals,
        backgroundColor: keys.map((_, i) => (i === keys.length - 1 ? cssVar("--accent") : cssVar("--line"))),
        borderRadius: 6,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => " " + money(ctx.parsed.y) } },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: cssVar("--line") }, ticks: { callback: (v) => "₹" + v / 1000 + "k" } },
        x: { grid: { display: false } },
      },
    },
  });
}

// ---------- Export CSV ----------
$("exportBtn").addEventListener("click", () => {
  // Quote every cell; prefix risky characters so Excel won't run them as formulas
  const cell = (v) => {
    let text = String(v);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["Date", "Note", "Type", "Category", "Amount"],
    ...transactions.map((t) => [t.date, t.note, t.type, t.category, t.amount]),
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "ledgerly-transactions.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

// ---------- Modal (used for both add and edit) ----------
const modal = $("modal");

function openForm(t = null) {
  editingId = t ? t.id : null;
  $("formTitle").textContent = t ? "Edit transaction" : "Add transaction";
  $("fAmount").value = t ? t.amount : "";
  $("fType").value = t ? t.type : "expense";
  $("fCategory").value = t && t.type === "expense" ? t.category : "Rent";
  $("fCategory").disabled = t ? t.type === "income" : false;
  $("fDate").value = t ? t.date : new Date().toISOString().slice(0, 10);
  $("fNote").value = t ? t.note : "";
  modal.showModal();
}

$("openModal").addEventListener("click", () => openForm());
$("closeModal").addEventListener("click", () => modal.close());

$("fType").addEventListener("change", () => {
  $("fCategory").disabled = $("fType").value === "income";
});

$("txForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const type = $("fType").value;
  const data = {
    date: $("fDate").value,
    note: $("fNote").value.trim(),
    type,
    category: type === "income" ? "Income" : $("fCategory").value,
    amount: Number($("fAmount").value),
  };

  if (editingId === null) {
    transactions.push({ id: nextId++, ...data });
  } else {
    transactions = transactions.map((t) => (t.id === editingId ? { ...t, ...data } : t));
  }
  modal.close();
  commit();
});

// One listener on the table handles every Edit / Delete button (event delegation)
$("rows").addEventListener("click", (e) => {
  const { edit, delete: del } = e.target.dataset;
  if (edit) {
    openForm(transactions.find((t) => t.id === Number(edit)));
  } else if (del) {
    transactions = transactions.filter((t) => t.id !== Number(del));
    commit();
  }
});

// ---------- Theme ----------
const themeBtn = $("themeBtn");
const root = document.documentElement;

function setTheme(theme) {
  root.dataset.theme = theme;
  themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  try { localStorage.setItem("theme", theme); } catch (e) {}
  renderCharts(); // chart colours depend on the theme
}
let savedTheme = null;
try { savedTheme = localStorage.getItem("theme"); } catch (e) {}
setTheme(savedTheme || "light");
themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));

// ---------- Start ----------
render();