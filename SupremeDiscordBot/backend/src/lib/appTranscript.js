// backend/src/lib/appTranscript.js
// Markdown транскрипт на application отговори — ползва се и от dashboard
// маршрутите (applications.js), и от bot маршрутите (bot.js), за да е
// каналът Discord ↔ dashboard в пълен паритет.
export function buildTranscript(questions, answers) {
  return questions
    .map((q) => `**${q.label}**\n${answers[q.id] || "*No answer*"}`)
    .join("\n\n");
}
