const { BlobServiceClient } = require("@azure/storage-blob");
const { OpenAI } = require("openai"); // Changed to openai npm
const sharp = require("sharp");

module.exports = async function (context, req) {
  const { sessionId } = req.body;
  // TODO: Fetch metadata (name, birthdate, goal) from Azure Table or webhook metadata
  const { name, birthdate, goal } = { name: "Test", birthdate: "1990-01-01", goal: "job" }; // Placeholder

  // Initialize Azure OpenAI
  const openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: "gpt35" // Your deployment name
  });

  // Generate charm
  const response = await openai.chat.completions.create({
    model: "gpt-35-turbo",
    messages: [{ role: "user", content: `Create a fun luck charm for ${name}, born ${birthdate}, goal ${goal}. Include a short quote, emoji combo, and one-sentence mantra.` }]
  });
  const charmText = response.choices[0].message.content;

  // Create simple image
  const imageBuffer = await sharp({
    create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 1 } }
  })
    .composite([{ input: Buffer.from(`<svg><text x="200" y="150" text-anchor="middle" fill="white" font-size="20">${charmText.split('\n')[0]}</text></svg>`), gravity: "center" }])
    .png()
    .toBuffer();

  // Upload to Blob
  const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  const containerClient = blobServiceClient.getContainerClient("luck-charms");
  await containerClient.createIfNotExists();
  const blobName = `${sessionId}.png`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(imageBuffer, imageBuffer.length);

  // SAS URL (1-hour expiry)
  const sasUrl = await blockBlobClient.generateSasUrl({
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + 3600 * 1000),
    permissions: "r"
  });

  context.res = { status: 200, body: { downloadUrl: sasUrl, charmText } };
};