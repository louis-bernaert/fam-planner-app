import { fr } from "./fr";
import { en } from "./en";

export type Translations = typeof fr;
export type Language = "fr" | "en";

export const translations: Record<Language, Translations> = { fr, en };
