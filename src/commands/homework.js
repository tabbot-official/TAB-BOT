import {imageAiCommand} from './_imageai.js';
import {geminiVision} from '../ai/providers.js';

export const PROMPT = 'You are a patient school tutor. The image shows a homework question (maths, science, language or any school subject). ' +
  'Read the question carefully, then solve it step by step: show each step briefly with a short reason, then give the final answer on its own line starting with "Answer:". ' +
  'Use plain text only (no LaTeX, no markdown tables): write fractions like 3/4 and powers like x^2. ' +
  'Reply in the same language as the question (if it is Hinglish, reply in Hinglish). ' +
  'If several questions are visible, solve them in order. If the image is not a school question or is unreadable, say so in one sentence. ' +
  'Keep it kind, clear and family-friendly. Do not help with cheating on a live exam.';

export default imageAiCommand({
  name: 'homework', aliases: ['solve', 'hw'], description: 'Photo of a homework question to step-by-step solution',
  perMinute: 2, perHourDefault: 30, gpu: false, maxSide: 1600, service: 'Google Gemini', format: 'Solution',
  work: async (jpeg, o) => (await geminiVision(jpeg, PROMPT, o)).text,
});
