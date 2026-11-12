import numpy as np, scipy.io.wavfile as w, sys
sr=48000; rng=np.random.default_rng(3)
def speech(sec, level=0.06):
    n=int(sec*sr); x=rng.standard_normal(n)
    X=np.fft.rfft(x); f=np.fft.rfftfreq(n,1/sr)
    g=np.where(f<80,0.05,1.0)*np.where(f<500,1.0,(500/np.maximum(f,1))**0.9)
    x=np.fft.irfft(X*g,n)
    env=np.zeros(n); i=0
    while i<n:
        on=int(sr*(0.14+rng.random()*0.12)); off=int(sr*(0.35 if rng.random()<0.12 else 0.05+rng.random()*0.05))
        seg=min(on,n-i); env[i:i+seg]=np.sin(np.pi*np.arange(seg)/on)**0.5; i+=on+off
    x=x*env; x=x/np.sqrt(np.mean(x[env>0]**2))*level
    return x
def noise(sec, lvl=0.0004): return rng.standard_normal(int(sec*sr))*lvl
kind=sys.argv[1]
if kind=='good':
    sig=np.concatenate([noise(3.9), speech(9)+noise(9)])
elif kind=='bt':
    s=np.concatenate([noise(3.9,0.002), speech(9)+noise(9,0.002)])
    S=np.fft.rfft(s); f=np.fft.rfftfreq(len(s),1/sr); S[f>3600]*=1e-5; sig=np.fft.irfft(S,len(s))
sig=np.clip(sig,-1,1)
w.write(sys.argv[2], sr, (sig*32767).astype(np.int16))
