"use client";


// Централен иконен модул: всички икони са Phosphor (weight="fill"),
// изнесени под старите (Lucide) имена, за да не променяме JSX-а никъде.
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import {
  ArrowRight as PhArrowRight,
  ArrowSquareOut as PhArrowSquareOut,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowsLeftRight as PhArrowsLeftRight,
  Bank as PhBank,
  BookOpen as PhBookOpen,
  BowlSteam as PhBowlSteam,
  Buildings as PhBuildings,
  Bus as PhBus,
  CalendarBlank as PhCalendarBlank,
  CalendarDots as PhCalendarDots,
  Camera as PhCamera,
  Car as PhCar,
  ChatCircle as PhChatCircle,
  ChatText as PhChatText,
  CheckCircle as PhCheckCircle,
  Church as PhChurch,
  CircleHalf as PhCircleHalf,
  Clock as PhClock,
  Cloud as PhCloud,
  CloudFog as PhCloudFog,
  CloudRain as PhCloudRain,
  CloudSnow as PhCloudSnow,
  CloudSun as PhCloudSun,
  Coins as PhCoins,
  Cross as PhCross,
  CurrencyEur as PhCurrencyEur,
  Drop as PhDrop,
  Ear as PhEar,
  Envelope as PhEnvelope,
  Factory as PhFactory,
  FileText as PhFileText,
  Fire as PhFire,
  Hand as PhHand,
  Handshake as PhHandshake,
  Heartbeat as PhHeartbeat,
  Images as PhImages,
  Info as PhInfo,
  Keyboard as PhKeyboard,
  Lightning as PhLightning,
  ListChecks as PhListChecks,
  Lock as PhLock,
  MapPin as PhMapPin,
  Megaphone as PhMegaphone,
  Money as PhMoney,
  Moon as PhMoon,
  Mountains as PhMountains,
  Newspaper as PhNewspaper,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Phone as PhPhone,
  PhoneX as PhPhoneX,
  Plus as PhPlus,
  Printer as PhPrinter,
  Prohibit as PhProhibit,
  Question as PhQuestion,
  ShieldCheck as PhShieldCheck,
  ShieldWarning as PhShieldWarning,
  SpeakerHigh as PhSpeakerHigh,
  Square as PhSquare,
  Stethoscope as PhStethoscope,
  Storefront as PhStorefront,
  Sun as PhSun,
  TextT as PhTextT,
  Train as PhTrain,
  Trash as PhTrash,
  Tray as PhTray,
  Tree as PhTree,
  Users as PhUsers,
  Warning as PhWarning,
  X as PhX,
} from "@phosphor-icons/react";

export type LucideIcon = ComponentType<IconProps>;

function fill(Cmp: ComponentType<IconProps>): LucideIcon {
  function Icon(props: IconProps) {
    return <Cmp weight="fill" {...props} />;
  }
  return Icon;
}

export const AlertTriangle = fill(PhWarning);
export const ArrowRight = fill(PhArrowRight);
export const ArrowRightLeft = fill(PhArrowsLeftRight);
export const Ban = fill(PhProhibit);
export const Banknote = fill(PhMoney);
export const BookOpen = fill(PhBookOpen);
export const Building2 = fill(PhBuildings);
export const Bus = fill(PhBus);
export const CalendarClock = fill(PhCalendarDots);
export const CalendarDays = fill(PhCalendarDots);
export const CalendarRange = fill(PhCalendarBlank);
export const Camera = fill(PhCamera);
export const Car = fill(PhCar);
export const CheckCircle2 = fill(PhCheckCircle);
export const Church = fill(PhChurch);
export const Clock = fill(PhClock);
export const Cloud = fill(PhCloud);
export const CloudFog = fill(PhCloudFog);
export const CloudRain = fill(PhCloudRain);
export const CloudSnow = fill(PhCloudSnow);
export const CloudSun = fill(PhCloudSun);
export const Coins = fill(PhCoins);
export const Contrast = fill(PhCircleHalf);
export const Cross = fill(PhCross);
export const Droplets = fill(PhDrop);
export const Ear = fill(PhEar);
export const Euro = fill(PhCurrencyEur);
export const ExternalLink = fill(PhArrowSquareOut);
export const Factory = fill(PhFactory);
export const FileText = fill(PhFileText);
export const Flame = fill(PhFire);
export const Hand = fill(PhHand);
export const HeartHandshake = fill(PhHandshake);
export const HeartPulse = fill(PhHeartbeat);
export const HelpCircle = fill(PhQuestion);
export const Images = fill(PhImages);
export const Inbox = fill(PhTray);
export const Info = fill(PhInfo);
export const Keyboard = fill(PhKeyboard);
export const Landmark = fill(PhBank);
export const ListChecks = fill(PhListChecks);
export const Lock = fill(PhLock);
export const Mail = fill(PhEnvelope);
export const MapPin = fill(PhMapPin);
export const Megaphone = fill(PhMegaphone);
export const Moon = fill(PhMoon);
export const MessageCircle = fill(PhChatCircle);
export const MessageSquare = fill(PhChatText);
export const Mountain = fill(PhMountains);
export const Newspaper = fill(PhNewspaper);
export const Phone = fill(PhPhone);
export const PhoneOff = fill(PhPhoneX);
export const Plus = fill(PhPlus);
export const Printer = fill(PhPrinter);
export const RefreshCw = fill(PhArrowsClockwise);
export const Send = fill(PhPaperPlaneTilt);
export const ShieldAlert = fill(PhShieldWarning);
export const ShieldCheck = fill(PhShieldCheck);
export const Soup = fill(PhBowlSteam);
export const Square = fill(PhSquare);
export const Stethoscope = fill(PhStethoscope);
export const Store = fill(PhStorefront);
export const Sun = fill(PhSun);
export const TrainFront = fill(PhTrain);
export const Trash2 = fill(PhTrash);
export const TreePine = fill(PhTree);
export const Type = fill(PhTextT);
export const Users = fill(PhUsers);
export const Volume2 = fill(PhSpeakerHigh);
export const X = fill(PhX);
export const Zap = fill(PhLightning);
