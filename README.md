# Flowflare

A complete solution for tracking, monitoring, and managing workflows in Cloudflare Workers using D1 and Durable Objects with real-time WebSocket updates.

## Features

- Track workflow execution with detailed steps and retries
- Store input parameters and output results for each workflow
- Associate workflows with external entities via ref_id and ref_type
- Real-time UI updates using WebSockets and Durable Objects
- Microservice architecture for use across multiple workers
- Easy setup and configuration with automated migrations
- Automatic workflow registration - no need to pre-register workflow types
- Metadata tracking for both workflows and individual runs
- Status tracking at both workflow and run levels
- Support for multiple workflows with the same name but different reference parameters

## Installation

```bash
npm install @biggidea/flowflare
```

## Quick Setup

Run the setup wizard to configure your project:

```bash
npx flowflare-setup
```

This will:
1. Create a D1 database (or use an existing one)
2. Run database migrations to create the schema
3. Update your wrangler.toml with the necessary bindings

## Usage

### 1. Create a Workflow Service Worker

```javascript
// src/index.js
import { createWorkflowService } from '@biggidea/flowflare';

// Create the service with your options
export default createWorkflowService({
  // Optional custom configuration
  allowedOrigins: ['https://your-app.com'],
  debug: true
});

// Export the WorkflowTracker class for Durable Objects
export { WorkflowTracker } from '@biggidea/flowflare';
```

### 2. Create Workflow Implementations

```javascript
// src/workflows/email-workflow.js
import {
  trackStep,
  updateWorkflowRun
} from '@biggidea/flowflare/workflow';

export class EmailCampaignWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Extract ref_id and ref_type from payload
    const { ref_id, ref_type, recipients, subject, body } = event.payload;

    // Initialize workflow run
    await updateWorkflowRun({
      id: step.instanceId,
      workflow_id: 1,
      status: 'Running',
      ref_id,
      ref_type,
      input_params: JSON.stringify(event.payload),
      metadata: JSON.stringify({ source: 'email-workflow' })
    }, this.env);

    try {
      // Step 1: Validate recipients
      const validationResult = await trackStep(
        this.env,
        step.instanceId,
        'validate-recipients',
        1,
        async () => {
          // Validation logic here
          return { validRecipients: recipients.length };
        }
      );

      // Step 2: Send emails
      const sendResult = await trackStep(
        this.env,
        step.instanceId,
        'send-emails',
        2,
        async () => {
          // Email sending logic here
          return { sent: recipients.length };
        },
        {
          maxRetries: 3,
          baseDelay: 5000
        }
      );

      // Mark workflow as completed
      const finalResult = { success: true, sent: sendResult.sent };
      await updateWorkflowRun({
        id: step.instanceId,
        status: 'Completed',
        completed_at: new Date().toISOString(),
        output_result: JSON.stringify(finalResult)
      }, this.env);

      return finalResult;
    } catch (error) {
      // Handle error
      await updateWorkflowRun({
        id: step.instanceId,
        status: 'Errored',
        output_result: JSON.stringify({
          success: false,
          error: error.message
        })
      }, this.env);

      throw error;
    }
  }
}
```

### 3. Use the Client in Other Workers

```javascript
// In another worker (e.g., API worker)
import { WorkflowClient } from '@biggidea/flowflare/client';

export default {
  async fetch(request, env, ctx) {
    // Create client instance
    const workflowClient = new WorkflowClient({
      serviceBinding: env.WORKFLOW_SERVICE,
      apiKey: env.WORKFLOW_API_KEY
    });

    // Start a workflow with ref_id, ref_type, and metadata
    const result = await workflowClient.startWorkflow(
      'email_campaign',
      {
        recipients: ['user@example.com'],
        subject: 'Hello',
        body: 'Test email'
      },
      'campaign-123',  // ref_id
      'campaign',      // ref_type
      {               // metadata (who triggered the workflow)
        triggeredBy: 'user@example.com',
        source: 'admin-panel',
        department: 'marketing'
      }
    );

    // Check workflow status
    const status = await workflowClient.getWorkflow(result.workflowId);

    // Get all workflows for a campaign
    const campaignWorkflows = await workflowClient.getWorkflowsByRef({
      ref_id: 'campaign-123',
      ref_type: 'campaign'
    });

    return new Response(JSON.stringify(status));
  }
}
```

### 4. Deploy Your Workers

```bash
# Deploy the workflow service worker
cd workflow-service
npx wrangler deploy

# Deploy your application worker
cd my-app
npx wrangler deploy
```

## WebSocket Integration

The workflow service exposes a WebSocket endpoint that can be used to receive real-time updates about workflow status changes. You can build your own UI components that connect to this endpoint:

```javascript
// Example WebSocket connection
const socket = new WebSocket("wss://your-worker.workers.dev/api/tracker-websocket");

socket.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Received workflow update:', update);
  // Update your UI based on the workflow status
};
```

The WebSocket sends updates in the following format:

```javascript
{
  type: "update",  // or "initial_data" for the first connection
  data: {
    // Workflow update information
  }
}
```

## Configuration

### wrangler.toml Example

Your wrangler.toml should contain:

```toml
name = "your-worker"
main = "src/index.js"

# D1 database
[[d1_databases]]
binding = "DB"
database_name = "flowflare_db"
database_id = "your-database-id"

# Durable Object - USE THIS FOR THE WORKFLOW SERVICE WORKER (which exports WorkflowTracker)
[durable_objects]
bindings = [
  { name = "WORKFLOW_TRACKER", class_name = "WorkflowTracker" }
]

[[migrations]]
tag = "flowflare-v1"
new_classes = ["WorkflowTracker"]

# FOR CLIENT WORKERS (that consume the workflow service) use:
# [durable_objects]
# bindings = [
#   { name = "WORKFLOW_TRACKER", class_name = "WorkflowTracker", script_name = "your-workflow-service-worker-name" }
# ]

# For cross-worker communication
[vars]
SERVICE_API_KEY = "your-secret-api-key"

# Optional: Direct workflow bindings
[[workflows]]
binding = "EMAIL_CAMPAIGN"
entry_point = "EmailCampaignWorkflow"
```

## Advanced Usage

### Custom Retry Logic

```javascript
// Custom retry with exponential backoff
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

### Error Handling

```javascript
try {
  const result = await trackStep(...);
} catch (error) {
  // Check retry information
  if (error.retryCount) {
    console.log(`Failed, will retry ${error.retryCount}/${maxRetries} at ${error.nextRetryAt}`);
  }

  // Mark as non-retryable
  error.nonRetryable = true;
  throw error;
}
```

## API Reference

Full API documentation can be found in the [API.md](./API.md) file.

## License

MIT# Cloudflare Workflow Tracker

A complete solution for tracking, monitoring, and managing workflows in Cloudflare Workers using D1 and Durable Objects with real-time WebSocket updates.

## Features

- Track workflow execution with detailed steps and retries
- Store input parameters and output results for each workflow
- Associate workflows with external entities via ref_id and ref_type
- Real-time UI updates using WebSockets and Durable Objects
- Microservice architecture for use across multiple workers
- Easy setup and configuration with automated migrations
- Automatic workflow registration - no need to pre-register workflow types
- Metadata tracking for both workflows and individual runs
- Status tracking at both workflow and run levels
- Support for multiple workflows with the same name but different reference parameters

## Installation

```bash
npm install @your-org/cloudflare-workflow-tracker
```

## Quick Setup

Run the setup wizard to configure your project:

```bash
npx workflow-tracker-setup
```

This will:
1. Create a D1 database (or use an existing one)
2. Run database migrations to create the schema
3. Update your wrangler.toml with the necessary bindings

## Usage

### 1. Create a Workflow Service Worker

```javascript
// src/index.js
import { createWorkflowService } from '@your-org/cloudflare-workflow-tracker';

// Create the service with your options
export default createWorkflowService({
  // Optional custom configuration
  allowedOrigins: ['https://your-app.com'],
  debug: true
});

// Export the WorkflowTracker class for Durable Objects
export { WorkflowTracker } from '@your-org/cloudflare-workflow-tracker';
```

### 2. Create Workflow Implementations

```javascript
// src/workflows/email-workflow.js
import {
  trackStep,
  updateWorkflowInstance
} from '@your-org/cloudflare-workflow-tracker/workflow';

export class EmailCampaignWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Extract ref_id and ref_type from payload
    const { ref_id, ref_type, recipients, subject, body } = event.payload;

    // Initialize workflow run
    await updateWorkflowRun({
      id: step.instanceId,
      workflow_id: 1,
      status: 'Running',
      ref_id,
      ref_type,
      input_params: JSON.stringify(event.payload),
      metadata: JSON.stringify({ source: 'email-workflow' })
    }, this.env);

    try {
      // Step 1: Validate recipients
      const validationResult = await trackStep(
        this.env,
        step.instanceId,
        'validate-recipients',
        1,
        async () => {
          // Validation logic here
          return { validRecipients: recipients.length };
        }
      );

      // Step 2: Send emails
      const sendResult = await trackStep(
        this.env,
        step.instanceId,
        'send-emails',
        2,
        async () => {
          // Email sending logic here
          return { sent: recipients.length };
        },
        {
          maxRetries: 3,
          baseDelay: 5000
        }
      );

      // Mark workflow as completed
      const finalResult = { success: true, sent: sendResult.sent };
      await updateWorkflowRun({
        id: step.instanceId,
        status: 'Completed',
        completed_at: new Date().toISOString(),
        output_result: JSON.stringify(finalResult)
      }, this.env);

      return finalResult;
    } catch (error) {
      // Handle error
      await updateWorkflowRun({
        id: step.instanceId,
        status: 'Errored',
        output_result: JSON.stringify({
          success: false,
          error: error.message
        })
      }, this.env);

      throw error;
    }
  }
}
```

### 3. Use the Client in Other Workers

```javascript
// In another worker (e.g., API worker)
import { WorkflowClient } from '@your-org/cloudflare-workflow-tracker/client';

export default {
  async fetch(request, env, ctx) {
    // Create client instance
    const workflowClient = new WorkflowClient({
      serviceBinding: env.WORKFLOW_SERVICE,
      apiKey: env.WORKFLOW_API_KEY
    });

    // Start a workflow with ref_id, ref_type, and metadata
    const result = await workflowClient.startWorkflow(
      'email_campaign',
      {
        recipients: ['user@example.com'],
        subject: 'Hello',
        body: 'Test email'
      },
      'campaign-123',  // ref_id
      'campaign',      // ref_type
      {               // metadata (who triggered the workflow)
        triggeredBy: 'user@example.com',
        source: 'admin-panel',
        department: 'marketing'
      }
    );

    // Check workflow status
    const status = await workflowClient.getWorkflow(result.workflowId);

    // Get all workflows for a campaign
    const campaignWorkflows = await workflowClient.getWorkflowsByRef({
      ref_id: 'campaign-123',
      ref_type: 'campaign'
    });

    return new Response(JSON.stringify(status));
  }
}
```

### 4. Deploy Your Workers

```bash
# Deploy the workflow service worker
cd workflow-service
npx wrangler deploy

# Deploy your application worker
cd my-app
npx wrangler deploy
```

## UI Integration

You can use the provided React component to display workflow status:

```jsx
import { WorkflowDashboard } from '@your-org/cloudflare-workflow-tracker/ui';

function App() {
  return (
    <div className="app">
      <h1>Workflow Dashboard</h1>
      <WorkflowDashboard
        websocketUrl="wss://your-worker.workers.dev/api/tracker-websocket"
      />
    </div>
  );
}
```

## Configuration

### wrangler.toml Example

Your wrangler.toml should contain:

```toml
name = "your-worker"
main = "src/index.js"

# D1 database
[[d1_databases]]
binding = "DB"
database_name = "workflow_tracker"
database_id = "your-database-id"

# Durable Object
[durable_objects]
bindings = [
  { name = "WORKFLOW_TRACKER", class_name = "WorkflowTracker" }
]

[[migrations]]
tag = "workflow-tracker-v1"
new_classes = ["WorkflowTracker"]

# For cross-worker communication
[vars]
SERVICE_API_KEY = "your-secret-api-key"

# Optional: Direct workflow bindings
[[workflows]]
binding = "EMAIL_CAMPAIGN"
entry_point = "EmailCampaignWorkflow"
```

## Advanced Usage

### Custom Retry Logic

```javascript
// Custom retry with exponential backoff
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

### Error Handling

```javascript
try {
  const result = await trackStep(...);
} catch (error) {
  // Check retry information
  if (error.retryCount) {
    console.log(`Failed, will retry ${error.retryCount}/${maxRetries} at ${error.nextRetryAt}`);
  }

  // Mark as non-retryable
  error.nonRetryable = true;
  throw error;
}
```

## API Reference

Full API documentation can be found in the [API.md](./API.md) file.

## License

MIT
