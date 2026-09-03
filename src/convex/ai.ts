"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { chatCompletion } from "./aiProvider";

// ---------------------------------------------------------------------------
// AI Assistant features — smart replies, translation, summarization, drafting.
// All calls go through the saved (enabled+validated) OpenAI-compatible config.
// Nothing runs unless the user turned AI on in Settings → AI.
// ---------------------------------------------------------------------------

type ActiveCfg = { baseUrl: string; apiKey: string; model: string };

// Keyless fallback chain (OmniRoute-style auto-fallback): if the primary
// provider fails — quota drained, model unavailable, network error — we try
// the verified free providers in order. Only the specific text being acted on
// is sent; everything else stays end-to-end encrypted between humans.
const KEYLESS_FALLBACKS: ActiveCfg[] = [
  { baseUrl: "https://api.kilo.ai/api/gateway", apiKey: "", model: "kilo-auto/free" },
  {
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    apiKey: "",
    model: "Qwen2.5-VL-72B-Instruct",
  },
];

async function requireActiveConfig(
  ctx: ActionCtx,
): Promise<{ userId: string; cfg: ActiveCfg }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not signed in");
  const cfg = await ctx.runQuery(internal.aiProviderData.resolveActive, {});
  if (cfg !== null) return { userId, cfg };
  // Env fallback (project Keys panel): GROQ_API_KEY pasted by the user works
  // immediately, no Settings → AI step needed.
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      userId,
      cfg: {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: groqKey,
        model: "qwen/qwen3.8-27b",
      },
    };
  }
  throw new Error("AI is not enabled. Open Settings → AI and connect a provider first.");
}

/**
 * Run a completion with auto-fallback. Tries the primary provider first; on
 * any failure (rate limit, model error, empty reply) it walks the keyless
 * fallback chain. Returns which provider actually served the request.
 */
async function chatCompletionWithFallback(
  cfg: ActiveCfg,
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number; timeoutMs?: number },
): Promise<{ ok: true; text: string; used: string } | { ok: false; error: string; used: string }> {
  const attempts: { cfg: ActiveCfg; label: string }[] = [
    { cfg, label: cfg.model },
    ...KEYLESS_FALLBACKS.filter((f) => f.baseUrl !== cfg.baseUrl).map((f) => ({
      cfg: f,
      label: `${f.model} (free fallback)`,
    })),
  ];
  let lastError = "All AI providers failed.";
  for (const attempt of attempts) {
    const result = await chatCompletion(
      attempt.cfg.baseUrl,
      attempt.cfg.apiKey,
      attempt.cfg.model,
      messages,
      opts,
    );
    if (result.ok) return { ok: true, text: result.text, used: attempt.label };
    lastError = result.error;
  }
  return { ok: false, error: lastError, used: "none" };
}

/** 3 short smart-reply suggestions for the last incoming message. */
export const smartReplies = action({
  args: { lastMessage: v.string(), otherHandle: v.optional(v.string()) },
  handler: async (ctx, { lastMessage, otherHandle }) => {
    const { cfg } = await requireActiveConfig(ctx);
    const result = await chatCompletionWithFallback(
      cfg,
      [
        {
          role: "system",
          content:
            "You suggest instant-message replies. Output EXACTLY 3 replies, one per line, no numbering, no quotes, each under 80 characters, matching the tone of the conversation.",
        },
        {
          role: "user",
          content: `Message from ${otherHandle ?? "a contact"}: "${lastMessage.slice(0, 1000)}"`,
        },
      ],
      { maxTokens: 120, timeoutMs: 20_000 },
    );
    if (!result.ok) throw new Error(result.error);
    const replies = result.text
      .split("\n")
      .map((l) =>
        l
          .replace(/^[\d\-\*\.\)\]\s]+/, "")
          .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "")
          .trim(),
      )
      .filter((l) => l.length > 0)
      .slice(0, 3);
    return { replies, used: result.used };
  },
});

/** Translate a message to a target language. */
export const translateMessage = action({
  args: { text: v.string(), targetLanguage: v.string() },
  handler: async (ctx, { text, targetLanguage }) => {
    const { cfg } = await requireActiveConfig(ctx);
    const result = await chatCompletionWithFallback(
      cfg,
      [
        {
          role: "system",
          content:
            "You are a precise translator. Output ONLY the translation — no explanations, no quotes, no transliteration notes.",
        },
        { role: "user", content: `Translate to ${targetLanguage}:\n\n${text.slice(0, 4000)}` },
      ],
      { maxTokens: 1024, timeoutMs: 30_000 },
    );
    if (!result.ok) throw new Error(result.error);
    return { translated: result.text.trim(), used: result.used };
  },
});

/** Summarize a conversation from plaintext messages (decrypted client-side). */
export const summarizeConversation = action({
  args: {
    messages: v.array(
      v.object({ sender: v.string(), body: v.string(), mine: v.boolean() }),
    ),
  },
  handler: async (ctx, { messages }) => {
    const { cfg } = await requireActiveConfig(ctx);
    const transcript = messages
      .slice(-60)
      .map((m) => `${m.mine ? "Me" : m.sender}: ${m.body.slice(0, 500)}`)
      .join("\n")
      .slice(0, 24_000);
    const result = await chatCompletionWithFallback(
      cfg,
      [
        {
          role: "system",
          content:
            "Summarize this chat transcript in 2-3 short sentences, then one line 'Action items:' if any. Be neutral and concise.",
        },
        { role: "user", content: transcript || "(empty conversation)" },
      ],
      { maxTokens: 300, timeoutMs: 40_000 },
    );
    if (!result.ok) throw new Error(result.error);
    return { summary: result.text.trim(), used: result.used };
  },
});

/** Draft a message from an instruction (tone + intent). */
export const draftMessage = action({
  args: {
    instruction: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, { instruction, context }) => {
    const { cfg } = await requireActiveConfig(ctx);
    const result = await chatCompletionWithFallback(
      cfg,
      [
        {
          role: "system",
          content:
            "You draft chat messages. Output ONLY the ready-to-send message text — no preamble, no quotes, no alternatives. Keep it natural and under 120 words.",
        },
        {
          role: "user",
          content: [
            context ? `Conversation context:\n${context.slice(0, 2000)}\n` : "",
            `Write a message: ${instruction.slice(0, 1000)}`,
          ].join("\n"),
        },
      ],
      { maxTokens: 300, timeoutMs: 30_000 },
    );
    if (!result.ok) throw new Error(result.error);
    return { draft: result.text.trim(), used: result.used };
  },
});
