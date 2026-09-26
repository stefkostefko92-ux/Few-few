// CRUD елемент — generic фабрика (виж src/lib/crud.ts)
import { rottaElemento } from "@/lib/crud";
import { impianti } from "@/lib/entities";

export const { GET, PUT, DELETE } = rottaElemento(impianti);
