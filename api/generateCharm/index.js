const { BlobServiceClient } = require("@azure/storage-blob");
const { TableClient } = require("@azure/data-tables");
const { OpenAI } = require("openai");
const sharp = require("sharp");

module.exports = async function (context, req) {
  const { sessionId } = req.body;

  // Fetch metadata from Table Storage
  const tableClient = TableClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING,
    "CharmMetadata"
  );
  let metadata;
  try {
    metadata = await tableClient.getEntity("charms", sessionId);
  } catch (err) {
    context.res = { status: 404, body: "Session not found" };
    return;
  }
  const { name, birthdate, goal } = metadata;

  // Initialize Azure OpenAI
  const openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    deployment: "gpt35"
  });

  // Generate charm
  const response = await openai.chat.completions.create({
    model: "gpt-35-turbo",
    messages: [{ role: "user", content: `Create a fun luck charm for ${name}, born ${birthdate}, goal ${goal}. Include a short quote, emoji combo, and one-sentence mantra.` }]
  });
  const charmText = response.choices[0].message.content;

  // Create image
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

  // SAS URL
  const sasUrl = await blockBlobClient.generateSasUrl({
    startsOn: new Date(),
    expiresOn: new Date(Date.now() + 3600 * 1000),
    permissions: "r"
  });

  context.res = { status: 200, body: { downloadUrl: sasUrl, charmText } };
};