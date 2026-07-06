/**
 * Networth Ledger — Google Sheets backend
 * -----------------------------------------
 * Paste this whole file into the Apps Script editor of a Google Sheet
 * (Extensions > Apps Script), then deploy it as a Web App.
 * See ../README.md for full step-by-step setup instructions.
 *
 * Data model:
 *   - "Assets" sheet      : one row per asset, tagged with its quarter (period)
 *   - "Liabilities" sheet : one row per liability, tagged with its quarter
 *   - "Insurance" sheet   : one row per insurance policy (not period-scoped)
 *   - "Tax" sheet         : one row per tax year (personal income tax planner)
 *
 * The web app exposes:
 *   GET  ?           -> returns the whole ledger as JSON
 *   POST (JSON body) -> replaces all rows with the posted ledger (full sync)
 */

var ASSET_HEADERS = ["id", "period", "name", "amount", "owner", "goalName", "goal", "dcaEnabled", "dcaAmount", "dcaFrequency"];
var LIAB_HEADERS = ["id", "period", "name", "amount", "owner"];
var INS_HEADERS = ["id", "category", "policyName", "insurer", "policyNumber", "person", "assetName", "coverageAmount", "premium", "premiumFrequency", "startDate", "endDate", "notes"];
var TAX_HEADERS = [
  "year", "grossIncome", "isSalary", "spouse", "spouseLifeInsurance", "pregnancyCost",
  "childrenBase", "childrenExtra", "parents", "disabledCare", "socialSecurity",
  "parentHealthInsurance", "pensionLifeInsurance", "providentFund", "nationalSavingsFund",
  "rmf", "ssf", "socialEnterprise", "thaiEsg", "mortgageInterest", "artPurchase",
  "solarRooftop", "donationsGeneral", "donationsEDouble", "donationsPolitical"
];

function doGet(e) {
  var out = ContentService.createTextOutput(JSON.stringify(loadData()));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  saveData(payload);
  var out = ContentService.createTextOutput(JSON.stringify({ ok: true }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function readRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    if (row.id) rows.push(row);
  }
  return rows;
}

function readRowsByKey_(sheet, keyField) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) {
      row[headers[c]] = values[i][c];
    }
    if (row[keyField] !== "" && row[keyField] !== null && row[keyField] !== undefined) rows.push(row);
  }
  return rows;
}

function clearRows_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
}

function toStrOrEmpty_(v) {
  return v === null || v === undefined ? "" : String(v);
}

function toNumOrNull_(v) {
  return v === "" || v === null || v === undefined ? null : Number(v);
}

function toBool_(v) {
  return v === true || String(v).toUpperCase() === "TRUE";
}

function loadData() {
  var assetsSheet = getSheet_("Assets", ASSET_HEADERS);
  var liabSheet = getSheet_("Liabilities", LIAB_HEADERS);
  var insSheet = getSheet_("Insurance", INS_HEADERS);
  var taxSheet = getSheet_("Tax", TAX_HEADERS);

  var periods = {};

  readRows_(assetsSheet).forEach(function (r) {
    var p = String(r.period);
    if (!periods[p]) periods[p] = { assets: [], liabilities: [] };
    periods[p].assets.push({
      id: String(r.id),
      name: r.name,
      amount: Number(r.amount) || 0,
      owner: r.owner || null,
      goalName: r.goalName || null,
      goal: toNumOrNull_(r.goal),
      dca: toBool_(r.dcaEnabled)
        ? { amount: Number(r.dcaAmount) || 0, frequency: r.dcaFrequency || "month" }
        : null,
    });
  });

  readRows_(liabSheet).forEach(function (r) {
    var p = String(r.period);
    if (!periods[p]) periods[p] = { assets: [], liabilities: [] };
    periods[p].liabilities.push({
      id: String(r.id),
      name: r.name,
      amount: Number(r.amount) || 0,
      owner: r.owner || null,
    });
  });

  var insurance = readRows_(insSheet).map(function (r) {
    return {
      id: String(r.id),
      category: r.category,
      policyName: r.policyName,
      insurer: r.insurer,
      policyNumber: r.policyNumber || null,
      person: r.person || null,
      assetName: r.assetName || null,
      coverageAmount: toNumOrNull_(r.coverageAmount),
      premium: toNumOrNull_(r.premium),
      premiumFrequency: r.premiumFrequency || "year",
      startDate: r.startDate ? formatDate_(r.startDate) : null,
      endDate: r.endDate ? formatDate_(r.endDate) : null,
      notes: r.notes || null,
    };
  });

  var taxYears = {};
  readRowsByKey_(taxSheet, "year").forEach(function (r) {
    var y = String(r.year);
    taxYears[y] = {
      grossIncome: toStrOrEmpty_(r.grossIncome),
      isSalary: toBool_(r.isSalary),
      spouse: toBool_(r.spouse),
      spouseLifeInsurance: toStrOrEmpty_(r.spouseLifeInsurance),
      pregnancyCost: toStrOrEmpty_(r.pregnancyCost),
      childrenBase: toStrOrEmpty_(r.childrenBase) || "0",
      childrenExtra: toStrOrEmpty_(r.childrenExtra) || "0",
      parents: toStrOrEmpty_(r.parents) || "0",
      disabledCare: toStrOrEmpty_(r.disabledCare) || "0",
      socialSecurity: toStrOrEmpty_(r.socialSecurity),
      parentHealthInsurance: toStrOrEmpty_(r.parentHealthInsurance),
      pensionLifeInsurance: toStrOrEmpty_(r.pensionLifeInsurance),
      providentFund: toStrOrEmpty_(r.providentFund),
      nationalSavingsFund: toStrOrEmpty_(r.nationalSavingsFund),
      rmf: toStrOrEmpty_(r.rmf),
      ssf: toStrOrEmpty_(r.ssf),
      socialEnterprise: toStrOrEmpty_(r.socialEnterprise),
      thaiEsg: toStrOrEmpty_(r.thaiEsg),
      mortgageInterest: toStrOrEmpty_(r.mortgageInterest),
      artPurchase: toStrOrEmpty_(r.artPurchase),
      solarRooftop: toStrOrEmpty_(r.solarRooftop),
      donationsGeneral: toStrOrEmpty_(r.donationsGeneral),
      donationsEDouble: toStrOrEmpty_(r.donationsEDouble),
      donationsPolitical: toStrOrEmpty_(r.donationsPolitical),
    };
  });

  return { periods: periods, insurance: insurance, taxPlanning: { years: taxYears } };
}

function formatDate_(value) {
  // dates read back from Sheets may come in as JS Date objects
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value);
}

function saveData(data) {
  var assetsSheet = getSheet_("Assets", ASSET_HEADERS);
  var liabSheet = getSheet_("Liabilities", LIAB_HEADERS);
  var insSheet = getSheet_("Insurance", INS_HEADERS);
  var taxSheet = getSheet_("Tax", TAX_HEADERS);

  clearRows_(assetsSheet);
  clearRows_(liabSheet);
  clearRows_(insSheet);
  clearRows_(taxSheet);

  var periods = data.periods || {};
  Object.keys(periods).forEach(function (period) {
    var p = periods[period];
    (p.assets || []).forEach(function (a) {
      assetsSheet.appendRow([
        a.id,
        period,
        a.name,
        a.amount,
        a.owner || "",
        a.goalName || "",
        a.goal === null || a.goal === undefined ? "" : a.goal,
        a.dca ? true : false,
        a.dca ? a.dca.amount : "",
        a.dca ? a.dca.frequency : "",
      ]);
    });
    (p.liabilities || []).forEach(function (l) {
      liabSheet.appendRow([l.id, period, l.name, l.amount, l.owner || ""]);
    });
  });

  (data.insurance || []).forEach(function (ins) {
    insSheet.appendRow([
      ins.id,
      ins.category,
      ins.policyName,
      ins.insurer,
      ins.policyNumber || "",
      ins.person || "",
      ins.assetName || "",
      ins.coverageAmount === null || ins.coverageAmount === undefined ? "" : ins.coverageAmount,
      ins.premium === null || ins.premium === undefined ? "" : ins.premium,
      ins.premiumFrequency || "",
      ins.startDate || "",
      ins.endDate || "",
      ins.notes || "",
    ]);
  });

  var taxYears = (data.taxPlanning && data.taxPlanning.years) || {};
  Object.keys(taxYears).forEach(function (year) {
    var t = taxYears[year];
    taxSheet.appendRow([
      year,
      t.grossIncome || "",
      t.isSalary ? true : false,
      t.spouse ? true : false,
      t.spouseLifeInsurance || "",
      t.pregnancyCost || "",
      t.childrenBase || "0",
      t.childrenExtra || "0",
      t.parents || "0",
      t.disabledCare || "0",
      t.socialSecurity || "",
      t.parentHealthInsurance || "",
      t.pensionLifeInsurance || "",
      t.providentFund || "",
      t.nationalSavingsFund || "",
      t.rmf || "",
      t.ssf || "",
      t.socialEnterprise || "",
      t.thaiEsg || "",
      t.mortgageInterest || "",
      t.artPurchase || "",
      t.solarRooftop || "",
      t.donationsGeneral || "",
      t.donationsEDouble || "",
      t.donationsPolitical || "",
    ]);
  });
}
