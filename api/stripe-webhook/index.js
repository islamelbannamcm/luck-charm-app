const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    context.log.error(`Webhook error: ${err.message}`);
    context.res = { status: 400 };
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { name, birthdate, goal, sessionId } = session.metadata;

    // Save to Azure Table Storage
    const tableClient = TableClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING,
      "CharmMetadata"
    );
    await tableClient.createTable();
    await tableClient.upsertEntity({
      partitionKey: "charms",
      rowKey: sessionId,
      name,
      birthdate,
      goal
    });

    context.log(`Stored metadata for ${sessionId}`);
  }

  context.res = { status: 200 };
};