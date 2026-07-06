// backend/src/lib/pollUpdate.js
// Loads a poll, tallies votes per option, and pushes POLL_UPDATE to the bot so it
// re-renders the Discord message in its closed state (final counts, buttons off).
// Shared by the dashboard close route and the scheduler auto-close job so both
// produce the same payload the bot's /internal/poll-update route expects.
import { prisma } from "./prisma.js";
import { notifyBot } from "../services/botNotifier.js";

export async function pushPollUpdate(pollId) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: { votes: true },
  });
  if (!poll || !poll.messageId) return;

  const options = poll.options.map((label, i) => ({
    label,
    votes: poll.votes.filter((v) => v.option === i).length,
  }));

  await notifyBot("POLL_UPDATE", {
    pollId: poll.id,
    channelId: poll.channelId,
    messageId: poll.messageId,
    question: poll.question,
    options,
    totalVotes: poll.votes.length,
    multiChoice: poll.multiChoice,
    closed: !!poll.closedAt,
  }).catch(() => {});
}
