// bot/src/utils/verificationEmbed.js
import {
  EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle,
} from "discord.js";

const styleMap = {
  PRIMARY:   ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS:   ButtonStyle.Success,
  DANGER:    ButtonStyle.Danger,
};

/**
 * Generate a math captcha question of the appropriate difficulty.
 * EASY: single-digit addition/subtraction
 * MEDIUM: two-digit addition/subtraction
 * HARD: three-digit or multiplication
 */
export function generateMathChallenge(difficulty = "EASY") {
  let a, b, op, answer, question;
  if (difficulty === "HARD") {
    a = 10 + Math.floor(Math.random() * 90);
    b = 2 + Math.floor(Math.random() * 8);
    op = "×";
    answer = a * b;
  } else if (difficulty === "MEDIUM") {
    a = 10 + Math.floor(Math.random() * 40);
    b = 10 + Math.floor(Math.random() * 40);
    op = Math.random() > 0.5 ? "+" : "−";
    answer = op === "+" ? a + b : a - b;
  } else {
    a = 1 + Math.floor(Math.random() * 9);
    b = 1 + Math.floor(Math.random() * 9);
    op = Math.random() > 0.3 ? "+" : "−";
    answer = op === "+" ? a + b : Math.abs(a - b);
    // Ensure subtraction doesn't produce negatives for EASY
    if (op === "−" && a < b) [a, b] = [b, a];
  }
  question = `${a} ${op} ${b}`;
  return { question, answer };
}

export function buildVerificationMessage(panel) {
  const color = parseInt(panel.color?.replace("#", "") || "00e5ff", 16);

  const embed = new EmbedBuilder()
    .setTitle(panel.title || "✅ Verify to access the server")
    .setColor(color);

  if (panel.description) embed.setDescription(panel.description);
  if (panel.imageUrl)    embed.setImage(panel.imageUrl);
  if (panel.thumbnailUrl)embed.setThumbnail(panel.thumbnailUrl);

  // Type hint за метода.
  // REACTION НЕ се предлага в UI: реакционната верификация би изисквала
  // GuildMessageReactions intent + MessageReaction/User partials + постоянен
  // messageReactionAdd listener — по-тежко и по-чупливо от бутона, който вече
  // работи. Затова REACTION панелите рендерират същия бутон (виж handleVerificationStart)
  // и не подканваме потребителя да „реагира", за да няма подвеждащ текст.
  const typeHint = {
    BUTTON:   "Click the button below to verify.",
    MATH:     "Click the button, then solve the simple math problem.",
  }[panel.type] || "Click the button below to verify.";
  embed.setFooter({ text: typeHint });

  const btn = new ButtonBuilder()
    .setCustomId(`verify:${panel.id}`)
    .setLabel(panel.buttonLabel || "Verify")
    .setStyle(styleMap[panel.buttonStyle] || ButtonStyle.Success);
  if (panel.buttonEmoji) btn.setEmoji(panel.buttonEmoji);

  const row = new ActionRowBuilder().addComponents(btn);

  return { embeds: [embed], components: [row] };
}
