const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
  try {
    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      context.log.error('No Stripe signature provided');
      context.res = { status: 400, body: 'Webhook Error: No signature provided' };
      return;
    }
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      context.log.error(`Webhook signature verification failed: ${err.message}`);
      context.res = { status: 400, body: `Webhook Error: ${err.message}` };
      return;
    }

    // Log event for debugging
    context.log(`Received Stripe event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Log session details for debugging
      context.log(`Processing completed checkout session: ${session.id}`);
      context.log(`Payment status: ${session.payment_status}`);
      
      if (session.payment_status === 'paid') {
        // Extract metadata
        const { name, birthdate, goal } = session.metadata || {};
        const email = session.customer_email || session.metadata?.email;
        
        // Use session.id as the row key - this is critical
        const sessionId = session.id;
        
        context.log(`Customer data: ${name}, ${birthdate}, ${goal}, ${email}`);
        
        try {
          // Save to Azure Table Storage
          const tableClient = TableClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING,
            "CharmMetadata"
          );
          
          // Create table if it doesn't exist
          await tableClient.createTable();
          
          // Store metadata with the correct session ID
          await tableClient.upsertEntity({
            partitionKey: "charms",
            rowKey: sessionId, // Use the actual session ID from Stripe
            name,
            birthdate,
            goal,
            email,
            timestamp: new Date().toISOString(),
            paymentStatus: session.payment_status
          });

          context.log(`Successfully stored metadata for session ${sessionId}`);
        } catch (storageError) {
          context.log.error(`Error saving to Table Storage: ${storageError.message}`);
          // Continue processing even if storage fails
        }
      } else {
        context.log.warn(`Session ${session.id} not paid. Status: ${session.payment_status}`);
      }
    }

    // Return success to acknowledge the webhook
    context.res = { status: 200, body: { received: true } };
    
  } catch (error) {
    context.log.error(`Unhandled webhook error: ${error.message}`);
    context.res = { status: 500, body: { error: error.message } };
  }
};