import { DirectionProvider } from '@radix-ui/react-direction';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import splash from '../assets/splash.webm';
import { TooltipProvider } from '../ui/Tooltip';
import { refresh, setSignedOutHandler } from './api';
import { connectGateway, disconnectGateway } from './gateway';
import { AuthScreen } from './screens/Auth';
import { Shell } from './screens/Shell';
import { TitleBar } from './TitleBar';
import { gateState, PendingGate, VerifyEmailGate } from './screens/Gate';
import type { SelfUser } from '@mncord/shared';
import { set } from './store';
import { leaveVoice } from './voice';

type Phase = 'boot' | 'auth' | 'verify' | 'pending' | 'app';

export function App() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('boot');
  const [splashDone, setSplashDone] = useState(false);
  const [me, setMe] = useState<SelfUser | null>(null);
  // signed in → is the email verified, has the owner approved this account? then open the app
  const enter = async () => {
    try {
      const g = await gateState();
      setMe(g.me);
      if (g.state === 'ok') {
        if (g.me.isOwner) void import('./screens/Approvals').then((m) => m.refreshPending());
        connectGateway();
        setPhase('app');
      } else setPhase(g.state);
    } catch {
      setPhase('auth');
    }
  };

  useEffect(() => {
    setSignedOutHandler(() => {
      void leaveVoice();
      disconnectGateway();
      set({ me: null, guilds: {}, guildOrder: [], messages: {}, loaded: {}, voice: {} });
      setPhase('auth');
    });
    const minSplash = new Promise((r) => setTimeout(r, 1200));
    void Promise.all([refresh().catch(() => false), minSplash]).then(([ok]) => {
      if (ok) void enter();
      else setPhase('auth');
    });
  }, []);

  const signedIn = () => void enter();

  const titlebar = window.mncord?.platform === 'win32';
  return (
    <DirectionProvider dir="ltr">
      <TooltipProvider>
        {titlebar && <TitleBar app={phase === 'app'} />}
        {phase === 'boot' || !splashDone ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black" aria-busy="true">
            <div className="flex flex-col items-center gap-4">
              <video src={splash} autoPlay muted playsInline onEnded={() => setSplashDone(true)} onError={() => setSplashDone(true)} className="w-[min(560px,70vw)]" />
              <p className="text-sm text-[#a3aec4]">{t('app.loading')}</p>
            </div>
          </div>
        ) : null}
        {phase === 'auth' && <AuthScreen onSignedIn={signedIn} />}
        {phase === 'verify' && me && <VerifyEmailGate me={me} onDone={() => void enter()} />}
        {phase === 'pending' && <PendingGate onApproved={() => void enter()} />}
        {phase === 'app' && <Shell />}
      </TooltipProvider>
    </DirectionProvider>
  );
}
