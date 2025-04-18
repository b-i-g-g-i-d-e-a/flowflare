// src/client/WorkflowClient.ts
import {
  WorkflowClientOptions,
  WorkflowListOptions,
  WorkflowRefQueryOptions,
} from "./types";

/**
 * Client for interacting with the workflow service from other workers
 */
export class WorkflowClient {
  private serviceUrl?: string;
  private apiKey: string;
  private serviceBinding?: any;

  /**
   * Create a new WorkflowClient
   *
   * @param options Configuration options
   */
  constructor(options: WorkflowClientOptions) {
    this.serviceUrl = options.serviceUrl?.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.serviceBinding = options.serviceBinding;
  }

  /**
   * Start a new workflow
   *
   * @param workflowType The type/name of workflow to start
   * @param params Parameters to pass to the workflow
   * @param ref_id External reference ID (e.g., order ID, user ID)
   * @param ref_type Reference type (e.g., "order", "user")
   * @param metadata Additional metadata about the workflow run (e.g., who triggered it)
   * @returns Promise resolving to the response with the workflowId
   */
  async startWorkflow(
    workflowType: string,
    params: Record<string, any> = {},
    ref_id?: string,
    ref_type?: string,
    metadata?: Record<string, any>,
  ): Promise<any> {
    const payload = {
      workflowType,
      params,
      ref_id,
      ref_type,
      metadata,
    };

    if (this.serviceBinding) {
      // Use direct service binding if available
      return this.serviceBinding
        .fetch("/service/start-workflow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(payload),
        })
        .then((res) => res.json());
    } else if (this.serviceUrl) {
      // Fall back to HTTP request
      return fetch(`${this.serviceUrl}/service/start-workflow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(payload),
      }).then((res) => res.json());
    } else {
      throw new Error("Either serviceBinding or serviceUrl must be provided");
    }
  }

  /**
   * Get the current state of a workflow
   *
   * @param workflowId The ID of the workflow to retrieve
   * @returns Promise resolving to the workflow state
   */
  async getWorkflow(workflowId: string): Promise<any> {
    const payload = { workflowId };

    if (this.serviceBinding) {
      // Use direct service binding if available
      return this.serviceBinding
        .fetch("/service/get-workflow", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(payload),
        })
        .then((res) => res.json());
    } else if (this.serviceUrl) {
      // Fall back to HTTP request
      return fetch(`${this.serviceUrl}/service/get-workflow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(payload),
      }).then((res) => res.json());
    } else {
      throw new Error("Either serviceBinding or serviceUrl must be provided");
    }
  }

  /**
   * List workflows with optional filters
   *
   * @param options Query options
   * @returns Promise resolving to list of workflows
   */
  async listWorkflows(options: WorkflowListOptions = {}): Promise<any> {
    const payload = {
      status: options.status,
      limit: options.limit || 20,
      offset: options.offset || 0,
    };

    if (this.serviceBinding) {
      // Use direct service binding if available
      return this.serviceBinding
        .fetch("/service/list-workflows", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(payload),
        })
        .then((res) => res.json());
    } else if (this.serviceUrl) {
      // Fall back to HTTP request
      return fetch(`${this.serviceUrl}/service/list-workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(payload),
      }).then((res) => res.json());
    } else {
      throw new Error("Either serviceBinding or serviceUrl must be provided");
    }
  }

  /**
   * Get workflows by reference ID and/or type
   *
   * @param options Query options
   * @returns Promise resolving to list of workflows
   */
  async getWorkflowsByRef(options: WorkflowRefQueryOptions = {}): Promise<any> {
    if (!options.ref_id && !options.ref_type) {
      throw new Error("Either ref_id or ref_type must be provided");
    }

    const payload = {
      ref_id: options.ref_id,
      ref_type: options.ref_type,
      status: options.status,
      limit: options.limit || 20,
      offset: options.offset || 0,
    };

    if (this.serviceBinding) {
      // Use direct service binding if available
      return this.serviceBinding
        .fetch("/service/get-workflows-by-ref", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify(payload),
        })
        .then((res) => res.json());
    } else if (this.serviceUrl) {
      // Fall back to HTTP request
      return fetch(`${this.serviceUrl}/service/get-workflows-by-ref`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
        },
        body: JSON.stringify(payload),
      }).then((res) => res.json());
    } else {
      throw new Error("Either serviceBinding or serviceUrl must be provided");
    }
  }
}
