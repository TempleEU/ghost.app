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
          .replace(/^[\d*.)\]\s-]+/, "")
          .replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "")
          .trim(),
      )
      .filter((l) => l.length > 0)
      .slice(0, 3);
    return { replies, used: result.used };
  },
});
