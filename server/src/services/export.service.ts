import ExcelJS from 'exceljs';
import { IComplaint } from '../models/Complaint';
import { ComplaintStatus } from '../types/enums';

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  NEW: 'New',
  ACCEPTED: 'Accepted',
  VISIT_SCHEDULED: 'Visit Scheduled',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_PARTS: 'Waiting for Parts',
  RESOLVED_BY_INSTALLER: 'Resolved by Installer',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

const IST = 'Asia/Kolkata';
const fmtDate = (d?: Date | null) =>
  d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST }) : '';
const fmtDateTime = (d?: Date | null) =>
  d
    ? d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: IST,
      })
    : '';

// The last five columns are left empty on purpose: the installer fills them in
// and sends the sheet back (or reads them out on the phone), and the office
// enters the result against the complaint.
const COLUMNS: { header: string; width: number; fill?: boolean }[] = [
  { header: 'Sr', width: 5 },
  { header: 'Complaint No', width: 16 },
  { header: 'Complaint Date', width: 14 },
  { header: 'Priority', width: 10 },
  { header: 'Customer Name', width: 22 },
  { header: 'Mobile', width: 13 },
  { header: 'Address', width: 30 },
  { header: 'Village / City', width: 18 },
  { header: 'Project ID', width: 13 },
  { header: 'System (kW)', width: 11 },
  { header: 'Installed On', width: 13 },
  { header: 'Category', width: 24 },
  { header: 'Complaint Description', width: 46 },
  { header: 'Status', width: 18 },
  { header: 'Due By', width: 20 },
  { header: 'Visit Date', width: 14, fill: true },
  { header: 'Problem Found', width: 28, fill: true },
  { header: 'Work Done', width: 28, fill: true },
  { header: 'Parts Used', width: 22, fill: true },
  { header: 'Installer Remarks', width: 26, fill: true },
];

const PRIORITY_FILL: Record<string, string> = {
  CRITICAL: 'FFF4C7C3',
  HIGH: 'FFFAD9B8',
  NORMAL: 'FFFDF0BF',
  LOW: 'FFD9EAD3',
};

const thin = { style: 'thin' as const, color: { argb: 'FFBFB5AA' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

/** Builds the sheet the office sends to an installer: one row per complaint, ready to print or forward. */
export async function buildInstallerSheet(params: {
  installerName: string;
  periodLabel: string;
  complaints: IComplaint[];
}): Promise<Buffer> {
  const { installerName, periodLabel, complaints } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Solar Coop';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Complaints', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }],
  });
  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));

  sheet.mergeCells(1, 1, 1, COLUMNS.length);
  sheet.getCell(1, 1).value = `THE SOLAR COOP - Service Complaints for ${installerName}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, COLUMNS.length);
  sheet.getCell(2, 1).value =
    `${periodLabel}   |   ${complaints.length} complaint${complaints.length === 1 ? '' : 's'}   |   Generated ${fmtDateTime(new Date())}`;
  sheet.getCell(2, 1).font = { size: 10, color: { argb: 'FF6B5E52' } };

  const header = sheet.getRow(4);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.fill ? 'FF2F6B1F' : 'FFC9601A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = border;
  });
  header.height = 30;

  complaints.forEach((c, index) => {
    const s = c.customerSnapshot;
    const row = sheet.addRow([
      index + 1,
      c.complaintNumber,
      fmtDate(c.createdAt),
      c.priority.charAt(0) + c.priority.slice(1).toLowerCase(),
      s.name,
      s.mobile,
      s.address ?? '',
      s.cityVillage ?? '',
      s.projectId ?? '',
      s.systemSizeKw ?? '',
      fmtDate(s.installationDate),
      c.category === 'Other' && c.categoryOther ? `Other: ${c.categoryOther}` : c.category,
      c.description,
      STATUS_LABEL[c.status],
      fmtDateTime(c.dueDate),
      c.scheduledVisit ? fmtDateTime(c.scheduledVisit.at) : '',
      '',
      '',
      '',
      '',
    ]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = border;
      if (col === 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIORITY_FILL[c.priority] } };
    });
    // Tall enough to hand-write in the fill-in columns when printed.
    row.height = Math.max(48, Math.ceil(c.description.length / 44) * 15);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
