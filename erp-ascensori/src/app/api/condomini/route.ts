// CRUD колекция — generic фабрика (виж src/lib/crud.ts)
import { rottaCollezione } from "@/lib/crud";
import { condomini } from "@/lib/entities";

export const { GET, POST } = rottaCollezione(condomini);
