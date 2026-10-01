import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import SiteHeader from './SiteHeader';
import Footer from './Footer';
import MachineStage from './machine/MachineStage';

// The frame of the pages around the sign-in (registration, confirmation, forgotten and new password): the form on
// the left, the still of the machine on the right on wide screens, as on the sign-in itself.
export default async function AuthPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const tl = await getTranslations('landing');
  return (
    <>
      <SiteHeader showLogin={false} />
      <main className="signin">
        <div className="signin-form">
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
          {children}
        </div>
        <MachineStage alt={tl('machineAlt')} caption={tl('machineCaption')} live={false} sizes="(min-width: 1320px) 660px, 50vw" />
      </main>
      <Footer />
    </>
  );
}
