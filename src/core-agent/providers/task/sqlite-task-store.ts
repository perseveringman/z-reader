import type {
  AgentTaskEventRecord,
  AgentTaskPatch,
  AgentTaskRecord,
  ITaskStore,
  RiskLevel,
  StrategyMode,
  TaskStatus,
} from '../../contracts';

interface SqliteStatement {
  run(params?: Record<string, unknown>): unknown;
  get(params?: Record<string, unknown>): Record<string, unknown> | undefined;
  all(params?: Record<string, unknown>): Array<Record<string, unknown>>;
}

export interface SqliteClientLike {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

interface SqliteTaskRow {
  id: string;
  session_id: string;
  status: TaskStatus;
  strategy: StrategyMode;
  risk_level: RiskLevel;
  input_json: string;
  output_json: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

interface SqliteTaskEventRow {
  id: string;
  task_id: string;
  event_type: string;
  payload_json: string;
  occurred_at: string;
}

export class SqliteTaskStore implements ITaskStore {
  private readonly insertTaskStmt: SqliteStatement;
  private readonly updateTaskStmt: SqliteStatement;
  private readonly selectTaskStmt: SqliteStatement;
  private readonly insertEventStmt: SqliteStatement;
  private readonly listEventsStmt: SqliteStatement;

  constructor(private readonly sqlite: SqliteClientLike) {
    this.initTables();

    this.insertTaskStmt = this.sqlite.prepare(`
      INSERT INTO agent_tasks (
        id, session_id, status, strategy, risk_level, input_json, output_json, error_text, created_at, updated_at
      ) VALUES (
        @id, @sessionId, @status, @strategy, @riskLevel, @inputJson, @outputJson, @errorText, @createdAt, @updatedAt
      )
    `);

    this.updateTaskStmt = this.sqlite.prepare(`
      UPDATE agent_tasks
      SET
        status = @status,
        strategy = @strategy,
        risk_level = @riskLevel,
        output_json = @outputJson,
        error_text = @errorText,
        updated_at = @updatedAt
      WHERE id = @taskId
    `);

    this.selectTaskStmt = this.sqlite.prepare(`
      SELECT id, session_id, status, strategy, risk_level, input_json, output_json, error_text, created_at, updated_at
      FROM agent_tasks
      WHERE id = @taskId
      LIMIT 1
    `);

    this.insertEventStmt = this.sqlite.prepare(`
      INSERT INTO agent_task_events (
        id, task_id, event_type, payload_json, occurred_at
      ) VALUES (
        @id, @taskId, @eventType, @payloadJson, @occurredAt
      )
    `);

    this.listEventsStmt = this.sqlite.prepare(`
      SELECT id, task_id, event_type, payload_json, occurred_at
      FROM agent_task_events
      WHERE task_id = @taskId
      ORDER BY occurred_at ASC
    `);
  }

  async createTask(task: AgentTaskRecord): Promise<void> {
    this.insertTaskStmt.run({
      id: task.id,
      sessionId: task.sessionId,
      status: task.status,
      strategy: task.strategy,
      riskLevel: task.riskLevel,
      inputJson: JSON.stringify(task.inputJson ?? {}),
      outputJson: task.outputJson ? JSON.stringify(task.outputJson) : null,
      errorText: task.errorText ?? null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  }

  async updateTask(taskId: string, patch: AgentTaskPatch): Promise<void> {
    const existing = await this.getTask(taskId);
    if (!existing) {
      return;
    }

    this.updateTaskStmt.run({
      taskId,
      status: patch.status ?? existing.status,
      strategy: patch.strategy ?? existing.strategy,
      riskLevel: patch.riskLevel ?? existing.riskLevel,
      outputJson: patch.outputJson ? JSON.stringify(patch.outputJson) : existing.outputJson ? JSON.stringify(existing.outputJson) : null,
      errorText: patch.errorText ?? existing.errorText ?? null,
      updatedAt: patch.updatedAt,
    });
  }

  async getTask(taskId: string): Promise<AgentTaskRecord | null> {
    const row = this.selectTaskStmt.get({ taskId }) as SqliteTaskRow | undefined;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      strategy: row.strategy,
      riskLevel: row.risk_level,
      inputJson: this.parseJson(row.input_json),
      outputJson: row.output_json ? this.parseJson(row.output_json) : undefined,
      errorText: row.error_text ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async appendEvent(event: AgentTaskEventRecord): Promise<void> {
    this.insertEventStmt.run({
      id: event.id,
      taskId: event.taskId,
      eventType: event.eventType,
      payloadJson: JSON.stringify(event.payloadJson ?? {}),
      occurredAt: event.occurredAt,
    });
  }

  async listEvents(taskId: string): Promise<AgentTaskEventRecord[]> {
    const rows = this.listEventsStmt.all({ taskId }) as SqliteTaskEventRow[];
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      eventType: row.event_type,
      payloadJson: this.parseJson(row.payload_json),
      occurredAt: row.occurred_at,
    }));
  }

  private parseJson(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }

    return {};
  }

  private initTables(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        status TEXT NOT NULL,
        strategy TEXT NOT NULL,
        risk_level TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_session_id ON agent_tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);

      CREATE TABLE IF NOT EXISTS agent_task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_task_events_task_id ON agent_task_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_task_events_occurred_at ON agent_task_events(occurred_at);
    `);
  }
}
