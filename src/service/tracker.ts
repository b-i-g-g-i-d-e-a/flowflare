// src/service/tracker.ts
import { Env } from "./types";

/**
 * Durable Object implementation for the workflow tracker
 * Handles WebSocket connections and database queries
 */
export class WorkflowTracker {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<string, WebSocket>;
  private db: D1Database;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.db = env.DB;
  }

  /**
   * Handle HTTP requests to this Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/websocket") {
      return this.handleWebSocketConnection(request);
    } else if (path === "/broadcast") {
      return this.handleBroadcast(request);
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Handle new WebSocket connections
   */
  async handleWebSocketConnection(request: Request): Promise<Response> {
    // Accept the WebSocket connection using the hibernation API
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection with hibernation
    this.state.acceptWebSocket(server);

    // Generate a unique ID for this session
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, server);

    // Set up event handlers
    server.addEventListener("close", () =>
      this.handleWebSocketClose(sessionId),
    );
    server.addEventListener("error", () =>
      this.handleWebSocketClose(sessionId),
    );

    // Handle messages from the client
    server.addEventListener("message", async (event) => {
      try {
        const message = JSON.parse(event.data as string);

        if (message.type === "query") {
          // Query workflows from D1 database
          const result = await this.queryWorkflows(message.params);
          server.send(
            JSON.stringify({
              type: "query_result",
              data: result,
            }),
          );
        }
      } catch (error) {
        server.send(
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
    });

    // Send initial data to the client
    const workflows = await this.queryWorkflows({
      limit: 20,
      status: null, // All statuses
    });

    server.send(
      JSON.stringify({
        type: "initial_data",
        data: workflows,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  handleWebSocketClose(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Handle broadcast requests from Worker
   */
  async handleBroadcast(request: Request): Promise<Response> {
    const update = await request.json();

    // Broadcast the update to all connected clients
    this.broadcastUpdate(update);

    return new Response(
      JSON.stringify({
        success: true,
        clientCount: this.sessions.size,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Query workflows with filters from D1 database
   */
  async queryWorkflows(params: any): Promise<any[]> {
    const {
      limit = 20,
      offset = 0,
      status = null,
      workflowId = null,
      ref_id = null,
      ref_type = null,
    } = params;

    try {
      // Case 1: Query by specific workflow ID
      if (workflowId) {
        // Query a specific workflow and its details
        const workflow = await this.db
          .prepare("SELECT * FROM workflow_runs WHERE id = ?")
          .bind(workflowId)
          .first();

        if (!workflow) {
          return [];
        }

        // Get steps for this workflow
        const steps = await this.db
          .prepare(
            "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY step_index ASC",
          )
          .bind(workflowId)
          .all();

        // For each step, get its retries
        for (const step of steps.results) {
          const retries = await this.db
            .prepare(
              "SELECT * FROM workflow_step_retries WHERE workflow_step_id = ? ORDER BY retry_count ASC",
            )
            .bind(step.id)
            .all();

          step.retries = retries.results;
        }

        workflow.steps = steps.results;
        return [workflow];
      }
      // Case 2: Query by ref_id and optionally ref_type
      else if (ref_id) {
        let query = "SELECT * FROM workflow_runs WHERE ref_id = ?";
        const bindValues = [ref_id];

        // Add ref_type filter if provided
        if (ref_type) {
          query += " AND ref_type = ?";
          bindValues.push(ref_type);
        }

        // Add status filter if provided
        if (status) {
          query += " AND status = ?";
          bindValues.push(status);
        }

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        bindValues.push(limit.toString(), offset.toString());

        const workflows = await this.db
          .prepare(query)
          .bind(...bindValues)
          .all();

        // For each workflow, fetch its steps and retries
        for (const workflow of workflows.results) {
          const steps = await this.db
            .prepare(
              "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY step_index ASC",
            )
            .bind(workflow.id)
            .all();

          // For each step, get its retries
          for (const step of steps.results) {
            const retries = await this.db
              .prepare(
                "SELECT * FROM workflow_step_retries WHERE workflow_step_id = ? ORDER BY retry_count ASC",
              )
              .bind(step.id)
              .all();

            step.retries = retries.results;
          }

          workflow.steps = steps.results;
        }

        return workflows.results;
      }
      // Case 3: Query by ref_type only
      else if (ref_type) {
        let query = "SELECT * FROM workflow_runs WHERE ref_type = ?";
        const bindValues = [ref_type];

        // Add status filter if provided
        if (status) {
          query += " AND status = ?";
          bindValues.push(status);
        }

        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        bindValues.push(limit.toString(), offset.toString());

        const workflows = await this.db
          .prepare(query)
          .bind(...bindValues)
          .all();

        // For each workflow, fetch its steps and retries
        for (const workflow of workflows.results) {
          const steps = await this.db
            .prepare(
              "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY step_index ASC",
            )
            .bind(workflow.id)
            .all();

          // For each step, get its retries
          for (const step of steps.results) {
            const retries = await this.db
              .prepare(
                "SELECT * FROM workflow_step_retries WHERE workflow_step_id = ? ORDER BY retry_count ASC",
              )
              .bind(step.id)
              .all();

            step.retries = retries.results;
          }

          workflow.steps = steps.results;
        }

        return workflows.results;
      }
      // Case 4: Query by status or all workflows
      else {
        // Query multiple workflows with optional status filter
        let whereClause = "";
        const bindValues: any[] = [];

        if (status) {
          whereClause = "WHERE status = ?";
          bindValues.push(status);
        }

        const workflows = await this.db
          .prepare(
            `SELECT * FROM workflow_runs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          )
          .bind(...bindValues, limit.toString(), offset.toString())
          .all();

        // For each workflow, fetch its steps and retries
        for (const workflow of workflows.results) {
          const steps = await this.db
            .prepare(
              "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY step_index ASC",
            )
            .bind(workflow.id)
            .all();

          // For each step, get its retries
          for (const step of steps.results) {
            const retries = await this.db
              .prepare(
                "SELECT * FROM workflow_step_retries WHERE workflow_step_id = ? ORDER BY retry_count ASC",
              )
              .bind(step.id)
              .all();

            step.retries = retries.results;
          }

          workflow.steps = steps.results;
        }

        return workflows.results;
      }
    } catch (error) {
      console.error("Error querying workflows:", error);
      return [];
    }
  }

  /**
   * Broadcast an update to all connected WebSocket clients
   */
  broadcastUpdate(update: any): void {
    const message = JSON.stringify({
      type: "update",
      data: update,
    });

    for (const session of this.sessions.values()) {
      session.send(message);
    }
  }
}
