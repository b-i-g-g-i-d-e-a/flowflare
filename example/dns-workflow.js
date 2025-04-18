// examples/dns-workflow.js
import {
  trackStep,
  updateWorkflowRun,
} from "@biggidea/flowflare/workflow";

/**
 * Example workflow for DNS zone registration and configuration
 */
export class DnsRegistrationWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Extract parameters
    const {
      ref_id, // Could be a customer ID or order ID
      ref_type, // Likely "domain" or "dns-registration"
      domain, // Domain name to register
      nameservers, // Array of nameservers
      ttl = 3600, // Time to live in seconds
      records = [], // DNS records to create
    } = event.payload;

    // Initialize workflow run in tracker
    await updateWorkflowRun(
      {
        id: step.instanceId,
        status: "Running",
        ref_id,
        ref_type,
        input_params: JSON.stringify(event.payload),
        metadata: JSON.stringify({
          triggeredBy: event.payload.triggeredBy || "system",
          source: event.payload.source || "api",
          environment: process.env.NODE_ENV || "production"
        }),
      },
      this.env,
    );

    try {
      // Step 1: Validate domain and check availability
      const validationResult = await trackStep(
        this.env,
        step.instanceId,
        "validate-domain",
        1,
        async () => {
          // Simulate validation check using Cloudflare API
          const validation = await this.validateDomain(domain);

          if (!validation.available) {
            throw new Error(
              `Domain ${domain} is not available for registration`,
            );
          }

          return validation;
        },
      );

      // Step 2: Register the domain with nameservers
      const registrationResult = await trackStep(
        this.env,
        step.instanceId,
        "register-domain",
        2,
        async () => {
          // Simulate domain registration
          const registration = await this.registerDomain(domain, nameservers);

          // If registration fails, this will throw and be retried
          if (!registration.success) {
            throw new Error(`Failed to register domain: ${registration.error}`);
          }

          return registration;
        },
      );

      // Step 3: Configure DNS records (might be slow, so we use sleep)
      // Update state to sleeping
      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Sleeping",
          sleep_until: new Date(Date.now() + 60000).toISOString(), // 1 minute
        },
        this.env,
      );

      // Sleep to allow DNS propagation
      await step.sleep("dns-propagation", "1 minute");

      // Update state to running again
      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Running",
        },
        this.env,
      );

      // Step 4: Create DNS records
      const dnsResult = await trackStep(
        this.env,
        step.instanceId,
        "configure-dns",
        3,
        async () => {
          const results = [];

          // Create each DNS record
          for (const record of records) {
            try {
              const result = await this.createDnsRecord(domain, {
                type: record.type,
                name: record.name,
                content: record.content,
                ttl: record.ttl || ttl,
              });

              results.push({
                record: record,
                success: true,
                id: result.id,
              });
            } catch (error) {
              // We'll continue even if some records fail
              results.push({
                record: record,
                success: false,
                error: error.message,
              });
            }
          }

          return {
            totalRecords: records.length,
            successfulRecords: results.filter((r) => r.success).length,
            records: results,
          };
        },
      );

      // Step 5: Verify DNS propagation
      const verificationResult = await trackStep(
        this.env,
        step.instanceId,
        "verify-dns",
        4,
        async () => {
          // Sleep is internal to this step - different from the workflow sleep
          await new Promise((resolve) => setTimeout(resolve, 5000));

          const verification = await this.verifyDns(domain);
          return verification;
        },
      );

      // Final result
      const finalResult = {
        success: true,
        domain,
        ref_id,
        ref_type,
        registration: registrationResult,
        dns: dnsResult,
        verification: verificationResult,
        timestamp: new Date().toISOString(),
      };

      // Mark workflow as completed with output
      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Completed",
          completed_at: new Date().toISOString(),
          output_result: JSON.stringify(finalResult),
        },
        this.env,
      );

      return finalResult;
    } catch (error) {
      // Handle error and update workflow status
      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Errored",
          output_result: JSON.stringify({
            success: false,
            error: error.message,
            domain,
            ref_id,
            ref_type,
          }),
        },
        this.env,
      );

      throw error;
    }
  }

  // Mock methods to simulate DNS operations
  // In a real implementation, these would call Cloudflare API or other providers

  async validateDomain(domain) {
    // Simulate API call to check domain availability
    console.log(`Validating domain: ${domain}`);
    return { available: true, domain };
  }

  async registerDomain(domain, nameservers) {
    // Simulate API call to register domain
    console.log(
      `Registering domain: ${domain} with nameservers: ${nameservers.join(", ")}`,
    );
    return { success: true, domain, nameservers };
  }

  async createDnsRecord(domain, record) {
    // Simulate API call to create DNS record
    console.log(
      `Creating ${record.type} record for ${record.name}.${domain}: ${record.content}`,
    );
    return { id: crypto.randomUUID(), success: true };
  }

  async verifyDns(domain) {
    // Simulate API call to verify DNS propagation
    console.log(`Verifying DNS propagation for: ${domain}`);
    return { propagated: true, domain };
  }
}
