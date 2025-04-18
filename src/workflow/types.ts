// src/workflow/types.ts

/**
 * Step retry configuration
 */
export interface StepRetryConfig {
  /**
   * Maximum number of retry attempts
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds
   * Default: 1000 (1 second)
   */
  baseDelay?: number;

  /**
   * Backoff type for retries
   * Default: 'exponential'
   */
  backoffType?: "exponential" | "linear";

  /**
   * Current retry count (usually starts at 0)
   * Default: 0
   */
  currentRetry?: number;
}

/**
 * Data for updating a workflow run
 */
export interface WorkflowRunUpdateData {
  /**
   * Workflow run ID
   */
  id: string;

  /**
   * Workflow ID
   */
  workflow_id?: number;

  /**
   * Workflow status
   */
  status?: string;

  /**
   * External reference ID
   */
  ref_id?: string;

  /**
   * Reference type
   */
  ref_type?: string;

  /**
   * Input parameters as JSON string
   */
  input_params?: string;

  /**
   * Output result as JSON string
   */
  output_result?: string;

  /**
   * Metadata about who triggered the run and other context
   */
  metadata?: string;

  /**
   * When the workflow was created
   */
  created_at?: string;

  /**
   * When the workflow will wake from sleep
   */
  sleep_until?: string;

  /**
   * When the workflow completed
   */
  completed_at?: string;
}
