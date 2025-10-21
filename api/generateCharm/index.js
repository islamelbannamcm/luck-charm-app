const { BlobServiceClient } = require("@azure/storage-blob");
const { TableClient } = require("@azure/data-tables");
const { OpenAI } = require("openai");
const sharp = require("sharp");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function (context, req) {
  try {
    // Extract payment ID (could be session ID or payment intent ID)
    const { paymentId, sessionId } = req.body;
    
    // Use paymentId if provided, otherwise fall back to sessionId
    const id = paymentId || sessionId;
    
    if (!id) {
      context.log.error('No paymentId or sessionId provided');
      context.res = {
        status: 400,
        body: { error: 'No payment identifier provided' }
      };
      return;
    }
    
    context.log('Generating charm for payment:', id);
    
    // Verify payment with Stripe (optional but recommended)
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      
      // Check if payment was successful
      if (session.payment_status !== 'paid') {
        context.log.error('Payment not completed', session.payment_status);
        context.res = {
          status: 400,
          body: { error: 'Payment not completed' }
        };
        return;
      }
      
      context.log('Payment verified successful');
    } catch (stripeError) {
      // If not found, continue anyway - might be in table storage
      context.log.warn('Could not verify payment with Stripe:', stripeError.message);
    }

    // Fetch metadata from Table Storage
    const tableClient = TableClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING,
      "CharmMetadata"
    );
    
    let metadata;
    try {
      metadata = await tableClient.getEntity("charms", id);
      context.log('Retrieved metadata from Table Storage');
    } catch (tableError) {
      context.log.error('Error retrieving metadata:', tableError);
      context.res = { 
        status: 404, 
        body: { 
          error: "Session not found in Table Storage",
          message: tableError.message
        }
      };
      return;
    }
    
    const { name, birthdate, goal } = metadata;
    context.log(`Generating charm for ${name} with goal: ${goal}`);

    // Initialize Azure OpenAI
    const openai = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: "gpt35"
    });

    // Generate charm text
    context.log('Requesting charm text from OpenAI');
    const response = await openai.chat.completions.create({
      model: "gpt-35-turbo",
      messages: [{ 
        role: "user", 
        content: `Create a fun luck charm for ${name}, born ${birthdate}, goal ${goal}. Include a short quote, emoji combo, and one-sentence mantra. Make it feel magical and personal.` 
      }]
    });
    
    const charmText = response.choices[0].message.content;
    context.log('Received charm text from OpenAI');

    // Create image
    context.log('Generating charm image');
    const imageBuffer = await sharp({
      create: { 
        width: 400, 
        height: 300, 
        channels: 4, 
        background: { r: 0, g: 100, b: 200, alpha: 1 } 
      }
    })
      .composite([{ 
        input: Buffer.from(
          `<svg><text x="200" y="150" text-anchor="middle" fill="white" font-size="20">${charmText.split('\n')[0]}</text></svg>`
        ), 
        gravity: "center" 
      }])
      .png()
      .toBuffer();
    
    context.log('Charm image generated');

    // Upload to Blob Storage
    context.log('Uploading to Blob Storage');
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    
    const containerClient = blobServiceClient.getContainerClient("luck-charms");
    await containerClient.createIfNotExists();
    
    const blobName = `${id}.png`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(imageBuffer, imageBuffer.length);
    
    context.log(`Charm image uploaded as ${blobName}`);

    // Generate SAS URL for download
    const sasUrl = await blockBlobClient.generateSasUrl({
      startsOn: new Date(),
      expiresOn: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours
      permissions: "r"
    });
    
    context.log('Generated SAS URL for download');

    // Return success response
    context.res = { 
      status: 200, 
      body: { 
        success: true,
        downloadUrl: sasUrl, 
        charmText,
        // Add a symbol class for the preview
        charmSymbol: getSymbolForGoal(goal)
      } 
    };
    
  } catch (error) {
    context.log.error('Unhandled error in generateCharm:', error);
    context.res = {
      status: 500,
      body: { 
        error: 'Error generating charm',
        message: error.message
      }
    };
  }
};

// Helper function to get a symbol class based on goal
function getSymbolForGoal(goal) {
  const goalSymbols = {
    'job': 'fas fa-briefcase',
    'date': 'fas fa-heart',
    'exam': 'fas fa-graduation-cap',
    'money': 'fas fa-coins',
    'health': 'fas fa-heartbeat',
    'other': 'fas fa-magic'
  };
  
  return goalSymbols[goal.toLowerCase()] || 'fas fa-magic';
}