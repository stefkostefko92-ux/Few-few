// bot/src/i18n/en.js
// English — source of truth. All other languages translate against these keys.
export default {
  // Errors
  "error.blacklisted": "❌ You have been blacklisted from using this bot.",
  "error.formExpired": "❌ This form is no longer active. Please start over.",
  "error.componentExpired": "❌ This button no longer works — the panel it belongs to was changed or removed. Ask an admin to repost it.",
  "error.ticketCreateFailed": "❌ Couldn't open your ticket — our service is temporarily unavailable. Please try again in a moment.",
  "error.categoryNotFound": "❌ Category not found.",
  "error.serviceUnavailable.title": "⚠️ Service temporarily unavailable",
  "error.serviceUnavailable.body": "The backend didn't respond in time — this is usually temporary. Please try again in a moment.\n\n_Correlation ID: `{{id}}`_",
  "error.serviceUnavailable.button": "Check status",

  // Tickets
  "ticket.opened": "✅ Your ticket has been created: {{channel}}",
  "ticket.closedConfirm": "✅ Ticket closed.",
  "ticket.claimedConfirm": "👋 Ticket claimed by {{user}}",
  "ticket.claimStaffOnly": "❌ Only support team members can claim tickets.",
  "ticket.feedback.prompt": "Thanks for using our support! Please rate your experience:",
  "ticket.staffOnly": "❌ Only support team members can perform this action.",
  "ticket.notFound": "❌ This ticket no longer exists.",
  "ticket.unknownAction": "❌ Unknown ticket action.",
  "ticket.closeConfirmYes": "Yes, close",
  "ticket.closeConfirmCancel": "Cancel",
  "ticket.reopenedTitle": "🔓 Ticket Reopened",
  "ticket.reopenedBody": "Reopened by {{user}}.",
  "ticket.reopenedConfirm": "✅ Ticket reopened.",
  "ticket.transcriptLink": "📜 Transcript: {{url}}",
  "ticket.transcriptSaved": "📜 Transcript saved to archive channel.",
  "ticket.deleteConfirmPrompt": "🗑️ This will permanently delete the channel and its transcript reference. Are you sure?",
  "ticket.deleteConfirmYes": "Yes, delete",
  "ticket.deleteScheduled": "🗑️ This channel will be deleted in 5 seconds.",
  "ticket.priorityUpdated": "🎯 Priority set to **{{priority}}**.",
  "ticket.priorityStaffOnly": "❌ Only support team members can change ticket priority.",

  // Panels

  // Forms / Applications
  "form.dmCheck": "📬 Check your DMs to complete the form!",
  "form.cooldownActive": "❌ You can submit again in {{time}}.",
  "form.closedByAdmin": "❌ This form is currently closed.",
  "form.maxSubmissionsReached": "❌ You have already submitted this form the maximum number of times.",
  "form.alreadyActive": "⚠️ You already have an active form session. Please complete it first.",
  "form.dmFailed": "❌ I couldn't send you a DM. Please enable DMs from server members and try again.",
  "form.noQuestions": "❌ This form has no questions configured.",
  "form.cancelled": "❌ Form session cancelled.",
  "form.timeout": "⏰ Form session timed out. Please start over.",
  "form.requiredWarning": "⚠️ This question is required. Please provide an answer.",
  "form.tooShort": "⚠️ Answer too short (minimum {{min}} characters). Please try again.",
  "form.tooLong": "⚠️ Answer too long (maximum {{max}} characters). Please try again.",
  "form.invalidFormat": "⚠️ {{reason}}",
  "form.questionTitle": "📋 {{form}} — Question {{num}}/{{total}}",
  "form.requiredLabel": "*(required)*",
  "form.optionalLabel": "*(optional — type `skip` to skip)*",
  "form.cancelHint": 'Type "cancel" at any time to abort.',
  "form.submittedTitle": "✅ Form Submitted!",
  "form.submittedBody": "Thank you for completing the form. Your submission has been recorded.",
  "form.selectPlaceholder": "Choose an option...",
  "form.notAvailable": "❌ This form is no longer available. Please try again.",
  "form.invalidAnswersModal": "❌ Some answers don't match the expected format: **{{fields}}**. Please press the panel button and try again.",
  "form.submitFailed": "❌ Something went wrong submitting the form. Please try again.",
  "form.submittedConfirm": "✅ Submitted! Thank you.",

  // Verification
  "verify.wrongAnswer": "❌ Wrong answer. Try again.",
  "verify.accountTooNewHere": "❌ Your account must be at least **{{days}} days old** to verify here.",
  "verify.gateBlocked": "❌ You need to verify first. Please visit the verification channel.",
  "verify.panelNotFound": "❌ Verification panel not found.",
  "verify.challengeExpired": "⏰ Verification challenge expired. Please click Verify again.",
  "verify.modalTitle": "Verification Challenge",
  "verify.modalQuestionLabel": "What is {{question}}?",
  "verify.defaultSuccess": "✅ You're verified, {{user}}!",
  "verify.rolesGrantedSuffix": " Roles granted: {{count}}",

  // Polls & Giveaways

  // Sticky & Scheduled

  // Premium
  "premium.required": "❌ This feature requires Premium.",

  // Welcomer (member welcome message)

  // Welcome embed (posted by guildCreate when the bot joins a server)
  "welcome.title": "👋 Thanks for adding Supreme Bot!",
  "welcome.intro": "I run **ticket panels**, **application forms**, **polls & giveaways**, **verification gates**, and **scheduled/sticky messages** — all managed from the dashboard.",
  "welcome.quickStart": "**Quick start:**",
  "welcome.step1": "1. Click **Quick Setup** below (or run `/setup wizard`) to pick support roles + a ticket category.",
  "welcome.step2": "2. Open the dashboard to build panels, forms, and automation.",
  "welcome.step3": "3. Run `/help` any time for the full command list.",
  "welcome.missingPerms": "⚠️ Missing {{count}} permission(s)",
  "welcome.reinvite": "Re-invite with correct permissions",
  "welcome.dashboardButton": "Open Dashboard",
  "welcome.supportButton": "Support",
  "welcome.quickSetupButton": "Quick Setup",

  // Setup wizard (/setup wizard + "Quick Setup" button)
  "setup.noPermission": "❌ You need **Manage Server** permission to run the setup wizard.",
  "setup.noPermissionShort": "❌ You need **Manage Server** permission to use this.",
  "setup.step1.title": "🧙 Quick Setup",
  "setup.step1.desc": "Which role(s) should have access to support tickets? (up to 5)",
  "setup.step2.desc": "Which **category** should open tickets be created under? You can configure this per-panel later on the dashboard.",
  "setup.step3.desc": "Optional — pick a **log channel** for ticket open/close/claim events.",
  "setup.step4.title": "🧙 Quick Setup — almost done",
  "setup.step4.body": "Panels (the buttons users click to open tickets) are created on the dashboard, where you also set the welcome message, verification gate, and automation. Use the settings above when configuring your first panel.",
  "setup.done.title": "✅ Quick Setup complete",
  "setup.done.body": "Head to the dashboard to create your first ticket panel using the settings above, or run `/panel` once a panel exists.",
  "setup.syncComplete": "✅ Sync complete! Updated **{{count}}** panel(s).",
  "setup.skipButton": "Skip",
  "setup.doneButton": "Done",

  // Cooldowns
  "cooldown.newTicket": "⏳ Please wait {{seconds}}s before opening another ticket this way.",

  // AI disclosure (EU AI Act Article 50 — interacting with AI-generated content)
  "ai.disclosure.author": "🤖 AI-Generated Response",
  "ai.disclosure.title": "Automated AI Reply",
  "ai.disclosure.fieldName": "⚠️ AI Disclosure",
  "ai.disclosure.body": "This response was generated by an AI language model ({{model}}). It may contain errors or inaccuracies. A human staff member will follow up shortly for confirmation.",
  "ai.disclosure.footer": "Supreme Bot · AI Auto-Reply · Powered by Google Gemini",

  // Knowledge Base (v32) — auto-suggested article on new tickets
  "kb.suggest.title": "💡 This might help: {{title}}",
  "kb.suggest.footer": "Knowledge Base suggestion",
  "kb.suggest.helpfulButton": "Helpful",
  "kb.suggest.notHelpfulButton": "Not helpful",
  "kb.suggest.disclaimer": "_Suggested automatically — a staff member will still follow up._",
  "kb.feedback.thanksHelpful": "✅ Thanks for the feedback!",
  "kb.feedback.thanksNotHelpful": "📝 Thanks — a staff member will take a closer look.",
  "kb.feedback.error": "❌ Something went wrong recording your feedback.",
};
