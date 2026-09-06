import ExcelJS from "exceljs";
import { calcAge } from "./utils";

export type ExportStudentRow = {
  fullName: string;
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

export async function buildVisitationWorkbook(churchName: string, rows: ExportStudentRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tayoo Church Platform";
  wb.created = new Date();

  const sheet = wb.addWorksheet("شيت الافتقاد", {
    views: [{ rightToLeft: true }],
  });

  sheet.columns = [
    { header: "الاسم الرباعي", key: "fullName", width: 32 },
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
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 12 };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  header.alignment = { horizontal: "center", vertical: "middle" };
  header.height = 28;

  rows.forEach((r, i) => {
    const row = sheet.addRow({
      fullName: r.fullName,
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
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F6FB" },
      };
    }
    const pointsCell = row.getCell("totalPoints");
    pointsCell.font = { bold: true, color: { argb: "FFB45309" } };
    pointsCell.alignment = { horizontal: "center" };
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 10 },
  };

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
