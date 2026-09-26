/**
 * Админ панел — маршрутизация. Самите екрани живеят в ./admin/ (разделени
 * по област), общите UI блокове — в ./admin/ui.tsx, преводите — в
 * src/i18n/admin/{en,bg,it}.json. Достъпът се пази и на сървъра
 * (authRequired + adminRequired на всеки /api/admin/* маршрут).
 */
import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import AdminLayout from './admin/Layout';
import Overview, { Server } from './admin/Overview';
import { Items, Monsters, Quests } from './admin/Catalog';
import Users from './admin/Users';
import Characters from './admin/Characters';
import Guilds from './admin/Guilds';
import { Auction, Marketplace, Purchases, Trades } from './admin/Economy';
import { BattlePass, Bounties, Tower, TrialCache } from './admin/Features';
import { RealmBoss, Season } from './admin/World';
import Moderation from './admin/Moderation';
import Chat from './admin/Chat';
import Content from './admin/Content';
import Mail from './admin/Mail';
import { Logs, Settings, Webhooks } from './admin/System';

export { AdminLayout };

export default function Admin(): React.ReactElement {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Overview />} />
        <Route path="items" element={<Items />} />
        <Route path="monsters" element={<Monsters />} />
        <Route path="quests" element={<Quests />} />
        <Route path="content" element={<Content />} />
        <Route path="users" element={<Users />} />
        <Route path="characters" element={<Characters />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="auction" element={<Auction />} />
        <Route path="trades" element={<Trades />} />
        <Route path="guilds" element={<Guilds />} />
        <Route path="realm-boss" element={<RealmBoss />} />
        <Route path="season" element={<Season />} />
        <Route path="tower" element={<Tower />} />
        <Route path="bounties" element={<Bounties />} />
        <Route path="battlepass" element={<BattlePass />} />
        <Route path="trial-purchases" element={<TrialCache />} />
        <Route path="settings" element={<Settings />} />
        <Route path="logs" element={<Logs />} />
        <Route path="webhooks" element={<Webhooks />} />
        <Route path="mail" element={<Mail />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="chat" element={<Chat />} />
        <Route path="server" element={<Server />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
