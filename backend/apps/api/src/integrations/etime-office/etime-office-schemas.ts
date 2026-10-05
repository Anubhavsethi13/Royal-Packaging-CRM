import { ETIME_RECORD_PATTERN } from "@royal-packaging/config";
import { z } from "zod";

/**
 * Response shapes from API Documentation.pdf. Provider field names are kept at this boundary
 * and mapped to CRM names in `etime-office-mapper.ts`. Only documented fields are relied on;
 * extra fields are tolerated and ignored. `Empcode` must be a string so leading zeros survive.
 */
const empcode = z.string().trim().min(1, "Empcode is required");
const punchDate = z.string().min(1, "PunchDate is required");
const optionalText = z.string().nullable().optional();

/** API 1 — DownloadPunchData returns a bare array. */
export const downloadPunchDataResponseSchema = z.array(z.object({ Empcode: empcode, PunchDate: punchDate }));

const envelope = { Error: z.boolean(), Msg: z.string().nullable().optional(), IsAdmin: z.boolean().optional() };

/** API 2 — DownloadPunchDataMCID. */
export const downloadPunchDataMcidResponseSchema = z.object({
  ...envelope,
  PunchData: z.array(z.object({
    Name: optionalText,
    Empcode: empcode,
    PunchDate: punchDate,
    M_Flag: optionalText,
    mcid: z.union([z.string(), z.number()]).nullable().optional(),
  })),
});

/** API 3 — DownloadInOutPunchData. */
export const downloadInOutPunchDataResponseSchema = z.object({
  ...envelope,
  InOutPunchData: z.array(z.object({
    Empcode: empcode,
    INTime: z.string(),
    OUTTime: z.string(),
    WorkTime: z.string(),
    OverTime: z.string(),
    Status: optionalText,
    DateString: z.string(),
    Remark: optionalText,
    Erl_Out: z.string(),
    Late_In: z.string(),
    Name: optionalText,
  })),
});

export const lastRecordSchema = z.string().regex(ETIME_RECORD_PATTERN, "must use the MMyyyy$ID format");

/** API 4 — DownloadLastPunchData. `MaxRecord` is required: it is the next checkpoint. */
export const downloadLastPunchDataResponseSchema = z.object({
  ...envelope,
  PunchData: z.array(z.object({
    Name: optionalText,
    Empcode: empcode,
    PunchDate: punchDate,
    M_Flag: optionalText,
    ID: z.number().int().nonnegative(),
    Table: z.string().min(1),
    EmpcardNo: optionalText,
  })),
  MaxRecord: lastRecordSchema,
  TableName: z.string().optional(),
});

export type DownloadPunchDataResponse = z.infer<typeof downloadPunchDataResponseSchema>;
export type DownloadPunchDataMcidResponse = z.infer<typeof downloadPunchDataMcidResponseSchema>;
export type DownloadInOutPunchDataResponse = z.infer<typeof downloadInOutPunchDataResponseSchema>;
export type DownloadLastPunchDataResponse = z.infer<typeof downloadLastPunchDataResponseSchema>;
