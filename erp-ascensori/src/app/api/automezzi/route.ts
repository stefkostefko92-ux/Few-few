// CRUD колекция — generic фабрика (виж src/lib/crud.ts)
import { rottaCollezione } from "@/lib/crud";
import { automezzi } from "@/lib/entities";

export const { GET, POST } = rottaCollezione(automezzi);
