// src/workflow/integration.ts
import { StepRetryConfig } from "./types";

/**
 * Send an update to the workflow tracker
 *
 * @param type Update type
 * @param data Update data
 * @param env Environment with API URL
 * @returns Success status
 */
async function sendTrackerUpdate(
  type: string,
  data: any,
  env: any,
): Promise<boolean> {
  try {
    // Use either the TRACKER_API_URL environment variable or a direct fetch
    let response;

    if (env.TRACKER_API_URL) {
      // Use external API URL
      response = await fetch(`${env.TRACKER_API_URL}/api/workflows/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          [`${type}`]: data,
        }),
      });
    } else if (env.WORKFLOW_TRACKER_API) {
      // Use service binding
      response = await env.WORKFLOW_TRACKER_API.fetch("/api/workflows/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          [`${type}`]: data,
        }),
      });
    } else {
      // Use local D1 database (this assumes we're running in the same worker)
      const worker = globalThis as any;
      if (worker.processUpdate && worker.updateWorkflowInstance) {
        await worker.processUpdate(
          {
            type,
            [`${type}`]: data,
          },
          env,
        );
        return true;
      } else {
        console.error(
          "No tracker API URL or service binding provided and cannot use local processing",
        );
        return false;
      }
    }

    if (response) {
      const result = await response.json();
      return result.success;
    }

    return false;
  } catch (error) {
    console.error(
      `Failed to send tracker update: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return false;
  }
}

/**
 * Update workflow instance status
 *
 * @param instanceData Instance data to update
 * @param env Environment
 * @returns Success status
 */
export async function updateWorkflowRun(
  instanceData: any,
  env: any,
): Promise<boolean> {
  return sendTrackerUpdate("run_update", instanceData, env);
}

/**
 * Update workflow step
 *
 * @param stepData Step data to update
 * @param env Environment
 * @returns Success status
 */
export async function updateWorkflowStep(
  stepData: any,
  env: any,
): Promise<boolean> {
  return sendTrackerUpdate("step_update", stepData, env);
}

/**
 * Record step retry
 *
 * @param retryData Retry data to record
 * @param env Environment
 * @returns Success status
 */
export async function recordWorkflowStepRetry(
  retryData: any,
  env: any,
): Promise<boolean> {
  return sendTrackerUpdate("retry_update", retryData, env);
}

/**
 * Track execution of a step with comprehensive error handling and retry tracking
 *
 * @param env Environment
 * @param workflowInstanceId Workflow instance ID
 * @param stepName Step name
 * @param stepIndex Step index (order)
 * @param execute Function to execute
 * @param retryConfig Optional retry configuration
 * @returns Result of the step execution
 */
export async function trackStep(
  env: any,
  workflowInstanceId: string,
  stepName: string,
  stepIndex: number,
  execute: () => Promise<any>,
  retryConfig: StepRetryConfig = {},
): Promise<any> {
  // Default retry configuration
  const defaultRetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    backoffType: "exponential", // 'exponential' or 'linear'
    currentRetry: 0, // Start at retry 0
  };

  // Merge with provided retry config
  const config = { ...defaultRetryConfig, ...retryConfig };
  const { maxRetries, baseDelay, backoffType, currentRetry } = config;

  // Record that step is starting
  let stepId;
  try {
    const stepStartData = {
      workflow_instance_id: workflowInstanceId,
      step_name: stepName,
      status: "Running",
      step_index: stepIndex,
      state: null,
      started_at: new Date().toISOString(),
    };

    const updateResult = await updateWorkflowStep(stepStartData, env);
    if (updateResult && typeof updateResult === 'object') {
      stepId = (updateResult as { id?: string }).id;
    }
  } catch (error) {
    console.error(
      `Failed to record step start: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    // Continue execution even if tracking fails
  }

  try {
    // Execute the step logic
    const result = await execute();

    // Update step as completed
    const stepCompleteData = {
      id: stepId, // Include step ID if we have it
      workflow_instance_id: workflowInstanceId,
      step_name: stepName,
      status: "Completed",
      step_index: stepIndex,
      state:
        typeof result === "object" ? JSON.stringify(result) : String(result),
      completed_at: new Date().toISOString(),
    };

    await updateWorkflowStep(stepCompleteData, env);

    return result;
  } catch (error: any) {
    // Calculate next retry details
    const nextRetry = currentRetry + 1;
    const isRetryable = nextRetry <= maxRetries && !error.nonRetryable;

    // Calculate delay for next retry using the specified backoff strategy
    let retryDelay;
    if (backoffType === "exponential") {
      // Exponential backoff: baseDelay * (2 ^ retryCount)
      retryDelay = baseDelay * Math.pow(2, currentRetry);
    } else {
      // Linear backoff: baseDelay * retryCount
      retryDelay = baseDelay * nextRetry;
    }

    // Calculate the timestamp for the next retry
    const nextRetryTime = new Date(Date.now() + retryDelay);

    // Update step status with failure information
    const stepFailedData = {
      id: stepId,
      workflow_instance_id: workflowInstanceId,
      step_name: stepName,
      status: isRetryable ? "Retrying" : "Failed",
      step_index: stepIndex,
      state: JSON.stringify({
        error: error.message || "Unknown error",
        retry: isRetryable
          ? {
              count: nextRetry,
              maxRetries: maxRetries,
              nextRetryAt: nextRetryTime.toISOString(),
            }
          : null,
      }),
    };

    await updateWorkflowStep(stepFailedData, env);

    // Record retry information if this step is retryable
    if (isRetryable) {
      const retryData = {
        workflow_step_id: stepId || stepIndex, // Using step_id if available
        retry_count: nextRetry,
        retry_at: nextRetryTime.toISOString(),
        last_error: error.message || "Unknown error",
      };

      await recordWorkflowStepRetry(retryData, env);

      // For tracking, we'll add retry information to the error
      error.retryCount = nextRetry;
      error.retryDelay = retryDelay;
      error.nextRetryAt = nextRetryTime.toISOString();

      // In a real workflow, we might check if we should continue retrying
      if (error.nonRetryable) {
        console.log(
          `Step ${stepName} failed with non-retryable error: ${error.message}`,
        );
      } else if (nextRetry > maxRetries) {
        console.log(
          `Step ${stepName} failed after ${maxRetries} retries: ${error.message}`,
        );
        // Mark as non-retryable to avoid further retries
        error.nonRetryable = true;
      } else {
        console.log(
          `Step ${stepName} will retry (${nextRetry}/${maxRetries}) at ${nextRetryTime.toISOString()}: ${error.message}`,
        );
      }
    }

    // Re-throw the error to be handled by the workflow's error handling
    throw error;
  }
}
