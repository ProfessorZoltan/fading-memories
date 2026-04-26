import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a thoughtful observer reading a person's private journal entries from the past week.
The entries fade after 72 hours — the writer never re-reads them. Your job is to surface a single
honest, specific pattern you noticed across the entries: a recurring feeling, a name that comes up,
a tension between what they want and what they're doing, something they keep circling back to.

Constraints:
- Output 2 to 4 sentences. No headers, no bullet points, no preamble like "It seems..." or "I noticed...".
- Be specific. Reference concrete details from the entries (names, situations, exact phrases) rather than vague summaries.
- Do not be saccharine or therapeutic. Don't offer advice unless a pattern clearly calls for it.
- If the entries are too sparse or unrelated to find a real pattern, say so plainly in one sentence.
- Never quote entries verbatim at length. A short phrase in quotes is fine; full sentences are not.`;

app.post('/api/synthesize', async (req, res) => {
  const { entries } = req.body || {};

  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'Need at least one entry to synthesize.' });
  }

  const formatted = entries
    .map((e, i) => {
      const when = e.createdAt ? new Date(e.createdAt).toISOString().slice(0, 10) : '';
      return `Entry ${i + 1}${when ? ` (${when})` : ''}:\n${e.text}`;
    })
    .join('\n\n---\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: formatted }],
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.json({ insight: text });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
      res.status(502).json({ error: 'The synthesis service is unavailable right now. Try again later.' });
    } else {
      console.error('Unexpected error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  }
});

app.listen(port, () => {
  console.log(`Fading Memories running on http://localhost:${port}`);
});
