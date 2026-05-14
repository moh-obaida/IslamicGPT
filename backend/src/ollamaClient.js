const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

async function callOllama({ model, prompt, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }

    if (!response.ok) throw new Error(data.error || text || `HTTP ${response.status}`);
    return { ok: true, text: data.response || '' };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'model_timeout' : 'ollama_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callOllama };
