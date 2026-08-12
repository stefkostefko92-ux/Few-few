// bot/src/events/guildMemberAdd.js
// Fires when a member joins a guild. Handles:
//   - Autorole (give roles automatically)
//   - Welcomer embed in a channel
//   - Welcomer DM
//
// Server-level settings loaded from backend.

import { PermissionsBitField } from "discord.js";
import api from "../utils/api.js";
import { interpolate } from "../utils/variables.js";
import { logServerEvent } from "../utils/serverEventLog.js";
import { BRAND } from "../utils/colors.js";
import { isRoleSafeToSelfAssign } from "../utils/reactionRoles.js";

// Правата, БЕЗ които приветствието в канал физически не може да излезе.
// Embed Links е в списъка, защото пращаме embed: без него Discord отказва
// съобщението изцяло, а не го праща като обикновен текст.
const WELCOME_PERMISSIONS = [
  { flag: PermissionsBitField.Flags.ViewChannel, name: "View Channel" },
  { flag: PermissionsBitField.Flags.SendMessages, name: "Send Messages" },
  { flag: PermissionsBitField.Flags.EmbedLinks, name: "Embed Links" },
];

export default {
  name: "guildMemberAdd",
  once: false,
  async execute(member) {
    if (!member?.guild?.id) return;

    // ─── Server Event Logging (category "members", action "member_join") ──────
    // Fail-safe util — не хвърля; не пипаме welcomer/autorole логиката отдолу.
    logServerEvent(member.client, member.guild, {
      category: "members",
      action: "member_join",
      targetId: member.id,
      targetTag: member.user?.tag || member.user?.username || null,
      actorId: member.id,
    });

    let server;
    try {
      const { data } = await api.get(`/bot/server/${member.guild.id}`);
      server = data;
    } catch (err) {
      // Гол `catch { return; }` значеше, че при недостъпен backend НИТО
      // welcomer-ът, НИТО autorole-ът сработват — и никой не научава. Собственикът
      // вижда „новите членове не получават роля" без никаква следа защо.
      // (Разбивача, 07.08.2026)
      console.warn(
        `[guildMemberAdd] конфигурацията за guild ${member.guild.id} е недостъпна (${err?.message}) — welcomer и autorole се пропускат за ${member.user?.tag ?? member.id}`,
      );
      return;
    }

    if (!server) {
      console.warn(`[guildMemberAdd] guild ${member.guild.id} няма запис в backend-а — welcomer и autorole се пропускат`);
      return;
    }

    // ─── 1. Autorole ──────────────────────────────────────────────────────────
    const roleIdsToAssign = member.user.bot
      ? (server.autoroleBotIds || [])
      : (server.autoroleIds || []);

    // Гард срещу ескалация на права — същият, който Reaction Roles има от
    // 05.08.2026, но autorole беше БЕЗ него, при това е по-опасен: прилага се
    // автоматично на ВСЕКИ влизащ, без никакво действие от негова страна.
    //
    // Сценарият: админ с Manage Server (който сам може да НЯМА Administrator)
    // задава autorole → роля с Administrator. Всеки нов член става администратор
    // и йерархията на Discord е заобиколена през нашия бот. Отказваме и логваме
    // ясно — по-добре необичайна конфигурация да не сработи, отколкото тих
    // превзет сървър. (Разбивача, 07.08.2026)
    const botMember = member.guild.members.me;
    for (const roleId of roleIdsToAssign) {
      const role = member.guild.roles.cache.get(roleId)
        || await member.guild.roles.fetch(roleId).catch(() => null);
      if (!isRoleSafeToSelfAssign(role, botMember)) {
        console.warn(
          `[autorole] ОТКАЗАНА роля ${roleId} в guild ${member.guild.id}: опасни права, managed или над ботската роля`,
        );
        continue;
      }
      try {
        await member.roles.add(roleId, "Autorole on join");
      } catch (err) {
        // Common cause: role hierarchy — bot role must be above target role
        console.warn(`[autorole] Failed to add ${roleId} to ${member.user.tag}: ${err.message}`);
      }
    }

    // ─── 1б. „Лепкави роли": връщане на ролите отпреди напускането ────────────
    //
    // Минава през СЪЩИЯ гард като autorole (`isRoleSafeToSelfAssign`), и то по
    // по-силна причина: снимката е направена в миналото, а междувременно ролята
    // може да е получила опасни права или да е вдигната над ботската. Връщаме
    // само каквото е безопасно СЕГА, не каквото е било безопасно тогава.
    //
    // Ботовете се пропускат: техните роли са managed и се дават от интеграцията.
    if (server.stickyRolesEnabled && !member.user.bot) {
      try {
        const { data } = await api.get(`/bot/member-roles/${member.guild.id}/${member.id}`);
        const saved = Array.isArray(data?.roleIds) ? data.roleIds : [];
        if (saved.length) {
          const restored = [];
          const skipped = [];
          for (const roleId of saved) {
            const role = member.guild.roles.cache.get(roleId)
              || await member.guild.roles.fetch(roleId).catch(() => null);
            if (!isRoleSafeToSelfAssign(role, botMember)) { skipped.push(roleId); continue; }
            try {
              await member.roles.add(roleId, "Sticky roles — restored on rejoin");
              restored.push(roleId);
            } catch (err) {
              skipped.push(roleId);
              console.warn(`[sticky-roles] ролята ${roleId} не беше върната на ${member.user.tag}: ${err.message}`);
            }
          }
          if (skipped.length) {
            console.warn(
              `[sticky-roles] guild ${member.guild.id}: върнати ${restored.length}, пропуснати ${skipped.length} ` +
              "(изтрити, managed, с опасни права или над ботската роля)",
            );
          }
          // Снимката се чисти чак СЛЕД успешно връщане — ако ботът е бил офлайн
          // или без права, тя остава за следващия опит.
          if (restored.length) {
            await api.delete(`/bot/member-roles/${member.guild.id}/${member.id}`).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[sticky-roles] връщането за ${member.id} пропадна: ${err?.message}`);
      }
    }

    // Build interpolation context for welcomer messages
    const ctx = {
      user: { id: member.id, username: member.user.username, tag: member.user.tag },
      server: { id: member.guild.id, name: member.guild.name },
      memberCount: member.guild.memberCount,
    };

    // ─── 2. Welcomer channel ──────────────────────────────────────────────────
    if (server.welcomerEnabled) await sendWelcomeToChannel(member, server, ctx);

    // ─── 3. Welcomer DM ───────────────────────────────────────────────────────
    if (server.welcomerDmEnabled && server.welcomerDmMessage) {
      try {
        const content = interpolate(server.welcomerDmMessage, ctx);
        await member.user.send({
          embeds: [{
            title: `Welcome to ${member.guild.name}!`,
            description: content,
            color: parseHex(server.welcomerEmbedColor),
            // Иконата на сървъра в DM-а: получателят вижда ОТКЪДЕ идва
            // съобщението, вместо гола кутия от непознат бот.
            thumbnail: member.guild.iconURL ? { url: member.guild.iconURL({ size: 128 }) } : undefined,
            footer: { text: member.guild.name },
            timestamp: new Date().toISOString(),
          }],
        });
      } catch { /* DMs disabled */ }
    }
  },
};

// ─── Приветствието в канал — с ПРИЧИНА при провал ───────────────────────────
//
// ЗАЩО ОТДЕЛНА ФУНКЦИЯ (сигнал от собственика, 07.08.2026: „welcome message in
// channel doesn't work"): старият код беше едно `if` с три условия и
// `.catch(() => {})` накрая. Тоест при ВСЯКА от петте различни причини да не се
// изпрати — изключен канал, изтрит канал, чужд/сгрешен ID, липсващо право,
// отказ от Discord — резултатът беше един и същ: нищо, никъде, без следа.
// „Не работи" без причина не е диагностицируемо: собственикът гледа таблото,
// вижда включена функция и няма как да разбере, че ботът няма Embed Links в
// точно този канал.
//
// Функцията НЕ променя кога се праща — само прави мълчанието проговарящо.
async function sendWelcomeToChannel(member, server, ctx) {
  const guild = member.guild;
  const where = `guild ${guild.id}`;

  if (!server.welcomerChannelId) {
    console.warn(`[welcomer] ${where}: включен е, но няма избран канал — Settings → Welcomer → Channel ID`);
    return;
  }
  if (!server.welcomerMessage) {
    console.warn(`[welcomer] ${where}: включен е, но съобщението е празно — нищо за пращане`);
    return;
  }

  // `guild.channels.fetch` хвърля за чужд канал — точно каквото искаме: ID от
  // друг сървър не бива да получи нашето съобщение.
  const channel = await guild.channels.fetch(server.welcomerChannelId).catch((e) => {
    console.warn(`[welcomer] ${where}: канал ${server.welcomerChannelId} не е намерен (${e?.message}) — изтрит, сгрешен ID или от друг сървър`);
    return null;
  });
  if (!channel) return;
  if (typeof channel.send !== "function") {
    console.warn(`[welcomer] ${where}: канал ${channel.id} е от тип, в който не се пише (категория/форум?)`);
    return;
  }

  // Проверката на правата ПРЕДИ пращането дава конкретното име на липсващото
  // право. Без нея Discord връща само „Missing Permissions" и човекът гадае кое.
  const me = guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  const missing = perms
    ? WELCOME_PERMISSIONS.filter(({ flag }) => !perms.has(flag)).map(({ name }) => name)
    : [];
  if (missing.length) {
    console.warn(`[welcomer] ${where}: ботът няма ${missing.join(", ")} в #${channel.name} — съобщението не може да се изпрати`);
    return;
  }

  try {
    await channel.send({
      embeds: [{
        title: `👋 Welcome to ${guild.name}!`,
        description: interpolate(server.welcomerMessage, ctx),
        color: parseHex(server.welcomerEmbedColor),
        thumbnail: { url: member.user.displayAvatarURL({ size: 128 }) },
        footer: { text: `Member #${guild.memberCount}` },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (err) {
    console.warn(`[welcomer] ${where}: Discord отказа изпращането в #${channel.name}: ${err?.message}`);
  }
}

function parseHex(hex) {
  if (!hex) return BRAND;
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : BRAND;
}
