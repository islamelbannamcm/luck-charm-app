const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function (context, req) {
  try {
    // Extract data from request
    const { name, birthdate, email, goal, amount, payment_type } = req.body;
    
    // Validate required fields
    if (!name || !birthdate || !email || !goal) {
      context.log.error('Missing required fields');
      context.res = {
        status: 400,
        body: { error: 'Missing required fields' }
      };
      return;
    }
    
    // Log the request for debugging
    context.log('Creating checkout session with data:', { name, email, goal, payment_type });
    
    // Get the domain from env or use a fallback
    const domain = process.env.AZURE_STATIC_WEB_APPS_URL || 'https://mango-bay-0415c0603.3.azurestaticapps.net';
    context.log('Using domain:', domain);
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'apple_pay'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Personal Luck Charm',
              description: 'Your custom AI-generated luck talisman',
            },
            unit_amount: amount || 100, // Default to $1.00
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${domain}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}?canceled=true`,
      metadata: {
        name,
        birthdate,
        goal,
        email
      },
      customer_email: email, // Pre-fill customer email
    });
    
    // Return the session ID
    context.log('Created session:', session.id);
    context.res = {
      status: 200,
      body: { sessionId: session.id }
    };
    
  } catch (error) {
    // Log and return error
    context.log.error('Error creating checkout session:', error);
    context.res = {
      status: 500,
      body: { 
        error: 'Error creating checkout session',
        message: error.message
      }
    };
  }
};