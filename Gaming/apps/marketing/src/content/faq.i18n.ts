/** EN/IT translations of the site-wide FAQ (BG is the source of truth, see
 * faq.ts). Same order/length as SITE_FAQ so entries align index-by-index. */
import type { SiteFaq } from "./faq";

export const SITE_FAQ_I18N: Partial<Record<"en" | "it", SiteFaq[]>> = {
  en: [
    {
      question: "What is АСО?",
      answer:
        "АСО is a free browser portal for 21 classic real-time card, table and board games — Belote, Santase (Sixty-Six), Chess, Backgammon, pool, snooker and more — against friends and bots.",
    },
    {
      question: "Is it free?",
      answer:
        "Yes, all games are completely free. If you wish, you can buy cosmetics, comfort features or VIP, but never an in-game advantage.",
    },
    {
      question: "Is АСО gambling?",
      answer:
        "No. АСО is a social game. Wager games use only virtual chips, which have no monetary value and are never exchanged or paid out for real money.",
    },
    {
      question: "Do I need to install anything?",
      answer:
        "No — you play directly in your browser on a computer, tablet or phone, with no downloads.",
    },
    {
      question: "How do I start playing?",
      answer:
        "Sign up with email, Google or Facebook, pick a game from the lobby and start — there's also an instant match against a bot if no opponent is free.",
    },
    {
      question: "Are there pool and snooker?",
      answer:
        "Yes — pool (8-ball and 9-ball) and snooker have been added, with realistic physics, aiming and shot animation.",
    },
    {
      question: "What languages is the portal in?",
      answer: "The interface is available in Bulgarian, English and Italian.",
    },
    {
      question: "What age is it for?",
      answer: "АСО is for people aged 18 and over only.",
    },
  ],
  it: [
    {
      question: "Cos'è АСО?",
      answer:
        "АСО è un portale browser gratuito con 21 giochi classici di carte, da tavolo e da tavoliere in tempo reale — Belote, Santase (Sixty-Six), Scacchi, Backgammon, biliardo, snooker e altro — contro amici e bot.",
    },
    {
      question: "È gratuito?",
      answer:
        "Sì, tutti i giochi sono completamente gratuiti. Se vuoi, puoi acquistare oggetti estetici, funzioni di comfort o il VIP, ma mai un vantaggio di gioco.",
    },
    {
      question: "АСО è gioco d'azzardo?",
      answer:
        "No. АСО è un gioco sociale. I giochi con puntata usano solo gettoni virtuali, che non hanno valore monetario e non vengono mai scambiati né pagati in denaro reale.",
    },
    {
      question: "Devo installare qualcosa?",
      answer:
        "No — si gioca direttamente nel browser su computer, tablet o telefono, senza scaricare nulla.",
    },
    {
      question: "Come inizio a giocare?",
      answer:
        "Registrati con email, Google o Facebook, scegli un gioco dalla lobby e inizia — c'è anche una partita istantanea contro un bot se non ci sono avversari liberi.",
    },
    {
      question: "Ci sono biliardo e snooker?",
      answer:
        "Sì — sono stati aggiunti il biliardo (8 e 9 palle) e lo snooker, con fisica realistica, mira e animazione dei colpi.",
    },
    {
      question: "In quali lingue è il portale?",
      answer: "L'interfaccia è disponibile in bulgaro, inglese e italiano.",
    },
    {
      question: "Per quale età è?",
      answer: "АСО è riservato esclusivamente alle persone dai 18 anni in su.",
    },
  ],
};
