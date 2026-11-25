// backend/src/lib/serverSettingsSchema.js
// Валидация на настройките за влизане на нов член (PATCH /api/servers/:id): автоматични
// роли и текстове за посрещане. Преди това списъкът с роли и текстовете се
// записваха както дойдат: дълъг списък значеше десетки REST заявки при ВСЯКО
// влизане през общия бот, а текст над лимита на Discord правеше посрещането
// да изчезне тихо (З8).
import { z } from "zod";

const SNOWFLAKE = /^\d{17,20}$/;
export const MAX_AUTOROLES = 20;
export const MAX_WELCOME_TEXT = 2000;

const roleList = z.array(z.string().regex(SNOWFLAKE, "invalid role id")).max(MAX_AUTOROLES).nullable().optional();
const text = z.string().max(MAX_WELCOME_TEXT).nullable().optional();
// „#rrggbb“ (или без #); празно = подразбиращият се цвят.
const color = z.union([z.literal(""), z.string().regex(/^#?[0-9a-fA-F]{6}$/, "invalid hex color")]).nullable().optional();

export const memberJoinSettingsSchema = z.object({
  autoroleIds: roleList,
  autoroleBotIds: roleList,
  welcomerMessage: text,
  welcomerDmMessage: text,
  welcomerEmbedColor: color,
});
