require('dotenv').config({ path: '../.env' });
const { Pinecone } = require('@pinecone-database/pinecone');
const { Mistral } = require('@mistralai/mistralai');
const knowledgeBase = require('./src/data/knowledgeBase.json');

const pcApiKey = process.env.PINECONE_API_KEY;
if (!pcApiKey) throw new Error("PINECONE_API_KEY is missing from .env");
const pc = new Pinecone({ apiKey: pcApiKey });

const mistralApiKey = process.env.MISTRAL_API_KEY;
if (!mistralApiKey) throw new Error("MISTRAL_API_KEY is missing from .env");
const mistral = new Mistral({ apiKey: mistralApiKey });

async function main() {
  const indexName = "support-knowledge";
  const index = pc.Index(indexName);

  console.log("Generating embeddings...");
  const texts = knowledgeBase.map(doc => `Title: ${doc.title}\nCategory: ${doc.category}\nContent: ${doc.content}\nTags: ${doc.tags?.join(", ")}`);

  console.log('Sending to Mistral...', texts.length, 'documents');
  const response = await mistral.embeddings.create({
    model: "mistral-embed",
    inputs: texts,
  });

  console.log('Response DATA:', response.data ? response.data.length : 'no data');
  if (!response.data || response.data.length === 0) return;

  const vectors = response.data.map((emb, i) => ({
    id: knowledgeBase[i].id,
    values: emb.embedding,
    metadata: {
      title: knowledgeBase[i].title,
      category: knowledgeBase[i].category,
      content: knowledgeBase[i].content,
      snippet: knowledgeBase[i].content.substring(0, 500)
    }
  }));

  console.log("Upserting vectors...", vectors.length);
  await index.upsert({ records: vectors });
  console.log("Done!");
}

main().catch(console.error);
