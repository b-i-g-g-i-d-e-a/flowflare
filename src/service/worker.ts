// src/service/worker.ts
import { Env, WorkflowServiceOptions } from "./types";

/**
 * Main worker implementation for the workflow service
 */
export default {
  /**
   * Handle HTTP requests to the worker
   *
   * @param request The incoming HTTP request
   * @param env Environment bindings
   * @param ctx Execution context
   * @returns HTTP response
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Access config from createWorkflowService
    // @ts-ignore - config is added by createWorkflowService
    const config: WorkflowServiceOptions = this.config || {
      allowedOrigins: ["*"],
      debug: false,
    };

    // Helper for CORS handling
    const corsHeaders = (request: Request): HeadersInit => {
      const origin = request.headers.get("Origin");
      // Check if origin is allowed
      const allowedOrigins = config.allowedOrigins || ["*"];
      
      const allowOrigin =
        origin && allowedOrigins.includes("*")
          ? origin
          : allowedOrigins.includes(origin || "")
            ? origin
            : allowedOrigins[0] || "*";

      return {
        "Access-Control-Allow-Origin": allowOrigin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-API-Key",
        "Access-Control-Max-Age": "86400",
      };
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(request),
        status: 204,
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Route requests to the appropriate handler
      if (path.startsWith("/api/workflows")) {
        return this.handleApiRequest(request, env, ctx, corsHeaders(request));
      } else if (path === "/api/tracker-websocket") {
        return this.handleWebSocketConnection(request, env, ctx);
      } else if (path.startsWith("/service/")) {
        return this.handleServiceRequest(
          request,
          env,
          ctx,
          corsHeaders(request),
        );
      } else {
        // Not found
        return new Response("Not found", {
          status: 404,
          headers: corsHeaders(request),
        });
      }
    } catch (error) {
      if (config.debug) {
        console.error("Worker error:", error);
      }

      return new Response(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        {
          status: 500,
          headers: {
            ...corsHeaders(request),
            "Content-Type": "text/plain",
          },
        },
      );
    }
  },

  /**
   * Handle API requests for workflow data
   */
  async handleApiRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Get workflow tracker Durable Object
    const id = env.WORKFLOW_TRACKER.idFromName("default");
    const tracker = env.WORKFLOW_TRACKER.get(id);

    if (path === "/api/workflows/query") {
      try {
        const params = await request.json();

        // Forward query to the Durable Object which will use D1
        const doRequest = new Request(`${url.origin}/websocket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "query",
            params,
          }),
        });

        const doResponse = await tracker.fetch(doRequest);
        const data = await doResponse.json();

        return new Response(JSON.stringify(data), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } else if (path === "/api/workflows/update") {
      // Handle workflow updates directly with D1
      try {
        const update = await request.json();
        const updateResult = await this.processUpdate(update, env);

        // After updating the database, broadcast the update to connected clients
        await tracker.fetch(
          new Request(`${url.origin}/broadcast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(update),
          }),
        );

        return new Response(
          JSON.stringify({
            success: true,
            result: updateResult,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders,
    });
  },

  /**
   * Handle service-to-service requests
   */
  async handleServiceRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    // Check API key for secure service-to-service communication
    const apiKey = request.headers.get("X-API-Key");

    if (!apiKey || apiKey !== env.SERVICE_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Handle different service endpoints
    if (path === "/service/start-workflow") {
      return this.handleStartWorkflow(request, env, corsHeaders);
    } else if (path === "/service/get-workflow") {
      return this.handleGetWorkflow(request, env, corsHeaders);
    } else if (path === "/service/list-workflows") {
      return this.handleListWorkflows(request, env, corsHeaders);
    } else if (path === "/service/get-workflows-by-ref") {
      return this.handleGetWorkflowsByRef(request, env, corsHeaders);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Unknown service endpoint",
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  },

  /**
   * Start a new workflow
   */
  async handleStartWorkflow(
    request: Request,
    env: Env,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    try {
      const requestData = await request.json() as {
        workflowType: string;
        params: Record<string, any>;
        ref_id?: string;
        ref_type?: string;
        metadata?: Record<string, any>;
      };
      const { workflowType, params, ref_id, ref_type, metadata } = requestData;

      // Generate a unique ID for this workflow instance
      const instanceId = crypto.randomUUID();

      // Ensure input_params is a valid JSON string
      const inputParams = JSON.stringify(params || {});
      
      // Get or create the workflow in database
      let workflowId;
      
      // First check if workflow exists with the same name, ref_id, and ref_type
      const existingWorkflow = await env.DB.prepare(
        "SELECT id, status, runs_count FROM workflow WHERE name = ? AND (ref_id = ? OR ref_id IS NULL) AND (ref_type = ? OR ref_type IS NULL)",
      )
        .bind(workflowType, ref_id || null, ref_type || null)
        .first();

      if (existingWorkflow) {
        // Use existing workflow and increment run count
        workflowId = existingWorkflow.id;
        
        // Update workflow status to Running and increment runs count
        await env.DB.prepare(
          `UPDATE workflow SET 
            status = ?, 
            last_run_id = ?, 
            runs_count = ?, 
            updated_at = datetime('now')
          WHERE id = ?`
        )
          .bind(
            "Running", 
            instanceId, 
            ((existingWorkflow.runs_count as number) || 0) + 1,
            workflowId
          )
          .run();
      } else {
        // Auto-create the workflow with input params and metadata
        const result = await env.DB.prepare(
          `INSERT INTO workflow (
            name, 
            status, 
            input_params, 
            metadata, 
            last_run_id, 
            ref_id, 
            ref_type, 
            runs_count, 
            created_at, 
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now')) 
          RETURNING id`
        )
          .bind(
            workflowType,
            "Running",
            inputParams,
            JSON.stringify(metadata || {}),
            instanceId,
            ref_id || null,
            ref_type || null,
            1 // First run
          )
          .first();
        
        if (!result || !result.id) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create workflow type: ${workflowType}`,
            }),
            {
              status: 500,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            },
          );
        }
        
        workflowId = result.id;
      }

      // Create a new workflow run record
      await this.updateWorkflowRun(
        {
          id: instanceId,
          workflow_id: workflowId,
          status: "Pending",
          ref_id: ref_id,
          ref_type: ref_type,
          input_params: inputParams,
          output_result: "{}", // Initialize with empty JSON object
          metadata: JSON.stringify(metadata || {}), // Store who triggered the run
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        env,
      );

      // Trigger the actual workflow (using Cloudflare Workflows binding if configured)
      if (env[workflowType.toUpperCase()]) {
        // Start workflow using the Workflows binding
        const workflowBinding = env[workflowType.toUpperCase()];

        // Create workflow instance with the ID we generated and include ref_id/ref_type
        await workflowBinding.create({
          id: instanceId,
          payload: {
            ...params,
            ref_id: ref_id,
            ref_type: ref_type,
          },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          workflowId: instanceId,
          ref_id: ref_id,
          ref_type: ref_type,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },

  /**
   * Get a specific workflow by ID
   */
  async handleGetWorkflow(
    request: Request,
    env: Env,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    try {
      const requestData = await request.json() as {
        workflowId: string;
      };
      const { workflowId } = requestData;

      // Get workflow tracker Durable Object
      const id = env.WORKFLOW_TRACKER.idFromName("default");
      const tracker = env.WORKFLOW_TRACKER.get(id);

      // Query the workflow data
      const response = await tracker.fetch(
        new Request(`${new URL(request.url).origin}/websocket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "query",
            params: { workflowId },
          }),
        }),
      );

      const responseData = await response.json() as { data?: any[] };

      return new Response(
        JSON.stringify({
          success: true,
          workflow: responseData.data?.[0] || null,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },

  /**
   * List workflows with filters
   */
  async handleListWorkflows(
    request: Request,
    env: Env,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    try {
      const requestData = await request.json() as {
        status?: string;
        limit?: number;
        offset?: number;
      };
      const { status, limit, offset } = requestData;

      // Get workflow tracker Durable Object
      const id = env.WORKFLOW_TRACKER.idFromName("default");
      const tracker = env.WORKFLOW_TRACKER.get(id);

      // Query the workflows
      const response = await tracker.fetch(
        new Request(`${new URL(request.url).origin}/websocket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "query",
            params: { status, limit, offset },
          }),
        }),
      );

      const responseData = await response.json() as { data?: any[] };

      return new Response(
        JSON.stringify({
          success: true,
          workflows: responseData.data || [],
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },

  /**
   * Get workflows by reference ID and type
   */
  async handleGetWorkflowsByRef(
    request: Request,
    env: Env,
    corsHeaders: HeadersInit,
  ): Promise<Response> {
    try {
      const requestData = await request.json() as {
        ref_id?: string;
        ref_type?: string;
        status?: string;
        limit?: number;
        offset?: number;
      };
      const { ref_id, ref_type, status, limit, offset } = requestData;

      if (!ref_id && !ref_type) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Either ref_id or ref_type must be provided",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Get workflow tracker Durable Object
      const id = env.WORKFLOW_TRACKER.idFromName("default");
      const tracker = env.WORKFLOW_TRACKER.get(id);

      // Query the workflows using reference parameters
      const response = await tracker.fetch(
        new Request(`${new URL(request.url).origin}/websocket`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "query",
            params: {
              ref_id,
              ref_type,
              status,
              limit: limit || 20,
              offset: offset || 0,
            },
          }),
        }),
      );

      const responseData = await response.json() as { data?: any[] };

      return new Response(
        JSON.stringify({
          success: true,
          workflows: responseData.data || [],
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },

  /**
   * Process updates to the D1 database
   */
  async processUpdate(update: any, env: Env): Promise<any> {
    const { type } = update;

    if (type === "run_update") {
      const result = await this.updateWorkflowRun(update.run_update, env);
      
      // If this is a status update for a run, also update the parent workflow
      if (update.run_update.status) {
        await this.syncWorkflowStatus(update.run_update, env);
      }
      
      return result;
    } else if (type === "step_update") {
      return this.updateWorkflowStep(update.step_update, env);
    } else if (type === "retry_update") {
      return this.updateWorkflowStepRetry(update.retry_update, env);
    }

    throw new Error(`Unknown update type: ${type}`);
  },
  
  /**
   * Sync workflow status with its latest run
   */
  async syncWorkflowStatus(run: any, env: Env): Promise<any> {
    // Only proceed if we have a completed, errored or sleeping status
    if (!run.status || !run.id || !['Completed', 'Errored', 'Sleeping'].includes(run.status)) {
      return { skipped: true };
    }
    
    // Get the workflow ID for this run
    const workflowRun = await env.DB.prepare(
      "SELECT workflow_id, output_result FROM workflow_runs WHERE id = ?"
    )
      .bind(run.id)
      .first();
      
    if (!workflowRun || !workflowRun.workflow_id) {
      return { error: "Run not found or workflow_id not set" };
    }
    
    // Update the workflow status based on the run status
    const updateData: any = {
      status: run.status,
      updated_at: new Date().toISOString()
    };
    
    // If the run was completed successfully, update the workflow's output_result
    if (run.status === "Completed") {
      updateData.output_result = run.output_result || workflowRun.output_result;
      updateData.completed_at = run.completed_at || new Date().toISOString();
    }
    
    // Build update query dynamically
    const setStatements: string[] = [];
    const values: any[] = [];

    Object.entries(updateData).forEach(([key, value]) => {
      setStatements.push(`${key} = ?`);
      values.push(value);
    });
    
    // Add the workflow_id for WHERE clause
    values.push(workflowRun.workflow_id);

    await env.DB.prepare(
      `UPDATE workflow SET ${setStatements.join(", ")} WHERE id = ?`
    )
      .bind(...values)
      .run();
      
    return { updated: true, workflow_id: workflowRun.workflow_id };
  },

  /**
   * Update workflow run in D1 database
   */
  async updateWorkflowRun(run: any, env: Env): Promise<any> {
    // Check if run exists
    const existing = await env.DB.prepare(
      "SELECT id FROM workflow_runs WHERE id = ?",
    )
      .bind(run.id)
      .first();

    if (existing) {
      // Build update query dynamically
      const setStatements: string[] = [];
      const values: any[] = [];

      Object.entries(run).forEach(([key, value]) => {
        if (key !== "id") {
          setStatements.push(`${key} = ?`);
          values.push(value);
        }
      });

      // Add updated_at timestamp
      setStatements.push('updated_at = datetime("now")');

      // Add the id for WHERE clause
      values.push(run.id);

      await env.DB.prepare(
        `UPDATE workflow_runs SET ${setStatements.join(", ")} WHERE id = ?`,
      )
        .bind(...values)
        .run();

      return { updated: true, id: run.id };
    } else {
      // Ensure created_at has a value
      if (!run.created_at) {
        run.created_at = new Date().toISOString();
      }

      // Set updated_at to current time
      run.updated_at = new Date().toISOString();

      // Get all columns and values
      const columns = Object.keys(run).join(", ");
      const placeholders = Array(Object.keys(run).length)
        .fill("?")
        .join(", ");
      const values = Object.values(run);

      await env.DB.prepare(
        `INSERT INTO workflow_runs (${columns}) VALUES (${placeholders})`,
      )
        .bind(...values)
        .run();

      return { inserted: true, id: run.id };
    }
  },

  /**
   * Update workflow step in D1 database
   */
  async updateWorkflowStep(step: any, env: Env): Promise<any> {
    // Rename workflow_instance_id to workflow_run_id if it exists
    if (step.workflow_instance_id && !step.workflow_run_id) {
      step.workflow_run_id = step.workflow_instance_id;
      delete step.workflow_instance_id;
    }
    
    if (step.id) {
      // Update existing step
      const setStatements: string[] = [];
      const values: any[] = [];

      Object.entries(step).forEach(([key, value]) => {
        if (key !== "id") {
          setStatements.push(`${key} = ?`);
          values.push(value);
        }
      });

      // Add the id for WHERE clause
      values.push(step.id);

      await env.DB.prepare(
        `UPDATE workflow_steps SET ${setStatements.join(", ")} WHERE id = ?`,
      )
        .bind(...values)
        .run();

      return { updated: true, id: step.id };
    } else {
      // Insert new step
      // Ensure needed timestamps are set
      if (step.status === "Running" && !step.started_at) {
        step.started_at = new Date().toISOString();
      }
      if (step.status === "Completed" && !step.completed_at) {
        step.completed_at = new Date().toISOString();
      }

      // Get all columns and values
      const columns = Object.keys(step).join(", ");
      const placeholders = Array(Object.keys(step).length).fill("?").join(", ");
      const values = Object.values(step);

      const result = await env.DB.prepare(
        `INSERT INTO workflow_steps (${columns}) VALUES (${placeholders}) RETURNING id`,
      )
        .bind(...values)
        .first();

      return { inserted: true, id: result?.id };
    }
  },

  /**
   * Update workflow step retry in D1 database
   */
  async updateWorkflowStepRetry(retry: any, env: Env): Promise<any> {
    // Generate created_at if not provided
    if (!retry.created_at) {
      retry.created_at = new Date().toISOString();
    }

    // Get all columns and values
    const columns = Object.keys(retry).join(", ");
    const placeholders = Array(Object.keys(retry).length).fill("?").join(", ");
    const values = Object.values(retry);

    const result = await env.DB.prepare(
      `INSERT INTO workflow_step_retries (${columns}) VALUES (${placeholders}) RETURNING id`,
    )
      .bind(...values)
      .first();

    return { inserted: true, id: result?.id };
  },

  /**
   * Handle WebSocket connections and forward to Durable Object
   */
  async handleWebSocketConnection(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Get workflow tracker Durable Object
    const id = env.WORKFLOW_TRACKER.idFromName("default");
    const tracker = env.WORKFLOW_TRACKER.get(id);

    // Forward WebSocket connection to the Durable Object
    return tracker.fetch(
      new Request(`${new URL(request.url).origin}/websocket`, {
        headers: request.headers,
        method: request.method,
      }),
    );
  },
};
