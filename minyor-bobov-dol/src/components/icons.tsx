"use client";

// Централен иконен модул: всички икони са Phosphor (weight="fill"), изнесени
// под кратки имена. Така иконографията е консистентна на едно място.
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  CalendarDots as PhCalendarDots,
  CaretDown as PhCaretDown,
  CaretRight as PhCaretRight,
  CheckCircle as PhCheckCircle,
  CircleHalf as PhCircleHalf,
  Clock as PhClock,
  Envelope as PhEnvelope,
  Hand as PhHand,
  Images as PhImages,
  Info as PhInfo,
  MapPin as PhMapPin,
  Moon as PhMoon,
  Newspaper as PhNewspaper,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Phone as PhPhone,
  ShieldCheck as PhShieldCheck,
  SoccerBall as PhSoccerBall,
  Ticket as PhTicket,
  TextT as PhTextT,
  Tray as PhTray,
  Trophy as PhTrophy,
  TShirt as PhTShirt,
  Users as PhUsers,
  X as PhX,
} from "@phosphor-icons/react";

export type AppIcon = ComponentType<IconProps>;

function fill(Cmp: ComponentType<IconProps>): AppIcon {
  function Icon(props: IconProps) {
    return <Cmp weight="fill" {...props} />;
  }
  return Icon;
}

export const ArrowRight = fill(PhArrowRight);
export const CalendarDays = fill(PhCalendarDots);
export const CaretRight = fill(PhCaretRight);
export const CheckCircle2 = fill(PhCheckCircle);
export const ChevronDown = fill(PhCaretDown);
export const Clock = fill(PhClock);
export const Contrast = fill(PhCircleHalf);
export const ExternalLink = fill(PhArrowSquareOut);
export const Hand = fill(PhHand);
export const Images = fill(PhImages);
export const Inbox = fill(PhTray);
export const Info = fill(PhInfo);
export const Mail = fill(PhEnvelope);
export const MapPin = fill(PhMapPin);
export const Moon = fill(PhMoon);
export const Newspaper = fill(PhNewspaper);
export const Phone = fill(PhPhone);
export const Send = fill(PhPaperPlaneTilt);
export const ShieldCheck = fill(PhShieldCheck);
export const SoccerBall = fill(PhSoccerBall);
export const Ticket = fill(PhTicket);
export const Trophy = fill(PhTrophy);
export const Shirt = fill(PhTShirt);
export const Type = fill(PhTextT);
export const Users = fill(PhUsers);
export const X = fill(PhX);
