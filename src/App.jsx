import { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Plus, Trash2, TrendingUp, TrendingDown, BookOpen, Loader2, Target, RefreshCw, RotateCcw, Download, Upload, CheckCircle2, User, Heart, Stethoscope, Zap, Home, Car, ShieldCheck, CalendarDays, ChevronDown, ChevronUp, Pencil, X, Calculator, Info, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

// 🛠️ แก้ไข path ให้ตรงกับตำแหน่งไฟล์จริงใน repo: src/lib/supabaseClient.js
import { supabase, hasSupabase } from "./lib/supabaseClient";

const STORAGE_KEY = "networth-ledger:data";

// ---- palette: cream + blue ----
const C = {
  bg: "#F4F2E9",         // cream background
  paper: "#FBFAF4",      // paper card
  border: "#D3DEE2",     // cool blue-grey border
  lines: "#DFE8EA",      // ledger ruling lines
  ink: "#20465C",        // deep teal-blue text
  inkSoft: "#4F7688",    // softer blue-grey text
  muted: "#7C97A1",      // muted labels
  mutedLight: "#B4C5CB", // very muted
  accent: "#2E7DA6",     // primary blue accent
  accentSoft: "#E3EEF2", // pale blue chip background
  asset: "#4F8B72",      // sage green (asset positive)
  liability: "#B4593D",  // muted rust (liability)
  errorBg: "#F6E4DC",
  errorText: "#B4593D",
  errorBorder: "#E4C3B4",
};

const THB = (n) =>
  new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyPeriod() {
  return { assets: [], liabilities: [] };
}

function freqLabel(freq) {
  if (freq === "week") return "สัปดาห์";
  if (freq === "year") return "ปี";
  return "เดือน";
}

function freqLabelToKey(label) {
  const s = String(label || "").trim();
  if (s === "สัปดาห์") return "week";
  if (s === "ปี") return "year";
  return "month";
}

// ---- insurance ----
// ---- top-level app sections ----
const TABS = [
  { id: "ledger", label: "สมุดบัญชี", icon: BookOpen },
  { id: "insurance", label: "ประกันและความคุ้มครอง", icon: ShieldCheck },
  { id: "tax", label: "วางแผนภาษี", icon: Calculator },
];

const INSURANCE_CATEGORIES = [
  { key: "life", label: "ประกันชีวิต", icon: Heart, group: "person" },
  { key: "health", label: "ประกันสุขภาพ", icon: Stethoscope, group: "person" },
  { key: "accident", label: "ประกันอุบัติเหตุ", icon: Zap, group: "person" },
  { key: "property_home", label: "ประกันบ้าน", icon: Home, group: "property" },
  { key: "property_car", label: "ประกันรถ", icon: Car, group: "property" },
];

function catMeta(key) {
  return INSURANCE_CATEGORIES.find((c) => c.key === key) || INSURANCE_CATEGORIES[0];
}

function annualPremium(policy) {
  const p = Number(policy.premium || 0);
  return policy.premiumFrequency === "month" ? p * 12 : p;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end - now) / 86400000);
}

function formatThaiDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function ensureInsurance(finalData) {
  if (!finalData.insurance) finalData.insurance = [];
  return finalData;
}

// ---- tax planning ----
function emptyTaxPlanning() {
  return {
    grossIncome: "",
    isSalary: true,
    spouse: false,
    spouseLifeInsurance: "",
    pregnancyCost: "",
    childrenBase: "0",
    childrenExtra: "0",
    parents: "0",
    disabledCare: "0",
    socialSecurity: "",
    parentHealthInsurance: "",
    pensionLifeInsurance: "",
    providentFund: "",
    nationalSavingsFund: "",
    rmf: "",
    ssf: "",
    socialEnterprise: "",
    thaiEsg: "",
    mortgageInterest: "",
    artPurchase: "",
    solarRooftop: "",
    donationsGeneral: "",
    donationsEDouble: "",
    donationsPolitical: "",
  };
}

function emptyTaxPlanningContainer() {
  const year = String(new Date().getFullYear());
  return { people: { ตัวเอง: { years: { [year]: emptyTaxPlanning() } } } };
}

function ensureTaxPlanning(finalData) {
  const raw = finalData.taxPlanning;
  const year = String(new Date().getFullYear());

  if (!raw || (!raw.people && !raw.years)) {
    if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
      finalData.taxPlanning = { people: { ตัวเอง: { years: { [year]: { ...emptyTaxPlanning(), ...raw } } } } };
    } else {
      finalData.taxPlanning = emptyTaxPlanningContainer();
    }
  } else if (raw.years && !raw.people) {
    const years = {};
    Object.keys(raw.years).forEach((y) => {
      years[y] = { ...emptyTaxPlanning(), ...raw.years[y] };
    });
    finalData.taxPlanning = { people: { ตัวเอง: { years } } };
  } else {
    const people = {};
    Object.keys(raw.people).forEach((personName) => {
      const years = {};
      Object.keys(raw.people[personName]?.years || {}).forEach((y) => {
        years[y] = { ...emptyTaxPlanning(), ...raw.people[personName].years[y] };
      });
      people[personName] = { years };
    });
    if (Object.keys(people).length === 0) {
      people["ตัวเอง"] = { years: { [year]: emptyTaxPlanning() } };
    }
    finalData.taxPlanning = { people };
  }
  return finalData;
}

const TAX_BRACKETS = [
  { upto: 150000, rate: 0 },
  { upto: 300000, rate: 0.05 },
  { upto: 500000, rate: 0.1 },
  { upto: 750000, rate: 0.15 },
  { upto: 1000000, rate: 0.2 },
  { upto: 2000000, rate: 0.25 },
  { upto: 5000000, rate: 0.3 },
  { upto: Infinity, rate: 0.35 },
];

function computeBracketBreakdown(taxable) {
  let prev = 0;
  return TAX_BRACKETS.map((b) => {
    const amountInBracket = Math.max(0, Math.min(taxable, b.upto) - prev);
    const taxInBracket = amountInBracket * b.rate;
    const rangeLabel = b.upto === Infinity ? `มากกว่า ${THB(prev)}` : `${THB(prev)} - ${THB(b.upto)}`;
    const row = { min: prev, max: b.upto, rate: b.rate, amountInBracket, taxInBracket, rangeLabel };
    prev = b.upto;
    return row;
  });
}

function calcTaxPlan(input, insuranceList) {
  const income = parseFloat(input.grossIncome) || 0;
  const expenseDeduction = input.isSalary ? Math.min(income * 0.5, 100000) : 0;
  const netAfterExpense = Math.max(0, income - expenseDeduction);

  const personal = 60000;
  const spouseDeduction = input.spouse ? 60000 : 0;
  const pregnancyCost = Math.min(Math.max(0, parseFloat(input.pregnancyCost) || 0), 60000);
  const childrenBaseCount = Math.max(0, parseInt(input.childrenBase) || 0);
  const childrenExtraCount = Math.max(0, parseInt(input.childrenExtra) || 0);
  const childrenDeduction = childrenBaseCount * 30000 + childrenExtraCount * 60000;
  const parentsCount = Math.min(4, Math.max(0, parseInt(input.parents) || 0));
  const parentsDeduction = parentsCount * 30000;
  const disabledCount = Math.max(0, parseInt(input.disabledCare) || 0);
  const disabledDeduction = disabledCount * 60000;

  const socialSecurity = Math.min(Math.max(0, parseFloat(input.socialSecurity) || 0), 10500);
  const parentHealthInsurance = Math.min(Math.max(0, parseFloat(input.parentHealthInsurance) || 0), 15000);
  const spouseLifeInsurance = Math.min(Math.max(0, parseFloat(input.spouseLifeInsurance) || 0), 10000);

  const lifeSum = (insuranceList || []).filter((p) => p.category === "life").reduce((s, p) => s + annualPremium(p), 0);
  const healthSum = (insuranceList || []).filter((p) => p.category === "health").reduce((s, p) => s + annualPremium(p), 0);
  const healthDeduction = Math.min(healthSum, 25000);
  const lifeDeduction = Math.min(lifeSum, Math.max(0, 100000 - healthDeduction));
  const lifeHealthTotal = healthDeduction + lifeDeduction;

  const pensionLifeRaw = Math.max(0, parseFloat(input.pensionLifeInsurance) || 0);
  const pensionLifeCapped = Math.min(pensionLifeRaw, income * 0.15, 200000);
  const providentRaw = Math.max(0, parseFloat(input.providentFund) || 0);
  const providentCapped = Math.min(providentRaw, income * 0.15, 500000);
  const nsfRaw = Math.max(0, parseFloat(input.nationalSavingsFund) || 0);
  const nsfCapped = Math.min(nsfRaw, 30000);
  const rmfRaw = Math.max(0, parseFloat(input.rmf) || 0);
  const rmfCapped = Math.min(rmfRaw, income * 0.3, 500000);
  const ssfRaw = Math.max(0, parseFloat(input.ssf) || 0);
  const ssfCapped = Math.min(ssfRaw, income * 0.3, 200000);

  const retirementRawTotal = pensionLifeCapped + providentCapped + nsfCapped + rmfCapped + ssfCapped;
  const retirementCap = 500000;
  const retirementScale = retirementRawTotal > retirementCap ? retirementCap / retirementRawTotal : 1;
  const pensionLife = pensionLifeCapped * retirementScale;
  const providentFund = providentCapped * retirementScale;
  const nsf = nsfCapped * retirementScale;
  const rmf = rmfCapped * retirementScale;
  const ssf = ssfCapped * retirementScale;
  const retirementTotal = pensionLife + providentFund + nsf + rmf + ssf;

  const socialEnterprise = Math.min(Math.max(0, parseFloat(input.socialEnterprise) || 0), 30000);
  const thaiEsg = Math.min(Math.max(0, parseFloat(input.thaiEsg) || 0), income * 0.3, 300000);

  const mortgageInterest = Math.min(Math.max(0, parseFloat(input.mortgageInterest) || 0), 100000);
  const artPurchase = Math.min(Math.max(0, parseFloat(input.artPurchase) || 0), 100000);
  const solarRooftop = Math.min(Math.max(0, parseFloat(input.solarRooftop) || 0), 200000);

  const donationsPolitical = Math.min(Math.max(0, parseFloat(input.donationsPolitical) || 0), 10000);

  const preDonationDeductions =
    personal + spouseDeduction + pregnancyCost + childrenDeduction + parentsDeduction + disabledDeduction +
    socialSecurity + parentHealthInsurance + spouseLifeInsurance + lifeHealthTotal +
    retirementTotal + socialEnterprise + thaiEsg +
    mortgageInterest + artPurchase + solarRooftop + donationsPolitical;

  const incomeBeforeDonation = Math.max(0, netAfterExpense - preDonationDeductions);
  const donationsGeneralRaw = Math.max(0, parseFloat(input.donationsGeneral) || 0);
  const donationsEDoubleRaw = Math.max(0, parseFloat(input.donationsEDouble) || 0) * 2;
  const donationsPool = donationsGeneralRaw + donationsEDoubleRaw;
  const donationsCap = incomeBeforeDonation * 0.1;
  const donations = Math.min(donationsPool, donationsCap);

  const totalDeductions = preDonationDeductions + donations;
  const taxableIncome = Math.max(0, netAfterExpense - totalDeductions);
  const brackets = computeBracketBreakdown(taxableIncome);
  const tax = brackets.reduce((s, b) => s + b.taxInBracket, 0);
  const reachedBrackets = brackets.filter((b) => b.amountInBracket > 0);
  const marginal = reachedBrackets.length ? reachedBrackets[reachedBrackets.length - 1].rate : 0;
  const effectiveRate = income > 0 ? tax / income : 0;

  return {
    income,
    expenseDeduction,
    netAfterExpense,
    personal,
    spouseDeduction,
    pregnancyCost,
    childrenDeduction,
    parentsDeduction,
    disabledDeduction,
    socialSecurity,
    parentHealthInsurance,
    spouseLifeInsurance,
    lifeHealthTotal,
    lifeSum,
    healthSum,
    pensionLife,
    providentFund,
    nsf,
    rmf,
    ssf,
    retirementTotal,
    socialEnterprise,
    thaiEsg,
    mortgageInterest,
    artPurchase,
    solarRooftop,
    donations,
    donationsPolitical,
    totalDeductions,
    taxableIncome,
    brackets,
    tax,
    marginal,
    effectiveRate,
    retirementRoomLeft: Math.max(0, retirementCap - retirementTotal),
    lifeHealthRoomLeft: Math.max(0, 100000 - lifeHealthTotal),
  };
}

function periodKey(year, quarter) {
  return `${year}-Q${quarter}`;
}

function parsePeriod(key) {
  const [year, q] = key.split("-Q");
  return { year: Number(year), quarter: Number(q) };
}

function comparePeriods(a, b) {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.quarter - pb.quarter;
}

function formatPeriodShort(key) {
  const { year, quarter } = parsePeriod(key);
  return `${year} Q${quarter}`;
}

function periodLabelToKey(label) {
  const m = String(label || "").match(/(\d{4})\s*Q\s*([1-4])/i);
  if (!m) return null;
  return periodKey(m[1], m[2]);
}

function categoryLabelToKey(label) {
  const found = INSURANCE_CATEGORIES.find((c) => c.label === String(label || "").trim());
  return found ? found.key : "life";
}

function migrateIfNeeded(raw) {
  if (raw && raw.periods) return raw;
  if (raw && raw.years) {
    const periods = {};
    Object.keys(raw.years).forEach((y) => {
      periods[periodKey(y, 4)] = raw.years[y];
    });
    return { periods };
  }
  return null;
}

export default function NetWorthLedger() {
  const [data, setData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastFailedData, setLastFailedData] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [restoreNote, setRestoreNote] = useState(null);
  const [importInputKey, setImportInputKey] = useState(0);
  const [importExcelInputKey, setImportExcelInputKey] = useState(0);

  const [newYearInput, setNewYearInput] = useState("");
  const [newQuarterInput, setNewQuarterInput] = useState("1");
  const [duplicateFrom, setDuplicateFrom] = useState("");
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [activeTab, setActiveTab] = useState("ledger");
  const [assetForm, setAssetForm] = useState({
    name: "",
    amount: "",
    owner: "",
    goalName: "",
    goal: "",
    dcaEnabled: false,
    dcaAmount: "",
    dcaFrequency: "month",
  });
  const [liabForm, setLiabForm] = useState({ name: "", amount: "", owner: "" });
  const [assetEditingId, setAssetEditingId] = useState(null);
  const [liabEditingId, setLiabEditingId] = useState(null);

  // ➕ State เก็บข้อมูลผู้เข้าสู่ระบบ
  const [user, setUser] = useState(null);

  // ➕ useEffect ตรวจสอบสิทธิ์และดักฟังข้อมูลการล็อกอิน
  useEffect(() => {
    if (!hasSupabase()) return;

    // ตรวจหาบัญชีผู้ใช้เมื่อเปิดหน้าจอ
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // ดักฟังเหตุการณ์ล็อกอินเข้า/ออกจากระบบ
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ➕ ฟังก์ชันเคลียร์เซสชันเพื่อออกจากระบบ
  const handleLogout = async () => {
    if (hasSupabase()) {
      await supabase.auth.signOut();
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!window.storage) {
          setRestoreNote("no-storage");
        }
        let result = null;
        try {
          result = await window.storage.get(STORAGE_KEY, false);
        } catch (e) {
          result = null;
        }
        if (result && result.value) {
          const parsedRaw = JSON.parse(result.value);
          const migrated = migrateIfNeeded(parsedRaw);
          const finalData = ensureTaxPlanning(ensureInsurance(migrated || { periods: {} }));
          if (Object.keys(finalData.periods).length === 0) {
            const now = new Date();
            const q = Math.floor(now.getMonth() / 3) + 1;
            finalData.periods[periodKey(now.getFullYear(), q)] = emptyPeriod();
          }
          setData(finalData);
          setRestoreNote("restored");
          const keys = Object.keys(finalData.periods).sort(comparePeriods);
          setSelectedPeriod(keys[keys.length - 1]);
          if (migrated) {
            window.storage.set(STORAGE_KEY, JSON.stringify(finalData), false).catch(() => {});
          }
        } else {
          const now = new Date();
          const q = Math.floor(now.getMonth() / 3) + 1;
          const key = periodKey(now.getFullYear(), q);
          const fresh = { periods: { [key]: emptyPeriod() }, insurance: [], taxPlanning: emptyTaxPlanningContainer() };
          setData(fresh);
          setSelectedPeriod(key);
          setRestoreNote((prev) => prev || "fresh");
        }
      } catch (e) {
        setError("โหลดข้อมูลไม่สำเร็จ เริ่มสมุดบัญชีใหม่แทน");
        const now = new Date();
        const q = Math.floor(now.getMonth() / 3) + 1;
        const key = periodKey(now.getFullYear(), q);
        setData({ periods: { [key]: emptyPeriod() }, insurance: [], taxPlanning: emptyTaxPlanningContainer() });
        setSelectedPeriod(key);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next, attempt = 1) {
    setData(next);
    setSaving(true);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next), false);
      setError(null);
      setLastFailedData(null);
      setLastSavedAt(new Date());
    } catch (e) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
        setSaving(false);
        return persist(next, attempt + 1);
      }
      setError("บันทึกข้อมูลไม่สำเร็จ กดลองอีกครั้งด้านล่าง หรือดาวน์โหลดข้อมูลสำรองไว้ก่อน");
      setLastFailedData(next);
    } finally {
      setSaving(false);
    }
  }

  function retrySave() {
    if (lastFailedData) persist(lastFailedData);
  }

  function exportBackup() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `networth-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    if (!data) return;
    const keys = Object.keys(data.periods).sort(comparePeriods);
    const wb = XLSX.utils.book_new();

    const summaryRows = keys.map((k) => {
      const p = data.periods[k];
      const assets = p.assets.reduce((s, a) => s + Number(a.amount || 0), 0);
      const liabilities = p.liabilities.reduce((s, l) => s + Number(l.amount || 0), 0);
      return {
        ไตรมาส: formatPeriodShort(k),
        สินทรัพย์รวม: assets,
        หนี้สินรวม: liabilities,
        ความมั่งคั่งสุทธิ: assets - liabilities,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "สรุปรายไตรมาส");

    const assetRows = [];
    keys.forEach((k) => {
      data.periods[k].assets.forEach((a) => {
        assetRows.push({
          ไตรมาส: formatPeriodShort(k),
          ชื่อ: a.name,
          มูลค่า: a.amount,
          ผู้ดูแล: a.owner || "",
          ชื่อเป้าหมาย: a.goalName || "",
          จำนวนเป้าหมาย: a.goal ?? "",
          DCA: a.dca ? "ใช่" : "ไม่ใช่",
          จำนวนDCA: a.dca ? a.dca.amount : "",
          ความถี่DCA: a.dca ? freqLabel(a.dca.frequency) : "",
        });
      });
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(assetRows.length ? assetRows : [{ ไตรมาส: "", ชื่อ: "" }]),
      "สินทรัพย์"
    );

    const liabRows = [];
    keys.forEach((k) => {
      data.periods[k].liabilities.forEach((l) => {
        liabRows.push({
          ไตรมาส: formatPeriodShort(k),
          ชื่อ: l.name,
          มูลค่า: l.amount,
          ผู้ดูแล: l.owner || "",
        });
      });
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(liabRows.length ? liabRows : [{ ไตรมาส: "", ชื่อ: "" }]),
      "หนี้สิน"
    );

    const insRows = (data.insurance || []).map((p) => ({
      ประเภท: catMeta(p.category).label,
      ชื่อแผน: p.policyName,
      บริษัท: p.insurer,
      เลขที่กรมธรรม์: p.policyNumber || "",
      ผู้เอาประกัน: p.person || "",
      ทรัพย์สินที่คุ้มครอง: p.assetName || "",
      ทุนประกัน: p.coverageAmount ?? "",
      เบี้ยประกัน: p.premium ?? "",
      ความถี่เบี้ย: p.premiumFrequency === "month" ? "ต่อเดือน" : "ต่อปี",
      วันเริ่มคุ้มครอง: p.startDate || "",
      วันครบกำหนด: p.endDate || "",
      หมายเหตุ: p.notes || "",
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(insRows.length ? insRows : [{ ประเภท: "", ชื่อแผน: "" }]),
      "ประกัน"
    );

    const ensuredTax = ensureTaxPlanning({ ...data }).taxPlanning;
    const taxRows = [];
    Object.keys(ensuredTax.people).forEach((person) => {
      const years = ensuredTax.people[person].years || {};
      Object.keys(years)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((y) => {
          const t = years[y];
          const personInsurance = (data.insurance || []).filter((p) => p.person === person);
          const r = calcTaxPlan(t, personInsurance);
          taxRows.push({
            บุคคล: person,
            ปีภาษี: y,
            เงินได้รวมต่อปี: t.grossIncome,
            รายได้เป็นเงินเดือน: t.isSalary ? "ใช่" : "ไม่ใช่",
            มีคู่สมรส: t.spouse ? "ใช่" : "ไม่ใช่",
            เบี้ยประกันชีวิตคู่สมรส: t.spouseLifeInsurance,
            ค่าฝากครรภ์คลอดบุตร: t.pregnancyCost,
            "บุตรคนแรก/ก่อนปี2561": t.childrenBase,
            "บุตรคนที่2+/ปี2561+": t.childrenExtra,
            บิดามารดาที่เลี้ยงดู: t.parents,
            ผู้พิการที่เลี้ยงดู: t.disabledCare,
            ประกันสังคม: t.socialSecurity,
            ประกันสุขภาพบิดามารดา: t.parentHealthInsurance,
            เบี้ยประกันชีวิตแบบบำนาญ: t.pensionLifeInsurance,
            กองทุนสำรองเลี้ยงชีพ: t.providentFund,
            กองทุนการออมแห่งชาติ: t.nationalSavingsFund,
            กองทุนRMF: t.rmf,
            กองทุนSSF: t.ssf,
            วิสาหกิจเพื่อสังคม: t.socialEnterprise,
            ThaiESG: t.thaiEsg,
            ดอกเบี้ยที่อยู่อาศัย: t.mortgageInterest,
            ค่าซื้องานศิลปะ: t.artPurchase,
            SolarRooftop: t.solarRooftop,
            บริจาคทั่วไป: t.donationsGeneral,
            "บริจาคeDonation": t.donationsEDouble,
            บริจาคพรรคการเมือง: t.donationsPolitical,
            "ค่าลดหย่อนรวม(คำนวณ)": Math.round(r.totalDeductions),
            "เงินได้สุทธิ(คำนวณ)": Math.round(r.taxableIncome),
            "ภาษีที่ต้องจ่าย(คำนวณ)": Math.round(r.tax),
            "อัตราเฉลี่ย%": Number((r.effectiveRate * 100).toFixed(2)),
            "อัตราขั้นสูงสุด%": Number((r.marginal * 100).toFixed(0)),
          });
        });
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(taxRows.length ? taxRows : [{ บุคคล: "", ปีภาษี: "" }]),
      "ภาษี"
    );

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `networth-ledger-${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const migrated = migrateIfNeeded(parsed) || (parsed.periods ? parsed : null);
        if (!migrated || !migrated.periods) {
          setError("ไฟล์สำรองไม่ถูกต้อง");
          return;
        }
        ensureInsurance(migrated);
        ensureTaxPlanning(migrated);
        persist(migrated);
        const keys = Object.keys(migrated.periods).sort(comparePeriods);
        setSelectedPeriod(keys[keys.length - 1] || null);
        setRestoreNote("restored");
      } catch (err) {
        setError("อ่านไฟล์สำรองไม่สำเร็จ");
      }
    };
    reader.readAsText(file);
    setImportInputKey((k) => k + 1);
  }

  function importExcel(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const periods = {};

        const assetsSheet = wb.Sheets["สินทรัพย์"];
        if (assetsSheet) {
          XLSX.utils.sheet_to_json(assetsSheet, { defval: "" }).forEach((r) => {
            const key = periodLabelToKey(r["ไตรมาส"]);
            if (!key || !r["ชื่อ"]) return;
            if (!periods[key]) periods[key] = emptyPeriod();
            const dcaEnabled = String(r["DCA"]).trim() === "ใช่";
            periods[key].assets.push({
              id: uid(),
              name: String(r["ชื่อ"]),
              amount: Number(r["มูลค่า"]) || 0,
              owner: r["ผู้ดูแล"] ? String(r["ผู้ดูแล"]) : null,
              goalName: r["ชื่อเป้าหมาย"] ? String(r["ชื่อเป้าหมาย"]) : null,
              goal: r["จำนวนเป้าหมาย"] !== "" && r["จำนวนเป้าหมาย"] != null ? Number(r["จำนวนเป้าหมาย"]) : null,
              dca: dcaEnabled ? { amount: Number(r["จำนวนDCA"]) || 0, frequency: freqLabelToKey(r["ความถี่DCA"]) } : null,
            });
          });
        }

        const liabSheet = wb.Sheets["หนี้สิน"];
        if (liabSheet) {
          XLSX.utils.sheet_to_json(liabSheet, { defval: "" }).forEach((r) => {
            const key = periodLabelToKey(r["ไตรมาส"]);
            if (!key || !r["ชื่อ"]) return;
            if (!periods[key]) periods[key] = emptyPeriod();
            periods[key].liabilities.push({
              id: uid(),
              name: String(r["ชื่อ"]),
              amount: Number(r["มูลค่า"]) || 0,
              owner: r["ผู้ดูแล"] ? String(r["ผู้ดูแล"]) : null,
            });
          });
        }

        if (Object.keys(periods).length === 0) {
          setError('ไม่พบข้อมูลในไฟล์ Excel — ต้องมีชีต "สินทรัพย์" หรือ "หนี้สิน" ที่มีคอลัมน์ "ไตรมาส" ตรงรูปแบบเดิม (เช่น 2026 Q2)');
          return;
        }

        const insurance = [];
        const insSheet = wb.Sheets["ประกัน"];
        if (insSheet) {
          XLSX.utils.sheet_to_json(insSheet, { defval: "" }).forEach((r) => {
            if (!r["ชื่อแผน"]) return;
            insurance.push({
              id: uid(),
              category: categoryLabelToKey(r["ประเภท"]),
              policyName: String(r["ชื่อแผน"]),
              insurer: String(r["บริษัท"] || ""),
              policyNumber: r["เลขที่กรมธรรม์"] ? String(r["เลขที่กรมธรรม์"]) : null,
              person: r["ผู้เอาประกัน"] ? String(r["ผู้เอาประกัน"]) : null,
              assetName: r["ทรัพย์สินที่คุ้มครอง"] ? String(r["ทรัพย์สินที่คุ้มครอง"]) : null,
              coverageAmount: r["ทุนประกัน"] !== "" ? Number(r["ทุนประกัน"]) : null,
              premium: r["เบี้ยประกัน"] !== "" ? Number(r["เบี้ยประกัน"]) : null,
              premiumFrequency: String(r["ความถี่เบี้ย"]).includes("เดือน") ? "month" : "year",
              startDate: r["วันเริ่มคุ้มครอง"] ? String(r["วันเริ่มคุ้มครอง"]) : null,
              endDate: r["วันครบกำหนด"] ? String(r["วันครบกำหนด"]) : null,
              notes: r["หมายเหตุ"] ? String(r["หมายเหตุ"]) : null,
            });
          });
        }

        const taxPeople = {};
        const taxSheet = wb.Sheets["ภาษี"];
        if (taxSheet) {
          XLSX.utils.sheet_to_json(taxSheet, { defval: "" }).forEach((r) => {
            const y = String(r["ปีภาษี"]).trim();
            const person = String(r["บุคคล"] || "ตัวเอง").trim() || "ตัวเอง";
            if (!/^\d{4}$/.test(y)) return;
            if (!taxPeople[person]) taxPeople[person] = { years: {} };
            taxPeople[person].years[y] = {
              grossIncome: String(r["เงินได้รวมต่อปี"] ?? ""),
              isSalary: String(r["รายได้เป็นเงินเดือน"]).trim() === "ใช่",
              spouse: String(r["มีคู่สมรส"]).trim() === "ใช่",
              spouseLifeInsurance: String(r["เบี้ยประกันชีวิตคู่สมรส"] ?? ""),
              pregnancyCost: String(r["ค่าฝากครรภ์คลอดบุตร"] ?? ""),
              childrenBase: String(r["บุตรคนแรก/ก่อนปี2561"] ?? "0"),
              childrenExtra: String(r["บุตรคนที่2+/ปี2561+"] ?? "0"),
              parents: String(r["บิดามารดาที่เลี้ยงดู"] ?? "0"),
              disabledCare: String(r["ผู้พิการที่เลี้ยงดู"] ?? "0"),
              socialSecurity: String(r["ประกันสังคม"] ?? ""),
              parentHealthInsurance: String(r["ประกันสุขภาพบิดามารดา"] ?? ""),
              pensionLifeInsurance: String(r["เบี้ยประกันชีวิตแบบบำนาญ"] ?? ""),
              providentFund: String(r["กองทุนสำรองเลี้ยงชีพ"] ?? ""),
              nationalSavingsFund: String(r["กองทุนการออมแห่งชาติ"] ?? ""),
              rmf: String(r["กองทุนRMF"] ?? ""),
              ssf: String(r["กองทุนSSF"] ?? ""),
              socialEnterprise: String(r["วิสาหกิจเพื่อสังคม"] ?? ""),
              thaiEsg: String(r["ThaiESG"] ?? ""),
              mortgageInterest: String(r["ดอกเบี้ยที่อยู่อาศัย"] ?? ""),
              artPurchase: String(r["ค่าซื้องานศิลปะ"] ?? ""),
              solarRooftop: String(r["SolarRooftop"] ?? ""),
              donationsGeneral: String(r["บริจาคทั่วไป"] ?? ""),
              donationsEDouble: String(r["บริจาคeDonation"] ?? ""),
              donationsPolitical: String(r["บริจาคพรรคการเมือง"] ?? ""),
            };
          });
        }

        const next = { periods, insurance, taxPlanning: { people: taxPeople } };
        ensureTaxPlanning(next);
        persist(next);
        const keys = Object.keys(periods).sort(comparePeriods);
        setSelectedPeriod(keys[keys.length - 1] || null);
        setRestoreNote("restored");
        setError(null);
      } catch (err) {
        setError("อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ไฟล์ที่ดาวน์โหลดจากปุ่ม \"ดาวน์โหลด Excel\" ของแอปนี้เท่านั้น");
      }
    };
    reader.readAsArrayBuffer(file);
    setImportExcelInputKey((k) => k + 1);
  }

  const periodKeys = useMemo(
    () => (data ? Object.keys(data.periods).sort(comparePeriods) : []),
    [data]
  );

  useEffect(() => {
    if (periodKeys.length > 0 && !periodKeys.includes(duplicateFrom)) {
      setDuplicateFrom(periodKeys[periodKeys.length - 1]);
    }
  }, [periodKeys]);

  const current = data && selectedPeriod ? data.periods[selectedPeriod] : null;

  const totals = useMemo(() => {
    if (!current) return { assets: 0, liabilities: 0, net: 0 };
    const assets = current.assets.reduce((s, a) => s + Number(a.amount || 0), 0);
    const liabilities = current.liabilities.reduce((s, l) => s + Number(l.amount || 0), 0);
    return { assets, liabilities, net: assets - liabilities };
  }, [current]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return periodKeys.map((k) => {
      const p = data.periods[k];
      const assets = p.assets.reduce((s, a) => s + Number(a.amount || 0), 0);
      const liabilities = p.liabilities.reduce((s, l) => s + Number(l.amount || 0), 0);
      return { period: formatPeriodShort(k), assets, liabilities, netWorth: assets - liabilities };
    });
  }, [data, periodKeys]);

  const prevPeriodNet = useMemo(() => {
    const idx = periodKeys.indexOf(selectedPeriod);
    if (idx <= 0) return null;
    const prevKey = periodKeys[idx - 1];
    const p = data.periods[prevKey];
    const assets = p.assets.reduce((s, a) => s + Number(a.amount || 0), 0);
    const liabilities = p.liabilities.reduce((s, l) => s + Number(l.amount || 0), 0);
    return { net: assets - liabilities, key: prevKey };
  }, [periodKeys, selectedPeriod, data]);

  function clonePeriodContent(sourceKey) {
    const source = sourceKey && data.periods[sourceKey];
    if (!source) return emptyPeriod();
    return {
      assets: source.assets.map((a) => ({ ...a, id: uid(), dca: a.dca ? { ...a.dca } : null })),
      liabilities: source.liabilities.map((l) => ({ ...l, id: uid() })),
    };
  }

  function addPeriod() {
    const y = newYearInput.trim();
    const q = Number(newQuarterInput);
    if (!/^\d{4}$/.test(y) || ![1, 2, 3, 4].includes(q)) return;
    const key = periodKey(y, q);
    if (data.periods[key]) {
      setSelectedPeriod(key);
      return;
    }
    const content = clonePeriodContent(duplicateFrom);
    const next = { periods: { ...data.periods, [key]: content } };
    persist(next);
    setSelectedPeriod(key);
  }

  function deletePeriod(key) {
    const nextPeriods = { ...data.periods };
    delete nextPeriods[key];
    const next = { periods: nextPeriods };
    persist(next);
    const remaining = Object.keys(nextPeriods).sort(comparePeriods);
    setSelectedPeriod(remaining[remaining.length - 1] || null);
  }

  function saveEntry(type) {
    const form = type === "assets" ? assetForm : liabForm;
    const editingId = type === "assets" ? assetEditingId : liabEditingId;
    const amt = parseFloat(form.amount);
    if (!form.name.trim() || isNaN(amt)) return;

    let entry = { id: editingId || uid(), name: form.name.trim(), amount: amt, owner: form.owner.trim() ? form.owner.trim() : null };

    if (type === "assets") {
      const goalNum = parseFloat(form.goal);
      entry.goal = !isNaN(goalNum) && form.goal !== "" ? goalNum : null;
      entry.goalName = form.goalName.trim() ? form.goalName.trim() : null;

      const dcaAmtNum = parseFloat(form.dcaAmount);
      entry.dca =
        form.dcaEnabled && !isNaN(dcaAmtNum) && form.dcaAmount !== ""
          ? { amount: dcaAmtNum, frequency: form.dcaFrequency }
          : null;
    }

    const items = editingId
      ? current[type].map((it) => (it.id === editingId ? entry : it))
      : [...current[type], entry];
    const p = { ...current, [type]: items };
    const next = { periods: { ...data.periods, [selectedPeriod]: p } };
    persist(next);
    if (type === "assets") {
      setAssetForm({ name: "", amount: "", owner: "", goalName: "", goal: "", dcaEnabled: false, dcaAmount: "", dcaFrequency: "month" });
      setAssetEditingId(null);
    } else {
      setLiabForm({ name: "", amount: "", owner: "" });
      setLiabEditingId(null);
    }
  }

  function startEditAsset(item) {
    setAssetForm({
      name: item.name,
      amount: String(item.amount),
      owner: item.owner || "",
      goalName: item.goalName || "",
      goal: item.goal != null ? String(item.goal) : "",
      dcaEnabled: !!item.dca,
      dcaAmount: item.dca ? String(item.dca.amount) : "",
      dcaFrequency: item.dca ? item.dca.frequency : "month",
    });
    setAssetEditingId(item.id);
  }

  function cancelEditAsset() {
    setAssetForm({ name: "", amount: "", owner: "", goalName: "", goal: "", dcaEnabled: false, dcaAmount: "", dcaFrequency: "month" });
    setAssetEditingId(null);
  }

  function startEditLiab(item) {
    setLiabForm({ name: item.name, amount: String(item.amount), owner: item.owner || "" });
    setLiabEditingId(item.id);
  }

  function cancelEditLiab() {
    setLiabForm({ name: "", amount: "", owner: "" });
    setLiabEditingId(null);
  }

  function deleteEntry(type, id) {
    const p = { ...current, [type]: current[type].filter((e) => e.id !== id) };
    const next = { periods: { ...data.periods, [selectedPeriod]: p } };
    persist(next);
    if (type === "assets" && assetEditingId === id) cancelEditAsset();
    if (type === "liabilities" && liabEditingId === id) cancelEditLiab();
  }

  function saveInsurance(policy, editingId) {
    const list = data.insurance || [];
    const items = editingId
      ? list.map((p) => (p.id === editingId ? { ...policy, id: editingId } : p))
      : [...list, { ...policy, id: uid() }];
    persist({ ...data, insurance: items });
  }

  function deleteInsurance(id) {
    const next = { ...data, insurance: (data.insurance || []).filter((p) => p.id !== id) };
    persist(next);
  }

  function saveTaxYear(person, year, fields) {
    const people = { ...(data.taxPlanning?.people || {}) };
    const years = { ...(people[person]?.years || {}), [year]: fields };
    people[person] = { years };
    persist({ ...data, taxPlanning: { people } });
  }

  function addTaxYear(person, year) {
    if (!year) return;
    const people = { ...(data.taxPlanning?.people || {}) };
    const years = people[person]?.years || {};
    if (years[year]) return;
    people[person] = { years: { ...years, [year]: emptyTaxPlanning() } };
    persist({ ...data, taxPlanning: { people } });
  }

  function deleteTaxYear(person, year) {
    const people = { ...(data.taxPlanning?.people || {}) };
    const years = { ...(people[person]?.years || {}) };
    delete years[year];
    people[person] = { years };
    persist({ ...data, taxPlanning: { people } });
  }

  function addTaxPerson(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const people = { ...(data.taxPlanning?.people || {}) };
    if (people[trimmed]) return;
    const year = String(new Date().getFullYear());
    people[trimmed] = { years: { [year]: emptyTaxPlanning() } };
    persist({ ...data, taxPlanning: { people } });
  }

  function deleteTaxPerson(name) {
    const people = { ...(data.taxPlanning?.people || {}) };
    if (Object.keys(people).length <= 1) return;
    delete people[name];
    persist({ ...data, taxPlanning: { people } });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <FontLoader />
        <Loader2 className="animate-spin" size={28} style={{ color: C.accent }} />
      </div>
    );
  }

  const delta = prevPeriodNet !== null ? totals.net - prevPeriodNet.net : null;

  return (
    <div
      className="min-h-screen w-full app-font"
      style={{ background: C.bg, color: C.ink }}
    >
      <FontLoader />
      <style>{`
        .app-font { font-family: 'Prompt', sans-serif; }
        .mono { font-family: 'Prompt', sans-serif; font-variant-numeric: tabular-nums; }
        .ui-sans { font-family: 'Prompt', sans-serif; }
        .ledger-lines {
          background-image: repeating-linear-gradient(
            to bottom, transparent, transparent 35px, ${C.lines} 36px
          );
        }
        .paper-card {
          background: ${C.paper};
          border: 1px solid ${C.border};
          box-shadow: 0 1px 0 ${C.border}, 0 8px 20px -12px rgba(32,70,92,0.18);
        }
        input:focus, button:focus-visible, select:focus-visible {
          outline: 2px solid ${C.accent};
          outline-offset: 1px;
        }
        ::selection { background: ${C.accentSoft}; }
      `}</style>

      <div className="max-w-5xl mx-auto px-5 py-10 md:py-14">
        {/* 🛠️ แก้ไขสเตตัสล็อกอินขวาบนในบล็อก Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 ui-sans text-xs tracking-[0.2em] uppercase" style={{ color: C.muted }}>
              <BookOpen size={14} />
              การเงินส่วนบุคคลแบบภาพรวมสำหรับทุกคน
            </div>
            <h1 className="text-3xl md:text-4xl mt-1 font-medium" style={{ letterSpacing: "0.005em" }}>
              FinDash
            </h1>
          </div>
          <div className="text-right flex flex-col items-end gap-1.5">
            <div className="ui-sans text-xs" style={{ color: saving ? C.accent : C.mutedLight }}>
              {saving ? "กำลังบันทึก…" : lastSavedAt ? `บันทึกล่าสุด ${lastSavedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "ยังไม่บันทึก"}
            </div>
            
            {/* ดักเช็คเงื่อนไข UI: ล็อกอินออนไลน์ / โหมดออฟไลน์บราวเซอร์ / มีระบบออนไลน์แต่ยังไม่ล็อกอิน */}
            {user ? (
              <div className="flex items-center gap-2 mt-1 ui-sans text-xs">
                <span className="px-2.5 py-1 rounded-full flex items-center gap-1 font-medium" style={{ background: C.accentSoft, color: C.ink }}>
                  <User size={12} /> {user.email}
                </span>
                <button 
                  onClick={handleLogout} 
                  className="underline hover:text-red-500 transition-colors"
                  style={{ color: C.muted }}
                >
                  ออกจากระบบ
                </button>
              </div>
            ) : !hasSupabase() ? (
              <span className="ui-sans text-xs px-2.5 py-1 rounded mt-1 font-medium" style={{ background: C.border, color: C.inkSoft }}>
                โหมดใช้งานบนบราวเซอร์ (Offline)
              </span>
            ) : (
              <span className="ui-sans text-xs mt-1 font-medium" style={{ color: C.liability }}>
                ยังไม่ได้เข้าสู่ระบบ
              </span>
            )}
          </div>
        </div>

        {restoreNote === "fresh" && (
          <div
            className="mb-4 px-4 py-2.5 rounded ui-sans text-xs"
            style={{ background: C.accentSoft, color: C.inkSoft, border: `1px solid ${C.border}` }}
          >
            ไม่พบข้อมูลที่บันทึกไว้ก่อนหน้า — เริ่มสมุดบัญชีใหม่ ถ้าเคยกรอกข้อมูลไว้แล้วหายไป แนะนำให้กู้คืนจากไฟล์สำรอง (ถ้ามี) ด้วยปุ่ม "นำเข้าข้อมูลสำรอง" ด้านล่าง
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-8">
          <button
            onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full ui-sans text-xs"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            <FileSpreadsheet size={13} /> ดาวน์โหลด Excel
          </button>
          <button
            onClick={exportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full ui-sans text-xs"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            <Download size={13} /> ดาวน์โหลดข้อมูลสำรอง
          </button>
          <label
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full ui-sans text-xs cursor-pointer"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            <Upload size={13} /> อัปโหลด Excel
            <input
              key={importExcelInputKey}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={importExcel}
              className="hidden"
            />
          </label>
          <label
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full ui-sans text-xs cursor-pointer"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            <Upload size={13} /> นำเข้าข้อมูลสำรอง
            <input key={importInputKey} type="file" accept="application/json" onChange={importBackup} className="hidden" />
          </label>
        </div>
        <div className="ui-sans text-xs mb-2" style={{ color: C.mutedLight }}>
          การอัปโหลด Excel หรือนำเข้าข้อมูลสำรองจะแทนที่ข้อมูลทั้งหมดในแอปด้วยข้อมูลจากไฟล์ที่เลือก
        </div>

        {error && (
          <div
            className="mb-6 px-4 py-3 rounded ui-sans text-sm flex items-center justify-between gap-3 flex-wrap"
            style={{ background: C.errorBg, color: C.errorText, border: `1px solid ${C.errorBorder}` }}
          >
            <span>{error}</span>
            {lastFailedData && (
              <button
                onClick={retrySave}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded ui-sans text-xs"
                style={{ background: C.errorText, color: "#FBFAF4" }}
              >
                <RotateCcw size={12} /> ลองบันทึกอีกครั้ง
              </button>
            )}
          </div>
        )}

        {/* section tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {TABS.map((t) => {
            const TabIcon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full ui-sans text-sm transition-colors"
                style={{
                  background: active ? C.ink : "transparent",
                  color: active ? C.paper : C.inkSoft,
                  border: `1px solid ${active ? C.ink : C.border}`,
                }}
              >
                <TabIcon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === "ledger" && (
        <>
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {periodKeys.map((k) => {
            const isConfirming = confirmDeleteKey === k;
            return (
              <div
                key={k}
                className="flex items-center rounded-full overflow-hidden"
                style={{ border: `1px solid ${isConfirming ? C.liability : k === selectedPeriod ? C.ink : C.border}` }}
              >
                <button
                  onClick={() => {
                    setSelectedPeriod(k);
                    if (isConfirming) setConfirmDeleteKey(null);
                  }}
                  className="mono pl-3 pr-2 py-1.5 text-sm transition-colors"
                  style={{
                    background: isConfirming ? C.errorBg : k === selectedPeriod ? C.ink : "transparent",
                    color: isConfirming ? C.liability : k === selectedPeriod ? C.paper : C.inkSoft,
                  }}
                >
                  {isConfirming ? `ลบ ${formatPeriodShort(k)}?` : formatPeriodShort(k)}
                </button>
                {periodKeys.length > 1 && (
                  <button
                    onClick={() => {
                      if (isConfirming) {
                        deletePeriod(k);
                        setConfirmDeleteKey(null);
                      } else {
                        setConfirmDeleteKey(k);
                      }
                    }}
                    className="pr-2.5 pl-1 py-1.5"
                    style={{
                      background: isConfirming ? C.errorBg : k === selectedPeriod ? C.ink : "transparent",
                      color: isConfirming ? C.liability : k === selectedPeriod ? C.mutedLight : C.muted,
                    }}
                    aria-label={isConfirming ? `ยืนยันลบ ${formatPeriodShort(k)}` : `ลบ ${formatPeriodShort(k)}`}
                  >
                    {isConfirming ? <CheckCircle2 size={13} /> : <X size={12} />}
                  </button>
                )}
                {isConfirming && (
                  <button
                    onClick={() => setConfirmDeleteKey(null)}
                    className="pr-2 pl-0.5 py-1.5"
                    style={{ color: C.liability }}
                    aria-label="ยกเลิกการลบ"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1 ml-1">
            <input
              value={newYearInput}
              onChange={(e) => setNewYearInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="ปี"
              className="mono w-16 px-2 py-1.5 rounded text-sm bg-transparent"
              style={{ border: `1px solid ${C.border}` }}
              onKeyDown={(e) => e.key === "Enter" && addPeriod()}
            />
            <select
              value={newQuarterInput}
              onChange={(e) => setNewQuarterInput(e.target.value)}
              className="ui-sans px-2 py-1.5 rounded text-sm bg-transparent"
              style={{ border: `1px solid ${C.border}` }}
            >
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </select>
            {periodKeys.length > 0 && (
              <select
                value={duplicateFrom}
                onChange={(e) => setDuplicateFrom(e.target.value)}
                className="ui-sans px-2 py-1.5 rounded text-sm bg-transparent"
                style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
                title="คัดลอกข้อมูลจากไตรมาสนี้มาเป็นจุดเริ่มต้น"
              >
                <option value="">เริ่มว่างเปล่า</option>
                {periodKeys.map((k) => (
                  <option key={k} value={k}>คัดลอกจาก {formatPeriodShort(k)}</option>
                ))}
              </select>
            )}
            <button
              onClick={addPeriod}
              className="p-1.5 rounded ui-sans"
              style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
              aria-label="เพิ่มไตรมาส"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {duplicateFrom && periodKeys.length > 0 && (
          <div
            className="mb-6 -mt-4 ui-sans text-xs flex items-center gap-1.5"
            style={{ color: C.mutedLight }}
          >
            <Info size={12} />
            ไตรมาสใหม่ที่สร้างจะคัดลอกรายการสินทรัพย์/หนี้สินจาก {formatPeriodShort(duplicateFrom)} มาให้แก้ไขต่อได้ทันที
          </div>
        )}

        {current && (
          <>
            <div className="paper-card rounded-lg p-6 md:p-8 mb-10 ledger-lines">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <div className="ui-sans text-xs tracking-[0.2em] uppercase mb-1" style={{ color: C.muted }}>
                    ความมั่งคั่งสุทธิ {formatPeriodShort(selectedPeriod)}
                  </div>
                  <div className="mono text-4xl md:text-5xl font-medium" style={{ color: C.ink }}>
                    ฿{THB(totals.net)}
                  </div>
                  {delta !== null && (
                    <div
                      className="ui-sans text-sm mt-2 flex items-center gap-1"
                      style={{ color: delta >= 0 ? C.asset : C.liability }}
                    >
                      {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {delta >= 0 ? "+" : ""}
                      {THB(delta)} จาก {formatPeriodShort(prevPeriodNet.key)}
                    </div>
                  )}
                </div>
                <div className="flex gap-8">
                  <div>
                    <div className="ui-sans text-xs uppercase tracking-wide" style={{ color: C.asset }}>สินทรัพย์รวม</div>
                    <div className="mono text-xl">฿{THB(totals.assets)}</div>
                  </div>
                  <div>
                    <div className="ui-sans text-xs uppercase tracking-wide" style={{ color: C.liability }}>หนี้สินรวม</div>
                    <div className="mono text-xl">฿{THB(totals.liabilities)}</div>
                  </div>
                </div>
              </div>
              {periodKeys.length > 1 && (
                <button
                  onClick={() => deletePeriod(selectedPeriod)}
                  className="ui-sans text-xs mt-6 flex items-center gap-1"
                  style={{ color: C.muted }}
                >
                  <Trash2 size={12} /> ลบข้อมูล {formatPeriodShort(selectedPeriod)}
                </button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-12">
              <AssetColumn
                accent={C.asset}
                items={current.assets}
                form={assetForm}
                setForm={setAssetForm}
                onAdd={() => saveEntry("assets")}
                onDelete={(id) => deleteEntry("assets", id)}
                editingId={assetEditingId}
                onEditStart={startEditAsset}
                onCancelEdit={cancelEditAsset}
              />
              <LedgerColumn
                title="หนี้สิน"
                accent={C.liability}
                items={current.liabilities}
                form={liabForm}
                setForm={setLiabForm}
                onAdd={() => saveEntry("liabilities")}
                onDelete={(id) => deleteEntry("liabilities", id)}
                editingId={liabEditingId}
                onEditStart={startEditLiab}
                onCancelEdit={cancelEditLiab}
              />
            </div>
          </>
        )}

        {periodKeys.length >= 1 && (
          <div className="space-y-8">
            <h2 className="text-2xl mb-2 font-medium">แนวโน้มรายไตรมาส</h2>

            <div className="paper-card rounded-lg p-5 md:p-6">
              <div className="ui-sans text-xs uppercase tracking-wide mb-4" style={{ color: C.muted }}>
                ความมั่งคั่งสุทธิ
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.lines} vertical={false} />
                  <XAxis dataKey="period" stroke={C.muted} tick={{ fontSize: 12, fontFamily: "Prompt" }} />
                  <YAxis
                    stroke={C.muted}
                    tick={{ fontSize: 12, fontFamily: "Prompt" }}
                    tickFormatter={(v) => `${THB(v / 1000)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(v) => `฿${THB(v)}`}
                    contentStyle={{ background: C.paper, border: `1px solid ${C.border}`, fontFamily: "Prompt", fontSize: 13 }}
                  />
                  <Line type="monotone" dataKey="netWorth" name="ความมั่งคั่งสุทธิ" stroke={C.accent} strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="paper-card rounded-lg p-5 md:p-6">
              <div className="ui-sans text-xs uppercase tracking-wide mb-4" style={{ color: C.muted }}>
                สินทรัพย์เทียบกับหนี้สิน
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.lines} vertical={false} />
                  <XAxis dataKey="period" stroke={C.muted} tick={{ fontSize: 12, fontFamily: "Prompt" }} />
                  <YAxis
                    stroke={C.muted}
                    tick={{ fontSize: 12, fontFamily: "Prompt" }}
                    tickFormatter={(v) => `${THB(v / 1000)}k`}
                    width={55}
                  />
                  <Tooltip
                    formatter={(v) => `฿${THB(v)}`}
                    contentStyle={{ background: C.paper, border: `1px solid ${C.border}`, fontFamily: "Prompt", fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Prompt" }} formatter={(v) => (v === "assets" ? "สินทรัพย์" : "หนี้สิน")} />
                  <Bar dataKey="assets" fill={C.asset} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="liabilities" fill={C.liability} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        </>
        )}

        {activeTab === "insurance" && (
          <InsuranceSection
            insurance={data.insurance || []}
            onSave={saveInsurance}
            onDelete={deleteInsurance}
          />
        )}

        {activeTab === "tax" && (
          <TaxPlanningSection
            insurance={data.insurance || []}
            taxPlanning={data.taxPlanning || emptyTaxPlanningContainer()}
            onSaveYear={saveTaxYear}
            onAddYear={addTaxYear}
            onDeleteYear={deleteTaxYear}
            onAddPerson={addTaxPerson}
            onDeletePerson={deleteTaxPerson}
          />
        )}

        <div className="ui-sans text-xs mt-10 text-center" style={{ color: C.mutedLight }}>
          ข้อมูลถูกบันทึกไว้เฉพาะบัญชีของคุณเท่านั้น
        </div>
      </div>
    </div>
  );
}

function FontLoader() {
  return (
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
  );
}

function LedgerColumn({ title, accent, items, form, setForm, onAdd, onDelete, editingId, onEditStart, onCancelEdit }) {
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  return (
    <div className="paper-card rounded-lg p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium" style={{ color: accent }}>{title}</h3>
        <div className="mono text-sm" style={{ color: accent }}>฿{THB(total)}</div>
      </div>

      <div className="space-y-1 mb-4 min-h-[20px]">
        {items.length === 0 && (
          <div className="ui-sans text-sm italic" style={{ color: "#B4C5CB" }}>ยังไม่มีรายการ</div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="py-2 group"
            style={{
              borderBottom: "1px dashed #DFE8EA",
              background: editingId === item.id ? "#E3EEF2" : "transparent",
              borderRadius: editingId === item.id ? 6 : 0,
              paddingLeft: editingId === item.id ? 8 : 0,
              paddingRight: editingId === item.id ? 8 : 0,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="ui-sans text-sm">{item.name}</span>
              <div className="flex items-center gap-2.5">
                <span className="mono text-sm">฿{THB(item.amount)}</span>
                <button
                  onClick={() => onEditStart(item)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#4F7688" }}
                  aria-label={`แก้ไข ${item.name}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#8FA9AF" }}
                  aria-label={`ลบ ${item.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {item.owner && (
              <div
                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full ui-sans text-xs"
                style={{ background: "#E3EEF2", color: "#4F7688" }}
              >
                <User size={10} /> {item.owner}
              </div>
            )}
          </div>
        ))}
      </div>

      {editingId && (
        <div className="flex items-center gap-1 mb-2 ui-sans text-xs" style={{ color: accent }}>
          <Pencil size={11} /> กำลังแก้ไขรายการ
          <button onClick={onCancelEdit} className="ml-auto flex items-center gap-0.5" style={{ color: "#8FA9AF" }}>
            <X size={12} /> ยกเลิก
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อรายการ"
            className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
            style={{ border: "1px solid #D3DEE2" }}
          />
          <input
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="จำนวนเงิน"
            inputMode="decimal"
            className="mono w-28 px-3 py-2 rounded text-sm bg-transparent"
            style={{ border: "1px solid #D3DEE2" }}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
        </div>
        <div className="flex gap-2">
          <input
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            placeholder="ผู้ดูแล เช่น พ่อ, แม่, ตัวเอง"
            className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
            style={{ border: "1px solid #D3DEE2" }}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
          />
          <button
            onClick={onAdd}
            className="px-3 rounded"
            style={{ background: accent, color: "#FBFAF4" }}
            aria-label={editingId ? "บันทึกการแก้ไข" : `เพิ่ม${title}`}
          >
            {editingId ? <CheckCircle2 size={16} /> : <Plus size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetColumn({ accent, items, form, setForm, onAdd, onDelete, editingId, onEditStart, onCancelEdit }) {
  const [goalFilter, setGoalFilter] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState(null);

  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);

  const goalOptions = useMemo(() => {
    const set = new Set();
    items.forEach((i) => {
      if (i.goalName) set.add(i.goalName);
    });
    return Array.from(set);
  }, [items]);

  const ownerOptions = useMemo(() => {
    const set = new Set();
    items.forEach((i) => {
      if (i.owner) set.add(i.owner);
    });
    return Array.from(set);
  }, [items]);

  const visibleItems = items.filter(
    (i) => (!goalFilter || i.goalName === goalFilter) && (!ownerFilter || i.owner === ownerFilter)
  );

  const filteredSummary = useMemo(() => {
    if (!goalFilter && !ownerFilter) return null;
    const matched = items.filter(
      (i) => (!goalFilter || i.goalName === goalFilter) && (!ownerFilter || i.owner === ownerFilter)
    );
    const sumAmount = matched.reduce((s, i) => s + Number(i.amount || 0), 0);
    const sumGoal = matched.reduce((s, i) => s + Number(i.goal || 0), 0);
    const pct = sumGoal > 0 ? Math.min(100, (sumAmount / sumGoal) * 100) : null;
    const labelParts = [];
    if (ownerFilter) labelParts.push(`ผู้ดูแล "${ownerFilter}"`);
    if (goalFilter) labelParts.push(`เป้าหมาย "${goalFilter}"`);
    return { sumAmount, sumGoal, pct, count: matched.length, label: labelParts.join(" · ") };
  }, [goalFilter, ownerFilter, items]);

  return (
    <div className="paper-card rounded-lg p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium" style={{ color: accent }}>สินทรัพย์</h3>
        <div className="mono text-sm" style={{ color: accent }}>฿{THB(total)}</div>
      </div>

      {ownerOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <button
            onClick={() => setOwnerFilter(null)}
            className="ui-sans text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: ownerFilter === null ? "#20465C" : "transparent",
              color: ownerFilter === null ? "#FBFAF4" : "#7C97A1",
              border: `1px solid ${ownerFilter === null ? "#20465C" : "#D3DEE2"}`,
            }}
          >
            ทุกคน
          </button>
          {ownerOptions.map((o) => (
            <button
              key={o}
              onClick={() => setOwnerFilter(o)}
              className="ui-sans text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              style={{
                background: ownerFilter === o ? accent : "transparent",
                color: ownerFilter === o ? "#FBFAF4" : "#7C97A1",
                border: `1px solid ${ownerFilter === o ? accent : "#D3DEE2"}`,
              }}
            >
              <User size={10} /> {o}
            </button>
          ))}
        </div>
      )}

      {goalOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <button
            onClick={() => setGoalFilter(null)}
            className="ui-sans text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: goalFilter === null ? "#20465C" : "transparent",
              color: goalFilter === null ? "#FBFAF4" : "#7C97A1",
              border: `1px solid ${goalFilter === null ? "#20465C" : "#D3DEE2"}`,
            }}
          >
            ทุกเป้าหมาย
          </button>
          {goalOptions.map((g) => (
            <button
              key={g}
              onClick={() => setGoalFilter(g)}
              className="ui-sans text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              style={{
                background: goalFilter === g ? accent : "transparent",
                color: goalFilter === g ? "#FBFAF4" : "#7C97A1",
                border: `1px solid ${goalFilter === g ? accent : "#D3DEE2"}`,
              }}
            >
              <Target size={10} /> {g}
            </button>
          ))}
        </div>
      )}

      {filteredSummary && (
        <div className="mb-4 px-3 py-2.5 rounded" style={{ background: "#E3EEF2" }}>
          <div className="flex items-center justify-between ui-sans text-xs mb-1" style={{ color: "#4F7688" }}>
            <span>{filteredSummary.count} รายการ · {filteredSummary.label}</span>
            <span className="mono">฿{THB(filteredSummary.sumAmount)}{filteredSummary.sumGoal > 0 ? ` / ฿${THB(filteredSummary.sumGoal)}` : ""}</span>
          </div>
          {filteredSummary.pct !== null && (
            <div className="h-1.5 rounded-full w-full" style={{ background: "#DFE8EA" }}>
              <div className="h-1.5 rounded-full" style={{ width: `${filteredSummary.pct}%`, background: accent }} />
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 mb-4 min-h-[20px]">
        {visibleItems.length === 0 && (
          <div className="ui-sans text-sm italic" style={{ color: "#B4C5CB" }}>ยังไม่มีรายการ</div>
        )}
        {visibleItems.map((item) => {
          const pct = item.goal ? Math.min(100, (item.amount / item.goal) * 100) : null;
          return (
            <div
              key={item.id}
              className="py-2 group"
              style={{
                borderBottom: "1px dashed #DFE8EA",
                background: editingId === item.id ? "#E3EEF2" : "transparent",
                borderRadius: editingId === item.id ? 6 : 0,
                paddingLeft: editingId === item.id ? 8 : 0,
                paddingRight: editingId === item.id ? 8 : 0,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="ui-sans text-sm">{item.name}</span>
                <div className="flex items-center gap-2.5">
                  <span className="mono text-sm">฿{THB(item.amount)}</span>
                  <button
                    onClick={() => onEditStart(item)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#4F7688" }}
                    aria-label={`แก้ไข ${item.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#8FA9AF" }}
                    aria-label={`ลบ ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {item.owner && (
                <div
                  className="inline-flex items-center gap-1 mt-2 mr-1.5 px-2 py-0.5 rounded-full ui-sans text-xs"
                  style={{ background: "#E3EEF2", color: "#4F7688" }}
                >
                  <User size={10} /> {item.owner}
                </div>
              )}

              {item.goalName && (
                <div
                  className="inline-flex items-center gap-1 mt-2 mr-1.5 px-2 py-0.5 rounded-full ui-sans text-xs"
                  style={{ background: "#E3EEF2", color: "#4F7688" }}
                >
                  <Target size={10} /> {item.goalName}
                </div>
              )}

              {pct !== null && (
                <div className="mt-2">
                  <div className="flex items-center justify-between ui-sans text-xs mb-1" style={{ color: "#7C97A1" }}>
                    <span>เป้าหมาย ฿{THB(item.goal)}</span>
                    <span className="mono">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full w-full" style={{ background: "#DFE8EA" }}>
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${pct}%`, background: accent }}
                    />
                  </div>
                </div>
              )}

              {item.dca && (
                <div
                  className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full ui-sans text-xs"
                  style={{ background: "#E3EEF2", color: "#4F7688" }}
                >
                  <RefreshCw size={10} /> DCA ฿{THB(item.dca.amount)} / {freqLabel(item.dca.frequency)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        {editingId && (
          <div className="flex items-center gap-1 ui-sans text-xs" style={{ color: accent }}>
            <Pencil size={11} /> กำลังแก้ไขรายการ
            <button onClick={onCancelEdit} className="ml-auto flex items-center gap-0.5" style={{ color: "#8FA9AF" }}>
              <X size={12} /> ยกเลิก
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อสินทรัพย์ / พอร์ตการลงทุน"
            className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
            style={{ border: "1px solid #D3DEE2" }}
          />
          <input
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="มูลค่า"
            inputMode="decimal"
            className="mono w-24 px-3 py-2 rounded text-sm bg-transparent"
            style={{ border: "1px solid #D3DEE2" }}
          />
        </div>

        <div className="flex gap-2">
          <input
            value={form.owner}
            onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            placeholder="ผู้ดูแล เช่น พ่อ, แม่, ตัวเอง"
            className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
            style={{ border: "1px solid #D3DEE2" }}
          />
        </div>

        <div className="flex gap-2">
          <input
            value={form.goalName}
            onChange={(e) => setForm((f) => ({ ...f, goalName: e.target.value }))}
            placeholder="ชื่อเป้าหมาย เช่น ดาวน์บ้าน, เกษียณ"
            className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
            style={{ border: "1px solid #D3DEE2" }}
          />
          <input
            value={form.goal}
            onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
            placeholder="จำนวนเป้าหมาย"
            inputMode="decimal"
            className="mono w-32 px-3 py-2 rounded text-sm bg-transparent"
            style={{ border: "1px solid #D3DEE2" }}
          />
        </div>

        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2 rounded"
          style={{ border: "1px solid #D3DEE2" }}
        >
          <label className="flex items-center gap-1.5 ui-sans text-xs" style={{ color: "#4F7688" }}>
            <input
              type="checkbox"
              checked={form.dcaEnabled}
              onChange={(e) => setForm((f) => ({ ...f, dcaEnabled: e.target.checked }))}
            />
            DCA รายการนี้
          </label>
          {form.dcaEnabled && (
            <>
              <input
                value={form.dcaAmount}
                onChange={(e) => setForm((f) => ({ ...f, dcaAmount: e.target.value }))}
                placeholder="จำนวนเงิน"
                inputMode="decimal"
                className="mono w-24 px-2 py-1 rounded text-xs bg-transparent"
                style={{ border: "1px solid #D3DEE2" }}
              />
              <span className="ui-sans text-xs" style={{ color: "#7C97A1" }}>ทุก</span>
              <select
                value={form.dcaFrequency}
                onChange={(e) => setForm((f) => ({ ...f, dcaFrequency: e.target.value }))}
                className="ui-sans text-xs px-2 py-1 rounded bg-transparent"
                style={{ border: "1px solid #D3DEE2" }}
              >
                <option value="week">สัปดาห์</option>
                <option value="month">เดือน</option>
                <option value="year">ปี</option>
              </select>
            </>
          )}
        </div>

        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded ui-sans text-sm"
          style={{ background: accent, color: "#FBFAF4" }}
        >
          {editingId ? <CheckCircle2 size={16} /> : <Plus size={16} />} {editingId ? "บันทึกการแก้ไข" : "เพิ่มสินทรัพย์"}
        </button>
      </div>
    </div>
  );
}

function emptyInsuranceForm() {
  return {
    category: "life",
    policyName: "",
    insurer: "",
    policyNumber: "",
    person: "",
    assetName: "",
    coverageAmount: "",
    premium: "",
    premiumFrequency: "year",
    startDate: "",
    endDate: "",
    notes: "",
  };
}

function InsuranceSection({ insurance, onSave, onDelete }) {
  const [filter, setFilter] = useState(null);
  const [personFilter, setPersonFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyInsuranceForm());
  const [editingId, setEditingId] = useState(null);

  const personOptions = useMemo(() => {
    const set = new Set();
    insurance.forEach((p) => {
      if (p.person) set.add(p.person);
    });
    return Array.from(set);
  }, [insurance]);

  const visible = insurance.filter(
    (p) => (!filter || p.category === filter) && (!personFilter || p.person === personFilter)
  );

  const totals = useMemo(() => {
    const coverage = insurance.reduce((s, p) => s + Number(p.coverageAmount || 0), 0);
    const premiumYear = insurance.reduce((s, p) => s + annualPremium(p), 0);
    return { count: insurance.length, coverage, premiumYear };
  }, [insurance]);

  const filteredSummary = useMemo(() => {
    if (!personFilter) return null;
    const matched = insurance.filter((p) => p.person === personFilter);
    const coverage = matched.reduce((s, p) => s + Number(p.coverageAmount || 0), 0);
    const premiumYear = matched.reduce((s, p) => s + annualPremium(p), 0);
    return { count: matched.length, coverage, premiumYear };
  }, [personFilter, insurance]);

  function submit() {
    const meta = catMeta(form.category);
    if (!form.policyName.trim() || !form.insurer.trim()) return;
    const coverageNum = parseFloat(form.coverageAmount);
    const premiumNum = parseFloat(form.premium);
    onSave(
      {
        category: form.category,
        policyName: form.policyName.trim(),
        insurer: form.insurer.trim(),
        policyNumber: form.policyNumber.trim() || null,
        person: meta.group === "person" ? (form.person.trim() || null) : null,
        assetName: meta.group === "property" ? (form.assetName.trim() || null) : null,
        coverageAmount: !isNaN(coverageNum) && form.coverageAmount !== "" ? coverageNum : null,
        premium: !isNaN(premiumNum) && form.premium !== "" ? premiumNum : null,
        premiumFrequency: form.premiumFrequency,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        notes: form.notes.trim() || null,
      },
      editingId
    );
    setForm(emptyInsuranceForm());
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(p) {
    setForm({
      category: p.category,
      policyName: p.policyName || "",
      insurer: p.insurer || "",
      policyNumber: p.policyNumber || "",
      person: p.person || "",
      assetName: p.assetName || "",
      coverageAmount: p.coverageAmount != null ? String(p.coverageAmount) : "",
      premium: p.premium != null ? String(p.premium) : "",
      premiumFrequency: p.premiumFrequency || "year",
      startDate: p.startDate || "",
      endDate: p.endDate || "",
      notes: p.notes || "",
    });
    setEditingId(p.id);
    setShowForm(true);
  }

  function cancelForm() {
    setForm(emptyInsuranceForm());
    setEditingId(null);
    setShowForm(false);
  }

  const meta = catMeta(form.category);

  return (
    <div className="paper-card rounded-lg p-5 md:p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} style={{ color: C.accent }} />
          <h2 className="text-xl font-medium">ประกันและความคุ้มครอง</h2>
        </div>
        <button
          onClick={() => (showForm ? cancelForm() : setShowForm(true))}
          className="flex items-center gap-1 ui-sans text-xs px-3 py-1.5 rounded-full"
          style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
        >
          {showForm ? <ChevronUp size={14} /> : <Plus size={14} />}
          {showForm ? "ปิดฟอร์ม" : "เพิ่มกรมธรรม์"}
        </button>
      </div>
      <div className="ui-sans text-xs mb-4" style={{ color: C.muted }}>
        บันทึกกรมธรรม์ประกันชีวิต สุขภาพ อุบัติเหตุของบุคคล และประกันบ้าน/รถของทรัพย์สิน
      </div>

      {/* summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>กรมธรรม์ทั้งหมด</div>
          <div className="mono text-lg font-medium">{totals.count}</div>
        </div>
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>ทุนประกันรวม</div>
          <div className="mono text-lg font-medium">฿{THB(totals.coverage)}</div>
        </div>
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>เบี้ยรวม/ปี</div>
          <div className="mono text-lg font-medium">฿{THB(totals.premiumYear)}</div>
        </div>
      </div>

      {/* person filter */}
      {personOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <button
            onClick={() => setPersonFilter(null)}
            className="ui-sans text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{
              background: personFilter === null ? C.ink : "transparent",
              color: personFilter === null ? C.paper : C.muted,
              border: `1px solid ${personFilter === null ? C.ink : C.border}`,
            }}
          >
            ทุกคน
          </button>
          {personOptions.map((p) => (
            <button
              key={p}
              onClick={() => setPersonFilter(p)}
              className="ui-sans text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              style={{
                background: personFilter === p ? C.accent : "transparent",
                color: personFilter === p ? "#FBFAF4" : C.muted,
                border: `1px solid ${personFilter === p ? C.accent : C.border}`,
              }}
            >
              <User size={10} /> {p}
            </button>
          ))}
        </div>
      )}

      {/* category filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <button
          onClick={() => setFilter(null)}
          className="ui-sans text-xs px-2.5 py-1 rounded-full transition-colors"
          style={{
            background: filter === null ? C.ink : "transparent",
            color: filter === null ? C.paper : C.muted,
            border: `1px solid ${filter === null ? C.ink : C.border}`,
          }}
        >
          ทุกประเภท
        </button>
        {INSURANCE_CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className="ui-sans text-xs px-2.5 py-1 rounded-full flex items-center gap-1 transition-colors"
              style={{
                background: filter === c.key ? C.accent : "transparent",
                color: filter === c.key ? "#FBFAF4" : C.muted,
                border: `1px solid ${filter === c.key ? C.accent : C.border}`,
              }}
            >
              <Icon size={11} /> {c.label}
            </button>
          );
        })}
      </div>

      {filteredSummary && (
        <div className="mb-4 px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="flex items-center justify-between ui-sans text-xs" style={{ color: C.inkSoft }}>
            <span>{filteredSummary.count} กรมธรรม์ของ "{personFilter}"</span>
            <span className="mono">ทุนประกัน ฿{THB(filteredSummary.coverage)} · เบี้ย/ปี ฿{THB(filteredSummary.premiumYear)}</span>
          </div>
        </div>
      )}

      {/* add form */}
      {showForm && (
        <div className="mb-5 p-4 rounded space-y-2" style={{ border: `1px solid ${C.border}`, background: C.bg }}>
          <div className="flex flex-wrap gap-2">
            {INSURANCE_CATEGORIES.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                  className="ui-sans text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1"
                  style={{
                    background: form.category === c.key ? C.accent : "transparent",
                    color: form.category === c.key ? "#FBFAF4" : C.inkSoft,
                    border: `1px solid ${form.category === c.key ? C.accent : C.border}`,
                  }}
                >
                  <Icon size={11} /> {c.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              value={form.policyName}
              onChange={(e) => setForm((f) => ({ ...f, policyName: e.target.value }))}
              placeholder="ชื่อแผน/กรมธรรม์"
              className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
              style={{ border: `1px solid ${C.border}` }}
            />
            <input
              value={form.insurer}
              onChange={(e) => setForm((f) => ({ ...f, insurer: e.target.value }))}
              placeholder="บริษัทประกัน"
              className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
              style={{ border: `1px solid ${C.border}` }}
            />
          </div>

          <div className="flex gap-2">
            <input
              value={form.policyNumber}
              onChange={(e) => setForm((f) => ({ ...f, policyNumber: e.target.value }))}
              placeholder="เลขที่กรมธรรม์ (ถ้ามี)"
              className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
              style={{ border: `1px solid ${C.border}` }}
            />
            {meta.group === "person" ? (
              <input
                value={form.person}
                onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))}
                placeholder="ผู้เอาประกัน เช่น ตัวเอง, แม่"
                className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
                style={{ border: `1px solid ${C.border}` }}
              />
            ) : (
              <input
                value={form.assetName}
                onChange={(e) => setForm((f) => ({ ...f, assetName: e.target.value }))}
                placeholder="ทรัพย์สินที่คุ้มครอง เช่น บ้านหลังที่ 1, Honda City"
                className="ui-sans flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
                style={{ border: `1px solid ${C.border}` }}
              />
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={form.coverageAmount}
              onChange={(e) => setForm((f) => ({ ...f, coverageAmount: e.target.value }))}
              placeholder="ทุนประกัน / วงเงินคุ้มครอง"
              inputMode="decimal"
              className="mono flex-1 px-3 py-2 rounded text-sm bg-transparent min-w-0"
              style={{ border: `1px solid ${C.border}` }}
            />
            <input
              value={form.premium}
              onChange={(e) => setForm((f) => ({ ...f, premium: e.target.value }))}
              placeholder="เบี้ยประกัน"
              inputMode="decimal"
              className="mono w-32 px-3 py-2 rounded text-sm bg-transparent"
              style={{ border: `1px solid ${C.border}` }}
            />
            <select
              value={form.premiumFrequency}
              onChange={(e) => setForm((f) => ({ ...f, premiumFrequency: e.target.value }))}
              className="ui-sans text-sm px-2 py-2 rounded bg-transparent"
              style={{ border: `1px solid ${C.border}` }}
            >
              <option value="month">ต่อเดือน</option>
              <option value="year">ต่อปี</option>
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="ui-sans text-xs block mb-1" style={{ color: C.muted }}>วันเริ่มคุ้มครอง</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="ui-sans w-full px-3 py-2 rounded text-sm bg-transparent"
                style={{ border: `1px solid ${C.border}` }}
              />
            </div>
            <div className="flex-1">
              <label className="ui-sans text-xs block mb-1" style={{ color: C.muted }}>วันครบกำหนด/ต่ออายุ</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="ui-sans w-full px-3 py-2 rounded text-sm bg-transparent"
                style={{ border: `1px solid ${C.border}` }}
              />
            </div>
          </div>

          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="ความคุ้มครองเพิ่มเติม / หมายเหตุ"
            rows={2}
            className="ui-sans w-full px-3 py-2 rounded text-sm bg-transparent"
            style={{ border: `1px solid ${C.border}` }}
          />

          <button
            onClick={submit}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded ui-sans text-sm"
            style={{ background: C.accent, color: "#FBFAF4" }}
          >
            {editingId ? <CheckCircle2 size={16} /> : <Plus size={16} />} {editingId ? "บันทึกการแก้ไข" : "บันทึกกรมธรรม์"}
          </button>
        </div>
      )}

      {/* policy list */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="ui-sans text-sm italic" style={{ color: C.mutedLight }}>ยังไม่มีกรมธรรม์ในหมวดนี้</div>
        )}
        {visible.map((p) => {
          const m = catMeta(p.category);
          const Icon = m.icon;
          const dLeft = daysUntil(p.endDate);
          let expiryColor = C.muted;
          let expiryLabel = null;
          if (dLeft !== null) {
            if (dLeft < 0) {
              expiryColor = C.liability;
              expiryLabel = "หมดอายุแล้ว";
            } else if (dLeft <= 30) {
              expiryColor = "#B08A2E";
              expiryLabel = `ครบกำหนดใน ${dLeft} วัน`;
            } else {
              expiryColor = C.asset;
              expiryLabel = `ต่ออายุ ${formatThaiDate(p.endDate)}`;
            }
          }
          return (
            <div key={p.id} className="p-3.5 rounded group" style={{ border: `1px solid ${C.border}`, background: editingId === p.id ? C.accentSoft : "transparent" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1.5 rounded-full" style={{ background: C.accentSoft }}>
                    <Icon size={13} style={{ color: C.accent }} />
                  </div>
                  <div>
                    <div className="ui-sans text-sm font-medium">{p.policyName}</div>
                    <div className="ui-sans text-xs" style={{ color: C.muted }}>
                      {m.label} · {p.insurer}
                      {p.person && <> · {p.person}</>}
                      {p.assetName && <> · {p.assetName}</>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => startEdit(p)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#4F7688" }}
                    aria-label={`แก้ไข ${p.policyName}`}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(p.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "#8FA9AF" }}
                    aria-label={`ลบ ${p.policyName}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 ui-sans text-xs" style={{ color: C.inkSoft }}>
                {p.coverageAmount != null && (
                  <span>ทุนประกัน <span className="mono">฿{THB(p.coverageAmount)}</span></span>
                )}
                {p.premium != null && (
                  <span>เบี้ย <span className="mono">฿{THB(p.premium)}</span> / {p.premiumFrequency === "month" ? "เดือน" : "ปี"}</span>
                )}
                {p.policyNumber && <span>เลขที่ {p.policyNumber}</span>}
              </div>

              {expiryLabel && (
                <div className="flex items-center gap-1 mt-2 ui-sans text-xs" style={{ color: expiryColor }}>
                  <CalendarDays size={11} /> {expiryLabel}
                </div>
              )}

              {p.notes && (
                <div className="mt-2 ui-sans text-xs italic" style={{ color: C.muted }}>{p.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaxPlanningSection({ insurance, taxPlanning, onSaveYear, onAddYear, onDeleteYear, onAddPerson, onDeletePerson }) {
  const personKeys = useMemo(() => Object.keys(taxPlanning.people), [taxPlanning]);
  const [selectedPerson, setSelectedPerson] = useState(personKeys[0] || "ตัวเอง");
  const [newPersonInput, setNewPersonInput] = useState("");

  useEffect(() => {
    if (personKeys.length > 0 && !personKeys.includes(selectedPerson)) {
      setSelectedPerson(personKeys[0]);
    }
  }, [personKeys]);

  const personInsurance = useMemo(
    () => insurance.filter((p) => p.person === selectedPerson),
    [insurance, selectedPerson]
  );

  const personYears = taxPlanning.people[selectedPerson]?.years || {};
  const yearKeys = useMemo(
    () => Object.keys(personYears).sort((a, b) => Number(a) - Number(b)),
    [personYears]
  );
  const [selectedYear, setSelectedYear] = useState(yearKeys[yearKeys.length - 1] || String(new Date().getFullYear()));
  const [newYearInput, setNewYearInput] = useState("");
  const [form, setForm] = useState(personYears[selectedYear] || emptyTaxPlanning());

  useEffect(() => {
    const keys = Object.keys(taxPlanning.people[selectedPerson]?.years || {}).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0 && !keys.includes(selectedYear)) {
      setSelectedYear(keys[keys.length - 1]);
    }
  }, [selectedPerson, taxPlanning]);

  useEffect(() => {
    setForm(taxPlanning.people[selectedPerson]?.years?.[selectedYear] || emptyTaxPlanning());
  }, [selectedPerson, selectedYear]);

  useEffect(() => {
    const t = setTimeout(() => {
      const stored = taxPlanning.people[selectedPerson]?.years?.[selectedYear];
      if (JSON.stringify(form) !== JSON.stringify(stored)) {
        onSaveYear(selectedPerson, selectedYear, form);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [form]);

  const result = useMemo(() => calcTaxPlan(form, personInsurance), [form, personInsurance]);

  const history = useMemo(
    () => yearKeys.map((y) => ({ year: y, result: calcTaxPlan(personYears[y], personInsurance) })),
    [yearKeys, personYears, personInsurance]
  );

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addPerson() {
    const name = newPersonInput.trim();
    if (!name) return;
    onAddPerson(name);
    setSelectedPerson(name);
    setNewPersonInput("");
  }

  function deletePersonHandler() {
    if (personKeys.length <= 1) return;
    onDeletePerson(selectedPerson);
  }

  function addYear() {
    const y = newYearInput.trim();
    if (!/^\d{4}$/.test(y)) return;
    if (personYears[y]) {
      setSelectedYear(y);
    } else {
      onAddYear(selectedPerson, y);
      setSelectedYear(y);
    }
    setNewYearInput("");
  }

  function deleteYear() {
    if (yearKeys.length <= 1) return;
    onDeleteYear(selectedPerson, selectedYear);
  }

  const field = (label, key, placeholder, capNote) => (
    <div>
      <label className="ui-sans text-xs block mb-1" style={{ color: C.muted }}>{label}</label>
      <input
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="mono w-full px-3 py-2 rounded text-sm bg-transparent"
        style={{ border: `1px solid ${C.border}` }}
      />
      {capNote && <div className="ui-sans text-xs mt-1" style={{ color: C.mutedLight }}>{capNote}</div>}
    </div>
  );

  const groupHeader = (label) => (
    <div className="ui-sans text-xs uppercase tracking-wide mb-3 mt-6 first:mt-0" style={{ color: C.muted }}>{label}</div>
  );

  return (
    <div className="paper-card rounded-lg p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={18} style={{ color: C.accent }} />
        <h2 className="text-xl font-medium">วางแผนภาษี</h2>
      </div>
      <div className="ui-sans text-xs mb-5 flex items-start gap-1.5" style={{ color: C.muted }}>
        <Info size={13} className="mt-0.5 flex-shrink-0" />
        ประมาณการภาษีเงินได้บุคคลธรรมดารายปีแยกตามบุคคล อ้างอิงเพดานค่าลดหย่อนตามเกณฑ์ทั่วไป
        ไม่ใช่คำแนะนำทางภาษีอย่างเป็นทางการ กรุณาตรวจสอบกับผู้เชี่ยวชาญหรือกรมสรรพากรก่อนตัดสินใจจริง
      </div>

      {/* person filter/selector */}
      <div className="ui-sans text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>บุคคล</div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {personKeys.map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPerson(p)}
            className="ui-sans px-3 py-1.5 rounded-full text-sm flex items-center gap-1 transition-colors"
            style={{
              background: p === selectedPerson ? C.ink : "transparent",
              color: p === selectedPerson ? C.paper : C.inkSoft,
              border: `1px solid ${p === selectedPerson ? C.ink : C.border}`,
            }}
          >
            <User size={12} /> {p}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-1">
          <input
            value={newPersonInput}
            onChange={(e) => setNewPersonInput(e.target.value)}
            placeholder="ชื่อคน เช่น พ่อ, แม่"
            className="ui-sans w-32 px-2 py-1.5 rounded text-sm bg-transparent"
            style={{ border: `1px solid ${C.border}` }}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
          <button
            onClick={addPerson}
            className="p-1.5 rounded ui-sans"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
            aria-label="เพิ่มบุคคล"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      {personKeys.length > 1 && (
        <button
          onClick={deletePersonHandler}
          className="ui-sans text-xs mb-5 flex items-center gap-1"
          style={{ color: C.muted }}
        >
          <Trash2 size={12} /> ลบข้อมูลภาษีทั้งหมดของ {selectedPerson}
        </button>
      )}

      {/* year history */}
      {history.length > 0 && (
        <div className="mb-5">
          <div className="ui-sans text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>ประวัติภาษีรายปีของ {selectedPerson}</div>
          <div className="rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <table className="w-full ui-sans text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.accentSoft, color: C.inkSoft }}>
                  <th className="text-left px-3 py-2 font-medium">ปีภาษี</th>
                  <th className="text-right px-3 py-2 font-medium">เงินได้รวม</th>
                  <th className="text-right px-3 py-2 font-medium">เงินได้สุทธิ</th>
                  <th className="text-right px-3 py-2 font-medium">ภาษีที่จ่าย</th>
                  <th className="text-right px-3 py-2 font-medium">อัตราเฉลี่ย</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ year, result: r }) => (
                  <tr
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className="cursor-pointer"
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      background: year === selectedYear ? C.accentSoft : "transparent",
                    }}
                  >
                    <td className="px-3 py-2 mono" style={{ color: C.ink }}>{year}</td>
                    <td className="text-right px-3 py-2 mono">฿{THB(r.income)}</td>
                    <td className="text-right px-3 py-2 mono">฿{THB(r.taxableIncome)}</td>
                    <td className="text-right px-3 py-2 mono font-medium">฿{THB(r.tax)}</td>
                    <td className="text-right px-3 py-2 mono">{(r.effectiveRate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* year selector */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {yearKeys.map((y) => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className="mono px-3 py-1.5 rounded-full text-sm transition-colors"
            style={{
              background: y === selectedYear ? C.ink : "transparent",
              color: y === selectedYear ? C.paper : C.inkSoft,
              border: `1px solid ${y === selectedYear ? C.ink : C.border}`,
            }}
          >
            {y}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-1">
          <input
            value={newYearInput}
            onChange={(e) => setNewYearInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="ปี"
            className="mono w-16 px-2 py-1.5 rounded text-sm bg-transparent"
            style={{ border: `1px solid ${C.border}` }}
            onKeyDown={(e) => e.key === "Enter" && addYear()}
          />
          <button
            onClick={addYear}
            className="p-1.5 rounded ui-sans"
            style={{ border: `1px solid ${C.border}`, color: C.inkSoft }}
            aria-label="เพิ่มปีภาษี"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      {yearKeys.length > 1 && (
        <button
          onClick={deleteYear}
          className="ui-sans text-xs mb-4 flex items-center gap-1"
          style={{ color: C.muted }}
        >
          <Trash2 size={12} /> ลบข้อมูลภาษีปี {selectedYear}
        </button>
      )}
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        {field("เงินได้รวมต่อปี (บาท)", "grossIncome", "เช่น 800000")}
        <div>
          <label className="ui-sans text-xs block mb-1" style={{ color: C.muted }}>สถานะ</label>
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded" style={{ border: `1px solid ${C.border}` }}>
            <label className="flex items-center gap-1.5 ui-sans text-xs" style={{ color: C.inkSoft }}>
              <input type="checkbox" checked={form.isSalary} onChange={(e) => set("isSalary", e.target.checked)} />
              รายได้เป็นเงินเดือน
            </label>
            <label className="flex items-center gap-1.5 ui-sans text-xs" style={{ color: C.inkSoft }}>
              <input type="checkbox" checked={form.spouse} onChange={(e) => set("spouse", e.target.checked)} />
              มีคู่สมรส (ไม่มีเงินได้)
            </label>
          </div>
        </div>
      </div>

      {/* ส่วนตัวและครอบครัว */}
      {groupHeader("ส่วนตัวและครอบครัว")}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {field("ค่าฝากครรภ์และคลอดบุตร", "pregnancyCost", "เช่น 40000", "ไม่เกิน 60,000 บาทต่อครรภ์")}
        {field("เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)", "spouseLifeInsurance", "เช่น 8000", "ไม่เกิน 10,000 บาท")}
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        {field("บุตร (คนแรก/เกิดก่อนปี 2561) คนละ 30,000", "childrenBase", "0")}
        {field("บุตรคนที่ 2+ (เกิดปี 2561+) คนละ 60,000", "childrenExtra", "0")}
        {field("บิดามารดาที่เลี้ยงดู (สูงสุด 4 คน)", "parents", "0", "คนละ 30,000 บาท")}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {field("ผู้พิการ/ทุพพลภาพที่เลี้ยงดู", "disabledCare", "0", "คนละ 60,000 บาท")}
      </div>

      {/* ประกันชีวิต/สุขภาพ */}
      {groupHeader("ประกันชีวิต/สุขภาพ")}
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {field("ประกันสังคม", "socialSecurity", "เช่น 9000", "ไม่เกิน 10,500 บาท")}
        {field("ประกันสุขภาพบิดามารดา", "parentHealthInsurance", "เช่น 15000", "ไม่เกิน 15,000 บาท")}
      </div>

      <div className="mb-3 p-3 rounded" style={{ background: C.accentSoft }}>
        <div className="flex items-center justify-between ui-sans text-xs" style={{ color: C.inkSoft }}>
          <span className="flex items-center gap-1"><ShieldCheck size={12} /> ประกันชีวิต/สุขภาพของ "{selectedPerson}" (ดึงจากโมดูลประกันอัตโนมัติ)</span>
          <span className="mono">฿{THB(result.lifeHealthTotal)}</span>
        </div>
        <div className="ui-sans text-xs mt-1" style={{ color: C.mutedLight }}>
          ต้องตั้งชื่อ "ผู้เอาประกัน" ในโมดูลประกันให้ตรงกับ "{selectedPerson}" ระบบถึงจะดึงมาคำนวณให้ —
          รวมกันหักได้ไม่เกิน 100,000 บาท (ส่วนสุขภาพหักได้ไม่เกิน 25,000 บาท) ยังหักได้อีก ฿{THB(result.lifeHealthRoomLeft)}
        </div>
      </div>

      {/* ลงทุนและเกษียณ */}
      {groupHeader("ลงทุนและเกษียณ")}
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        {field("กองทุน RMF", "rmf", "เช่น 50000", "30% ของเงินได้ ไม่เกิน 500,000")}
        {field("เบี้ยประกันชีวิตแบบบำนาญ", "pensionLifeInsurance", "เช่น 30000", "15% ของเงินได้ ไม่เกิน 200,000")}
        {field("กองทุนสำรองเลี้ยงชีพ/กบข.", "providentFund", "เช่น 50000", "15% ของเงินได้ ไม่เกิน 500,000")}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-2">
        {field("กองทุน SSF", "ssf", "เช่น 50000", "30% ของเงินได้ ไม่เกิน 200,000")}
        {field("กองทุนการออมแห่งชาติ (กอช.)", "nationalSavingsFund", "เช่น 10000", "ไม่เกิน 30,000 บาท")}
      </div>
      <div className="mb-4 ui-sans text-xs" style={{ color: C.mutedLight }}>
        กลุ่มนี้ทั้งหมด (RMF + เบี้ยบำนาญ + กองทุนสำรองเลี้ยงชีพ + SSF + กอช) รวมกันหักได้ไม่เกิน 500,000 บาท —
        ยังหักได้อีก ฿{THB(result.retirementRoomLeft)}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {field("เงินลงทุนวิสาหกิจเพื่อสังคม", "socialEnterprise", "เช่น 10000", "ไม่เกิน 30,000 บาท (แยกจากกลุ่มด้านบน)")}
        {field("กองทุน ThaiESG / ThaiESGX", "thaiEsg", "เช่น 50000", "30% ของเงินได้ ไม่เกิน 300,000 บาท (แยกจากกลุ่มด้านบน)")}
      </div>

      {/* มาตรการรัฐ */}
      {groupHeader("มาตรการรัฐ")}
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        {field("ดอกเบี้ยเงินกู้ที่อยู่อาศัย", "mortgageInterest", "เช่น 60000", "ไม่เกิน 100,000 บาท")}
        {field("ค่าซื้องานศิลปะ (2568-2570)", "artPurchase", "เช่น 20000", "ไม่เกิน 100,000 บาท")}
        {field("ติดตั้ง Solar Rooftop (2569-2571)", "solarRooftop", "เช่น 50000", "ไม่เกิน 200,000 บาท")}
      </div>

      {/* เงินบริจาค */}
      {groupHeader("เงินบริจาค")}
      <div className="grid sm:grid-cols-3 gap-3 mb-2">
        {field("บริจาคทั่วไป", "donationsGeneral", "เช่น 5000")}
        {field("บริจาคการศึกษา/กีฬา/รพ.รัฐ (e-Donation)", "donationsEDouble", "เช่น 3000", "หักได้ 2 เท่าของที่จ่ายจริง")}
        {field("บริจาคพรรคการเมือง", "donationsPolitical", "เช่น 5000", "ไม่เกิน 10,000 บาท")}
      </div>
      <div className="mb-4 ui-sans text-xs" style={{ color: C.mutedLight }}>
        บริจาคทั่วไปและ e-Donation รวมกันหักได้ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อนอื่นทั้งหมด
      </div>

      <div className="h-px my-5" style={{ background: C.border }} />

      {/* step-by-step calculation, made explicit so nothing is hidden */}
      <div className="ui-sans text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>
        ขั้นตอนคำนวณเงินได้สุทธิ
      </div>
      <div className="rounded overflow-hidden mb-6" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full ui-sans text-xs" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>เงินได้รวมต่อปี</td>
              <td className="text-right px-3 py-2 mono">฿{THB(result.income)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>
                หัก ค่าใช้จ่าย {form.isSalary ? "(50% ของเงินได้ สูงสุด 100,000 บาท)" : "(ไม่ใช่เงินเดือน หักไม่ได้)"}
              </td>
              <td className="text-right px-3 py-2 mono">-฿{THB(result.expenseDeduction)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}`, background: C.accentSoft }}>
              <td className="px-3 py-2 font-medium" style={{ color: C.inkSoft }}>เงินได้หลังหักค่าใช้จ่าย</td>
              <td className="text-right px-3 py-2 mono font-medium">฿{THB(result.netAfterExpense)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>หัก ค่าลดหย่อนส่วนตัว (คิดให้อัตโนมัติทุกกรณี)</td>
              <td className="text-right px-3 py-2 mono">-฿{THB(result.personal)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td className="px-3 py-2" style={{ color: C.inkSoft }}>หัก ค่าลดหย่อนอื่นๆ ทั้งหมด (คู่สมรส บุตร ประกัน กองทุน ฯลฯ)</td>
              <td className="text-right px-3 py-2 mono">-฿{THB(result.totalDeductions - result.personal)}</td>
            </tr>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.accentSoft }}>
              <td className="px-3 py-2 font-medium" style={{ color: C.inkSoft }}>ค่าลดหย่อนรวมทั้งหมด (รวมส่วนตัว)</td>
              <td className="text-right px-3 py-2 mono font-medium">฿{THB(result.totalDeductions)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}`, background: C.ink, color: C.paper }}>
              <td className="px-3 py-2 font-medium">เงินได้สุทธิ (ฐานภาษี)</td>
              <td className="text-right px-3 py-2 mono font-medium">฿{THB(result.taxableIncome)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* result summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>ค่าลดหย่อนรวม (รวมส่วนตัว 60,000)</div>
          <div className="mono text-lg font-medium">฿{THB(result.totalDeductions)}</div>
        </div>
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>เงินได้สุทธิ (ฐานภาษี)</div>
          <div className="mono text-lg font-medium">฿{THB(result.taxableIncome)}</div>
        </div>
        <div className="px-3 py-2.5 rounded" style={{ background: C.ink, color: C.paper }}>
          <div className="ui-sans text-xs" style={{ color: C.mutedLight }}>ภาษีที่ต้องจ่าย (ประมาณ)</div>
          <div className="mono text-lg font-medium">฿{THB(result.tax)}</div>
        </div>
        <div className="px-3 py-2.5 rounded" style={{ background: C.accentSoft }}>
          <div className="ui-sans text-xs" style={{ color: C.inkSoft }}>อัตราภาษีเฉลี่ย / ขั้นสูงสุด</div>
          <div className="mono text-lg font-medium">
            {(result.effectiveRate * 100).toFixed(1)}% / {(result.marginal * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* bracket-by-bracket breakdown */}
      <div className="ui-sans text-xs uppercase tracking-wide mb-2" style={{ color: C.muted }}>
        การคำนวณตามขั้นบันไดภาษี (เงินได้สุทธิ ฿{THB(result.taxableIncome)})
      </div>
      <div className="rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full ui-sans text-xs" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.accentSoft, color: C.inkSoft }}>
              <th className="text-left px-3 py-2 font-medium">ช่วงเงินได้สุทธิ (บาท)</th>
              <th className="text-right px-3 py-2 font-medium">อัตรา</th>
              <th className="text-right px-3 py-2 font-medium">เงินได้ในช่วงนี้</th>
              <th className="text-right px-3 py-2 font-medium">ภาษีในช่วงนี้</th>
            </tr>
          </thead>
          <tbody>
            {result.brackets.map((b, i) => {
              const active = b.amountInBracket > 0;
              return (
                <tr
                  key={i}
                  style={{
                    borderTop: `1px solid ${C.border}`,
                    color: active ? C.ink : C.mutedLight,
                    background: active ? C.paper : "transparent",
                  }}
                >
                  <td className="px-3 py-2">{b.rangeLabel}</td>
                  <td className="text-right px-3 py-2 mono">{(b.rate * 100).toFixed(0)}%</td>
                  <td className="text-right px-3 py-2 mono">{active ? `฿${THB(b.amountInBracket)}` : "-"}</td>
                  <td className="text-right px-3 py-2 mono">{active ? `฿${THB(b.taxInBracket)}` : "-"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, background: C.accentSoft }}>
              <td className="px-3 py-2 ui-sans font-medium" colSpan={3} style={{ color: C.inkSoft }}>รวมภาษีที่ต้องจ่าย</td>
              <td className="text-right px-3 py-2 mono font-medium">฿{THB(result.tax)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
