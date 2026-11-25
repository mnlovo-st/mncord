import { DirectionProvider } from '@radix-ui/react-direction';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import splash from '../assets/splash.webm';
import { TooltipProvider } from '../ui/Tooltip';
import { refresh, setSignedOutHandler } from './api';
import { connectGateway, disconnectGateway } from './gateway';
import { AuthScreen } from './screens/Auth';
import { Shell } from './screens/Shell';
import { set } from './store';
import { leaveVoice } from './voice';

type Phase = 'boot' | 'auth' | 'app';

export function App() {
  const { i18n, t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('boot');
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    setSignedOutHandler(() => {
      void leaveVoice();
      disconnectGateway();
      set({ me: null, guilds: {}, guildOrder: [], messages: {}, loaded: {}, voice: {} });
      setPhase('auth');
    });
    const minSplash = new Promise((r) => setTimeout(r, 1200));
    void Promise.all([refresh().catch(() => false), minSplash]).then(([ok]) => {
      if (ok) {
        connectGateway();
        setPhase('app');
      } else setPhase('auth');
    });
  }, []);

  const signedIn = () => {
    connectGateway();
    setPhase('app');
  };

  return (
    <DirectionProvider dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
      <TooltipProvider>
        {phase === 'boot' || !splashDone ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black" aria-busy="true">
            <div className="flex flex-col items-center gap-4">
              <video src={splash} autoPlay muted playsInline onEnded={() => setSplashDone(true)} onError={() => setSplashDone(true)} className="w-[min(560px,70vw)]" />
              <p className="text-sm text-[#a3aec4]">{t('app.loading')}</p>
            </div>
          </div>
        ) : null}
        {phase === 'auth' && <AuthScreen onSignedIn={signedIn} />}
        {phase === 'app' && <Shell />}
      </TooltipProvider>
    </DirectionProvider>
  );
}
