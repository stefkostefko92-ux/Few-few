// CRUD колекция — generic фабрика (виж src/lib/crud.ts)
import { rottaCollezione } from "@/lib/crud";
import { impiantiMedia } from "@/lib/entities";

export const { GET, POST } = rottaCollezione(impiantiMedia);
