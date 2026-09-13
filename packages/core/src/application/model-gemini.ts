import { PlannerProposalSchema } from '@releaseproof/contracts';
import type { ModelPort } from '../providers/ports.js';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const modelCandidates = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export function createGeminiModel(apiKey: string, preferredModel?: string): ModelPort {
  let resolvedModel: Promise<string> | undefined;
  const model = () => resolvedModel ??= selectModel(apiKey, preferredModel);
  return {
    async complete({ instructions, messages, tools }) {
      const selected = await model();
      const response = await request(apiKey, selected, {
        systemInstruction: { parts: [{ text: instructions }] },
        contents: toContents(messages),
        tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) }],
        generationConfig: { responseMimeType: 'application/json' }
      });
      if (!response.ok) return { kind: 'incomplete', reason: response.reason };
      const candidate = firstCandidate(response.value);
      if (!candidate) return { kind: 'incomplete', reason: 'Gemini returned no candidate.' };
      const calls = candidate.parts.filter((part) => isRecord(part.functionCall)).map((part, index) => {
        const call = asRecord(part.functionCall);
        return { id: String(call.id ?? `gemini-call-${index}`), name: String(call.name ?? ''), arguments: asRecord(call.args) };
      });
      if (calls.length > 0) return { kind: 'tool_calls', context: [{ type: 'gemini_model_content', content: candidate.raw }], calls };
      const text = candidate.parts.map((part) => typeof part.text === 'string' ? part.text : '').join('').trim();
      if (!text) return { kind: 'malformed', reason: 'Gemini returned neither a tool call nor JSON output.' };
      try {
        const parsed = PlannerProposalSchema.safeParse(JSON.parse(text));
        return parsed.success ? { kind: 'proposal', proposal: parsed.data } : { kind: 'malformed', reason: 'Gemini JSON did not match the proposal schema.' };
      } catch {
        return { kind: 'malformed', reason: 'Gemini returned malformed proposal JSON.' };
      }
    }
  };
}

export async function smokeTestGeminiStructuredOutput(apiKey: string, preferredModel?: string): Promise<{ ok: true; model: string } | { ok: false; reason: string }> {
  try {
    const model = await selectModel(apiKey, preferredModel);
    const response = await request(apiKey, model, {
      contents: [{ role: 'user', parts: [{ text: 'Return JSON only: {"title":"fixture prerelease"}.' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } }
      }
    });
    if (!response.ok) return { ok: false, reason: response.reason };
    const text = firstCandidate(response.value)?.parts.map((part) => typeof part.text === 'string' ? part.text : '').join('') ?? '';
    const value = JSON.parse(text) as { title?: unknown };
    return typeof value.title === 'string' && value.title.trim() ? { ok: true, model } : { ok: false, reason: 'Structured output was missing title.' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Gemini smoke failed.' };
  }
}

async function selectModel(apiKey: string, preferredModel?: string): Promise<string> {
  if (preferredModel) return preferredModel.replace(/^models\//, '');
  const response = await fetch(`${API_ROOT}/models`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Gemini model discovery returned HTTP ${response.status}.`);
  const value = await response.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  const available = new Set((value.models ?? []).filter((item) => item.supportedGenerationMethods?.includes('generateContent')).map((item) => String(item.name ?? '').replace(/^models\//, '')));
  const selected = modelCandidates.find((candidate) => available.has(candidate));
  if (!selected) throw new Error('No supported Gemini generateContent model was available for this API key. Set GEMINI_MODEL explicitly.');
  return selected;
}

async function request(apiKey: string, model: string, body: unknown): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetch(`${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) return { ok: false, reason: `Gemini returned HTTP ${response.status}.` };
    return { ok: true, value: await response.json() };
  } catch (error) { return { ok: false, reason: error instanceof Error ? error.name : 'Gemini transport failure.' }; }
}

function toContents(messages: unknown[]): unknown[] {
  const contents: unknown[] = [];
  for (const message of messages) {
    const record = asRecord(message);
    if (record.type === 'gemini_model_content') { contents.push(record.content); continue; }
    if (record.type === 'function_call_output') {
      const call = messages.find((candidate) => { const item = asRecord(candidate); return item.type === 'function_call' && item.call_id === record.call_id; });
      const functionCall = asRecord(call);
      contents.push({ role: 'user', parts: [{ functionResponse: { id: String(record.call_id ?? ''), name: String(functionCall.name ?? ''), response: { output: safeJson(record.output) } } }] });
      continue;
    }
    if (record.role === 'user') contents.push({ role: 'user', parts: [{ text: String(record.content ?? '') }] });
  }
  return contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Prepare the release proposal.' }] }];
}

function firstCandidate(value: unknown): { raw: unknown; parts: Record<string, unknown>[] } | null {
  const response = asRecord(value);
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate.content); const parts = Array.isArray(content.parts) ? content.parts.map(asRecord) : [];
  return parts.length ? { raw: { role: 'model', parts }, parts } : null;
}
function safeJson(value: unknown): unknown { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return { error: 'non-json tool output' }; } }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object'; }
function asRecord(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {}; }
