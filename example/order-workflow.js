// examples/order-workflow.js
import {
  trackStep,
  updateWorkflowRun,
} from "@biggidea/flowflare/workflow";

/**
 * Example workflow for order processing
 */
export class OrderProcessingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // Extract parameters
    const {
      ref_id, // Order ID
      ref_type, // Should be "order"
      customer, // Customer information
      items, // Array of ordered items
      paymentInfo, // Payment information
      shippingAddress, // Shipping address
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
      // Step 1: Validate order
      const validationResult = await trackStep(
        this.env,
        step.instanceId,
        "validate-order",
        1,
        async () => {
          // Validate items, stock, etc.
          const validation = await this.validateOrder(items);

          if (!validation.valid) {
            throw new Error(`Order validation failed: ${validation.reason}`);
          }

          return validation;
        },
      );

      // Step 2: Process payment (high retry count for payment processing)
      const paymentResult = await trackStep(
        this.env,
        step.instanceId,
        "process-payment",
        2,
        async () => {
          // Process payment
          const payment = await this.processPayment(paymentInfo, {
            amount: validationResult.total,
            orderId: ref_id,
            customerId: customer.id,
          });

          if (!payment.success) {
            throw new Error(`Payment failed: ${payment.reason}`);
          }

          return payment;
        },
        {
          maxRetries: 5,
          baseDelay: 5000,
          backoffType: "exponential",
        },
      );

      // Step 3: Reserve inventory
      const inventoryResult = await trackStep(
        this.env,
        step.instanceId,
        "reserve-inventory",
        3,
        async () => {
          // Reserve items in inventory
          const inventory = await this.reserveInventory(items, ref_id);

          if (!inventory.success) {
            throw new Error(
              `Inventory reservation failed: ${inventory.reason}`,
            );
          }

          return inventory;
        },
      );

      // Step 4: Generate fulfillment order
      const fulfillmentResult = await trackStep(
        this.env,
        step.instanceId,
        "create-fulfillment",
        4,
        async () => {
          // Create fulfillment order
          const fulfillment = await this.createFulfillment({
            orderId: ref_id,
            items,
            shippingAddress,
            customer,
          });

          return fulfillment;
        },
      );

      // Step 5: Send confirmation email (sleep a bit to make sure everything is ready)
      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Sleeping",
          sleep_until: new Date(Date.now() + 30000).toISOString(), // 30 seconds
        },
        this.env,
      );

      await step.sleep("pre-email-delay", "30 seconds");

      await updateWorkflowRun(
        {
          id: step.instanceId,
          status: "Running",
        },
        this.env,
      );

      const emailResult = await trackStep(
        this.env,
        step.instanceId,
        "send-confirmation",
        5,
        async () => {
          // Send confirmation email
          const email = await this.sendConfirmationEmail({
            to: customer.email,
            orderId: ref_id,
            items,
            paymentInfo: {
              amount: paymentResult.amount,
              method: paymentResult.method,
              last4: paymentResult.last4,
            },
            fulfillment: {
              trackingNumber: fulfillmentResult.trackingNumber,
              carrier: fulfillmentResult.carrier,
              estimatedDelivery: fulfillmentResult.estimatedDelivery,
            },
          });

          return email;
        },
      );

      // Final result
      const finalResult = {
        success: true,
        orderId: ref_id,
        customerId: customer.id,
        payment: {
          transactionId: paymentResult.transactionId,
          amount: paymentResult.amount,
        },
        fulfillment: {
          id: fulfillmentResult.id,
          trackingNumber: fulfillmentResult.trackingNumber,
          carrier: fulfillmentResult.carrier,
        },
        timestamps: {
          ordered: new Date().toISOString(),
          estimatedDelivery: fulfillmentResult.estimatedDelivery,
        },
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
            orderId: ref_id,
          }),
        },
        this.env,
      );

      throw error;
    }
  }

  // Mock methods to simulate order processing operations

  async validateOrder(items) {
    console.log(`Validating order with ${items.length} items`);

    // Calculate total
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return {
      valid: true,
      total,
      items: items.length,
    };
  }

  async processPayment(paymentInfo, options) {
    console.log(
      `Processing payment of $${options.amount} for order ${options.orderId}`,
    );

    // Simulate payment processing
    return {
      success: true,
      transactionId: `tx_${Date.now()}`,
      amount: options.amount,
      method: paymentInfo.type,
      last4: paymentInfo.cardNumber ? paymentInfo.cardNumber.slice(-4) : null,
    };
  }

  async reserveInventory(items, orderId) {
    console.log(`Reserving inventory for order ${orderId}`);

    // Simulate inventory reservation
    return {
      success: true,
      items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        warehouseId: "wh_123",
      })),
    };
  }

  async createFulfillment(options) {
    console.log(`Creating fulfillment for order ${options.orderId}`);

    // Simulate fulfillment creation
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 3); // 3 days from now

    return {
      id: `ful_${Date.now()}`,
      orderId: options.orderId,
      trackingNumber: `TRK${Math.floor(Math.random() * 1000000)}`,
      carrier: "FedEx",
      estimatedDelivery: estimatedDelivery.toISOString(),
      items: options.items.length,
    };
  }

  async sendConfirmationEmail(options) {
    console.log(
      `Sending confirmation email to ${options.to} for order ${options.orderId}`,
    );

    // Simulate sending email
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      sentTo: options.to,
      subject: `Order Confirmation: ${options.orderId}`,
    };
  }
}
