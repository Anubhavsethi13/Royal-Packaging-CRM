import { EtimeOfficeError } from "./etime-office-errors.js";
import { parseClockTime, parseDateString, parseDurationMinutes, parsePunchDate } from "./etime-office-dates.js";
import type {
  DownloadInOutPunchDataResponse,
  DownloadLastPunchDataResponse,
  DownloadPunchDataMcidResponse,
  DownloadPunchDataResponse
} from "./etime-office-schemas.js";

export type PunchSource = "DownloadPunchData" | "DownloadPunchDataMCID" | "DownloadLastPunchData";

/** A provider punch in CRM terms. `employeeCode` is the provider `Empcode`, unchanged. */
export interface MappedPunch {
  readonly employeeCode: string;
  /** Provider wall-clock time `YYYY-MM-DD HH:mm:ss`. */
  readonly punchedAtLocal: string;
  readonly machineId: string | null;
  readonly machineFlag: string | null;
  readonly externalRecordId: number | null;
  readonly externalTable: string | null;
  readonly empCardNo: string | null;
  readonly providerEmployeeName: string | null;
  readonly source: PunchSource;
}

export interface MappedDailyAttendance {
  readonly employeeCode: string;
  /** `YYYY-MM-DD`. */
  readonly attendanceDate: string;
  /** `HH:mm:00`, or null for `--:--`. */
  readonly inTime: string | null;
  readonly outTime: string | null;
  readonly workMinutes: number | null;
  readonly overtimeMinutes: number | null;
  readonly lateInMinutes: number | null;
  readonly earlyOutMinutes: number | null;
  readonly status: string | null;
  readonly remark: string | null;
  readonly providerEmployeeName: string | null;
  /** Original provider values, kept because `--:--` is stored as NULL. */
  readonly rawInTime: string;
  readonly rawOutTime: string;
}

function punchTime(endpoint: string, value: string): string {
  const parsed = parsePunchDate(value);
  if (!parsed) {
    throw new EtimeOfficeError("INVALID_RESPONSE", endpoint, `${endpoint}: PunchDate is not a valid dd/MM/yyyy HH:mm:ss date-time.`, 200);
  }
  return parsed;
}

const textOrNull = (value: string | null | undefined): string | null => (value === undefined || value === null || value === "" ? null : value);

export function mapPunchData(response: DownloadPunchDataResponse): MappedPunch[] {
  return response.map((row) => ({
    employeeCode: row.Empcode,
    punchedAtLocal: punchTime("DownloadPunchData", row.PunchDate),
    machineId: null,
    machineFlag: null,
    externalRecordId: null,
    externalTable: null,
    empCardNo: null,
    providerEmployeeName: null,
    source: "DownloadPunchData"
  }));
}

export function mapPunchDataMcid(response: DownloadPunchDataMcidResponse): MappedPunch[] {
  return response.PunchData.map((row) => ({
    employeeCode: row.Empcode,
    punchedAtLocal: punchTime("DownloadPunchDataMCID", row.PunchDate),
    machineId: row.mcid === undefined || row.mcid === null ? null : String(row.mcid),
    machineFlag: textOrNull(row.M_Flag),
    externalRecordId: null,
    externalTable: null,
    empCardNo: null,
    providerEmployeeName: textOrNull(row.Name),
    source: "DownloadPunchDataMCID"
  }));
}

export function mapLastPunchData(response: DownloadLastPunchDataResponse): MappedPunch[] {
  return response.PunchData.map((row) => ({
    employeeCode: row.Empcode,
    punchedAtLocal: punchTime("DownloadLastPunchData", row.PunchDate),
    machineId: null,
    machineFlag: textOrNull(row.M_Flag),
    externalRecordId: row.ID,
    externalTable: row.Table,
    empCardNo: textOrNull(row.EmpcardNo),
    providerEmployeeName: textOrNull(row.Name),
    source: "DownloadLastPunchData"
  }));
}

export function mapInOutPunchData(response: DownloadInOutPunchDataResponse): MappedDailyAttendance[] {
  const endpoint = "DownloadInOutPunchData";
  return response.InOutPunchData.map((row) => {
    const attendanceDate = parseDateString(row.DateString);
    if (!attendanceDate) {
      throw new EtimeOfficeError("INVALID_RESPONSE", endpoint, `${endpoint}: DateString is not a valid dd/MM/yyyy date.`, 200);
    }
    try {
      return {
        employeeCode: row.Empcode,
        attendanceDate,
        inTime: parseClockTime(row.INTime),
        outTime: parseClockTime(row.OUTTime),
        workMinutes: parseDurationMinutes(row.WorkTime),
        overtimeMinutes: parseDurationMinutes(row.OverTime),
        lateInMinutes: parseDurationMinutes(row.Late_In),
        earlyOutMinutes: parseDurationMinutes(row.Erl_Out),
        status: textOrNull(row.Status),
        remark: textOrNull(row.Remark),
        providerEmployeeName: textOrNull(row.Name),
        rawInTime: row.INTime,
        rawOutTime: row.OUTTime
      };
    } catch (error) {
      throw new EtimeOfficeError("INVALID_RESPONSE", endpoint, `${endpoint}: ${error instanceof Error ? error.message : "invalid time value"}.`, 200);
    }
  });
}
