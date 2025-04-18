// src/service/types.ts

/**
 * Configuration options for the workflow service
 */
export interface WorkflowServiceOptions {
  /**
   * Allowed origins for CORS requests
   * Default: ['*']
   */
  allowedOrigins?: string[];

  /**
   * Enable debug logging
   * Default: false
   */
  debug?: boolean;
}

/**
 * Environment bindings for the workflow service
 */
export interface Env {
  /**
   * D1 database binding
   */
  DB: D1Database;

  /**
   * Durable Object namespace for the workflow tracker
   */
  WORKFLOW_TRACKER: DurableObjectNamespace;

  /**
   * API key for service-to-service communication
   */
  SERVICE_API_KEY: string;

  /**
   * Any additional workflow bindings
   */
  [key: string]: any;
}

/**
 * Structure of workflow run data
 */
export interface WorkflowRun {
  id: string;
  workflow_id: number;
  status: WorkflowStatus;
  ref_id?: string;
  ref_type?: string;
  input_params: string;
  output_result: string;
  metadata?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  sleep_until?: string;
}

/**
 * Structure of workflow step data
 */
export interface WorkflowStep {
  id?: number;
  workflow_run_id: string;
  step_name: string;
  status: StepStatus;
  step_index: number;
  state?: string;
  started_at?: string;
  completed_at?: string;
  retries?: WorkflowStepRetry[];
}

/**
 * Structure of workflow step retry data
 */
export interface WorkflowStepRetry {
  id?: number;
  workflow_step_id: number;
  retry_count: number;
  retry_at: string;
  last_error: string;
  created_at?: string;
}

/**
 * Possible workflow statuses
 */
export type WorkflowStatus =
  | "Pending"
  | "Running"
  | "Sleeping"
  | "Completed"
  | "Errored";

/**
 * Possible step statuses
 */
export type StepStatus =
  | "Pending"
  | "Running"
  | "Completed"
  | "Failed"
  | "Retrying";
