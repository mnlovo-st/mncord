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
import { playSoundEl } from './sounds';
import { preloadSuppression } from '../media/micChain';

type Phase = 'boot' | 'auth' | 'verify' | 'pending' | 'app';

export function App() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('boot');
  const [splashDone, setSplashDone] = useState(false);
  const [me, setMe] = useState<SelfUser | null>(null);
  // first time an approved account opens the app: welcome sound, and at its 3rd second the app flies in
  const [welcome, setWelcome] = useState<'playing' | 'entering' | null>(null);
  // signed in → is the email verified, has the owner approved this account? then open the app
  const enter = async () => {
    try {
      const g = await gateState();
      setMe(g.me);
      if (g.state === 'ok') {
        if (g.me.isOwner) void import('./screens/Approvals').then((m) => m.refreshPending());
        connectGateway();
        setPhase('app');
        preloadSuppression();
        void import('./activity').then((m) => m.startActivityWatcher());
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
  const approved = () => {
    const key = `mncord.welcomed.${me?.id ?? ''}`;
    let done = false;
    try {
      done = localStorage.getItem(key) === '1';
      localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: show it anyway */
    }
    if (done) return void enter();
    setWelcome('playing');
    const a = playSoundEl('welcome');
    let gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      setWelcome('entering');
      void enter();
      setTimeout(() => setWelcome(null), 1700);
    };
    setTimeout(go, 3400); // fallback when the sound can't play
    if (a) {
      const tick = () => (a.currentTime >= 3 || a.ended ? go() : !gone && requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }
  };

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
        {phase === 'pending' && welcome === null && <PendingGate onApproved={approved} />}
        {phase === 'app' && <div className={welcome === 'entering' ? 'welcome-enter h-full' : 'h-full'}><Shell /></div>}
        {welcome && (
          <div className={`fixed inset-0 z-[60] grid place-items-center bg-black ${welcome === 'entering' ? 'welcome-veil' : 'anim-fade'}`}>
            <div className="flex flex-col items-center">
              <video src={splash} autoPlay muted loop playsInline className="logo-blend w-[min(560px,70vw)]" />
              <p className="anim-slide-up mt-2 font-display text-2xl font-bold text-white">{t('gate.welcome')}</p>
            </div>
          </div>
        )}
      </TooltipProvider>
    </DirectionProvider>
  );
}
