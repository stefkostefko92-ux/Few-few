// bot/src/utils/channelTypes.js
// Човеко-четими имена на Discord типовете канали. Суровият enum (0, 2, 4…) в
// лог embed не значи нищо на собственика на сървъра.
import { ChannelType } from "discord.js";

export const CHANNEL_TYPE_LABELS = {
  [ChannelType.GuildText]: "Text",
  [ChannelType.GuildVoice]: "Voice",
  [ChannelType.GuildCategory]: "Category",
  [ChannelType.GuildAnnouncement]: "Announcement",
  [ChannelType.AnnouncementThread]: "Announcement thread",
  [ChannelType.PublicThread]: "Public thread",
  [ChannelType.PrivateThread]: "Private thread",
  [ChannelType.GuildStageVoice]: "Stage",
  [ChannelType.GuildForum]: "Forum",
  [ChannelType.GuildMedia]: "Media",
};
