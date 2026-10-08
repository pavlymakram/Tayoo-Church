import ExcelJS from "exceljs";
import { calcAge } from "./utils";
import type { ExportPayload, ExportPerson, ExportSection } from "./report";

const NAVY = "FF1E3A5F";
const GOLD = "FFB45309";
const SOFT = "FFF3F6FB";
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };

const SHEET_VIEW = { rightToLeft: true } as const;
/** Attendance grids never exceed a full year of Fridays. */
const MAX_FRIDAY_COLUMNS = 53;

export const PERSON_HEADERS = [
  "الفصل / الصف",
  "الاسم الرباعي",
  "اسم المستخدم",
  "الرقم السري",
  "الدور",
  "المرحلة",
  "رقم الموبايل",
  "رقم ولي الأمر",
  "العنوان",
  "السن",
  "أب الاعتراف",
  "وظيفة الأب",
  "وظيفة الأم",
  "إجمالي طايو",
  "أيام القداس (جمعة)",
  "عدد القداس",
  "أيام الحضور (جمعة)",
  "عدد الحضور",
] as const;

const COLUMN_WIDTHS = [16, 30, 26, 14, 14, 14, 15, 15, 28, 7, 16, 14, 14, 12, 34, 10, 34, 10];

function stylesheet(sheet: ExcelJS.Worksheet, columns: number) {
  sheet.views = [{ ...SHEET_VIEW, state: "frozen", xSplit: 0, ySplit: 0 }];
  for (let index = 1; index <= columns; index += 1) {
    sheet.getColumn(index).width = COLUMN_WIDTHS[index - 1] ?? 14;
  }
}

function writeHeaderRow(sheet: ExcelJS.Worksheet, values: readonly string[]) {
  const row = sheet.addRow([...values]);
  row.font = HEADER_FONT;
  row.height = 26;
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });
  return row;
}

/** Merged, church-branded header block placed at the very top of a sheet. */
function writeChurchHeader(sheet: ExcelJS.Worksheet, payload: ExportPayload, subtitle: string) {
  const columns = PERSON_HEADERS.length;
  const title = sheet.addRow([`كنيسة ${payload.church.name}`]);
  sheet.mergeCells(title.number, 1, title.number, columns);
  title.font = { bold: true, size: 16, color: { argb: NAVY }, name: "Arial" };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.height = 30;

  const line = sheet.addRow([`${subtitle} — ${payload.scopeLabel}`]);
  sheet.mergeCells(line.number, 1, line.number, columns);
  line.font = { bold: true, size: 12, color: { argb: GOLD }, name: "Arial" };
  line.alignment = { horizontal: "center", vertical: "middle" };

  const meta = sheet.addRow([
    `كود الكنيسة: ${payload.church.abbreviation} — تاريخ التصدير: ${payload.generatedAt.toLocaleDateString("en-GB")} — سجل الحضور يشمل أيام الجمعة للقداس (القداس الإلهي) والخدمة`,
  ]);
  sheet.mergeCells(meta.number, 1, meta.number, columns);
  meta.font = { size: 10, color: { argb: "FF475569" }, name: "Arial" };
  meta.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  sheet.addRow([]);
}

function personRow(member: ExportPerson, phaseName: string) {
  return [
    member.className ?? "بدون فصل",
    member.fullName,
    member.username ?? "",
    member.initialPassword ?? "",
    member.roleLabel,
    phaseName,
    member.phone,
    member.secondaryPhone ?? "",
    member.address ?? "",
    member.age ?? "",
    member.confessionFather ?? "",
    member.fatherJob ?? "",
    member.motherJob ?? "",
    member.totalPoints,
    member.liturgyDates.join(" ، "),
    member.liturgyDates.length,
    member.serviceDates.join(" ، "),
    member.serviceDates.length,
  ];
}

/** Writes one stage block: class label, header row, members, class totals. */
function writeSectionBlock(sheet: ExcelJS.Worksheet, section: ExportSection) {
  const columns = PERSON_HEADERS.length;
  const groups = [...section.classes, { name: "بدون فصل", members: section.unassigned }];

  const label = sheet.addRow([
    `المرحلة: ${section.name} (${section.abbreviation}) — القطاع: ${section.sectorName} — الخدام: ${section.servantCount} · المخدومون: ${section.studentCount} · الفصول: ${section.classes.length}`,
  ]);
  sheet.mergeCells(label.number, 1, label.number, columns);
  label.font = { bold: true, size: 13, color: { argb: NAVY }, name: "Arial" };
  label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
  label.alignment = { horizontal: "center", vertical: "middle" };
  label.height = 24;

  for (const group of groups) {
    if (group.name === "بدون فصل" && group.members.length === 0) continue;

    const classRow = sheet.addRow([
      `الفصل: ${group.name} — الخدام: ${group.members.filter((m) => m.role !== "STUDENT").length} · المخدومون: ${group.members.filter((m) => m.role === "STUDENT").length}`,
    ]);
    sheet.mergeCells(classRow.number, 1, classRow.number, columns);
    classRow.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
    classRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    classRow.alignment = { horizontal: "right", vertical: "middle" };
    classRow.height = 22;

    writeHeaderRow(sheet, PERSON_HEADERS);

    group.members.forEach((member, index) => {
      const row = sheet.addRow(personRow(member, section.name));
      row.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
        });
      }
      row.getCell(14).font = { bold: true, color: { argb: GOLD } };
      row.getCell(14).alignment = { horizontal: "center" };
    });

    if (group.members.length === 0) {
      const empty = sheet.addRow(["لا يوجد أعضاء في هذا الفصل"]);
      sheet.mergeCells(empty.number, 1, empty.number, columns);
      empty.alignment = { horizontal: "center" };
    }

    sheet.addRow([]);
  }
}

function uniqueSheetName(wb: ExcelJS.Workbook, base: string, used: Set<string>) {
  const clean = base.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 26) || "ورقة";
  let name = clean;
  let counter = 2;
  while (used.has(name) || wb.getWorksheet(name)) {
    name = `${clean.slice(0, 24)} ${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}

function sectionMembers(section: ExportSection) {
  return [...section.classes.flatMap((group) => group.members), ...section.unassigned];
}

function fridayUnion(section: ExportSection, kind: "LITURGY" | "SERVICE") {
  const dates = new Set<string>();
  for (const member of sectionMembers(section)) {
    for (const date of kind === "LITURGY" ? member.liturgyDates : member.serviceDates) dates.add(date);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

/**
 * Attendance grid: one row per student, one column per Friday with "✓" when present.
 * Liturgy (القداس) and Service (الخدمة) are always written on separate sheets.
 */
function writeAttendanceGrid(
  wb: ExcelJS.Workbook,
  payload: ExportPayload,
  sections: ExportSection[],
  kind: "LITURGY" | "SERVICE",
  used: Set<string>
) {
  const label = kind === "LITURGY" ? "سجل حضور القداس (القداس الإلهي)" : "سجل حضور الخدمة";
  const sheetName = uniqueSheetName(wb, kind === "LITURGY" ? "سجل القداس" : "سجل الحضور", used);
  const sheet = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
  const dates = payload.fridays.slice(-MAX_FRIDAY_COLUMNS);

  const title = sheet.addRow([`كنيسة ${payload.church.name} — ${label} — ${payload.scopeLabel}`]);
  sheet.mergeCells(title.number, 1, title.number, 3 + dates.length);
  title.font = { bold: true, size: 14, color: { argb: NAVY }, name: "Arial" };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.height = 28;

  const header = sheet.addRow(["المرحلة", "الفصل / الصف", "الاسم الرباعي", ...dates]);
  header.font = HEADER_FONT;
  header.height = 30;
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });

  sheet.getColumn(1).width = 16;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 30;
  for (let index = 0; index < dates.length; index += 1) sheet.getColumn(4 + index).width = 12;

  for (const section of sections) {
    const students = sectionMembers(section).filter((member) => member.role === "STUDENT");
    for (const student of students) {
      const attended = new Set(kind === "LITURGY" ? student.liturgyDates : student.serviceDates);
      const row = sheet.addRow([
        section.name,
        student.className ?? "بدون فصل",
        student.fullName,
        ...dates.map((date) => (attended.has(date) ? "✓" : "")),
      ]);
      row.alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
      row.eachCell((cell, col) => {
        if (col > 3 && cell.value === "✓") cell.font = { bold: true, color: { argb: "FF047857" } };
      });
    }
  }

  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: header.number, xSplit: 3 }];
  return sheet;
}

function writeSummarySheet(wb: ExcelJS.Workbook, payload: ExportPayload, used: Set<string>) {
  const sheet = wb.addWorksheet(uniqueSheetName(wb, "ملخص الكنيسة", used), { views: [{ rightToLeft: true }] });
  const columns = ["المرحلة", "كود المرحلة", "القطاع", "عدد الفصول", "الخدام", "المخدومون", "أيام القداس", "أيام الحضور"];

  const title = sheet.addRow([`كنيسة ${payload.church.name} — ${payload.scopeLabel}`]);
  sheet.mergeCells(title.number, 1, title.number, columns.length);
  title.font = { bold: true, size: 14, color: { argb: NAVY }, name: "Arial" };
  title.alignment = { horizontal: "center", vertical: "middle" };

  const header = sheet.addRow(columns);
  header.font = HEADER_FONT;
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });

  columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = index === 0 ? 18 : 14;
  });

  let servants = 0;
  let students = 0;
  for (const section of payload.sections) {
    servants += section.servantCount;
    students += section.studentCount;
    const row = sheet.addRow([
      section.name,
      section.abbreviation,
      section.sectorName,
      section.classes.length,
      section.servantCount,
      section.studentCount,
      fridayUnion(section, "LITURGY").length,
      fridayUnion(section, "SERVICE").length,
    ]);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.getCell(1).alignment = { horizontal: "right" };
  }

  sheet.addRow([]);
  const totals = sheet.addRow([
    "الإجمالي",
    "",
    "",
    payload.sections.reduce((a, s) => a + s.classes.length, 0),
    servants,
    students,
    payload.fridays.length,
    payload.fridays.length,
  ]);
  totals.font = { bold: true, color: { argb: GOLD } };
  totals.alignment = { horizontal: "center" };
  totals.getCell(1).alignment = { horizontal: "right" };
  return sheet;
}

function createWorkbook(payload: ExportPayload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tayoo Church Platform";
  wb.created = payload.generatedAt;
  return wb;
}


/**
 * Church-admin export: a workbook covering every church stage in sequential order
 * (KG1, KG2, 1 ابتدائي … 3 ثانوي, جامعي, خريج), including all servants, students,
 * classes and the Friday Liturgy/Service attendance logs with exact DD/MM/YYYY dates.
 */
export async function buildChurchWorkbook(payload: ExportPayload) {
  const wb = createWorkbook(payload);
  const used = new Set<string>();

  writeSummarySheet(wb, payload, used);

  for (const section of payload.sections) {
    const sheet = wb.addWorksheet(uniqueSheetName(wb, section.name, used), { views: [{ rightToLeft: true }] });
    stylesheet(sheet, PERSON_HEADERS.length);
    writeChurchHeader(sheet, payload, `تقرير مرحلة ${section.name}`);
    writeSectionBlock(sheet, section);
  }

  writeAttendanceGrid(wb, payload, payload.sections, "LITURGY", used);
  writeAttendanceGrid(wb, payload, payload.sections, "SERVICE", used);

  return wb.xlsx.writeBuffer();
}

/**
 * Phase-admin / phase-servant export: only the assigned sector or stage, with the
 * church name as the top header, grouped by classes (فصول), containing the servants,
 * students and both Friday attendance logs.
 */
export async function buildScopeWorkbook(payload: ExportPayload) {
  const wb = createWorkbook(payload);
  const used = new Set<string>();

  const sheet = wb.addWorksheet(uniqueSheetName(wb, payload.scope === "sector" ? "تقرير القطاع" : "تقرير المرحلة", used), {
    views: [{ rightToLeft: true }],
  });
  stylesheet(sheet, PERSON_HEADERS.length);
  writeChurchHeader(sheet, payload, "تقرير الحضور والافتقاد");

  for (const section of payload.sections) {
    writeSectionBlock(sheet, section);
  }

  writeAttendanceGrid(wb, payload, payload.sections, "LITURGY", used);
  writeAttendanceGrid(wb, payload, payload.sections, "SERVICE", used);

  return wb.xlsx.writeBuffer();
}

export type ExportStudentRow = {
  fullName: string;
  username?: string | null;
  initialPassword?: string | null;
  birthDate: Date | null;
  grade: string | null;
  phone: string;
  secondaryPhone: string | null;
  address: string | null;
  confessionFather: string | null;
  fatherJob: string | null;
  motherJob: string | null;
  totalPoints: number;
};

/** Simple visitation sheet used by the legacy /api/export/visitation endpoint. */
export async function buildVisitationWorkbook(churchName: string, rows: ExportStudentRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tayoo Church Platform";
  wb.created = new Date();

  const sheet = wb.addWorksheet("شيت الافتقاد", { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: "الاسم الرباعي", key: "fullName", width: 32 },
    { header: "اسم المستخدم", key: "username", width: 26 },
    { header: "الرقم السري", key: "initialPassword", width: 14 },
    { header: "السن", key: "age", width: 8 },
    { header: "المرحلة الدراسية", key: "grade", width: 16 },
    { header: "رقم الموبايل", key: "phone", width: 16 },
    { header: "رقم ولي الأمر", key: "secondaryPhone", width: 16 },
    { header: "العنوان", key: "address", width: 36 },
    { header: "أب الاعتراف", key: "confessionFather", width: 18 },
    { header: "وظيفة الأب", key: "fatherJob", width: 16 },
    { header: "وظيفة الأم", key: "motherJob", width: 16 },
    { header: "إجمالي النقط", key: "totalPoints", width: 14 },
  ];

  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 28;

  rows.forEach((r, i) => {
    const row = sheet.addRow({
      fullName: r.fullName,
      username: r.username ?? "",
      initialPassword: r.initialPassword ?? "",
      age: calcAge(r.birthDate) ?? "",
      grade: r.grade ?? "",
      phone: r.phone,
      secondaryPhone: r.secondaryPhone ?? "",
      address: r.address ?? "",
      confessionFather: r.confessionFather ?? "",
      fatherJob: r.fatherJob ?? "",
      motherJob: r.motherJob ?? "",
      totalPoints: r.totalPoints,
    });
    row.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      });
    }
    const pointsCell = row.getCell("totalPoints");
    pointsCell.font = { bold: true, color: { argb: GOLD } };
    pointsCell.alignment = { horizontal: "center" };
  });

  const meta = wb.addWorksheet("معلومات", { views: [{ rightToLeft: true }] });
  meta.columns = [
    { header: "الحقل", key: "k", width: 24 },
    { header: "القيمة", key: "v", width: 40 },
  ];
  meta.addRow({ k: "الكنيسة", v: churchName });
  meta.addRow({ k: "تاريخ التصدير", v: new Date().toLocaleString("ar-EG") });
  meta.addRow({ k: "عدد المخدومين", v: rows.length });
  meta.addRow({ k: "المصدر", v: "طايو — نظام إدارة الخدمة والنقاط" });

  return wb.xlsx.writeBuffer();
}

