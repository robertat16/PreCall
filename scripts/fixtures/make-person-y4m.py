import numpy as np
from PIL import Image, ImageDraw, ImageFilter
W,H=640,480
def frame(t):
    im=Image.new('RGB',(W,H))
    d=ImageDraw.Draw(im)
    # soft wall gradient
    for y in range(H):
        k=y/H
        d.line([(0,y),(W,y)],fill=(int(58+30*(1-k)),int(64+28*(1-k)),int(78+26*(1-k))))
    # window light glow on the side (front lighting) + shelf
    glow=Image.new('L',(W,H),0); g=ImageDraw.Draw(glow); g.ellipse((-200,-120,360,420),fill=120); glow=glow.filter(ImageFilter.GaussianBlur(90))
    im=Image.composite(Image.new('RGB',(W,H),(214,196,170)),im,glow)
    d=ImageDraw.Draw(im)
    d.rectangle((420,120,600,128),fill=(92,74,60)); d.rectangle((440,80,470,120),fill=(70,120,110)); d.rectangle((480,92,520,120),fill=(150,110,80)); d.ellipse((540,86,580,120),fill=(90,140,90))
    # person (flat illustration), slight sway
    dx=int(6*np.sin(t*0.25)); cx=W//2+dx
    d.rounded_rectangle((cx-170,330,cx+170,560),radius=120,fill=(40,70,110))  # shoulders/shirt
    d.polygon([(cx-38,330),(cx+38,330),(cx,372)],fill=(225,190,160))  # neck v
    d.rectangle((cx-28,280,cx+28,335),fill=(214,170,140))  # neck
    d.ellipse((cx-78,140,cx+78,316),fill=(226,184,152))  # face
    d.chord((cx-84,118,cx+84,250),180,360,fill=(60,42,34))  # hair
    d.ellipse((cx-84,150,cx-60,230),fill=(60,42,34)); d.ellipse((cx+60,150,cx+84,230),fill=(60,42,34))
    # headset
    d.arc((cx-96,110,cx+96,300),200,340,fill=(25,28,34),width=12)
    d.rounded_rectangle((cx-104,208,cx-74,262),radius=10,fill=(25,28,34)); d.rounded_rectangle((cx+74,208,cx+104,262),radius=10,fill=(25,28,34))
    d.line([(cx-90,258),(cx-50,292),(cx-22,296)],fill=(25,28,34),width=6)
    # eyes/smile
    d.ellipse((cx-36,214,cx-24,226),fill=(50,40,36)); d.ellipse((cx+24,214,cx+36,226),fill=(50,40,36))
    d.arc((cx-30,240,cx+30,282),20,160,fill=(150,80,70),width=4)
    im=im.filter(ImageFilter.GaussianBlur(0.6))
    return im
with open('tests/fixtures/person.y4m','wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F30:1 Ip A1:1 C420jpeg\n'.encode())
    for t in range(60):
        ycc=np.asarray(frame(t).convert('YCbCr'))
        Y=ycc[:,:,0]; U=ycc[::2,::2,1]; V=ycc[::2,::2,2]
        f.write(b'FRAME\n'); f.write(Y.tobytes()); f.write(U.tobytes()); f.write(V.tobytes())
frame(0).save('/tmp/person.png')
