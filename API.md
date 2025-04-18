# Flowflare API Reference

## Core Components

### Workflow Service

Creates a Cloudflare Worker that serves as the workflow tracking service.

```javascript
import { createWorkflowService } from '@b-i-g-g-i-d-e-a/flowflare';

export default createWorkflowService({
  allowedOrigins: ['https://your-app.com'],
  debug: true
});

export { WorkflowTracker } from '@b-i-g-g-i-d-e-a/flowflare';
```

#### Options

- `allowedOrigins` (string[]): List of allowed origins for CORS
- `debug` (boolean): Enable debug logging

### Workflow Client

Client for interacting with the workflow service from other workers.

```javascript
import { WorkflowClient } from '@b-i-g-g-i-d-e-a/flowflare/client';

const client = new WorkflowClient({
  serviceBinding: env.WORKFLOW_SERVICE,
  apiKey: env.WORKFLOW_API_KEY
});
```

#### Methods

- `startWorkflow(workflowType, params, ref_id, ref_type, metadata)`: Start a new workflow (workflow type is auto-registered if it doesn't exist)
  - `workflowType`: Type/name of the workflow to start
  - `params`: Parameters to pass to the workflow
  - `ref_id`: External reference ID (e.g., order ID, user ID)
  - `ref_type`: Reference type (e.g., "order", "user")
  - `metadata`: Additional metadata about the run (e.g., who triggered it, source, context)
- `getWorkflow(workflowId)`: Get details of a specific workflow
- `listWorkflows(options)`: List workflows with optional filters
- `getWorkflowsByRef(options)`: Find workflows by ref_id and/or ref_type

### Workflow Tracking

Utilities for tracking workflow execution.

```javascript
import { 
  trackStep, 
  updateWorkflowInstance 
} from '@b-i-g-g-i-d-e-a/flowflare/workflow';
```

#### Functions

- `trackStep(env, workflowInstanceId, stepName, stepIndex, execute, retryConfig)`: Track execution of a workflow step
- `updateWorkflowInstance(data, env)`: Update workflow instance state
- `updateWorkflowStep(data, env)`: Update workflow step state
- `recordStepRetry(data, env)`: Record a step retry

## Database Schema

### Tables

#### workflow

Stores workflows with their current status.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Workflow name (unique when combined with ref_id and ref_type) |
| status | TEXT | Status of the latest run (Running, Sleeping, Completed, Errored) |
| input_params | TEXT | JSON string of original input parameters (never modified) |
| output_result | TEXT | Final result if workflow is completed |
| metadata | TEXT | JSON string with metadata about the workflow |
| last_run_id | TEXT | ID of the most recent run |
| ref_id | TEXT | External reference ID |
| ref_type | TEXT | Reference type |
| runs_count | INTEGER | Total number of runs for this workflow |
| created_at | TIMESTAMP | When the workflow was created |
| updated_at | TIMESTAMP | When the workflow was last updated |
| completed_at | TIMESTAMP | When the workflow completed |

Note: The combination of `name`, `ref_id`, and `ref_type` must be unique. This allows multiple workflows with the same name but different reference parameters.

#### workflow_runs

Stores individual workflow executions (renamed from workflow_instances).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key, Cloudflare instance ID |
| workflow_id | INTEGER | Foreign key to workflow |
| status | TEXT | Current status (Running, Sleeping, Completed, Errored) |
| ref_id | TEXT | External reference ID |
| ref_type | TEXT | Reference type |
| input_params | TEXT | JSON string of input parameters |
| output_result | TEXT | JSON string of final result |
| metadata | TEXT | JSON string with metadata about who triggered the run |
| created_at | TIMESTAMP | When the run was created |
| updated_at | TIMESTAMP | When the run was last updated |
| completed_at | TIMESTAMP | When the run completed |
| sleep_until | TIMESTAMP | When the run will wake from sleep |

#### workflow_steps

Stores individual steps within a workflow execution.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| workflow_run_id | TEXT | Foreign key to workflow_runs |
| step_name | TEXT | Name of the step |
| status | TEXT | Step status (Pending, Running, Completed, Failed, Retrying) |
| step_index | INTEGER | Order in which steps are executed |
| state | TEXT | JSON string of step state |
| started_at | TIMESTAMP | When the step started |
| completed_at | TIMESTAMP | When the step completed |

#### workflow_step_retries

Stores retry information for failed steps (renamed from step_retries).

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| workflow_step_id | INTEGER | Foreign key to workflow_steps |
| retry_count | INTEGER | Retry attempt number |
| retry_at | TIMESTAMP | When the retry is scheduled |
| last_error | TEXT | Error message from the previous attempt |
| created_at | TIMESTAMP | When the retry record was created |

## API Endpoints

### Workflow Management

- `POST /api/workflows/update`: Update workflow state
- `POST /api/workflows/query`: Query workflow data

### Service-to-Service API

- `POST /service/start-workflow`: Start a new workflow
- `POST /service/get-workflow`: Get a specific workflow
- `POST /service/list-workflows`: List workflows
- `POST /service/get-workflows-by-ref`: Find workflows by reference

### WebSocket

- `GET /api/tracker-websocket`: Connect to get real-time updates

## Error Handling

The `trackStep` function handles errors with these features:

- Tracks retry count and next retry time
- Supports exponential and linear backoff
- Records errors in the database
- Attaches retry information to errors

Example retry configuration:

```javascript
const result = await trackStep(
  env,
  step.instanceId,
  'process-payment',
  1,
  async () => {
    // Payment processing logic
    return await processPayment();
  },
  {
    maxRetries: 5,
    baseDelay: 10000,      // 10 seconds initial delay
    backoffType: 'exponential'
  }
);
```

## Environment Variables

- `SERVICE_API_KEY`: API key for service-to-service authentication

## Durable Objects Configuration

### For Service Worker

When configuring the main workflow service worker that exports the `WorkflowTracker` class:

```toml
# In wrangler.toml
[durable_objects]
bindings = [
  { name = "WORKFLOW_TRACKER", class_name = "WorkflowTracker" }
]

[[migrations]]
tag = "workflow-tracker-v1"
new_classes = ["WorkflowTracker"]
```

### For Client Workers

When configuring other workers that will use the workflow service:

```toml
# In wrangler.toml
[durable_objects]
bindings = [
  { name = "WORKFLOW_TRACKER", class_name = "WorkflowTracker", script_name = "flowflare-service" }
]
```

Note: The `script_name` parameter is mandatory for client workers and should match the name of your deployed workflow service worker.
