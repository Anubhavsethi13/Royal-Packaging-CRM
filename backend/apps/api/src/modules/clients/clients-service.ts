import crypto from "node:crypto";
import type {
  ClientDTO,
  CreateClientRequest,
  ListClientsFilter,
  UpdateClientRequest
} from "@royal-packaging/contracts";
import { CommercialDomainError, createClientRequestSchema, updateClientRequestSchema } from "@royal-packaging/contracts";
import type { DatabaseConnection } from "@royal-packaging/db";
import { sql } from "kysely";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface ClientsServiceConfig {
  readonly database: DatabaseConnection;
}

export class ClientsService {
  private readonly database: DatabaseConnection;

  public constructor(config: ClientsServiceConfig) {
    this.database = config.database;
  }

  public async createClient(request: CreateClientRequest): Promise<ClientDTO> {
    const parsed = createClientRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid client request");
    }

    const now = new Date();
    const id = crypto.randomUUID();

    try {
      await this.database
        .insertInto("clients")
        .values({
          id,
          name: parsed.data.name,
          account_code: parsed.data.account_code,
          contact_name: parsed.data.contact_name ?? null,
          phone: parsed.data.phone ?? null,
          status: parsed.data.status ?? "active",
          created_at: now,
          updated_at: now,
          version: "1"
        })
        .execute();
    } catch (err) {
      throw this.translateWriteError(err, "DUPLICATE_ACCOUNT_CODE", `account_code '${parsed.data.account_code}' is already in use.`);
    }

    return this.getClientByIdOrThrow(id);
  }

  public async updateClient(id: string, request: UpdateClientRequest): Promise<ClientDTO> {
    const parsed = updateClientRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new CommercialDomainError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid client update");
    }

    const existing = await this.database.selectFrom("clients").select("id").where("id", "=", id).executeTakeFirst();
    if (!existing) {
      throw new CommercialDomainError("CLIENT_NOT_FOUND", `Client with ID '${id}' was not found.`);
    }

    await this.database
      .updateTable("clients")
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.contact_name !== undefined ? { contact_name: parsed.data.contact_name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updated_at: sql`now()`,
        version: sql`version + 1`
      })
      .where("id", "=", id)
      .execute();

    return this.getClientByIdOrThrow(id);
  }

  public async getClientById(id: string): Promise<ClientDTO | null> {
    const row = await this.database.selectFrom("clients").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? this.toDTO(row) : null;
  }

  public async listClients(filter: ListClientsFilter): Promise<ClientDTO[]> {
    let query = this.database.selectFrom("clients").selectAll();

    if (filter.status) {
      query = query.where("status", "=", filter.status);
    }
    if (filter.search) {
      const term = `%${filter.search}%`;
      query = query.where((eb) =>
        eb.or([eb("name", "ilike", term), eb("account_code", "ilike", term)])
      );
    }

    const rows = await query.orderBy("created_at", "desc").execute();
    return rows.map((row) => this.toDTO(row));
  }

  private async getClientByIdOrThrow(id: string): Promise<ClientDTO> {
    const client = await this.getClientById(id);
    if (!client) {
      throw new CommercialDomainError("CLIENT_NOT_FOUND", `Client with ID '${id}' was not found.`);
    }
    return client;
  }

  private translateWriteError(err: unknown, code: "DUPLICATE_ACCOUNT_CODE", message: string): CommercialDomainError {
    if (isPostgresUniqueViolation(err)) {
      return new CommercialDomainError(code, message);
    }
    throw err;
  }

  private toDTO(row: {
    id: string;
    name: string;
    account_code: string;
    contact_name: string | null;
    phone: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
    version: string;
  }): ClientDTO {
    return {
      id: row.id,
      name: row.name,
      account_code: row.account_code,
      contact_name: row.contact_name,
      phone: row.phone,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      version: BigInt(row.version)
    };
  }
}

/** Detects a PostgreSQL unique-constraint violation (SQLSTATE 23505). */
export function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
