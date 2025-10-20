const stripe = require('stripe')('sk_test_YOUR_STRIPE_SECRET_KEY'); // Replace with secret key

module.exports = async function (context, req) {
  const { name, birthdate, goal, sessionId } = req.body;

  // Store temp data in context.log or Azure Table (simple: use session metadata)
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'apple_pay'],
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Luck Charm' }, unit_amount: 100 }, quantity: 1 }],
    mode: 'payment',
    success_url: `${process.env.AZURE_STATIC_WEB_APPS_URL}?success=true&session=${sessionId}`,
    cancel_url: `${process.env.AZURE_STATIC_WEB_APPS_URL}?canceled=true`,
    metadata: { name, birthdate, goal, sessionId } // Pass data to webhook
  });

  context.res = { status: 200, body: { sessionId: session.id } };
};