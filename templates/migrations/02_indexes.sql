-- Create indexes for better query performance
-- Indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances (status);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_ref_id ON workflow_instances (ref_id);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_ref_type ON workflow_instances (ref_type);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow_definition_id ON workflow_instances (workflow_definition_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_instance_id ON workflow_steps (workflow_instance_id);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON workflow_steps (status);

CREATE INDEX IF NOT EXISTS idx_step_retries_workflow_step_id ON step_retries (workflow_step_id);

CREATE INDEX IF NOT EXISTS idx_step_retries_retry_at ON step_retries (retry_at);
